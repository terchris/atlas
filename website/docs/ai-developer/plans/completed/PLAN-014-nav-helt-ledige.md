# Plan: Ingest kommune-level helt ledige (fully unemployed) statistics

Ingests NAV's HL060 table — monthly count and share (of the labour force) of people registered as
fully unemployed, per kommune — as Atlas's fourth NAV-adjacent source. Unlike `nav-sykefravaer`
(PLAN-013, which turned out to require SSB instead of NAV), **this candidate's own mechanism
matches the investigation's description**: NAV's own site genuinely publishes a dedicated
kommune-level table (`HL060 "Fylke og kommune"`), the same NAV-Excel shape as `nav-uforetrygd` and
`nav-aap`, reached from a real HTML anchor the same way `nav-aap`'s download link was.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Add `nav-helt-ledige` as a served Atlas source — the *short-tail* labour-market signal
slotting between `nav-uforetrygd` (long-tail disability outcome) and `nav-aap` (transitional
work-assessment benefit), per the investigation's own framing. Plugs Report #5 (Income & Welfare)
and adds an axis to Report #4 (Mental-Health Triangulation — acute unemployment correlates with
mental health).

**Last Updated**: 2026-10-02

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §C.4 ([Q45], [Q37])

**Prerequisites**: None. `nav` is already a valid `publishers.yaml` provider, `topics.yaml` already
has `social` validated (`nav-uforetrygd`/`nav-aap`), and the existing `monthly_sources_refresh`
Dagster job already exists and fits this cadence directly — no new job.

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-02)

Checked live rather than trusting the investigation's description, the same discipline applied to
every prior source — but this time the description held up structurally, which is itself worth
confirming explicitly rather than assuming after two sources in a row (`husbanken-bostotte`,
`nav-sykefravaer`) where it didn't.

### Tasks

