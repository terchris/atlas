# Plan: Ingest NAV's uføretrygd (disability benefit) kommune monthly statistics

Ingests NAV's PST302 table — monthly count and share of the population aged 18-67 receiving
uføretrygd, per kommune — as Atlas's first monthly-cadence source. The investigation's description
of this candidate was wrong on licence and file shape; both verified live below before drafting.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — Phase 2 IN PROGRESS

**Goal**: Add `nav-uforetrygd` as a served Atlas source — the first monthly-cadence source, and the
first registry-side welfare-system signal in Report #4 (Mental-Health Triangulation) and Report #5
(Income & Welfare Trajectory).

**Last Updated**: 2026-10-01

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §Tier 1 #2 ([Q4]–[Q7], [Q32])

**Prerequisites**: None. `nav` is already a valid `publishers.yaml` provider (added in #486, no new
publisher work needed). There is no `dim_period` table and no prerequisite schema bump — see
`INVESTIGATE-new-norwegian-public-sources.md`'s 2026-10-01 correction (same finding that closed out
the phantom "Phase 0" before `bufdir-barnevern`). Monthly cadence is a per-source modelling decision
this plan makes directly (a plain `month` integer column, no dimension table), per that
correction's own recommendation.

---

## Problem Summary

Atlas has no registry-side welfare-claim signal. Report #4 (Mental-Health Triangulation) has
self-report (Ungdata), care-seeking (KPR), and mortality — but no "how many people are actually
receiving a disability benefit" axis, which is the canonical Norwegian long-tail outcome measure.
Report #5 (Income & Welfare Trajectory) has no labour-market dimension at all. NAV's PST302 table —
kommune-level uføretrygd recipient counts and population shares, published monthly — fills both gaps
directly and is the most labour-market-adjacent of the four NAV candidates in the investigation.

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-01)

The investigation's own description ("Format: Excel + CSV... Licence: NLOD") does not match what
NAV actually publishes. Checked live rather than trusting it, the same way `bufdir-barnevern`'s
Phase 1 corrected its own investigation entry.

### Tasks

- [x] 1.1 Find the live download page and the real download link.
  **Confirmed** — `https://www.nav.no/no/nav-og-samfunn/statistikk/aap-nedsatt-arbeidsevne-og-uforetrygd-statistikk/uforetrygd/uforetrygd-manedsstatistikk`
  is a Next.js page (`__NEXT_DATA__` present) listing ~10 numbered tables (`PST300`–`PST317`), each a
  different breakdown (fylke×sex, fylke×age, national×disability-degree, …). **Only `PST302`
  ("Mottakere av uføretrygd. Antall og andel av befolkningen 18-67 år. Fylke. Kommune.") is
  kommune-resolved** — the rest are fylke-level or national, out of scope for Atlas's kommune
  default. Download link lives in the page's `__NEXT_DATA__` JSON blob, not in the static HTML:
  `/_/attachment/download/<uuid>:<sha1-ish-hash>/PST302%20...%20_<YYYYMM>.xlsx`, served directly
  from `www.nav.no` itself — no third-party CDN, more stable than Bufdir's Azure/Strapi host.

- [x] 1.2 **Licence correction.** NAV's own statement
  (`nav.no/.../praksis-rutiner-og-retningslinjer-rundt-offisiell-og-offentlig-statistikk-fra-nav`):
  *"Statistikk fra Nav på nav.no er åpne data og lisens for bruk er Creative Commons Navngivelse 4.0
  Internasjonal"*, linking `creativecommons.org/licenses/by/4.0/deed.no`. **CC BY 4.0, not NLOD.**
  Propagated back to the investigation doc's own Tier-1 #2 entry.

