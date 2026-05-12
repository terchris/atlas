# PLAN: Install Dagster in atlas — polyglot code-location image

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — Phases 1–3 code-side complete, awaiting first GHCR push on merge

**Goal**: Build Atlas's Dagster code-location artefact — a single polyglot Docker image (Python + Node + dbt + dagster + dagster-pipes + the ingest TS + the dbt project) that, when registered as a Dagster code location, lets Dagster orchestrate every Atlas ingest as a Python `@asset`. End state of this PLAN: image built, pushed to `ghcr.io/helpers-no/atlas-data:vX.Y.Z`, **one source** (`ssb-08764`) Pipes-enabled and verified end-to-end against `dagster dev` locally.

**Last Updated**: 2026-05-12

**Investigation**: [INVESTIGATE-deployment-pipeline.md](../backlog/INVESTIGATE-deployment-pipeline.md) — the Atlas view of the deploy. The Dagster architecture itself (Helm install, K8s topology, resource sizing, two-pod-types model, language-agnostic Pipes pattern) is owned by UIS in [`urbalurba-infrastructure/.../INVESTIGATE-dagster.md`](https://github.com/helpers-no/urbalurba-infrastructure/blob/main/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md). This PLAN implements the Atlas-side counterpart of UIS PLAN-002 (image build + first-source-Pipes-enabled) **without** the UIS Helm-values-edit step — that's a separate follow-up PLAN that fires when UIS PLAN-001 (Dagster install) is live.

**Sequencing**: Atlas's contributor confirmed Atlas can ship this PLAN's work **before** UIS PLAN-001 lands. Everything in scope here can be validated locally via `dagster dev` — no live Dagster platform required. The dependency on UIS only fires for the code-location registration (next PLAN).

**Prerequisites**: Local Atlas Postgres reachable on `localhost:35432` (UIS port-forward or `kubectl port-forward svc/postgresql 35432:5432`) for `dagster dev` + asset materialisation testing.

---

## Problem Summary

Atlas's [`atlas-data/ingest/src/sources/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources) directory has 40+ TypeScript source modules that today are invoked manually via `npm run ingest:<source>`. No scheduling, no observability, no lineage, no freshness policies, no run history. dbt sits downstream as a separate manual command. The whole pipeline is one operator's terminal.

Per the [deployment-pipeline INVESTIGATE](../backlog/INVESTIGATE-deployment-pipeline.md) and the UIS-side [INVESTIGATE-dagster.md](https://github.com/helpers-no/urbalurba-infrastructure/blob/main/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md), the v1 orchestrator is Dagster — UIS deploys the platform (webserver, daemon, metadata DB), Atlas contributes a code-location image that Dagster talks to over gRPC. The image runs as two pod types: a long-lived "describe-only" code-location pod and ephemeral "execute" run pods (spawned per materialisation).

The Atlas-side work splits naturally into two units:

1. **Build the image; prove the pattern with one source.** This PLAN.
2. **Roll out remaining 40+ sources, wire `dagster-dbt`, add schedules, register as a real code location.** A follow-up PLAN after UIS PLAN-001 ships.

Splitting at "image built + one source Pipes-enabled" because that's the natural validation point — once one source works end-to-end via `dagster dev`, the remaining sources are mechanical (~5 lines of Pipes integration each).

---

## Phase 1: Python scaffolding under `atlas-data/dagster/`

Get a minimal Python package that boots `dagster dev` and shows an empty workspace. No assets yet; we just want the module to load cleanly.

### Tasks

- [x] 1.1 Create `atlas-data/dagster/` with this layout:
  ```
  atlas-data/dagster/
  ├── pyproject.toml             # Python package metadata + deps
  ├── atlas_data/
  │   ├── __init__.py
  │   ├── definitions.py         # The Dagster entry point — `defs = Definitions(...)`
  │   └── assets/
  │       └── __init__.py
  └── README.md                  # What this directory is, how to run dagster dev
  ```
- [x] 1.2 `pyproject.toml` pins the Python-side deps. UIS doc names `dagster, dagster-dbt, dagster-k8s, dagster-pipes`; for Phase 1 we only need `dagster` itself (the others come in Phase 2 + future PLANs). Pin to dagster `~1.13` (Apr 2026 stable). Python `>=3.11,<3.13` (matches Atlas's dbt env). Manage with `uv` (Atlas's existing pattern — see `atlas-data/dbt/requirements.txt`).
- [x] 1.3 `definitions.py` is just `from dagster import Definitions; defs = Definitions(assets=[])`. Empty workspace. **Critical discipline (per UIS doc): no DB connections at module scope, no eager I/O, no heavy imports.** Every Dagster run pod cold-starts by importing this module; expensive imports → slow runs.
- [x] 1.4 Run `uv run dagster dev` from `atlas-data/dagster/`. Verify:
  - Dagster webserver boots on `localhost:3000` (or whatever port; `--port` to override since Docusaurus dev uses 3000).
  - Workspace shows the `atlas_data` code location with zero assets.
  - The UI renders cleanly.
- [x] 1.5 Write `atlas-data/dagster/README.md` covering: what this folder is, how to install (`uv pip install -e .`), how to run (`uv run dagster dev`), the cheap-import discipline.

### Validation

`cd atlas-data/dagster && uv run dagster dev` boots, no errors, empty workspace visible in the UI. `dagster definitions validate` (or whatever the equivalent is in 1.13) passes.

---

## Phase 2: Wire `ssb-08764` via Dagster Pipes

Add the TypeScript Pipes SDK to ingest, wire one source's `index.ts`, declare the matching Python `@asset`, verify end-to-end materialisation.

### Tasks

- [x] 2.1 Add `@dagster-io/dagster-pipes` to `atlas-data/ingest/package.json` dependencies. Pin to a specific version (currently `0.1.0`; the UIS doc flags this is on a slower cadence than the Python SDK — explicit pin, deliberate bumps). `npm install`.
- [x] 2.2 Modify `atlas-data/ingest/src/sources/ssb-08764/index.ts`:
  - Add `import * as dagster_pipes from '@dagster-io/dagster-pipes'` at the top.
  - At the start of `run()`, call `using context = dagster_pipes.openDagsterPipes()` — this is a no-op when the Dagster env vars are absent, so local `npm run ingest:ssb-08764` still works exactly as today.
  - After the ingest completes successfully, call `context.reportAssetMaterialization({ row_count, source_updated, fetch_duration_ms })` with whatever metadata the source already tracks.
  - Verify local `npm run ingest:ssb-08764` still works (no regressions).
- [x] 2.3 Add `atlas-data/dagster/atlas_data/assets/raw_ssb.py`:
  ```python
  from dagster import asset, AssetExecutionContext
  from dagster_pipes import PipesSubprocessClient
  import os

  @asset(key=["raw", "ssb_08764"], group_name="raw_ssb")
  def raw_ssb_08764(
      context: AssetExecutionContext,
      pipes_subprocess_client: PipesSubprocessClient,
  ):
      return pipes_subprocess_client.run(
          command=["npm", "run", "ingest:ssb-08764"],
          context=context,
          cwd="/app/ingest",      # path inside the polyglot image; for `dagster dev` locally, parameterise to atlas-data/ingest
          env={"DATABASE_URL": os.environ["ATLAS_DATABASE_URL"]},
      ).get_materialize_result()
  ```
  - The `cwd` is hardcoded to the in-image path; locally it needs to be `<repo>/atlas-data/ingest`. Pass via env var or compute from `__file__`.
  - Wire `PipesSubprocessClient` as a resource in `definitions.py`.
- [x] 2.4 Verify end-to-end via `dagster dev`:
  - Start `dagster dev` from `atlas-data/dagster/`.
  - In the UI, navigate to the `raw.ssb_08764` asset and click "Materialize."
  - Dagster spawns the subprocess, which runs `npm run ingest:ssb-08764`, which hits PostgREST/Postgres, upserts to `raw.ssb_08764`, calls `reportAssetMaterialization`.
  - Confirm: a row appears in Dagster's event log for the asset; row count and metadata visible; downstream `dbt run` would now see fresh data.
- [x] 2.5 Confirm local `npm run ingest:ssb-08764` still works (no-op Pipes when env vars absent). Test in both directions (Dagster path + manual path).

### Validation

A `dagster dev` instance shows one asset (`raw.ssb_08764`). Clicking Materialize runs the existing TypeScript ingest as a subprocess, the database gets new rows, and the run-event-log records the materialisation with metadata. The same `npm run ingest:ssb-08764` command works unchanged outside Dagster.

---

## Phase 3: Polyglot Dockerfile + GHA image push

Wrap everything into the polyglot image and ship it to GHCR. Once UIS PLAN-001 is up, that image is what gets registered as a Dagster code location.

### Tasks

- [x] 3.1 Create `atlas-data/deploy/Dockerfile`, multi-stage:
  - **Stage 1 — node-deps**: `node:20-slim`, copy `atlas-data/ingest/`, run `npm ci` (installs `@dagster-io/dagster-pipes` + existing deps + `tsx`).
  - **Stage 2 — python-deps**: `python:3.11-slim`, install `uv`, `uv pip install` dagster + dagster-dbt + dagster-k8s + dbt-postgres + the Pipes Python SDK. (We add `dagster-dbt` and `dagster-k8s` here even though Phase 2 doesn't use them — they're cheap to install and the next PLAN needs them. Avoid two image rebuilds.)
  - **Stage 3 — runtime**: combine. Copy node + npm modules + ingest source from stage 1, python + site-packages from stage 2, the `atlas-data/dagster/` package, the `atlas-data/dbt/` project.
  - Entrypoint: `dagster api grpc --module-name atlas_data.definitions --port 4000` (matches the UIS doc's expected gRPC server pattern).
  - Total expected image size: ~1.5–2 GiB (UIS doc estimate). Worth optimising later but not blocking.
- [x] 3.2 Create `atlas-data/.dockerignore`: exclude `node_modules/` (we re-install in-image), `dbt/target/`, `dbt/dbt_packages/`, `output/`, `.env`, anything else build-incidental.
- [x] 3.3 Build locally: `docker build -t atlas-data:dev atlas-data/`. Verify:
  - Build succeeds.
  - `docker run --rm -e ATLAS_DATABASE_URL=... atlas-data:dev` boots the gRPC server (listens on `:4000`, log says "Started Dagster code server").
- [x] 3.4 New GHA workflow `.github/workflows/atlas-data-image.yml`:
  - Triggers: `pull_request` + `push` to `main`, path-filtered to `atlas-data/**` + the workflow file.
  - PR: build the image (cache via `docker/build-push-action@v5` + `cache-from/cache-to: type=gha`). No push.
  - Main push: build + push to `ghcr.io/helpers-no/atlas-data:sha-<short-commit>` + `:vYYYYMMDD-<sha-short>` (date-prefixed for human readability; **never `:latest`** per UIS doc — Helm needs unique tags to roll). Permissions: `contents: read, packages: write`.
- [ ] 3.5 Verify a push to `main` produces an image in GHCR. `docker pull ghcr.io/helpers-no/atlas-data:<tag>` works from a fresh shell.

### Validation

`ghcr.io/helpers-no/atlas-data:<tag>` exists and is pullable. `docker run -e ATLAS_DATABASE_URL=... ghcr.io/helpers-no/atlas-data:<tag>` boots and stays up. The image carries everything UIS needs to register it as a Dagster code location.

---

## Acceptance Criteria

- [ ] `atlas-data/dagster/` exists as a working Python package; `uv run dagster dev` boots cleanly.
- [ ] `definitions.py` imports cheaply (no DB connections, no eager I/O at module scope).
- [ ] One source (`ssb-08764`) materialises end-to-end via Dagster: TypeScript subprocess → Postgres write → asset materialisation event.
- [ ] Local `npm run ingest:ssb-08764` still works exactly as before (Pipes no-ops when env vars absent).
- [ ] `atlas-data/deploy/Dockerfile` builds a polyglot image that boots `dagster api grpc`.
- [ ] GHA workflow publishes the image to GHCR on main commits with unique tags.

---

## Implementation Notes

### Why we ship one source not 40+

Per the UIS doc's phasing (UIS PLAN-002 → Atlas registers one source first, UIS PLAN-003 → Atlas rolls out the rest), the validation cycle is much tighter at one source. Once one source works:

- The image structure is proven.
- The TypeScript Pipes integration pattern (5 lines per source) is proven.
- `definitions.py` import-time cost is measurable.
- The "no-op when Dagster env vars absent" property is verified, so local dev keeps working.

The remaining ~40 sources, plus `dagster-dbt` for the dbt half, plus schedules and freshness policies, become a separate PLAN that ships after this one. That PLAN is mostly mechanical — same Pipes pattern repeated per source — but is appropriately gated by "the pattern works at all."

### Why `definitions.py` discipline matters

Per the UIS doc: every Dagster run pod cold-starts by importing `atlas_data.definitions`. Heavy module-scope code → slow runs.

Rules to bake in from day one:
- No DB connections at module scope (open them inside `@asset` function bodies).
- No expensive file I/O at module scope (no eager catalog loads, no parsing of big JSON files at import time).
- No environment-variable lookups that fail loudly (use `os.getenv()` with defaults, not `os.environ[...]`).
- `dagster-dbt`'s manifest parsing is acceptable — it's the one expensive thing the architecture needs.

Worth codifying as a Phase 4 / follow-up: a CI check that times `python -c 'import atlas_data.definitions'` and fails if it takes >2s.

### Sequencing — Atlas-first or UIS-first?

Atlas's contributor explicitly authorised "Atlas can ship the dagster SW first" (see talk thread). This PLAN ships entirely without UIS PLAN-001 being live:

- Phase 1 + 2 validate against `dagster dev` (a local Dagster instance that runs on the developer's machine, no UIS at all).
- Phase 3 builds + pushes an image to GHCR. The image just sits there until UIS PLAN-001 is up.

The register-as-code-location step (UIS Helm values edit + `helm upgrade`) is a separate PLAN that fires whenever UIS PLAN-001 lands. If UIS PLAN-001 has already shipped by the time this PLAN finishes, that follow-up could be bundled in — but the work cleanly separates.

### Image-size trade-offs

Polyglot Python + Node + dbt + dagster + uv venv → ~1.5–2 GiB on disk. Affects:

- Registry storage (modest).
- Image-pull time on first deploy to a fresh K8s node (a few minutes; subsequent pods reuse the cached image).
- Run-pod cold-start (file system cache is hot once first pod runs; subsequent pods boot in 5–15s).

Not blocking but worth keeping an eye on. Future optimisations: switch from `python:3.11-slim` to a distroless base, use `uv pip install --no-compile`, prune `node_modules` of dev-only deps. Defer until size becomes a real problem.

### What this PLAN doesn't do (deferred)

- **Register the image as a Dagster code location in UIS Helm values.** A follow-up Atlas-side PLAN that depends on UIS PLAN-001 being live. Two-file change to UIS values + `helm upgrade`. Could be a single co-ordinated PR with UIS at the time.
- **Roll out remaining 40+ sources via Pipes.** Same ~5-line pattern as `ssb-08764`. One PR per few sources (or bulk if there's appetite). Not gated on UIS; happens entirely in Atlas.
- **Wire `dagster-dbt`.** Auto-loads dbt models as Dagster assets from `manifest.json`. Adds the marts side of the asset graph. Probably its own PLAN to keep this one small.
- **Schedules** (`@schedule` declarations per source).
- **Freshness policies + alerts.**
- **Run-pod-resource overrides per asset** (for heavy ingest like `redcross-branches`).
- **`max_concurrent_runs` config** in `dagster.yaml`.

The UIS-side PLAN-003 doc enumerates several of these; from Atlas's side, each is a small follow-up after the first source proves the pattern.

---

## Files to Modify / Create

**Create:**
- `atlas-data/dagster/pyproject.toml`
- `atlas-data/dagster/atlas_data/__init__.py`
- `atlas-data/dagster/atlas_data/definitions.py`
- `atlas-data/dagster/atlas_data/assets/__init__.py`
- `atlas-data/dagster/atlas_data/assets/raw_ssb.py`
- `atlas-data/dagster/README.md`
- `atlas-data/deploy/Dockerfile`
- `atlas-data/.dockerignore`
- `.github/workflows/atlas-data-image.yml`

**Modify:**
- `atlas-data/ingest/package.json` — add `@dagster-io/dagster-pipes` dep (pinned).
- `atlas-data/ingest/package-lock.json` — regenerated.
- `atlas-data/ingest/src/sources/ssb-08764/index.ts` — add Pipes calls.
- `atlas-data/README.md` — point at the new `dagster/` subdir; describe the polyglot image.

**Do not touch:**
- `urbalurba-infrastructure/**` — Atlas-side only. Code-location registration is a follow-up coordinated with UIS.
- Other ingest source modules — only `ssb-08764` gets Pipes in this PLAN.
- `atlas-data/dbt/` — unchanged; `dagster-dbt` wiring is a follow-up.
