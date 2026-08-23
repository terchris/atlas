# PLAN: Dagster production wiring — frr, dagster-dbt, schedules, testable declaration

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active

**Goal**: Complete Atlas's side of the Dagster integration — the last un-orchestrated ingest source, the dbt half of the asset graph, schedules — and declare it for independent verification by the fleet tester.

**Last Updated**: 2026-08-23

**Prerequisites**: [PLAN-dagster-codelocation-image.md](../completed/PLAN-dagster-codelocation-image.md) (complete — image at `ghcr.io/terchris/atlas-data`)

**Investigation**: [INVESTIGATE-deployment-pipeline.md](../backlog/INVESTIGATE-deployment-pipeline.md)

**Priority**: High — this is the last Atlas-side blocker on production data freshness.

---

## Problem Summary

Dagster is now a **UIS platform service** (service `dagster`, category ANALYTICS, number 360, OSS chart pinned to `1.13.x`), built by the UIS maintainer against Atlas's requirement doc and independently verified across three test rounds. The platform-side blocker is gone.

Atlas's side is most of the way there — 40 of 41 ingest sources are Pipes-enabled and materialise via `dagster dev` — but three gaps remain before the code location is worth registering in the cluster:

1. **`frr` is not orchestrated.** It is the only source with no `ingest:frr` npm script and no `@asset`. It is also the only source that reads from `atlas-private-data-repo/` — a gitignored directory that is **absent from the polyglot image by design**. `discoverNgoFolders()` calls `readdir(PRIVATE_DATA_ROOT)` unguarded, so in a cluster run pod it throws `ENOENT` rather than doing the already-agreed thing.
2. **dbt is not in the asset graph.** Dagster orchestrates `raw.*` but stops there. `marts.*` and `api_v1.*` are still manual, so the lineage graph ends halfway and nothing downstream of ingest has a freshness signal.
3. **No schedules.** There is no daemon-driven cadence, which is the entire reason for adopting an orchestrator.

### The `frr` contract is already decided — don't re-litigate it

[`models/private_marts/sources.yml`](../../../../atlas-data/dbt/models/private_marts/sources.yml) states it plainly:

> On public deployments the table exists but is empty (no NGO data present); `private_marts.frr_*` models materialize as empty tables (option a).

So the correct cluster behaviour for `frr` is **materialise zero rows, successfully** — not fail, and not mount private NGO data into a shared cluster. This PLAN implements that contract; it does not reopen it. No private data reaches the platform.

### Capacity policy is the platform's, not Atlas's

The UIS maintainer's verdict set the run-pod concurrency cap at **4**, and explicitly pushed back on Atlas's offer to throttle in code:

> Capacity policy for a shared Postgres — which PostgREST, Atlas and Dagster's own metadata all sit on — should not live inside one tenant. It goes in chart values so the platform can change it without an Atlas rebuild.

Phase 3 therefore declares schedules **without** in-code concurrency limits.

---

## Phase 1: `frr` — the 41st source

Bring `frr` to parity with the other 40, and make it safe to run where the private data isn't.

### Tasks

- [x] 1.1 Add `"ingest:frr": "tsx --env-file=.env src/sources/frr/index.ts"` to `atlas-data/ingest/package.json`, in alphabetical position (between `fhi-vgs-gjennomforing` and `redcross-branches`).
- [x] 1.2 Guard `discoverNgoFolders()` in `atlas-data/ingest/src/sources/frr/index.ts`: a missing `PRIVATE_DATA_ROOT` returns `[]` rather than throwing `ENOENT`. Log it at `info` with the resolved path so an operator can tell "no private data mounted" from "private data mounted but empty" — those look identical in the row count otherwise.
- [x] 1.3 Add `"frr"` to `OTHER_SOURCES` in `atlas-data/dagster/atlas_data/assets/raw_other.py`, with a module-docstring note that it materialises **0 rows on public deployments by design** (cite the `sources.yml` contract) so a future reader doesn't file the empty asset as a bug.
- [x] 1.4 Verify locally, both paths: `npm run ingest:frr` with the private repo present (rows > 0) and with `PRIVATE_DATA_ROOT` temporarily renamed (exits 0, 0 rows).

### Validation

`dagster dev` shows 41 raw assets. `raw/frr` materialises successfully in both states. No regression in the other 40.

### Outcome (2026-08-23) — complete

Verified against a real Postgres (throwaway instance, all 49 migrations applied), not by inspection:

| Check | Result |
|---|---|
| Pre-fix behaviour, private root absent | **Reproduced the defect**: `frr.fatal … ENOENT: no such file or directory, scandir '…/atlas-private-data-repo'` |
| Post-fix, private root present | 5 rows upserted to `private_raw.frr_resources`, exit 0 |
| Post-fix, private root absent (the cluster case) | `frr.private_data_root_absent` logged, 0 rows, **exit 0** |
| Dagster asset graph | 41 raw assets, `raw/frr` present, `definitions.py` import 0.34s (well inside the <2s discipline) |
| `npm test` | 99 passed / 9 files, including 6 new `discover.test.ts` cases |
| `npm run typecheck` | No new errors (see known issue below) |

`discoverNgoFolders` was **extracted to `src/sources/frr/discover.ts`** because `index.ts` invokes `run()` at module scope, so nothing in it can be imported by a test. The extraction is what lets the ENOENT guard be covered by CI (C11 tier 1) rather than trusted. Non-ENOENT errors (e.g. `EACCES`) still throw — reading a permissions failure as "no NGO data" would silently empty `private_raw.frr_resources`, which is the dangerous failure mode.

