# Plan: Ingest kommune-level Elevundersøkelsen bullying ("mobbing") indicators

Ingests Udir's Elevundersøkelsen (pupil survey) bullying indicator and its three underlying
questions, per kommune per grade (7th and 10th) per school year, as Atlas's second Udir source —
a sharper, annual complement to the existing `fhi-mobbing` 3-year-rolling aggregate.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — Phase 1 complete, ready to move to active/ for Phase 2

**Goal**: Add `udir-elevundersokelsen-mobbing` as a served Atlas source — an annual, per-grade
bullying-prevalence signal at kommune resolution, sharper than `fhi-mobbing`'s 3-year-rolling
7th+10th aggregate. Plugs Report #3 (Youth Outcomes) and strengthens Report #10
(School-Capacity Forecast)'s learning-environment axis.

**Last Updated**: 2026-10-03

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §4 ([Q10]-[Q13]), next in the Tier-1 sequence after `PLAN-014-nav-helt-ledige.md`

**Prerequisites**: None. `udir` is already a valid `publishers.yaml` provider (landed with
`PLAN-010-udir-gsi.md`), `topics.yaml` already has the relevant categories validated, and this
source reuses the exact same `statistikkportalen.udir.no` API client shape `udir-gsi` already
proved out — no new infrastructure, but genuinely new response-shape handling (see Phase 1).

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-03)

Checked live rather than trusting the investigation's description (last touched 2026-05, well
before `udir-gsi` found the real API). **This source's real shape is structurally different from
every prior source this session** — not a NAV-Excel pivot, not an SSB PxWebAPI call, and not even
the same response shape as its own sibling `udir-gsi` despite sharing one client.

### Tasks

- [x] 1.1 Confirm the real API and find the live report. **Confirmed** — same system `udir-gsi`
  already found, `statistikkportalen.udir.no/api/rapportering`. Listed every Rapportside
  (`GET /rest/v1/Rapportside`, 136 report pages total) and found the live bullying report has
  **migrated schemas since the investigation's own framing**: the classic `ElevundersoekelsenG`
  table's own Rapportside (`GSK_EU_mobbing`) is stale — its `filterDefaultVerdier.TidID` is frozen
  at `[201901, 202001, 202101]`. The live, current table is **`EUG`**
  (`GSK_EUG_mobbing`, endpoint `rest/v1/Statistikk/GSK/EUG/5/5`), whose own default year is
  `202512` ("2025-26") — confirmed by fetching both Rapportside definitions directly and comparing,
  not assumed from naming similarity. **Don't reuse the `ElevundersoekelsenG` table name anywhere
  in this source — it is the retired predecessor.**
- [x] 1.2 Confirm available years. **Confirmed** — `filterVerdier` on `TidID` returns five school
  years: `2025-26, 2024-25, 2023-24, 2022-23, 2021-22` (ids `202512, 202412, 202312, 202212,
  202112`). All five are live-queryable today, not an archive-vs-live split like NAV's tables.
