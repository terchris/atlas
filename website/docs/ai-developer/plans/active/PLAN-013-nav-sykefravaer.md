# Plan: Ingest kommune-level sykefravær (sick leave) statistics

🔴 **The investigation's framing was wrong on the mechanism, not just a detail — read this before
anything else.** "nav-sykefravaer" was assumed to be a third NAV-Excel-scrape source, same shape as
`nav-uforetrygd`/`nav-aap`. It is not, for a structural reason: **NAV's own sykefravær statistics
pages do not publish kommune-level data at all** — checked live, every downloadable table under
both the `sykefravar` and `sykepenger` sub-pages is fylke-level or coarser (industry, sector, age,
diagnosis, occupation — never kommune). The real kommune-resolved data lives at **SSB, table
12451** ("Bostedskommune- og kjønnsfordelt sykefravær"), reached through this project's existing,
already-proven `lib/pxweb.ts` PXWebAPI client — the same mechanism every `ssb-*` source already
uses, not a new NAV-family Excel parser. **Recommendation: build this as `ssb-12451`, not
`nav-sykefravaer`** — see **[Q1]**.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — Phase 2 IN PROGRESS

**Goal**: Add kommune-level sick-leave statistics to Atlas, completing the NAV-adjacent welfare
triad alongside `nav-uforetrygd` (long-tail disability outcome) and `nav-aap` (transitional
work-assessment benefit) — this one covers the much larger, earlier-stage population: everyone
with a physician-certified sick-leave spell.

**Last Updated**: 2026-10-02

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §Tier 1 #2 ([Q4]–[Q7], [Q32])

**Prerequisites**: None. `ssb` is already a valid `publishers.yaml` provider, and `lib/pxweb.ts`
already exists and is already proven across a dozen+ `ssb-*` sources — no new mechanism, no new
Dagster job (reuses `annual_sources_refresh`-style weekly polling, same as every other `ssb-*`
source; see **[Q4]** on cadence).

---

## Phase 1: Find the real mechanism — DONE (verified 2026-10-02)

### Tasks

