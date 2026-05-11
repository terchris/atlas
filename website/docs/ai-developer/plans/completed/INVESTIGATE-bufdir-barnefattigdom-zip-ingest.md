# INVESTIGATE — bufdir-barnefattigdom: ZIP bulk export vs live Strapi/APIM ingest

## Status

**Completed (2026-05-07)** — recommendation accepted and shipped end-to-end.

### Outcome

The investigation recommended switching from the live Strapi/APIM API path to the ZIP bulk export. That switch shipped via **PR #60** (Cursor BG / Composer-2 — fully replaced the Strapi+APIM ingest with one HTTP fetch of the monitor page → regex-extract ZIP URL → `adm-zip` extract → `xlsx` parse → row stream). Subsequent hardening work closed the open follow-ups this INVESTIGATE flagged:

- **PR #67** (parse.ts split + multi-tier discovery + 29 golden-file tests) — addressed the "Discovering the ZIP URL without hard-coding eternally" question (Option A in the original investigation, with progressive fallback tiers added so a Bufdir hostname/filename change doesn't crash ingest).
- **PR #71** (`indicator_api_id` migration) — addressed the "Indicator id parity" caveat the INVESTIGATE called out. Surrogate id moved from `bf_zip_<sha256>` to `bf_zip_ind_<N>` (number-prefix derived from filename); alias seed `bufdir_indicator_alias` carries `historical_id → canonical_id` mappings for renumbering events (e.g. Indikator 9 → 9a/9b split, Indikator 10 retired). Design rationale in [`INVESTIGATE-bufdir-indicator-surrogate-id-stability.md`](INVESTIGATE-bufdir-indicator-surrogate-id-stability.md) (closed); implementation in [`PLAN-bufdir-surrogate-id-migration.md`](../completed/PLAN-bufdir-surrogate-id-migration.md) (closed).
- **PR #60** also added the V8-string-length streaming fix to `lib/output.ts` (per-line `writeNdjson` + new `ndjsonStreamingWriter`) — the original Strapi/APIM path didn't hit this because it never accumulated multi-MB row buffers, but the ZIP path's 395k-row output triggered V8's `String::kMaxLength` limit on the old chunked-buffer implementation.

### Live state on main (2026-05-07)

- Source folder: `atlas-data/ingest/src/sources/bufdir-barnefattigdom/`
- Migration: `atlas-data/migrations/048_raw_bufdir_barnefattigdom.sql` (zip-derived columns) + `049_bufdir_barnefattigdom_zip_comments.sql` (comment refresh)
- Ingest: 22 workbooks → 395,420 rows in ~55s; `match_tier: canonical` logged on the live URL
- dbt: `marts.indicators__bufdir_barnefattigdom` builds; relationship tests pass once `dim_kommune` is populated (see post-reset workflow)
- Tests: 29 golden-file assertions on parser + discovery; all green

### Next-steps section from this INVESTIGATE

All five sub-items in the original "Recommended next steps (if product chooses ZIP path)" section are done:

1. ✅ Confirm completeness — 22 workbooks ingested cleanly; coverage audit (PR #67) confirmed zero rows silently dropped by the parser's unit/format filters.
2. ✅ Pick discovery — Option A (page scrape) shipped; PR #67 added multi-tier fallback.
3. ✅ Parser spike — `parse.ts` extracted from `index.ts` with the row shape pinned by golden tests.
4. ✅ Schema decision — Option A (replace ingest entirely) shipped; surrogate-id discontinuity bridged via the alias seed.
5. ✅ Deprecate batch APIM ingest — already removed in PR #60.

---

## Status (original): Backlog investigation — 2026-05-05

**Motivation:** Operational simplicity; avoid interfacing catalog + numeric HTTP APIs end-to-end when Bufdir publishes a **single "whole dataset" ZIP** from [Barnefattigdom kommunemonitor](https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/).

**Current implementation (merged):** `feat/onboard bufdir-barnefattigdom` — Strapi (`statistikk.bufdir.no`) + Azure APIM `indicator-data/*` + SSB Klass 131 kommune batches.

---

## What we probed

### Published ZIP URL (example)

Fetched successfully (`HTTP 200`, `application/zip`, `~2.5 MB`, `Last-Modified: Thu, 31 Jul 2025`):

https://ca-statistikk-strapi-prod.whitesea-89be7839.norwayeast.azurecontainerapps.io/uploads/2025_07_31_barnefattigdom_monitor_e7fc16129b.zip  

Response headers include `x-powered-by: Strapi`.

### Contents (this edition)

Inside the ZIP (~22 workbook files):

- One **`Indikator_<n>_… .xlsx`** per indicator (`n` varies; **22 files** total in sampled bundle).
- Worksheet **`Data`** holds a rectangular table.

Observed header row (`Indikator_1_barn_i_hush_lavinnt_lav_finans_siste_år.xlsx`):

| Region | Regionnavn | Enhet | Tallformat | 2013 | 2014 | … | 2023 |
|--------|------------|-------|------------|-----|-----|---|------|

- **`Region`** — geographic code as text (`0`, `03`, `0301`, `030101`, `03010102`, …) — kommune **and** finer units (Oslo bydel/delbydel in same column).
- **`Enhet`** — `barn` | `husholdning`.
- **`Tallformat`** — `antall` | `prosent`.
- **Year columns** — numeric headers; cells are counts, formatted Norwegian percentages (e.g. `     9,2`), or **`..`** (suppression mirror of SSB-style convention).

Rows repeat **national / fylke / kommune / sub-kommune** in one table (stacked hierarchies duplicate `0301`-style prefixes for granular rows).

---

## Comparison to catalogue issue text

Issue #53 / Tier-1 bullets described **“Bufdir Open Data API JSON”** and **[data.bufdir.no](https://data.bufdir.no/)**. The **monitor bulk export lives on Bufdir Strapi uploads + monitor page**, **not** the DCAT catalogue. This investigation **does not** change that discrepancy; any future issue text should cite **monitor landing + ZIP** when choosing bulk ingest.

---

## Discovering the ZIP URL without hard-coding eternally

**Option A — Stable human URL, fragile link target.**  
[Barnefattigdom monitor page](https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/) embeds Markdown with the **canonical download link**:

` ](https://…azurecontainerapps.io/uploads/YYYYMMDD_barnefattigdom_monitor_<hash>.zip) `  

**Mechanism:** one `GET www.bufdir.no/.../monitor/barnefattigdom/`, grep `barnefattigdom_monitor` + `.zip`, validate `https`.

**Risk:** Filename format (`YYYYMMDD` + CMS hash), host (**`azurecontainerapps.io`**) → **infra may move**.

**Option B — Strapi-only metadata.** Try to locate a **`files`/`media`/relation field** on the monitor document that resolves to upload URL (`/uploads/*.zip`). *Not validated in this pass* (populate keys need Bufdir schema knowledge or reversed front-end queries).

**Option C — **`data.bufdir.no`****  
No evidence yet that bulk ZIP is catalogue-registered — **unlikely** discovery path unless Bufdir attaches a DCAT distribution.

---

## Technical fit vs `raw.bufdir_barnefattigdom`

Current raw grain: **`(indicator_api_id, region_code, category_unit, category_format, year)`** (+ metadata).

ZIP path:

| Current column | ZIP mapping |
|----------------|-------------|
| `indicator_api_id` | **No hex id in workbook** → derive surrogate (`bf_zip_ind_{n}_<slug>`) **or** add separate `indicator_sheet_key` column + migration (**human-review** vs API consumers). Alternatively keep API-only id for parity (then ZIP cannot populate same PK without collision strategy). |
| `indicator_slug` / names | Parsed from workbook filename (`Indikator_1_*`) + title row (row 1). |
| `region_code` | `Region` text (strip). |
| `category_unit` / `category_format` | Lowercase `Enhet`, `Tallformat`. |
| `year` / `value` | Unpivot year columns ≥ first year header. Parse `prosent`: Norwegian comma decimals; **`..`** → NULL + dot status column if desired. |
| `values_json` | Optional verbatim `Record<year,str|number|null>` like API path. |

**Parity caveat:** Hex **Strapi/CMS indicator ids** in live API rows **≠** workbook identity. Consumers joining on `indicator_api_id` would **break** if id scheme changes unless we **dual-key** (`sheet_number`, `indicator_api_id_optional`).

---

## Pros / cons (decision aide)

### ZIP advantages

- **One download** replaces thousands of `/overview` + `/detailsmultiple` calls.
- **Matches Bufdir’s “last ned hele datasettet”** export — aligns with stakeholder expectation.
- **Previewable offline** CI fixture (golden zip subset) simpler than mocking APIM pagination.
- **Full hierarchy** visible in sheet (national → delbydel) without separate overview logic.

### ZIP disadvantages / risks

- **URL staleness:** versioned filenames; ingest must discover or pin with explicit semver in manifest.
- **Excel dependency:** add **`openpyxl`** (Python) + small parser **or** `sheetjs`/similar in TS — heavier than pure JSON ingest.
- **Layout drift:** new columns, renamed sheets (`Data`?), extra footers → golden tests needed.
- **Indicator count parity:** sampled bundle **22 files** vs live dashboard indicator count requires **verification** whenever Bufdir adds indicators (API ingest auto-picks Strapi graph).
- **`indicator_api_id` compatibility** vs existing mart — **migration / dual column** discussion.

---

## Recommended next steps (if product chooses ZIP path)

1. **Confirm completeness** — compare Strapi indicator count vs workbook count on same release date; document gap policy.
2. **Pick discovery** — implement **Option A page scrape** (regex on `bufdir.no` SSR) vs Strapi populate once schema known; store resolved URL (+ `etag`/`Last-Modified`) in `manifest.yml` notes or ingest log.
3. **Parser spike** — single TS module (`parseBarnefattigdomSheet.ts`) producing rows matching **`BufdirBarnefattigdomRow`** shape minus `indicator_api_id` decision.
4. **Schema decision** — **Option A:** replace ingest entirely (breaking change for mart keys) **vs** **Option B:** new raw table **`raw.bufdir_barnefattigdom_zip`** merged in dbt (non-breaking) — **needs Plan**.
5. **Deprecate** batch APIM ingest only after parity tests pass on row counts × region × year sample.

---

## References

- Monitor page / download wording: https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/  
- Example ZIP (`2025_07_31…`): fetched 2026-05-05; structure verified manually with `unzip -l`, `openpyxl` preview.  
- Existing ingest README: [`atlas-data/ingest/src/sources/bufdir-barnefattigdom/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/bufdir-barnefattigdom/README.md)
