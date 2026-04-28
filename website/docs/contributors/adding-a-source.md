# Adding a new data source

This is the **end-to-end workflow for adding a new upstream data source to Atlas** — from cataloguing the source to making it queryable through the public API. Written for an external contributor who hasn't seen the codebase before; experienced contributors can skim.

If you've never seen Atlas's data pipeline before, read the [data journey walkthrough](./data-journey.md) first — it traces one source (SSB 08764) end-to-end so you understand what the pieces are. Then come back here for the procedural steps.

---

## What "adding a source" means in Atlas

Atlas's data side is two layers:

1. **Ingest** — TypeScript modules under [`atlas-data/ingest/src/sources/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources) that fetch upstream data (SSB, FHI, Brreg, NGO HTML scrapes) and write to the `raw.*` Postgres schema. Verbatim shape — no renaming or reshaping.
2. **dbt** — SQL models under [`atlas-data/dbt/models/`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models) that transform `raw.*` into `marts.*` (the public schema PostgREST projects as the API).

Adding a source means both: write the ingest module that lands rows in `raw.<source>`, and the dbt model that maps `raw.<source>` to a clean per-source mart in `marts.indicators__<source>`.

A typical SSB source takes ~30 minutes for the ingest side, ~20 minutes for the dbt side. Scraping sources (HTML, no API) take longer — see [ingest-modules.md § scraping convention](./ingest-modules.md#scraping-sources).

---

## Prerequisites

Before you start:

1. Read [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/blob/main/docs/stack/naming-conventions.md) — the canonical vocabulary (`kommune_nr`, `fylke_nr`, `orgnr`, etc.). Atlas does not invent variants; rule #5 says **every column must have a description in `schema.yml`** (enforced by the [check-osmosis gate](./check-osmosis.md)).
2. Skim the [data journey walkthrough](./data-journey.md) for SSB 08764 if you haven't already.
3. Read [`atlas-data/ingest/src/sources/ssb-08764/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/ssb-08764) as the template — you'll copy and adapt this for SSB-style sources.
4. Have your dev environment set up — see [setup.md](./setup.md).

**If you're adding a scraping source** (HTML, no API), the workflow below covers the API-source baseline; you also need:

- [INVESTIGATE-ngo-scraping-infrastructure.md](../ai-developer/plans/completed/INVESTIGATE-ngo-scraping-infrastructure.md) — design rationale (Crawlee, robots, sitemap_log, record_hash)
- [ingest-modules.md § scraping convention](./ingest-modules.md#scraping-sources) — the extended folder layout (`discover.ts`, `parse.ts`, `__tests__/fixtures/`)
- [PLAN-001-scraping-infrastructure.md](../ai-developer/plans/completed/PLAN-001-scraping-infrastructure.md) — what shipped in `src/lib/scraping/`

**If you're covering a new NGO with Brreg data** (legal-entity metadata), you do **not** add a new ingest source — the generic `refresh:brreg-enheter` already handles every NGO. Add a `brreg_query` block to the NGO's entry in [`landscape.json`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/seed-sources/atlas-ngo-landscape/landscape.json), then re-run `npm run refresh:brreg-enheter`. See [`ingest/src/lib/brreg/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/lib/brreg/README.md).

---

## The 11-step workflow

Execute these steps **in order**. Later steps depend on earlier ones — don't skip ahead.

### Step 1 — Catalogue entry

**File**: `docs/research/samfunnspuls/data-sources.md` (or the broader `docs/research/data-sources.md`).

**Required fields** (minimum): `id`, `provider`, `kind`, `title_no`, `what_it_is`, `use_cases` (≥1), `questions_answered` (≥2), `endpoint`, `auth`, `atlas_decision`, `verified_on`.

**Done when**: entry exists and is syntactically valid per the schema file.

### Step 2 — Investigate the upstream

Fetch upstream metadata and record in a scratch note (doesn't need committing):

- Dimensions and sizes
- Whether any dimensions require explicit selection (in SSB Klass: `elimination=false`)
- Row count estimate for the default query
- Update cadence
- Region code format — bare 4-digit, prefixed (`K_0301`), or alphanumeric (`030101a`)?

**Done when**: a test `curl` or `fetch` returns valid data with the filters you plan to use.

### Step 3 — Raw landing table migration

**File**: `atlas-data/migrations/NNN_raw_<source_id_with_underscores>.sql` (NNN = next free 3-digit number, zero-padded).

**Required content**:

- `create table if not exists raw.<source_id>` — underscores in SQL identifiers, not hyphens
- Columns match upstream shape — **no renaming at this layer**
- Composite `primary key` on all dimension columns
- `loaded_at timestamptz not null default now()`
- `comment on table` describing the source in one sentence
- `comment on column` for any non-obvious column (prefix codes, suppression markers, etc.)

**Done when**: `npm run migrate` applies the file without error.

### Step 4 — Ingest module

**Folder**: `atlas-data/ingest/src/sources/<source-id>/` — hyphens in folder names.

Two files: `index.ts` and `README.md`. The full template is in [ingest-modules.md](./ingest-modules.md). Key constraints:

- `index.ts` uses shared helpers from `../../lib/*` (no inline `writeNdjson`, no inline Postgres client, no hard-coded credentials).
- Row type declared inline; do **not** add it to `lib/types.ts`.
- `SOURCE_ID` constant matches the catalogue `id` exactly.
- `README.md` has all 9 required sections (see [ingest-modules.md § README structure](./ingest-modules.md#per-source-readme-structure)).

**Done when**: `npm run typecheck` passes and `npm run ingest:<source-id>` writes rows to `raw.<source_id>`.

### Step 5 — npm script

**File**: `atlas-data/ingest/package.json`.

Add to the `scripts` block, alphabetically among the other `ingest:*` entries:

```json
"ingest:<source-id>": "tsx --env-file=.env src/sources/<source-id>/index.ts"
```

### Step 6 — Source-list entry

**File**: `atlas-data/ingest/src/sources/README.md`.

Add one row to the "Implemented sources" table, alphabetically. Include: link to per-source folder, provider, one-sentence description, the `npm run` command, an important quirk (<120 chars).

### Step 7 — dbt source declaration

**File**: `atlas-data/dbt/models/indicators/sources.yml` (or `dimensions/sources.yml` for dimensions).

Add a `tables[]` entry under the `raw` source with: `name`, `description` (2–3 sentences), `loaded_at_field: loaded_at`, `freshness` block (`warn_after` + `error_after`), `columns:` with `not_null` tests on PK columns, `accepted_values` where the value set is bounded.

### Step 8 — dbt per-source model

**File**: `atlas-data/dbt/models/indicators/indicators__<source_id_with_underscores>.sql`.

Required content:

- `{{ config(materialized='table', schema='marts') }}` at top
- `select 'ssb-XXXXX'::text as source_id,` as the first column — **hard-coded literal** matching the catalogue `id`
- **Canonical column names** per [naming-conventions.md](https://github.com/terchris/atlas/blob/main/docs/stack/naming-conventions.md) — rename upstream names as needed
- For sources with prefixed region codes (like `ssb-06913`), strip the prefix here
- For mixed-level sources (kommune + fylke + nasjon rows), add a computed `kommune_nr`: `case when length(region_code) = 4 then region_code end as kommune_nr`
- `loaded_at as updated_at` (never expose `loaded_at` in marts)

**Done when**: `dbt run --select indicators__<source_id>` succeeds.

### Step 9 — dbt schema.yml entry

**File**: `atlas-data/dbt/models/indicators/schema.yml`.

Add a `models[]` entry with:

- Model-level `description`
- Per-column `description` for **every** column (MUST — see [check-osmosis.md](./check-osmosis.md))
- `not_null` on every PK column
- `accepted_values` where the set is bounded
- `dbt_utils.accepted_range` on year-like columns
- `dbt_utils.unique_combination_of_columns` on the model-level PK
- `relationships` test on `kommune_nr` → `ref('dim_kommune')` if present
- `relationships` test on `fylke_nr` → `ref('dim_fylke')` if present
- `relationships` test on `orgnr` → `ref('dim_ngo')` if present

**Done when**: `dbt-osmosis yaml document --dry-run --check` exits 0. See [dbt-osmosis.md](./dbt-osmosis.md) for the description-propagation flow.

### Step 10 — Verify end-to-end

Run, in order, **all** of:

```bash
cd atlas-data/ingest
npm run typecheck                                                     # must pass
npm run migrate                                                       # must succeed (idempotent)
npm run ingest:<source-id>                                            # must succeed
cd ../dbt
uv run --env-file ../ingest/.env dbt run  --select indicators__<source_id>   # must succeed
uv run --env-file ../ingest/.env dbt test --select indicators__<source_id>   # must pass 100%
./check-osmosis.sh                                                    # must pass
```

If any command fails or any test warns, **fix before committing**. No "we'll clean up later."

### Step 11 — Commit

Commit message format: `Add <source-id> (<one-line summary>)`.

---

## Workflow: add a new `dim_*` (conformed dimension)

Similar to the source workflow, with these differences:

- Step 8 puts the model in `dbt/models/dimensions/`, not `indicators/`.
- The dim's source declaration in `sources.yml` lives in the same folder.
- The model's schema.yml entry lives in `dbt/models/dimensions/schema.yml`.
- Every existing indicator that references the dim **MUST** add a `relationships:` test in the same PR.
- If the dim introduces a new canonical column name, update [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/blob/main/docs/stack/naming-conventions.md) in the same PR.

## Workflow: modify an existing source

- Raw column changes: add a **new migration file** — never edit the existing one.
- Model column changes: edit the model file directly; update `schema.yml` in the same change.
- Renaming a column: do it in the dbt passthrough; raw stays as-is.
- Retiring a source: add `deprecation_date: YYYY-MM-DD` to the model config; delete after the date.

---

## PR checklist

Before opening a PR, verify every box. A reviewer (human or LLM) should reject a PR that fails any item.

### Catalogue + upstream
- [ ] Source has a catalogue entry with all required fields
- [ ] `atlas_decision` is set (not `evaluate_later` for production work)
- [ ] `verified_on` is today's date

### Raw layer
- [ ] Migration file added with sequential number
- [ ] Raw table has `primary key` on dimension columns
- [ ] Raw table has `loaded_at timestamptz`
- [ ] Non-obvious columns have `comment on column`

### Ingest
- [ ] `index.ts` uses shared libs, not inline helpers
- [ ] Row type declared inline, not in `lib/types.ts`
- [ ] `SOURCE_ID` constant matches catalogue `id` exactly
- [ ] All five `PxWebAPI` error paths considered (429, 5xx, schema change, rate limit, network)
- [ ] README has all 9 required sections
- [ ] `npm run typecheck` passes with zero errors

### dbt
- [ ] Source declared in `sources.yml` with `freshness` block
- [ ] Per-source model materialized as `table` in `marts` schema
- [ ] First column of the model is `source_id` literal, matching catalogue `id`
- [ ] All marts column names comply with naming-conventions.md
- [ ] No upstream name leaked into marts (checked against the "Never in marts" table)
- [ ] Every column has a `description` in `schema.yml`
- [ ] PK columns have `not_null` tests
- [ ] Model has `dbt_utils.unique_combination_of_columns` on PK
- [ ] `relationships` test added for every `*_nr`, `*_code`, `orgnr` column that references a dim
- [ ] `accepted_values` test on columns with bounded, known values
- [ ] `accepted_range` test on year columns
- [ ] `dbt run` succeeds
- [ ] `dbt test` passes 100% (zero failures, zero warnings)
- [ ] `./check-osmosis.sh` passes (strict ✓, TOTAL = 0)

### Housekeeping
- [ ] npm script added and alphabetically sorted
- [ ] `ingest/src/sources/README.md` updated
- [ ] If new canonical vocabulary needed: `docs/stack/naming-conventions.md` updated
- [ ] Commit message follows the format

---

## Rules you MUST NOT break

1. **MUST NOT** let a raw column name leak into marts without deliberate renaming.
2. **MUST NOT** create a mart that isn't consumed by at least one feature or planned feature — YAGNI applies to tables.
3. **MUST NOT** skip `relationships` tests. If a FK exists conceptually, it must be declared.
4. **MUST NOT** use abbreviations outside the canonical vocabulary in [naming-conventions.md](https://github.com/terchris/atlas/blob/main/docs/stack/naming-conventions.md).
5. **MUST NOT** mix multiple entity levels (kommune + fylke + nasjon) in the same mart column without an explicit `level` column.
6. **MUST NOT** commit without running `dbt run` and `dbt test` — the "it's a trivial change" excuse is the start of every 1800-table mess.
7. **MUST NOT** hand-edit a past migration file. Add a new one.
8. **MUST NOT** expose `raw.*` to any consumer. The public contract is `marts.*` only.
9. **MUST NOT** create per-team or per-source variants of `dim_*` — dims are conformed.
10. **MUST NOT** leave `[TBD]` placeholders in catalogue entries merged to `main` — fill them in or remove the row.

---

## Cross-references

- [data-journey.md](./data-journey.md) — end-to-end SSB 08764 walkthrough
- [ingest-modules.md](./ingest-modules.md) — ingest-side template (`index.ts` shape, README structure, scraping convention)
- [dbt-osmosis.md](./dbt-osmosis.md) — schema.yml description propagation
- [check-osmosis.md](./check-osmosis.md) — the description gate
- [setup.md](./setup.md) — dev environment
- [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/blob/main/docs/stack/naming-conventions.md) — canonical vocabulary
- [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md) — implemented-sources reference (per-source examples + planned-sources catalogue)
