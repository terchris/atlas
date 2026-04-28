# Investigate: Multi-NGO supply data-model extensions

> **IMPLEMENTATION RULES:** Before implementing any plan from this investigation, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog

**Goal**: Capture three data-model extensions that surfaced during the Folkehjelp investigation but are multi-NGO concerns — `dim_chapter.source_url`, `dim_chapter.chapter_subtype`, and the `chapter_kommune_coverage` link table that lets `chapter_level='regional'` rows declare which kommuner they serve. All three apply to every NGO Atlas ingests, not only Folkehjelp.

**Last Updated**: 2026-04-24

---

## Scope

**In scope:**
- Schema design and rationale for the three extensions.
- Population strategy (each NGO populates from its own ingest).
- Retroactive backfill for Red Cross.

**Out of scope:**
- Per-NGO scrape implementation — each NGO has its own investigation + PLANs.
- Generic scraping infrastructure — see [`INVESTIGATE-ngo-scraping-infrastructure.md`](../completed/INVESTIGATE-ngo-scraping-infrastructure.md).
- Coverage-gap mart consumption — designed so it can opt in later without a schema change.

---

## Why this exists

The Folkehjelp investigation surfaced three changes to the supply data model that were originally framed as NF-specific but are actually generic:

1. **`source_url`** — once we scrape, every chapter has a public URL we want to deep-link to. Red Cross has it too (`branchUrl` in the API dump); we just didn't store it.
2. **`chapter_subtype`** — non-geographic chapters (Solidaritetsungdom, hospital-anchored, student-anchored) need to be distinguishable from geographic chapters that are missing kommune data. NF has many; Red Cross's RØFF entities are similar; future NGOs likely have more.
3. **`chapter_kommune_coverage`** — every multi-level NGO defines its own region structure (Red Cross 19 distrikter, NF 14 regions, N.K.S. independent foreninger, Frelsesarmeen 5 divisioner). Region boundaries don't align with SSB fylker. The data model knows the regional row exists but not which kommuner it serves.

Each is small individually; bundling them in one investigation keeps the rationale together and lets one PLAN ship them.

---

## Section A — `dim_chapter.source_url`

### A.1 Column

```sql
-- dim_chapter is a dbt-materialised table; in practice the column is added by
-- updating dim_chapter.sql's SELECT and re-running dbt. SQL shown here for
-- design intent.
ALTER TABLE marts.dim_chapter ADD COLUMN source_url TEXT;
```

NULL when:
- The chapter is synthesised (e.g., a regional rollup with no public page).
- The NGO doesn't expose per-chapter URLs.

Otherwise: full canonical URL of the chapter's public page on the NGO's website.

### A.2 Population per NGO

`dim_chapter.source_url` is a marts column. Its raw-side source depends on whether the NGO ingest is scraper-sourced or API-sourced:

| NGO | Ingest type | Raw column | Notes |
|---|---|---|---|
| Red Cross | API-sourced (Red Cross JSON dump) | `raw.redcross_branches.source_url` (added by this PLAN; populated from `branchUrl` API field) | [Scraping infra §C.5](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#c5-mandatory-columns-for-scraper-raw-tables--q20) explicitly does *not* apply to API-sourced raw tables; column name is local choice. |
| Folkehjelp | Scraper-sourced | `raw.folkehjelp_chapters.url` (the §C.5 mandatory column) | The §C.5 `url` column is the public chapter page URL — same data we want in `dim_chapter.source_url`. Supply staging propagates `url` → `source_url`. |
| Future NGO | Either | Scraper: `raw.<source>_*.url` (§C.5). API: per ingest convention. | Supply staging always lands the value in `dim_chapter.source_url`. |

### A.3 Red Cross retroactive backfill

The current `raw.redcross_branches` doesn't store `branchUrl`. Steps:

1. Add `source_url TEXT` column to `raw.redcross_branches` (migration). Naming choice: `source_url` (not `url`) to make the API-vs-scraper distinction explicit; §C.5 doesn't apply because Red Cross is API-sourced.
2. Update `ingest/src/sources/redcross-branches/index.ts` to write the field.
3. Re-run `npm run ingest:redcross-branches` to backfill.
4. Update `supply__redcross_branches.sql` to propagate the column to `dim_chapter.source_url`.

---

## Section B — `dim_chapter.chapter_subtype`

### B.1 Column

```sql
ALTER TABLE marts.dim_chapter ADD COLUMN chapter_subtype TEXT;
```

NULL by default (normal geographic chapter). Filled when the chapter is non-geographic or has a structurally distinct role.

### B.2 Initial vocabulary

| Value | Meaning | Example |
|---|---|---|
| `youth-political` | Politically-engaged youth wing | NF Solidaritetsungdom |
| `youth-health` | First-aid / rescue youth wing | NF Sanitetsungdom (when separately registered), Red Cross RØFF (when separately registered) |
| `student` | University-anchored | NF Studentgruppe Blindern, Bislett, Kristiania |
| `hospital` | Hospital-anchored | NF Sanitet Haukeland |
| `umbrella` | National-level entity not tied to a kommune | NF Sentralt |

Frontend uses this to filter chapter-finder maps to "geographic chapters only" (`chapter_subtype IS NULL`) when showing kommune-anchored supply.

### B.3 Constraint policy — **[Q1]** open

For v1: free-text TEXT, no `accepted_values` constraint. Vocabulary will stabilise as more NGOs ingest. Promote to enum-via-`accepted_values` test once 3+ NGOs are using subtypes consistently.

### B.4 Why a column instead of inferring

We could infer "non-geographic" from `kommune_nr IS NULL AND chapter_level = 'local'`. Rejected: that pattern also matches "data missing" (chapter exists in source but we couldn't resolve a kommune), which is a different signal. Explicit subtype is a deliberate "this chapter is **intentionally** not kommune-anchored".

---

## Section C — `chapter_kommune_coverage` link table

### C.1 The problem

Every multi-level NGO defines its own region structure that does not necessarily align with SSB's 15 fylker:

- **Red Cross**: 19 distrikter (boundaries pre-date the 2020 fylke reform).
- **Norsk Folkehjelp**: 14 named regions (close to fylker but with consolidations).
- **N.K.S.**: federation of independent foreninger; loose regional structure.
- **Frelsesarmeen**: 5 divisioner that don't map to fylker at all.

Today's `dim_chapter` carries these as `chapter_level='regional'` rows with `kommune_nr=NULL`. The data model **knows the row exists** but **does not know which kommuner it serves**. So queries like "which chapters serve Stange?" can use the local-level rows directly, but cannot include the regional-level supply (Distrikt Innlandet's office in Hamar) without additional structure.

### C.2 Proposed schema

```sql
-- New marts model: marts.chapter_kommune_coverage
-- One row per (regional_chapter, kommune_it_covers).
-- Local-level chapters do NOT need rows here — their kommune_nr lives on dim_chapter.

CREATE TABLE marts.chapter_kommune_coverage (
  chapter_id    TEXT NOT NULL REFERENCES dim_chapter(chapter_id) ON DELETE CASCADE,
  kommune_nr    TEXT NOT NULL REFERENCES dim_kommune(kommune_nr),
  source        TEXT NOT NULL,                -- 'declared' | 'inferred'
  updated_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (chapter_id, kommune_nr)
);
```

### C.3 `source` distinguishes

- `declared` — the NGO publishes the region's territorial coverage explicitly. Authoritative.
- `inferred` — derived from membership: "this region's lokallag are in kommuner X, Y, Z, so the region covers at least these". Cheap to compute, may under-report (region might cover kommuner with no lokallag).

### C.4 Population per NGO

Built by per-NGO `supply__<ngo>_chapter_kommune_coverage.sql` staging models. UNION ALL into the marts model. For v1, most rows are `inferred` (rolled up from `parent_chapter_id` → child `kommune_nr`); `declared` rows wait for a future scrape of NGO-published region pages.

### C.5 Retroactive backfill for Red Cross

Backfill `inferred` rows by joining `dim_chapter` to itself: for each regional chapter, find children where `parent_chapter_id` matches; collect their `kommune_nr` values. Same staging-model pattern that Folkehjelp will use.

### C.6 Query implications

Coverage-gap queries change shape:

```sql
-- Without coverage: only local-level chapters count
select kommune_nr from dim_chapter where chapter_level='local' and is_active

-- With coverage: regional rows also count, via the link table
select kommune_nr from dim_chapter where chapter_level='local' and is_active
union
select kommune_nr from chapter_kommune_coverage cc
join dim_chapter dc on cc.chapter_id = dc.chapter_id
where dc.chapter_level='regional' and dc.is_active
```

Per the [Q48] resolution in [`INVESTIGATE-ngo-supply-data-model.md`](../completed/INVESTIGATE-ngo-supply-data-model.md), v1 Coverage-gap still uses local-only. The link table is built so Coverage-gap can opt in to "regional presence counts" later without a schema change.

---

## Decisions resolved

These decisions are inherited from the Folkehjelp investigation conversation (2026-04-23) and recorded here as the canonical home:

1. ~~**[Q2]**~~ Add `dim_chapter.source_url` column. **Resolved 2026-04-23**.
2. ~~**[Q3]**~~ Add `dim_chapter.chapter_subtype` column. **Resolved 2026-04-23**.
3. ~~**[Q4]**~~ Add `marts.chapter_kommune_coverage` link table with `source IN ('declared', 'inferred')`. **Resolved 2026-04-23**.
4. ~~**[Q5]**~~ Populate from membership ('inferred') for v1; declared rows wait for future scrapes. **Resolved 2026-04-23**.
5. ~~**[Q6]**~~ Retroactive backfill for Red Cross — `source_url` from `branchUrl`, coverage from `parent_chapter_id` rollup. **Resolved 2026-04-23**.

---

## Open Questions

1. **[Q1]** `chapter_subtype` `accepted_values` constraint — wait until vocabulary stabilises across 3+ NGOs.
2. **[Q7]** Should the staging models for coverage live under `dbt/models/supply/` (with the per-NGO staging) or `dbt/models/dimensions/` (alongside `dim_chapter` because the table feels dimensional)? Recommend `supply/` to keep all per-source staging together.
3. **[Q8]** Do we want a `coverage_role` column too — "primary chapter for this kommune" vs "secondary"? Probably yes once we ingest 3+ NGOs and start asking "who's the main provider in kommune X". Defer.

---

## Next Steps

- [ ] **PLAN-001-multi-ngo-supply-model-extensions.md** (~3–4h)
  - Add `source_url TEXT` to `raw.redcross_branches` (migration).
  - Update `ingest/src/sources/redcross-branches/index.ts` to write `branchUrl`.
  - Re-run `npm run ingest:redcross-branches` to backfill.
  - Add `source_url` and `chapter_subtype` columns to `dim_chapter.sql` SELECT and `dim_chapter` schema.yml.
  - Update `supply__redcross_branches.sql` to propagate `source_url`.
  - New dbt model `marts.chapter_kommune_coverage` + schema.yml + tests.
  - New staging `supply__redcross_chapter_kommune_coverage.sql` (Red Cross retro coverage).
  - Update [`naming-conventions.md`](../../../../docs/stack/naming-conventions.md) with `source_url`, `chapter_subtype`, `chapter_kommune_coverage`.
  - `dbt run && dbt test`.

This PLAN is a prerequisite for the Folkehjelp scrape PLAN, which expects `source_url` and `chapter_subtype` to exist on `dim_chapter` and writes its own coverage rows alongside chapter rows.

---

## Files this investigation will produce

**New tables:**
- `marts.chapter_kommune_coverage`

**New columns on existing tables:**
- `dim_chapter.source_url`
- `dim_chapter.chapter_subtype`
- `raw.redcross_branches.source_url` (raw-side change for Red Cross backfill)

**New dbt models:**
- `marts.chapter_kommune_coverage` + schema.yml + tests
- `marts.supply__redcross_chapter_kommune_coverage` (Red Cross-specific staging)

**Documentation:**
- Extend [`docs/stack/naming-conventions.md`](../../../../docs/stack/naming-conventions.md): `source_url`, `chapter_subtype`, `chapter_kommune_coverage`.
- Auto-regenerate [`docs/stack/erd.md`](../../../../docs/stack/erd.md).

---

## Companion investigations

- [`INVESTIGATE-ngo-scraping-infrastructure.md`](../completed/INVESTIGATE-ngo-scraping-infrastructure.md) — generic scraping toolkit. Of particular relevance: [§C.5 (mandatory raw-table columns including `url`)](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#c5-mandatory-columns-for-scraper-raw-tables--q20) — for scraper-sourced NGOs, the public-facing URL surfaces as `raw.<source>_*.url` and propagates from there to `dim_chapter.source_url` (see A.2). API-sourced NGOs (Red Cross today) are exempt and use a per-ingest column name like `source_url` instead.
- [`INVESTIGATE-folkehjelp-supply.md`](./INVESTIGATE-folkehjelp-supply.md) — first new consumer of these extensions.
