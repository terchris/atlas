# Plan: Ingest Bufdir's Barnevern kommunemonitor

Ingests Bufdir's child-welfare (barnevern) kommune monitor as a new Atlas source, reusing the
`bufdir-barnefattigdom` ZIP-bulk-export pattern — adapted, not copied, because the two monitors'
workbooks are shaped differently (verified below).

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Add `bufdir-barnevern` as a served Atlas source, plugging the barnevern axis that Report
#2 (Child Welfare / Vulnerability Composite) is missing today.

**Last Updated**: 2026-10-01

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](INVESTIGATE-new-norwegian-public-sources.md) §Tier 1 #1 ([Q1]–[Q3])

**Prerequisites**: None. The "Phase 0 schema prep" this investigation originally pointed to was a
phantom (no `provider` enum, no `dim_period`/`dim_indicator` tables exist) — see the investigation's
2026-10-01 correction. `bufdir` is already a valid `publishers.yaml` provider (used by
`bufdir-barnefattigdom`), so no new publisher metadata is needed either.

**Pattern reference**: `atlas-data/ingest/src/sources/bufdir-barnefattigdom/` (index.ts, parse.ts,
fetch_retry.ts). Adapt the *shape* of this module, not the literal code — Phase 1 below records
concrete, verified differences between the two monitors' ZIPs that make a byte-for-byte copy wrong.

---

## Problem Summary

Atlas ingests Bufdir's Barnefattigdom (child-poverty) kommunemonitor but not its sibling Barnevern
(child-welfare) kommunemonitor, even though both are published the same way, from the same CMS, and
the investigation named this as the #1 gap-fill candidate five months ago. Today Report #2 (Child
Welfare / Vulnerability Composite) has child low-income, persistent low-income, single-parent share,
bullying, and overcrowded housing — but no barnevern axis at all: no measure of how many children are
actually in contact with, or removed into, the child-welfare system. Bufdir's Barnevern monitor is
the canonical kommune-level measurement for that axis.

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-01, recorded here so it isn't re-derived)

The investigation's own description of this source ("machine-readable JSON... open data API") was
wrong — `bufdir-barnefattigdom`'s own history (`INVESTIGATE-bufdir-barnefattigdom-zip-ingest.md`,
`INVESTIGATE-bufdir-upstream-restructure.md`) already corrected that to "ZIP bulk export of
`Indikator_*.xlsx` workbooks, discovered by scraping the monitor landing page." This phase checked
whether Barnevern follows the *same* mechanism and the *same* internal shape. It follows the
mechanism; it does not follow the same internal shape.

### Tasks

- [x] 1.1 Fetch the live monitor page (`https://www.bufdir.no/statistikk-og-analyse/monitor/barnevern/`)
  and confirm it publishes a bulk ZIP the same way Barnefattigdom does.
  **Confirmed** — `<title>Barnevern kommunemonitor | Bufdir</title>`, same Strapi/Azure Container
  Apps CMS, canonical download link:
  `https://ca-statistikk-strapi-prod.whitesea-89be7839.norwayeast.azurecontainerapps.io/uploads/Kommunemonitor_barnevern_2026_09_04_cedc894149.zip`
  (`Last-Modified: Fri, 04 Sep 2026`, `content-type: application/zip`, 1,295,973 bytes).
  ⚠️ **Filename shape differs from Barnefattigdom's.** Barnefattigdom: `YYYY_MM_DD_barnefattigdom_monitor_<hash>.zip`.
  Barnevern: `Kommunemonitor_barnevern_YYYY_MM_DD_<hash>.zip` — different word order, different leading
  token. `discoverZipUrl`'s four regex tiers in `bufdir-barnefattigdom/parse.ts` all require the
  literal `barnefattigdom` substring (confirmed by reading the regexes directly); none would match a
  barnevern URL. **This needs its own discovery function with its own four tiers matching
  `barnevern`/`kommunemonitor_barnevern`**, not a parameterized reuse of the existing one — don't
  force a shared abstraction across two literal strings seen once each; copy the *shape* (progressive
  tiers, `sole-upload` last resort, loud failure on ambiguity) into a new, separate function.

