# PLAN: Dagster production wiring — frr, dagster-dbt, schedules, testable declaration

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed (2026-08-24) — verified by imac, round 6 PASS

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

### Round 1 verdict: FAIL — and it was the defect I predicted

`~/home/ai-developer/for-ops-test-atlas.md`. Tier 1 criteria 1 and 7 failed; tier 2
blocked. The code-location pod CrashLoopBackOffed 11 times on
`FileNotFoundError: dbt manifest not found at /usr/local/lib/python3.11/dbt/target/manifest.json`.

**Root cause — where the code is installed tells you nothing about where the data
lives.** The image ships `atlas_data` twice: as source at `/app/dagster/atlas_data/`
and pip-installed into site-packages. Python imports the site-packages copy, while
the dbt project and the ingest are at `/app/dbt` and `/app/ingest`. Both
`dbt.py` and `_factory.py` derived those by walking a fixed four parents up from
`__file__` — correct for the source tree, and landing in
`/usr/local/lib/python3.11` for the installed copy. Every local check passed
because every local check ran from the source tree.

**The tester found one instance; the same bug was in two places.** `_INGEST_DIR`
in `_factory.py` had it too and would have failed *every* ingest materialisation
in tier 2 — round 2 would have failed on criterion 8 for the same reason. Fixed
both.

**Fix**: `atlas_data/paths.py` resolves each payload by (1) `ATLAS_DBT_PROJECT_DIR`
/ `ATLAS_INGEST_DIR`, set explicitly by the Dockerfile; (2) walking up for a
sentinel file (`dbt_project.yml`, `package.json`) so a source checkout works at any
depth with no configuration; (3) raising an error that names the env var and lists
what was searched. No positional parent counting anywhere.

**The more important fix — CI now reproduces this class of failure.** The
Dockerfile runs a build-time smoke test that imports `atlas_data.definitions` from
`/` (not `/app`, so nothing can lean on the working directory) and asserts the
asset count. Round 1 shipped an image whose *only* real defect a single import
would have caught. That import now runs in CI, and the build goes red instead of
the cluster.

**Reproduced before fixing, per the phase 1 habit**: a non-editable install into a
throwaway venv, imported with `cwd=/`, fails exactly as the pod did; with the two
env vars set it imports from site-packages and resolves 112 assets. The source
checkout still resolves with no env vars at all.

**Also from the report, resolving my open question**: `env_secrets:` *is* supported
by the `code_locations` schema (documented at `/docs/services/analytics/dagster`)
and reaches both pod types. Not a service gap — my declaration was wrong to imply
one. The re-declaration includes `env_secrets: [atlas-database-url]`.

**Free intelligence from round 1**: the tester verified criteria 2–6 by static
introspection with a `PYTHONPATH` workaround — 112 assets, `raw/frr` present, **zero
`private_marts`**, 4 STOPPED schedules, 645 checks. The graph is exactly as declared,
so round 2 should not surprise on shape.

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


---

## Round 2 verdict: Tier 1 ALL PASS in-cluster; Tier 2 blocked by two new defects

`~/home/ai-developer/for-ops-test-atlas.md` (round 2). The round-1 path fix is
confirmed at the root — the tester checked **both** halves from inside the running
pod (`_INGEST_DIR=/app/ingest`, `DBT_PROJECT_DIR=/app/dbt`, manifest present) and
noted that fixing only `dbt.py` would have failed criterion 8 anyway. All seven
Tier 1 criteria pass in-cluster, queried through the webserver's GraphQL rather
than by static introspection: 112 assets, `raw/frr` present, **zero
`private_marts`**, 4 schedules STOPPED per the daemon's own state, pod `1/1` with
**0 restarts**.

Tier 2 was blocked by two defects, neither of them reachable in round 1.

### Blocker 1 — `dagster-postgres` missing from the image

The run pod died in ~5 seconds having executed **zero** steps:

```
CheckError: Couldn't import module dagster_postgres.run_storage when attempting
to load the configurable class dagster_postgres.run_storage.PostgresRunStorage
```