**Known issue, pre-existing, not introduced here**: `npm run typecheck` reports two errors in `src/sources/validate-manifests.ts` (ajv / ajv-formats ESM-CJS call signatures). Confirmed present on a clean tree with the changes stashed. Left alone as out of scope — worth its own fix so the gate is trustworthy again.

**Environment note**: the Python side was not installed on tecMacDev at all (no `uv`, no venv). Installed `uv` and created `atlas-data/dagster/.venv` per `contributors/setup.md`. Also note `npm test` requires Node ≥22 — vitest 4's rolldown needs `styleText` from `node:util`, which Node 20.11 (the machine default) lacks, so it fails at startup there.

---

## Phase 2: `dagster-dbt` — the rest of the graph

Load dbt models as Dagster assets so `raw → marts → api_v1` is one lineage graph.

### Tasks

- [ ] 2.1 Add a `DbtProject` pointing at `atlas-data/dbt/`, resolving its path the same way `_factory.py` resolves the ingest dir (up-4 from `__file__`), so one code path serves both the local layout and `/app` in the image.
- [ ] 2.2 Bake `dbt parse` into `atlas-data/deploy/Dockerfile` so `target/manifest.json` ships in the image. Run pods must never parse dbt at runtime — `dagster-dbt`'s manifest load is the one expensive import the architecture accepts, and only because it's precomputed.
- [ ] 2.3 Declare `@dbt_assets` over the manifest. Map dbt sources to the existing `raw/*` asset keys so the ingest assets become real upstream dependencies rather than a disconnected second graph.
- [ ] 2.4 **Exclude the `private` tag from the deployed selection.** `private_marts.frr_*` models are tagged `private`; they materialise as empty tables per the contract, but they should not appear as schedulable assets in a shared cluster UI. Keep them available locally.
- [ ] 2.5 Add an `api_v1` asset downstream of the marts assets that applies `atlas-data/dbt/api_v1_generated.sql` (the `apply-api-v1.sh` step: wrapper views, column COMMENTs, the `<app>_web_anon` grant, and `NOTIFY pgrst, 'reload schema'`). This is what makes a refresh visible to PostgREST without a human.
- [ ] 2.6 Verify the full chain in `dagster dev`: materialise a raw asset → its downstream dbt models → the api_v1 asset, and confirm the row count changes land in the API.

### Validation

The asset graph shows `raw.* → marts.* → api_v1.*` end to end. `dbt build` still passes standalone (the Dagster wiring must not become the only way to run dbt).

---

## Phase 3: Schedules

### Tasks

- [ ] 3.1 Declare `@schedule`s per source family, cadence matched to each upstream's real `periodicity` from its `manifest.yml` — not one blanket nightly. SSB/FHI tables that publish annually don't need a daily fetch, and hammering them daily is bad citizenship toward the public sources Atlas depends on.
- [ ] 3.2 A downstream schedule (or asset sensor) for the dbt + api_v1 assets so a raw refresh propagates without a human.
- [ ] 3.3 **No in-code concurrency limits** — the cap of 4 lives in the UIS chart values (see Problem Summary). Add a comment saying so, so a future contributor doesn't "helpfully" add one.
- [ ] 3.4 Verify schedules appear in `dagster dev` with correct next-tick times, without turning them on.

### Validation

Schedules are visible and correctly parameterised locally. Nothing is self-certified as working in a cluster — that is Phase 4's job.

---

## Phase 4: Declare for verification (conformance C11)

Per `~/home/ai-developer/platform-conformance.md` C11, Atlas does **not** self-certify a platform integration. The imac tester (Rancher Desktop, prod-matched k8s 1.36 / Traefik 3.7) verifies it.

### Tasks

- [ ] 4.1 Push a `main`-merge so CI builds a fresh `ghcr.io/terchris/atlas-data` tag containing all of the above; record the exact tag.
- [ ] 4.2 Write `ai-developer/for-ops-atlas-testable.md` in `~/home`: scope, exact deploy steps (`./uis deploy dagster` + the code-location registration with the recorded tag), the `ATLAS_DATABASE_URL` secret requirement, and explicit PASS criteria.
- [ ] 4.3 PASS criteria to state: code location loads and shows 41 raw assets + the dbt assets; no `private`-tagged assets present; a nominated raw asset materialises end-to-end into `marts.*` and `api_v1.*`; `raw/frr` materialises 0 rows without failing; schedules visible to the daemon.
- [ ] 4.4 Fix whatever the tester reports, on Atlas's side, and re-declare. Do not argue with a FAIL — re-declare after fixing.

### Validation

A PASS report routed back through ops.

---

## Acceptance Criteria

- [ ] All 41 ingest sources are Dagster assets; `frr` succeeds with zero rows where private data is absent.
- [ ] `raw.* → marts.* → api_v1.*` is one lineage graph; a refresh reaches PostgREST with no manual step.
- [ ] No `private`-tagged asset is exposed in the deployed code location, and no private NGO data reaches the platform.
- [ ] Schedules declared, cadence matched to real upstream periodicity, no in-code concurrency cap.
- [ ] `dbt build`, `npm run typecheck`, `npm test`, and `./check-osmosis.sh` all still pass.
- [ ] A PASS report from the imac tester.

## Out of Scope

- Deploying or operating Dagster (UIS owns the service).
- Editing UIS Helm values — that is the cross-repo handshake, co-ordinated at registration time.
- Turning schedules on in production (needs the PASS first, and Terje's call on go-live).
