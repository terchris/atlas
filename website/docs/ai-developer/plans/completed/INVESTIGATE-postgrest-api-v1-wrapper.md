# Investigate: `api_v1` schema layer for PostgREST — separating internal marts from public contract

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Complete — 2026-04-29 (implemented in PLAN-004)

PLAN-004 implementation landed across 6 commits on `feature/plan-004-api-v1-wrapper`. Phase 1 verified the four experiment-driven outcomes ([Q3], [Q10], [Q11], [Q18]) — three changed the pre-decisions:

- **[Q3]**: comments do NOT propagate to wrapper views; generator emits explicit `COMMENT ON COLUMN api_v1.X.col` per column.
- **[Q10]**: marts.* has no FK constraints; PostgREST `@source` / `@references` hints don't synthesise FK metadata; resolved as **(c) skip embeds in v1** (was pre-decided as (a) wrap dim_*). Generator scope shrank from ~14 wrappers to 9.
- **[Q11]**: `./uis configure postgrest` not yet implemented; guarded grants load-bearing.
- **[Q18]**: stayed at sunny path (state-less migration runner re-applies idempotent SQL on every run).

See [PLAN-004 Phase 1 outcomes](PLAN-004-postgrest-api-v1-wrapper.md) for the full experiment log. Original status header preserved below for the architectural-decision audit trail.

## Status (original): Resolved — ready to draft PLAN-004 (2026-04-28)

