# The data journey — SSB 08764 end-to-end

If you've never seen Atlas's data pipeline before, this is the page to read first. It traces **one source — SSB 08764 (children in low-income households) — from upstream to a user's browser**, so the pieces have names and shapes when you read [adding-a-source.md](./adding-a-source.md) or [ingest-modules.md](./ingest-modules.md).

SSB 08764 is the canonical example: a clean annual measurement source, ~10⁴ rows, no scraping, the same shape as ~16 other implemented sources. Where the journey wouldn't generalise (HTML scrapes, NGO supply data), there's a note at the end.

For the original design investigation that ratified this pattern (and the alternatives we considered), see [INVESTIGATE-data-journey-pattern.md](../ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md).

---

## The journey at a glance

```
  [SSB PxWebAPI — table 08764]                upstream, not ours
        │  annual release (~March)
        ▼
  [TypeScript: src/sources/ssb-08764/index.ts]
        │  fetch + parse JSON-stat2 + upsert
        ▼
  [Postgres  raw.ssb_08764]                    ← raw landing (verbatim)
        │
        ▼
  [dbt model: indicators__ssb_08764]           ← per-source passthrough
        │  one of ~16 sibling indicator models
        ▼
  [dbt fact: fact_kommune_indicators]          ← unioned cross-source mart
        │  joined to dim_kommune, dim_fylke
        ▼
  [Postgres  marts.fact_kommune_indicators]    ← serving layer (table)
        │  + mart_*_summary, mart_coverage_gap_* views
        ▼
  [PostgREST  api.atlas.helpers.no]            ← public API (forthcoming)
        │  + Atlas's Next.js dogfood (today: direct SQL)
        ▼
  [Next.js page: /coverage-gap/barnefattigdom]
        │
        ▼
  [User's browser]                              choropleth + chapters layer
```

---

## Stage 1 — The source (upstream, not ours)

SSB publishes table 08764 annually. Typical release window: late February / early March, covering the prior calendar year.

- **Endpoint**: `https://data.ssb.no/api/pxwebapi/v2/tables/08764`
- **Format**: JSON-stat2 (dimension-oriented; standard across SSB tables)
- **Auth**: none
- **Rate limits**: 30 requests/minute/IP, 800 000 cells/request — plenty for one full table pull
- **Release calendar**: SSB has a metadata endpoint per table announcing next update; we can poll it

Nothing we own; nothing we control. Everything downstream has to be resilient to the source being slow, stale, or temporarily broken.

## Stage 2 — TypeScript ingestion

The ingest module lives at [`atlas-data/ingest/src/sources/ssb-08764/index.ts`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/ssb-08764/index.ts). The full template is in [ingest-modules.md](./ingest-modules.md); the shape is:

```typescript
// src/sources/ssb-08764/index.ts (sketch)
import { fetchPxWebTable, parseJsonStat2 } from "../../lib/pxweb";
import { writeRawRows } from "../../lib/postgres";

export const SOURCE_ID = "ssb-08764";

export async function run() {
  const data = await fetchPxWebTable("08764", {
    Region: "*",          // all kommuner, fylker, nasjon
    Tid: "*",             // all years
  });

  const rows = parseJsonStat2(data).map(row => ({
    region_code:    row.dimensions.Region,
    year:           Number(row.dimensions.Tid),
    contents_code:  row.dimensions.ContentsCode,
    contents_label: row.dimensions.ContentsCodeLabel,
    value:          row.value,
    status:         row.status ?? null,
    loaded_at:      new Date(),
  }));

  await writeRawRows("raw.ssb_08764", rows, {
    conflictKey: ["region_code", "year", "contents_code"],
  });

  return { rowCount: rows.length, latestYear: Math.max(...rows.map(r => r.year)) };
}
```

Key points:

- **Shared utilities** (`pxweb`, `postgres`, etc.) live in [`src/lib/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/lib). Source modules should never reimplement them.
- **No reshaping** — column names match upstream. Renaming happens in dbt, not here.
- **Idempotent** — re-running against an already-loaded year is safe (`upsert` on the natural key).
- **Duration**: typically 3–6 seconds for a full pull (network-dominated).

Run locally:

```bash
cd atlas-data/ingest
npm run ingest:ssb-08764
```

## Stage 3 — Raw landing in Postgres

Schema and table created once via a migration ([`atlas-data/migrations/`](https://github.com/terchris/atlas/tree/main/atlas-data/migrations)):

```sql
create schema if not exists raw;

create table if not exists raw.ssb_08764 (
  region_code     text not null,
  year            int  not null,
  contents_code   text not null,
  contents_label  text,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, year, contents_code)
);

