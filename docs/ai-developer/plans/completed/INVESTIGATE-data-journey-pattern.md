# Investigate: End-to-end data journey pattern (worked example: SSB 08764)

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Ground the narrowed Atlas v1 stack decisions in a single concrete end-to-end example — from upstream SSB source to pixels on a user's screen — before committing to the pattern across ~24 Samfunnspuls-traced sources and the broader Atlas catalogue.

**Last Updated**: 2026-04-21
**Completed**: 2026-04-22

---

> **Status note (2026-04-22):** This is a **completed design investigation**. The pattern walked through here was adopted and 19 sources have been built using it. For the **current source pattern** (folder layout, command names, conventions) see [`../../../../atlas-data-repo/ingest/src/sources/README.md`](../../../../atlas-data-repo/ingest/src/sources/README.md). This document is preserved for historical/onboarding reference — it shows the *why* behind the current shape.
>
> Specific drift to be aware of: the original walkthrough used `pnpm` and `src/ingest/sources/<id>.ts` (file per source); the implemented pattern uses `npm` and `src/sources/<id>/index.ts` (folder per source).

---

## What this investigation produced

The pattern below was investigated, ratified, and is now the basis for all 19 implemented sources. Open items at the time of investigation (dbt confirmation, transformation layer pattern, observability shape) have all been closed.

The source chosen for the worked example — **`ssb-08764`**, "Antall barn og unge under 18 år som tilhører husholdninger med lavinntekt (EU-60)" — is:

- Already the worked example in `docs/research/samfunnspuls/data-source-schema.md`
- Marked `atlas_decision: adopt_v1_core` in `docs/research/samfunnspuls/data-sources.md`
- A clean **measurement** source (no scraping, no bespoke extract)
- Annual cadence, O(10⁴) rows — representative of the dominant source shape
- A primary signal for the **Coverage-gap explorer**, which is the v1 feature that justifies most of Atlas's data layer

Most other Samfunnspuls-traced sources follow the same shape. Where this journey wouldn't generalise cleanly (HTML scrapes, bespoke extracts, the Red Cross internal feed), there's a note in the final section.

---

## Stack assumptions at the time of investigation

What had been settled when this was written:

- **TypeScript** for ingestion code
- **Dagster** for orchestration (scheduling, freshness, dependencies, UI, alerts)
- **Postgres** (in UIS) for both raw landing and marts serving
- **Next.js** (App Router, server components) for the frontend
- No **Cube**, no **Airbyte**, no **Spark**, no **Authentik/Gravitee** on the v1 public path
- Observability via UIS-native **Loki / Prometheus / Grafana**

What was provisional then, but has since been ratified:

- **dbt** for the Postgres transformation layer — ✅ now ratified, see "dbt scope" in [`../../../stack/suggested-stack.md`](../../../stack/suggested-stack.md)
- **MapLibre GL** for the map rendering — 🟡 still open at time of completion (`goal.md` says "likely MapLibre or Leaflet"); see "Open items still to settle" in [`../../../stack/suggested-stack.md`](../../../stack/suggested-stack.md)
- **Kartverket** GeoJSON as the source of kommune boundary geometry — 🟡 still open at time of completion

---

## The journey at a glance

```
  [SSB PxWebAPI — table 08764]
        │
        │  annual release (~March, for prior calendar year)
        ▼
  [Dagster asset: ssb_08764]
        │  scheduled run → Dagster Pipes
        ▼
  [TypeScript: src/sources/ssb-08764/index.ts]
        │  fetch + parse JSON-stat2 + normalise
        ▼
  [Postgres  raw.ssb_08764]                    ← raw landing
        │  downstream dbt trigger
        ▼
  [dbt model: indicators__ssb_08764]
        │
        ▼
  [dbt union:  indicator_values]  ⟵ every per-source indicator table
        │
        ▼
  [dbt join:   kommune_indicators]  ⟵ adds kommune_dim (name, fylke, pop)
        │
        ▼
  [Postgres  marts.kommune_indicators]         ← serving layer
        │  Next.js React Server Component queries directly
        ▼
  [Next.js page: /coverage-gap/barnefattigdom]
        │  MapLibre + React
        ▼
  [User's browser]
```

