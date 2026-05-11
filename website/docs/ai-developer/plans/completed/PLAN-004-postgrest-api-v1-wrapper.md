# PLAN-004 — `api_v1` wrapper layer for PostgREST

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Active — Phases 1–4 done (2026-04-29); Phases 5–7 (docs) remain

## Phase 4 outcomes (2026-04-29) — generator applied + all five gates green

`./apply-api-v1.sh` applied `api_v1_generated.sql` cleanly against UIS Postgres (port-forwarded `localhost:35432`). Re-applying is a no-op (`CREATE OR REPLACE` / `IF NOT EXISTS` / `DROP IF EXISTS` everywhere; idempotency verified by second apply succeeding silently).

### Spot-checks (psql)

- `api_v1` schema exists with **9 views** (the wrappers).
- Row counts match `marts.mart_*` exactly:
  - `indicator_summary` = 171 (matches PLAN-001 baseline)
  - `kommune_local_chapters` = 1 521
  - `ngo_index` = 11
- Column comments present on the views (`pg_catalog.pg_description` returns the dbt-manifest description for `api_v1.indicator_summary.source_id` etc.) — confirms [Q3] fallback works end-to-end.

### All five validation gates green

| # | Gate | Result |
|---|---|---|
| 1 | Drift (`check-api-v1.sh`) | ✓ regenerator output matches checked-in |
| 2 | Coverage (`check-api-v1.sh`) | ✓ 9 wrappers = 9 api/ models |
| 3a | Static description coverage (`check-api-v1.sh`) | ✓ 71 COMMENT lines = 71 described columns |
| 3b | Runtime description coverage (`dbt test api_v1_descriptions_complete`) | ✓ no NULL `obj_description` in `api_v1.*` |
| 4 | Row-count parity (`dbt test api_v1_rowcount_matches_marts`) | ✓ all 9 view pairs match |
| 5 | Idempotency (Phase 2.4 one-shot + this re-apply) | ✓ byte-identical re-generation; no-op re-apply |

### Regression sweep

- `./check-osmosis.sh --strict-only` ✓ — schema.yml hygiene from PLAN-002 unchanged
- `dbt test` full sweep — **600 PASS / 21 WARN / 0 ERROR / 621 TOTAL**. WARN count stable vs. post-PLAN-002 baseline (20 pre-existing data-quality + 1 Svalbard). PASS up by 2 due to the two new singular tests this PLAN added.

### Coordination state

UIS contributor merged the documentation in PR #129 (2026-04-28); Atlas reviewed and approved 2026-04-29 (see [`NOTE-from-atlas-postgrest-doc-approval.md`](https://github.com/helpers-no/urbalurba-infrastructure/tree/main/website/docs/ai-developer/plans/backlog/NOTE-from-atlas-postgrest-doc-approval.md) in the UIS repo). UIS PLAN-002 (PostgREST deployment) started right after; once it ships, Atlas runs `./uis configure postgrest --app atlas --schema api_v1 --url-prefix api-atlas` + `./uis deploy postgrest --app atlas` and the API is live.

## Phase 1 outcomes (2026-04-28)

All four pre-flight experiments complete. Three changed the resolution from the INVESTIGATE's pre-decisions; one stayed the same.

### [Q3] Description propagation → **comments do NOT propagate**

`psql` test (synthetic schema, table with column comments + view `SELECT *`):

```
=== view columns and their comments (NULL = no comment on view) ===
 column_name | view_comment
-------------+--------------
 id          |
 note        |
=== underlying-table comments for comparison ===
 column_name |            underlying_comment
-------------+-------------------------------------------
 id          | q3-test: id comment on underlying TABLE
 note        | q3-test: note comment on underlying TABLE
```

**Resolution**: generator emits one `COMMENT ON COLUMN api_v1.X.col IS '...'` per column, descriptions sourced from `target/manifest.json`. ~80 columns at v1 scale; scales linearly.

### [Q18] Migration-runner semantics → **state-less; same NNN re-applied every run**