comment on table raw.ssb_08764 is
  'SSB 08764 — Persons under 18 in low-income households (EU/OECD scale), per region, annual.';
```

The `raw.*` schema is the **landing layer** — verbatim upstream shape. Atlas does not expose `raw.*` to any consumer; reshaping happens in dbt.

## Stage 4 — dbt transformation

dbt models live under [`atlas-data/dbt/models/`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models). Three transformation steps:

### (a) Per-source model

```sql
-- dbt/models/indicators/indicators__ssb_08764.sql
{{ config(materialized='table', schema='marts') }}

select
  'ssb-08764'                as source_id,    -- hard-coded literal
  region_code,
  case when length(region_code) = 4 then region_code end as kommune_nr,
  year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at as updated_at
from {{ source('raw', 'ssb_08764') }}
```

Every per-source model follows the same shape — `source_id` literal first, canonical column names per [naming-conventions.md](https://github.com/terchris/atlas/blob/main/docs/stack/naming-conventions.md), `loaded_at` renamed to `updated_at`. ~20 lines per source.

### (b) Cross-source fact

[`models/marts/fact_kommune_indicators.sql`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/models/marts/fact_kommune_indicators.sql) unions every `indicators__*` model and joins to the conformed dimensions:

```sql
{{ config(materialized='table', schema='marts') }}

with all_indicators as (
  {{ dbt_utils.union_relations(refs([
    ref('indicators__ssb_08764'),
    ref('indicators__ssb_06913'),
    ref('indicators__fhi_bor_alene'),
    -- ... one per implemented source
  ])) }}
)
select
  i.source_id, i.kommune_nr, k.kommune_name, k.fylke_nr, f.fylke_name,
  i.year, i.contents_code, i.contents_label,
  i.value, i.status,
  k.is_active as kommune_is_active,
  i.updated_at
from all_indicators i
join {{ ref('dim_kommune') }} k using (kommune_nr)
left join {{ ref('dim_fylke') }} f using (fylke_nr)
where i.kommune_nr is not null
```

### (c) API-shaped views

Frontend queries against `fact_kommune_indicators` would be too low-level for a public API. So Atlas adds purpose-built views under [`models/marts/api/`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models/marts/api) — one per public endpoint:

- `mart_indicator_summary` — backs `/data` (per-indicator latest-year summary)
- `mart_coverage_gap_barnefattigdom` — backs `/coverage-gap/barnefattigdom` (this map)
- `mart_kommune_local_chapters` — backs `/kommuner/[kommune_nr]`
- ...

These are the API contract. Each has full descriptions on every column (enforced by [check-osmosis](./check-osmosis.md)) so PostgREST projects them as documented OpenAPI endpoints.

For the full mart-views story, see [PLAN-001](../ai-developer/plans/completed/PLAN-001-api-mart-views.md).

## Stage 5 — Tests catch anomalies

dbt tests run on every change:

- `not_null` on key columns (`kommune_nr`, `year`, `contents_code`)
- `accepted_range` on years (e.g. 2000 ≤ year ≤ 2040)
- `accepted_values` on bounded enums (`contents_code in (...)`)
- `unique_combination_of_columns` on the natural key
- `relationships` from `kommune_nr` → `dim_kommune` (FK enforcement)

Run them:

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt test --select mart_coverage_gap_barnefattigdom+
```

Test failures block merge. See [testing.md](./testing.md) for the full local-testing workflow.

## Stage 6 — Serving layer in Postgres

After dbt, `marts.mart_coverage_gap_barnefattigdom` looks like:

```
 kommune_nr | kommune_name | fylke_name | year | value_pct | personer
 -----------+--------------+------------+------+-----------+----------
 5601       | Alta         | Finnmark   | 2023 |     11.2  |     487
 0301       | Oslo         | Oslo       | 2023 |     12.8  |   28402
 ...
```

Indexed on `kommune_nr`. Queries against it are millisecond-scale.

This is the schema the Next.js frontend reads from today. `marts.*` is the **internal data layer** — the stable contract internal Atlas code (frontend, ad-hoc analysts) builds on. The frontend has no knowledge of `raw.*`, no knowledge of PxWebAPI, no knowledge of dbt.

## Stage 7 — PostgREST projects the public API via `api_v1.*`

