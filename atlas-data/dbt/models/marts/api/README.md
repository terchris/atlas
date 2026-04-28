# `marts/api/` — public API surface

This folder contains the `mart_<feature>` dbt views that the Atlas public API
projects via PostgREST. Every view here is a stable, OpenAPI-friendly endpoint
read by both the Atlas Next.js frontend (dogfood) and any external API
consumer.

## What lives here

One `.sql` file per view, all sharing a single [`schema.yml`](schema.yml)
(per the dbt-osmosis "one schema.yml per directory" convention — see
[`../../../../check-osmosis.sh`](../../check-osmosis.sh)).

Current set (PLAN-001, 9 views):

| View | Backs route | Source query |
|---|---|---|
| `mart_indicator_summary` | `/data` | `listIndicators()` |
| `mart_indicator_latest_values` | `/data/[source_id]/[contents_code]` | `loadIndicatorValues()` |
| `mart_indicator_missing_kommuner` | `/data/[source_id]/[contents_code]` | `listMissingKommuner()` |
| `mart_coverage_gap_barnefattigdom` | `/coverage-gap/barnefattigdom` | inline CTE in page.tsx |
| `mart_ngo_index` | `/ngo` | `listNgos()` |
| `mart_ngo_overview` | `/ngo/[slug]` | `getNgoOverview()` |
| `mart_activity_catalog` | `/ngo/[slug]/aktiviteter` | `listActivities()` |
| `mart_distrikt_summary` | `/ngo/[slug]/distrikter` | `listDistrikter()` |
| `mart_kommune_local_chapters` | `/kommuner/[kommune_nr]` | `listChaptersInKommune()` |

## Conventions

- **Materialisation**: `table` (inherited from the `marts:` block in
  [`../../../dbt_project.yml`](../../dbt_project.yml)). PostgREST hits these
  on every API request, so views would re-execute too often.
- **Schema landing**: `marts` — same as everything else under `models/marts/`.
  The `api/` subfolder is purely for source organisation; in Postgres these
  views sit alongside `fact_*`, `dim_*`, etc.
- **Naming**: `mart_<feature>`. Feature is the conceptual API resource, not
  the route or the source table. See
  [`docs/stack/naming-conventions.md § When to add a new mart_<feature>`](../../../../../docs/stack/naming-conventions.md).
- **No filtering inside the SQL**: views always return the full unfiltered
  dataset. Consumers (PostgREST, Next.js, anyone else) filter via standard
  PostgREST query params (`?col=eq.X`).
- **Schema.yml descriptions are mandatory**: PostgREST projects descriptions
  verbatim into the public OpenAPI spec, so this is what external developers
  read to understand each endpoint. The `check-osmosis.sh` strict mode fails
  CI if any column here lacks a description.

## When to add a new `mart_<feature>`

When a new Next.js route (or external API consumer) needs SQL that *cannot*
be expressed as PostgREST column-projection on an existing model. Three
warning signs that you've hit one:

1. The query has a CTE.
2. The query joins ≥ 2 tables and filters on multiple columns.
3. The same query shape appears in two routes.

If only one of those is true, prefer projecting an existing `marts.*` model
through PostgREST. If two or more are true, add a `mart_*` view here so the
SQL lives in dbt (where it gets tests + lineage + an OpenAPI entry) instead
of in a Next.js page file.

## Adding a new view (recipe)

1. Write `mart_<feature>.sql` here. Use `{{ ref('...') }}` for upstream models
   and seeds. Keep `order by` for stable output.
2. Append a new `- name: mart_<feature>` block to [`schema.yml`](schema.yml)
   with full table-level description + every column described.
3. Add tests: `not_null` on key columns, `dbt_utils.unique_combination_of_columns`
   on the natural key, `relationships` for FKs (use
   `config: {severity: warn}` for known data-quality cases).
4. `cd atlas-data/dbt && uv run --env-file ../ingest/.env dbt build --select mart_<feature>`.
5. Verify shape: `dbt show --select mart_<feature> --limit 5`.
6. Run [`../../check-osmosis.sh`](../../check-osmosis.sh) — strict mode
   should stay green.

## Cross-references

- [`website/docs/ai-developer/plans/completed/PLAN-001-api-mart-views.md`](../../../../../website/docs/ai-developer/plans/completed/PLAN-001-api-mart-views.md)
  — the plan that landed the initial 9 views.
- [`website/docs/ai-developer/plans/backlog/INVESTIGATE-public-api-surface.md`](../../../../../website/docs/ai-developer/plans/backlog/INVESTIGATE-public-api-surface.md)
  — the route audit that identified the 9 views.
- [`docs/stack/naming-conventions.md`](../../../../../docs/stack/naming-conventions.md)
  — `mart_<feature>` naming rule and canonical column vocabulary.
