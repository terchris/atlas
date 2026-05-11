# Plan 001: Brreg enheter — generic cross-NGO legal-entity ingest

*(Revised 2026-04-24 mid-Phase-2: the original draft was NF-specific; generalised to cross-NGO per user feedback. Query params live in `landscape.json` per NGO; one shared `raw.brreg_enheter` table.)*


> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Completed

**Goal**: Land a **generic cross-NGO** Brreg Enhetsregister ingest. One shared table `raw.brreg_enheter`, one ingest script `refresh:brreg-enheter`, one shared typed client at `src/lib/brreg/`. Per-NGO query parameters (`navn`, `organisasjonsform`, `nameStartsWith`) live in `landscape.json` — the existing per-NGO source-of-truth file that drives `dim_ngo`. Adding a new NGO is a JSON edit; no new migration, no new script. For v1, only Folkehjelp has a `brreg_query` block in `landscape.json`; 122 rows populate the shared table. After this plan, the Folkehjelp scrape PLAN (PLAN-002) can match chapter slugs against the Brreg-sourced orgnr list, and future NGOs get Brreg coverage via a landscape.json edit only.

**Last Updated**: 2026-04-24
**Completed**: 2026-04-24 — four phases done in one session. Generic `raw.brreg_enheter` + `src/lib/brreg/ngo-units.ts` (reusable `fetchNgoUnits()` helper) + `src/seed-sources/brreg-enheter/` (reads landscape.json, one script for all NGOs) + `src/lib/brreg/` typed client (openapi-typescript + openapi-fetch against `github.com/brreg/openAPI`). Folkehjelp `brreg_query` added to `landscape.json`; 122 rows land (108 in Frivillighetsregisteret, 0 konkurs/avvikling — matches the research). Scope revised mid-Phase-2: originally NF-specific per investigation [Q4]; pulled forward to generic-from-day-one per user feedback. `CONTRIBUTING.md` now documents the Brreg typed-client + landscape.json convention. Final gates: `npm run typecheck` clean, `npm test` 49/49, `npm run migrate` idempotent, `dbt build` PASS=526 WARN=19 ERROR=0 TOTAL=545 (unchanged — sources don't count as PASS items).

**Investigation**: [INVESTIGATE-folkehjelp-supply.md](../backlog/INVESTIGATE-folkehjelp-supply.md) §B.2 — proposed an NF-specific `brreg-enheter` seed-source. Investigation [Q4] deferred the "generalise to parameterised" question to the third NGO; user pulled that forward to day-one during Phase 2 of this PLAN. The generic table + per-NGO `landscape.json` `brreg_query` approach supersedes the investigation's NF-specific schema.

**Prerequisites**:
- [PLAN-001-scraping-infrastructure](../completed/PLAN-001-scraping-infrastructure.md) — shipped; unrelated to this plan in terms of code (Brreg is API-sourced, not a scrape) but the broader ingest repo conventions (`src/lib/`, `src/sources/`, `src/seed-sources/`) are in place.
- PLAN-001-multi-ngo-supply-model-extensions — **not merged yet** (on `feature/multi-ngo-supply-model-extensions` local branch at drafting time, hasn't shipped). Branched parallel sequence. This brreg PLAN has **no code dependency** on the multi-ngo changes: this PLAN adds a raw API-sourced table; multi-ngo adds `dim_chapter.chapter_subtype` + `chapter_kommune_coverage`. Neither touches files the other touches. The "sequence" is a PLAN-level ordering, not a code-level blocker. This PLAN can ship against main without waiting.

**Blocks**: `PLAN-002-folkehjelp-scrape-and-ingest.md` (not yet drafted) — PLAN-002's `supply__folkehjelp_chapters` model joins `raw.folkehjelp_chapters` to `raw.brreg_enheter` (filtered by `navn ILIKE 'Norsk Folkehjelp%'`) on normalised name, which is why Brreg ships first.

**Priority**: Medium

---

## Overview

Four phases, estimated **~3 h**.

**Built in PLAN-001-brreg-enheter:**

- **Shared Brreg typed client** at `atlas-data/ingest/src/lib/brreg/`:
  - `schema.ts` — codegen'd from `brreg/openAPI/specs/enhetsregisteret.json`. Typed `paths`, `components`, responses.
  - `client.ts` — a configured `openapi-fetch` client + a small paginate helper for HAL responses (`_embedded.enheter` + `page.totalPages`).
  - `README.md` — how it works, how to regenerate schema.
  - New dev dep: `openapi-typescript`. New runtime dep: `openapi-fetch`.
  - New npm script: `refresh:brreg-schema` for schema regeneration.
- **Migration**: `025_raw_brreg_enheter.sql` — the shared cross-NGO raw landing table. Columns: `orgnr` PK, `navn`, `organisasjonsform`, `registrert_dato`, `i_frivillighetsreg`, `antall_ansatte`, `konkurs`, `under_avvikling`, `under_tvangsavvikling`, `raw_payload` (full Enhet JSON), `loaded_at`. No `ngo_slug` column — navn/orgnr self-identify. API-sourced (§C.5 scraper conventions don't apply).
- **Generic fetch**: `src/lib/brreg/ngo-units.ts` — `fetchNgoUnits({ navn, organisasjonsform, nameStartsWith })` wraps the typed client + pagination + exact-prefix post-filter. Reusable by any ingest that needs Brreg enheter for a named NGO.
- **Ingest module** at `atlas-data/ingest/src/seed-sources/brreg-enheter/`:
  - `index.ts` — reads `../atlas-ngo-landscape/landscape.json`, iterates every NGO that has a `brreg_query` block, calls `fetchNgoUnits()` for each, upserts to `raw.brreg_enheter` on `orgnr`.
  - `README.md` — source description, refresh cadence note, new-NGO checklist.
  - New npm script: `refresh:brreg-enheter` (generic, not per-NGO).
- **landscape.json edit** — add `brreg_query: { navn, organisasjonsform, nameStartsWith }` to Folkehjelp's entry. The `refresh:atlas-ngo-landscape` script ignores this field (it only copies marts-facing columns to `dim_ngo.csv`); it's ingest-only metadata.
- **dbt source declaration** — `raw.brreg_enheter` registered. Location: `dbt/models/shared/sources.yml` alongside `ingest_runs` + `sitemap_log` (this is cross-NGO shared infrastructure, not per-NGO supply).
- **Docs update** — extend `atlas-data/ingest/src/sources/README.md` with a row pointing at the generic `brreg-enheter` refresh; add a short note in `CONTRIBUTING.md` about the typed-client pattern + the `landscape.json` `brreg_query` convention.

**NOT built in PLAN-001:**

- **`dim_folkehjelp_units` or similar mart** — this PLAN lands raw only. The Folkehjelp scrape PLAN-002 joins `raw.brreg_enheter` to `raw.folkehjelp_chapters` during the `supply__folkehjelp_chapters` staging; no standalone mart.
- **`brreg-icnpo` retrofit to the shared client** — deliberately deferred. `brreg-icnpo` already works against `data.brreg.no` via hand-rolled fetch; switching it to the typed client is a small consistency win, not a correctness fix. File a follow-up "Retrofit brreg-icnpo to the shared typed client" PLAN if/when the pattern proves itself.
- **Live-API polling of Red Cross** (separate workstream; see Folkehjelp investigation §B.2 rationale — Red Cross is still a static JSON dump ingest; swapping it to the Brreg client would be a different effort against a different Brreg API surface).
- **Generalizing to `brreg-ngo-units` parameterised by NGO slug** — per investigation [Q4], NF-specific for v1; generalise when the third NGO needs Brreg unit lookups.

---

## Phase 1: Shared Brreg typed client — IN PROGRESS

### Tasks

- [ ] 1.1 Install dependencies (from `atlas-data/ingest/`):
  ```bash
  npm install openapi-fetch
  npm install --save-dev openapi-typescript
  ```
- [ ] 1.2 Add an npm script `refresh:brreg-schema` that regenerates the schema from the canonical spec:
  ```json
  "refresh:brreg-schema": "openapi-typescript https://raw.githubusercontent.com/brreg/openAPI/master/specs/enhetsregisteret.json -o src/lib/brreg/schema.ts"
  ```
- [ ] 1.3 Create the `src/lib/brreg/` folder and generate the schema: `npm run refresh:brreg-schema`. The resulting `schema.ts` is committed (not gitignored) — codegen output is part of the source tree for reproducibility, regenerated on demand.
- [ ] 1.4 Create `src/lib/brreg/client.ts`:
  ```ts
  /**
   * Typed Brreg Enhetsregister client.
   *
   * Generated schema types come from the official spec at
   * https://github.com/brreg/openAPI (see schema.ts). Regenerate via
   * `npm run refresh:brreg-schema` when Brreg updates the spec.
   *
   * The paginate helper walks HAL responses (_embedded.enheter + page.totalPages).
   */
  import createClient from 'openapi-fetch';
  import type { paths, components } from './schema.js';

  const BASE_URL = 'https://data.brreg.no/enhetsregisteret/api';

  export const brregClient = createClient<paths>({ baseUrl: BASE_URL });

  // Convenience alias for the ubiquitous Enhet shape.
  export type Enhet = components['schemas']['Enhet'];

  // Paginated GET for any HAL endpoint that follows the {_embedded, page} contract.
  // Yields pages; caller controls the stop condition (e.g. break on empty).
  export async function* paginate<T>(
    fetchPage: (page: number) => Promise<{
      _embedded?: Record<string, T[]>;
      page?: { totalPages?: number; number?: number };
    } | undefined>,
    embeddedKey: string,
  ): AsyncGenerator<T[]> {
    let page = 0;
    while (true) {
      const resp = await fetchPage(page);
      if (!resp) return;
      const items = resp._embedded?.[embeddedKey] ?? [];
      if (items.length === 0) return;
      yield items;
      const totalPages = resp.page?.totalPages ?? 0;
      if (page + 1 >= totalPages) return;
      page += 1;
    }
  }
  ```
- [ ] 1.5 Create `src/lib/brreg/README.md` explaining the pattern — schema source, regeneration script, base URL, pagination helper usage.
- [ ] 1.6 Run `npm run typecheck` — confirm the schema compiles and nothing existing broke.

### Validation

```bash
cd atlas-data/ingest
npm install   # if lock file has drift
npm run refresh:brreg-schema
npm run typecheck
```

User confirms: `src/lib/brreg/schema.ts` exists and is ~thousands-of-lines-of-types; `client.ts` compiles; typecheck clean.

---

## Phase 2: `raw.brreg_enheter` migration + ingest

### Tasks

- [ ] 2.1 Check next free migration number with `ls atlas-data/migrations/ | tail -3` (expected 025, but confirm — multi-agent repo). Create `atlas-data/migrations/025_raw_brreg_enheter.sql`:
  ```sql
  -- raw.brreg_enheter — all Norsk Folkehjelp legal entities
  -- from Brreg's Enhetsregister, filtered to organisasjonsform = 'FLI'.
  --
  -- API-sourced (not a scrape); §C.5 mandatory scraper columns do NOT
  -- apply. Follows the existing raw.<source> convention.
  --
  -- Populated by atlas-data/ingest/src/seed-sources/brreg-enheter/.
  -- Expected ~121 rows based on 2026-04-23 research.

  create table if not exists raw.brreg_enheter (
    orgnr               text        primary key,
    navn                text        not null,
    organisasjonsform   text        not null,        -- 'FLI' for all rows here
    registrert_dato     date,                         -- registrering.registreringsdatoEnhetsregisteret
    i_frivillighetsreg  boolean     not null default false,
    antall_ansatte      integer,
    raw_payload         jsonb       not null,        -- full Brreg response entity, for audit + future field extraction
    loaded_at           timestamptz not null default now()
  );

  comment on table raw.brreg_enheter is
    'All Norsk Folkehjelp legal entities (organisasjonsform=FLI) from Brreg Enhetsregister. Written by ingest/src/seed-sources/brreg-enheter via the shared typed client at src/lib/brreg/.';
  ```
- [ ] 2.2 Run `npm run migrate`. Verify the table exists and is empty.
- [ ] 2.3 Create `atlas-data/ingest/src/seed-sources/brreg-enheter/index.ts`:
  - Imports `brregClient` + `paginate` from `../../lib/brreg/client.js`.
  - Query: `GET /enheter?navn=norsk+folkehjelp&organisasjonsform=FLI&size=100` (paginated).
  - For each `Enhet`, map to the raw schema (use typed response fields; store the full entity as `raw_payload`).
  - Upsert on `orgnr` via `upsert()` helper from `src/lib/postgres.ts` (existing pattern).
  - Logging via the existing `createLogger` helper — `info` on start, page boundaries, and end with row-count summary.
- [ ] 2.4 Create `atlas-data/ingest/src/seed-sources/brreg-enheter/README.md`:
  - Source: Brreg Enhetsregister (`data.brreg.no`).
  - Query: `navn=norsk+folkehjelp&organisasjonsform=FLI`.
  - Expected rows: ~121 (121 Brreg rows observed 2026-04-23; 88% in Frivillighetsregisteret).
  - Refresh cadence: manual; no daily polling. Brreg changes slow, few new Folkehjelp lokallag per year.
  - How the typed client works (link to `src/lib/brreg/README.md`).
- [ ] 2.5 Add npm script `refresh:brreg-enheter` to `package.json`:
  ```json
  "refresh:brreg-enheter": "tsx --env-file=.env src/seed-sources/brreg-enheter/index.ts"
  ```
- [ ] 2.6 Run `npm run refresh:brreg-enheter`. Verify row count: `dbt show --inline "select count(*), count(*) filter (where i_frivillighetsreg) as in_frivreg from raw.brreg_enheter"`. Expect ~121 total; ~107 in Frivillighetsregisteret (88%).

### Validation

```bash
cd atlas-data/ingest
npm run migrate
npm run refresh:brreg-enheter

cd ../dbt
uv run --env-file ../ingest/.env dbt show --inline "
  select count(*) as total_rows,
         count(*) filter (where i_frivillighetsreg) as in_frivreg,
         min(registrert_dato) as first_registered,
         max(registrert_dato) as last_registered
  from raw.brreg_enheter
"
```

User confirms: ~121 total rows; ~107 in Frivillighetsregisteret; date range plausible (earliest 1970s, latest 2024 per investigation research).

---

## Phase 3: dbt source declaration

### Tasks

- [ ] 3.1 Decide sources.yml location. Recommended: add to `atlas-data/dbt/models/supply/sources.yml` alongside `raw.redcross_branches` — it's a per-NGO raw table, same category. Alternative: a new `dbt/models/brreg/sources.yml` if we expect multiple Brreg-sourced tables per NGO. Default to `supply/` for v1; revisit if pattern grows.
- [ ] 3.2 Add source entry for `raw.brreg_enheter`:
  - `loaded_at_field: loaded_at`
  - description: brief sentence pointing at the seed source and the shared typed client
- [ ] 3.3 Run `uv run --env-file ../ingest/.env dbt parse` — confirm the source is recognised.

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt parse
uv run --env-file ../ingest/.env dbt show --inline "
  select column_name, data_type
  from information_schema.columns
  where table_schema = 'raw' and table_name = 'brreg_enheter'
  order by ordinal_position
"
```

User confirms: dbt source list grew by 1; column listing matches the migration shape.

---

## Phase 4: Docs, gates, closeout

### Tasks

- [ ] 4.1 Document the new source in the sources catalogue:
  - If `atlas-data/ingest/src/seed-sources/README.md` exists, add a row.
  - Otherwise, extend `atlas-data/ingest/src/sources/README.md` with a "Seed sources (refresh-*)" section if one doesn't exist, and add a row for `brreg-enheter`.
- [ ] 4.2 Extend [`atlas-data/CONTRIBUTING.md`](https://github.com/terchris/atlas/tree/main/atlas-data/CONTRIBUTING.md) with a short note under "Workflow: add a new upstream source" mentioning that Brreg-sourced ingests should use the shared typed client at `ingest/src/lib/brreg/` rather than hand-rolling fetch + type mapping.
- [ ] 4.3 Update the talk.md coordination channel (once, at closeout): append a short Message noting that `raw.brreg_enheter` landed and the shared typed-client pattern is available. Purely informational; doesn't touch anything redcross owns.
- [ ] 4.4 Final gates:
  ```bash
  cd atlas-data/ingest && npm run typecheck && npm test
  cd ../dbt && uv run --env-file ../ingest/.env dbt build
  ```
  Expect: typecheck clean, 49/49 tests passing (unchanged), `dbt build` PASS=535 + whatever source-freshness entries dbt counts for the new source (likely +0 or +1).
- [ ] 4.5 Move this plan from `plans/backlog/` to `plans/completed/`; update Status to `Completed`; add completion date + one-line summary.

### Validation

All gates pass. User confirms the ingest is runnable from a clean checkout via `npm run refresh:brreg-enheter`.

---

## Acceptance Criteria

- [ ] `src/lib/brreg/schema.ts` is present and generated from `brreg/openAPI`.
- [ ] `src/lib/brreg/client.ts` exports a typed `brregClient` + `paginate` helper.
- [ ] `npm run refresh:brreg-schema` regenerates the schema without errors.
- [ ] `npm run refresh:brreg-enheter` populates `raw.brreg_enheter` with ~121 rows.
- [ ] `raw.brreg_enheter` is registered as a dbt source.
- [ ] `npm run typecheck` clean; `npm test` 49/49; `dbt build` clean (no regressions).
- [ ] The shared typed-client pattern is documented so the Folkehjelp scrape PLAN and future Brreg ingests reuse it.
- [ ] No retrofit of `brreg-icnpo` in this PLAN — deferred to a follow-up.

---

## Implementation Notes

- **Why commit `schema.ts` instead of gitignoring it**: Atlas has no install-time codegen step; if the file were gitignored, a fresh clone would fail typecheck until the implementer remembered to run `refresh:brreg-schema`. Committing the generated file makes the repo trivially reproducible. The refresh script stays available for when Brreg updates the spec.
- **Why `openapi-fetch` and not a full axios-based client**: `openapi-fetch` is ~1kb, wraps the native `fetch` API (available in Node 18+), and plays well with the NodeNext ESM setup Atlas uses. A heavier SDK would add install surface without earning its weight for the ~one endpoint we need.
- **Pagination helper lives with the client**: Brreg's HAL responses share a consistent `{_embedded, page}` shape across endpoints. Putting `paginate` in `lib/brreg/client.ts` (not in per-source code) means future Brreg fetches (e.g. `/roller` or `/frivillighetsregisteret/...`) inherit the same iteration logic.
- **Migration numbering in a multi-agent repo**: Phase 2.1 says "check next free number" rather than hard-coding 025. Per the multi-agent repo convention (saved in local agent memory), another branch may have taken 025 by the time this PLAN runs. Ping on talk.md if a collision risk appears.
- **No retrofit of `brreg-icnpo`**: currently hand-rolled against the same `data.brreg.no` endpoint with its own response shape. Retrofitting to the typed client is low-risk but touches a completed-and-shipped source; defer to a separate consistency PLAN.
- **NGO-specific vs generic-parameterised**: investigation [Q4] explicitly resolves this — NF-specific for v1. `brreg-ngo-units` parameterised by NGO slug is a follow-up when the third NGO needs it (likely N.K.S. per [`ngo-landscape.md`](https://github.com/terchris/atlas/tree/main/docs/research/ngo-landscape.md)).
- **Response-shape assumptions**: the migration uses `registrert_dato` and `i_frivillighetsreg`, which the typed response model calls `registreringsdatoEnhetsregisteret` and a boolean flag under `frivillighetsregisterposten`. Mapping from the typed model to the column names happens in `index.ts`; verify against a live sample during Phase 2.6.

---

## Files to Modify

**New files:**
- `atlas-data/ingest/src/lib/brreg/schema.ts` (codegen output)
- `atlas-data/ingest/src/lib/brreg/client.ts`
- `atlas-data/ingest/src/lib/brreg/README.md`
- `atlas-data/migrations/025_raw_brreg_enheter.sql`
- `atlas-data/ingest/src/seed-sources/brreg-enheter/index.ts`
- `atlas-data/ingest/src/seed-sources/brreg-enheter/README.md`

**Modified files:**
- `atlas-data/ingest/package.json` — new deps (`openapi-fetch`, `openapi-typescript` dev) + two new scripts (`refresh:brreg-schema`, `refresh:brreg-enheter`).
- `atlas-data/ingest/package-lock.json` — drift from the installs.
- `atlas-data/dbt/models/supply/sources.yml` — new source entry (or `shared/` if Phase 3.1 picks differently).
- `atlas-data/ingest/src/sources/README.md` or `seed-sources/README.md` — catalogue row.
- `atlas-data/CONTRIBUTING.md` — note about the shared typed-client pattern.

---

## Decision-points specific to PLAN-001-brreg-enheter

Three implementation-level choices the plan leaves to the implementer:

- **[P1B.Q1]** **Migration number** → verify with `ls atlas-data/migrations/ | tail -3` before writing. Expected 025 based on state at drafting; another agent's branch may have claimed it. Ping redcross on talk.md if 025 is taken.
- **[P1B.Q2]** **sources.yml location** → recommend `dbt/models/supply/sources.yml` (alongside `redcross_branches`). If a separate `brreg/sources.yml` feels cleaner during implementation, document the move in the commit.
- **[P1B.Q3]** **`raw_payload` size** — Brreg `Enhet` entities are moderate (a few KB each); storing full JSONB for ~121 rows is ~hundreds of KB total, trivial. Don't bother with a trimmed projection; keep the full payload for audit + future-proof field extraction.

---

## What follows this PLAN

The Folkehjelp investigation explicitly names two downstream PLANs:

1. **PLAN-002-folkehjelp-scrape-and-ingest** (~7–10h) — the HTML scraper that consumes `raw.brreg_enheter` via a normalised-name match, plus the dbt staging that UNIONs into the shared `dim_chapter` / `dim_activity` / `fact_chapter_activities`.
2. **PLAN-003-folkehjelp-frontend** (not-yet-drafted; implied by talk.md Message 2) — mirror the `app/ngo/redcross/...` pattern for Folkehjelp, once the marts have data.
