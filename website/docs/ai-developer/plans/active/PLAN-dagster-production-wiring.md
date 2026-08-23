# PLAN: Dagster production wiring — frr, dagster-dbt, schedules, testable declaration

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — phases 1–3 shipped; awaiting tester verdict on phase 4

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

[`models/private_marts/sources.yml`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/models/private_marts/sources.yml) states it plainly:

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

- [x] 2.1 Add a `DbtProject` pointing at `atlas-data/dbt/`, resolving its path the same way `_factory.py` resolves the ingest dir (up-4 from `__file__`), so one code path serves both the local layout and `/app` in the image.
- [x] 2.2 Bake `dbt parse` into `atlas-data/deploy/Dockerfile` so `target/manifest.json` ships in the image. Run pods must never parse dbt at runtime — `dagster-dbt`'s manifest load is the one expensive import the architecture accepts, and only because it's precomputed.
- [x] 2.3 Declare `@dbt_assets` over the manifest. Map dbt sources to the existing `raw/*` asset keys so the ingest assets become real upstream dependencies rather than a disconnected second graph.
- [x] 2.4 **Exclude the `private` tag from the deployed selection.** `private_marts.frr_*` models are tagged `private`; they materialise as empty tables per the contract, but they should not appear as schedulable assets in a shared cluster UI. Keep them available locally.
- [x] 2.5 Add an `api_v1` asset downstream of the marts assets that applies `atlas-data/dbt/api_v1_generated.sql` (the `apply-api-v1.sh` step: wrapper views, column COMMENTs, the `<app>_web_anon` grant, and `NOTIFY pgrst, 'reload schema'`). This is what makes a refresh visible to PostgREST without a human.
- [x] 2.6 Verify the full chain in `dagster dev`: materialise a raw asset → its downstream dbt models → the api_v1 asset, and confirm the row count changes land in the API.

### Validation

The asset graph shows `raw.* → marts.* → api_v1.*` end to end. `dbt build` still passes standalone (the Dagster wiring must not become the only way to run dbt).

### Outcome (2026-08-23) — complete

New modules: `atlas_data/assets/dbt.py` (dbt half) and `atlas_data/assets/api_v1.py` (terminal asset), both wired into `definitions.py`.

**Graph, measured:** 125 assets by default — 41 Pipes ingest assets, 6 unproduced dbt sources, 77 dbt models, and `api_v1`. Plus **644 dbt tests as Dagster asset checks**. Lineage verified edge by edge: `raw/ssb_08764 → marts/indicators__ssb_08764`, and `api_v1` depends on exactly the 13 `models/marts/api/` marts (derived from the manifest, not hardcoded — the surface has already grown 9 → 13).

**Ran, not just inspected:** `raw/ssb_klass_kommuner+` materialised through Dagster (Pipes subprocess → 1327 rows → downstream dbt model, `RUN_SUCCESS`); `api_v1` materialised through Dagster, creating **13 views with 104 column comments** in Postgres. `dbt build` 855 PASS / 1 WARN (pre-existing seed relationship warning), `check-osmosis.sh` exit 0, 99 ingest tests pass.

**Private exclusion works both ways:** default 125 assets with zero `private_marts` keys; `ATLAS_DAGSTER_INCLUDE_PRIVATE=1` gives 133 and restores `raw/frr → private_marts/supply__frr_*`. Excluded by **tag**, not path, so a newly tagged model is covered without editing this file.

**Import cost:** 1.0–1.2s steady (first import ~2s while bytecode compiles), inside the <2s discipline.

### Four defects found and fixed on the way

1. **`api_v1_generated.sql` was never copied into the image.** The Dockerfile copies models/seeds/macros/scripts but not the generated SQL, so the api_v1 asset would have failed at runtime in the cluster. Added to the COPY.
2. **`dbt parse` in the image needed `dbt deps` first.** `.dockerignore` excludes `dbt/dbt_packages/`, so `dbt_utils` isn't present at build time and the parse — hence the whole image build — would have failed. Added.
3. **The `[deploy]` extra didn't constrain `dbt-core`.** `dagster-dbt` asks only for `dbt-core<1.12,>=1.7`, so installing this package standalone resolves **dbt 1.11** while the dbt project pins **1.8**. The image is saved only by `requirements.txt` happening to install first — local dev is not. Reproduced by walking into it. Pinned `dbt-core>=1.8,<1.9` in the extra, and corrected `dagster-dbt`/`dagster-k8s` from `~=0.27` to `~=0.29`, which is what actually pairs with dagster 1.13.
4. **`from __future__ import annotations` breaks Dagster's context validation** — it stringifies the annotation and `AssetExecutionContext` stops being recognised. Removed from the new modules. `_factory.py` still has it and still works (no context annotation), so it was left alone.

### Design notes

