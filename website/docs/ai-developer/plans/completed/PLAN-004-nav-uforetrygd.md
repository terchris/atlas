# Plan: Ingest NAV's uføretrygd (disability benefit) kommune monthly statistics

Ingests NAV's PST302 table — monthly count and share of the population aged 18-67 receiving
uføretrygd, per kommune — as Atlas's first monthly-cadence source. The investigation's description
of this candidate was wrong on licence and file shape; both verified live below before drafting.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Completed**: 2026-10-01

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

## Phase 2: Ingest module + raw table — DONE

### Tasks

- [x] 2.1 Created `atlas-data/ingest/src/sources/nav-uforetrygd/`. Deviated from this task's own
  draft in a few places, each for a reason found while implementing, not a shortcut:
  - `discoverWorkbookPath` (named `*Path` not `*Url` — NAV's links are relative, the caller
    prepends `https://www.nav.no`), same multi-tier shape as planned.
  - No separate `classifyRowLabel` returning a `kind` — simplified to `extractRegionCode(label)`
    returning just the code string. `region_kind` was already planned to be dbt's job
    (`classify_region_code`); giving the ingest layer its own fylke/kommune/bydel classification
    too would have duplicated that logic in two places for no benefit, since the ingest layer
    never needed to branch on kind — only on "does this row have a code and does it have data."
  - `MONTH_NUMBERS`, `parseCell` as planned — confirmed live, no abbreviations, no comma-formatted
    cells (defensive comma handling kept anyway, per Phase 1.4).
  - `parseSheet(wb, sheetName, categoryFormat)` — no `year` parameter; year is read from the
    sheet's own year cell as planned, but discovered inline rather than passed in, since the
    sheet IS the only source of truth for its own year.
  - `topics.yaml`: **[Q2] resolved — `social`**, validated against the real file before writing
    the manifest (not after, unlike `child-welfare`'s CI failure on the prior source).
  - `__tests__/fixtures/`: kept the **full real workbook**, not trimmed — same precedent as the
    Bufdir sources' fixtures, and trimming risked silently removing the exact row-order
    inconsistency (Oslo vs. Stavanger) the tests exist to catch.
- [x] 2.2 Migration `057_raw_nav_uforetrygd.sql` — exactly as planned.
- [x] 2.3 Dagster registration. **Needed more than `raw_other.py`/`schedules.py` registration
  alone** — `MONTHLY_FRESHNESS` did already exist (used by KLASS/seeds), but no existing *job*
  fit a genuinely-monthly data source: `annual_sources_refresh` is explicitly scoped to P1Y
  sources (its own docstring says so), `klass_refresh`/`seed_sources_refresh` are annual/irregular
  data merely polled monthly. Added a new `monthly_sources_refresh` job rather than misrepresent
  what an existing job runs. Validated the whole Dagster `Definitions` object with
  `dagster definitions validate -m atlas_data.definitions`, not just an import check.

### Validation

```bash
cd atlas-data/ingest && npm test -- nav-uforetrygd   # 31 passed
cd atlas-data/ingest && npm test                      # 212 passed, whole package — no regressions
cd atlas-data/ingest && npm run typecheck              # clean
dagster definitions validate -m atlas_data.definitions # clean, including the new job
```
✅ Done 2026-10-01. Live dry-run and a real local-Postgres ingest both produced **6,560 rows**
(3,280 antall + 3,280 andel across 410 distinct region codes × up to 8 months), zero dropped —
including a direct check that the row-order inconsistency (Oslo vs. Stavanger) didn't drop either
city's kommune-level rollup row.

---

## Phase 3: dbt staging and marts — DONE

### Tasks

- [x] 3.1 Added `raw.nav_uforetrygd` to `sources.yml` — `ingest_cadence: monthly`,
  `warn_after: 45 days` / `error_after: 90 days` (matching `cadence.MONTHLY_FRESHNESS`'s own bounds
  exactly, rather than inventing separate numbers for the dbt-side and Dagster-side freshness
  policies).
- [x] 3.2 `indicators__nav_uforetrygd.sql` — `kommune_nr`/`region_kind` via
  `region_code_to_kommune_nr`/`classify_region_code` **from the first commit**, not added after a
  relationship-test failure the way `bufdir-barnevern`'s bare-regex draft needed fixing. All 20
  data tests passed on the first `dbt build` against real loaded data.
- [x] 3.3 Documented in `schema.yml`; `check-osmosis.sh` clean (579 columns documented, 0 bare).
- [x] 3.4 `mart_indicators__nav_uforetrygd.sql` + `marts/api/schema.yml` entry — done.
- [x] 3.5 `dbt build --select indicators__nav_uforetrygd mart_indicators__nav_uforetrygd` — 20/20
  pass against real loaded data (1 table model, 18 data tests, 1 view model).

### Validation

```bash
cd atlas-data/dbt && dbt build --select indicators__nav_uforetrygd mart_indicators__nav_uforetrygd
```
✅ Done 2026-10-01. Against a local Postgres loaded via the real ingest (6,560 rows), not an empty
schema. Every drift-gated artifact this phase touches — `api_v1_generated.sql`, lineage csvs,
sources seed, `api_v1_relations.csv`, `mart_atlas_inventory.sql`'s depends_on + counted list,
`generate_api_v1.py`'s `SCHEMA_COMMENT`, `sources-registry.json`, and `template-info.yaml`
(including `first_data.jobs` needing the new `monthly_sources_refresh` job, which in turn
invalidated the "six jobs, 1772s" measured cold-install figure — flagged explicitly rather than
silently re-stated) — regenerated up front and verified green on the **first** CI push. Zero
follow-up fix commits needed this time, unlike `bufdir-barnevern`'s eight.

---

## Phase 4: Deploy and verify arrival — DONE

### Tasks

- [x] 4.1 Regenerated every drift-gated artifact up front, as planned — see Phase 3's validation
  note. All green on the **first** CI push (PR #494); none of the 8 follow-up fix commits
  `bufdir-barnevern` needed were necessary here.
- [x] 4.2 Filed the deploy request to **imac**, as **[urb-agents#1797](https://github.com/terchris/urb-agents/issues/1797)**.
  Named the exact relations (`raw.nav_uforetrygd`, `api_v1.indicators__nav_uforetrygd`/
  `mart_indicators__nav_uforetrygd`), **both** image digests this time — the code-location digest
  (`ghcr.io/terchris/atlas-data:v20261001-bbabfef`) and the UIS install-artifact digest
  (`ghcr.io/terchris/atlas-data/uis:v20261001-bbabfef`, published as a GitHub release) — correcting
  an error in the `bufdir-barnevern` request (#1796), which claimed no UIS artifact digest was
  available from here; it is, the build workflow publishes it on every main push via
  `uis/render-template-info.sh` + `oras push`, I just hadn't read far enough into that log before.
  Named the derived `LANDS WITH` (`monthly_sources_refresh` then `transform_and_publish` —
  `atlas-data/uis/lands-with.sh ccd1f51..bbabfef`) and an expected row count (6,560, stated
  explicitly as today's prediction — NAV's live file grows a column every month, so a run landing
  in a different month than this validation would legitimately see a different count, same
  region/category coverage). Flagged the new `monthly_sources_refresh` job's cron (1st of the
  month, 01:00) won't self-fire for potentially weeks, more pointedly than the equivalent caveat on
  `bufdir-barnevern` (weekly, not monthly) — the refresh needs triggering deliberately if this
  should land sooner.
- [x] 4.3 **Verified arrival, 2026-10-01** — not just imac's green run report, independently
  re-checked against the live public API myself before closing the task:
  ```
  GET /meta_sources?source_id=eq.nav-uforetrygd&select=served_as
  -> [{"served_as":["indicators__nav_uforetrygd"]}]

  GET /indicators__nav_uforetrygd?limit=1
  -> 200, a real row (region_code "03", region_kind "fylke", category_format "antall",
     year 2026, month 1, value 32071, values_json carries all 8 months)

  HEAD with Prefer: count=exact
  -> content-range: 0-0/6560, cf-cache-status: BYPASS (not a stale cached read)
  ```
  **6,560 rows — an exact match to both this plan's own local prediction and imac's independent
  cluster-side measurement**, same month-count (1–8), confirming no NAV republish happened between
  the local validation run and the live deploy. imac also independently re-verified the
  `region_kind`/`kommune_nr` relationship specifically (since this plan flagged it as the one
  falsification worth checking carefully): `bydel=608, kommune=5712, fylke=240` summing to 6,560,
  zero unmatched `kommune_nr` values against `dim_kommune`. No regression elsewhere
  (`bufdir-barnevern`, `bufdir-barnefattigdom`, FHI sources all unchanged). Full exchange:
  [urb-agents#1797](https://github.com/terchris/urb-agents/issues/1797), closed `completed`.

### Validation

✅ Done 2026-10-01, verified independently, not taken on trust. Live `curl` against the public API
returns real rows through `indicators__nav_uforetrygd` (6,560, confirmed via `Content-Range`, not a
cached response), and `meta_sources.served_as` for `nav-uforetrygd` is non-empty.

---

## Outcome

Shipped end to end, 2026-10-01: ingest (1 workbook, 6,560 rows, zero dropped) → dbt staging and
api_v1 publication → live cluster deploy → independently verified arrival. Atlas's first
monthly-cadence source, requiring a new Dagster job (`monthly_sources_refresh`) since no existing
job fit genuinely-monthly data. Unlike `bufdir-barnevern`, no data defects were found during
validation — `kommune_nr`/`region_kind` used the established macros from the first commit, and
every drift-gated artifact was regenerated up front, landing clean on the first CI push. Plugs the
registry-side welfare-claim signal Report #4 (Mental-Health Triangulation) and Report #5 (Income &
Welfare Trajectory) were missing.

---

## Acceptance Criteria

- [x] `nav-uforetrygd` ingests cleanly from the live workbook with zero rows silently dropped,
  including both the Oslo-shaped and Stavanger-shaped kommune-rollup row orderings — 6,560 rows,
  verified by running the real ingest, not just unit tests.
- [x] `raw.nav_uforetrygd` correctly has no `category_unit`-style column — `category_format` is
  derived from the sheet, not a column within it.
- [x] `indicators__nav_uforetrygd` and `mart_indicators__nav_uforetrygd` build and test clean
  against real loaded data (20/20 data tests).
- [x] `nav-uforetrygd` appears in `meta_sources.served_as` after a real deploy, independently
  verified via live `curl`. Deployed by imac (urb-agents#1797), verified independently by this
  agent against the live public API: 6,560 rows, non-empty `served_as`.
- [x] Golden-file tests cover: an ordinary kommune row, an Oslo-shaped bydel block (rollup row
  after its children, no `"i alt"` suffix), a Stavanger-shaped bydel block (rollup row before its
  children, `"i alt"` suffix), and the all-suppressed `0301 Oslo` row (31 tests total).
- [x] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped, same as the
  prior corrections made 2026-10-01.

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