- [x] 1.1 Find the live download page and the real download link. **Confirmed** —
  `https://www.nav.no/no/nav-og-samfunn/statistikk/arbeidssokere-og-stillinger-statistikk/helt-ledige`
  lists ~8 numbered tables (`HL050`-`HL090`), each a different breakdown (age×sex, education,
  occupation, duration/long-term, immigrant background, fylke-only yearly). **Only `HL060` ("Helt
  ledige. Fylke og kommune. Tidsserie måned") is kommune-resolved** — same "exactly one
  kommune-grain table per NAV statistics page" pattern as `PST302`/`AAP155`. The download link is
  a real `<a href="/_/attachment/download/<uuid>:<hash>/202608_HL060%20...xlsx">` anchor directly
  in the server-rendered HTML — same simpler-than-PST302 discovery shape `nav-aap` found, not
  `__NEXT_DATA__` JSON.
- [x] 1.2 **Licence — same blanket NAV statement already confirmed twice this session.** The
  workbook's own first cell states `"Kilde: NAV"` directly, and the file is served from
  `www.nav.no`'s own attachment system — no SSB involvement this time (unlike `nav-sykefravaer`).
  CC BY 4.0 applies, per the same statistics-practices page fetched during `nav-aap`'s Phase 1
  (`nav.no/.../praksis-rutiner-og-retningslinjer-rundt-offisiell-og-offentlig-statistikk-fra-nav`)
  — re-confirmed as applying to this specific table by checking its own `"Kilde: NAV"` provenance,
  not assumed by family resemblance alone.
- [x] 1.3 Download the live HL060 workbook (period: January-August 2026) and inspect its real
  structure. **5 sheets**: `"0. Om tabellene"` (methodology), `"1. Fylke Antall"`,
  `"2. Fylke Prosent av arbeidsstyr"`, `"3. Kommune Antall"`, `"4. Kommune Prosent av arbeidsst"`.
  Only the two `Kommune` sheets are in scope.

  **A fourth distinct pivot shape within the NAV family this session** — not identical to
  PST302's, AAP155's, or (not applicable) sykefravær's SSB shape:
  ```
  B6:  "Oslo - Oslove"                        ← bare fylke header, NO "I alt", NO code, NO data
  B7:  (blank) | Januar | ... | August         ← month header row, repeats per fylke block
  B8:  "I alt Oslo - Oslove" | 12125 | ...     ← fylke total, "I alt <name>" — NO digit code at all
  B9:  "0301 Oslo - Oslove" | 12125 | ...      ← the one kommune in this fylke, real values
  B10: "Rogaland"                              ← next fylke header
  ...
  B13: "1101 Eigersund" | 197 | ...            ← ordinary kommune row
  ...
  B422: "Svalbard og øvrige områder"           ← a 17th "fylke" block
  B424: "I alt Svalbard og øvrige områder" | 13 | ...
  B425: "2100 Svalbard" | 13 | ...             ← Svalbard's own real pseudo-kommune code
  B427: "Ukjent"                               ← an 18th "fylke" block, no numeric code anywhere
  B429: "I alt Ukjent" | 13 | ...
  B430: "Ukjent" | 13 | ...                    ← the "kommune"-level child, same literal "Ukjent"
                                                   label, same values as its own "I alt" row
  ```
  **Simpler to classify than PST302 or AAP155**: neither the bare fylke header row nor the
  "I alt <name>" total row carries any digit at all here (unlike AAP155's "I alt 03 Oslo", which
  embeds the 2-digit fylke code). A single rule — "label starts with exactly 4 digits" — correctly
  admits only real kommune rows and the Svalbard pseudo-kommune, with no "I alt" prefix check
  needed at all. Confirmed by scanning the entire sheet: zero digit-leading labels outside that
  shape.

  **Both sentinel shapes already have precedent from this session, no new one needed**: `2100
  Svalbard` matches `classify_region_code`'s existing `^21\d{2}$` branch exactly (same as
  `udir-gsi`/`husbanken-bostotte`'s finding); the bare literal `"Ukjent"` label with no numeric
  code at all is structurally identical to `nav-aap`'s own `Ukjent` finding (PLAN-012 [Q1]) and
  falls through to the macro's existing `unknown` branch the same way.

  **358 distinct 4-digit-leading codes**: 357 real kommuner + `2100` Svalbard — confirmed by
  counting, not assumed.
- [x] 1.4 Confirm numeric cell typing and the suppression marker. **Confirmed** — native numeric
  cells (same as every NAV-Excel source this session). Suppression marker is the literal `*`, same
  convention as `nav-uforetrygd`/`nav-aap` — but **a different legal citation**: the workbook's own
  methodology sheet states *"I henhold til Statistikklovens § 7-1 ... mindre enn 4 ... «*»"* — §
  7-1, not AAP155's § 2-6. Same `<4`-person threshold, different paragraph of the same law; worth
  recording exactly rather than assuming every NAV table cites the same section. **15 kommuner
  show real suppression** in the live sample (Utsira, Kvitsøy, Modalen, Tydal, Røst, and others —
  genuinely small kommuner), confirmed cell-by-cell (a single kommune row can mix real numbers and
  `*` across different months in the same row).
- [x] 1.5 Check the archive / historical-backfill shape. **An archive page exists**
  (`.../helt-ledige/arkiv-helt-ledige_kap`, HTTP 200) but a static-HTML scan found no `HL060`
  reference in it — same inconclusive result as `nav-aap`'s archive check, not the same as
  `nav-uforetrygd`'s clean one-file-per-year pattern. **[Q1] Historical backfill is deferred**,
  same decision as every prior NAV-Excel source — v1 ingests the live current-year file only.
- [x] 1.6 Checked `data.norge.no` for a cleaner distribution — **same conclusion as every prior
  NAV table**: queried the real search API (`search.api.fellesdatakatalog.digdir.no/search`) for
  `HL060`: the ten results returned are all unrelated Brønnøysund/Nasjonalbiblioteket entries, not
  NAV statistics. `www.nav.no` is the real, current, sole publication surface.
- [x] 1.7 **Two real trend-break notes in the workbook's own methodology sheet — represent, don't
  correct.** (1) A January 2024 kommune/fylke reform footnote — fylker split/changed, figures
  "presented under the currently valid kommune/fylke structure" per NAV's own note. (2) A labour-
  force-methodology break from November 2018 (new registration method) and April 2025 (a larger
  modernisation of NAV's labour-market statistics) — two distinct trend breaks in the same series,
  not one. Both are upstream's own documented account of its data, same "carry verbatim into
  methodology_notes" discipline as `ssb-12451`'s **[Q7]**.

### Validation

✅ Confirmed 2026-10-02. Real file downloaded and inspected directly (both sheets, full row count,
not a sample) — same discipline as every prior source.

---

## Open Questions

- **[Q1] Historical backfill — deferred, same decision as every prior NAV-Excel source.** HL060's
  archive mechanism is inconclusive from a static scan (see Phase 1.5) — unlike `nav-uforetrygd`'s
  clean archive, more like `nav-aap`'s inconclusive one. v1 ingests the live current-year file
  only; revisit if a real consumer need for historical helt-ledige data emerges.
- **[Q2] Reuse code from `nav-aap`, or write fresh?** `nav-aap`'s own [Q3] decided to write fresh
  rather than adapt `nav-uforetrygd`'s parser, because the real shapes differed enough that porting
  would import unneeded complexity. Here, HL060's row-classification rule ("exactly 4 leading
  digits, nothing else") is *simpler* than both PST302's and AAP155's — **recommendation: write
  fresh again**, following the same pattern (discovery tier, pure-function parser, golden-file
  tests against a real uncut workbook) rather than importing either prior parser's code.
- **[Q3] `topics.yaml` category — social, matching the sibling NAV sources.** Not expected to be a
  real decision, but confirm against the file before writing the manifest, not after, per
  `nav-aap`'s own Phase 2 note about catching this before a CI failure rather than from one.
- **[Q4] Presentation sensitivity.** Per-kommune unemployment, like uføretrygd and sykefravær, can
  be politically charged in small kommuner — same `presentation_policy: 'sensitive'` consideration
  the investigation's **[Q7]** (on the original NAV family entry) already flagged. Not resolved
  here; a Phase 2/3 modelling decision.
- **[Q5] The `Ukjent` bucket's values are IDENTICAL between its own row and its fylke-level "I alt
  Ukjent" row** (confirmed: both show `13,14,15,15,13,13,15,20`) — i.e., "Ukjent" is simultaneously
  its own "fylke" and its own sole "kommune" in this table's pivot structure, unlike `nav-aap`
  where `Ukjent` was a genuine kommune-level leaf under no separate rollup. **Recommendation**:
  treat it the same as every other kommune-shaped row structurally (one row = one region_code),
  which naturally produces exactly this 1:1 duplication without any special-casing — not a defect
  to fix, just worth naming so a future reader isn't surprised to see the same numbers twice under
  slightly different row positions.

---

## Phase 2: Ingest module + raw table — DONE (verified 2026-10-02)

### Tasks

- [x] 2.1 Created `atlas-data/ingest/src/sources/nav-helt-ledige/`:
  - `discoverWorkbookPath` — found the real `<a href>` on the helt-ledige page, matched `HL060`.
    Same shape as `nav-aap`'s discovery function, written fresh per **[Q2]**, confirmed live — the
    path segment is `download`, not `inline` (AAP155's segment), confirmed not assumed.
  - `parse.ts` — pure functions reading `"3. Kommune Antall"`/`"4. Kommune Prosent av arbeidsst"`,
    classifying rows by "label starts with exactly 4 digits" alone (simpler than both
    `nav-uforetrygd`'s and `nav-aap`'s classifiers — no "I alt" prefix check needed at all,
    confirmed per Phase 1.3's finding).
  - `fetch_retry.ts` — copied from `nav-aap`, same convention as every prior source.
  - `manifest.yml` — `source_id: nav-helt-ledige`, `provider: nav`, `periodicity: P1M`,
    `eu_theme: SOCI`, `tags.topic: social` (**[Q3]**, confirmed against `topics.yaml`),
    `license: CC BY 4.0` (confirmed directly against this table's own `"Kilde: NAV"` provenance,
    Phase 1.2).
  - `README.md` and `__tests__/` — golden-file tests against the real captured workbook (full
    file, not trimmed, same precedent as `nav-uforetrygd`/`nav-aap`'s fixtures) covering: an
    ordinary kommune row (Eigersund, 1101), the Svalbard pseudo-kommune (`2100`), the bare `Ukjent`
    block, and a suppressed row (`1151 Utsira`, mixed real/suppressed cells in the same row). 26
    tests, all passing against the real downloaded fixture.
- [x] 2.2 Migration `063_raw_nav_helt_ledige.sql` — `raw.nav_helt_ledige(region_code,
  category_format, year, month, value, values_json, loaded_at)`, same shape as `raw.nav_aap`, PK
  `(region_code, category_format, year, month)`.
- [x] 2.3 Dagster registration — added to the existing `monthly_sources_refresh` job
  (`_MONTHLY_SOURCE_IDS` in `schedules.py`, `OTHER_SOURCES`/asset group in `raw_other.py`). No new
  job — the third source on it. `dagster definitions validate` passes.

### Validation

```bash
cd atlas-data/ingest && npm run ingest:nav-helt-ledige   # the REAL npm-run invocation
```
🔴 **Run it this exact way, not a direct `tsx` call.** Ran it this exact way, against the live
workbook and then against local Postgres.

**Confirmed, not assumed:** a real run against the live workbook returns 359 distinct regions (357
kommuner + Svalbard's `2100` + `Ukjent`), 8 months each, zero rows silently dropped —
`antall_rows: 2872, prosent_rows: 2872`, `rows_written: 5744` into local Postgres. One finding
caught during real-data verification, not assumed from the plan: **`Ukjent` IS present in BOTH
sheets here** (unlike `nav-aap`, where it's Antall-only) — its Prosent-sheet cells are all NAV's
own suppression marker `*`, not omitted. Documented in `parse.ts`, `manifest.yml` and this file.

---

## Phase 3: dbt staging and marts — DONE (verified 2026-10-02)

### Tasks

- [x] 3.1 Added `raw.nav_helt_ledige` to `models/indicators/sources.yml` — `ingest_cadence:
  monthly`, freshness bounds matching `cadence.MONTHLY_FRESHNESS` exactly.
- [x] 3.2 `indicators__nav_helt_ledige.sql` — `kommune_nr`/`region_kind` via
  `region_code_to_kommune_nr`/`classify_region_code` from the first commit. **Passed clean on the
  first `dbt build`**, as expected — both sentinel shapes resolved exactly as predicted (see
  Validation below).
- [x] 3.3 Documented columns in `schema.yml`; validated against local Postgres loaded with the
  real ingest — 17/17 data tests pass on the first build.
- [x] 3.4 `mart_indicators__nav_helt_ledige.sql` api passthrough + `marts/api/schema.yml` entry.
- [x] 3.5 `dbt build --select indicators__nav_helt_ledige mart_indicators__nav_helt_ledige`
  against real loaded data — `PASS=19 WARN=0 ERROR=0 SKIP=0 TOTAL=19`.

### Validation

Real local Postgres, not an empty schema. Explicitly confirmed by direct query:

```
 region_code | kommune_nr | region_kind | count
-------------+------------+-------------+-------
 2100        |            | svalbard    |    16
 Ukjent      |            | unknown     |    16
```

`2100` resolves to `region_kind='svalbard'`/`kommune_nr=NULL` and `Ukjent` resolves to
`region_kind='unknown'`/`kommune_nr=NULL`, exactly as predicted — no macro change needed, matching
the precedent from `udir-gsi`/`husbanken-bostotte` (svalbard) and `nav-aap` (unknown).

Full dbt check-suite (all 17 scripts) and a full `dbt build` both ran clean — the only non-pass
results (`extracted_columns_are_still_populated`, `raw_sources_were_refreshed_recently`, the
`mart_atlas_inventory` SKIP cascade) are pre-existing environmental staleness in the long-lived
local scratch Postgres, confirmed unrelated to this source: `nav_helt_ledige` does not appear in
either failing test's result set, and `mart_brreg_enhet` (the SKIP's root) builds 14/14 clean in
isolation. Website build (`npm run build`) also passed clean: 51 sources, 88 relations, no broken
links.

---

## Phase 4: Deploy and verify arrival — DONE (verified 2026-10-02)

PR #523 merged to main at `e9e33a5`. Image build (run
[37070426629](https://github.com/terchris/atlas/actions/runs/37070426629)) succeeded; both digests
read from the release's own `uis-artifact.json`, not reconstructed, and cross-checked against the
full build log before sending:

```
artifact_digest  sha256:f91d7dee689f2cbbeb326d130703524a5e4e21bc8d8332832cba0490dd9a7ff4  ghcr.io/terchris/atlas-data/uis:v20261002-e9e33a5
image_digest     sha256:4f32b9a13b4e3b4e2ff5dc9d54ef05b26ab6148d550f05598e34a166eb811c7c  ghcr.io/terchris/atlas-data:v20261002-e9e33a5
```

`lands-with.sh 57bb5f9..e9e33a5` output was clean (no false-positive this time — this range starts
right after `ssb-12451`'s own close-out commit, so only `nav-helt-ledige`'s own ingest directory
changed): `monthly_sources_refresh` (re-fetch) then `transform_and_publish`, plus a template-info
pin (this range changes `atlas-data/template-info.yaml`'s counts).

**Two tasks filed, per the pin/run split ([[a-pin-and-a-run-are-two-actions]]):**
- Deploy request to imac: [urb-agents#1813](https://github.com/terchris/urb-agents/issues/1813) —
  names `raw.nav_helt_ledige` (5,744 rows as of today's validation run, caveat stated: NAV's live
  file grows a column every month), both relations to check row counts on
  (`indicators__nav_helt_ledige`, `atlas_inventory`).
- Pin nomination to ops-dev: [urb-agents#1814](https://github.com/terchris/urb-agents/issues/1814)
  — both digests copied verbatim from `uis-artifact.json`, not reconstructed, per the one prior
  incident where an unlabelled digest was refused at the catalogue.

**Also found and fixed before merge, not after**: CI's `render-template-info.sh` caught a stale
"59 raw BASE TABLEs" claim in `template-info.yaml` (migrations now create 60) — fixed in a
follow-up commit on the same PR before merge. While fixing it, found and corrected a second,
adjacent false claim in the same paragraph ("EVERY NUMBER IN IT IS NOW WRITTEN BY
uis/generate-holdings.py" — checked directly: that script has zero substitutions for "raw"
anywhere, so the raw-table figure is hand-maintained and had already drifted stale before this
PR, independent of it).

**imac's deploy report ([urb-agents#1813](https://github.com/terchris/urb-agents/issues/1813)):**
`monthly_sources_refresh` SUCCESS (76.7s) — `raw.nav_helt_ledige` row count 5,744, exact match to
prediction. `transform_and_publish` SUCCESS (474.3s) — watched PostgreSQL's log live throughout for
#1810-style corruption; zero events. Regression check against 6 prior sources (nav_uforetrygd,
nav_aap, bufdir_barnevern, imdi_bosetting, udir_gsi, ssb_12451, husbanken_bostotte) — all unchanged.
One real discrepancy flagged rather than silently reconciled: this plan's own Phase 4 request had
predicted `atlas_inventory` would also carry a `mart_indicators__nav_helt_ledige` entry; imac found
that endpoint doesn't exist (404) and isn't in inventory.

**ops-dev's pin report ([urb-agents#1814](https://github.com/terchris/urb-agents/issues/1814)):**
tag `v20261002-e9e33a5` pushed to `dev-templates` main, catalogue text regenerated (this bump also
absorbed 11 days of accumulated drift: `nav-aap`, `nav-uforetrygd` and PR #482 had landed since the
last catalogue bump). Separately flagged, not resolved: `template-info.yaml`'s
`operational.automation` text ("ships stopped") may be stale against PR #482's
`default_status=RUNNING`, measured live in urb-agents#1794 — filed as a cross-cutting note in
`1PRIORITY.md` rather than left to die in a closed bus task, since it's unrelated to this source.

**Both independently re-verified against the live public API before closing either task — neither
report was taken on its own word:**
- `GET /indicators__nav_helt_ledige?limit=1` → real row (Oslo, January, 12125 — matches the
  captured live workbook exactly); `Content-Range` / `atlas_inventory` both confirm 5744/5744.
- `GET /meta_sources?source_id=eq.nav-helt-ledige` → `served_as: ["indicators__nav_helt_ledige"]`,
  non-empty.
- Spot-checked Svalbard (`2100` → `region_kind=svalbard`, `kommune_nr=NULL`,
  `[13,9,11,14,20,19,16,18]`), `Ukjent` (→ `unknown`, NULL, `[13,14,15,15,13,13,15,20]`), and
  Utsira's mixed real/suppressed row (`1151` → `[null,null,null,null,4,null,4,null]`) — all three
  match the live HL060 workbook and the golden-fixture tests exactly.
- **Resolved the `mart_indicators__` discrepancy as a mistake in this plan's own Phase 4 write-up,
  not a defect**: `GET /mart_indicators__nav_aap` — an existing source shipped weeks ago — returns
  the identical 404 from the live API, and its own `atlas_inventory` also lists only
  `indicators__nav_aap`. The `mart_indicators__*` dbt model selects from `indicators__*` and is
  never itself exposed as a separate `api_v1` endpoint under that name; this plan's row-count
  prediction was simply wrong, carried from `mart_atlas_inventory.sql`'s `{relation, mart}` dict
  where `mart` only names the dbt model. Worth remembering for the next source's Phase 4 write-up.

Both bus tasks closed with the verification evidence attached as comments.

---

## Acceptance Criteria

- [x] **The mechanism is verified live, and matches the investigation's description this time** —
  NAV's own `HL060` table, kommune-resolved, confirmed by direct download and inspection.
- [x] **Licence independently confirmed for this specific candidate** — CC BY 4.0, verified
  against this table's own `"Kilde: NAV"` provenance, not assumed by family resemblance to
  `nav-uforetrygd`/`nav-aap` alone.
- [x] `nav-helt-ledige` ingests cleanly from the live HL060 workbook with zero rows silently
  dropped, including the Svalbard pseudo-kommune and the bare `Ukjent` bucket both represented —
  5,744 rows written (359 regions × 8 months × 2 sheets).
- [x] `raw.nav_helt_ledige` stores `region_code` as NAV publishes it, including the literal
  `Ukjent` label with no numeric code — represented, not normalised away.
- [x] `indicators__nav_helt_ledige` and `mart_indicators__nav_helt_ledige` build and test clean
  against real loaded data, with `2100` and `Ukjent` resolving through `classify_region_code`
  exactly as predicted (`PASS=19 WARN=0 ERROR=0`).
- [x] `nav-helt-ledige` appears in `meta_sources.served_as` after a real deploy, independently
  verified via live `curl` — `served_as: ["indicators__nav_helt_ledige"]`.
- [x] Golden-file tests cover: an ordinary kommune row, the Svalbard pseudo-kommune, the `Ukjent`
  block, and a suppressed row with mixed real/suppressed cells in the same row — 26 tests, all
  passing.
- [x] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped.

---

## Implementation Notes

- **Write a fresh parser — this table's classification rule is the simplest of the NAV-Excel
  family so far.** See **[Q2]**. "Exactly 4 leading digits" alone correctly separates kommune rows
  from every header/total row in this table, with no "I alt" prefix check needed — porting either
  `nav-uforetrygd`'s or `nav-aap`'s parser would import a check this table doesn't need.
- **No new Dagster job.** `monthly_sources_refresh` already exists; this is a registration, not
  new infrastructure — the third source on it after `nav-uforetrygd`/`nav-aap`.
- **Two sentinel shapes, both already have precedent — confirm, don't assume.** `2100` Svalbard
  matches `udir-gsi`/`husbanken-bostotte`'s finding; bare `Ukjent` matches `nav-aap`'s. Verify both
  resolve as predicted with a real dbt test during Phase 3, same discipline as every prior source.
- **A different Statistikklov paragraph than AAP155's.** § 7-1 here, § 2-6 there — don't assume
  every NAV table cites the same section; read each table's own methodology sheet.
- **Historical backfill genuinely unresolved, not just deferred by convention** — see **[Q1]**.

---

## Outcome

Shipped end to end, 2026-10-02: ingest (5,744 rows, zero dropped) → dbt staging and api_v1
publication → live cluster deploy → independently re-verified arrival. Atlas's fourth NAV-adjacent
source and third on `monthly_sources_refresh`. Unlike `nav-sykefravaer` (PLAN-013), the
investigation's mechanism held exactly as described this time — NAV's own `HL060` table is
genuinely kommune-resolved — worth confirming explicitly rather than assuming "the description
held" after two sources in a row where it hadn't.

A fourth distinct pivot shape within the NAV-Excel family, but the simplest to classify yet:
neither the bare fylke header row nor the "I alt `<name>`" rollup carries any digit at all, so
"label starts with exactly 4 digits" alone separates kommune rows — a fresh parser, not adapted
from `nav-aap`'s or `nav-uforetrygd`'s (per **[Q2]**). Both sentinel shapes already had precedent
and resolved exactly as predicted on the first `dbt build`, with zero relationship-test failures:
the Svalbard pseudo-kommune `2100` through `classify_region_code`'s existing svalbard branch, and
the literal `Ukjent` through its existing unknown branch — confirmed directly against both the
local build and the live API, not assumed to work.

One genuinely new finding, caught against real data rather than assumed from the investigation:
unlike `nav-aap`, where `Ukjent` exists only in the Antall sheet, here it is present in BOTH
sheets — its Prosent-sheet cells are all NAV's own suppression marker, not omitted. A second,
structural finding (**[Q5]**): the `Ukjent` block's fylke-level header row and its kommune-level
leaf row carry the identical bare label `"Ukjent"` — the header row is correctly dropped by the
ingest's existing hasData guard, with no special-casing added.

Found and fixed before merge, not after: CI's `render-template-info.sh` caught a stale "59 raw
BASE TABLEs" claim in `template-info.yaml` left over from before this PR (migrations now create
60). While fixing it, found and corrected an adjacent false claim in the same paragraph — it said
every number there was "now written by `uis/generate-holdings.py`", but that script has zero
substitutions for the raw-table figure; it was hand-maintained and had already drifted stale
independent of this change.

One deploy-verification mistake, caught and corrected rather than silently reconciled: this plan's
own Phase 4 deploy request predicted a second `mart_indicators__nav_helt_ledige` inventory entry
that doesn't exist. imac flagged the discrepancy instead of quietly resolving it; checking
`mart_indicators__nav_aap` (an existing, long-shipped sibling) confirmed the same 404 there too —
the `mart_indicators__*` view is never itself an exposed `api_v1` endpoint, so the prediction was
wrong in the request template, not a defect in the deploy. Also surfaced, filed separately rather
than left in a closed bus task: ops-dev flagged that `template-info.yaml`'s own
`operational.automation` text may be stale against PR #482's `default_status=RUNNING` behaviour —
unrelated to this source, tracked as a cross-cutting note in `1PRIORITY.md`.

Plugs the short-tail labour-market signal slotting between `nav-uforetrygd` (long-tail disability
outcome) and `nav-aap` (transitional work-assessment benefit) — Report #5 (Income & Welfare) and an
axis for Report #4 (Mental-Health Triangulation).

---

## Files to Modify

- `atlas-data/ingest/src/sources/nav-helt-ledige/manifest.yml` (new)
- `atlas-data/ingest/src/sources/nav-helt-ledige/index.ts` (new)
- `atlas-data/ingest/src/sources/nav-helt-ledige/parse.ts` (new)
- `atlas-data/ingest/src/sources/nav-helt-ledige/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/nav-helt-ledige/README.md` (new)
- `atlas-data/ingest/src/sources/nav-helt-ledige/__tests__/` (new)
- `atlas-data/ingest/package.json` (`ingest:nav-helt-ledige` script — add this BEFORE shipping,
  verify with `npm run ingest:nav-helt-ledige`, not a direct `tsx` call)
- `atlas-data/migrations/<next>_raw_nav_helt_ledige.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (asset registration —
  monthly cadence, existing job)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__nav_helt_ledige.sql` (new),
  `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__nav_helt_ledige.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `nav` listing — bump the count,
  add alongside `nav-uforetrygd`/`nav-aap`)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  shipped)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