- **`raw.redcross_branch_activities` is deliberately not mapped** to `raw/redcross_branches`. Dagster requires one dbt resource per asset key and rejects the collapse outright. Modelling it truthfully means making that ingest a `multi_asset` **and** changing the TypeScript Pipes contract in `lib/ingest_run.ts` to report per-table rather than per-run materialisations. Filed as a follow-up rather than bodged; the activities table shows as an unproduced source meanwhile.
- **`api_v1` uses psycopg2, not `apply-api-v1.sh`.** That script runs psql via `docker run`, and there is no Docker daemon in a Dagster run pod.
- **The image change is unverified locally** — there is no Docker daemon on tecMacDev. The `atlas-data-image.yml` workflow builds on every PR, so CI is the first real check; the imac tester is the second.

### Noted, not fixed (out of scope)

- Four dbt sources (`raw.ssb_08484`, `08487`, `09405`, `09406`) have indicator models but **no ingest module** — the tables are created by migrations and never populated. Worth a look: either they have a producer nobody wrote down, or four indicators are silently empty.
- 17 `fhi_*` ingest sources have no dbt model at all; they land in `raw.*` and stop. Real, but a modelling backlog item, not a wiring bug.

---

## Phase 3: Schedules

### Tasks

- [x] 3.1 Declare `@schedule`s per source family, cadence matched to each upstream's real `periodicity` from its `manifest.yml` — not one blanket nightly. SSB/FHI tables that publish annually don't need a daily fetch, and hammering them daily is bad citizenship toward the public sources Atlas depends on.
- [x] 3.2 A downstream schedule (or asset sensor) for the dbt + api_v1 assets so a raw refresh propagates without a human.
- [x] 3.3 **No in-code concurrency limits** — the cap of 4 lives in the UIS chart values (see Problem Summary). Add a comment saying so, so a future contributor doesn't "helpfully" add one.
- [x] 3.4 Verify schedules appear in `dagster dev` with correct next-tick times, without turning them on.

### Validation

Schedules are visible and correctly parameterised locally. Nothing is self-certified as working in a cluster — that is Phase 4's job.

### Outcome (2026-08-23) — complete

`atlas_data/schedules.py`. Cadence taken from the manifests, which declare **37 × P1Y and 4 × irregular** across the 41 sources:

| Schedule | Cron (Europe/Oslo) | Scope | Why |
|---|---|---|---|
| `annual_sources_weekly` | `0 2 * * 0` | 37 annual sources | Weekly, not annual: publication dates drift by weeks and nobody wants to find a release eleven months late. ~37 requests/week is nothing to SSB/FHI, and the ingests upsert so a poll that finds nothing is a no-op. Nightly would be ~15,000 pointless requests a year at public-sector APIs Atlas needs to stay welcome at. |
| `klass_monthly` | `0 1 1 * *` | 2 SSB Klass sources | Classifications change at year boundaries. Kept off the weekly wave because they feed `dim_kommune`, which most marts join to — a bad Klass refresh has a wide blast radius and should be attributable. |
| `redcross_branches_weekly` | `30 3 * * 0` | 1 scraper | Heaviest asset (~512MiB headless browser) and it scrapes someone else's site. Offset from the annual wave so it isn't competing for the 4 run-pod slots with 37 API fetches. |
| `transform_daily` | `0 5 * * *` | dbt + `api_v1` | Daily despite weekly sources: this run is also the in-pipeline data-quality gate (644 dbt tests as asset checks) and the step that republishes `api_v1` and reloads PostgREST's schema cache. A daily green run is the signal the public API still serves what it should. |

**`frr` is deliberately unscheduled** — it would materialise zero rows on a timer forever in the cluster. Verified absent from every job.

**No in-code concurrency limits**, per the maintainer's push-back; the cap of 4 is chart-side. `schedules.py` says so at the top so nobody "helpfully" adds one.

