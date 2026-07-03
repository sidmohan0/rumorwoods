import { Engine } from "./engine";
import { LLMQueue, UsageStats } from "../llm/llm";

/**
 * One-game-day benchmark shared by the Node harness
 * (tools/benchmark.mts) and the in-browser bench mode (?bench=1).
 * Drives the engine tick-by-tick from the current sim time for 24
 * game hours, sampling LLM calls / token usage / latency, and
 * produces a report comparable to the GPT-3.5-Turbo numbers measured
 * for the original Generative Agents architecture (Affordable
 * Generative Agents, arXiv:2402.02053: 25.41M tokens per two game
 * days for the 25-agent town).
 */

export interface HourSample {
  simTime: string;
  simMinutesDone: number;
  wallMs: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface SeedStats extends UsageStats {
  wallMs: number;
  totalTokens: number;
}

export interface GameDayReport {
  model: string;
  agents: number;
  gameDayMinutes: number;
  seed: SeedStats | null;
  gameDay: {
    wallMs: number;
    wallHours: number;
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** >1 means faster than real time. */
    simToRealRatio: number;
  };
  latencyMs: {
    count: number;
    mean: number;
    p50: number;
    p95: number;
    max: number;
  };
  baseline: {
    description: string;
    tokensPerGameDay: number;
  };
  hours: HourSample[];
}

export const GAME_DAY_MINUTES = 24 * 60;

export const GPT35_BASELINE = {
  description:
    "Original GA architecture, GPT-3.5-Turbo, 25 agents, per game day " +
    "(Affordable Generative Agents, Table 1: 25.41M tokens / two game days)",
  tokensPerGameDay: 12_705_000,
};

export function formatSimTime(simMinutes: number): string {
  const m = simMinutes % 1440;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

export interface RunGameDayOptions {
  /** Usage measured by the caller around engine.seed(). */
  seed?: SeedStats;
  onHour?: (sample: HourSample) => void;
  /** Yield to the event loop between ticks so the UI can paint. */
  yieldBetweenTicks?: boolean;
  /** Abort when every agent errors for this many consecutive ticks. */
  maxBadTicks?: number;
  /** Counts agent errors per tick; wire to engine.onLog upstream. */
  errorsInLastTick?: () => number;
}

export async function runGameDay(
  engine: Engine,
  llm: LLMQueue,
  modelName: string,
  opts: RunGameDayOptions = {},
): Promise<GameDayReport> {
  const usage = (): UsageStats =>
    llm.usage ?? { calls: llm.callCount, promptTokens: 0, completionTokens: 0 };

  const startUsage = usage();
  const startLatencyCount = llm.latenciesMs.length;
  const dayStart = engine.time;
  const dayEnd = dayStart + GAME_DAY_MINUTES;
  const t0 = Date.now();
  const hours: HourSample[] = [];
  let lastHourMark = dayStart;
  let consecutiveBadTicks = 0;
  const maxBadTicks = opts.maxBadTicks ?? 3;

  while (engine.time < dayEnd) {
    await engine.tick();
    engine.onTick?.();

    const errors = opts.errorsInLastTick?.() ?? 0;
    if (errors >= engine.agents.length) {
      consecutiveBadTicks++;
      if (consecutiveBadTicks >= maxBadTicks) {
        throw new Error(
          `every agent errored for ${maxBadTicks} consecutive ticks — ` +
            "is the LLM backend down?",
        );
      }
    } else {
      consecutiveBadTicks = 0;
    }

    if (engine.time - lastHourMark >= 60) {
      lastHourMark = engine.time;
      const u = usage();
      const sample: HourSample = {
        simTime: formatSimTime(engine.time),
        simMinutesDone: engine.time - dayStart,
        wallMs: Date.now() - t0,
        calls: u.calls - startUsage.calls,
        promptTokens: u.promptTokens - startUsage.promptTokens,
        completionTokens: u.completionTokens - startUsage.completionTokens,
        totalTokens:
          u.promptTokens +
          u.completionTokens -
          startUsage.promptTokens -
          startUsage.completionTokens,
      };
      hours.push(sample);
      opts.onHour?.(sample);
    }

    if (opts.yieldBetweenTicks) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const wallMs = Date.now() - t0;
  const end = usage();
  const promptTokens = end.promptTokens - startUsage.promptTokens;
  const completionTokens = end.completionTokens - startUsage.completionTokens;
  const latencies = llm.latenciesMs.slice(startLatencyCount).sort((a, b) => a - b);
  const mean =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

  return {
    model: modelName,
    agents: engine.agents.length,
    gameDayMinutes: GAME_DAY_MINUTES,
    seed: opts.seed ?? null,
    gameDay: {
      wallMs,
      wallHours: +(wallMs / 3_600_000).toFixed(2),
      calls: end.calls - startUsage.calls,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      simToRealRatio: +(GAME_DAY_MINUTES / (wallMs / 60_000)).toFixed(2),
    },
    latencyMs: {
      count: latencies.length,
      mean: +mean.toFixed(0),
      p50: +percentile(latencies, 50).toFixed(0),
      p95: +percentile(latencies, 95).toFixed(0),
      max: +percentile(latencies, 100).toFixed(0),
    },
    baseline: GPT35_BASELINE,
    hours,
  };
}
