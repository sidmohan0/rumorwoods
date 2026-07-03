# Rumorwoods

**[Live demo](https://sidmohan0.github.io/rumorwoods/)** · **[v1.0.0 checkpoint](https://github.com/sidmohan0/rumorwoods/releases/tag/v1.0.0)** — the stable, feature-complete reimplementation. Development beyond this point may diverge substantially.

A faithful, **fully in-browser** reimplementation of
[*Generative Agents: Interactive Simulacra of Human Behavior*](https://arxiv.org/abs/2304.03442)
(Park et al., UIST '23).

Twenty-five agents live out their days in Smallville — perceiving, remembering,
retrieving, reflecting, planning, and conversing — with **all cognition driven by a
real LLM**.

- **LLM**: Qwen2.5-7B-Instruct running on your GPU via [WebLLM](https://github.com/mlc-ai/web-llm)
  (WebGPU). Smaller Qwen variants selectable for lighter GPUs. Optionally, point the app
  at a local llama.cpp / Ollama OpenAI-compatible endpoint instead.
- **Embeddings**: all-MiniLM-L6-v2 in-browser via transformers.js, for memory-retrieval
  relevance scoring.
- **UI**: top-down tile map of Smallville with emoji status bubbles; click any agent to
  inspect their memory stream, plans, and conversations — and interview them, as in the
  paper.
- **Sessions**: save and resume simulations entirely in the browser
  (IndexedDB) — full agent memory streams with embeddings, plans, positions,
  conversations, and object states. Any backend can resume any session.
- **Character editor**: edit any resident's traits, life story, "currently",
  lifestyle, home/workplace (picked from real map locations), or add and
  remove residents — live, from the settings screen. Custom rosters persist
  in the browser and are embedded in session saves; field edits take effect
  on the agent's next LLM call.
- **Map**: the actual "the Ville" layout from the official repository — all 19 sectors,
  63 arenas, per-tile collision, and object placement are converted from its Apache-2.0
  tile-matrix data by `tools/build-ville-map.mjs` (source CSVs in `tools/ville-data/`).
  The original's commercial tile art (PixyMoon/LimeZu) is **not** included; visuals are
  rendered from Kenney's CC0 [Roguelike/RPG pack](https://kenney.nl/assets/roguelike-rpg-pack)
  (`public/tiles/`).

## How it works

![How the simulation works: load a model, seed 25 minds, then a tick loop — every agent thinks through one shared LLM queue (perceive, react, plan, reflect), conversations advance one line per adjacent pair, everyone moves along A* paths, the clock jumps 10 minutes, and a memory stream is written and recalled throughout.](docs/simulation-loop.svg)

1. **Load a model** — nothing intelligent exists yet; you pick the brain
   (WebLLM on your GPU, or a local server). A small embedding model loads
   alongside for memory recall.
2. **Seed 25 minds** — each persona's description is split into sentences and
   written into that agent's memory stream. This is the only scripted content
   in the system.
3. **Every agent thinks** — one LLM call at a time through a shared queue:
   perceive nearby events, decide whether to react (this is where
   conversations start), decompose the day plan into the next action when the
   current one ends, and reflect when enough important memories accumulate.
4. **Conversations advance** — one line per adjacent pair per tick, each line
   conditioned on the speaker's retrieved memories. The LLM decides when a
   conversation ends; nothing scripts what is said.
5. **Everyone moves** — pure mechanics: up to 20 tiles along an A* path, then
   the clock jumps 10 minutes and the loop repeats. Sleeping agents skip
   everything, so nights are nearly free.
6. **You watch and steer** — the map, inspector, town log, and interviews are
   read-only views over agent state; sessions snapshot it all to the browser;
   the character editor rewrites the inputs to steps 2–3.

Every prompt is built from memories recalled by recency × importance ×
relevance, and every outcome is written back — agents only know what they
have perceived or been told, which is why information physically travels
through conversations.

## Running

```bash
npm install
npm run dev
```

Open the printed URL in a WebGPU-capable browser (Chrome/Edge 113+). Pick a model and
click **Load model & begin**. The first load downloads the model weights (several GB for
the 7B model); they are cached by the browser afterwards.

To use a local server instead (any OpenAI-compatible `/v1/chat/completions` endpoint):

```bash
# llama.cpp (downloads and caches the model on first run)
llama-server -hf bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M --port 8080
# or Ollama (also expose CORS: OLLAMA_ORIGINS='*' ollama serve)
ollama run qwen2.5:7b-instruct
```

then select "Local llama.cpp / Ollama server" on the start screen.

## Deployment

The app is fully static. Pushes to `main` deploy to GitHub Pages via
`.github/workflows/deploy-pages.yml`; model weights are fetched from the
MLC/HuggingFace CDNs by the visitor's browser, so the site itself stays tiny.
The "local server" backend still works from the deployed HTTPS page because
browsers exempt `http://localhost` from mixed-content blocking.

## Benchmarking

Two harnesses share the same measurement core (`src/sim/benchmark.ts`) and
report LLM calls, prompt/completion tokens, latency percentiles, and
sim-to-real-time ratio for one full game day, next to the GPT-3.5-Turbo
baseline measured for the original architecture (25.41M tokens per two game
days — [Affordable Generative Agents](https://arxiv.org/abs/2402.02053)):

```bash
# Headless, against a local OpenAI-compatible server:
npx tsx tools/benchmark.mts http://localhost:8080

# In-browser (WebLLM or local server), with a downloadable JSON report:
#   open the app with ?bench=1 and click "Load model & begin"
```

### Results

One full game day (6:00 am → 6:00 am), 25 agents on the Ville map. The local
run used Qwen2.5-7B-Instruct Q4_K_M via llama.cpp on an M-series MacBook
(48 GB); the GPT-3.5 row is the original Generative Agents architecture as
measured by the AGA authors, at early-2023 API pricing.

| | Tokens / game day | LLM calls | Wall-clock | Cost |
| --- | --- | --- | --- | --- |
| GPT-3.5-Turbo, original architecture (2023) | 12.7M | not published | > 1 real day | ~$25 + API access |
| Rumorwoods, local llama.cpp (2026) | **1.47M** (89% prompt) | 5,790 | **1.16 h** (20.7× real time) | $0 |

Call latency on the local run: p50 254 ms, p95 2.5 s, max 15.9 s (morning
day-plan generations). Sleeping agents make no LLM calls, so sim hours 1–5 am
complete in milliseconds. The token gap vs. the baseline reflects both the
leaner reimplementation (merged reaction prompts, lazy plan decomposition,
terse outputs) and the local model — it is an end-to-end system comparison,
not a model-for-model one.

## Inference efficiency

All 25 agents share one model, one engine, and one serialized call queue —
agents are lightweight "virtual roles" (a memory stream, a plan, a position),
not separate model instances. On top of that, three optimizations target the
cost profile we measured with the benchmark harness (~87% of tokens are prompt
tokens; hundreds of small calls per sim-hour, where per-call overhead
dominates — especially over WebGPU):

- **Packed calls.** Prompts that always ran back-to-back are folded into one
  JSON reply each: an action's emoji + importance score (was 2 calls), the
  importance scores of all percepts in a step (was up to 3), and the
  post-conversation importance + memo + planning thought (was 3). Same
  cognitive outputs, roughly a third fewer requests.
- **Structured outputs.** Packed prompts use JSON-Schema-constrained decoding
  (`response_format` on both llama.cpp and WebLLM), so replies are guaranteed
  parseable — no regex scraping, no wasted tokens on preamble, and small
  models can't ramble. Servers that reject `response_format` (older Ollama)
  are detected on first use and the sim falls back to unconstrained prompts.
- **Worker-hosted WebLLM.** The in-browser engine runs in a dedicated Web
  Worker (`CreateWebWorkerMLCEngine`), keeping map rendering and UI
  interaction smooth during inference.

## Architecture (paper section → module)

| Paper component | Module |
| --- | --- |
| Memory stream & retrieval (recency · importance · relevance) — §4.1 | `src/core/memory.ts` |
| Reflection (focal questions → insights with evidence) — §4.2 | `Agent.reflect` in `src/core/agent.ts` |
| Planning (broad strokes → hourly → 5–15 min) & re-planning — §4.3 | `Agent.ensureDayPlan` / `decomposeBlock` |
| Perceive → retrieve → react loop — §4.3.1 | `Agent.step` / `perceive` / `maybeReact` |
| Dialogue conditioned on memory — §4.3.2 | `Agent.startConversation` / `takeDialogueTurn` |
| Agent summary description — Appendix A | `Agent.summaryDescription` |
| New-day identity revision ("currently" rewrite) | `Agent.reviseIdentity` |
| Sandbox world, areas/objects tree, A* pathfinding — §3 | `src/world/world.ts` |
| The Ville map (sectors/arenas/objects/collision) — §3 | `src/data/ville-map.json`, generated by `tools/build-ville-map.mjs` |
| The 25 Smallville personas & seed memories — §5 | `src/data/personas.ts` |
| Agent interviews — §3 | Inspector "Interview" panel |
| Information diffusion (Valentine's party) — §6 | emerges via dialogue; Isabella's seed memory |

## Gap analysis vs. the official implementation

Compared against [joonspk-research/generative_agents](https://github.com/joonspk-research/generative_agents)
(the paper's released code) for functional parity. Covered: memory stream with
importance scoring at write time; retrieval with min-max-normalized recency (0.995
decay) / importance / relevance and equal weights; reflection triggered at importance
sum ≥ 150 with focal questions, per-question retrieval, and evidence-cited insights;
hierarchical planning with lazy decomposition; perception with vision radius,
attention bandwidth (3), and event dedup vs. latest memory; reaction decision from a
summarized relationship + observation context; dialogue with per-turn retrieval and
end-detection; post-conversation memo and planning thoughts; new-day identity
revision; object state updates from agent actions; emoji "pronunciatio";
interviews; and the exact Ville map — same sectors, arenas, objects, and
per-tile collision as the official environment (visuals re-skinned with CC0
tiles; streets/plazas render as grass since they only existed in the
original's commercial art layer).

Intentional differences: natural-language memory descriptions are used directly for
dedup/keying instead of (subject, predicate, object) triples; reaction asks the LLM
for react/how in one prompt rather than separate decide-to-talk / decide-to-react
prompts; the wait-reaction mode ("should I wait for the bathroom to free up") is
folded into the general reaction path; spatial memory is global (agents know the town
map) rather than incrementally discovered; and there is no server/replay layer since
the sim runs live in the browser.