Read `atlas-data/ingest/scripts/migrate.ts`. Key comment (line 4–6): *"Files must be individually idempotent — this runner does not track state (no `schema_migrations` table). Re-running applies every file again."*

**Resolution**: sunny path. Generator writes to a single `migrations/NNN_api_v1_generated.sql` file at a fixed NNN; re-runs of `npm run migrate` re-apply the same file each time. Generated SQL must be idempotent (already a requirement: `CREATE OR REPLACE VIEW`, `CREATE SCHEMA IF NOT EXISTS`, `DROP VIEW IF EXISTS`). [Q18] fallbacks (b) increment-NNN and (c) separate `psql -f` step are **not needed**.

### [Q11] UIS GRANT semantics → **`./uis configure postgrest` not yet implemented**

Read `urbalurba-infrastructure/provision-host/uis/services/integration/service-postgrest.sh` (47 lines). Line 23: `SCRIPT_PLAYBOOK=""` — intentionally empty. Comment lines 8–14: *"This file currently contains METADATA ONLY — SCRIPT_PLAYBOOK is intentionally empty so the docs page renders, but `./uis deploy` does not yet do anything. The implementation plan (PLAN-002-postgrest-implementation.md, not yet written) will add the playbook, configure handler, and Jinja templates."*

**Resolution**: guarded grants ([Q11/Q12] option (ii)) become **load-bearing, not optional**. Today's UIS Postgres has roles `postgres`, `my_app`, `backstage`, `delete_test` — no `atlas_authenticator`, no `atlas_web_anon`. Atlas's migration must apply against a database where those roles don't exist; the generator emits any GRANT statements inside `DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname='atlas_web_anon') THEN ... END IF; END $$;` so missing-role doesn't abort the migration. Once UIS implements configure later, the same migration re-runs and the grants activate. **Atlas should signal this finding to the UIS contributor** so they don't double-grant when implementing configure.

### [Q10] FK-embed via comment hints → **does NOT work for Atlas (no underlying FKs)**

Three docker-PostgREST tests against synthetic schemas:

| Setup | Result |
|---|---|
| Underlying tables WITH FK + view `@source` comment | ✓ embed works (`?select=*,kommune(*)` returns nested object) |
| Underlying tables WITHOUT FK + view `@source` comment | ✗ "Could not find a relationship" |
| Underlying tables WITHOUT FK + column `@references` hint | ✗ "Could not find a relationship" |

Atlas's reality: `marts.*` and `private_marts.*` tables have **zero Postgres FK constraints** (verified via `information_schema.table_constraints` query — 0 rows for these schemas). dbt's `relationships:` tests are SQL assertions that run during `dbt test`, not DDL — they do not create FOREIGN KEY constraints.

**Three paths to enable embeds**, none free:
1. **Add FK constraints to `marts.*`** via dbt-postgres `+constraints_enabled: true`. Significant change — affects build ordering, fail-on-violation semantics; potentially incompatible with `dim_kommune` `is_active` filter pattern. Worth a separate INVESTIGATE.
2. **Computed relationships via SQL functions** — write per-FK-per-direction SQL functions PostgREST recognises. Significant boilerplate; generator could emit but doubles complexity.
3. **Skip embeds in v1**.

**Resolution**: **(c) skip embeds in v1**. The 9 `mart_*` views were designed to be **fat rows** (mart_kommune_local_chapters carries `kommune_nr`, `ngo_orgnr`, `ngo_name`, `ngo_brand_name`, `service_category_label_no` etc. inline — no FK lookups needed). External consumers can fetch each mart_* without embeds. PLAN-001 anticipated this without realising it.

**Implications**:
- **Generator scope shrinks** from ~14 views to **9 views**. No `dim_*` wrappers needed.
- **No `@source` / `@references` view comments** in the generated SQL.
- **`api_v1` is purely the 9 wrapper views** + their column comments + (conditional) GRANT statements.
- **Future PLAN** (or PLAN-005) can add embed support if external consumer demand surfaces — by then dim_* wrappers or constraint enforcement can be evaluated independently.