- [x] 1.3 **A fundamentally different response shape than `udir-gsi`'s — read this before writing
  a parser.** `udir-gsi`'s `EnhetID` (geography) is the row hierarchy, filtered to kommune depth by
  `radSti`. **For this report, `EnhetID` is a column dimension, not a row.** The row hierarchy is
  `Indikator`/`Spørsmål` (max 2 levels — confirmed by a 400 error when a 3-level `radSti` was
  tried: `"For dyp radsti: for denne rapporten støttes maksimalt 2 nivåer"`). Geography has no
  wildcard-and-filter-by-depth mechanism the way `udir-gsi`'s did:
  - A **wildcarded** `EnhetID` (e.g. `-12.*`, "all of Norway, one level down") returns the **entire
    national column tree in one response** — nested `columns[]` arrays down through
    landet → fylke → kommune → individual school, each carrying a `columnCount` (how many leaf
    columns live under it). Confirmed live: a real response for 2025-26 nests all 17 fylker, then
    every kommune under each, then every individual school under each kommune.
  - A **specific, non-wildcarded** `EnhetID` (e.g. `-720`, Arendal's internal id) collapses the
    response to **exactly one column, labelled "Alle skoler"** — confirmed this is the kommune's
    own aggregate value, not a drill into its schools, by comparing against the all-of-Norway
    response's column structure for the same kommune.
  - **Open engineering question, not resolved here — see [Q1].** The per-kommune-collapse
    technique is verified correct but implies **one HTTP call per kommune** (357+) per
    grade/year combination to build a full kommune-grain dataset; the wildcard-and-decode route
    is a single call per grade/year but requires correctly parsing a large nested column tree
    into (fylke, kommune, school-or-none) tuples aligned to each row's flat `data[]` array —
    not yet attempted, not yet proven correct. Phase 2 must resolve this before writing `parse.ts`.
- [x] 1.4 Confirm the grade ("Trinn") filter semantics. **Confirmed, and this corrects an
  assumption carried from `udir-gsi`.** `udir-gsi`'s `TrinnID(-10)`/`KommunalitetID(-10)` sentinel
  meant "alle" (all grades/ownership types summed). **For this report, `-10` is NOT a valid "alle"
  sentinel at all** — `TrinnID`'s real `filterVerdier` only lists ids `4`–`9` (grades 5–10), no
  "alle" option. Passing `TrinnID(-10)` did not error; it silently returned the **last** value in
  the report's own default list (`[6, 9]` → grade 10) without flagging anything wrong — caught only
  by cross-checking the result against an explicit `TrinnID(9)` call and finding identical values.
  **This is exactly the kind of silent-wrong-default trap this project's "verify, don't assume"
  discipline exists for.** `TrinnID(6,9)` (comma-joined, guessing at multi-value syntax) returns a
  genuine 400 (`"Ugyldige tegn i filter"`) — there is no single call for "both grades at once";
  v1 must issue one call per grade. Matches `fhi-mobbing`'s own established 7th+10th-grade axis,
  so this is also the natural v1 scope, not an arbitrary restriction.
- [x] 1.5 Confirm the suppression marker. **Confirmed** — literal `"*"`, same convention as every
  other Atlas source this session. Verified on Bykle (Agder, Norway's smallest kommune by
  population): its 10th-grade 2025-26 "Mobbing på skolen" indicator and one of its three questions
  are suppressed (`"*"`), while the other two questions report real `"0,0"` values in the **same**
  response — suppression is per-row, not per-kommune, matching `udir-gsi`'s and every NAV
  source's own per-cell suppression.
- [x] 1.6 **A genuinely new sentinel, not seen in `udir-gsi`: Norwegian schools abroad.** The
  national column tree's top level has two siblings, `"Hele landet"` (id `-12`) and `"Utlandet"`
  (id `-13`, kode `"U"`) — confirmed live, Elevundersøkelsen is answered by Norwegian schools
  operating abroad (e.g. "Den norske skole - Costa Blanca"). Under `Utlandet`'s own
  fylke-equivalent node (kode `"25"` — ⚠️ **the retired pre-2024 Finnmark fylke code**, a real
  collision worth flagging even though fylke-level codes are out of scope for this kommune-grain
  source) sits exactly one kommune-equivalent node: `"Utlandet, uspesifisert"`, **kode `2599`** —
  which matches `classify_region_code`'s existing `^\d{2}99$` `unspecified_within_fylke` branch
  exactly, confirmed by inspection, no new macro branch needed. `udir-gsi`'s own README and
  `parse.ts` never mention this sentinel; not assumed to carry over, checked fresh for this source.
- [x] 1.7 Confirm licence. **NLOD**, confirmed directly on Udir's own data portal
  (`udir.no/om-udir/data/`, which this source shares with `udir-gsi` — same portal, same
  organisation, re-fetched and read for this source rather than assumed to transfer): *"lisens for
  offentlig data (NLOD)."*
- [x] 1.8 Check `data.norge.no` for a cleaner distribution. Not separately re-checked this round —
  `udir-gsi`'s own Phase 1 already established `statistikkportalen.udir.no` as the real, current,
  sole surface for every Udir statistics table including Elevundersøkelsen (confirmed by listing
  every table under schema `GSK`, which includes `EUG`/`ElevundersoekelsenG` alongside `GSI`). No
  reason to expect a different conclusion for this specific table; flagged as inherited, not
  independently re-verified, per this session's own discipline about not assuming licence/surface
  findings transfer silently between sibling sources — if this matters, re-check before shipping.

### Validation

✅ Confirmed 2026-10-03. Real API calls made directly against `statistikkportalen.udir.no` for the
Rapportside definition, filter values, and real data (Arendal and Bykle, both grades, latest year)
— not inferred from `udir-gsi`'s shape or the investigation's five-month-old description.

---

## Open Questions

- **[Q1] Bulk-decode vs per-kommune calls — the central engineering decision, unresolved.** One
  call per kommune (×2 grades × however many years) is verified correct but is 350–3,500+ HTTP
  requests against an API whose own Swagger doc states *"ikke ment for ekstern bruk i dag"* (not
  intended for external use today) — a far higher request volume than anything shipped this
  session (every prior source: 1–7 calls total). The wildcard-and-decode route is a single call
  per grade/year but needs the nested `columns[]` tree parsed into (fylke, kommune, school-or-none)
  tuples aligned to each row's flat `data[]` array index — unverified whether a kommune's own
  aggregate value is even present as a distinct leaf column inside that tree, or whether the tree
  only enumerates individual schools (in which case bulk-decode would require summing/weighting
  school-level figures client-side, which `udir-gsi`'s own precedent deliberately avoided doing for
  any derived figure). **Recommendation: attempt the bulk-decode route first in Phase 2, with the
  per-kommune-collapse technique (already verified correct) as the fallback if the tree can't be
  decoded unambiguously — do not default to 3,500 requests without first trying the cheaper path.**
- **[Q2] Historical backfill — how many of the 5 available years to ingest in v1.** Unlike the
  NAV-Excel sources (one current-year file, backfill genuinely unresolved), all 5 years here are
  equally live-queryable today. If [Q1] resolves to bulk-decode, extra years are nearly free
  (one more call each); if it resolves to per-kommune calls, each extra year multiplies the request
  count linearly. **Recommendation: defer this decision until [Q1] is settled** — ingest all 5
  years if bulk-decode works, latest year only if forced onto the per-kommune path.
- **[Q3] Scope — mobbing only, or fold in trivsel/other Elevundersøkelsen indicator families too?**
  Elevundersøkelsen covers many indicator families (`GSK_EUG_mobbing`, `GSK_EUG_indikator` /
  learning-environment, `GSK_EUG_tema`, and more) under one survey, structurally closer to
  Bufdir's multi-indicator monitors than to NAV's one-indicator-per-source tables.
  **Recommendation: `udir-elevundersokelsen-mobbing` v1 ingests only the bullying indicator
  family** (direct complement to `fhi-mobbing`, the gap this plan is named for) — matching
  Bufdir's own precedent of one source folder per indicator family (`bufdir-barnefattigdom`,
  `bufdir-barnevern`), not one mega-source. A future `udir-elevundersokelsen-trivsel` or similar
  would reuse this exact client.
