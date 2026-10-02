# Plan: Ingest NAV's AAP (arbeidsavklaringspenger) kommune monthly statistics

Ingests NAV's AAP155 table — monthly count and share of the population receiving
arbeidsavklaringspenger (work-assessment allowance, a transitional benefit paid while NAV is
assessing someone's capacity for work), per kommune — as Atlas's second NAV source and second
monthly-cadence source. Unlike `nav-uforetrygd`'s PST302, this table needed no Phase 1 correction:
the investigation's own description of the mechanism (NAV's statistikk pages, Excel) was right:
only the licence was left "unverified, re-check per source" by `nav-uforetrygd`'s own 2026-10-01
correction, and that re-check is done below.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — Phase 2 IN PROGRESS

**Goal**: Add `nav-aap` as a served Atlas source, giving Report #4 (Mental-Health Triangulation)
and Report #5 (Income & Welfare Trajectory) the *transitional* welfare-claim signal that sits
between acute unemployment and `nav-uforetrygd`'s long-tail disability outcome.

**Last Updated**: 2026-10-02

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §Tier 1 #2 ([Q4]–[Q7], [Q32])

**Prerequisites**: None. `nav` is already a valid `publishers.yaml` provider (#486), `topics.yaml`
already has `social` validated (`nav-uforetrygd`), and the `monthly_sources_refresh` Dagster job
already exists (built for `nav-uforetrygd`, no new job needed here).

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-02)

