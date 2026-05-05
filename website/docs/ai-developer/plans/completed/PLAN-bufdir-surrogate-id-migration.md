# Plan: bufdir-barnefattigdom — migrate `indicator_api_id` to number-prefix + alias seed

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Completed (2026-05-05)

**Outcome**: Shipped end-to-end on the same branch as the PLAN draft (single PR per the half-day estimate).

- **Phase 1** ✓ — `surrogateIndicatorApiId()` now returns `{ id, tier }` where `tier` is `"number-prefix"` (canonical) or `"hash-fallback"` (defensive). `parseDataSheet()` destructures the canonical path.
- **Phase 2** ✓ — `__tests__/parse.test.ts` updated to pin the new id shape; 6 new cases cover number-prefix, 9a/9b suffix, two-digit numbers, slug-refinement-stability, the conservative 5/5b different-by-default decision (Q1), and the hash fallback. **34/34 passing**, full ingest test suite **88/88**.
- **Phase 3** ✓ — `seeds/sources/bufdir_indicator_alias.csv` (3 rows: 9→9a, 9→9b, 10→null), `models/marts/api/mart_bufdir_indicator_alias.sql` (thin pass-through), schema.yml entries on both sides. `mart_` prefix follows the marts/api/ README convention; the generator strips it to emit `api_v1.bufdir_indicator_alias`.
- **Phase 4** ✓ — `npm run ingest:bufdir-barnefattigdom` re-emitted all 395,420 rows with new ids in ~57s. Verified: 22 distinct `indicator_api_id` values, all matching `^bf_zip_ind_\d+[a-z]?$`, **zero legacy hex rows remain**. Full `dbt test`: **PASS=481, ERROR=0, WARN=1** (pre-existing postnummer warn). Hand-maintained `tests/api_v1_rowcount_matches_marts.sql` got the new union-all line.
- **Phase 5** ✓ — bufdir README updated with id-shape paragraph + refresh-checklist subsection (diff filenames against the alias seed when a new bundle release lands).

The PLAN's risk paragraph (breaking-change for cached legacy ids) is moot in retrospect — bufdir's public API hadn't been advertised yet, so no consumer was caching the old shape.

---

## Status (original): Backlog

**Goal**: Replace bufdir's filename-stem-hash surrogate id with a number-prefix derivation + a small alias seed for editorial discontinuity events. After this PLAN, `bufdir-barnefattigdom`'s `indicator_api_id` is `bf_zip_ind_<N>` (stable across slug refinements), and `marts.bufdir_indicator_alias` (auto-wrapped as `api_v1.bufdir_indicator_alias`) carries `historical_id → canonical_id` mappings consumers can join on for cross-time-series continuity.

**Investigation**: [INVESTIGATE-bufdir-indicator-surrogate-id-stability.md](INVESTIGATE-bufdir-indicator-surrogate-id-stability.md) — settled the strategy (option **(d)**), Q1–Q4 answers, and the auto-exposure architectural principle this PLAN executes.

**Last Updated**: 2026-05-05

