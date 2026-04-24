# Contributing to atlas-data

Procedural rules for adding, changing, and reviewing data pipelines. Written to be read and followed by an AI assistant as well as by humans; every step has an explicit completion criterion.

**Prerequisites reading** before making changes:

1. [`../docs/stack/naming-conventions.md`](../docs/stack/naming-conventions.md) — canonical vocabulary and naming rules
2. [`../docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md`](../docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md) — end-to-end journey for one source (completed design investigation)
3. [`../docs/research/samfunnspuls/data-source-schema.md`](../docs/research/samfunnspuls/data-source-schema.md) — per-source catalogue schema
4. An existing source as reference — `ingest/src/sources/ssb-08764/` is the canonical example

**If you're adding a scraping source** (HTML, no API), the workflow below covers the API-source baseline but you also need:

- [`../docs/ai-developer/plans/completed/INVESTIGATE-ngo-scraping-infrastructure.md`](../docs/ai-developer/plans/completed/INVESTIGATE-ngo-scraping-infrastructure.md) — doctrine, decisions, and rationale for the scraping toolkit (Crawlee, robots, sitemap_log, record_hash, etc.).
- [`ingest/src/sources/README.md`](ingest/src/sources/README.md) — section "**Scraping sources — additional convention**" covers the extended folder layout (`discover.ts`, `parse.ts`, `__tests__/fixtures/`), the §C.5 mandatory raw columns, and the new-scraper checklist.
- The completed PLAN that shipped this toolkit — `docs/ai-developer/plans/completed/PLAN-001-scraping-infrastructure.md` — shows exactly what code lives in `src/lib/scraping/` and what env vars the ingest job reads.

---

## Workflow: add a new upstream source

Execute these steps **in order**. Do not skip; later steps depend on earlier ones.

### Step 1 — Catalogue entry

**File**: `docs/research/samfunnspuls/data-sources.md` (or `docs/research/data-sources.md` for broader sources)

**Required fields** (minimum): `id`, `provider`, `kind`, `title_no`, `what_it_is`, `use_cases` (≥1), `questions_answered` (≥2), `endpoint`, `auth`, `atlas_decision`, `verified_on`.

**Completion**: entry exists and is syntactically valid per the schema file.

### Step 2 — Investigate the upstream