- **[Q4] GSK (grunnskole) only, or also VGO (videregående)?** `ElevundersoekelsenV`/`EUG`-VGO
  exists under schema `VGO` with the identical mechanism. **Recommendation: GSK only for v1**,
  matching `udir-gsi`'s own grunnskole-only scope — VGO as a natural, cheap follow-up reusing this
  client, not folded in here.
- **[Q5] `region_code` handling for `Utlandet`/`2599`.** See Phase 1.6 — this falls through
  `classify_region_code`'s existing `unspecified_within_fylke` branch cleanly by inspection; verify
  with a real dbt test during Phase 3 rather than assuming the inspection is sufficient, same
  discipline as every prior sentinel this session.
- **[Q6] Presentation sensitivity.** Per-kommune, per-school-year bullying share for minors is
  sensitive in the same way `fhi-mobbing` already is — same `presentation_policy: 'sensitive'`
  consideration as every prior NAV-adjacent source. Not resolved here; a Phase 2/3 decision.

---

## Phase 2: Ingest module + raw table (not started)

### Tasks

- [ ] 2.1 **Resolve [Q1] first, before writing `parse.ts`.** Prototype the wildcard-and-decode
  response for one kommune against the already-verified per-kommune-collapse value for that same
  kommune/grade/year — if they agree, build the bulk-decode parser; if the tree can't be decoded
  unambiguously (e.g. no distinct kommune-aggregate leaf, only school leaves), fall back to one
  call per kommune, scoped to the latest year only per [Q2]'s fallback branch.
- [ ] 2.2 Create `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/`: `manifest.yml`
  (`source_id: udir-elevundersokelsen-mobbing`, `provider: udir`, `periodicity: P1Y`,
  `license: NLOD`), `index.ts`, `parse.ts`, `fetch_retry.ts` (copied), `README.md`, `__tests__/`
  with a real captured fixture covering: an ordinary kommune (Arendal), a suppressed row (Bykle),
  the `Utlandet`/`2599` sentinel, both grades (7th and 10th).
- [ ] 2.3 Migration `raw.udir_elevundersokelsen_mobbing(region_code, grade, year, measure, value,
  loaded_at)` or similar — shape depends on [Q1]'s resolution (one row per question/indicator per
  kommune per grade per year).