**Prerequisites**:
- PR #67 (parse.ts split + multi-tier discovery + golden-file tests) — merged.
- PR #68 (README quirks refresh) — pending merge; not blocking.
- PR #69 (the INVESTIGATE this PLAN executes) — pending review/merge; required before this PLAN starts.
- A working Postgres + cluster (per [setup.md § After a cluster reset](../../../contributors/setup.md#after-a-cluster-reset--fresh-start)).

**Blocks**:
- Consumers caching the current `bf_zip_<24-hex>` ids will break on first deploy of this PLAN. Mitigation: `bufdir-barnefattigdom` has been live <1 week, no public-API uptake yet; window closes the moment `atlas.helpers.no/data` advertises the endpoint.

**Out of scope** (see [INVESTIGATE](INVESTIGATE-bufdir-indicator-surrogate-id-stability.md) "What this INVESTIGATE explicitly does NOT decide"):
- Speculative pre-population of the alias seed for unobserved future deprecations.
- Rename-detection automation (a future ingest could diff today's filenames against `_sources_dimensions` and flag suspect renames; that's separate hardening).
- Generalising the alias pattern to non-bufdir sources before any second source actually needs it (the convention is in place for them to inherit when the time comes).

---

## Phase 1: Update `parse.ts:surrogateIndicatorApiId()`

Single-file change. Trivial code.

### Tasks

- [ ] 1.1 Modify [`atlas-data/ingest/src/sources/bufdir-barnefattigdom/parse.ts`](../../../../atlas-data/ingest/src/sources/bufdir-barnefattigdom/parse.ts) `surrogateIndicatorApiId()` to:
  - Parse the leading `Indikator_(\d+[a-z]?)` from the filename stem.
  - On match: return `"bf_zip_ind_" + capturedNumber.toLowerCase()` (e.g. `bf_zip_ind_5`, `bf_zip_ind_9a`, `bf_zip_ind_22`).
  - On no match (defensive — Bufdir adds a non-numbered workbook in some future release): fall back to the existing `sha256(stem)` body and log a warn so the operator notices. Keeps ingest from throwing on a non-conforming filename.
- [ ] 1.2 Adjust the JSDoc on `surrogateIndicatorApiId()` to describe both the primary and fallback paths and reference this PLAN's rationale.

### Validation

```bash
cd atlas-data/ingest && npm run typecheck   # exit 0
```

### Done when

- `surrogateIndicatorApiId("Indikator_5_barn_i_hush_…")` returns `"bf_zip_ind_5"`.
- `surrogateIndicatorApiId("Indikator_9a_barn_i_hush_…")` returns `"bf_zip_ind_9a"`.
- `surrogateIndicatorApiId("nonsense_filename")` returns `"bf_zip_<24 hex>"` and the fallback log fires.

---

## Phase 2: Update existing parser tests + add new id-shape coverage

The 29 tests in `__tests__/parse.test.ts` (PR #67) still apply structurally but pin specific id values that change shape. Update the assertions and add a few cases for the new logic.

### Tasks

- [ ] 2.1 In [`__tests__/parse.test.ts`](../../../../atlas-data/ingest/src/sources/bufdir-barnefattigdom/__tests__/parse.test.ts):
  - Replace `expect(id).toMatch(/^bf_zip_[0-9a-f]{24}$/)` → `expect(id).toMatch(/^bf_zip_ind_\d+[a-z]?$/)` for the canonical path.
  - Update the "deterministic" test — same filename → same `bf_zip_ind_<N>` id, no change in semantics.
  - Update the "changes when stem changes" test — `Indikator_5_old` and `Indikator_5b_new` produce **different** ids (`bf_zip_ind_5` vs `bf_zip_ind_5b`), reflecting Q1's "conservative — different by default" decision.
  - Update the parseDataSheet golden-file assertions — the indicator_api_id values for the two real fixtures (Indikator_4 and Indikator_17) move from hex hashes to `bf_zip_ind_4` / `bf_zip_ind_17`.
- [ ] 2.2 Add new tests for the fallback path:
  - `surrogateIndicatorApiId("nonsense_filename")` → matches `^bf_zip_[0-9a-f]{24}$` (legacy hex shape, fallback fired).
  - `surrogateIndicatorApiId("Indikator_22_…")` → `bf_zip_ind_22`.
  - `surrogateIndicatorApiId("Indikator_9a_…")` → `bf_zip_ind_9a`.

### Validation

```bash
cd atlas-data/ingest && npx vitest run src/sources/bufdir-barnefattigdom/__tests__/parse.test.ts
# expected: all tests passing, including the new fallback + 9a/9b coverage
```

### Done when

- `vitest run` shows all parse-test cases passing with the new id shape pinned.
- The fallback path has explicit test coverage so a future regression that drops the regex match doesn't go unnoticed.

---

## Phase 3: Add the alias seed + dbt model

The alias table maps known-historical ids to canonical successors. Pre-populate from observed history; future Bufdir refreshes append rows as renumbering events surface.

### Tasks

- [ ] 3.1 Create [`atlas-data/dbt/seeds/sources/bufdir_indicator_alias.csv`](../../../../atlas-data/dbt/seeds/sources/bufdir_indicator_alias.csv) with columns `source_id, historical_id, canonical_id, note`. Initial rows:

  ```csv
  source_id,historical_id,canonical_id,note
  bufdir-barnefattigdom,bf_zip_ind_9,bf_zip_ind_9a,"Indikator 9 was split into 9a (innvandrerbakgrunn Afrika etc.) and 9b (EU etc.) — 9a is the closer successor in the Afrika-etc subcategory"
  bufdir-barnefattigdom,bf_zip_ind_9,bf_zip_ind_9b,"Same split as above — 9b is the closer successor in the EU-etc subcategory"
  bufdir-barnefattigdom,bf_zip_ind_10,,"Indikator 10 retired by Bufdir; no direct successor in the bundle as of 2026-05-04. Consumers comparing pre/post-retirement should treat 10's series as terminating."
  ```

- [ ] 3.2 Create [`atlas-data/dbt/models/marts/api/bufdir_indicator_alias.sql`](../../../../atlas-data/dbt/models/marts/api/bufdir_indicator_alias.sql):

  ```sql
  {{ config(materialized='table', schema='marts') }}

  -- Per-source alias table for bufdir-barnefattigdom indicator_api_id renumbers.
  -- See INVESTIGATE-bufdir-indicator-surrogate-id-stability.md for design rationale.

  select
    source_id,
    historical_id,
    canonical_id,
    note
  from {{ ref('bufdir_indicator_alias') }}
  ```

  Materialisation under `models/marts/api/` triggers PLAN-004's auto-wrap into `api_v1.bufdir_indicator_alias`.

- [ ] 3.3 Add a `seeds/sources/schema.yml` entry for `bufdir_indicator_alias` documenting all four columns + `not_null` on `source_id` + `historical_id` + a `relationships` test on `source_id → _sources_manifest.source_id` (consistent with `_sources_dimensions`).

- [ ] 3.4 Add a `models/marts/api/schema.yml` entry for `bufdir_indicator_alias` documenting all four columns. The `historical_id` and `canonical_id` get descriptions like "previous indicator_api_id from earlier bufdir releases" / "current indicator_api_id; null when the historical indicator was retired without successor".

- [ ] 3.5 Run the seed-rebuilder (`build_sources_seed.py`) — should be a no-op since alias is a separate seed file outside the manifest validator's scope. Verify nothing regresses.

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt seed --select bufdir_indicator_alias    # loads 3 rows
uv run --env-file ../ingest/.env dbt run --select bufdir_indicator_alias     # builds marts.bufdir_indicator_alias
uv run --env-file ../ingest/.env dbt test --select bufdir_indicator_alias    # not_null + relationships green
./regenerate-api-v1.sh && ./apply-api-v1.sh                                   # generator picks up the new model
psql "$DATABASE_URL" -c '\d api_v1.bufdir_indicator_alias'                    # view exists, 3 rows
```

### Done when

- `marts.bufdir_indicator_alias` exists, has 3 rows.
- `api_v1.bufdir_indicator_alias` view emitted by the generator, all 5 PLAN-004 validation gates pass.
- All `schema.yml` columns documented (osmosis strict-check passes).

---

## Phase 4: Refresh ingest output + downstream marts

The new `indicator_api_id` shape only takes effect on the next ingest run. After the parser change, re-run bufdir end-to-end so `raw.bufdir_barnefattigdom` carries the new ids.

### Tasks

- [ ] 4.1 Run `cd atlas-data/ingest && npm run ingest:bufdir-barnefattigdom`. Confirm the row count matches the previous run (~395k) and a sample row has `indicator_api_id` like `bf_zip_ind_4`.

- [ ] 4.2 Run `cd atlas-data/dbt && uv run --env-file ../ingest/.env dbt run --select indicators__bufdir_barnefattigdom mart_*`. Downstream marts that filter on `indicator_api_id` rebuild with the new ids.

- [ ] 4.3 Run `dbt test` and verify all bufdir-related tests stay green. The relationships tests (`kommune_nr → dim_kommune`, etc.) are unaffected; only the id-format changed.

- [ ] 4.4 Inspect `marts.indicators__bufdir_barnefattigdom`:

  ```sql
  select indicator_api_id, count(*) from marts.indicators__bufdir_barnefattigdom group by 1 order by 1;
  -- Expected: bf_zip_ind_1, bf_zip_ind_11, bf_zip_ind_12, ..., bf_zip_ind_22, bf_zip_ind_9a, bf_zip_ind_9b
  -- (alphabetic sort puts ind_1 before ind_11; that's fine for the data.)
  ```

### Validation

```bash
psql "$DATABASE_URL" -c "
  select count(distinct indicator_api_id) as ids,
         min(indicator_api_id) as first,
         max(indicator_api_id) as last
  from marts.indicators__bufdir_barnefattigdom;
"
# Expected: 22 distinct ids, all matching ^bf_zip_ind_\d+[a-z]?$
```

### Done when

- 22 distinct `indicator_api_id` values, all in the new shape.
- No rows with the legacy `bf_zip_<24-hex>` shape remain (verify with a `~ '^bf_zip_[0-9a-f]{24}$'` regex query).
- All bufdir dbt tests pass.

---

## Phase 5: Documentation + maintenance ritual

Make the alias mechanism discoverable + add to the bufdir refresh workflow so the seed stays current as Bufdir publishes new bundles.

### Tasks

- [ ] 5.1 Update [`atlas-data/ingest/src/sources/bufdir-barnefattigdom/README.md`](../../../../atlas-data/ingest/src/sources/bufdir-barnefattigdom/README.md):
  - Replace the line about `bf_zip_<24 hex>` ids with the new `bf_zip_ind_<N>` shape.
  - Replace the surrogate-id quirk in the "Known quirks / fragility" block (PR #68 added that line) with a paragraph pointing at the alias mechanism + the maintenance ritual.
  - Add a "Refresh checklist" subsection: when ingesting a new bundle release, diff the new filename set against `_sources_dimensions.csv` and flag any `Indikator_<N>` codes that disappeared or appeared. Update `bufdir_indicator_alias.csv` accordingly.

- [ ] 5.2 Document the consumer pattern in [`website/docs/developers/`](../../../developers/) (or the next appropriate developer-facing page once Phase 4 of PLAN-007 builds the data discovery surface). One short example:

  ```
  -- Find the canonical id for a historical indicator I cached two releases ago:
  select canonical_id from api_v1.bufdir_indicator_alias
  where historical_id = 'bf_zip_ind_9' and source_id = 'bufdir-barnefattigdom';
  ```

- [ ] 5.3 Move this PLAN backlog/ → active/ when Phase 1 starts; active/ → completed/ when Phase 5 lands.

### Done when

- README reflects the new id shape and the alias mechanism.
- The maintenance ritual (diff filenames against the alias on every refresh) is in writing where future-ingest-operators will see it.

---

## Acceptance criteria

- [ ] `parse.ts:surrogateIndicatorApiId()` returns `bf_zip_ind_<N>` for canonical filenames and falls back to legacy hex for non-conforming ones.
- [ ] All existing `parse.test.ts` tests updated to the new id shape; new tests cover the fallback path and the 9a/9b semantics.
- [ ] `marts.bufdir_indicator_alias` exists with the 3 seeded rows; `api_v1.bufdir_indicator_alias` wraps it via the generator.
- [ ] `marts.indicators__bufdir_barnefattigdom` carries 22 distinct ids in the new shape; no legacy ids remain.
- [ ] All bufdir dbt tests pass; osmosis strict-check passes.
- [ ] README + developer-facing docs updated with the alias join pattern.

---

## Files to modify

**New:**
- `atlas-data/dbt/seeds/sources/bufdir_indicator_alias.csv` (3 initial rows)
- `atlas-data/dbt/models/marts/api/bufdir_indicator_alias.sql`

**Updated:**
- `atlas-data/ingest/src/sources/bufdir-barnefattigdom/parse.ts` (`surrogateIndicatorApiId()` body + JSDoc)
- `atlas-data/ingest/src/sources/bufdir-barnefattigdom/__tests__/parse.test.ts` (id-shape assertions; new fallback + 9a/9b cases)
- `atlas-data/dbt/seeds/sources/schema.yml` (new `bufdir_indicator_alias` entry)
- `atlas-data/dbt/models/marts/api/schema.yml` (new `bufdir_indicator_alias` entry)
- `atlas-data/ingest/src/sources/bufdir-barnefattigdom/README.md` (id-shape + alias mechanism + refresh checklist)
- Generated: `atlas-data/dbt/api_v1_generated.sql` + `api_v1_state.json` (PLAN-004 generator output)

---

## Risk + rollback

**Risk**: external API consumers that cached the old `bf_zip_<24-hex>` ids will see them disappear and the new `bf_zip_ind_<N>` ids appear. There's no automatic bridge between the two id spaces (a hex hash can't be reverse-engineered to a number).

**Mitigation**: bufdir-barnefattigdom has been live for less than a week and the public API hasn't advertised the endpoint. The breaking-change cost is essentially zero today. **Land before any external integration starts depending on the current id shape** — every day of delay adds risk.

**Rollback**: revert the parse.ts change + the seed/model files; ingest re-emits old hex ids on the next run. The rollback is small but a partial state (some clients on hex, some on number-prefix) would be confusing — so don't half-revert.

---

## Cross-references

- [INVESTIGATE-bufdir-indicator-surrogate-id-stability.md](INVESTIGATE-bufdir-indicator-surrogate-id-stability.md) — design rationale for the strategy this PLAN executes.
- [PR #67](https://github.com/terchris/atlas/pull/67) — the parse.ts split this PLAN edits.
- [PR #68](https://github.com/terchris/atlas/pull/68) — the README quirks line this PLAN replaces.
- [PLAN-004-postgrest-api-v1-wrapper.md](../completed/PLAN-004-postgrest-api-v1-wrapper.md) — the api_v1 generator that auto-wraps `models/marts/api/bufdir_indicator_alias.sql`.
- [PLAN-007-data-display-open-by-default.md § Phase 1](../active/PLAN-007-data-display-open-by-default.md#phase-1) — the PostgREST schema-list extension that makes `marts.bufdir_indicator_alias` queryable as `GET /bufdir_indicator_alias` even without the api_v1 wrapper.

---

## Implementation notes

- **Don't pre-populate speculative alias rows.** The seed only carries observed renumbering events. Adding "what if Bufdir splits Indikator_15 into 15a/15b later" entries before that happens is wasted maintenance.
- **`source_id` column in the alias seed** is forward-looking — the same alias mechanism could later carry rows for other sources (Bufdir-barnevern, DSB, etc.). Keeping the column from day one means future generalisation needs no schema migration.
- **The `dbt run` after the parser change re-emits all 395k rows** with new ids. That's full-table-replace by design (see `index.ts`: `delete from raw.bufdir_barnefattigdom` then `INSERT … ON CONFLICT`). No staged rollout needed.
- **Phase 5's "diff filenames against the alias" maintenance ritual** is the closest thing to rename detection without building automation. Worth keeping informal until a second source needs the same pattern.
