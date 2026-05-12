# Adding a new data source

This is the **end-to-end workflow for adding a new upstream data source to Atlas** — from cataloguing the source to making it queryable through the public API. Written for an external contributor who hasn't seen the codebase before; experienced contributors can skim.

If you've never seen Atlas's data pipeline before, read the [data journey walkthrough](./data-journey.md) first — it traces one source (SSB 08764) end-to-end so you understand what the pieces are. Then come back here for the procedural steps.

---

## What "adding a source" means in Atlas

Atlas's data side is two layers:

1. **Ingest** — TypeScript modules under [`atlas-data/ingest/src/sources/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources) that fetch upstream data (SSB, FHI, Brreg, NGO HTML scrapes) and write to the `raw.*` Postgres schema. Verbatim shape — no renaming or reshaping.
2. **dbt** — SQL models under [`atlas-data/dbt/models/`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models) that transform `raw.*` into `marts.*` (the internal data layer; the external public API is PostgREST against `api_v1.*` wrapper views — see [api-v1.md](./api-v1.md)).

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

### Step 4b — Source manifest

**File**: `atlas-data/ingest/src/sources/<source-id>/manifest.yml`.

The manifest is the per-source catalogue record consumed by `mart_meta_sources`, the dbt docs at [`/lineage/`](https://atlas.sovereignsky.no/lineage/), and the public sources catalogue. Schema lives at [`atlas-data/ingest/src/sources/manifest.schema.json`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/manifest.schema.json) and is enforced by [check-manifests.sh](./check-manifests.md).

Bootstrap the file from upstream metadata where possible:

```bash
cd atlas-data/ingest
npm run sources:bootstrap-manifest -- <source-id>      # creates manifest.yml with TODO placeholders
npm run sources:fill-manifest-todos                    # auto-fills v1 fields from README content
```

Then hand-author the **v2 catalogue fields** the bootstrap leaves empty (the contributor knows the source, the script doesn't):

| Field | Status | What to fill |
|---|---|---|
| `lifecycle` | required | `beta` until first review; promote to `stable` after a maintainer signs off. `deprecated` / `broken` also valid. |
| `time_coverage` | required | `{start, end}` 4-digit years drawn from upstream's time dimension. Use `null` for `start` and `end` only when the cadence is genuinely irregular (organisational data, reference geographies). |
| `keywords` | optional but recommended | 3–6 short keywords (e.g. `[bullying, school, youth, ungdata, kommune]`) drawn from description, title, dimension notes. Searchable on the catalogue. |
| `methodology_notes` | optional | Markdown. Caveats, rolling-average windows, sampling methodology, anything Ola or Lisa would need to cite this source correctly. |
| `suggested_joins` | optional | Other `source_id`s that pair naturally — e.g. `ssb-07459` ↔ `ssb-10826`. The catalogue's "Frequently joined with" surface auto-infers shared join keys; this field supplements where inference is wrong. |
| `sample_query` | optional | One PostgREST URL returning real rows; the catalogue generates a primary-key-templated default when omitted. |
| `feedback_url` | optional | Per-source override of [`publishers.yaml`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/publishers.yaml)'s default "report a data issue" target. Almost never needed. |

**New publisher?** Add an entry to [`atlas-data/ingest/src/sources/publishers.yaml`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/publishers.yaml) with `id`, `display_name` (must match the manifest's `publisher:` field exactly), `homepage`, `logo`, `feedback_url`, `notes`. Add a placeholder SVG to `website/static/img/publishers/<id>.svg`.

**New topic?** Add an entry to [`atlas-data/ingest/src/sources/topics.yaml`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/topics.yaml) with `id`, `name`, `description`, `emoji`, `order`. Discuss in the PR — topics are editorial and we keep the list short.

**Done when**: `./src/sources/check-manifests.sh` exits 0 — schema-valid, every `tags.topic` resolves to a category, every `publisher` resolves to a publishers entry.

**Then regenerate the catalogue.** After the manifest passes the gate, regenerate the public sources catalogue and commit the generator output alongside the manifest:

```bash
cd ../../website
npm run sources:generate
git add src/data/sources-registry.json docs/datasets/ docs/topics/ docs/publishers/
```

The generator emits the per-dataset MDX at `docs/datasets/<source-id>.mdx`, refreshes any per-topic / per-publisher index pages that include the new dataset, and updates `src/data/sources-registry.json`. CI's `check-catalog` job re-runs the generator and fails the PR if the committed output drifts from what the manifests produce — so this step is mandatory before pushing.

See [datasets-catalog.md](./datasets-catalog.md) for the catalogue architecture.

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

### Step 9b — Regenerate `api_v1` if your model is under `models/marts/api/`

If (and only if) your new model is a `mart_<feature>` view living under `models/marts/api/` — i.e. you're adding to the public API surface — re-run the generator:

```bash
cd atlas-data/dbt
./regenerate-api-v1.sh
```

This updates `atlas-data/dbt/api_v1_generated.sql` and `api_v1_state.json`. Inspect the diff: a new `CREATE OR REPLACE VIEW api_v1.<your_view>` block plus per-column `COMMENT ON COLUMN` lines should appear. **Also update [`atlas-data/dbt/tests/api_v1_rowcount_matches_marts.sql`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/tests/api_v1_rowcount_matches_marts.sql)** — add a `union all` line for the new view pair (the test is hand-maintained today; future iteration may auto-generate it).

If your model is in `models/marts/` but NOT under `models/marts/api/` (e.g. a fact or internal mart consumed by other dbt models), skip this step — that view is internal-only.

The drift gate at `./check-api-v1.sh` enforces this; naming-conventions rule #9 codifies the convention. See [api-v1.md](./api-v1.md) for the layer's design rationale.

### Step 10 — Verify end-to-end

Run, in order, **all** of:

```bash
cd atlas-data/ingest
npm run typecheck                                                     # must pass
./src/sources/check-manifests.sh                                      # must pass — manifest schema + cross-file
npm run migrate                                                       # must succeed (idempotent)
npm run ingest:<source-id>                                            # must succeed
cd ../dbt
uv run --env-file ../ingest/.env dbt run  --select indicators__<source_id>   # must succeed
uv run --env-file ../ingest/.env dbt test --select indicators__<source_id>   # must pass 100%
./check-osmosis.sh                                                    # must pass
./check-api-v1.sh                                                     # must pass (only if step 9b applies)
./apply-api-v1.sh                                                     # only if step 9b applies; idempotent
uv run --env-file ../ingest/.env dbt test --select api_v1_descriptions_complete api_v1_rowcount_matches_marts   # only if step 9b applies
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
- Model column changes: edit the model file directly; update `schema.yml` in the same change. **If the model is under `models/marts/api/`, also re-run `regenerate-api-v1.sh` and commit the regenerated artefacts** (rule #9 in naming-conventions.md).
- Renaming a column: do it in the dbt passthrough; raw stays as-is. For api/ models, the rename surfaces in `api_v1.<view>` after regenerate — that's a breaking change for external consumers, treat carefully.
- Retiring a source: add `deprecation_date: YYYY-MM-DD` to the model config; delete after the date.

## Workflow: deprecate then remove a `mart_<feature>` (api_v1 view)

A two-phase process — the api_v1 wrapper has external consumers and can't be dropped abruptly. See [api-v1.md § Deprecating then removing](./api-v1.md#deprecating-then-removing-a-mart_) for the full flow.

**Phase A — Deprecate.** Add a `meta:` block to the model's schema.yml entry indicating deprecation:

```yaml
- name: mart_old_view
  meta:
    deprecated_until: '2026-12-01'
    deprecated_reason: 'Replaced by mart_new_view; see PLAN-XXX'
```

Wrapper still serves traffic; consumers are notified via release notes. Grace period: at least one consumer-notice cycle.

**Phase B — Remove.** After grace period and confirmed no traffic: delete the model from `models/marts/api/`. Run `./regenerate-api-v1.sh` — the generator notices the view is in `api_v1_state.json` but not in the current manifest, and emits `DROP VIEW IF EXISTS api_v1.<name> CASCADE`. Apply via `./apply-api-v1.sh`. Remove the corresponding line from `tests/api_v1_rowcount_matches_marts.sql`.

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

### Manifest
- [ ] `manifest.yml` present in the source folder
- [ ] `lifecycle` set (`beta` by default for new sources)
- [ ] `time_coverage.{start,end}` populated, or both `null` when the cadence is genuinely irregular
- [ ] `keywords[]` populated with 3–6 search terms (recommended)
- [ ] `tags.topic` resolves against [`topics.yaml`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/topics.yaml); new topic added if needed
- [ ] `publisher` matches a `display_name` in [`publishers.yaml`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/publishers.yaml); new publisher entry + logo added if needed
- [ ] `./src/sources/check-manifests.sh` passes (CI runs this on every PR)

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
- [check-manifests.md](./check-manifests.md) — the manifest schema gate
- [datasets-catalog.md](./datasets-catalog.md) — how the public catalogue at /datasets is built
- [setup.md](./setup.md) — dev environment
- [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/blob/main/docs/stack/naming-conventions.md) — canonical vocabulary
- [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md) — implemented-sources reference (per-source examples + planned-sources catalogue)