- [x] 1.3 Download the live PST302 workbook (period: August 2026) and inspect its real structure.
  **Confirmed — a pivoted report, not a flat table.** 5 sheets: `" Om statistikken"` (methodology,
  note the leading space), `"Fylke. Antall"`, `"Fylke. Andel"`, `"Kommune-bydel. Antall"`,
  `"Kommune-bydel. Andel"`. **Only the last two are in scope** — they're the kommune/bydel-resolved
  pair; the `Fylke.*` sheets are a coarser duplicate Atlas doesn't need (and the only place `98
  Utland` — NAV's "resident abroad" pseudo-region — appears; it does not appear in the
  kommune-bydel sheets at all, so there's nothing to misclassify there).

  **Row shape** (`Kommune-bydel. Antall`, same for `.Andel`): one year per file (cell `B6`, e.g.
  `"2026 : "`), then a **repeating fylke block**:
  ```
  B8:  "03 Oslo - Oslove"              ← fylke section header, no data cells — skip
  B10: Januar | Februar | ... | August ← month-name header row, repeats per fylke block
  B11: "03 Oslo - Oslove i alt  "      ← fylke total row, 2-digit code
  B12: "030101 Gamle Oslo"             ← bydel row, 6-digit code (Oslo only below this point)
  ...
  B29: "0301 Oslo - Oslove"            ← kommune-level rollup, 4-digit code, ALL MONTHS SUPPRESSED (*)
  [blank, blank]
  B32: "11 Rogaland"                   ← next fylke header
  B34: Januar | ... | August           ← month header repeats
  B35: "11 Rogaland i alt  "           ← fylke total
  B36: "1101 Eigersund"                ← ordinary kommune row, 4-digit code, real values
  B38: "1103 Stavanger i alt  "        ← a SECOND kind of kommune-total row: appears BEFORE its
  B39: "110301 Hundvåg"                   bydel rows (Oslo's came AFTER), still "i alt"-suffixed
  ...
  ```
  **Oslo, Bergen (`4601`), Stavanger (`1103`) and Trondheim (`5001`) are the four kommuner with
  bydel rows** — same four cities Atlas's `classify_region_code` macro comment already names from
  an unrelated FHI finding. ⚠️ **Oslo's kommune-rollup row and Stavanger's are structurally
  inconsistent with each other** — Oslo's appears *after* its bydel list with no `"i alt"` suffix;
  Stavanger's (and presumably Bergen's/Trondheim's) appears *before*, *with* the suffix. **Do not
  write a parser that depends on row order or the `"i alt"` suffix to decide what a row is.**
  Classify every row by its label's leading numeric code alone (2/4/6 digits), the same
  digit-count-based philosophy `classify_region_code` already uses — this is order-independent and
  survives the inconsistency above for free. A header-only row (a fylke title with zero numeric
  cells) is naturally skipped because there is nothing to parse into month/value pairs; no special
  case needed.

  ⚠️ **`0301 Oslo` (the kommune-level rollup) is suppressed (`*`) for every month**, even though the
  fylke-level total two rows up (`03 Oslo i alt`) carries real ~32,000-scale numbers for the exact
  same population. Recorded as observed, not explained — this is NAV's own export, not an Atlas
  derivation, and nothing here justifies guessing why. If it still holds once ingested, decide
  whether to surface it as-is (represent, don't curate) or flag it; default is as-is.

- [x] 1.4 Confirm numeric cell typing and the suppression marker.
  **Confirmed** — both sheets store values as **native numeric cells**, not Norwegian-decimal-comma
  strings the way Bufdir's workbooks do (e.g. `"Andel"` sheet: `6.306333321699`, a real float, not
  `"6,3"`). **No decimal-comma parsing needed for NAV at all.** Suppression marker is the literal
  string `*` (NAV's own convention, confirmed in the `0301 Oslo` row above) — different from
  Bufdir's `..`/`.` and SSB's `..`. Treat `*` as null; nothing else observed as a non-numeric cell.

- [x] 1.5 Check the archive / historical-backfill shape.
  **Confirmed, not attempted to ingest**: `nav.no/.../arkiv-uforetrygd-manedsstatistikk-januar-desember-2021`
  names a per-calendar-year archive file,
  `PST302_Mottakere_av_uføretrygd._Antall_og_andel_av_befolkningen_18-67_år._Fylke._Kommune._2021_12.xlsx`
  — same shape as the live file, just a complete year instead of year-to-date. **[Q1] Full
  historical backfill is deferred, deliberately** — it requires discovering and fetching one file
  per past year (count unknown, not checked), a materially different ingest shape from "one bulk
  ZIP" sources. v1 ingests the live current-year file only; a future PLAN can add backfill once
  there's a real consumer need, per this investigation's own standing bias against speculative
  building.

- [x] 1.6 **Checked whether `data.norge.no` offers a cleaner distribution than scraping `nav.no`
  directly — it does not, for this table.** The investigation's own text claimed "bulk open data is
  published on data.norge.no" without checking; that claim is also wrong. Queried the real backing
  search API directly (`search.api.fellesdatakatalog.digdir.no/search`, found via its own
  documentation at `data.norge.no/en/technical/api/search` — not a generic web search, which only
  returns the client-rendered app shell for this site, nothing indexable):
  - `PST302` (NAV's own table id): **zero hits**, anywhere in the catalogue.
  - `uføretrygd statistikk`, scoped to NAV's org (`orgPath=/STAT/983887457/889640782`, 1,084
    registered entries total — found by resolving the org path from a real hit, not guessed):
    **exactly one match**, *"Statistikk - utbetalinger av ytelser kommune år"*
    (`data.norge.no/node/2047`). It is **not PST302** — it's a different, broader NAV product
    (aggregate kroner paid out across every benefit type combined: uføretrygd, foreldrepenger,
    dagpenger, barnetrygd, alderspensjon, …, not uføretrygd-recipient counts/shares specifically).
    It is explicitly flagged `"isOpenData": false` in the catalogue's own metadata, carries no
    `distribution` field in the harvested record, and was last modified 2023-11-13 — three years
    stale against today. The other 1,084 NAV entries sampled are almost entirely Altinn
    `resourceRegistry` entries (service/application definitions — sick-leave applications,
    summer-job agreements), not statistics tables; data.norge.no's own DCAT harvester apparently
    counts every registered Altinn resource as a "dataset", which is why the org shows 1,084 of them
    and essentially none are what a person means by "a downloadable table."

  **Conclusion: `www.nav.no` itself is the actual, current, only publication surface for PST302.**
  data.norge.no is a metadata catalogue pointing back to nav.no for the few NAV products it does
  index, not an alternate hosting location with its own distribution — the same "no stabler route
  than the publisher's own site" conclusion `INVESTIGATE-bufdir-upstream-restructure.md` reached for
  Bufdir. Scraping `nav.no` directly, as this plan already specifies, is correct — not a shortcut
  taken without checking the alternative first.

### Validation

✅ Confirmed 2026-10-01. Phase 1 is DONE — real file downloaded and inspected directly, not
inferred from the page's own description.

---

## Phase 2: Ingest module + raw table

### Tasks

- [ ] 2.1 Create `atlas-data/ingest/src/sources/nav-uforetrygd/`:
  - `parse.ts`:
    - `discoverWorkbookUrl(html)` — multi-tier, same shape as the Bufdir sources' discovery
      (canonical: `/_/attachment/download/` + URL-encoded `PST302` in the path; looser fallbacks
      dropping the exact encoding; a `sole-upload`-style last resort only when there is exactly one
      `/_/attachment/download/` link on the page). Source host is `www.nav.no` itself.
    - `classifyRowLabel(label)` — returns `{code, kind: 'fylke'|'kommune'|'bydel', name}` or `null`
      for a non-data label, purely from the leading digit count (2/4/6) — **not** from row position
      or the `"i alt"` suffix (see Phase 1.3's inconsistency finding).
    - `MONTH_NUMBERS` — Norwegian month-name → 1-12 map (`Januar`→1 … `Desember`→12), case-sensitive
      match against the header row as published; no abbreviations observed.
    - `parseCell(raw)` — `*` → null; numeric cells pass through as-is (no comma handling needed,
      per Phase 1.4).
    - `parseSheet(wb, sheetName, categoryFormat, year)` — walks every row, classifies the label cell,
      skips header/section rows (zero data cells), emits one row per (region_code, month) pair for
      every row that classifies as fylke/kommune/bydel. Year comes from the sheet's own year cell
      (`B6`-equivalent — confirm it is always there and always the row above the first fylke
      header), not assumed from "today".
  - `index.ts` — fetch monitor page → `discoverWorkbookUrl` → download xlsx → read both
    `Kommune-bydel. Antall` and `Kommune-bydel. Andel` sheets via `parseSheet` → upsert
    `raw.nav_uforetrygd`. Full-table replace per run (same convention as the Bufdir sources) — v1
    only tracks the live current-year file, so there's no multi-year accumulation to preserve
    across runs yet (see Phase 1.5).
  - `fetch_retry.ts` — copy, adapted header comment, same as every other source in this family.
  - `manifest.yml` — `source_id: nav-uforetrygd`, `provider: nav`, `license: CC BY 4.0`,
    `license_url: https://creativecommons.org/licenses/by/4.0/deed.no`, `periodicity: P1M`,
    `eu_theme: SOCI`. **[Q2]** `tags.topic` — recommend `social` (NAV's own institutional framing,
    matches `SOCI`), but `income` is a defensible alternative given Report #5's income-trajectory
    framing; confirm against `topics.yaml`'s curated list before merging — `child-welfare` wasn't a
    valid value last time and failed CI, don't repeat that mistake blind.
  - `README.md` and `__tests__/` (golden-file tests against a real downloaded fixture workbook, same
    pattern as the Bufdir sources — fixture needs trimming to a few fylke blocks given the full file
    is ~500 rows; keep at least one ordinary kommune, one Oslo-shaped bydel block, and one
    Stavanger-shaped bydel block in the fixture so the row-order inconsistency is actually tested).

- [ ] 2.2 Migration `raw.nav_uforetrygd` — columns `region_code`, `category_format`
  (`antall`/`andel`, derived from which sheet the row came from, not a column within the sheet —
  genuinely different from every Bufdir/SSB source so far), `year`, `month`, `value`, `values_json`,
  `loaded_at`. PK `(region_code, category_format, year, month)`.

- [ ] 2.3 Dagster registration (`raw_other.py`, `schedules.py`) — **do not skip this, it was missed
  on the first `bufdir-barnevern` push and caught by the zero-touch-automation invariant.** First
  real use of `cadence.monthly_polled()` for anything outside KLASS — confirm its freshness-policy
  pairing (`WEEKLY_FRESHNESS` is wrong for a monthly source; check whether a `MONTHLY_FRESHNESS`
  constant already exists in `cadence.py` or needs adding).

### Validation

```bash
cd atlas-data/ingest && npm test -- nav-uforetrygd
```
Golden-file tests pass; a manual run against the live workbook produces a plausible row count
(≈356 kommuner + ~38 bydeler + 15 fylke-totals) × (`antall`+`andel`) × however many months the
current file covers, with zero rows silently dropped — including a direct check that the row-order
inconsistency (Oslo vs. Stavanger) doesn't drop either city's kommune-level rollup row.

---

## Phase 3: dbt staging and marts

### Tasks

- [ ] 3.1 Add `raw.nav_uforetrygd` to `atlas-data/dbt/models/indicators/sources.yml`, with
  `ingest_cadence: monthly` and a freshness window matched to "updates early in the following
  month" (NAV's own stated cadence) — a `warn_after`/`error_after` tighter than the Bufdir sources'
  400/800-day annual window would be wrong for a monthly source; derive from the monthly cadence,
  don't copy the annual constant.
- [ ] 3.2 `indicators__nav_uforetrygd.sql` — `kommune_nr` via `region_code_to_kommune_nr`,
  `region_kind` via `classify_region_code` (same convention `bufdir-barnevern` established, not the
  bare-regex pattern it replaced). `contents_code` = `'nav_uforetrygd__' || category_format` — no
  per-indicator slug needed, since this source is exactly one table, not ~23 workbooks.
- [ ] 3.3 Document columns in `schema.yml`; validate against a local Postgres loaded with the real
  ingest (per `[[local-postgres-for-real-dbt-evidence]]`), not an empty schema.
- [ ] 3.4 `mart_indicators__nav_uforetrygd.sql` api passthrough + `marts/api/schema.yml` entry.
- [ ] 3.5 `dbt build` + `dbt test` against the real loaded data — relationship tests against
  `dim_kommune`/`dim_fylke` for `kommune_nr`/`fylke_nr`, `not_null` on the PK columns, `region_kind`
  relationship to `ref_region_kind`.

### Validation

```bash
cd atlas-data/dbt && dbt build --select indicators__nav_uforetrygd mart_indicators__nav_uforetrygd
```
Against a local Postgres loaded via the real ingest, not an empty schema.

---

## Phase 4: Deploy and verify arrival

### Tasks

- [ ] 4.1 Regenerate every drift-gated artifact `bufdir-barnevern`'s Phase 2/3 needed —
  `check-sources-seed-is-current.sh`, `check-manifests.sh`, `check-lineage-is-current.sh`,
  `check-api-v1.sh`, `check-inventory-depends-on.sh`, `check-root-document-indexes-every-relation.sh`,
  `check-every-source-is-served.sh`, `render-template-info.sh`, `generate-holdings.py`,
  `website/scripts/generate-sources-registry.mjs`. Budget for this up front this time — it was 8
  separate follow-up commits last time, every one predictable in retrospect.
- [ ] 4.2 File the deploy/verification request to **imac** (not `ops-dev`, not a `for-ops-*.md`
  file — confirmed via the actual bus task history before `bufdir-barnevern`'s Phase 4). Name the
  exact relations, the code-location image digest (labelled as such), the derived `LANDS WITH`, and
  an explicit row-count prediction from the local validation run.
- [ ] 4.3 **After the deploy**, verify arrival independently against the live public API — not the
  deploy report alone. `GET /meta_sources?source_id=eq.nav-uforetrygd&select=served_as` non-empty,
  `GET /indicators__nav_uforetrygd?limit=1` returns a real row (note the `indicators__`-prefixed
  name on the public API, not `mart_indicators__` — the naming gotcha imac already caught once).

### Validation

Live `curl` against the public API returns real rows, independently checked, not inferred from a
green Dagster run.

---

## Acceptance Criteria

- [ ] `nav-uforetrygd` ingests cleanly from the live workbook with zero rows silently dropped,
  including both the Oslo-shaped and Stavanger-shaped kommune-rollup row orderings.
- [ ] `raw.nav_uforetrygd` correctly has no `category_unit`-style column — `category_format` is
  derived from the sheet, not a column within it.
- [ ] `indicators__nav_uforetrygd` and `mart_indicators__nav_uforetrygd` build and test clean
  against real loaded data.
- [ ] `nav-uforetrygd` appears in `meta_sources.served_as` after a real deploy, independently
  verified via live `curl`.
- [ ] Golden-file tests cover: an ordinary kommune row, an Oslo-shaped bydel block (rollup row
  after its children, no `"i alt"` suffix), a Stavanger-shaped bydel block (rollup row before its
  children, `"i alt"` suffix), and the all-suppressed `0301 Oslo` row.
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped, only once
  Phase 4 confirms rows actually arrived.

---

## Implementation Notes

- **Do not reuse Bufdir's `discoverZipUrl`/`parseWorkbookSheet` code.** Different host, different
  file format (one xlsx, not a ZIP of many), different internal shape (pivoted fylke/kommune/bydel
  blocks, not a flat `Region|Regionnavn|Tallformat|years` table), different suppression marker,
  different cell typing (native numbers here, Norwegian-decimal strings there). The *pattern*
  (discovery tiers, a pure parser module tested against real fixtures, full-table replace per run)
  carries over; the code does not.
- **This is Atlas's first monthly source. Resist building `dim_period` for it.** A plain `month`
  integer column, same shape as every existing source's `year` column, is the whole of what this
  PLAN needs — confirmed by the 2026-10-01 investigation correction that no period-grain
  infrastructure exists or is needed as a prerequisite anywhere in the codebase today.
- **[Q1]** Historical backfill (pre-current-year data) is explicitly deferred — see Phase 1.5.
- **[Q2]** `topics.yaml` category (`social` vs `income`) is a real open decision, not resolved here.

---

## Files to Modify

- `atlas-data/ingest/src/sources/nav-uforetrygd/manifest.yml` (new)
- `atlas-data/ingest/src/sources/nav-uforetrygd/index.ts` (new)
- `atlas-data/ingest/src/sources/nav-uforetrygd/parse.ts` (new)
- `atlas-data/ingest/src/sources/nav-uforetrygd/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/nav-uforetrygd/README.md` (new)
- `atlas-data/ingest/src/sources/nav-uforetrygd/__tests__/` (new)
- `atlas-data/migrations/<next>_raw_nav_uforetrygd.sql` (new)
- `atlas-data/ingest/package.json` (`ingest:nav-uforetrygd` script)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (asset registration — monthly cadence)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__nav_uforetrygd.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__nav_uforetrygd.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `nav` listing)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark shipped)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