All four ship **STOPPED** (Dagster's default) — verified. Turning them on is Terje's go-live decision, not a side effect of deploying the code location.

**Verified by execution**: `transform_and_publish` run end-to-end — `dbt build` 821 PASS / 1 WARN / **0 ERROR**, api_v1 re-applied 13 views, `rowcount_matches_marts` check passed, `RUN_SUCCESS`. Job scopes confirmed: 37 + 2 + 1 raw assets, 65 transform assets.

### Two more defects found — one mine, one the repo's

1. **Mine: `api_v1` was depending on 13 phantom assets.** I built its dep keys as `AssetKey([node["name"]])`, but dbt models inherit a key prefix from their configured schema — the real key is `marts/mart_activity_catalog`. The graph reported 125 assets and looked wired; `api_v1` was downstream of *nothing*. Now derived through the shared `dbt_translator()`, and the count drops to the honest **112**. Caught only by inspecting the job's asset keys rather than trusting the earlier green run — a green run proved nothing here, because phantom deps have no producer and so never fail.

2. **The repo's: `dbt build` cannot contain `api_v1_rowcount_matches_marts`.** `dbt run` rebuilds `marts.mart_*` by swapping in a new table and dropping the old one `CASCADE` — which destroys the dependent `api_v1.*` views. That is normal and is exactly why the api_v1 asset re-applies them downstream. But that test hardcodes `api_v1.<view>` instead of using `ref()`, so dbt infers no dependencies and schedules it early (position 20 of 823) — against views the same invocation is busy destroying. In a one-shot `dbt build` it is a coin flip on ordering; **on a schedule it would fail every single night**.

   Fixed by excluding it from the orchestrated build and re-homing its intent as a Dagster **asset check on `api_v1`**, which runs after the views are re-applied — the only point where the comparison means anything. The check also enumerates `api_v1` from the catalog instead of the dbt version's hand-maintained `union all` per view, whose own header admits the drift risk ("when adding a new mart_<name> view ... add a corresponding union all line below"). A missing `marts.mart_<view>` is reported as a finding rather than skipped.

   **Follow-up**: `tests/api_v1_rowcount_matches_marts.sql` is now redundant and misordered. Left in place (standalone `dbt build` after `apply-api-v1.sh` still passes) rather than deleted mid-phase — retiring it belongs in its own PR.

---

## Phase 4: Declare for verification (conformance C11)

Per `~/home/ai-developer/platform-conformance.md` C11, Atlas does **not** self-certify a platform integration. The imac tester (Rancher Desktop, prod-matched k8s 1.36 / Traefik 3.7) verifies it.

### Tasks

- [x] 4.1 Push a `main`-merge so CI builds a fresh `ghcr.io/terchris/atlas-data` tag containing all of the above; record the exact tag.
- [x] 4.2 Write `ai-developer/for-ops-atlas-testable.md` in `~/home`: scope, exact deploy steps (`./uis deploy dagster` + the code-location registration with the recorded tag), the `ATLAS_DATABASE_URL` secret requirement, and explicit PASS criteria.
- [x] 4.3 PASS criteria to state: code location loads and shows 41 raw assets + the dbt assets; no `private`-tagged assets present; a nominated raw asset materialises end-to-end into `marts.*` and `api_v1.*`; `raw/frr` materialises 0 rows without failing; schedules visible to the daemon.
- [ ] 4.4 Fix whatever the tester reports, on Atlas's side, and re-declare. Do not argue with a FAIL — re-declare after fixing.

### Validation

A PASS report routed back through ops.

### Outcome (2026-08-23) — declared, awaiting the tester

Phases 1–3 merged as **PR #151** (squash `0564f20`). CI published
**`ghcr.io/terchris/atlas-data:v20260823-0564f20`**
(`sha256:ac903ccf690e3be8b5f186b4d4c1de0f20f964243b45b15d664c914af1a37e2c`),
and the declaration is at `~/home/ai-developer/for-ops-atlas-testable.md`.

**The image build passed on its first CI run** — the one check that mattered, since
the Dockerfile changes (`dbt deps`, `dbt parse`, copying `api_v1_generated.sql`)
could not be verified locally for want of a Docker daemon.

Two CI failures on the way, both docs-side and both mine: a relative link in this
plan that escaped the docs tree (Docusaurus rejects it — the repo's convention for
cross-tree refs is a GitHub URL), and `check-catalog` drift because the generator
restamps `generated_at`, so any PR touching `atlas-data/ingest/src/sources/**`
trips it. Fixed, and the docs build is now run locally before pushing rather than
discovered in CI.

**PASS criteria are tiered**, because of one thing the platform docs don't answer:
the documented `code_locations` schema is `{name, image, tag, module, why}` with no
env or secret field, so **how `ATLAS_DATABASE_URL` reaches the code-location and
run pods is unresolved** — either a mechanism not yet written down or a real gap in
the service. Tier 1 (7 criteria) needs no database at all, since `definitions.py`
opens no connections at import, so it is worth running either way; tier 2 (5
criteria) covers materialisations. Three criteria are deliberately sharp:

- **No `private_marts/*` asset may appear** — its presence is a FAIL, meaning the tag exclusion didn't survive into the image.
- **All 4 schedules must be STOPPED** — a RUNNING schedule is a FAIL; go-live is Terje's decision, not a deploy side effect.
- **`raw/frr` must SUCCEED WITH ZERO ROWS** — a *failed* frr is a FAIL, a successful empty one is the expected result. That inversion is the whole point of phase 1.

The declaration also lists four known-not-broken items so they aren't filed as
defects, and flags that the platform's 4-slot concurrency cap has never been
exercised — `annual_sources_refresh` fans out to 37 assets at once.

**Task 4.4 (fix findings, re-declare) stays open** — this plan is not complete until
a PASS comes back. Atlas does not self-certify.

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
