# v2 roadmap — from believable to measurable

The original Generative Agents paper measured *believability*: do the
agents seem human to observers? Everything the field has done since —
including the paper authors' own follow-up work on self-report-grounded
agents and behavior prediction — has been about *validity*: do
simulations measure and predict correctly? v2 turns Rumorwoods from a
faithful demo of the architecture into an open instrument for
evaluating it.

Four pillars, in dependency order:

## 1. Deterministic, forkable runs — ⚙️ partial

Run a day, fork the session, change one variable, and compare the
branches ("what if Isabella never planned the party?").

- [x] **Session forking** — any saved session can be copied as a new
  branch with lineage metadata (`forkedFrom`), from the Saved sessions
  list. Combined with the character editor, one edit to the fork sets
  up a counterfactual.
- [ ] **Sampling seeds** — pass a seed through to backends that honor
  it (llama.cpp `seed`, WebLLM gen config) and record it in sessions.
  LLM inference is not bit-reproducible across backends/hardware, so
  the goal is "statistically comparable", not "identical replay".
- [ ] **Run manifests** — record model, backend, scenario, roster hash,
  and seed alongside each session so a result can be attributed.

## 2. Behavioral metrics — ✅ shipped (first cut)

The paper's §6 end-to-end measurements, automated and recomputed live
from agent state (Metrics button in the top bar):

- [x] **Information diffusion** — per tracked topic (Valentine's party
  and the mayoral race on the Ville; the harvest feast on Honeywood),
  who holds a memory mentioning it, when they first did, and whether it
  arrived by conversation; cumulative diffusion curve; custom keyword
  topics.
- [x] **Social network** — distinct conversations, unique pairs,
  network density (pairs / C(n,2)), per-agent conversation and partner
  counts, cumulative conversation curve.
- [x] **Export** — one-click JSON report for offline analysis.
- [ ] **Coordination metric** — attendance-style measures (who is at a
  tracked location during a time window), the paper's third result.
- [ ] **Cross-run comparison** — load two exported reports (e.g. a
  session and its fork) and diff their curves side by side.

## 3. Ablation switches — ⏳ next

Toggle components of the cognitive architecture and measure what each
buys, using pillar-2 metrics as the yardstick:

- [ ] Reflection on/off
- [ ] Retrieval weight overrides (recency / importance / relevance)
- [ ] Memory decay variants
- [ ] Model swaps as an experimental variable (already possible
  manually; surface it in run manifests)

Target output: "reflection off → party attendance drops from N to M"
style findings, reproducible by anyone in a browser.

## 4. Interview-to-villager — 💤 later

A consent-native riff on self-report-grounded agents: the app
interviews *you* in the browser, builds a persona from the transcript,
and adds your fictional twin to the village. Local-first — the
transcript never leaves the machine.

## Non-goals

- Simulating identifiable real people. Rumorwoods stays on the
  fictional-characters side of that line by design.
- Bit-identical replay of LLM output (see pillar 1).