- [x] 1.2 Download the live ZIP and inspect its contents.
  **Confirmed** — 24 workbooks, 1,435,207 bytes uncompressed:
  ```
  1A_andel_ant_barn_tiltak_ilaaret_ialt_0_17.xlsx   1F_fosterhjem_i_familie_nære_nettverk.xlsx
  1B_barn_med_undersøkelse_ift_innbyggere_0_17.xlsx 2A_utgifter_per_barn_i_befolkningen.xlsx
  1C_barn_utenfor_hjemmet_ift_innbyggere_0_17.xlsx  2B..2F (utgifter-familien)
  1D_barn_med_hjelpetiltak...xlsx                   3A, 3C, 3I, 3L, 3M (frister/bemanning/akutt)
  1E_barn_med_undersøkelse_el_tiltak_per_årsverk.xlsx 4A..4F (befolkning/sosioøkonomi)
  Turnover_kommunalt barnevern_2016-2024.xlsx        (one non-conforming filename, has a space, no code prefix)
  ```
  ⚠️ **Filenames use an alphanumeric indicator code** (`1A`, `1E`, `3M`, `4F`, …), never the purely
  numeric `Indikator_<n>` scheme Barnefattigdom uses. **One of 24 files doesn't even carry a code**
  (`Turnover_kommunalt barnevern_2016-2024.xlsx`) — it's the same indicator as `3M_turnover_...xlsx`
  with a different (older?) year range; needs a decision in Phase 2 (dedupe against `3M`, or keep
  both and let a dbt test catch any disagreement).

- [x] 1.3 Inspect the internal workbook structure (sheet name, header row, columns) and compare to
  Barnefattigdom's `Data` sheet / `Region, Regionnavn, Enhet, Tallformat, <years>` shape.
  **Confirmed different, not a variant — genuinely different layout:**
  - Sheet name is **`Sheet1`**, not `Data` (checked `1A_...xlsx`). The one non-conforming file
    (`Turnover_...xlsx`) has **two sheets**, `Info` and `Turnover saksbehandlere` — a third shape
    again.
  - The header row is **row 3**, not row 1 — row 1 holds a single cell equal to the filename stem
    (e.g. `1A_andel_ant_barn_tiltak_ilaaret_ialt_0_17`), not a separate human-readable title sentence
    the way Barnefattigdom's row-1 title apparently is. **There is no richer title string in the
    sheet to parse** — `indicator_title` for Barnevern likely has to be a prettified version of the
    filename slug, at least for `1A`. Re-check 2–3 more files in Phase 2 before finalizing; don't
    assume this holds for all 24 on the strength of one file.
  - **Columns: `Region | Regionnavn | Tallformat | <year columns 2015..2025>` — no `Enhet` column at
    all.** Barnefattigdom's `category_unit` dimension (barn/husholdning) doesn't exist here, because
    Barnevern's indicators are already child-population rates, not paired child/household tuples.
    `raw.bufdir_barnevern` must drop `category_unit` from its primary key and columns entirely — it
    is not "always null", it is not a column.

- [x] 1.4 Before writing the parser, sample more workbooks across the numbered families to confirm
  the `Sheet1` / row-3-header / no-`Enhet` shape holds across the whole bundle, not just `1A`.
  **Confirmed** on `2C_brutto_utgifter_...xlsx`, `3A_fristbrudd_...xlsx`, `4F_barn_med_bekymringsmelding_...xlsx`:
  all four (including `1A`) are `Sheet1`, row 1 = filename-stem title, row 3 = header, no `Enhet`
  column. `2C`'s shared-strings *pool* doesn't surface `Regionnavn`/`Tallformat` near the front (it's
  dominated by a long run of region codes before those strings first appear), which looked like a
  possible wrinkle — checking `2C`'s actual `<row r="3">` cells directly (not the string pool order)
  resolved it: same `Region | Regionnavn | Tallformat | <years>` header as the other three. The
  shape holds across all four samples spanning `1*`–`4*`.

### Validation

✅ Confirmed 2026-10-01 — four sampled workbooks across `1*`–`4*` all share the same shape
(`Sheet1`, row-3 header, `Region | Regionnavn | Tallformat | <years>`, no `Enhet`). Phase 1 is DONE.

---

## Phase 2: Ingest module + raw table

### Tasks

