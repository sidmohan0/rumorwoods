/**
 * Headless benchmark: runs the full 25-agent simulation for one game
 * day (6:00 am → 6:00 am) against a local OpenAI-compatible server.
 * Same measurement core as the in-browser bench mode (?bench=1) —
 * see src/sim/benchmark.ts for the report format and the GPT-3.5
 * baseline it compares against.
 *
 * Usage: npx tsx tools/benchmark.mts [baseUrl]
 *   baseUrl defaults to http://localhost:8080
 *
 * Progress is appended to tools/benchmark-results/progress.jsonl as
 * it runs; the final report is written alongside it.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { World } from "../src/world/world";
import { Engine } from "../src/sim/engine";
import { LLMQueue, OpenAICompatBackend } from "../src/llm/llm";
import { SMALLVILLE_MAP } from "../src/data/map";
import { PERSONAS } from "../src/data/personas";
import { embed } from "../src/llm/embeddings";
import { runGameDay, SeedStats } from "../src/sim/benchmark";

const BASE_URL = process.argv[2] ?? "http://localhost:8080";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "benchmark-results");
mkdirSync(outDir, { recursive: true });
const progressPath = join(outDir, "progress.jsonl");
const reportPath = join(outDir, `gameday-${Date.now()}.json`);

async function main(): Promise<void> {
  const backend = new OpenAICompatBackend(BASE_URL, "");
  await backend.chat([{ role: "user", content: "Say OK." }], { maxTokens: 5 });
  console.log(`connected to ${BASE_URL}`);

  console.log("warming up embedding model…");
  await embed("initialize the embedding model");

  const world = new World(SMALLVILLE_MAP);
  const llm = new LLMQueue(backend, 1);
  const engine = new Engine(world, llm, PERSONAS);

  let errorsThisTick = 0;
  engine.onLog = (entry) => {
    if (entry.startsWith("[error]")) errorsThisTick++;
  };

  const t0 = Date.now();
  console.log("seeding 25 agents' memory streams…");
  const before = { ...backend.usage };
  await engine.seed();
  const seed: SeedStats = {
    wallMs: Date.now() - t0,
    calls: backend.usage.calls - before.calls,
    promptTokens: backend.usage.promptTokens - before.promptTokens,
    completionTokens: backend.usage.completionTokens - before.completionTokens,
    totalTokens:
      backend.usage.promptTokens +
      backend.usage.completionTokens -
      before.promptTokens -
      before.completionTokens,
  };
  appendFileSync(progressPath, JSON.stringify({ phase: "seeded", ...seed }) + "\n");
  console.log(
    `seeded in ${(seed.wallMs / 60000).toFixed(1)} min — ` +
      `${seed.calls} calls, ${seed.totalTokens} tokens`,
  );

  const report = await runGameDay(
    engine,
    llm,
    "Qwen2.5-7B-Instruct Q4_K_M via llama.cpp",
    {
      seed,
      errorsInLastTick: () => {
        const n = errorsThisTick;
        errorsThisTick = 0;
        return n;
      },
      onHour: (h) => {
        appendFileSync(
          progressPath,
          JSON.stringify({ phase: "hour", ...h }) + "\n",
        );
        console.log(
          `sim ${h.simTime} | wall ${(h.wallMs / 60000).toFixed(1)} min | ` +
            `${h.calls} calls | ${(h.totalTokens / 1e6).toFixed(2)}M tokens`,
        );
      },
    },
  );

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  appendFileSync(
    progressPath,
    JSON.stringify({ phase: "done", reportPath }) + "\n",
  );
  console.log("\nreport written to", reportPath);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  appendFileSync(
    progressPath,
    JSON.stringify({ phase: "failed", error: String(err) }) + "\n",
  );
  console.error(err);
  process.exit(1);
});