PostgREST (owned + deployed by UIS) sits in front of an auto-generated `api_v1.*` schema — wrapper views over `marts.mart_*` (one per `models/marts/api/` model). The wrapper layer is the **external public contract**; `marts.*` stays internal. PostgREST projects:

- One `GET` endpoint per `api_v1.*` view
- Filtering via `?col=eq.X` query params
- An auto-generated Swagger 2.0 spec at `api.atlas.helpers.no/docs`, with column descriptions sourced verbatim from `schema.yml` (propagated through dbt → `COMMENT ON COLUMN` on `marts.*` → copied onto `api_v1.*` by the generator)

So the descriptions you write in `schema.yml` are the docs an external developer reads. See [api-v1.md](./api-v1.md) for the wrapper layer + generator, and [dbt-osmosis.md § why Atlas relies on it](./dbt-osmosis.md#why-atlas-relies-on-it) for the description propagation.

## Stage 8 — Next.js queries (dogfood)

Today, the Next.js frontend queries `marts.*` directly via SQL (read-only Postgres role). The frontend's eventual migration to call PostgREST's `api_v1.*` endpoints — same HTTP API external developers use — is the "dogfood" pattern, tracked separately in PLAN-E.

```typescript
// atlas-contributor-frontend/app/coverage-gap/barnefattigdom/page.tsx (sketch)
const rows = await sql<KommuneRow[]>`
  select kommune_nr, kommune_name, fylke_name, year, value_pct, personer
  from marts.mart_coverage_gap_barnefattigdom
  order by kommune_nr
`;
```

Three indexed queries, parallelised. Total sub-50ms on Atlas's data size. Cached at the route level.

## Stage 9 — Render in the browser

`/coverage-gap/barnefattigdom` is a React Server Component. It renders:

- **Choropleth base layer** — 356 kommune polygons from a static Kartverket GeoJSON, fill colour mapped from each polygon's `value_pct`
- **Tooltip** — kommune name + value + count
- **Chapter overlay** (forthcoming) — Red Cross / Folkehjelp / etc. local chapters that operate in each kommune

End of journey. The user sees a map.

---

## What this generalises to

The same shape applies to **every API-based measurement source**:

| Stage | Same | Differs |
|---|---|---|
| 1 — upstream | API-based | endpoint, auth, format |
| 2 — ingest | TypeScript module + shared libs | dimension parsing |
| 3 — raw landing | `raw.<source>` table | column set |
| 4a — per-source dbt | `indicators__<source>.sql` | column renaming, `kommune_nr` derivation |
| 4b — cross-source fact | `fact_kommune_indicators` | unioned in |
| 4c — api view | `mart_*` view | per-feature shape |
| 5 — tests | same battery | per-source key columns |
| 6–9 — downstream | identical | n/a |

For most new sources, the workflow in [adding-a-source.md](./adding-a-source.md) walks you through the per-source pieces in 11 steps.

## Where this doesn't generalise

- **HTML scraping sources** (Folkehjelp and other NGOs without an API) — Stage 2 has an extended folder layout (`discover.ts`, `parse.ts`, `__tests__/fixtures/`), Stage 3 raw tables have additional mandatory columns (`url`, `record_hash`, `is_active`). See [ingest-modules.md § scraping convention](./ingest-modules.md#scraping-sources).
- **NGO supply data** (chapters, activities, coverage) — different fact / dim shape (`fact_chapter_activities`, `dim_chapter`, `dim_activity`); different per-NGO supply staging models (`supply__redcross_*`, `supply__frr_*`). The journey shape is the same; just different facts/dims.
- **Brreg legal-entity metadata** — handled by the generic `refresh:brreg-enheter` flow; you don't add a new ingest source per NGO. See [adding-a-source.md § prerequisites](./adding-a-source.md#prerequisites).

---

## Cross-references

- [adding-a-source.md](./adding-a-source.md) — the procedural 11-step workflow
- [ingest-modules.md](./ingest-modules.md) — ingest-side template (`index.ts` shape, README structure, scraping convention)
- [dbt-osmosis.md](./dbt-osmosis.md) — schema.yml description propagation
- [check-osmosis.md](./check-osmosis.md) — the description gate
- [INVESTIGATE-data-journey-pattern.md](../ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md) — the original design investigation (full historical context + alternatives considered)
- [PLAN-001-api-mart-views.md](../ai-developer/plans/completed/PLAN-001-api-mart-views.md) — built the 9 `mart_*` views for the public API surface
- [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/blob/main/docs/stack/naming-conventions.md) — canonical column vocabulary
