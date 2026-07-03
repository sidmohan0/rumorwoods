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
import {
  applySession,
  captureSession,
  deleteSession,
  listSessions,
  loadSession,
  saveSession,
  SessionRecord,
} from "./sim/session";
import { checkServer } from "./llm/server-check";
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
const btnSave = document.getElementById("btn-save") as HTMLButtonElement;
const btnSettings = document.getElementById("btn-settings") as HTMLButtonElement;
const btnLoad = document.getElementById("btn-load") as HTMLButtonElement;
const btnCheck = document.getElementById("btn-check") as HTMLButtonElement;
const modelSelect = document.getElementById("webllm-model") as HTMLSelectElement;
const localUrl = document.getElementById("local-url") as HTMLInputElement;
const localModel = document.getElementById("local-model") as HTMLInputElement;
const localModelSelect = document.getElementById(
  "local-model-select",
) as HTMLSelectElement;
const serverStatusEl = document.getElementById("server-status")!;
const sessionListEl = document.getElementById("session-list")!;

let modelLoaded = false;
let seeded = false;
let pendingSession: SessionRecord | null = null;

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

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__rw = {
    engine,
    renderer,
    world,
    llm,
  };
}

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

/** Reflect engine state in the Start/Pause/Save buttons. */
function syncControls(): void {
  const running = engine.state === "running";
  btnStart.disabled = running || !modelLoaded;
  btnStart.textContent = running ? "Running" : "Start";
  btnPause.disabled = !running;
  btnSave.disabled = !modelLoaded;
}

// --- Local server check: /v1/models connectivity + model picker. ---

async function runServerCheck(): Promise<void> {
  serverStatusEl.textContent = "Checking…";
  serverStatusEl.className = "";
  localModelSelect.hidden = true;
  const result = await checkServer(localUrl.value);
  if (!result.ok) {
    serverStatusEl.textContent = `Not connected: ${result.error}`;
    serverStatusEl.className = "err";
    return;
  }
  serverStatusEl.textContent = `Connected — ${result.models.length} model${
    result.models.length === 1 ? "" : "s"
  } available`;
  serverStatusEl.className = "ok";
  localModelSelect.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "(server default model)";
  localModelSelect.appendChild(defaultOption);
  for (const id of result.models) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = id;
    if (id === localModel.value.trim()) option.selected = true;
    localModelSelect.appendChild(option);
  }
  localModelSelect.hidden = false;
  const localRadio = document.querySelector(
    'input[name="backend"][value="local"]',
  ) as HTMLInputElement;
  localRadio.checked = true;
}

btnCheck.addEventListener("click", () => void runServerCheck());
localUrl.addEventListener("change", () => void runServerCheck());
localModelSelect.addEventListener("change", () => {
  localModel.value = localModelSelect.value;
});
for (const preset of document.querySelectorAll<HTMLButtonElement>(
  "#server-presets .preset",
)) {
  preset.addEventListener("click", () => {
    localUrl.value = preset.dataset.url!;
    void runServerCheck();
  });
}

// --- Saved sessions: list, save, load, delete (IndexedDB). ---

async function renderSessions(): Promise<void> {
  const sessions = await listSessions().catch(() => []);
  sessionListEl.innerHTML = "";
  if (sessions.length === 0) {
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent =
      "No saved sessions yet. Use Save in the top bar while a sim is running.";
    sessionListEl.appendChild(hint);
    return;
  }
  for (const session of sessions) {
    const row = document.createElement("div");
    row.className = "session-row";
    const meta = document.createElement("div");
    meta.className = "session-meta";
    const name = document.createElement("div");
    name.className = "session-name";
    name.textContent = session.name;
    const sub = document.createElement("div");
    sub.className = "session-sub";
    sub.textContent = `sim ${formatTime(session.simTime)} · saved ${new Date(
      session.savedAt,
    ).toLocaleString()}`;
    meta.append(name, sub);
    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load";
    loadBtn.addEventListener("click", () => void handleSessionLoad(session.name));
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () =>
      void deleteSession(session.name).then(renderSessions),
    );
    row.append(meta, loadBtn, deleteBtn);
    sessionListEl.appendChild(row);
  }
}

async function handleSessionLoad(name: string): Promise<void> {
  const record = await loadSession(name);
  if (!record) return;
  if (modelLoaded) {
    engine.pause();
    applySession(record, engine, world);
    seeded = true;
    clockEl.textContent = formatTime(engine.time);
    inspector.render();
    overlayEl.style.display = "none";
    engine.start();
    syncControls();
    logLine(`[session] resumed "${name}" at ${formatTime(engine.time)}`);
  } else {
    pendingSession = record;
    btnLoad.textContent = `Load model & resume "${name}"`;
    progressEl.textContent = `Session "${name}" will resume once a model is loaded.`;
  }
}

btnSave.addEventListener("click", () => {
  void (async () => {
    const wasRunning = engine.state === "running";
    engine.pause();
    syncControls();
    const suggestion = `Ville — sim ${formatTime(engine.time)}`;
    const name = prompt("Save session as:", suggestion);
    if (name) {
      try {
        await saveSession(captureSession(name.trim(), engine, world));
        logLine(`[session] saved "${name.trim()}"`);
        await renderSessions();
      } catch (err) {
        logLine(`[session] save failed: ${String(err)}`);
      }
    }
    if (wasRunning) engine.start();
    syncControls();
  })();
});

void renderSessions();

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
      modelLoaded = true;

      let seedStats: SeedStats | undefined;
      if (pendingSession) {
        progressEl.textContent = `Resuming "${pendingSession.name}"…`;
        applySession(pendingSession, engine, world);
        seeded = true;
        logLine(
          `[session] resumed "${pendingSession.name}" at ${formatTime(engine.time)}`,
        );
        pendingSession = null;
        btnLoad.textContent = "Load model & begin";
        clockEl.textContent = formatTime(engine.time);
        inspector.render();
      } else if (!seeded) {
        progressEl.textContent = "Seeding the agents' memory streams…";
        const seedStart = Date.now();
        const seedBefore = llm.usage ? { ...llm.usage } : null;
        await engine.seed();
        seeded = true;
        seedStats =
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
      }

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
const btnCloseSettings = document.getElementById(
  "btn-close-settings",
) as HTMLButtonElement;
let resumeAfterSettings = false;

function closeSettings(): void {
  overlayEl.style.display = "none";
  if (resumeAfterSettings && modelLoaded) engine.start();
  resumeAfterSettings = false;
  syncControls();
}

btnCloseSettings.addEventListener("click", closeSettings);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && overlayEl.style.display !== "none") {
    closeSettings();
  }
});

btnSettings.addEventListener("click", () => {
  resumeAfterSettings = engine.state === "running";
  engine.pause();
  syncControls();
  overlayEl.style.display = "flex";
  btnLoad.disabled = false;
});