Run pods run **Atlas's** image, and the platform's Dagster instance uses Postgres
storage, so the pod must hydrate `PostgresRunStorage` before any step runs. Fixed
by adding `dagster-postgres~=0.29` to the deploy extra — resolves to **0.29.19**,
the same version the platform image carries.

The tester was explicit that this is *shared*: `dagster-postgres` appears nowhere
in the service contract's "requirements on your image", which lists four things
Atlas already satisfied. The immediate fix is Atlas's; the contract gap is filed
with assist.

### Blocker 2 — every npm script needed a `.env` the image does not ship

Entirely Atlas's, and it would have failed criterion 8 even with blocker 1 fixed:

```
$ npm run ingest:ssb-klass-kommuner
node: .env: not found
```

All 45 scripts used `tsx --env-file=.env`, and Node treats a missing `--env-file`
as fatal. Pipes passes `DATABASE_URL` through the environment — the right
mechanism — so the `.env` wrapper is a local-dev convenience that does not survive
containerisation. Switched to **`--env-file-if-exists=.env`**, which keeps local dev
identical and no-ops in the container. Verified both ways locally: with `.env`
present (unchanged) and absent with `DATABASE_URL` in the environment (works).

### The gap the tester asked about: nothing ran the migrations

The first in-cluster ingest died on `relation "raw.ingest_runs" does not exist`,
and the tester asked, fairly, **who runs `migrate` and when**. The honest answer
was "a human, at some point" — the graph started at the ingests and assumed the
tables existed.

Now `raw/_migrations` is an asset, upstream of all 41 ingest assets and included in
every ingest job's selection. That puts the dependency in the graph rather than in
a runbook step, and makes "can this pipeline build a database from nothing?" a
question the graph can answer. It is lineage, not automatic execution — a
single-asset materialisation will not silently migrate behind you — and the runner
is idempotent, so a scheduled run costs a no-op. **113 assets** now.

**Verified against a genuinely empty database**: `klass_refresh` executed
end-to-end on a fresh `atlas_fresh` DB — migrations applied, then 1327 + 41 rows
ingested, `RUN_SUCCESS`.

### All three failure modes now fail in CI instead of in the cluster

The round-1 lesson repeated, so the build catches what local checks structurally
cannot. The Dockerfile now asserts, at build time:

1. `atlas_data.definitions` imports from `/` with >100 assets — the round-1 bug.
2. `from dagster_postgres.run_storage import PostgresRunStorage` — exactly what the run pod does. Blocker 1.
3. `node --env-file-if-exists` is accepted **and** no script still uses the fatal `--env-file=` form. Blocker 2.

Three rounds, three classes of defect that only appeared when the image ran; all
three are now build-time gates.

### Free intelligence: the ingest payloads are already proven in-cluster

The tester ran criteria 8 and 9's payloads directly, bypassing the blockers:
`ssb-klass-kommuner` wrote **1327 rows** (matching local), and `frr` logged
`frr.private_data_root_absent`, `rows: 0`, success — the exact inverted criterion
from phase 1, confirmed in a real cluster. The orchestration wrapper was broken;
the ingest code was not.


---

## Round 3 verdict: Tier 1 all PASS, criteria 8 and 9 PASS, 10–12 FAIL

`~/home/ai-developer/for-ops-test-atlas.md` (round 3). **The first Atlas
materialisations ever to run in a Kubernetes run pod.** Both round-2 blockers
confirmed fixed; `./uis verify dagster` now exits 0 with "All can hydrate run
storage (D5)". The migrations asset built **47 raw tables from a database with 0
tables**, inside a run pod. `raw/ssb_klass_kommuner` wrote 1327 rows through a real
Pipes subprocess; `raw/frr` succeeded empty with `frr.private_data_root_absent`.

### The FAIL: dbt could not parse — `PGHOST` not set

```
dbt.exceptions.EnvVarMissingError: Parsing Error
  Env var required but not provided: 'PGHOST'
```

