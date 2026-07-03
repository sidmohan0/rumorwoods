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
import { Renderer } from "./ui/renderer";
import { Inspector } from "./ui/inspector";
import { formatTime } from "./core/prompts";

const canvas = document.getElementById("map") as HTMLCanvasElement;
const clockEl = document.getElementById("clock")!;
const llmStatusEl = document.getElementById("llm-status")!;
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

engine.onLog = (entry) => {
  const div = document.createElement("div");
  div.textContent = `[${formatTime(engine.time)}] ${entry}`;
  logEl.prepend(div);
  while (logEl.children.length > 300) logEl.lastChild!.remove();
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
      await engine.seed();

      overlayEl.style.display = "none";
      btnStart.disabled = false;
      btnPause.disabled = false;
      engine.start();
    } catch (err) {
      progressEl.textContent = String(err);
      btnLoad.disabled = false;
    }
  })();
});

btnStart.addEventListener("click", () => engine.start());
btnPause.addEventListener("click", () => engine.pause());
btnSettings.addEventListener("click", () => {
  engine.pause();
  overlayEl.style.display = "flex";
  btnLoad.disabled = false;
});
