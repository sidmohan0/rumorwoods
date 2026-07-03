import "./styles.css";
import {
  DEFAULT_WEBLLM_MODEL,
  LLMQueue,
  OpenAICompatBackend,
  WebLLMBackend,
  WEBLLM_QWEN_MODELS,
} from "./llm/llm";
import { embed } from "./llm/embeddings";
import { World } from "./world/world";
import { SMALLVILLE_MAP } from "./data/map";
import { PERSONAS } from "./data/personas";
import { Engine } from "./sim/engine";
import { runGameDay, SeedStats } from "./sim/benchmark";
import { Renderer } from "./ui/renderer";
import { Inspector } from "./ui/inspector";
import { formatTime } from "./core/prompts";

/** ?bench=1 runs one game day and produces a downloadable report. */
const BENCH = new URLSearchParams(location.search).has("bench");

const canvas = document.getElementById("map") as HTMLCanvasElement;
const clockEl = document.getElementById("clock")!;
const tickStatusEl = document.getElementById("tick-status")!;
const commitLinkEl = document.getElementById("commit-link") as HTMLAnchorElement;
const llmStatusEl = document.getElementById("llm-status")!;

commitLinkEl.textContent = __COMMIT_HASH__;
commitLinkEl.href = `https://github.com/sidmohan0/rumorwoods/commit/${__COMMIT_HASH__}`;
const logEl = document.getElementById("log")!;
const overlayEl = document.getElementById("loading-overlay")!;
const progressEl = document.getElementById("load-progress")!;
const btnStart = document.getElementById("btn-start") as HTMLButtonElement;
const btnPause = document.getElementById("btn-pause") as HTMLButtonElement;
const btnSettings = document.getElementById("btn-settings") as HTMLButtonElement;
const btnLoad = document.getElementById("btn-load") as HTMLButtonElement;
const modelSelect = document.getElementById("webllm-model") as HTMLSelectElement;
const localUrl = document.getElementById("local-url") as HTMLInputElement;
const localModel = document.getElementById("local-model") as HTMLInputElement;

for (const modelId of WEBLLM_QWEN_MODELS) {
  const option = document.createElement("option");
  option.value = modelId;
  option.textContent = modelId;
  if (modelId === DEFAULT_WEBLLM_MODEL) option.selected = true;
  modelSelect.appendChild(option);
}

const world = new World(SMALLVILLE_MAP);
const llm = new LLMQueue(placeholderBackend(), 1);
const engine = new Engine(world, llm, PERSONAS);
const renderer = new Renderer(canvas, world, engine.agents);
const inspector = new Inspector(document.getElementById("inspector")!);

renderer.onSelect = (agent) => inspector.select(agent);
inspector.getTime = () => engine.time;

llm.onStats = (active, queued, total) => {
  llmStatusEl.textContent = `${llm.backendName} — ${active + queued} pending, ${total} calls`;
};

engine.onTick = () => {
  clockEl.textContent = formatTime(engine.time);
  inspector.render();
};

engine.onTickProgress = (done, total) => {
  tickStatusEl.textContent =
    done < total ? `thinking ${done}/${total} agents` : "";
};

/** Reflect engine state in the Start/Pause buttons. */
function syncControls(): void {
  const running = engine.state === "running";
  btnStart.disabled = running;
  btnStart.textContent = running ? "Running" : "Start";
  btnPause.disabled = !running;
}

function logLine(entry: string): void {
  const div = document.createElement("div");
  div.textContent = `[${formatTime(engine.time)}] ${entry}`;
  logEl.prepend(div);
  while (logEl.children.length > 300) logEl.lastChild!.remove();
}

let benchErrorsThisTick = 0;
engine.onLog = (entry) => {
  if (entry.startsWith("[error]")) benchErrorsThisTick++;
  logLine(entry);
};

function placeholderBackend() {
  return {
    name: "no model loaded",
    chat: async () => {
      throw new Error("Load a model first.");
    },
  };
}