- [ ] 2.1 Create `atlas-data/ingest/src/sources/bufdir-barnevern/`:
  - `fetch_retry.ts` — copy verbatim from `bufdir-barnefattigdom` (generic retry wrapper, no
    barnefattigdom-specific logic; the file's own header already notes this pattern is duplicated
    per-source rather than shared, so a fourth copy matches existing convention).
  - `parse.ts` — new file, same *shape* as the sibling (`discoverZipUrl`-equivalent,
    `surrogateIndicatorApiId`-equivalent, sheet parser), different literals:
    - Discovery tiers match `barnevern` / `kommunemonitor_barnevern`, not `barnefattigdom`.
    - Surrogate id: `/^(\d+[a-z])_/i` captures the `1a`/`3m`-style code → `bv_zip_ind_<code>`
      (e.g. `bv_zip_ind_1a`). Hash fallback (`bv_zip_<sha256-24>`) for the one non-conforming
      `Turnover_...xlsx` filename, same defensive shape as the sibling's hash-fallback tier — do not
      hardcode a special case for that one file.
      **Use a `bv_` prefix, not `bf_`**, so the two sources' surrogate ids are visibly
      distinguishable in `raw`/marts even though a collision is already unlikely (Barnevern's codes
      are inherently alphanumeric, Barnefattigdom's are purely numeric).
    - Sheet reader targets `Sheet1` at header row 3 (confirmed in Phase 1), no `Enhet`/`category_unit`
      column to unpivot.
  - `index.ts` — adapted from the sibling's orchestration (fetch monitor page → `discoverZipUrl` →
    download → extract → parse each workbook → upsert `raw.bufdir_barnevern`), same
    `matchTier !== "canonical"` warn-log pattern.
  - `manifest.yml` — hand-authored, matching the sibling's style:
    ```yaml
    source_id: bufdir-barnevern
    upstream_id: barnevern-monitor
    upstream_url: https://www.bufdir.no/statistikk-og-analyse/monitor/barnevern/
    upstream_landing_page: https://www.bufdir.no/statistikk-og-analyse/monitor/barnevern/
    upstream_title: "Barnevern kommunemonitor"
    publisher: Barne-, ungdoms- og familiedirektoratet
    license: NLOD
    license_url: https://data.norge.no/nlod/no/2.0
    periodicity: P1Y
    eu_theme: SOCI
    tags:
      provider: bufdir
      topic: child-welfare
      geo: kommune
      cadence: annual
    suggested_joins:
      - bufdir-barnefattigdom
    ```
    `dimensions:` block to be filled in once 1.4's sampling confirms the final column set —
    expect `indicator_api_id`, `region_code`, `category_format` (Tallformat — no `category_unit`),
    `year`, `values_json`.
  - `README.md` — short, matching sibling's structure.
  - `__tests__/` — golden-file tests for discovery (barnevern URL shapes, ambiguous-ZIP refusal) and
    the parser (at minimum the `1A` shape and the `Turnover` outlier shape), mirroring the 29 tests
    PR #67 added for the sibling.

- [ ] 2.2 `atlas-data/migrations/056_raw_bufdir_barnevern.sql` — `create table raw.bufdir_barnevern`
  with primary key `(indicator_api_id, region_code, category_format, year)` (no `category_unit` —
  see Phase 1.3), plus `comment on table/column` following the sibling's style, written fresh for
  the actual Barnevern shape rather than copied (the sibling's own migration comments are already
  slightly stale relative to its current ZIP-era columns — don't propagate that).

### Validation

```bash
cd atlas-data/ingest && npm test -- bufdir-barnevern
```
Golden-file tests pass; a manual run against the live ZIP produces a plausible row count (24
workbooks × kommune/fylke/national rows × ~10 years) with zero rows silently dropped (cross-check
sheet row count vs. ingested row count per workbook, the same completeness check PR #67 did for the
sibling).

---

## Phase 3: dbt staging and marts

### Tasks

- [ ] 3.1 Add `raw.bufdir_barnevern` to `atlas-data/dbt/models/indicators/sources.yml`.
- [ ] 3.2 `atlas-data/dbt/models/indicators/indicators__bufdir_barnevern.sql` — same shape as
  `indicators__bufdir_barnefattigdom.sql` (kommune_nr/fylke_nr split from `region_code`,
  `contents_code`/`contents_label` synthesized), **minus `category_unit`** — the sibling's
  `contents_code` formula (`'bf_' || indicator_slug || '__' || category_unit || '__' || category_format`)
  has no `category_unit` to join into for this source; use
  `'bv_' || indicator_slug || '__' || category_format`.
- [ ] 3.3 Document the new model's columns in `atlas-data/dbt/models/indicators/schema.yml` (run
  `check-osmosis.sh` against a local Postgres with `raw.bufdir_barnevern` loaded — per
  [`local-postgres-for-real-dbt-evidence`], no Docker needed, TCP socket, short path).
- [ ] 3.4 `atlas-data/dbt/models/marts/api/mart_indicators__bufdir_barnevern.sql` — api passthrough,
  mirroring `mart_indicators__bufdir_barnefattigdom.sql`. Document in
  `atlas-data/dbt/models/marts/api/schema.yml`.
- [ ] 3.5 Run `dbt build` locally against the loaded fixture and confirm `dbt test` is clean —
  relationship test against `dim_kommune` for `kommune_nr`, `not_null` on the primary-key columns.

