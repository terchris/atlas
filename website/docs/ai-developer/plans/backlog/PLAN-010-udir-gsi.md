# Plan: Ingest Udir GSI — grunnskole enrolment, teacher density, special-education share

Ingests GSI (Grunnskolens informasjonssystem) — pupil counts, school counts, teacher density and
special-education/Norwegian-reinforcement shares, per kommune, annual — as Atlas's first Udir
source. A real, working statistics API exists and was found and verified live; Udir's own public
documentation page names the wrong hostname for it.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Add `udir-gsi` as a served Atlas source, giving Report #10 (School-Capacity Forecast) the
current-enrolment supply side it's missing, and sharpening Atlas's existing education signal beyond
`fhi-vgs-gjennomforing`'s 3-year completion rate.

**Last Updated**: 2026-10-02

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](INVESTIGATE-new-norwegian-public-sources.md) §4 (Tier 1 #4), §C.2 ([Q39]–[Q41])

**Prerequisites**: None — `udir` is already a valid `publishers.yaml` provider (#486), with a logo
and notes already naming GSI specifically. `education` is a valid `topics.yaml` id.

---

## Phase 1: Research — verify the mechanism, licence and shape live

### Findings

- [x] 1.1 **Udir's own public API documentation page names a hostname that does not work.**
  `udir.no/om-udir/data/api-data-fra-elevundersokelsen/` documents the base URL as
  `https://api.udir-statistikkbanken.no/api/rest/v2/Eksport/{tabellnummer}/data` — this host
  resolves and completes a TLS handshake, but the certificate presented is a generic
  `*.azurewebsites.net` wildcard that does **not** cover `api.udir-statistikkbanken.no`, and every
  path returns Azure's own "Web App - Error 404" landing page, not Udir's API. **Confirmed dead**,
  not a transient blip — checked both with and without certificate verification.
- [x] 1.2 **The real, working host is `api.statistikkbanken.udir.no`** (no hyphen before
  "statistikkbanken" — Udir's own docs have the domain segments in the wrong order). Verified live:
  `GET https://api.statistikkbanken.udir.no/api/rest/v2/Eksport` returns a real JSON list of
  exportable tables (confirmed the investigation's "eight export tables, four primary + four
  secondary" claim for Elevundersøkelsen exactly: `EUG`/`EUV` × Deltakelse/Indikator/Mobbing/Tema).
  Querying `/Eksport/{id}/data` without a filter returns a real structured error naming the actual
  Swagger location:
  ```
  {"kode":400,"feiltype":"Feil i forespørselen","melding":"Filter må oppgis!",
   "tilleggsinfo":"Vennligst se API-dokumentasjonen på https://statistikkportalen.udir.no/api/rapportering/swagger"}
  ```
- [x] 1.3 **Full OpenAPI/Swagger doc fetched and read**:
  `https://statistikkportalen.udir.no/api/rapportering/swagger/v1/swagger.json` (74 KB). Title:
  *"Grensesnitt for USS (Udirs StatistikkSystem)"*. ⚠️ **Its own description**: *"Dette APIet
  tilgjengeliggjør statistikkdata for utdanningsdirektoratet. APIet er ikke ment for ekstern bruk i
  dag, og vil endres uten varsel."* (This API makes statistics data available for Udir. The API is
  **not intended for external use today, and will change without notice.**) Real, documented,
  working — but explicitly not a stability promise. See **[Q1]**.
- [x] 1.4 **This single API covers far more than GSI** — confirmed live by listing every table under
  each schema (`GET /rest/v1/Statistikk` → `BHG` barnehage, `GSK` grunnskole, `OT`, `VGO`
  videregående; `GET /rest/v1/Statistikk/{skjema}` lists that schema's tables):
  - `GSK` (grunnskole) includes **`GSI`** (this plan), `FravaerG` ([Q39] `udir-fravar`),
    `NasjonaleProever` ([Q41]'s Nasjonale prøver), `EUG`/`ElevundersoekelsenG` (Elevundersøkelsen),
    `ResultatFagG` (grunnskolekarakterer), `OvergangerG`, `SkolebidragG`, `OekonomiG`,
    `VidUtdLaerer`.
  - `VGO` (videregående) includes **`SluttaV`** ([Q40] `udir-sluttet-vgs`), `GjennomfoeringV`
    (overlaps `fhi-vgs-gjennomforing` — same overlap question as [Q40] already flagged), `EUV`,
    `ElevV`, `LaerereV`, and 20+ others.

  **This is a real finding that changes the investigation's own sequencing assumption.** The
  original Phase 1 PLAN sequence (§D) assumed `udir-fravar` and `udir-sluttet-vgs` were separate
  acquisition problems from GSI. They are not — same API, same auth (none), same filter mechanism.
  Once this plan's ingest client exists, `PLAN-011` through `PLAN-014` become **parameter changes
  to the same client**, not new research. Recommend re-ranking them as fast follow-ups, not
  independent investigations.
- [x] 1.5 **Real data pulled and inspected.** `GSK/GSI` has 3 report numbers; report 1 ("Elever og
  skoler" — pupils and schools) is at **version 8**, not version 1 (resolved via the `Rapportside`
  endpoint, `GET /rest/v1/Rapportside/GSK_Elev_Skol` — ⚠️ **always resolve the current version
  through this endpoint; do not hardcode a version number**, it will go stale). Its own description,
  fetched via the `Tekst` lookup endpoint: *"Tabellen viser hvor mange elever som finnes i
  grunnskolen per 1. oktober. Det er også tall for antall elever med individuelt tilrettelagt
  opplæring, antall elever med forsterket opplæring i norsk, og antall skoler."* (pupil counts as of
  Oct 1, individually-tailored-instruction counts, Norwegian-reinforcement counts, school counts) —
  matches the investigation's "pupil-teacher ratio, special-ed share" framing closely enough to
  trust, not identical wording.
- [x] 1.6 **`kommune_nr` is directly in the data — no crosswalk needed, unlike `imdi-bosetting`.**
  The `EnhetID` filter is a real 4-level hierarchy (`GET .../filterVerdier?filter=TidID(202510)_EnhetID(*)`):
  `nivaa:1` national → `nivaa:2` fylke (`"kode":"42"` for Agder, SSB's real 2-digit fylke code) →
  `nivaa:3` kommune (`"kode":"4203"` for Arendal — SSB's real 4-digit kommune code, verbatim) →
  `nivaa:4` individual school (`"kode"` = organisasjonsnummer, e.g. `"990334021"` for Arendal
  International School). The kommune-level `kode` field needs no `classify_region_code` macro and
  no `crosswalk_kommune_name` lookup — it already **is** `kommune_nr`.
- [x] 1.7 **Suppression exists** — the Rapportside metadata for GSI report 1 carries `"erPrikket":
  true`. ⚠️ **Mechanism not yet characterized** (what marker appears in a suppressed cell) — found
  as a flag, not yet observed on an actual suppressed value. Confirm during Phase 2.
- [x] 1.8 **Licence: NLOD, confirmed on Udir's own terms page** (`udir.no/om-udir/data`): *"Dataene
  er lagt ut for viderebruk under Norsk lisens for offentlig data (NLOD)"* — explicit, not inferred,
  unlike IMDi.
- [x] 1.9 **No authentication needed for the statistics read endpoints.** The Swagger doc also lists
  `/Altinn/*`, `/Authentication/*`, `/Authorization/*` paths — these are for the *reporting* side
  (schools submitting their own return data via Altinn), not the public statistics read side.
  Confirmed live: every `GET /rest/v1/Statistikk/...` and `/rest/v1/Eksport/...` call above
  succeeded with zero credentials.

### Validation

Live `curl` against `api.statistikkbanken.udir.no` and `statistikkportalen.udir.no/api/rapportering`
returned real, current (2025-26 school year) GSI data for a named real kommune (Arendal, 4203) with
a verbatim-matching kommune code — not asserted from documentation, pulled and read.

---

## Open Questions

- **[Q1] The API disclaims external-use stability. Build against it anyway, or wait for a
  blessing?** Udir's own Swagger doc says the API "is not intended for external use today, and will
  change without notice." It is nonetheless real, documented via Swagger, publicly reachable with no
  auth, and demonstrably used by Udir's own public-facing statistics pages (the same mechanism
  renders `udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/tall-om-elever-og-skoler/`).
  **Recommendation**: build against it, the same way `imdi-bosetting` scraped IMDi's own public HTML
  pages rather than waiting for a blessing — but treat a schema change as an expected failure mode,
  not a surprise, and make the ingest fail loudly (not silently misparse) if `Rapportside`'s
  structure changes. Does **not** need Terje's sign-off to start — same class of decision as every
  prior source's scraping approach this session — but worth naming explicitly since "will change
  without notice" is a stronger disclaimer than anything seen from NAV, Bufdir or IMDi.
- **[Q2] Ingest and publish at kommune level, or go further to school level?** The investigation's
  own framing (§D) calls this "the first sub-kommune resolution; settles `dim_school`," and **[Q10]**
  in the investigation recommends building `dim_school` (PK: organisasjonsnummer) with
  `crosswalk_school_to_kommune`. Having now seen the real data: the `EnhetID` hierarchy makes BOTH
  levels directly queryable (kommune `kode` is already `kommune_nr`; school `kode` is already
  organisasjonsnummer, which is exactly Brreg's own numbering — `dim_brreg_enhet` may already carry
  some of these schools as organisations). **Recommendation: kommune level only for this plan.**
  Reasons: (a) every existing Atlas source is kommune/fylke/bydel grain — this is the first
  genuinely new geographic resolution Atlas would carry, and `dim_school` is real new
  infrastructure (crosswalk, suppression-at-small-N risk is sharper per-school than per-kommune,
  org-number collision/lifecycle handling); (b) the investigation's own **[Q13]** flags per-school
  small-cell suppression as a real privacy concern needing care Atlas hasn't built for yet; (c) kommune
  is what Report #10 actually asks for (the *supply* side maps against FHI's kommune-grain
  *demand* projection). **This deliberately deviates from the investigation's "settles dim_school"
  framing** — named explicitly, not silently dropped, same shape as `imdi-bosetting` deviating from
  [Q42]. `dim_school` stays a real, scoped future extension (its own PLAN, once a second
  school-grain source makes the crosswalk worth building) rather than this plan's job.
- **[Q3] Which GSI report(s) to ingest first?** GSI has 3 report numbers under `GSK/GSI`
  (`1` = "Elever og skoler" confirmed above; `2` and `3` not yet characterized — Phase 1 confirmed
  they exist and resolve, not what they contain). **Recommendation**: start with report 1 alone
  (pupils, schools, special-ed/Norwegian-reinforcement counts — matches the investigation's stated
  scope most directly); characterize 2 and 3 during Phase 2 and decide then whether they're the same
  source or a sibling table, same pattern as `nav-uforetrygd`'s two-sheet split.
- **[Q4] How to represent the suppressed-cell marker once it's observed?** Flagged as existing
  (`erPrikket: true`) but not yet seen on an actual value. Phase 2's first task against real data.
- **[Q5] `SpoersmaalID` (which named measure each row represents) resolves through a separate
  `Tekst` lookup endpoint, not inline.** Each GSI report has multiple `SpoersmaalID` values (report 1's
  default filter is `[1,2,3,5]` — at least 4 distinct measures bundled in one call). Resolving
  `SpoersmaalID` → a human-readable measure name needs a `GET /rest/v1/Tekst/...` call per
  `tekstId_kolonne` reference in the response metadata. Confirm during Phase 2 whether this needs
  one lookup per ingest run (cheap, cacheable) or is stable enough to hardcode after first
  observation (same editorial-judgement shape as `imdi-bosetting`'s `contents_label` `case` block).

---

## Phase 2: Ingest module + raw table (not started)

### Tasks

- [ ] 2.1 Create `atlas-data/ingest/src/sources/udir-gsi/`:
  - `parse.ts` — parse the nested `{metadata: {rowHierarchy, columns}, rows: [...]}` shape into flat
    rows. ⚠️ **This is a genuinely more complex pivot than any prior source** — columns are nested
    two levels deep (trinn × kjønn) per the sample pulled in Phase 1.5; budget real design time for
    this, don't assume it flattens as easily as NAV's two-level fylke→kommune→bydel blocks did.
  - `index.ts` — resolve current report version via `Rapportside`, fetch via
    `.../data?filter=TidID(<year>)_EnhetID(<kommune-level radSti>)&radSti=F`, upsert
    `raw.udir_gsi`.
  - `fetch_retry.ts` — copy, adapted header comment.
  - `manifest.yml` — `source_id: udir-gsi`, `provider: udir`, `periodicity: P1Y`, `eu_theme: EDUC`,
    `tags.topic: education`, `license: NLOD` (confirmed on Udir's own page, not Atlas's default —
    unlike IMDi, cite it directly).
  - `README.md` and `__tests__/` — golden-file tests against a real downloaded response.
- [ ] 2.2 Migration `raw.udir_gsi` — columns TBD once **[Q3]**/**[Q5]** resolve during
  implementation; expect at minimum `kommune_nr`, `year`, `measure` (resolved `SpoersmaalID`
  name), `trinn` (grade level, nullable for "alle trinn" rollups), `kjoenn` (nullable for "alle
  kjønn" rollups), `value`, `loaded_at`.
- [ ] 2.3 Dagster registration — `cadence.weekly_polled()`/`WEEKLY_FRESHNESS` (annual data, same
  polling cadence as `imdi-bosetting`/Bufdir, not a new job).

### Validation

```bash
cd atlas-data/ingest && npm test -- udir-gsi
```
Golden-file tests pass; a manual run against the live API returns real kommune-grain rows for the
current school year, zero rows silently dropped, with a real observed suppression marker if one
exists in the pulled data (don't assume — check).

---

## Phase 3: dbt staging and marts (not started)

### Tasks

- [ ] 3.1 Add `raw.udir_gsi` to `sources.yml`.
- [ ] 3.2 `indicators__udir_gsi.sql` — `kommune_nr` passed through directly (no macro, no
  crosswalk — see Phase 1.6).
- [ ] 3.3 Document columns in `schema.yml`; validate against a local Postgres loaded with the real
  ingest.
- [ ] 3.4 `mart_indicators__udir_gsi.sql` api passthrough + `marts/api/schema.yml` entry.
- [ ] 3.5 `dbt build` + `dbt test`.

### Validation

Same discipline as every prior source: real local Postgres, not an empty schema; check the
`kommune_nr` relationship test isn't passing on an all-matching trivially-small sample.

---

## Phase 4: Deploy and verify arrival (not started)

Same shape as every prior source's Phase 4 this session.

---

## Acceptance Criteria

- [ ] `udir-gsi` ingests cleanly from the current school year with zero rows silently dropped.
- [ ] `raw.udir_gsi` stores `kommune_nr` directly (verified real SSB kommune codes, not a crosswalk
  or a guess).
- [ ] The suppression marker is identified from real data, not assumed.
- [ ] `indicators__udir_gsi` and `mart_indicators__udir_gsi` build and test clean against real
  loaded data.
- [ ] `udir-gsi` appears in `meta_sources.served_as` after a real deploy, independently verified via
  live `curl`.
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped.

---

## Implementation Notes

- **The corrected API base URL is the single most important fact in this plan.** Udir's own public
  documentation page names a dead host (`api.udir-statistikkbanken.no` — note the hyphen). The real
  host is `api.statistikkbanken.udir.no`. Worth reporting to Udir via their feedback URL
  (`udir.no/om-udir/kontakt-oss/`, already in `publishers.yaml`) once this ships, since their own
  documented example doesn't work for anyone who tries it.
- **Swagger doc**: `https://statistikkportalen.udir.no/api/rapportering/swagger/v1/swagger.json` —
  read this before writing `parse.ts`. It documents the `filter`/`radSti` query syntax precisely
  (`FylkeID(*)_KarakterTypeID(1_2)_TidID(201506)` style — parenthetical, underscore-separated,
  `*` for all values).
- **Schema/table discovery is itself live-queryable** — `GET /rest/v1/Statistikk` and
  `GET /rest/v1/Statistikk/{skjema}` return the current table list. Worth checking at the start of
  implementation in case the table set has moved since 2026-10-02.
- **This plan deliberately does not build `dim_school`** — see **[Q2]**. If a future source needs
  per-school resolution, revisit then; don't speculatively build a crosswalk this plan doesn't need.

---

## Files to Modify

- `atlas-data/ingest/src/sources/udir-gsi/manifest.yml` (new)
- `atlas-data/ingest/src/sources/udir-gsi/index.ts` (new)
- `atlas-data/ingest/src/sources/udir-gsi/parse.ts` (new)
- `atlas-data/ingest/src/sources/udir-gsi/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/udir-gsi/README.md` (new)
- `atlas-data/ingest/src/sources/udir-gsi/__tests__/` (new)
- `atlas-data/ingest/package.json` (`ingest:udir-gsi` script)
- `atlas-data/migrations/<next>_raw_udir_gsi.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (asset registration)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__udir_gsi.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__udir_gsi.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `udir` listing)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  shipped; re-rank [Q39]/[Q40] as fast follow-ups per Phase 1.4's finding)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