Fetch upstream metadata. Record in a scratch note (doesn't need committing):

- Dimensions and sizes
- Whether any dimensions require explicit selection (`elimination=false` in SSB Klass speak)
- Row count estimate for the default query
- Update cadence
- Region code format — bare 4-digit? prefixed like `K_0301`? alphanumeric like `030101a`?

**Completion**: a test `curl` or `fetch` returns valid data from the endpoint with the filters you plan to use.

### Step 3 — Raw landing table migration

**File**: `migrations/NNN_raw_<source_id_with_underscores>.sql` (NNN = next available 3-digit number, zero-padded)

**Required content**:

- `create table if not exists raw.<source_id>` (underscores, not hyphens, in SQL identifiers)
- Columns match upstream shape — **no renaming at this layer**
- Composite `primary key` on all dimension columns
- `loaded_at timestamptz not null default now()`
- `comment on table` describing the source in one sentence
- `comment on column` for any non-obvious column (prefix codes, suppression, etc.)

**Completion**: `npm run migrate` applies the file without error.

### Step 4 — Ingest module

**Folder**: `ingest/src/sources/<source-id>/` (hyphens in folder name)

**Files** (two):

#### 4a. `index.ts`

**Required structure**:

- `import` shared helpers from `../../lib/*` (pxweb, klass, postgres, logger, output, types)
- Declare row type **inline** (do not add to `lib/types.ts`)
- Export `SOURCE_ID` constant matching the catalogue `id` exactly
- Declare `TABLE_ID`, `TARGET_TABLE`, `OUTPUT_PATH`, `WRITE_COLUMNS`, `CONFLICT_KEYS` as module-level constants
- Declare `<SourceName>Summary` type with run-return shape
- Export `async function run(): Promise<<SourceName>Summary>` — this is the entry point
- Include a `toRow(px: PxRow): <RowType>` mapping function that validates every upstream dimension exists and returns the row
- End the file with `run().catch(err => { logger.error(...); process.exit(1); })` — top-level invocation

**Forbidden**:

- No inline `writeNdjson` — use `lib/output.ts`
- No inline Postgres client — use `lib/postgres.ts`
- No hard-coded credentials — read `DATABASE_URL` from env via the lib
- No NDJSON without Postgres: when `DATABASE_URL` is set, writing to Postgres is required

#### 4b. `README.md`

**Required sections**, in this order:

1. `# <source-id>` header + one-line description
2. **What the script does** — 1–3 sentences
3. **Upstream** — table with: Provider, Table id, URL, Auth, Format, Licence, Attribution
4. **Response shape** — table of dimensions and their value counts
5. **Row shape emitted** — one JSON sample, including a suppressed example if relevant
6. **How to run locally** — the `npm run ingest:<source-id>` command
7. **Known quirks** — observations from actually running the script (prefix codes, default filter behaviour, unexpected suppressions, etc.)
8. **Known issues / TODOs** — open items the next maintainer should know
9. **References** — catalogue entry, shared libs, related docs

**Completion**: `npm run typecheck` passes, `npm run ingest:<source-id>` successfully writes `output/<source-id>.ndjson` and (with `DATABASE_URL`) upserts to `raw.<source_id>`.

### Step 5 — npm script

**File**: `ingest/package.json`

Add in the `scripts` block, alphabetically sorted among the other `ingest:*` entries:

```json
"ingest:<source-id>": "tsx --env-file=.env src/sources/<source-id>/index.ts",
```

**Completion**: `npm run ingest:<source-id>` resolves and runs.

### Step 6 — Source-list README

**File**: `ingest/src/sources/README.md`

Add one row to the "Implemented sources" table, alphabetically sorted. Include:

- Link to the per-source folder
- Provider (e.g., `SSB`, `Udir`)
- One-sentence description
- The `npm run ingest:...` command
- Any important quirk in <120 chars

### Step 7 — dbt source declaration

**File**: `dbt/models/indicators/sources.yml` (or `dbt/models/dimensions/sources.yml` for dimensions)

Add a `tables[]` entry under the `raw` source with:

- `name`: the raw table name (e.g., `ssb_12944`)
- `description`: 2–3 sentence description, references the upstream table
- `loaded_at_field: loaded_at`
- `freshness` block with `warn_after` and `error_after` (count + period)
- `columns:` with at least `not_null` tests on PK columns
- `accepted_values` tests where the value set is known and small

### Step 8 — dbt per-source model

**File**: `dbt/models/indicators/indicators__<source_id_with_underscores>.sql`

**Required content**:

- `{{ config(materialized='table', schema='marts') }}` at top
- `select 'ssb-XXXXX'::text as source_id,` as the first column — hard-coded literal matching the catalogue `id`
- **Canonical column names** per `docs/stack/naming-conventions.md` — rename upstream names as needed
- If the source has prefixed region codes (like `ssb-06913`), strip the prefix in this model
- If the source is kommune-level-capable but includes fylke/nasjon mixed rows, add a computed `kommune_nr` column: `case when length(region_code) = 4 then region_code end as kommune_nr`
- `loaded_at as updated_at` (never expose `loaded_at`)

**Completion**: `dbt run --select indicators__<source_id>` succeeds.

### Step 9 — dbt schema declaration

**File**: `dbt/models/indicators/schema.yml`

Add a `models[]` entry for the new model with:

- Model-level `description`
- Per-column `description` for **every** column (MUST)
- `not_null` on every PK column (MUST)
- `accepted_values` where the set is known and bounded
- `dbt_utils.accepted_range` on year-like columns
- `dbt_utils.unique_combination_of_columns` on the model-level PK
- `relationships` test on `kommune_nr` → `ref('dim_kommune')` when the column exists
- `relationships` test on `fylke_nr` → `ref('dim_fylke')` when the column exists
- `relationships` test on `orgnr` → `ref('dim_orgnr')` when the column exists

### Step 10 — Verify end-to-end

Run, in order, **all** of:

```bash
cd atlas-data-repo/ingest
npm run typecheck                                                   # must pass
npm run migrate                                                     # must succeed (idempotent)
npm run ingest:<source-id>                                          # must succeed
cd ../dbt
uv run --env-file ../ingest/.env dbt run   --select indicators__<source_id>  # must succeed
uv run --env-file ../ingest/.env dbt test  --select indicators__<source_id>  # must pass 100%
```

If any command fails or any test warns, **fix before committing**. No "we'll clean up later."

### Step 11 — Commit

Commit message format: `Add <source-id> (<one-line summary>)`

Co-author line: standard repo convention.

---

## Workflow: add a new `dim_*` (conformed dimension)

Similar to the source workflow, but:

- Step 8 puts the model in `dbt/models/dimensions/`, not `indicators/`
- The dim's source file in `sources.yml` lives in the same folder
- The model's schema.yml lives in `dbt/models/dimensions/schema.yml`
- Every existing indicator that references the dim **MUST** add a `relationships:` test in the same PR
- Canonical vocabulary table in `docs/stack/naming-conventions.md` **MUST** be updated if the dim introduces a new canonical column name

---

## Workflow: modify an existing source

- Raw column changes: add a **new migration file**, do not edit the existing one
- Model column changes: edit the model file directly, update `schema.yml` in the same change
- Renaming a column: done in the dbt passthrough; raw stays as-is
- Retiring a source: add `deprecation_date: YYYY-MM-DD` to the model config; delete after date

---

## PR checklist

Before opening a PR, verify every box. An LLM reviewer should reject a PR that fails any item.

### Catalogue + upstream
- [ ] New source has an entry in `docs/research/samfunnspuls/data-sources.md` (or the broader catalogue) with all required fields
- [ ] `atlas_decision` is set (not `evaluate_later` for production work)
- [ ] `verified_on` is today's date (for new or edited entries)

### Raw layer
- [ ] Migration file added under `migrations/` with sequential number
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
- [ ] All marts column names comply with `docs/stack/naming-conventions.md`
- [ ] No upstream name leaked into marts (checked against "Never in marts" table)
- [ ] Every column has a `description` in `schema.yml`
- [ ] PK columns have `not_null` tests
- [ ] Model has `dbt_utils.unique_combination_of_columns` on PK
- [ ] `relationships` test added for every `*_nr`, `*_code`, `orgnr` column that references a dim
- [ ] `accepted_values` test on columns with bounded, known values
- [ ] `accepted_range` test on year columns
- [ ] `dbt run` succeeds
- [ ] `dbt test` passes 100% (zero failures, zero warnings)

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
4. **MUST NOT** use abbreviations outside the canonical vocabulary in `docs/stack/naming-conventions.md`.
5. **MUST NOT** mix multiple entity levels (kommune + fylke + nasjon) in the same mart column without an explicit `level` column.
6. **MUST NOT** commit without running `dbt run` and `dbt test` — the "it's a trivial change" excuse is the start of every 1800-table mess.
7. **MUST NOT** hand-edit a past migration file. Add a new one.
8. **MUST NOT** expose `raw.*` to any consumer. The public contract is `marts.*` only.
9. **MUST NOT** create per-team or per-source variants of `dim_*` — dims are conformed.
10. **MUST NOT** leave `[TBD]` placeholders in catalogue entries merged to `main` — fill them in or remove the row.

---

## How an LLM should use this file

### Task: "add a new source X"

1. Read `docs/stack/naming-conventions.md` in full.
2. Read `docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md` to understand the end-to-end flow.
3. Read the nearest existing source that matches the new source's shape (3-dim SSB, 4-dim SSB, 5-dim SSB, HTML scrape, etc.) as the template.
4. Execute Steps 1–11 in order.
5. Walk through the PR checklist; fix any failures before proposing commit.
6. Run the verification commands in Step 10; don't claim completion until all pass.
7. Write a commit message in the required format.

### Task: "check compliance of existing code"

1. Walk `dbt/models/` top-down. For each `.sql` + `schema.yml` pair, verify every PR checklist item in the dbt section.
2. Walk `ingest/src/sources/<id>/`. For each folder, verify README has 9 sections + index.ts follows structure.
3. Walk `migrations/`. Verify numbering is sequential and every file is idempotent.
4. Walk `docs/research/samfunnspuls/data-sources.md`. Verify catalogue entries match schema.
5. Report violations as `<file>:<line> — <rule name> — <what's wrong>`.
6. Propose fixes alongside violations.

### Task: "suggest the next source to add"

1. Read `docs/research/samfunnspuls/data-sources.md`.
2. Find sources where `atlas_decision: adopt_v1_core` and no corresponding `ingest/src/sources/<id>/` folder exists.
3. Rank by: simplicity of shape (3-dim first), value to the Coverage-gap explorer, data freshness.
4. Propose the top candidate with a one-paragraph rationale.

---

## Authoritative reference

When this file conflicts with something else in the repo, **this file wins** unless the conflict is with `docs/stack/naming-conventions.md` (that file wins for naming). Fix the other place; don't create a divergent local rule.
