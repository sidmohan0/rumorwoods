# Deployment

## Topology

One GitHub Pages site serves two variants of the app:

| URL | Built from | VARIANT | Role |
| --- | --- | --- | --- |
| `https://sidmohan0.github.io/rumorwoods/` | `main` | `v1` | Stable lineage of the [v1.0.0 checkpoint](https://github.com/sidmohan0/rumorwoods/releases/tag/v1.0.0); only small sanctioned patches land here |
| `https://sidmohan0.github.io/rumorwoods/v2/` | `v2` | `v2` | Experimental spin-off (scenarios, Tiled map pipeline, whatever comes next) |

A header link in each build switches between them, driven by the
build-time `VARIANT` env var (`vite.config.ts` injects it as
`__VARIANT__`).

## How a deploy works

`.github/workflows/deploy-pages.yml` runs on every push to `main` or
`v2` (the same workflow file lives on both branches — keep them in
sync when editing it):

1. Check out **both** branches (`stable/` and `experimental/`).
2. `npm ci && VARIANT=v1 npm run build` in `stable/`, and
   `VARIANT=v2 npm run build` in `experimental/`.
3. Assemble one site: stable's `dist/` at the root, experimental's at
   `/v2/`. Vite's relative base (`base: "./"`) makes builds work at
   any mount path.
4. `peaceiris/actions-gh-pages` force-pushes the assembled site to the
   `gh-pages` branch, which GitHub Pages serves (legacy
   "deploy from a branch" mode).
5. A guard step polls the resulting Pages build and **retries on
   backend flakes** (see below). The workflow only goes green once
   content has actually landed.

The site is fully static — model weights come from the MLC/HuggingFace
CDNs at runtime, so the deploy artifact stays ~30 MB.

## Hard-won operational knowledge

These cost real debugging time; read before changing the pipeline.

- **The Pages deployment backend fails intermittently** with an
  empty-description `deployment_failed` (~50% of deploys on bad days),
  on content and config identical to deploys that succeed. Every
  observed failure yielded to a retry within 1–3 attempts — hence the
  guard step. Manual recovery:
  `gh api -X POST repos/sidmohan0/rumorwoods/pages/builds`.
- **The `github-pages` environment has a deployment branch policy.**
  It must allow every branch that deployments run from — for
  branch-mode Pages that means `gh-pages` itself, not just `main`.
  A missing entry surfaces as the same opaque `deployment_failed`,
  which is what made it hard to find.
- **Don't double-trigger builds.** Two builds racing for the same
  commit (e.g. a push-triggered one plus an API-requested one) end
  with one cancelled and the survivor often failing, wedging the
  builds tracker in `building`. One trigger, then poll.
- **The `actions/deploy-pages` artifact path never worked for this
  site** (same backend error, no retry lever that helped). Branch mode
  + explicit build polling is the reliable configuration.
- **IndexedDB is shared per-origin, not per-path.** The v1 build opens
  the `rumorwoods` database; v2 must use a different name
  (`rumorwoods-v2`, see `src/sim/db.ts`) or its schema upgrades break
  v1's session storage for anyone who visits both. Any future variant
  needs its own database name too.

## Adding a variant

- **Content variant** (new town/cast on the same engine): add a map +
  roster to `src/data/scenarios.ts` on `v2` — it appears in the
  scenario picker. See `maps/README.md` for the Tiled authoring
  pipeline.
- **Code variant** (divergent engine): create a branch, add it to the
  workflow's checkout/build/assemble steps with a new `VARIANT` value
  and subdirectory, give it a distinct IndexedDB name, and extend the
  header switcher in `src/main.ts`.

## Checkpoints

Frozen references are git tags + GitHub Releases (`v1.0.0` is the
feature-complete reimplementation). The root deployment tracks `main`,
which stays close to the newest checkpoint; when `v2` matures, the
intended move is: tag it, promote it to the root, and retire the old
stable to a `/v1/` subpath.
