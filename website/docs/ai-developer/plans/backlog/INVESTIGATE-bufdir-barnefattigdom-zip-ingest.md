# INVESTIGATE — bufdir-barnefattigdom: ZIP bulk export vs live Strapi/APIM ingest

## Status

**Backlog investigation** — 2026-05-05  
**Motivation:** Operational simplicity; avoid interfacing catalog + numeric HTTP APIs end-to-end when Bufdir publishes a **single “whole dataset” ZIP** from [Barnefattigdom kommunemonitor](https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/).

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
- Existing ingest README: [`atlas-data/ingest/src/sources/bufdir-barnefattigdom/README.md`](../../../../../atlas-data/ingest/src/sources/bufdir-barnefattigdom/README.md)