- [ ] 2.4 Dagster registration — annual cadence, existing weekly-polled job pattern (same as
  `udir-gsi`'s own registration), no new job.
- [ ] 2.5 Add `ingest:udir-elevundersokelsen-mobbing` npm script FIRST, verify via
  `check-every-source-has-an-ingest-script.sh` and the real `npm run` invocation before any other
  Phase 2 work, per this session's standing discipline since `husbanken-bostotte`'s urb-agents#1807.

### Validation

Real run against the live API, zero rows silently dropped, suppression and the `Utlandet`
sentinel both confirmed against real data — same discipline as every prior source.

---

## Phase 3: dbt staging and marts (not started)

### Tasks

- [ ] 3.1 Add `raw.udir_elevundersokelsen_mobbing` to `models/indicators/sources.yml`.
- [ ] 3.2 `indicators__udir_elevundersokelsen_mobbing.sql` — `kommune_nr`/`region_kind` via
  `region_code_to_kommune_nr`/`classify_region_code`. Explicitly confirm `2599` resolves to
  `region_kind='unspecified_within_fylke'` against real loaded data (see [Q5]) — expect this to
  pass clean, but confirm rather than assume.
- [ ] 3.3 Document columns in `schema.yml`; `mart_indicators__udir_elevundersokelsen_mobbing.sql`
  api passthrough + `marts/api/schema.yml` entry.
- [ ] 3.4 `dbt build` against real loaded data.

### Validation

Real local Postgres. Explicitly confirm the `Utlandet`/`2599` resolution with a direct query,
same discipline as every prior sentinel this session.

---

## Phase 4: Deploy and verify arrival (not started)

Same shape as every prior source's Phase 4 this session — name exact relations, both image
digests labelled (copied verbatim from the release's own `uis-artifact.json`, not reconstructed),
`LANDS WITH` derived via `atlas-data/uis/lands-with.sh`, a row-count prediction stated explicitly.
**Only predict `indicators__udir_elevundersokelsen_mobbing` as a served relation — never a second
`mart_indicators__...` entry, see [[mart-prefix-is-never-a-served-endpoint]] (PLAN-014's own
closing finding).** Independently re-verify against the live public API before closing the deploy
task — do not take a deploy report alone as sufficient.

---

## Acceptance Criteria

- [x] **The mechanism is verified live** — Udir's `EUG` table via `statistikkportalen.udir.no`,
  confirmed by direct API calls, not assumed from `udir-gsi`'s shape or the investigation's
  five-month-old description.
- [x] **Licence independently confirmed** — NLOD, re-fetched from Udir's own data portal for this
  source specifically.
- [ ] The bulk-decode-vs-per-kommune-calls question ([Q1]) is resolved with evidence, not assumed.
- [ ] `udir-elevundersokelsen-mobbing` ingests cleanly with zero rows silently dropped, including
  the `Utlandet`/`2599` sentinel and at least one suppressed row both represented.
- [ ] `indicators__udir_elevundersokelsen_mobbing` and its mart build and test clean against real
  loaded data, with `2599` resolving through `classify_region_code` exactly as predicted.
- [ ] `udir-elevundersokelsen-mobbing` appears in `meta_sources.served_as` after a real deploy,
  independently verified via live `curl`.
- [ ] Golden-file tests cover: an ordinary kommune, a suppressed row, the `Utlandet` sentinel,
  both grades.
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped.

---

## Implementation Notes

- **This source's response shape is NOT `udir-gsi`'s shape, despite sharing one client.**
  Geography is a column dimension here, not a row dimension — do not port `udir-gsi`'s
  depth-filtered-`radSti` approach; it does not apply (confirmed live, a 3-level `radSti` errors).
- **`TrinnID(-10)` is NOT "alle" for this report — it silently resolves to the wrong single grade.**
  Always pass an explicit grade id (`6` = 7th, `9` = 10th); never carry the `-10`-means-"alle"
  assumption from `udir-gsi`/`nav-aap` into a new Udir report without checking that report's own
  `filterVerdier` first.
- **[Q1] (bulk-decode vs per-kommune calls) must be resolved before `parse.ts` is written** — this
  is the one genuinely open engineering question this plan did not resolve in Phase 1, by design:
  it needs a real prototype comparison, not another round of reading API responses.
- **One new sentinel confirmed, already has precedent**: `Utlandet`/`2599` → `classify_region_code`'s
  existing `unspecified_within_fylke` branch, no macro change needed — confirm with a real test in
  Phase 3 anyway.

---

## Files to Modify

- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/manifest.yml` (new)
- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/index.ts` (new)
- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/parse.ts` (new)
- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/README.md` (new)
- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/__tests__/` (new)
- `atlas-data/ingest/package.json` (`ingest:udir-elevundersokelsen-mobbing` script — add this
  BEFORE shipping, verify with the real `npm run` invocation)
- `atlas-data/migrations/<next>_raw_udir_elevundersokelsen_mobbing.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py` or a Udir-specific asset module (registration
  — annual cadence, existing weekly-polled job pattern)
- `atlas-data/dbt/models/indicators/sources.yml`,
  `indicators__udir_elevundersokelsen_mobbing.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__udir_elevundersokelsen_mobbing.sql` (new),
  `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `udir` listing — bump the count)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  shipped)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