`profiles.yml` reads five libpq vars, and its own comment says where they come
from: `ingest/.env`. In a container nothing sets them — `env_secrets` supplies
only `ATLAS_DATABASE_URL`. **Same shape as the round-2 `.env` blocker**: the ingest
half was taught not to depend on `.env`, and the dbt half still depended on what
`.env` used to provide. Criteria 10, 11 and 12 all fell to this one cause.

**Fix**: `atlas_data/db.py` decomposes `ATLAS_DATABASE_URL` into the five libpq
vars, and the dbt asset sets them before invoking dbt. The alternative — asking the
platform for five more secrets — would make Atlas a special case and leave two
sources of truth for one connection. The tenant contract stays *one secret, one
variable*. Percent-encoded credentials are decoded, and every var is set even when
empty, because `env_var()` with no default raises on an *unset* variable.

**Verified under the exact failing condition**: only `ATLAS_DATABASE_URL` set, all
five `PG*` unset — `transform_and_publish` now runs green end-to-end (dbt 821 PASS
/ 0 ERROR, api_v1 13 views, rowcount check passed, `RUN_SUCCESS`).

### The shortfall the tester declined to fail us on — worth more than the FAIL

Criterion 8 passed, but the materialisation carried **no metadata at all**, so row
counts reached Postgres and never the Dagster UI. Root cause, reproduced locally:

```
dagster_pipes.report_failed  error: "Cannot use 'in' operator to search for 'type' in null"
```

The JS Pipes SDK's `normalizeMetadata` does `'type' in value`, which **throws on
null**. Atlas passed `null` for every field a source didn't populate, so the whole
`reportAssetMaterialization` call threw — and `recordIngestRun` catches Pipes
failures by design, since telemetry must never break an ingest. One null value cost
the entire payload, silently, for three rounds.

**Fix**: `buildMaterializationMetadata` omits absent values instead of nulling
them, extracted as a pure function with 5 unit tests so the swallowed path is
covered by something. Verified: a real materialisation now carries
`rows_parsed = 1327`, `rows_scraped`, `ingest_run_id`, `source_id`, and zero
`report_failed` warnings. Zero is preserved — it is a real row count.

### Criterion 13: my premise was wrong, and the fix is a real bound

The tester declined to run it and was right to. I asserted the platform's cap of 4
would throttle a 38-asset job. It does not: `max_concurrent_runs: 4` bounds
concurrent **runs**, and `annual_sources_refresh` is *one* run → one pod → 38 steps
as subprocesses bounded by the multiprocess executor's `max_concurrent`, which
defaults to the pod's CPU count. **Nothing bounded simultaneous writers against the
shared Postgres**, and phase 3's "no in-code concurrency limits, deliberately" was
reasoning from the wrong mechanism.

The maintainer's principle still holds — the platform must retune without an Atlas
rebuild — so the ingest jobs now use a bounded multiprocess executor whose limit
comes from **`ATLAS_MAX_CONCURRENT_INGESTS`** (default 4). Ops can change it on the
code location; no new image. A malformed value falls back to the default rather
than taking the code location down at import.

### Filed, not fixed

TypeScript structured logs don't reach Dagster's event log — only the Pipes
open/close lines do. Real debuggability gap (the tester read run-pod stdout to see
them), but forwarding the logger through Pipes is its own change, not a rider on a
connection fix.


---

## Closed 2026-08-24 — verified

Task 4.4 is done: imac returned PASS. Criteria 1–9 and 13 passed in round 4; 10–12
were closed by the tester while verifying the platform's start-timeout bump, on a
database carrying the round-4 ingest. Their summary is the fair one: *"your code was
never the blocker; the plan just could not be built in time to prove it."*

Six declaration rounds. Four cluster-breaking defects reached the tester — the
positional path resolution, `dagster-postgres`, the `.env` wrapper, and dbt's libpq
env — and every one of them was a **local-dev mechanism that did not survive
containerisation**. Three of the four are now build-time gates in the Dockerfile, so
that class fails in CI rather than in a cluster.

Superseded in part by [PLAN-transform-checks-split](./PLAN-transform-checks-split.md)
and [PLAN-declarative-automation-pilot](./PLAN-declarative-automation-pilot.md), which
changed the job shape and the trigger model after this plan's work was verified.