The investigation's description for the NAV family overall ("Excel + CSV", kommune-resolved,
monthly) held up for AAP without needing the kind of correction `nav-uforetrygd`'s PST302 needed.
What changed: NAV publishes AAP under a numbered-table convention of its own (`AAP1xx`-`AAP3xx`,
distinct from uføretrygd's `PST3xx`), and this table's real shape turned out **simpler** than
PST302's, not harder.

### Tasks

- [x] 1.1 Find the live download page and the real download link.
  **Confirmed** — `https://www.nav.no/no/nav-og-samfunn/statistikk/aap-nedsatt-arbeidsevne-og-uforetrygd-statistikk/arbeidsavklaringspenger`
  is the AAP sub-page of the same statistics section `nav-uforetrygd` already uses (the page's own
  title names both: "AAP, nedsatt arbeidsevne og uføretrygd - statistikk"). It lists ~11 numbered
  tables (`AAP120`-`AAP390`), each a different breakdown (age×sex, diagnosis×age, diagnosis
  details, immigrant background, quarterly variants, …). **Only `AAP155` ("Mottakere av
  arbeidsavklaringspenger. Kommune.") is kommune-resolved** — same "exactly one kommune-grain table
  per NAV statistics page" pattern PST302 established. 🔵 **Simpler to discover than PST302**: the
  download link is a real `<a class="aksel-link" href="/_/attachment/inline/<uuid>:<hash>/AAP155%20...xlsx">`
  anchor directly in the server-rendered HTML — no `__NEXT_DATA__` JSON parsing needed (PST302's
  link lived only inside that JSON blob). Confirmed by finding the literal `href="..."` attribute
  in the raw page source, not inferred from a rendering.
- [x] 1.2 **Licence — the investigation's own flag ("CC BY 4.0 confirmed for uføretrygd; unverified
  for AAP/sykefravær — re-check per source") resolved.** Fetched NAV's general statistics-practices
  page directly (`nav.no/no/nav-og-samfunn/kunnskap/data-og-forskning-pa-nav/praksis-rutiner-og-retningslinjer-rundt-offisiell-og-offentlig-statistikk-fra-nav`
  — found via a live web search after an initial guessed URL path 404'd; fetched and read the real
  page content myself rather than trusting the search summary) and confirmed the statement is a
  **blanket claim covering all NAV statistics, not a per-table citation**: *"Statistikk fra Nav på
  nav.no er åpne data og lisens for bruk er Creative Commons Navngivelse 4.0 Internasjonal"*,
  linking `creativecommons.org/licenses/by/4.0/deed.no`. Applies to AAP155 the same as it does to
  PST302 — **CC BY 4.0, independently confirmed for this source**, not inherited by assumption from
  `nav-uforetrygd`'s plan.
- [x] 1.3 Download the live AAP155 workbook (period: January-August 2026) and inspect its real
  structure. **Confirmed — much simpler than PST302.** 3 sheets: `"0. Om tabellene"` (methodology),
  `"1. Kommune. Antall"`, `"2. Kommune. Andel"`. No separate fylke-only sheet (fylke totals are
  interleaved rollup rows within the kommune sheet, not a duplicate sheet), and — checked
  explicitly, since PST302 had it — **zero bydel rows anywhere in this table**. Oslo, Bergen,
  Stavanger and Trondheim all appear as single, ordinary 4-digit kommune rows with real values; AAP
  is not broken down to bydel resolution at all.

  **Row shape** (`1. Kommune. Antall`, same for `.Andel`): a repeating fylke block —
  ```
  B7:  (blank) | Januar | Februar | ... | August   ← month header row, repeats per fylke block
  B8:  "I alt 03 Oslo - Oslove" | 22311 | ...        ← fylke rollup row, "I alt <2-digit> <name>"
  B9:  "0301 Oslo - Oslove" | 22311 | ...            ← the one kommune in this fylke, same values
  [blank]
  B12: "I alt 11 Rogaland" | 14140 | ...
  B13: "1101 Eigersund" | 436 | ...
  B14: "1103 Stavanger" | 3847 | ...                 ← an ordinary kommune row, no bydel children
  ...
  B410: "I alt Ukjent" | 1528 | ...                  ← a 16th "fylke" block with no numeric code
  B411: "Ukjent" | 1528 | ...                        ← its one "kommune" row, same literal label
  ```
  **Confirmed by counting the whole sheet, not sampling**: 357 real 4-digit kommune rows (matching
  Atlas's own current kommune count exactly — the GeoJSON boundary file this repo already serves
  cites the same 357), 16 fylke blocks (15 real fylker + one `Ukjent`/"unknown" bucket), **zero**
  6-digit bydel codes. The `Ukjent` block (1,528-1,558 people per month nationally — a real,
  substantial count, not a rounding artifact) is NAV's own "region not determinable" bucket: its
  row label is the literal string `Ukjent`, with **no numeric code at all** — a different shape
  from every sentinel Atlas has handled so far (SSB's `9999`, Svalbard's `21xx`, Husbanken's
  `0311`-`0326`, all of which are numeric). See **[Q1]**.
- [x] 1.4 Confirm numeric cell typing and the suppression marker. **Confirmed** — values are native
  numeric cells (confirmed via `raw:true` cell access, not Norwegian-decimal-comma strings), same
  as `nav-uforetrygd`. Suppression marker is the same literal `*` NAV used for PST302 — confirmed
  live on `1151 Utsira` (Norway's smallest kommune by population), suppressed across all 8 months
  in both the `Antall` and `Andel` sheets. 🔵 **This table states its exact suppression threshold**,
  more precisely than most sources Atlas has ingested: the `"0. Om tabellene"` sheet's own text
  reads *"I henhold til Statistikklovens § 2-6 har NAV valgt å erstatte verdier i celler hvor
  tallene er mindre enn 4 med spesialtegn «*»"* — any cell representing fewer than 4 people, not a
  vague "small cell" rule.
- [x] 1.5 Check the archive / historical-backfill shape. **Checked, found nothing — different from
  PST302.** `nav.no/.../arkiv-mottakere-av-arbeidsavklaringspenger-aap` returns 200 but contains no
  `AAP155` reference anywhere, not in the static HTML and not in its own `__NEXT_DATA__` blob
  (unlike PST302's archive, which named a clean one-file-per-year pattern). Whether AAP's
  kommune-level table has a discoverable historical archive at all is genuinely unknown, not just
  unchecked further. **[Q2] Historical backfill is deferred**, same decision as PST302 — v1 ingests
  the live current-year file only.
- [x] 1.6 Checked `data.norge.no` for a cleaner distribution — **same conclusion as PST302: none.**
  Queried the real search API directly (`search.api.fellesdatakatalog.digdir.no/search`) for
  `AAP155`: zero relevant hits (the few results returned are unrelated Brønnøysund register
  entries, not NAV statistics). `www.nav.no` is the real, current, only publication surface for
  this table too.
- [x] 1.7 **No NAV-internal kommune grouping found** — resolves the investigation's **[Q6]**
  directly for this source. Every 4-digit code checked (`1101`, `1151`, `5636`, …) is a real,
  current SSB-format kommune code with a real kommune name attached (including Sámi-language
  co-names in the far north, e.g. `5636 Unjárga - Nesseby` — consistent with genuine SSB naming,
  not a NAV-specific scheme). The only non-kommune bucket is `Ukjent` (**[Q1]**), not a NAV-region
  or NAV-kontor catchment grouping.

### Validation

✅ Confirmed 2026-10-02. Real file downloaded and inspected directly (both sheets, full row count,
not a sample), same discipline as `nav-uforetrygd`'s Phase 1.

---

## Open Questions

- **[Q1] How should the `Ukjent` (unknown-region) bucket be classified?** It has no numeric code
  at all — `classify_region_code`'s regex branches all key off digit-count, so `Ukjent` falls
  through to the macro's existing `else 'unknown'` branch with no code change needed, which is
  semantically apt (NAV's own label literally means "unknown"). **Recommendation**: let it fall
  through as-is — don't add a dedicated branch for a single literal string when the existing
  catch-all already means the right thing. Confirm `region_code_to_kommune_nr` correctly returns
  null for it (it will, since `unknown` != `kommune`) before trusting this in Phase 3.
- **[Q2] Historical backfill — deferred, same decision as `nav-uforetrygd`.** AAP155's archive
  mechanism (if one exists) is unconfirmed — see Phase 1.5. v1 ingests the live current-year file
  only; revisit if a real consumer need for AAP history emerges.
- **[Q3] Should `nav-aap` reuse any code from `nav-uforetrygd`, or copy-and-adapt?** The *pattern*
  (discovery tier, a pure parser tested against real fixtures, full-table replace per run) carries
  over directly; the code should not be imported, matching this project's established convention
  (`fetch_retry.ts` is copied, not shared, per source) — and the actual parsing is genuinely
  simpler here (no fylke-sheet duplicate, no bydel nesting, no Oslo/Stavanger row-order
  inconsistency to defend against), so a line-for-line port of `nav-uforetrygd`'s parser would
  carry complexity this table doesn't have. **Recommendation**: write a new, simpler parser from
  scratch against AAP155's real shape, not adapt PST302's.
- **[Q4] `topics.yaml` category** — `social`, matching `nav-uforetrygd` (already validated). Not
  expected to be a real decision, but confirm against the file before writing the manifest, not
  after, per `nav-uforetrygd`'s own Phase 2 note about catching this before a CI failure rather than
  from one.
- **[Q5] Presentation sensitivity.** Per-kommune AAP shares, like uføretrygd, can be politically
  charged in small kommuner — same `presentation_policy: 'sensitive'` consideration the
  investigation's **[Q7]** already flagged for the whole NAV family. Not resolved here; a Phase 2/3
  modelling decision.

---

## Phase 2: Ingest module + raw table (not started)

### Tasks

- [ ] 2.1 Create `atlas-data/ingest/src/sources/nav-aap/`:
  - `discoverWorkbookPath` (or similar) — find the real `<a href>` on the AAP sub-page pointing to
    a filename starting `AAP155` and ending `.xlsx`. Simpler than `nav-uforetrygd`'s equivalent: no
    `__NEXT_DATA__` JSON parsing needed, a direct HTML anchor scrape suffices.
  - `parse.ts` — pure functions reading `"1. Kommune. Antall"`/`"2. Kommune. Andel"`, classifying
    each row by its label's leading digit count (0 digits → `Ukjent`, 2 → fylke rollup, skip, 4 →
    kommune) per **[Q1]**/**[Q3]**'s recommendation — new code, not adapted from `nav-uforetrygd`.
  - `fetch_retry.ts` — copied from an existing source, same convention as every prior source.
  - `manifest.yml` — `source_id: nav-aap`, `provider: nav`, `periodicity: P1M`, `eu_theme: SOCI`,
    `tags.topic: social` (**[Q4]**), `license: CC BY 4.0` (independently confirmed, Phase 1.2 —
    link to `creativecommons.org/licenses/by/4.0/deed.no`).
  - `README.md` and `__tests__/` — golden-file tests against the real captured workbook (full file,
    not trimmed, same precedent as `nav-uforetrygd`'s fixtures) covering: an ordinary kommune row,
    a fylke rollup row (must be skipped, not summed as a region), the `Ukjent` block, and the
    suppressed `1151 Utsira` row.
- [ ] 2.2 Migration `raw.nav_aap(region_code, year, month, category_format, value, loaded_at)` —
  same shape as `nav_uforetrygd`'s table (`category_format` distinguishing `antall`/`andel`
  sheets), PK `(region_code, year, month, category_format)`.
- [ ] 2.3 Dagster registration — add to the existing `monthly_sources_refresh` job
  (`_MONTHLY_SOURCE_IDS` or equivalent in `schedules.py`, `OTHER_SOURCES`/asset group in
  `raw_other.py`). No new job needed — `nav-uforetrygd` already built the one this needs.

### Validation

```bash
cd atlas-data/ingest && npm run ingest:nav-aap   # the REAL npm-run invocation, not a direct tsx call
```
🔴 **Run it this exact way, not `npx tsx src/sources/nav-aap/index.ts` directly.** `husbanken-bostotte`
shipped with a missing `ingest:nav-aap`-shaped script entry because every local check called the
module directly — caught only by imac on a real deploy (urb-agents#1807), fixed, and turned into a
standing CI gate (`check-every-source-has-an-ingest-script.sh`) that will now catch a repeat of
this specific mistake before merge. Still worth invoking the real way here rather than relying
solely on the gate.

Golden-file tests pass; a manual run against the live workbook returns real kommune-grain rows,
zero rows silently dropped (including the fylke-rollup rows being correctly skipped rather than
double-counted), with the suppression marker and the `Ukjent` bucket both handled as **[Q1]**
decided.

---

## Phase 3: dbt staging and marts (not started)

### Tasks

- [ ] 3.1 Add `raw.nav_aap` to `models/indicators/sources.yml` — `ingest_cadence: monthly`,
  freshness bounds matching `cadence.MONTHLY_FRESHNESS` exactly (same as `nav-uforetrygd`'s
  precedent, not separately invented numbers).
- [ ] 3.2 `indicators__nav_aap.sql` — `kommune_nr`/`region_kind` via
  `region_code_to_kommune_nr`/`classify_region_code` from the first commit (not added after a
  relationship-test failure), per **[Q1]**'s recommendation that `Ukjent` falls through to the
  existing `unknown` branch cleanly.
- [ ] 3.3 Document columns in `schema.yml`; validate against a local Postgres loaded with the real
  ingest — confirm the `Ukjent` rows carry a null `kommune_nr` and `region_kind = 'unknown'`, and
  that this is a small, bounded set of rows (one per month), not a parsing defect silently
  misclassifying real kommune rows.
- [ ] 3.4 `mart_indicators__nav_aap.sql` + `marts/api/schema.yml` entry.
- [ ] 3.5 `dbt build --select indicators__nav_aap mart_indicators__nav_aap` against real loaded
  data.

### Validation

Real local Postgres, not an empty schema. Explicitly check the `Ukjent` rows resolve the way
**[Q1]** predicted, rather than assuming the fallback branch behaves as expected without checking.

---

## Phase 4: Deploy and verify arrival (not started)

Same shape as every prior source's Phase 4 this session — name exact relations, both image
digests labelled, `LANDS WITH` derived via `atlas-data/uis/lands-with.sh`, a row-count prediction
stated explicitly (NAV's live file grows a column every month, so state the prediction as "as of
today's validation run", same caveat `nav-uforetrygd`'s Phase 4 raised). Independently re-verify
against the live public API before closing the deploy task — do not take imac's report alone as
sufficient, per this session's standing discipline.

---

## Acceptance Criteria

- [x] **Licence independently confirmed for this specific source** — CC BY 4.0, Phase 1.2, not
  inherited by assumption from `nav-uforetrygd`.
- [ ] `nav-aap` ingests cleanly from the live AAP155 workbook with zero rows silently dropped,
  including the fylke-rollup rows being skipped (not double-counted) and the `Ukjent` block being
  represented (not dropped).
- [ ] `raw.nav_aap` stores `region_code` as NAV publishes it, including the literal `Ukjent` label
  with no numeric code — represented, not normalised away.
- [ ] `indicators__nav_aap` and `mart_indicators__nav_aap` build and test clean against real loaded
  data, with `Ukjent` rows correctly carrying `region_kind = 'unknown'` and a null `kommune_nr`.
- [ ] `nav-aap` appears in `meta_sources.served_as` after a real deploy, independently verified via
  live `curl`.
- [ ] Golden-file tests cover: an ordinary kommune row, a fylke rollup row (must not be summed into
  the output), the `Ukjent` block, and the suppressed `1151 Utsira` row.
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped.

---

## Implementation Notes

- **Do not reuse `nav-uforetrygd`'s parser code — write a new, simpler one.** See **[Q3]**. The
  *pattern* (discovery tier, pure-function parser, golden-file tests against a real uncut workbook,
  full-table replace per run) is the thing to carry over; this table has no fylke-sheet duplicate,
  no bydel nesting, and no Oslo/Stavanger row-order inconsistency to code around, so porting
  PST302's parser would import complexity this table doesn't have.
- **No new Dagster job.** `monthly_sources_refresh` already exists; this is a registration, not new
  infrastructure.
- **The `Ukjent` bucket is new territory — not a numeric-code sentinel like every one Atlas has
  seen before.** Confirm **[Q1]**'s fall-through behaves as predicted with a real dbt test, not an
  assumption, during Phase 3.
- **Historical backfill genuinely unresolved, not just deferred by convention** — see **[Q2]**.
  Worth a few minutes of further checking during Phase 2 if a clean pattern turns up, but not worth
  blocking v1 on.

---

## Files to Modify

- `atlas-data/ingest/src/sources/nav-aap/manifest.yml` (new)
- `atlas-data/ingest/src/sources/nav-aap/index.ts` (new)
- `atlas-data/ingest/src/sources/nav-aap/parse.ts` (new)
- `atlas-data/ingest/src/sources/nav-aap/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/nav-aap/README.md` (new)
- `atlas-data/ingest/src/sources/nav-aap/__tests__/` (new)
- `atlas-data/ingest/package.json` (`ingest:nav-aap` script — add this BEFORE shipping, per Phase
  2's validation note; verify with `npm run ingest:nav-aap`, not a direct `tsx` call)
- `atlas-data/migrations/<next>_raw_nav_aap.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (asset registration — monthly
  cadence, existing job)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__nav_aap.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__nav_aap.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `nav` listing — bump the count,
  add `nav-aap` alongside `nav-uforetrygd`)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  shipped)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