function renderLoop(): void {
  renderer.render();
  requestAnimationFrame(renderLoop);
}
renderLoop();
clockEl.textContent = formatTime(engine.time);

btnLoad.addEventListener("click", () => {
  void (async () => {
    btnLoad.disabled = true;
    const backendKind = (
      document.querySelector('input[name="backend"]:checked') as HTMLInputElement
    ).value;
    try {
      progressEl.textContent = "Loading embedding model (all-MiniLM-L6-v2)…";
      await embed("initialize the embedding model");

      if (backendKind === "webllm") {
        const backend = new WebLLMBackend(modelSelect.value, (report) => {
          progressEl.textContent = report.text;
        });
        await backend.init();
        llm.setBackend(backend);
      } else {
        const backend = new OpenAICompatBackend(
          localUrl.value.trim(),
          localModel.value.trim(),
        );
        progressEl.textContent = "Checking connection to local server…";
        await backend.chat([{ role: "user", content: "Say OK." }], {
          maxTokens: 5,
        });
        llm.setBackend(backend);
      }
      llmStatusEl.textContent = llm.backendName;

      progressEl.textContent = "Seeding the agents' memory streams…";
      const seedStart = Date.now();
      const seedBefore = llm.usage ? { ...llm.usage } : null;
      await engine.seed();
      const seedStats: SeedStats | undefined =
        seedBefore && llm.usage
          ? {
              wallMs: Date.now() - seedStart,
              calls: llm.usage.calls - seedBefore.calls,
              promptTokens: llm.usage.promptTokens - seedBefore.promptTokens,
              completionTokens:
                llm.usage.completionTokens - seedBefore.completionTokens,
              totalTokens:
                llm.usage.promptTokens +
                llm.usage.completionTokens -
                seedBefore.promptTokens -
                seedBefore.completionTokens,
            }
          : undefined;

      overlayEl.style.display = "none";
      if (BENCH) {
        void runBenchmark(seedStats);
      } else {
        engine.start();
        syncControls();
      }
    } catch (err) {
      progressEl.textContent = String(err);
      btnLoad.disabled = false;
    }
  })();
});

async function runBenchmark(seed?: SeedStats): Promise<void> {
  logLine("[bench] running one game day (6:00 am → 6:00 am)…");
  btnStart.disabled = true;
  btnPause.disabled = true;
  try {
    const report = await runGameDay(engine, llm, llm.backendName, {
      seed,
      yieldBetweenTicks: true,
      errorsInLastTick: () => {
        const n = benchErrorsThisTick;
        benchErrorsThisTick = 0;
        return n;
      },
      onHour: (h) => {
        logLine(
          `[bench] sim ${h.simTime} | wall ${(h.wallMs / 60000).toFixed(1)} min | ` +
            `${h.calls} calls | ${(h.totalTokens / 1e6).toFixed(2)}M tokens`,
        );
      },
    });
    logLine(
      `[bench] DONE — ${report.gameDay.calls} calls, ` +
        `${(report.gameDay.totalTokens / 1e6).toFixed(2)}M tokens, ` +
        `${report.gameDay.wallHours}h wall (${report.gameDay.simToRealRatio}x real time), ` +
        `${(
          (report.gameDay.totalTokens / report.baseline.tokensPerGameDay) *
          100
        ).toFixed(1)}% of the GPT-3.5 baseline's tokens`,
    );
    console.log("[bench] report", report);
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rumorwoods-bench-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    logLine(`[bench] FAILED: ${String(err)}`);
  }
}

btnStart.addEventListener("click", () => {
  engine.start();
  syncControls();
});
btnPause.addEventListener("click", () => {
  engine.pause();
  syncControls();
});
btnSettings.addEventListener("click", () => {
  engine.pause();
  syncControls();
  overlayEl.style.display = "flex";
  btnLoad.disabled = false;
});