---

## Stage 1 — The source (upstream, not ours)

SSB publishes table 08764 annually. Typical release window is late February / early March, covering the previous calendar year. Served at:

```
https://data.ssb.no/api/pxwebapi/v2/tables/08764
```

- **Format**: JSON-stat2 (dimension-oriented, standard across SSB tables)
- **Auth**: none
- **Rate limits**: 30 requests/minute/IP, 800 000 cells/request (plenty for one full table pull)
- **Release calendar**: SSB has a metadata endpoint on every table announcing next update; we can poll this.

Nothing we own; nothing we can control. Everything downstream has to be resilient to the source being slow, stale, or temporarily broken.

## Stage 2 — Dagster schedules the run

In the Atlas Dagster project, one `@asset` represents this table:

```python
# dagster/atlas/assets/ssb.py
@asset(
    key="ssb_08764",
    group_name="ssb",
    freshness_policy=FreshnessPolicy(maximum_lag_minutes=60 * 24 * 400),  # 13 months
    auto_materialize_policy=AutoMaterializePolicy.eager(),
)
def ssb_08764(context: AssetExecutionContext):
    return pipes_subprocess_client.run(
        command=["npm", "run", "ingest:ssb-08764"],
        context=context,
    ).get_results()
```

- **Schedule**: annual, anchored ~March 15. Early-release-catching sensor polls SSB metadata weekly.
- **Freshness policy**: the UI turns this asset yellow if it's more than ~13 months old (one annual release cycle plus a month of grace). Alerts fire on breach.
- **Idempotent**: re-running against an already-loaded year is safe (upsert on `(kommune_nr, year)`).

## Stage 3 — TypeScript ingestion runs

Dagster Pipes invokes `npm run ingest:ssb-08764` which runs `src/sources/ssb-08764/index.ts`. Sketch:

```typescript
// src/sources/ssb-08764/index.ts
import { fetchPxWebTable, parseJsonStat2 } from "../../lib/pxweb";
import { writeRawRows } from "../../lib/postgres";

export const SOURCE_ID = "ssb-08764";

export async function run() {
  const meta = await fetchTableMetadata("08764");
  const data = await fetchPxWebTable("08764", {
    Region: "*",          // all kommuner, fylker, nasjon
    Tid: "*",             // all years
  });

  const rows = parseJsonStat2(data).map(row => ({
    kommune_nr: row.dimensions.Region,
    year: Number(row.dimensions.Tid),
    value: row.value,
    unit: "count",
    loaded_at: new Date(),
  }));

  await writeRawRows("raw.ssb_08764", rows, {
    conflictKey: ["kommune_nr", "year"],
  });

  return { rowCount: rows.length, latestYear: Math.max(...rows.map(r => r.year)) };
}
```

- **Shared utilities** (`pxweb`, `postgres`) live in `src/lib/` — the 18-ish other sources differ only by table id and occasionally by dimension normalisation.
- **Return value** is surfaced back to Dagster via Pipes as materialisation metadata: row count, latest year, source id.
- **Duration**: typically 3–6 seconds for a full pull (network-dominated).

## Stage 4 — Raw landing in Postgres

Schema and table created once via a migration:

```sql
create schema if not exists raw;
create table if not exists raw.ssb_08764 (
  kommune_nr text not null,
  year       int not null,
  value      numeric,
  unit       text,
  loaded_at  timestamptz not null,
  primary key (kommune_nr, year)
);
```

Dagster records the materialisation in its metadata DB (a separate database on the same Postgres instance). Atlas's own data tables live in `raw.*` and `marts.*`; Dagster's lives in `dagster.*`. No cross-contamination.

## Stage 5 — dbt transformation

Dagster has first-class dbt integration — each dbt model becomes a Dagster asset automatically. When `ssb_08764` materialises, its downstream dbt models are triggered.