### Validation

```bash
cd atlas-data/dbt && dbt build --select indicators__bufdir_barnevern+ && dbt test --select indicators__bufdir_barnevern+
```
All green against a local Postgres loaded from a real ingest run (not an empty schema — an empty
build passes checks that prove nothing, per `[[ci-builds-from-empty-so-state-defects-are-invisible]]`).

---

## Phase 4: Catalogue, deploy, and verify arrival

### Tasks

- [ ] 4.1 Regenerate the website catalogue (`npm run sources:generate` in `website/`) and confirm
  `bufdir-barnevern` appears as a ninth-publisher-scoped source with no new publisher work needed.
- [ ] 4.2 Run `atlas-data/dbt/check-every-source-is-served.sh` and confirm `bufdir-barnevern` is not
  flagged as unreached.
- [ ] 4.3 Write a `for-ops-atlas-deploy-bufdir-barnevern.md` in `~/home` naming the exact relation
  (`api_v1.mart_indicators__bufdir_barnevern`) and, if measurable by then, an expected row count —
  "cannot predict the count" is an acceptable answer, omitting the source is not.
- [ ] 4.4 **After the deploy runs**, verify arrival — not green CI, not `transform_and_publish`
  SUCCESS, but actual rows: `GET /meta_sources?source_id=eq.bufdir-barnevern&select=served_as` is
  non-empty, and `GET /mart_indicators__bufdir_barnevern?limit=1` returns a row. Per the standing
  rule, the release isn't done until this step confirms rows arrived, not until the PR merges.

### Validation

Live `curl` against the public API returns real Barnevern rows through
`mart_indicators__bufdir_barnevern`, and `meta_sources.served_as` for `bufdir-barnevern` is non-empty.

---

## Acceptance Criteria

- [ ] `bufdir-barnevern` ingests cleanly from the live ZIP with zero rows silently dropped.
- [ ] `raw.bufdir_barnevern` correctly has no `category_unit` column (verified against Phase 1's
  finding, not assumed).
- [ ] `indicators__bufdir_barnevern` and `mart_indicators__bufdir_barnevern` build and test clean.
- [ ] `bufdir-barnevern` appears in `meta_sources.served_as` **after a real deploy**, with rows
  confirmed via a live `curl`, not inferred from CI.
- [ ] Golden-file tests cover both the `1A`-style shape and the `Turnover_...` outlier shape.
- [ ] The investigation (`INVESTIGATE-new-norwegian-public-sources.md`) and `1PRIORITY.md` are updated
  to mark this candidate shipped, same as the other three corrections made 2026-10-01.

---

## Implementation Notes

- **Don't force a shared discovery/surrogate-id module across the two Bufdir sources.** Each has
  exactly one literal string to match; a shared parameterized function buys nothing two separate,
  readable functions don't, and couples two sources' deploy risk together for no reason.
- **The `Turnover_kommunalt barnevern_2016-2024.xlsx` vs `3M_turnover_saksbehandlere.xlsx` overlap**
  is the one real open modelling question this plan doesn't resolve ahead of time — Phase 2's
  completeness check (mirroring what PR #67 did for the sibling) is where to decide whether they're
  duplicates, a methodology revision, or genuinely different year ranges worth keeping both.
- **Do not assume Phase 1's `1A` findings hold for all 24 workbooks.** Task 1.4 is unchecked for a
  reason — this plan's own confidence in the raw-table shape is bounded by two sampled files out of
  twenty-four, which is exactly the "scattered sampling misses clustered failures" risk this project
  has been burned by before. Finish 1.4 before writing the migration DDL.

---

## Files to Modify

- `atlas-data/ingest/src/sources/bufdir-barnevern/manifest.yml` (new)
- `atlas-data/ingest/src/sources/bufdir-barnevern/index.ts` (new)
- `atlas-data/ingest/src/sources/bufdir-barnevern/parse.ts` (new)
- `atlas-data/ingest/src/sources/bufdir-barnevern/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/bufdir-barnevern/README.md` (new)
- `atlas-data/ingest/src/sources/bufdir-barnevern/__tests__/` (new)
- `atlas-data/migrations/056_raw_bufdir_barnevern.sql` (new)
- `atlas-data/dbt/models/indicators/sources.yml`
- `atlas-data/dbt/models/indicators/indicators__bufdir_barnevern.sql` (new)
- `atlas-data/dbt/models/indicators/schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__bufdir_barnevern.sql` (new)
- `atlas-data/dbt/models/marts/api/schema.yml`
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark shipped)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