- [x] 1.1 Checked NAV's own sykefravær statistics pages for a kommune-level table, the same way
  `nav-uforetrygd`/`nav-aap` found their kommune-level `PST302`/`AAP155` tables.
  **Not found — genuinely absent, not just hard to locate.** Fetched both sub-pages live:
  - `nav.no/.../sykefravar-statistikk/sykefravar` — 14 downloadable tables (`SYFRA 510`-`SYFRA 2501`),
    covering bosted (residence), sektor, næring, alder, yrke, diagnose, varighet, innvandrerstatus,
    fødeland. Downloaded `SYFRA 510` ("etter bosted") directly and inspected it: row labels are
    **fylke names** ("Agder", "Oslo - Oslove", …), zero kommune codes anywhere. Confirmed by
    grepping the whole page's HTML for the literal string "kommune" — zero hits.
  - `nav.no/.../sykefravar-statistikk/sykepenger` — same pattern. Downloaded `SYKP 510` ("etter
    bosted") directly: fylke-level rows only ("Landet", "Agder", "Akershus", …), zero kommune
    codes, zero "kommune" mentions on the page.
  - Both page's own file-naming convention ("etter bosted") means "by place of residence
    (fylke)", not "by kommune" — a different meaning from what the name suggests on first read.
- [x] 1.2 **Found the real kommune-resolved data at SSB instead of NAV.** Queried SSB's own table
  search (`data.ssb.no/api/pxwebapi/v2/tables?query=sykefravær`, the same real API this project's
  `ssb-*` sources already use) rather than guessing a table number. Of ~20 matching tables, three
  explicitly key on `Bostedskommune` (kommune of residence):
  - **`12451`** — Region × Kjønn × ContentsCode × Tid. The simplest, most direct candidate.
  - `12448` — adds Alder (age, 10 groups).
  - `12449` — adds Næring (industry, 2 groups).

  `12451` is the right v1 scope — same "start with the plainest geo-resolved table, breakdowns are
  a fast-follow" philosophy as `udir-gsi`'s grand-total slice.
- [x] 1.3 Verified `12451`'s real shape live via its metadata (`.../tables/12451/metadata`), not
  assumed from the search result's label alone:
  - **Region**: 937 codes, real SSB-format (`0301` Oslo, `1101` Eigersund, `1151` Utsira, …) —
    same convention `classify_region_code` already handles, confirmed by spot-checking the known
    sentinel shapes: `XX99` ("Uoppgitt kommune <fylke>"), `9999` ("Uoppgitt kommune" national),
    `2111` (Longyearbyen/Svalbard), `2199`/`2299` (Svalbard/Jan Mayen unspecified). **No new
    sentinel shape — unlike every NAV-Excel source this session, which each needed a new one**
    (`udir-gsi`/`husbanken-bostotte`'s Svalbard-as-kommune bug class, `nav-aap`'s non-numeric
    `Ukjent`). SSB's own Region dimension already carries full history back to kommune mergers,
    same as `dim_kommune`.
  - **Kjonn**: 3 codes (`0` Begge kjønn, `1` Menn, `2` Kvinner). `0` is the server's own
    elimination default — a query that omits `Kjonn` entirely still returns `Begge kjønn` only,
    confirmed live, though this plan recommends passing it explicitly for robustness against a
    future default change.
  - **ContentsCode**: 9 measures, not 1 — `Sykefraversprosent` (%), `Sykefraversdagsverk` (lost
    workdays), `ArbeidstakereSykefra`/`ArbeidstakereSykePro` (a different metric: count/share of
    employees who had *any* sick-leave spell, not days-weighted), plus four `*Endr*` variants that
    are pure year-over-year deltas of the measures above. See **[Q2]** for v1 scope.
  - **Tid**: 105 quarters, `2000K2`-`2026K2`.
  - Full cartesian product: 937 × 3 × 9 × 105 = **2,655,315 cells** — over SSB's 800,000-cell
    request limit (documented in `lib/pxweb.ts`'s own header). **Filtering is required, not
    optional** — same category of constraint as Husbanken's Qlik pagination limit and Udir's
    420-column cross-tab, a different shape each time but the same lesson: check the real size
    before assuming one request covers it.
- [x] 1.4 **Proved end-to-end by pulling real data, not just confirming the schema.** A live,
  filtered query (`valuecodes[Region]=0301,1101,1151&valuecodes[Kjonn]=0&valuecodes[ContentsCode]=Sykefraversprosent,Sykefraversdagsverk&valuecodes[Tid]=TOP(4)`)
  returned real, plausible figures for all three test kommuner — Oslo, Eigersund (an ordinary
  kommune), and Utsira (Norway's smallest by population):
  ```
  Oslo       2025K3-2026K2: 4.1, 4.9, 5.1, 4.8 %      914600, 1047600, 1067700, 942500 dagsverk
  Eigersund  2025K3-2026K2: 4.3, 5.6, 6.0, 5.4 %       18400,   22900,   23700,   20000 dagsverk
  Utsira     2025K3-2026K2: 4.3, 5.4, 4.6, 6.3 %         240,     300,     230,     310 dagsverk
  ```
  No suppression observed on any of the nine cells, including Utsira's small-kommune ones — not a
  blanket claim of "no suppression anywhere in this table," just what this specific sample showed.
  Confirm against the smallest kommune by activity (not necessarily population) during Phase 2.
- [x] 1.5 **Licence correction — this is SSB data, not NAV's, despite covering NAV-administered
  benefits.** The investigation's licence note for this family ("CC BY 4.0... unverified for
  sykefravær") assumed the NAV-Excel mechanism and inherited NAV's licence by analogy. Since the
  real source is SSB's own PXWebAPI table, the real licence is **NLOD** — SSB's standard, same as
  every other `ssb-*` source in this repo, confirmed by the table's own metadata (`"copyright":
  false` in the `px` extension block) and by precedent (every `ssb-*` manifest in this repo
  declares NLOD). **Not CC BY 4.0** — the two NAV-Excel sources' licence correction does not
  transfer to this candidate, because the candidate itself changed.

### Validation

✅ Confirmed 2026-10-02. Real metadata fetched, real filtered query executed, real figures
returned for three kommuner of differing size — not inferred from the table search result's label.

---

## Open Questions

- **[Q1] Name this `ssb-12451`, not `nav-sykefravaer`.** The investigation's original [Q4]
  decision ("NAV: one folder per indicator family") assumed an NAV-Excel mechanism needing its own
  per-family parser, the same reason `nav-uforetrygd`/`nav-aap` each got their own folder. This
  candidate reuses `lib/pxweb.ts` unchanged — structurally identical to every `ssb-*` source
  already in the repo, not a new mechanism. **Recommendation**: `source_id: ssb-12451`,
  `provider: ssb`, folder `atlas-data/ingest/src/sources/ssb-12451/`, dbt model
  `indicators__ssb_12451` — matching this repo's unbroken "ssb-sourced table = ssb-<table-id>"
  convention, not the NAV-family folder convention. This is a real deviation from how this
  candidate was filed in the investigation and backlog docs; the rename should be reflected when
  this ships (see "Files to Modify").
- **[Q2] ContentsCode scope for v1 — 9 measures exist, how many ship?**
  **Recommendation**: `Sykefraversprosent` + `Sykefraversdagsverk` only — the two headline
  measures (percentage and absolute lost workdays), matching `ssb-12944`'s single-measure-family
  style. Defer `ArbeidstakereSykefra`/`ArbeidstakereSykePro` (a materially different metric —
  people who had *any* spell, not days-weighted) and all four `*Endr*` year-over-year-delta
  variants, which are trivially re-derivable from the raw quarterly series Atlas already carries
  and which no other Atlas source ingests as separate stored rows.
- **[Q3] Kjonn scope for v1 — total only, or total + sex-split?**
  **Recommendation**: `Kjonn=0` (Begge kjønn) only for v1, matching every other Atlas source's
  "kommune total first, breakdowns are a fast-follow" default. A future source can add the
  sex-split without re-deriving the mechanism.
- **[Q4] Cadence — annual-style weekly poll, or something tighter?** SSB updates this table
  quarterly (confirmed via its own `updated` timestamp and `Tid` dimension). **Recommendation**:
  weekly poll via `annual_sources_refresh` (the existing job already polls several quarterly/annual
  SSB tables this way — e.g. `ssb-06913` is a long time series, polled weekly to catch a quarterly
  release promptly) — not a new Dagster job, and not `monthly_sources_refresh` (that job's own
  docstring scopes it to genuinely-monthly data, and this is quarterly).
- **[Q5] `topics.yaml` category — social or health?** The investigation's EU-theme note flagged
  this as a real open question ("possibly split with HEAL for sickness statistics"). Sykefravær is
  fundamentally a labour-market/welfare-claim statistic (who is absent from paid work and why),
  closer in kind to `nav-uforetrygd`/`nav-aap` than to FHI's health-outcome sources.
  **Recommendation**: `social`, matching the sibling NAV-adjacent sources — not resolved with
  certainty, confirm against `topics.yaml` before writing the manifest, per **[Q4]**'s own note on
  `nav-aap`'s Phase 2 about catching this before a CI failure rather than from one.
- **[Q6] Historical depth — all 105 quarters (back to 2000K2), or a shorter window?**
  **Recommendation**: all of them — SSB serves the full series in one request within the
  800,000-cell budget once ContentsCode/Kjonn are scoped per **[Q2]**/**[Q3]** (937 × 1 × 2 × 105 =
  196,770 cells, comfortably under the limit, no pagination needed), and a longer time series is
  strictly more useful with no extra ingest cost. Confirm the exact cell count against whatever
  **[Q2]** actually settles on before relying on this number.
- **[Q7] The two documented data-quality notes in the table's own metadata — represent, don't
  correct.** SSB's own metadata names: (a) a trend break 2007→2008 (industry-standard change) and
  2014→2015 (NAV register replaced by A-ordningen); (b) a since-corrected error affecting Q1 2026
  (25,656 employment relationships misassigned between two Østfold/Akershus kommuner, fixed by SSB
  before this plan's research). Neither needs an Atlas-side fix — SSB already applied its own
  correction, and the trend breaks are a fact about the series, not a defect in it. Record both in
  the manifest's `methodology_notes`, same as every prior source's upstream caveats.

---

## Phase 2: Ingest module + raw table (not started)

### Tasks

- [ ] 2.1 Create `atlas-data/ingest/src/sources/ssb-12451/` (per **[Q1]**) — same shape as
  `ssb-12944`: `index.ts` calling `fetchPxTableData`/`parseJsonStat2` from `lib/pxweb.ts` with
  explicit filters for `Region=*` (or the full code list), `Kjonn=0`, `ContentsCode=<Q2's
  choice>`, `Tid=*`; no new parser module needed — `lib/pxweb.ts`'s existing `parseJsonStat2` is
  already generic across dimension shapes.
  - `manifest.yml` — `source_id: ssb-12451`, `provider: ssb`, `license: NLOD`, `periodicity: P1Y`
    (annual-cadence-style weekly poll per **[Q4]**, even though the underlying data is quarterly —
    confirm this matches how other quarterly-but-weekly-polled `ssb-*` sources declare it, e.g.
    `ssb-06913`, before committing to `P1Y` vs `P3M`/`irregular`).
  - `README.md` and `__tests__/` — golden-file test against a real captured JSON-stat2 response
    (reuse `ssb-12944`'s test pattern: a real fixture file, not a hand-built mock).
- [ ] 2.2 Migration `raw.ssb_12451(region_code, period, contents_code, contents_label, value,
  status, loaded_at)` — same shape as `raw.ssb_12944`, PK `(region_code, period, contents_code)`.
- [ ] 2.3 Dagster registration — add `ssb-12451` to the existing weekly-polled `SSB_SOURCES` list
  (`raw_ssb.py`/`schedules.py`'s `_ANNUAL_SOURCE_IDS`), same job every other `ssb-*` source uses.
  No new job.

### Validation

```bash
cd atlas-data/ingest && npm run ingest:ssb-12451   # the REAL npm-run invocation, not a direct tsx call
```
🔴 **Run it this exact way.** `check-every-source-has-an-ingest-script.sh` (added after
`husbanken-bostotte`'s urb-agents#1807) will catch a missing script entry in CI, but verify with
the real invocation anyway rather than relying solely on the gate, per that incident's own lesson.

Real filtered query returns the expected cell count for whatever **[Q2]**/**[Q3]** settle on; a
spot-check against Oslo, Eigersund and Utsira matches this plan's own Phase 1.4 figures exactly
(same table, same period range, no republish should have happened between research and ingest —
if it has, that is itself worth noting, not silently absorbed).

---

## Phase 3: dbt staging and marts (not started)

### Tasks

- [ ] 3.1 Add `raw.ssb_12451` to `models/indicators/sources.yml`.
- [ ] 3.2 `indicators__ssb_12451.sql` — `kommune_nr`/`region_kind` via
  `region_code_to_kommune_nr`/`classify_region_code` from the first commit. **Expect this to pass
  clean, not need a correction** — unlike every NAV-Excel source this session, SSB's own Region
  dimension already matches this macro's existing patterns exactly (confirmed in Phase 1.3); if it
  doesn't, that is itself a more surprising finding worth stopping on.
- [ ] 3.3 Document columns in `schema.yml`; validate against a local Postgres loaded with the real
  ingest.
- [ ] 3.4 `mart_indicators__ssb_12451.sql` api passthrough + `marts/api/schema.yml` entry.
- [ ] 3.5 `dbt build --select indicators__ssb_12451 mart_indicators__ssb_12451` against real
  loaded data.

### Validation

Real local Postgres, not an empty schema. Confirm the sentinel region codes (`XX99`, `9999`,
`2111`, `2199`, `2299`) resolve through `classify_region_code` exactly as Phase 1.3 predicted,
rather than assuming the existing macro "just works" without checking.

---

## Phase 4: Deploy and verify arrival (not started)

Same shape as every prior source's Phase 4 this session — name exact relations, both image
digests labelled, `LANDS WITH` derived via `atlas-data/uis/lands-with.sh`, a row-count prediction
stated explicitly. Independently re-verify against the live public API before closing the deploy
task — do not take a deploy report alone as sufficient, per this session's standing discipline.

---

## Acceptance Criteria

- [x] **The real kommune-level mechanism is identified and verified live** — SSB table 12451 via
  `lib/pxweb.ts`, not a NAV Excel scrape. NAV's own sykefravær/sykepenger pages confirmed to have
  no kommune-level table at all.
- [x] **Licence independently confirmed for this specific candidate** — NLOD (SSB's own,
  confirmed via the table's own metadata and this repo's unbroken `ssb-*` precedent), not CC BY
  4.0 inherited from the NAV-family assumption.
- [ ] The source ships as `ssb-12451` (per **[Q1]**), not `nav-sykefravaer` — confirm this
  decision is actually carried through at Phase 2, not quietly reverted to the family-folder name
  under naming-consistency pressure from the other two NAV sources.
- [ ] `ssb-12451` ingests cleanly with zero rows silently dropped, for whatever ContentsCode/Kjonn
  scope **[Q2]**/**[Q3]** settle on.
- [ ] `indicators__ssb_12451` and `mart_indicators__ssb_12451` build and test clean against real
  loaded data, with every sentinel region code resolving through `classify_region_code` as
  predicted.
- [ ] `ssb-12451` appears in `meta_sources.served_as` after a real deploy, independently verified
  via live `curl`.
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped — and to
  correct the "nav-sykefravaer" framing wherever it's referenced, not just add a new entry beside
  the old name.

---

## Implementation Notes

- **This is not a new mechanism — it is the simplest Phase 2 of any source this session.**
  `lib/pxweb.ts` and `parseJsonStat2` already exist, are already proven, and need zero changes.
  The entire Phase 2 is: write `manifest.yml`, write a thin `index.ts` matching `ssb-12944`'s
  shape with this table's own filters, write the migration, register with Dagster, write tests
  against a real captured fixture. No discovery-tier HTML scraping, no sheet-shape quirks, no
  suppression-marker handling (none observed), no new sentinel shape.
- **Do not build this as `nav-sykefravaer`.** See **[Q1]**. If something about Phase 2 reveals a
  reason the NAV-family folder convention should apply after all, name that reason explicitly
  rather than defaulting back to it for consistency with the other two NAV sources alone.
- **The 800,000-cell request limit is real and this table trips it unfiltered.** 2,655,315 cells
  for the full cartesian product. Scope `ContentsCode`/`Kjonn` per **[Q2]**/**[Q3]** before writing
  the first live query in `index.ts`, not after a `curl` to production returns an error.
- **SSB's own metadata already documents two data-quality caveats for this table** — a trend
  break and a since-corrected assignment error (**[Q7]**). Carry them into `methodology_notes`
  verbatim; this is upstream's own account of its data, not something Atlas is discovering or
  correcting.

---

## Files to Modify

- `atlas-data/ingest/src/sources/ssb-12451/manifest.yml` (new — per **[Q1]**, not
  `nav-sykefravaer/`)
- `atlas-data/ingest/src/sources/ssb-12451/index.ts` (new)
- `atlas-data/ingest/src/sources/ssb-12451/README.md` (new)
- `atlas-data/ingest/src/sources/ssb-12451/__tests__/` (new)
- `atlas-data/ingest/package.json` (`ingest:ssb-12451` script — add first, verify with the real
  `npm run` invocation before anything else, per `nav-aap`'s own Phase 2 lesson)
- `atlas-data/migrations/<next>_raw_ssb_12451.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_ssb.py` or equivalent (`SSB_SOURCES` list — existing
  weekly job, no new Dagster infrastructure)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__ssb_12451.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__ssb_12451.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `ssb` listing — bump the count)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  shipped; correct the "nav-sykefravaer" framing to name `ssb-12451`, per **[Q1]**)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