### Net effect on PLAN-004 scope

The Phase 2 generator simplifies meaningfully:

- ✗ Walk `relationships:` declarations — not needed (no embeds means no FK following)
- ✗ Emit `dim_*` wrappers — not needed
- ✗ Emit `@source` / `@references` view comments — not needed
- ✓ Read `models/marts/api/` from manifest, emit one wrapper view per model
- ✓ Emit one `COMMENT ON COLUMN api_v1.X.col` per column (per [Q3])
- ✓ Emit guarded GRANT statements (per [Q11])
- ✓ Emit `DROP VIEW IF EXISTS` for removed views (per [Q17])
- ✓ Emit `NOTIFY pgrst, 'reload schema'`

Validation gates ([Q16]) stay the same. Coverage check is now purely model ↔ wrapper symmetry (no transitive dim walk).

---


**Goal**: Build the `api_v1` schema layer that the UIS-deployed PostgREST instance will project. Atlas auto-generates the wrappers (and FK-embed metadata) from `models/marts/api/` so the layer scales to hundreds of datasets without per-dataset cost. Five CI gates ensure the generator's output stays in sync with the dbt models. Once this lands, the UIS contributor can run `./uis configure postgrest --app atlas --schema api_v1 --url-prefix api-atlas` and the public API is live.

**Last Updated**: 2026-04-28

**Investigation**: [INVESTIGATE-postgrest-api-v1-wrapper.md](INVESTIGATE-postgrest-api-v1-wrapper.md) — 18 decision points, all resolved 2026-04-28.