Three transformation steps:

**(a) Per-source model:**

```sql
-- dbt/models/indicators/indicators__ssb_08764.sql
{{ config(materialized='table', schema='marts') }}

select
  'ssb-08764'       as source_id,
  kommune_nr,
  year,
  value,
  'count'           as unit,
  loaded_at         as updated_at
from {{ source('raw', 'ssb_08764') }}
```

Every measurement source gets a model just like this — same columns, different source id. ~20 lines per source, copy-paste with renaming.

**(b) Union:**

```sql
-- dbt/models/indicators/indicator_values.sql
{{ config(materialized='view') }}

{% set source_models = [
    'indicators__ssb_08764',
    'indicators__ssb_12944',
    'indicators__ssb_06947',
    -- ... one per catalogued source
] %}

{% for m in source_models %}
  select * from {{ ref(m) }}
  {% if not loop.last %} union all {% endif %}
{% endfor %}
```

(In practice we use dbt's `dbt_utils.union_relations` macro for this.)

**(c) Join with kommune dimension:**

```sql
-- dbt/models/marts/kommune_indicators.sql
{{ config(materialized='table', schema='marts', indexes=[
    {'columns': ['source_id', 'year']},
    {'columns': ['kommune_nr']}
  ]) }}

select
  iv.source_id,
  iv.year,
  iv.value,
  iv.unit,
  k.kommune_nr,
  k.kommune_name,
  k.fylke_nr,
  k.fylke_name,
  k.population_total,
  k.lat, k.lon,
  iv.updated_at
from {{ ref('indicator_values') }}  iv
join {{ ref('kommune_dim') }}        k  using (kommune_nr)
```

`kommune_dim` is itself a dbt model rebuilt from SSB Klass (the authoritative kommune classification) plus Kartverket-derived centroids. Built once, reused everywhere.

dbt tests catch anomalies: `not_null` on `kommune_nr`, `relationships` to `kommune_dim`, `unique` on `(source_id, kommune_nr, year)`. Test failures mark the asset red in Dagster and block downstream reads.

## Stage 6 — Serving layer in Postgres

After dbt, `marts.kommune_indicators` looks like:

```
 source_id | kommune_nr | kommune_name | fylke     | year | value  | updated_at
-----------|------------|--------------|-----------|------|--------|------------
 ssb-08764 | 5601       | Alta         | Finnmark  | 2023 |    487 | 2026-03-17
 ssb-08764 | 0301       | Oslo         | Oslo      | 2023 | 28 402 | 2026-03-17
 ssb-12944 | 5601       | Alta         | Finnmark  | 2023 |  6.2   | 2026-03-17
 ...
```

Indexed on `(source_id, year)` and `(kommune_nr)`. Queries against it are millisecond-scale.

This is **the only schema Next.js reads from**. Next.js has no knowledge of `raw.*`, no knowledge of PxWebAPI, no knowledge of Dagster or dbt. The marts layer is the stable public contract within Atlas.

## Stage 7 — Next.js server component queries

The page `/coverage-gap/barnefattigdom` is a React Server Component. At render time:

```typescript
// app/coverage-gap/barnefattigdom/page.tsx
import { sql } from "@/lib/db";
import { ChildPovertyMap } from "./map";

export default async function Page() {
  const [year, kommuner, chapters] = await Promise.all([
    sql<{ max_year: number }[]>`
      select max(year) as max_year
      from marts.kommune_indicators
      where source_id = 'ssb-08764'
    `.then(rows => rows[0].max_year),

    sql`
      select kommune_nr, kommune_name, fylke_name, value
      from marts.kommune_indicators
      where source_id = 'ssb-08764'
        and year = (select max(year) from marts.kommune_indicators where source_id = 'ssb-08764')
    `,

    sql`
      select kommune_nr, org, count(*) as n
      from marts.chapters
      group by kommune_nr, org
    `,
  ]);

  return <ChildPovertyMap year={year} kommuner={kommuner} chapters={chapters} />;
}
```

Three indexed queries, parallelised. Total sub-50 ms on our data size. Cached at the route level with `revalidate` matching the asset's expected update cadence.

## Stage 8 — Render in the browser

`ChildPovertyMap` is a client component. It renders:

- **Choropleth base layer** — 356 kommune polygons from a static Kartverket GeoJSON asset (`public/boundaries/kommune-2024.geojson`, ~2 MB gzipped), fill colour mapped from each polygon's `value`.
- **Chapter markers overlay** — bubble markers per kommune showing NGO chapter count, symbolised by organisation.
- **Side panel** — kommune detail, organisation-neutral, with engagement CTAs.

MapLibre GL handles the rendering; React handles state (selected kommune, filters, panel open/close).

Attribution is non-negotiable on any view that shows data from an external source. The sidebar always carries:

> **Barnefattigdom i Norge** — 2023-tall
> Andel barn under 18 år som bor i husholdninger med lavinntekt (EU-60).
> Kilde: [Statistisk sentralbyrå, tabell 08764](https://www.ssb.no/statbank/table/08764)

Attribution text is not hand-written per page — it's generated from the `om_tallene_kilde` field in the source catalogue (`docs/research/samfunnspuls/data-sources.md`). If we ever add a source, the attribution follows automatically.

## Stage 9 — Kari uses it

Kari, our Persona 1, arrives on this page via a homepage "find a way to help" entry. She sees Norway coloured by child-poverty intensity, sees her kommune (Alta) at roughly the national average, and sees three Red Cross chapters + one Norsk Folkehjelp lokallag + one Kirkens Bymisjon-tiltak in Alta.

She clicks Alta. A panel opens:

> **Alta** — 487 barn under 18 år vokser opp i lavinntektshusholdning (EU-60).
> Det tilsvarer 12.3 % av barn i kommunen.
> Det er 5 organisasjoner som jobber med barn i Alta.
> [Se aktiviteter i Alta →]

The deep-link hands her off to the right NGO's signup flow with Alta pre-selected — Atlas has done its job.

---

## Observability — what you see at each stage

| Stage | Surface | What you see |
|---|---|---|
| SSB release calendar | Dagster sensor | "New version of 08764 available since 2026-03-14 — auto-materialising" |
| Dagster asset | Dagster Assets UI | `ssb / ssb_08764` • last run 2026-03-17 04:12 • duration 4.2 s • 4 112 rows • ✅ fresh |
| dbt models | Dagster Assets UI (same grid) | `marts / kommune_indicators` rebuilt 1.8 s after upstream, 8 912 rows, all tests passed |
| Postgres | Grafana (postgres_exporter) | p95 query time for `/coverage-gap/*` = 15 ms over last hour |
| Next.js | Loki (structured logs with `source_id` tag) | Full request traces on errors, filterable by route or source |
| Staleness | Dagster freshness policy | Slack alert if `ssb_08764` older than 13 months |
| End-user experience | Grafana RUM panel | Page load p95 for `/coverage-gap/*` = 1.6 s (cold), 400 ms (warm) |

One operator screen (Dagster's Assets view) shows the whole Atlas data layer's health in one glance. Separate Grafana dashboards cover serving and end-user concerns.

---

## Failure modes, and how the stack absorbs them

| Failure | Symptom | Response |
|---|---|---|
| SSB API down when Dagster runs | Ingestion fetch throws | Dagster retries (exponential backoff, max 3). If still failing, asset stays at previous materialisation; Slack alert fires; Next.js continues serving prior snapshot. |
| SSB API rate-limit hit | 429 response | Back off and retry with jitter. Non-fatal unless repeated. |
| SSB schema change (column renamed, dimension added) | JSON-stat2 parser throws | Dagster marks `ssb_08764` failed. dbt doesn't run. Next.js keeps serving prior snapshot. Engineer fixes the ingestion module; re-run is one click in Dagster UI. |
| dbt test fails (e.g., a `kommune_nr` doesn't exist in `kommune_dim`) | `kommune_indicators` asset fails | Upstream `ssb_08764` stays green. Next.js continues reading the last good `kommune_indicators`. Root cause usually a kommune merger; we update `kommune_dim` and re-run. |
| Postgres slow | Grafana query-latency alert | No corruption, just slow. Inspect pg_stat_statements, add/tune index. Rare at our data size. |
| Next.js build-time query fails | Build fails | Deploy is blocked. Previous deploy keeps serving. Alert fires. |
| Kommune structure change (mergers) | `kommune_dim` drifts from source data | Annual manual update; dbt tests surface the drift early. |

None of these fail-open in a way that corrupts the serving layer. The worst case is **stale data served with no corruption**, which is the correct default for a public NGO portal.

---

## What generalises to other Samfunnspuls sources — and what doesn't

The journey above is essentially the template for every `ssb-*` source in `docs/research/samfunnspuls/data-sources.md`. For 14 of the 24 sources, the only differences are:

- The SSB table id in the URL and the ingest module file name
- Occasionally, dimension-normalisation quirks (e.g., reference years, age-band definitions)
- The dbt per-source model (same shape, different `source_id`)

For the other 10 sources, there are deviations worth naming:

- **Udir sources (×4)** — public stats pages rather than a JSON API, so the ingestion module parses HTML/XLSX instead of JSON-stat2. Everything downstream of `raw.*` is identical.
- **IMDi sources (×3)** — similar: HTML + Excel scrape. Small-cell suppression (n ≤ 4) has to be preserved through transformations (captured as a null, not a zero).
- **NAV (×1)** — has an API but a different JSON shape. Ingestion module is different; downstream identical.
- **Brreg Frivillighetsregisteret** — a registry API, not an indicator. Lives in a separate dbt model tree (`organisations.*`) rather than in `indicator_values`.
- **Red Cross internal (×1)** — bespoke feed, access model TBD. Likely a CSV drop in object storage rather than a pull API. Parking.
- **SSB bespoke extract (×1, covering 3 reports)** — no public table id; the source catalogue entry's `open_questions` flags finding a public-API equivalent.

Adding a new source follows the same motions for any measurement-kind entry — see [`../../../../atlas-data-repo/ingest/src/sources/README.md`](../../../../atlas-data-repo/ingest/src/sources/README.md) for the current step-by-step.

No new infra for each source. That's the point.

---

## Open items — at time of investigation

These were flagged as "to confirm before locking the pattern". Status as of completion (2026-04-22):

1. **dbt** — recommended but not explicitly ratified at time of investigation. ✅ **Now ratified** in [`../../../stack/suggested-stack.md`](../../../stack/suggested-stack.md) "dbt scope" section, with a deliberately narrow seven-pattern surface.
2. **Map library** — MapLibre GL assumed. 🟡 **Still open** — see [`../../../stack/suggested-stack.md`](../../../stack/suggested-stack.md) "Open items still to settle".
3. **Kommune boundary source** — Kartverket GeoJSON as a static build-time asset assumed. 🟡 **Still open**.
4. **Route-level caching**: Next.js `revalidate` tied to asset cadence, or Postgres listen/notify to invalidate on materialisation. 🟡 **Implementation detail**, deferred.
5. **Attribution generation**: sidebar text generated from `om_tallene_kilde`. ✅ **Pattern adopted**.

---

## What this investigation is not

- Not a current source-pattern reference — see [`../../../../atlas-data-repo/ingest/src/sources/README.md`](../../../../atlas-data-repo/ingest/src/sources/README.md) for live conventions.
- Not the v1 stack decision document — that lives in [`../../../stack/suggested-stack.md`](../../../stack/suggested-stack.md).
- Not the data-strategy / scaling document — that lives in [`../../../stack/data-strategy.md`](../../../stack/data-strategy.md).

This is the *historical record* of how the v1 stack was grounded in a concrete worked example before commitment.