**Goal**: Decide how Atlas exposes its dbt-built marts to the UIS-deployed PostgREST instance: should the public API contract live in `marts.mart_*` directly (PLAN-001's assumption), or should Atlas add an `api_v1` schema layer with thin wrapper views — matching the convention UIS has now documented and giving Atlas a real internal/external boundary it currently lacks. This INVESTIGATE makes the architectural argument and surfaces the small open questions before a follow-up PLAN does the work.

## Decisions resolved (2026-04-28)

All direct decisions and fallback pre-decisions settled. Detailed reasoning preserved below for audit.

| # | Decision | Resolution |
|---|---|---|
| Q1 | Schema name | `api_v1` |
| Q2 | View-name prefix | drop `mart_` (e.g. `api_v1.indicator_summary`) |
| Q3 (fallback) | If column comments don't propagate to views | emit explicit `COMMENT ON COLUMN` per column |
| Q4 | Generator output format | (a) plain SQL migration at `migrations/NNN_api_v1_generated.sql` |
| Q5 | Materialisation | (a) wrapper views; `marts.mart_*` stays as `TABLE`, `api_v1.*` is `VIEW` |
| Q6 | Public URL | `api-atlas.helpers.no` (UIS subdomain-by-app convention) |
| Q7 | Versioning policy (`api_v2` triggers) | deferred — no decision today |
| Q10 | FK-embed support | (a) auto-wrap referenced `dim_*` + `@source` view comments |
| Q11/Q12 (fallback) | If UIS doesn't set `ALTER DEFAULT PRIVILEGES` | (ii) emit guarded grants in DO-block |
| Q15 | Wrapper-layer generation | (b) auto-generated from `models/marts/api/` |
| Q17 | Drop strategy for removed views | (a) checked-in `api_v1_state.json` + generator emits `DROP VIEW IF EXISTS` |
| Q18 (fallback) | If migration runner tracks by NNN (silently skips content changes) | (c) put generator output outside the migration runner; separate `psql -f` step |

Phase 1 of PLAN-004 still runs the experiments behind Q3 / Q10 / Q11 / Q18 — the fallback resolutions above only apply if those experiments go the wrong way.

[Q8], [Q9], [Q13], [Q14], [Q16] are not "decisions" — they're work captured in PLAN-004's phases.

**Last Updated**: 2026-04-28

**Origin**: A UIS contributor published [`urbalurba-infrastructure/website/docs/services/integration/postgrest.md`](../../../../../../urbalurba-infrastructure/website/docs/services/integration/postgrest.md) describing how UIS deploys PostgREST per consuming app. Their docs assume each app provides an `api_v1` schema of curated views (e.g. `api_v1.kommune`, `api_v1.ngo`); UIS then runs `./uis configure postgrest --app atlas --schema api_v1` to wire up roles + Kubernetes objects.

Atlas's PLAN-001 built 9 `marts.mart_<feature>` views as tables. Comparing the two: PLAN-001 quietly conflated two layers that UIS's design correctly separates — the **dbt deliverable** (`marts.*`, also read by Atlas's frontend today) and the **public API contract** (which UIS expects in `api_v1`). Atlas needs to clarify the boundary regardless of UIS's expectations; UIS just made the gap visible.

---

## The architectural argument

PLAN-001's "marts is the public surface" framing was load-bearing when it shipped (PostgREST wasn't deployed). Once UIS goes live, three things change:

1. **The same view becomes both internal and external.** Atlas's frontend reads `marts.mart_*` directly today (will keep doing so until PLAN-E migrates it to PostgREST). External consumers will hit the same data via PostgREST. Without a separator, refactoring a `mart_*` column means changing both contracts in lockstep.
2. **Versioning has nowhere to live.** Today there is no Atlas `v1` vs `v2` of anything — every consumer reads the latest `marts.*`. UIS's `api_v1` naming explicitly anticipates `api_v2` coexisting later (as a separate schema) when a breaking change lands. Atlas can't get there from `marts.mart_*`.
3. **Multi-app coherence.** UIS deploys one PostgREST per consuming app: `atlas`, eventually `customers`, etc. If Atlas pushes UIS to accept arbitrary schema names, every future app debates the question. If Atlas accepts `api_v1`, the convention is set once: every UIS-deployed app has an internal data layer AND an `api_v1.*` curated layer.

The cost asymmetry favours Atlas-side work: a generator + validations + ~half a day of work that scales to hundreds of datasets without per-dataset cost (see [Q15] / [Q16]). The alternative — pushing UIS to support arbitrary schema names — touches their tool, their docs, their multi-app story.

**Conclusion (recommendation)**: Atlas adds the `api_v1` layer. Not because UIS asked, but because the boundary is real and Atlas was previously eliding it. UIS's design crystallises a separation Atlas needed anyway.

---

## What the wrapper layer looks like

This is **the generator's output**, not hand-written SQL — see [Q15] for the auto-generation decision and [Q16] for the validation gates that keep it in sync. The generator reads `target/manifest.json` and emits a single migration file:

```sql
-- atlas-data/migrations/NNN_api_v1_generated.sql (auto-generated; do not hand-edit)
CREATE SCHEMA IF NOT EXISTS api_v1;

-- Optionally: DROP VIEW IF EXISTS api_v1.<removed>; for views removed
-- since the last generation — see [Q17].

CREATE OR REPLACE VIEW api_v1.indicator_summary
  AS SELECT * FROM marts.mart_indicator_summary;

CREATE OR REPLACE VIEW api_v1.coverage_gap_barnefattigdom
  AS SELECT * FROM marts.mart_coverage_gap_barnefattigdom;

-- … one per model in models/marts/api/ + dim_* wrappers per [Q10]

NOTIFY pgrst, 'reload schema';
```

The `marts.mart_*` tables stay as Postgres `TABLE`s (PLAN-001 [Q3] — fast reads). Wrapper views are nearly free; PostgREST queries them and the planner pushes through to the underlying tables. The wrappers exist to:

- Project a **stable public name** (`api_v1.indicator_summary`) that doesn't change when internal `mart_*` columns evolve.
- Provide the **versioning anchor** (`api_v1` vs future `api_v2`).
- **Hide internal-only columns** if any ever appear in `mart_*` that we don't want public (today: none).
- **Anchor FK-embed comments** ([Q10]) for PostgREST's resource-embedding feature.

---

## Decisions to resolve

- **[Q1] Schema name.** Match UIS's documented expectation: **`api_v1`**. Alternatives (`public_api`, `atlas_api`, `marts_api`) fight the convention UIS has set; not worth it. **Recommendation: `api_v1`. Resolution-ready.**

- **[Q2] View-name prefix.** Inside `marts.*`, the `mart_` prefix usefully distinguishes from `dim_` / `fact_` / `indicators__`. Inside `api_v1.*`, every view is API; the prefix is noise. UIS's example (`api_v1.kommune`, `api_v1.ngo`) is unprefixed. **Recommendation: drop `mart_` in `api_v1` — `api_v1.indicator_summary`, `api_v1.coverage_gap_barnefattigdom`, etc. Resolution-ready.**

- **[Q3] Description propagation.** dbt writes column descriptions to Postgres as `COMMENT ON COLUMN marts.mart_X.col IS '...'`. Whether those comments auto-propagate to a view (`api_v1.X`) defined as `SELECT * FROM marts.mart_X` is a Postgres detail that needs a 5-minute test. Two outcomes:
  - **(a) Comments propagate** → wrapper migration is purely the `CREATE VIEW` statements; descriptions reach PostgREST's OpenAPI for free.
  - **(b) Comments don't propagate** → migration must repeat `COMMENT ON COLUMN api_v1.X.col IS '...';` for every column. Mechanical (~80 columns total across 9 views), but worth knowing before the PLAN drafts the migration.

  **Action**: experiment first; the answer changes what the generator ([Q15]) emits — either pure `CREATE VIEW` lines, or those plus a `COMMENT ON COLUMN` per column (~80 columns total at v1 scale; scales linearly with new datasets). Open the test in PLAN-004's first task. Atlas can't postpone — without comments, the OpenAPI spec is uninformative.

- **[Q4] Where the generator's output lands.** With auto-generation ([Q15]) the question shifts: in what format does the generator emit its output? Two options:
  - **(a) Plain SQL migration** at `atlas-data/migrations/NNN_api_v1_generated.sql`, applied via `npm run migrate`. Generator is one Python script → one SQL file. Tests added separately (count parity / description coverage / etc. per [Q16]).
  - **(b) Generated dbt models** at `atlas-data/dbt/models/marts/api_v1/*.sql` + paired `schema.yml`. Wrappers participate in dbt's lineage + tests + osmosis machinery. Generator emits both SQL and YAML.

  Trade-off: (a) is simpler — one Python file produces one SQL file; the generator is mechanical (`SELECT *` only) so nothing in dbt's lineage is gained by routing through it. (b) gives "free" dbt tests but the generator now has to emit YAML on top of SQL, doubling complexity. **Recommendation: (a).** Generator emits a single SQL migration; validations live in `check-api-v1.sh` and `dbt_utils` tests added by hand to a small `models/api_v1/schema.yml` (or skipped if [Q16] gates are sufficient). **Resolution-ready.**

- **[Q5] Materialisation strategy.** Three sub-options:
  - **(a) Wrapper views** (recommended). `mart_*` stays as `TABLE`, `api_v1.*` is a view. Cheap, decoupled, versionable.
  - **(b) Materialise `api_v1.*` as tables too** — duplicate storage, faster reads, but breaks the "internal vs public" decoupling (every refactor of `mart_*` requires a rebuild of `api_v1.*`).
  - **(c) Drop the `marts/api/` layer; dbt materialises directly into `api_v1`** — eliminates the wrapper indirection but conflates the boundary again.

  **Recommendation: (a) wrapper views.** The performance argument for (b) doesn't hold — view-over-table is a cheap planner pass-through, and Atlas's row counts are O(10⁴–10⁵). Resolution-ready.

- **[Q6] Public URL convention.** UIS uses `api-<app>.<domain>` (subdomain-by-app). Atlas's earlier INVESTIGATE-public-api-surface.md assumed `api.atlas.helpers.no/docs`. UIS's pattern means Atlas's prod URL becomes `api-atlas.helpers.no` (or equivalent in whatever Cloudflare zone hosts it).
  - **Recommendation: follow UIS's convention** (`api-atlas.<domain>`) — stack consistency over per-app preference. The cost of breaking from UIS's pattern (custom Traefik / Cloudflare config per app) outweighs the cosmetic gain. **Resolution-ready.**

- **[Q7] Versioning policy — when does `api_v2` happen?** Don't need to answer in this INVESTIGATE; flag for future thought. Triggering events: a `mart_*` column rename / type change / removal that breaks an external consumer; a structural shift (e.g. splitting one view into two). The `api_v1` naming gives Atlas the affordance; the policy comes when there's a real second version to plan.

- **[Q8] Naming-conventions update.** Atlas's [`docs/stack/naming-conventions.md`](../../../../../docs/stack/naming-conventions.md) currently treats `marts.mart_<feature>` as "the public OpenAPI surface PostgREST projects" (per PLAN-001). With `api_v1` landing, that text needs splitting:
  - `marts.mart_<feature>` = "internal API-shaped views" (consumed by Atlas's frontend dogfood; not the external contract)
  - `api_v1.<feature>` = "external public contract" (the OpenAPI surface PostgREST projects; versioned)

  New MUST rule (mirror of rule #8): **"every PR that adds, removes, or changes a `marts.mart_*` view in `models/marts/api/` MUST re-run `regenerate-api-v1.sh` and commit the updated migration."** The drift gate ([Q16] #1) enforces this — a stale generated file fails CI. **Captured here; PLAN-004 makes the edit.**

- **[Q9] Contributor docs update.** Today [`adding-a-source.md`](../../../../contributors/adding-a-source.md), [`dbt-osmosis.md`](../../../../contributors/dbt-osmosis.md) and [`check-osmosis.md`](../../../../contributors/check-osmosis.md) reference PostgREST's OpenAPI tie-in but assume `marts.*` IS the projected surface. Once `api_v1` lands, these need a small update — most importantly, the "add a new mart" workflow gets one more step: **after the dbt model is in `models/marts/api/`, run `./regenerate-api-v1.sh` and commit the regenerated migration**. The generator emits the `NOTIFY pgrst, 'reload schema'` at the end of the file, so contributors don't run it manually. **Captured; PLAN-004 does the edit.** [Q14] below covers the *removal* / deprecation flow that's also missing.

- **[Q10] Foreign-key embed via wrapper views — the biggest design impact.** UIS's worked example shows `?select=*,kommune(*)` (embedded resource). PostgREST infers embeddable relationships from `pg_constraint` (foreign-key constraints on tables). **Views don't carry FK metadata.** A wrapper view `api_v1.kommune_local_chapters` exposes `kommune_nr` as a column but PostgREST won't suggest `kommune` as an embeddable relation — even though the underlying `marts.dim_kommune` has the FK. Three workarounds (per PostgREST docs):
  - **(a) Add `api_v1` wrappers for `dim_*` tables that participate in FK relationships referenced by api/ models.** The set is **derived, not hand-picked**: the generator ([Q15]) walks each api/ model's `relationships:` declarations in schema.yml and emits a wrapper for every `dim_*` referenced (transitively — a wrapped `dim_*` may itself reference another `dim_*`, which also gets wrapped). At v1 scale that's roughly `api_v1.kommune`, `api_v1.fylke`, `api_v1.ngo`, `api_v1.activity`, `api_v1.chapter`. The generator uses `COMMENT ON VIEW ... IS '@source <underlying-table>'` to teach PostgREST the embed lineage.
  - **(b) `COMMENT ON COLUMN api_v1.kommune_local_chapters.kommune_nr IS '@references api_v1.kommune'`** — explicit embed hint, view-only.
  - **(c) Skip embedded resources in v1.** Consumers do two queries instead of one. Simplest; loses the killer-feature UIS's example highlighted.

  **Action**: pick before drafting PLAN-004. Affects whether the migration is 9 views or ~14. **Recommendation lean: (a) — the dim_* wrappers are tiny, and embeds are the access pattern PostgREST is being chosen for.** Verify the `@source` comment shape works in the [Q3] experiment.

- **[Q11] Permission inheritance for views added *after* `./uis configure`.** UIS's `./uis configure postgrest --app atlas` grants `SELECT ON SCHEMA api_v1` to `atlas_web_anon`. But Postgres does **not** auto-grant on objects created *after* the GRANT, unless `ALTER DEFAULT PRIVILEGES` was set when the schema was created. So a future `CREATE VIEW api_v1.new_thing` after configure-time may be invisible to anonymous requests until a reviewer re-grants.

  Two outcomes:
  - **(a) UIS's configure script already sets `ALTER DEFAULT PRIVILEGES IN SCHEMA api_v1 GRANT SELECT ON TABLES TO atlas_web_anon`** → Atlas does nothing.
  - **(b) UIS's script grants on existing objects only** → Atlas's migration owns `ALTER DEFAULT PRIVILEGES IN SCHEMA api_v1 GRANT SELECT ON TABLES TO atlas_web_anon` (the per-app anon role created by UIS — **not** `PUBLIC`, which would grant to every Postgres role including superuser).

  **Action**: verify which by reading UIS's `./uis configure postgrest` source (or asking the contributor). The fix in (b) is a one-liner; the failure mode in (b) without the fix is silent — anon requests get 401 / empty result on new views, with no obvious cause. Worth getting right.

  **Coupled with [Q12]**: if Atlas's generator emits `GRANT … TO atlas_web_anon`, the migration **fails to apply** in any environment where UIS hasn't yet run `./uis configure postgrest` (the role doesn't exist). Three ways out:
  - **(i) Strict ordering**: UIS configure MUST run before any Atlas migration that grants. Documented as a hard requirement; fresh dev environments without UIS can't apply the migration. Most operationally fragile.
  - **(ii) Guarded grants**: Generator emits grants inside a `DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname='atlas_web_anon') THEN … END IF; END $$;` block. Migration applies cleanly with or without the role; UIS configure (or a re-run of the migration after configure) activates the grants. Most ergonomic.
  - **(iii) Atlas owns no grants**: [Q11] resolves to (a) — UIS's configure script handles all grants via `ALTER DEFAULT PRIVILEGES`. Atlas's generator never emits GRANT statements. Cleanest separation of concerns; depends on [Q11] resolving to (a).
  - **Recommendation lean: (iii) if [Q11](a), (ii) if [Q11](b).** Avoid (i) — it makes Atlas's migrations non-portable.

- **[Q12] Order of operations between Atlas migration and UIS deploy.** UIS's `./uis deploy postgrest --app atlas` happens against an existing database. Three orderings to consider:
  - **First-time deploy**: Atlas migration runs → `api_v1` schema exists with views → UIS deploys → PostgREST starts up with populated schema cache. ✓ clean path.
  - **PostgREST deployed before schema exists**: PostgREST starts, schema cache is empty, all requests return 404. Recovers when Atlas runs migration + `NOTIFY pgrst, 'reload schema'`. Survivable; loud failure mode.
  - **CI / production redeploy with schema drift**: Atlas adds a view, deploy pipeline runs migration but doesn't notify pgrst. Existing PostgREST pods serve stale schema until restart. **This is the real failure mode in production** — not catastrophic, but worth documenting.

  **Recommendation**: PLAN-004 includes a documented step "after `npm run migrate`, run `psql ... -c \"NOTIFY pgrst, 'reload schema';\"`" in the contributor + ops workflow. Or — simpler — wire the notify into the migration file itself so it's automatic.

  **Role-existence ordering** (separate from schema/PostgREST ordering): if Atlas's migration grants to `atlas_web_anon`, that role must exist when migration applies. See [Q11] "Coupled with [Q12]" — the resolution there determines whether ordering matters.

- **[Q13] Atlas-side rollback story.** If something breaks, the rollback is `DROP SCHEMA api_v1 CASCADE` (destructive — drops all wrappers). Migration is idempotent (`CREATE OR REPLACE VIEW`) so re-runs are safe. The destructive rollback also has a UIS counterpart: `./uis configure postgrest --app atlas --purge` removes the role pair + Secret. The two must be ordered correctly: undeploy + purge UIS first (so PostgREST stops trying to read the schema), then drop on Atlas side. **Captured; PLAN-004 documents this in the README of the migration file or a runbook page.**

- **[Q14] Mart removal / deprecation workflow.** [Q9] covers the *adding* side. Removal is a **two-phase** process; the phases are distinct and shouldn't be collapsed:

  **Phase A — Deprecate (signal, but keep serving traffic).** The wrapper still exists; consumers can still query it. The generator emits a `COMMENT ON VIEW api_v1.X IS '@deprecated until YYYY-MM-DD: <reason>'` (or equivalent — verify what PostgREST surfaces in OpenAPI's `description` / `deprecated` field). Triggered by tagging the dbt model: e.g. an entry in `models/marts/api/schema.yml` like `meta: { deprecated_until: 'YYYY-MM-DD', deprecated_reason: '...' }` that the generator reads. The OpenAPI spec gains the deprecation flag; downstream tooling (Swagger UI, generated clients) renders it. Grace period at least one consumer-notice cycle.

  **Phase B — Remove (after grace period, no traffic).** Remove the dbt model from `models/marts/api/`, regenerate. [Q17]'s drop-list emits `DROP VIEW IF EXISTS api_v1.X CASCADE`. After traffic has been zero for the grace window, drop the underlying `marts.mart_<feature>` in a separate dbt-model-removal PR.

  Both phases land via `regenerate-api-v1.sh` — the diff in the generated file IS the workflow audit trail. Contributor docs (`adding-a-source.md` § "modify an existing source") gains a "Workflow: deprecate then remove a mart_* view" subsection covering both phases.

- **[Q15] Wrapper-layer generation: hand-written or auto-generated?** Atlas projects hundreds of datasets in the future. Hand-writing a wrapper SQL file per dataset is tolerable at 9 and a maintenance pit at 500 — drift is inevitable, contributors forget the wrapper step, two PRs collide on the same migration file.
  - **(a) Hand-written.** One SQL file per wrapper, contributor adds it alongside the dbt model. Simple at small scale; scales linearly with cost.
  - **(b) Auto-generated from `models/marts/api/`.** A small script reads `target/manifest.json` after `dbt parse`/`dbt build`, walks every model under `models/marts/api/`, and emits a single migration file with all wrapper views (plus FK-comment hints per [Q10] + permission grants per [Q11] if Atlas owns them). Output is checked into the repo so `npm run migrate` works without re-running the generator. New dataset = new dbt model + re-run generator + commit; reviewer-friendly diff.
  - **Resolution: (b). PLAN-004 builds the generator as a phase.** Investment is ~1 day; ongoing per-dataset cost goes to ~zero. The "MUST add wrapper in same PR" rule from [Q8] is replaced by "MUST re-run the generator in same PR" — same idea, mechanical.

  Implementation notes:
  - Lives next to [`atlas-data/dbt/regenerate-erd.sh`](../../../../../atlas-data/dbt/regenerate-erd.sh) (similar pattern: read manifest, emit artefact). Likely Python (the manifest is JSON; Python is already used by dbt).
  - Output path: `atlas-data/migrations/NNN_api_v1_generated.sql`. NNN is whatever number was free at first land; subsequent re-generations overwrite this same file. The body uses `CREATE OR REPLACE VIEW` for additions/changes and `DROP VIEW IF EXISTS … CASCADE` for removals (per [Q17]).
  - Generator handles the [Q10] dim_* wrappers automatically: it walks each api/ model's `relationships:` declarations and emits wrappers for every referenced dim_*.
  - Generator emits **`CREATE SCHEMA IF NOT EXISTS api_v1`** at the top — even if UIS's `./uis configure postgrest` also creates the schema, `IF NOT EXISTS` makes the migration safe to apply against either ordering ([Q12]).
  - Generator has its own pytest fixtures (`atlas-data/dbt/scripts/tests/test_generate_api_v1.py`): given a small synthetic manifest, assert expected SQL output. The validation gates ([Q16]) catch what the generator emits *against the real project*; unit tests catch generator bugs that produce syntactically-valid but semantically-wrong SQL on edge cases (e.g. a model with no `relationships:`, a dim_* referenced from two different api_v1 views, etc.).
  - Naming: file `regenerate-api-v1.sh` (consistent with `regenerate-erd.sh`), Python implementation in `atlas-data/dbt/scripts/generate_api_v1.py`.

- **[Q16] Validation strategy for the generated layer.** Auto-generation is only safe if there's a CI gate that catches drift, omissions, and silent failures. Five validations, each tied to a clear failure mode:

  1. **Drift gate (essential).** A check script runs the generator and diffs every artefact (`*_api_v1_generated.sql` AND `api_v1_state.json`) against the checked-in versions. Non-zero diff = CI fail. Mirrors [`check-osmosis.sh`](../../../../../atlas-data/dbt/check-osmosis.sh)'s `--dry-run --check` shape. Fail message points the contributor at "run `regenerate-api-v1.sh` and commit the result." Catches: contributor edited the dbt model but forgot to regenerate; contributor hand-edited the generated file or the state JSON.
  2. **Coverage (essential).** Pure SQL ↔ dbt-model symmetry: every model under `models/marts/api/` (plus its transitively-referenced dim_* per [Q10]) produces a wrapper in the generated SQL; conversely, every `api_v1.*` view in the generated SQL maps to an existing dbt model or referenced dim_*. Detects renames, deletions, and orphan wrappers. (The state-JSON-vs-reality check is part of drift, not coverage.)
  3. **Description coverage** — split into two checks because the timing differs:
     - **3a. Static (essential, gate-blocking).** Read the generated SQL. If [Q3] resolves "comments don't propagate to views", every column must have a `COMMENT ON COLUMN api_v1.X.col IS '...'` line. If [Q3] resolves "comments propagate", static check verifies the underlying `marts.mart_*` columns are documented (already covered by `check-osmosis.sh` strict gate). Fast; runs without Postgres.
     - **3b. Runtime (smoke).** After migration, query `pg_catalog.pg_description` and assert no `api_v1` column has a NULL `obj_description`. Requires Postgres + applied migration; runs in PLAN-004's verification phase + as part of the deploy smoke test.
  4. **Row-count parity (smoke).** `SELECT count(*) FROM api_v1.X` matches `SELECT count(*) FROM marts.mart_X` for every wrapper — use `dbt_utils.equal_rowcount` (count-only, fast) **not** `dbt_utils.equality` (row-level diff, expensive on large views). Catches typos in the generator + accidental WHERE clauses + permission filters silently dropping rows. For the pure `SELECT *` case row-count is sufficient; if [Q4]/[Q15] later introduce projections / overrides, upgrade specific tests to `dbt_utils.equality` per-view.
  5. **Idempotency (one-time).** Run generator twice; second run produces identical output and applies as a no-op. Verified once during PLAN-004; no ongoing cost.

  CI integration:
  - Drift + coverage + description checks land as either an extension of `check-osmosis.sh` or a sibling `check-api-v1.sh` (lean: separate, single-responsibility — `check-osmosis` covers schema.yml hygiene, `check-api-v1` covers generator-output integrity).
  - Count-parity is a runtime smoke test that runs in PLAN-004's verification phase + as part of the existing `dbt test` battery (a `dbt_utils.equality` test between mart and wrapper would do it).
  - Idempotency is a one-shot test in PLAN-004's pre-flight phase.

  **All five gates required to merge a PR that touches `api_v1`.**

- **[Q17] Drop strategy for removed views.** Auto-generation creates wrappers for every model in `models/marts/api/`. When a model is removed (deprecated, moved out of `api/`), `CREATE OR REPLACE VIEW` does **not** drop the now-orphan view — the existing view persists in Postgres. Three approaches:
  - **(a) Track previous state.** Generator stores last-known view list in a checked-in JSON file (`atlas-data/dbt/api_v1_state.json`); diff against the new run produces explicit `DROP VIEW IF EXISTS api_v1.X CASCADE` statements at the top of the migration for views being removed. Adds a checked-in artefact, but the diff is reviewer-visible ("this PR drops `api_v1.foo`").
  - **(b) Sweep at generation.** Generator queries live Postgres at generation time, computes the delta, emits DROPs. Requires a DB connection during regeneration — ergonomic regression for offline/CI runs.
  - **(c) Heavy hammer.** Each generated migration starts with `DROP SCHEMA api_v1 CASCADE; CREATE SCHEMA api_v1;` then recreates everything. Simple but disruptive — every regeneration drops every object in the schema, including grants UIS configured. Likely incompatible with the UIS GRANT model since UIS's grants attach to the schema.
  - **Recommendation: (a).** Tracking the last-known state via a checked-in JSON gives a reviewer-visible diff of "views being added/dropped this PR" without disrupting the schema. Generator emits `DROP VIEW IF EXISTS … CASCADE` for each removed view at the top of the SQL, **before** the `CREATE OR REPLACE VIEW` statements.

  Updates [Q14]'s deprecation flow: removing `mart_X` from `models/marts/api/` + regenerating + committing produces a migration whose diff *itself* is the deprecation announcement. The drift gate ([Q16] #1) catches anyone who removes the model but forgets to regenerate.

- **[Q18] Migration-runner semantics: same NNN re-applied or new NNN every regeneration?** Atlas's [Q15] picks "generator overwrites the same `NNN_api_v1_generated.sql` file." But typical migration runners track applied migrations by NNN (or filename), not by content hash — so a regenerated file with the same NNN is **silently skipped** on the next `npm run migrate`. This breaks the whole loop: contributor regenerates, runs migrate, nothing changes, doesn't notice.

  Three approaches:
  - **(a) Verify atlas's runner uses content-hash tracking.** If `npm run migrate` re-applies on content change, [Q15]'s "overwrite same file" pattern works. **Action**: PLAN-004 Phase 1 reads the migration runner's source (or runs an explicit test: change a generated file's content, re-run migrate, verify it re-applies).
  - **(b) Generator increments NNN every regeneration.** Each regeneration writes `NNN_api_v1_generated.sql` with the next free NNN, leaving prior generations as historical migrations. After hundreds of regenerations, `migrations/` has hundreds of `*_api_v1_generated.sql` files. Audit trail; clutter. Reviewer-unfriendly diffs (each PR adds a new file rather than diffing one).
  - **(c) Generator output isn't a tracked migration.** Generator writes to `atlas-data/migrations/api_v1_generated.sql` (no NNN); a deploy script applies it via `psql -f` outside the migration runner's tracking. Migration runner stays in charge of the `NNN_*.sql` files; api_v1 is "applied every deploy via a separate hook." Breaks the unified `npm run migrate` story.

  **Recommendation: investigate (a) first; fall back to (c) if the runner is NNN-tracked.** (b) is technical debt by design at Atlas's projected scale (each regeneration = one new file = thousands eventually). (c) is clean but introduces a separate deploy step. (a) is best if the runner supports it.

  **Action**: PLAN-004 Phase 1 includes a 5-min runner-semantics check (modify any existing migration's body, re-run migrate, see if it re-applies). The answer determines the generator's output path + naming.

---

## What this PLAN-when-it-lands does NOT do

- **Stand up PostgREST** — that's UIS's `./uis configure postgrest --app atlas` + `./uis deploy postgrest --app atlas`. Atlas's responsibility ends at "the `api_v1` schema exists with the agreed views and descriptions."
- **Migrate the Atlas frontend** — the frontend continues reading `marts.*` directly until PLAN-E (frontend migration to PostgREST). The `api_v1` layer is purely for external consumers in v1.
- **Build a human-readable API docs site** — PostgREST 12.x projects a Swagger 2.0 spec at `GET /` automatically (the version-discriminating key is `.swagger == "2.0"`, not `.openapi`); rendering it as a Swagger-UI / Redoc page at `api-atlas.helpers.no/docs` is **PLAN-F** (per PLAN-001's "What's next"). PLAN-004 stops at "PostgREST has a correct, descriptive Swagger 2.0 spec to project."
- **Decide `api_v2` policy** — premature; no breaking change is on the horizon today.
- **Build new mart views** — the 9 from PLAN-001 are the v1 surface. New views land via the normal `adding-a-source.md` workflow (extended to include the `api_v1` wrapper step in [Q9]).
- **Verify planner push-down on every wrapper** — PostgREST's filter / projection / order params should rewrite efficiently through `SELECT *` views; spot-check one with `EXPLAIN` and trust the rest unless evidence otherwise.

---

## Recommendation: split into two follow-ups

- **PLAN-004 — `api_v1` generator + validations + naming-conventions update + contributor-docs follow-on.** Atlas-side data work, the generator, the gate, and the small docs touch-ups. Two-stage verification because PostgREST isn't deployed yet. Phases:

  1. **Pre-flight experiments** (resolve [Q3], [Q10], [Q11], [Q18]) — **realistic estimate: half a day**, because Atlas has no local PostgREST setup today and the FK-embed test needs one. Tasks:
     - **[Q3] (~10 min `psql`)**: Does `COMMENT ON COLUMN` on `marts.mart_X` propagate to `api_v1.X` view? Run `psql` against the port-forwarded UIS Postgres; create a test wrapper view; `\d+` to inspect.
     - **[Q10] (~2 hours)**: Spin up PostgREST locally (`docker run postgrest/postgrest` against the same UIS Postgres) and verify `COMMENT ON COLUMN api_v1.X.col IS '@references api_v1.Y'` surfaces an embed in the OpenAPI spec. Atlas has no local PostgREST today; this includes setup time.
     - **[Q11] (~30 min)**: Read UIS's `./uis configure postgrest` source (or ask the contributor) to determine whether `ALTER DEFAULT PRIVILEGES` is set.
     - **[Q18] (~5 min)**: Test whether `npm run migrate` re-applies a migration whose body changed but whose NNN didn't. Either change a benign migration's whitespace or write a throwaway test migration.
  2. **Build the generator** ([Q15], [Q17]):
     - `atlas-data/dbt/scripts/generate_api_v1.py` — reads `target/manifest.json`, walks `models/marts/api/`, emits `CREATE SCHEMA IF NOT EXISTS api_v1`, `DROP VIEW IF EXISTS` for removed views (drift vs `api_v1_state.json`), `CREATE OR REPLACE VIEW` for current views, dim_* wrappers for FK embeds, permission grants if owned by Atlas, and `NOTIFY pgrst, 'reload schema'` at the end.
     - `atlas-data/dbt/scripts/tests/test_generate_api_v1.py` — pytest fixtures with synthetic manifests; asserts expected SQL output for happy-path + edge cases (empty api/, removed view, dim_* shared by two api_v1 views, etc.).
     - `atlas-data/dbt/regenerate-api-v1.sh` — wrapper script (mirror of `regenerate-erd.sh`): runs `dbt parse`, then the Python generator, writes to `atlas-data/migrations/NNN_api_v1_generated.sql` and updates `atlas-data/dbt/api_v1_state.json`.
     - Idempotency one-shot test: run twice, output identical, second `npm run migrate` is a no-op.
  3. **Build the validations** ([Q16]) — five gates:
     - Drift gate (`check-api-v1.sh`): regenerates, diffs both SQL and `api_v1_state.json` against checked-in versions. Mirror of `check-osmosis.sh`.
     - Coverage check (in the same script): SQL ↔ dbt-model symmetry; no orphans.
     - Description coverage 3a (static): counts `COMMENT ON COLUMN` lines in the generated SQL — should equal the column count across all api_v1 views (only relevant if [Q3] requires explicit comments on views).
     - Description coverage 3b (runtime): post-migration `pg_catalog.pg_description` query verifies every `api_v1` column has a comment.
     - Row-count parity: `dbt_utils.equal_rowcount` test between each `mart_X` and its `api_v1.x` wrapper.
     - Idempotency: see Phase 2.
  4. **Initial generation + Atlas-side verification**:
     - Run `regenerate-api-v1.sh` to produce the first migration file.
     - `npm run migrate` clean; second run is no-op.
     - All five validations pass.
     - `dbt build` clean, `check-osmosis.sh` strict ✓, `check-api-v1.sh` ✓.
  5. **Naming-conventions.md update** — split the "public surface" wording into internal (`marts.mart_*`) + external (`api_v1.*`) layers. Add rule (after #8): "every new `marts.mart_*` view in `models/marts/api/` MUST be followed by `regenerate-api-v1.sh` + commit; the drift gate enforces this."
  6. **Contributor docs update** — `adding-a-source.md` gets the new "after dbt model lands, run `regenerate-api-v1.sh`" step + `NOTIFY pgrst, 'reload schema'` reminder + new "retire a mart_*" subsection (per [Q14]). `dbt-osmosis.md` and `check-osmosis.md` updated to clarify the layer split. New `contributors/api-v1.md` page covers the generator + gate.
  7. **Rollback runbook** — short note in the migration file (or a sibling doc) covering ordered rollback per [Q13].

- **(Future) PLAN-D.2 / coordination with UIS — end-to-end verification.** Once PLAN-004 is merged, signal to the UIS contributor that `api_v1` exists and they can run `./uis configure postgrest --app atlas --schema api_v1 --url-prefix api-atlas` + `./uis deploy postgrest --app atlas`. No code change on Atlas's side at that point. End-to-end checks:
  - `curl http://api-atlas.localhost/` returns Swagger 2.0 spec (PostgREST 12.x; verify with `jq '.swagger == "2.0"'`) containing all 9 (or ~14 with dim_* wrappers) endpoints with descriptions.
  - `curl 'http://api-atlas.localhost/indicator_summary?source_id=eq.ssb-08764'` returns rows.
  - If [Q10](a) chosen: `curl 'http://api-atlas.localhost/kommune_local_chapters?select=*,kommune(*)&kommune_nr=eq.0301'` embeds the kommune row.

---

## Cross-references

- [`urbalurba-infrastructure/website/docs/services/integration/postgrest.md`](../../../../../../urbalurba-infrastructure/website/docs/services/integration/postgrest.md) — the UIS contributor's PostgREST design doc (the trigger for this INVESTIGATE)
- [INVESTIGATE-public-api-surface.md](INVESTIGATE-public-api-surface.md) — the parent investigation; this INVESTIGATE resolves a question that one left implicit
- [PLAN-001-api-mart-views.md](../completed/PLAN-001-api-mart-views.md) — built the 9 `marts.mart_*` views the wrappers will project
- [PLAN-002-fill-schema-yml-description-gaps.md](../completed/PLAN-002-fill-schema-yml-description-gaps.md) — closed the description backlog so OpenAPI projection is informative
- [`docs/stack/naming-conventions.md`](../../../../../docs/stack/naming-conventions.md) — needs the rule + wording update once PLAN-004 lands
- [adding-a-source.md](../../../contributors/adding-a-source.md), [dbt-osmosis.md](../../../contributors/dbt-osmosis.md), [check-osmosis.md](../../../contributors/check-osmosis.md) — contributor pages that gain a small `api_v1` step
- [`atlas-data/dbt/regenerate-erd.sh`](../../../../../atlas-data/dbt/regenerate-erd.sh) — the existing pattern this generator mirrors (read `target/manifest.json` → emit artefact → check in)
- [`atlas-data/dbt/check-osmosis.sh`](../../../../../atlas-data/dbt/check-osmosis.sh) — the gate-style validation pattern PLAN-004's `check-api-v1.sh` follows
- [PostgREST embed-via-comment docs](https://docs.postgrest.org/en/v12/references/api/resource_embedding.html) — relevant for [Q10] (`@source` and `@references` comment hints)
- Future PLAN-F (not yet drafted) — render the OpenAPI spec as a Swagger-UI / Redoc human-readable docs page at `api-atlas.helpers.no/docs`