**Prerequisites**: PLAN-001 + PLAN-002 + PLAN-003 are complete. Postgres reachable via `kubectl port-forward svc/postgresql 35432:5432` (see [contributors/setup.md § Connecting to Postgres in UIS](../../../contributors/setup.md#connecting-to-postgres-in-uis)).

---

## What this PLAN delivers

1. **Auto-generated `api_v1` schema** — one wrapper view per `models/marts/api/` model + per-`dim_*` referenced from those models (transitively, via `relationships:`). View names drop the `mart_` prefix.
2. **A Python generator** (`atlas-data/dbt/scripts/generate_api_v1.py`) reading `target/manifest.json`, emitting a single SQL artefact (`atlas-data/migrations/api_v1_generated.sql` — see [Q18] for path semantics) plus a state file (`atlas-data/dbt/api_v1_state.json`) tracking the previous-generation view list for [Q17]'s drop emission.
3. **A wrapper script** (`atlas-data/dbt/regenerate-api-v1.sh`) — mirrors `regenerate-erd.sh`'s pattern: `dbt parse` → run generator → write artefacts.
4. **Five validation gates** ([Q16]):
   - **Drift gate** (`check-api-v1.sh`) — regenerator-output diff vs checked-in artefacts
   - **Coverage** — SQL ↔ dbt-model symmetry; no orphans
   - **Description coverage 3a (static)** — count of `COMMENT ON COLUMN` lines
   - **Description coverage 3b (runtime)** — `pg_catalog.pg_description` post-migration
   - **Row-count parity** — `dbt_utils.equal_rowcount` between mart and wrapper
5. **Naming-conventions split** — `marts.mart_*` reframed as "internal", `api_v1.*` as "external public contract"; new MUST rule covering regenerator hygiene.
6. **Contributor-docs update** — new `contributors/api-v1.md`, edits to `adding-a-source.md` / `dbt-osmosis.md` / `check-osmosis.md`.

## Decisions resolved (cite INVESTIGATE)

The 12 decisions below were resolved in the INVESTIGATE; see that file for reasoning. Phase 1 verifies the experiments behind Q3 / Q10 / Q11 / Q18; the fallback resolutions only apply if those go the wrong way.

| # | Resolution |
|---|---|
| Q1 | Schema name = `api_v1` |
| Q2 | Drop `mart_` prefix (`api_v1.indicator_summary` etc.) |
| Q3 (fallback) | Emit explicit `COMMENT ON COLUMN` if comments don't propagate to views |
| Q4 | Plain SQL migration output |
| Q5 | Wrapper views (mart_* stays `TABLE`, api_v1 is `VIEW`) |
| Q6 | URL = `api-atlas.helpers.no` (UIS convention) |
| Q10 | Auto-wrap referenced `dim_*` + `@source` view comments for FK embed |
| Q11/Q12 (fallback) | Guarded grants in DO-block if UIS doesn't set `ALTER DEFAULT PRIVILEGES` |
| Q15 | Auto-generated from `models/marts/api/` |
| Q17 | `api_v1_state.json` + generator emits `DROP VIEW IF EXISTS` |
| Q18 (fallback) | Generator output outside migration runner; separate `psql -f` step |

[Q7] (api_v2 policy) deferred. [Q8 / Q9 / Q13 / Q14 / Q16] are work captured in this PLAN's phases.

---

## Phase 1 — Pre-flight experiments

**Estimate**: ~half a day. Atlas has no local PostgREST setup today; the FK-embed test needs one.

### Tasks

- [ ] 1.1 **[Q3] — Description propagation** (~10 min). With `psql` against the port-forwarded UIS Postgres:
  ```sql
  CREATE TEMP VIEW pgrst_test_view AS SELECT * FROM marts.mart_indicator_summary LIMIT 1;
  \d+ pgrst_test_view
  ```
  Verify whether the underlying `marts.mart_indicator_summary` columns' `COMMENT ON COLUMN` show on the view. Record outcome in this PLAN's Phase 1 outcome note: **propagates → generator skips per-column COMMENT emission. Doesn't propagate → generator emits one COMMENT per column.**

- [ ] 1.2 **[Q10] — FK-embed via comments** (~2 hours; includes setup). Spin up local PostgREST against the port-forwarded UIS Postgres:
  ```bash
  docker run --rm -p 3001:3000 \
    -e PGRST_DB_URI="postgres://atlas_authenticator:<pwd>@host.docker.internal:35432/<db>" \
    -e PGRST_DB_SCHEMA=api_v1 \
    -e PGRST_DB_ANON_ROLE=atlas_web_anon \
    postgrest/postgrest
  ```
  Create a test pair of wrapper views with `COMMENT ON COLUMN api_v1.X.col IS '@references api_v1.kommune'`. Hit `GET /` and verify the OpenAPI spec lists the embed. Hit `GET /X?select=*,kommune(*)` and verify the embed works. **If yes → generator emits `@source` view comments + `@references` column comments per [Q10] option (a). If PostgREST docs differ from observed behaviour → record actual syntax in PLAN outcome.**

- [ ] 1.3 **[Q11] — UIS GRANT semantics** (~30 min). Read [`urbalurba-infrastructure/scripts/configure-postgrest`](https://github.com/helpers-no/urbalurba-infrastructure) (or whatever the actual script path is — find via `grep -r "configure postgrest" urbalurba-infrastructure/`). Determine whether `ALTER DEFAULT PRIVILEGES IN SCHEMA api_v1 GRANT SELECT ON TABLES TO atlas_web_anon` is set at configure time. Record outcome. **If yes → Atlas's generator emits no GRANTs. If no → generator emits guarded grants in a DO-block ([Q11/Q12] option (ii)).**

- [ ] 1.4 **[Q18] — Migration-runner semantics** (~5 min). Modify the body of any benign existing migration (e.g. add a SQL comment to `migrations/001_*.sql`); re-run `npm run migrate`; check whether the body change re-applies. **If content-hash tracking → output single re-overwritten file at `migrations/NNN_api_v1_generated.sql`. If NNN-tracking → write generator output to `atlas-data/migrations/api_v1_generated.sql` (no NNN); apply via separate `psql -f` step in CI/deploy ([Q18] option (c)).**

- [ ] 1.5 **Record outcomes** in a "Phase 1 outcome (YYYY-MM-DD)" section at the top of this PLAN file. Each outcome determines a small generator behaviour for Phase 2.

### Validation

User reviews the four outcomes and confirms the resulting generator behaviours before Phase 2 begins.

---

## Phase 2 — Build the generator

### Tasks

- [ ] 2.1 **`atlas-data/dbt/scripts/generate_api_v1.py`** — Python script:
  - Reads `target/manifest.json` (regenerated by `dbt parse`).
  - Walks every model where `path` starts with `models/marts/api/`. These produce `api_v1.<name_without_mart_prefix>` wrapper views.
  - Walks each api/ model's `relationships:` declarations (transitively); emits `api_v1.<dim_name_without_dim_prefix>` wrappers for every referenced `dim_*`.
  - Reads `atlas-data/dbt/api_v1_state.json` (previous generation's view list); emits `DROP VIEW IF EXISTS api_v1.X CASCADE` for every view in state-but-not-in-current-set.
  - Emits `CREATE SCHEMA IF NOT EXISTS api_v1;`.
  - Emits per-view `CREATE OR REPLACE VIEW api_v1.X AS SELECT * FROM marts.<source>;`.
  - For each api_v1 view, emits `COMMENT ON VIEW api_v1.X IS '@source marts.<source>'` (per [Q10] outcome).
  - For each FK column, emits `COMMENT ON COLUMN api_v1.X.col IS '@references api_v1.Y'`.
  - Per-column `COMMENT ON COLUMN` only if [Q3] outcome requires it.
  - Permission grants per [Q11/Q12] outcome (skip if UIS owns; emit guarded if Atlas owns).
  - Emits `NOTIFY pgrst, 'reload schema';` at the end.
  - Writes new `api_v1_state.json` containing the new view list.

- [ ] 2.2 **`atlas-data/dbt/scripts/tests/test_generate_api_v1.py`** — pytest fixtures with synthetic manifests covering:
  - Happy path: 2 api/ models + 1 dim_* reference → expected output.
  - Empty `models/marts/api/` → migration with just `CREATE SCHEMA IF NOT EXISTS`.
  - Removed view (in state JSON, not in manifest) → emits `DROP VIEW IF EXISTS` for it.
  - dim_* shared by two api/ models → wrapped once, no duplicate.
  - Transitive dim_* (api/ → dim_chapter → dim_kommune) → both wrapped.
  - Deprecated tag (`meta: { deprecated_until: '...' }` in schema.yml) → wrapper preserved + view comment indicates deprecation.

- [ ] 2.3 **`atlas-data/dbt/regenerate-api-v1.sh`** — shell wrapper (mirror of `regenerate-erd.sh`):
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  cd "$(dirname "$0")"
  uv run --env-file ../ingest/.env dbt parse
  uv run python scripts/generate_api_v1.py \
    --manifest target/manifest.json \
    --models-dir models/marts/api \
    --state api_v1_state.json \
    --out ../migrations/api_v1_generated.sql  # path per Phase 1.4 outcome
  ```

- [ ] 2.4 **Idempotency one-shot test**: run `regenerate-api-v1.sh` twice; `diff` the two outputs (SQL + state JSON); expect identical.

### Validation

`pytest atlas-data/dbt/scripts/tests/` passes. `regenerate-api-v1.sh` produces deterministic output across two runs.

---

## Phase 3 — Build the validation gates

### Tasks

- [ ] 3.1 **`atlas-data/dbt/check-api-v1.sh`** (mirror of `check-osmosis.sh`):
  - Runs `regenerate-api-v1.sh` to a temp directory.
  - `diff` against checked-in `migrations/api_v1_generated.sql` and `dbt/api_v1_state.json` — non-zero exit if any drift.
  - Coverage cross-check: every model in `models/marts/api/` has a `CREATE OR REPLACE VIEW api_v1.<name>` line in the generated SQL; conversely, every `CREATE OR REPLACE VIEW api_v1.X` maps to either a `models/marts/api/` model or a referenced dim_*.
  - Static description coverage (only relevant if [Q3] outcome required explicit comments): count `COMMENT ON COLUMN api_v1\.` lines; compare to expected count from manifest.

- [ ] 3.2 **Runtime description coverage** — write a small `dbt_utils`/SQL test that queries `pg_catalog.pg_description` for every column in `api_v1.*` and asserts no NULL `obj_description`. Lives in `atlas-data/dbt/tests/api_v1_descriptions_complete.sql` (singular dbt test).

- [ ] 3.3 **Row-count parity** — for each api_v1 wrapper, add a `dbt_utils.equal_rowcount` test in a new `atlas-data/dbt/models/api_v1/schema.yml` (manually written; tests the generator-produced views indirectly via dbt's source declarations). Or, simpler: a single SQL test that joins `pg_views` against expected pairs and asserts equal counts via UNION ALL.

- [ ] 3.4 Confirm **idempotency** is covered by the one-shot test in Phase 2.4 — no separate gate needed.

### Validation

All five gates green against the Phase 4 generated artefacts. Each gate has a clear fail-message pointing at the fix.

---

## Phase 4 — Initial generation + Atlas-side verification

### Tasks

- [ ] 4.1 **First regenerate**: `cd atlas-data/dbt && ./regenerate-api-v1.sh`. Inspect the diff:
  - Schema creation present
  - 9 wrapper views (one per current `models/marts/api/` model)
  - ~3–5 `dim_*` wrappers (per relationships walk)
  - `NOTIFY pgrst` at end
  - State JSON populated

- [ ] 4.2 **Apply migration**: `cd atlas-data/ingest && npm run migrate` (or `psql -f` per [Q18] fallback). Expect clean apply.

- [ ] 4.3 **Idempotency**: re-run apply; expect no-op (same state). Re-run regenerator; diff output against checked-in; expect identical.

- [ ] 4.4 **Atlas-side validation** (the five gates):
  - `./check-api-v1.sh` — drift + coverage + static description ✓
  - `./check-osmosis.sh` — strict ✓ (regression check; api_v1 work shouldn't have touched marts schema.yml)
  - Runtime description coverage test passes
  - Row-count parity test passes for all 9 mart pairs

- [ ] 4.5 **Spot-check the API surface** (read-only via psql, no PostgREST yet):
  - `\dv api_v1.*` lists all expected wrappers
  - `SELECT count(*) FROM api_v1.indicator_summary` matches `marts.mart_indicator_summary`
  - `SELECT obj_description('api_v1.indicator_summary'::regclass)` returns the `@source marts.mart_indicator_summary` comment

### Validation

All five validation gates green; spot-checks confirm the schema matches what PostgREST will project.

---

## Phase 5 — Naming-conventions update

### Tasks

- [ ] 5.1 Edit `docs/stack/naming-conventions.md`:
  - Locate the section that treats `marts.mart_<feature>` as "the public OpenAPI surface" (per PLAN-001).
  - Split into two layers:
    - `marts.mart_<feature>` = "internal API-shaped views" (Atlas's frontend dogfood; not the external contract).
    - `api_v1.<feature>` = "external public contract" (PostgREST projects this as OpenAPI; versioned).
  - Add MUST rule (after rule #8): **"every PR that adds, removes, or changes a `marts.mart_*` view in `models/marts/api/` MUST re-run `regenerate-api-v1.sh` and commit the updated artefacts (`migrations/api_v1_generated.sql` + `dbt/api_v1_state.json`). The drift gate (`check-api-v1.sh`) enforces this."**

### Validation

Naming-conventions changes diff cleanly; no broken cross-references.

---

## Phase 6 — Contributor docs update

### Tasks

- [ ] 6.1 **New page** `website/docs/contributors/api-v1.md`:
  - What `api_v1` is (the public API contract; PostgREST projects it).
  - How it's generated (auto from `models/marts/api/`; never hand-edited).
  - Day-to-day commands (`regenerate-api-v1.sh`, `check-api-v1.sh`).
  - Two-phase deprecation workflow ([Q14] + [Q17]) — deprecate via `meta: { deprecated_until: ... }`, then remove the model and regenerate.
  - The five validation gates (link to [check-osmosis.md](../../../contributors/check-osmosis.md) for the pattern).
  - FK embed access pattern with curl examples (post-UIS-deploy).
  - Cross-reference [INVESTIGATE](./INVESTIGATE-postgrest-api-v1-wrapper.md) for design rationale.

- [ ] 6.2 **Update `adding-a-source.md`**:
  - Step 9 ("dbt schema.yml entry") gains a sub-step: "after the dbt model lands, run `./regenerate-api-v1.sh` and commit the regenerated artefacts."
  - New section: "Workflow: deprecate then remove a `mart_*` view" covering the two-phase flow.

- [ ] 6.3 **Update `dbt-osmosis.md`** — clarify the layer split: `check-osmosis.sh` covers schema.yml hygiene on `marts.*`; `check-api-v1.sh` covers generator-output integrity for `api_v1.*`.

- [ ] 6.4 **Update `check-osmosis.md`** — same clarification, plus a "see also: check-api-v1.md" cross-reference.

- [ ] 6.5 **Update `index.md`** — add api_v1 page to the where-things-live table; mention in the conventions section.

### Validation

A fresh contributor reading `api-v1.md` end-to-end can: regenerate after a model change, interpret a drift-gate failure, deprecate then remove a view. Cold-read pass.

---

## Phase 7 — Rollback runbook

### Tasks

- [ ] 7.1 Add a `## Rollback` section near the top of `migrations/api_v1_generated.sql` as a SQL comment block. Contents:
  - Safe rollback (re-apply previous generation): regenerate from main, apply.
  - Destructive rollback: `DROP SCHEMA api_v1 CASCADE` — but only after UIS-side undeploy + purge (`./uis undeploy postgrest --app atlas` + `./uis configure postgrest --app atlas --purge`).
  - Order: undeploy + purge UIS first, then drop on Atlas side. Re-applying Atlas's migration after restore brings api_v1 back.

- [ ] 7.2 Cross-link from `contributors/api-v1.md` to the rollback comment.

### Validation

Rollback steps documented in two places (the migration file + the contributor page); steps are unambiguous about ordering.

---

## Acceptance Criteria

- [ ] `atlas-data/dbt/scripts/generate_api_v1.py` exists with passing pytest unit tests.
- [ ] `atlas-data/dbt/regenerate-api-v1.sh` produces deterministic output across two runs.
- [ ] `atlas-data/dbt/check-api-v1.sh` exists and exits 0 against current main.
- [ ] `atlas-data/migrations/api_v1_generated.sql` (or path per Phase 1.4) is checked in and applies idempotently.
- [ ] `atlas-data/dbt/api_v1_state.json` is checked in.
- [ ] `api_v1` schema exists in Postgres with 9 mart wrappers + ~3–5 dim wrappers.
- [ ] All five validation gates green.
- [ ] `docs/stack/naming-conventions.md` rule added.
- [ ] `website/docs/contributors/api-v1.md` exists; sibling pages updated.
- [ ] `dbt build` clean; `check-osmosis.sh` strict ✓; `check-api-v1.sh` ✓.
- [ ] PostgREST not yet deployed — that's the future PLAN-D.2 / coordination-with-UIS task.

---

## Files to Modify

### Phase 1 (pre-flight)
- This PLAN file (Phase 1 outcome notes).

### Phase 2 (generator)
- `atlas-data/dbt/scripts/generate_api_v1.py` (new)
- `atlas-data/dbt/scripts/tests/test_generate_api_v1.py` (new)
- `atlas-data/dbt/regenerate-api-v1.sh` (new, executable)
- `atlas-data/dbt/requirements.txt` (add pytest if not already)

### Phase 3 (validations)
- `atlas-data/dbt/check-api-v1.sh` (new, executable)
- `atlas-data/dbt/tests/api_v1_descriptions_complete.sql` (new — singular dbt test)
- `atlas-data/dbt/models/api_v1/schema.yml` (new — `dbt_utils.equal_rowcount` tests; minimal)

### Phase 4 (initial generation)
- `atlas-data/migrations/api_v1_generated.sql` (new — generated, do not hand-edit)
- `atlas-data/dbt/api_v1_state.json` (new — generated)

### Phase 5 (naming-conventions)
- `docs/stack/naming-conventions.md` (rule + section split)

### Phase 6 (contributor docs)
- `website/docs/contributors/api-v1.md` (new)
- `website/docs/contributors/adding-a-source.md` (regenerate step + deprecation subsection)
- `website/docs/contributors/dbt-osmosis.md` (layer-split clarification)
- `website/docs/contributors/check-osmosis.md` (layer-split clarification + see-also)
- `website/docs/contributors/index.md` (add api_v1 to where-things-live table)

### Phase 7 (rollback)
- `atlas-data/migrations/api_v1_generated.sql` (rollback comment block — generated by Phase 2's generator, so the comment template lives in the generator script)

---

## Files NOT modified

- **Atlas frontend** — stays on inline SQL against `marts.*` until PLAN-E (frontend migration to PostgREST). `api_v1` is purely external-facing in v1.
- **Anything UIS-side** — Atlas's responsibility ends at "the `api_v1` schema exists with the agreed views and descriptions." UIS configures + deploys PostgREST.
- **`marts.mart_*` views or `models/marts/api/` SQL** — the generator wraps what's there; no changes to the underlying mart layer.
- **`check-osmosis.sh`** — keeps its existing scope (schema.yml hygiene). `api_v1` integrity is a sibling tool.
- **PostgREST or Swagger UI deployment** — PLAN-D.2 / future PLAN-F.

---

## What's next after this PLAN

- **PLAN-D.2 / coordination with UIS contributor** — once PLAN-004 is merged, signal to the UIS contributor that `api_v1` exists. They run `./uis configure postgrest --app atlas --schema api_v1 --url-prefix api-atlas` + `./uis deploy postgrest --app atlas`. End-to-end verification: `curl http://api-atlas.localhost/` returns the OpenAPI spec; sample queries return rows; FK embeds work if [Q10] resolved (a).
- **PLAN-E** — migrate Atlas's frontend from direct `marts.*` SQL to PostgREST against `api_v1.*`. Dogfood loop closes.
- **PLAN-F** — render the OpenAPI spec as a human-readable Swagger UI / Redoc page at `api-atlas.helpers.no/docs`.

---

## Cross-references

- [INVESTIGATE-postgrest-api-v1-wrapper.md](INVESTIGATE-postgrest-api-v1-wrapper.md) — design rationale + decision audit trail
- [`urbalurba-infrastructure/website/docs/services/integration/postgrest.md`](https://github.com/helpers-no/urbalurba-infrastructure/tree/main/website/docs/services/integration/postgrest.md) — UIS PostgREST design doc; this PLAN's output is what UIS expects
- [PLAN-001-api-mart-views.md](../completed/PLAN-001-api-mart-views.md) — built the 9 `marts.mart_*` views the wrappers project
- [PLAN-002-fill-schema-yml-description-gaps.md](../completed/PLAN-002-fill-schema-yml-description-gaps.md) — closed the description backlog so OpenAPI projection is informative
- [PLAN-003-contributor-docs-consolidation.md](../completed/PLAN-003-contributor-docs-consolidation.md) — established the contributor-docs pattern this PLAN extends with `api-v1.md`
- [`atlas-data/dbt/regenerate-erd.sh`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/regenerate-erd.sh) — the generator pattern this PLAN mirrors
- [`atlas-data/dbt/check-osmosis.sh`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/check-osmosis.sh) — the gate pattern `check-api-v1.sh` mirrors
- [PostgREST embed-via-comment docs](https://docs.postgrest.org/en/v12/references/api/resource_embedding.html) — for [Q10]'s `@source` and `@references` syntax
