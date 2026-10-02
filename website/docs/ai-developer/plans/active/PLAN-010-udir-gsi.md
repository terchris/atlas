# Plan: Ingest Udir GSI — grunnskole enrolment, teacher density, special-education share

Ingests GSI (Grunnskolens informasjonssystem) — pupil counts, school counts, teacher density and
special-education/Norwegian-reinforcement shares, per kommune, annual — as Atlas's first Udir
source. A real, working statistics API exists and was found and verified live; Udir's own public
documentation page names the wrong hostname for it.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — Phases 2-3 done (ingest, dbt, api_v1 publication), ready for Phase 4 (deploy)

**Goal**: Add `udir-gsi` as a served Atlas source, giving Report #10 (School-Capacity Forecast) the
current-enrolment supply side it's missing, and sharpening Atlas's existing education signal beyond
`fhi-vgs-gjennomforing`'s 3-year completion rate.

**Last Updated**: 2026-10-02

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §4 (Tier 1 #4), §C.2 ([Q39]–[Q41])

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
- [x] 1.6 **A real SSB-format code is directly in the data — no crosswalk needed, unlike
  `imdi-bosetting`.** The `EnhetID` filter is a real 4-level hierarchy
  (`GET .../filterVerdier?filter=TidID(202510)_EnhetID(*)`): `nivaa:1` national → `nivaa:2` fylke
  (`"kode":"42"` for Agder, SSB's real 2-digit fylke code) → `nivaa:3` the level this plan ingests
  (`"kode":"4203"` for Arendal — SSB's real 4-digit kommune code, verbatim) → `nivaa:4` individual
  school (`"kode"` = organisasjonsnummer, e.g. `"990334021"` for Arendal International School). No
  `crosswalk_kommune_name`-style name lookup is needed. ⚠️ **Correction, Phase 2 — this is not the
  same claim as "no `classify_region_code` macro needed."** It IS needed: `2100` (Svalbard) sits at
  this exact tree depth too, because GSI reports a school there. See **[Q6]**.
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
- **[Q3] RESOLVED during Phase 2.** Report 1 alone, as recommended — not chased further. Reports 2
  and 3 remain uncharacterized; a future Udir plan can pick them up the same way this one was
  researched.
- **[Q4] RESOLVED, measured live 2026-10-02.** The suppressed-cell marker is the literal character
  `*` — confirmed on real small kommuner (Træna, Utsira) where the individually-tailored-
  instruction and Norwegian-reinforcement counts are suppressed while the plain pupil/school counts
  for the same kommune are not. Same convention `nav-uforetrygd` uses.
- **[Q5] RESOLVED — unnecessary once the right query shape was found.** Pinning
  `TrinnID(-10)_KjoennID(-10)_KommunalitetID(-10)` (the "alle"/all sentinel for each breakdown
  dimension) collapses the response's column metadata to exactly 4 entries, and those entries
  already carry human-readable names (`"Antall elever"`, etc.) directly — no separate `Tekst`
  lookup round trip needed. The Phase 1 concern assumed the unfiltered, multi-dimensional response
  shape; the actual ingest never requests that shape.
- **[Q6] NEW, found during Phase 2 — the depth-3 hierarchy level is not synonymous with "kommune."**
  Verified live: `2100` (Svalbard) and `2111` sit at the exact same tree depth as genuine kommuner,
  because GSI reports a school there (Longyearbyen skole) — matching SSB's own `21\d{2}` Svalbard
  pattern this project's `classify_region_code` macro already handles (built for exactly this class
  of bug, urb-agents #700, previously found via SSB sources). **Consequence**: `raw.udir_gsi`'s
  geography column is named `region_code`, not `kommune_nr` — the Phase 1 claim that "no crosswalk
  and no derivation macro needed" was half right (no crosswalk) and half wrong (the macro IS
  needed, just for classification rather than name resolution). `indicators__udir_gsi.sql` resolves
  `kommune_nr` through `region_code_to_kommune_nr`/`classify_region_code`, same as every other
  kommune-grain source. Measured: of 18,816 raw rows, 18,768 are real kommune rows (all resolve),
  48 are Svalbard (correctly NULL `kommune_nr`, `region_kind = 'svalbard'`).

---

## Phase 2: Ingest module + raw table

### Tasks

- [x] 2.1 Created `atlas-data/ingest/src/sources/udir-gsi/`:
  - `parse.ts` — the real response shape turned out simpler than feared once the right query was
    found: pinning `TrinnID(-10)_KjoennID(-10)_KommunalitetID(-10)` (the "alle" sentinel for each
    breakdown dimension) collapses the column metadata to exactly 4 named measures — no nested
    trinn × kjønn pivot to decode. The real complexity turned out to be elsewhere: `inkluderKoder=true`
    is required to get real codes into row data at all, and a row's `id` is an internal path, not a
    usable code (see Phase 1.6/[Q6]).
  - `index.ts` — resolves the current report version via `Rapportside` (no hardcoded
    rapportNr/rapportVersjon), discovers every valid school year via `filterVerdier` (no hardcoded
    range), fetches `.../data?filter=TidID(<year>)_TrinnID(-10)_KjoennID(-10)_KommunalitetID(-10)&radSti=-12.*.*&inkluderKoder=true`
    per year, upserts `raw.udir_gsi`.
  - `fetch_retry.ts` — copy, adapted header comment.
  - `manifest.yml` — `source_id: udir-gsi`, `provider: udir`, `periodicity: P1Y`, `eu_theme: EDUC`,
    `tags.topic: education`, `license: NLOD` (confirmed on Udir's own page, cited directly — unlike
    IMDi's default).
  - `README.md` and `__tests__/` — golden-file tests against 4 real downloaded responses
    (Rapportside, 2 years of data, a trimmed filterVerdier years list).
- [x] 2.2 Migration `raw.udir_gsi` — `region_code` (not `kommune_nr` — see **[Q6]**), `year`,
  `measure`, `value`, `loaded_at`. PK `(region_code, year, measure)`.
- [x] 2.3 Dagster registration — `cadence.weekly_polled()`/`WEEKLY_FRESHNESS`, added to the existing
  `annual_sources_refresh` job (no new job needed).

### Validation

```bash
cd atlas-data/ingest && npm test -- udir-gsi
```
✅ Done, 2026-10-02. 26 tests pass. A live run against the real API discovered all 12 available
school years (2014-15 through 2025-26) and produced 18,816 real rows end to end (NDJSON + local
Postgres), zero rows silently dropped — including the historical kommune-count decline (1,716 rows
in 2014-15 down to 1,432 in 2024-25/2025-26, matching Norway's real kommune mergers over that
period). `npm run typecheck` clean.

---

## Phase 3: dbt staging and marts

### Tasks

- [x] 3.1 Added `raw.udir_gsi` to `sources.yml`.
- [x] 3.2 `indicators__udir_gsi.sql` — `kommune_nr` via `region_code_to_kommune_nr`/
  `classify_region_code`, **not** a bare passthrough (Phase 1.6's original claim was wrong — see
  **[Q6]**). `region_kind` also derived, same as every other kommune-grain source.
- [x] 3.3 Documented columns in `schema.yml`; validated against a local Postgres loaded with the
  real ingest (18,816 rows), not an empty schema.
- [x] 3.4 `mart_indicators__udir_gsi.sql` api passthrough + `marts/api/schema.yml` entry.
- [x] 3.5 `dbt build` + `dbt test` — 16 checks, all green.

### Validation

✅ Done, 2026-10-02, against a local Postgres loaded via the real ingest. **Checked the
`kommune_nr` relationship test was not silently passing on an all-null or trivially-small sample**
— it was not: `select region_kind, count(*), count(kommune_nr) from marts.indicators__udir_gsi
group by region_kind` shows 18,768 `kommune` rows all with a non-null `kommune_nr`, and 48
`svalbard` rows all correctly `NULL` — a real, measured split, not a vacuous pass.

---

## Phase 4: Deploy and verify arrival (not started)

Same shape as every prior source's Phase 4 this session.

---

## Acceptance Criteria

- [x] `udir-gsi` ingests cleanly from all 12 available school years with zero rows silently
  dropped. 18,816 rows.
- [x] `raw.udir_gsi` stores a real SSB-format `region_code` directly (verified, not a crosswalk or
  a guess) — named `region_code`, not `kommune_nr`, because it is not always a real kommune
  (Svalbard). `kommune_nr` is resolved in the indicators model via `classify_region_code`.
- [x] The suppression marker is identified from real data, not assumed. Literal `*`.
- [x] `indicators__udir_gsi` and `mart_indicators__udir_gsi` build and test clean against real
  loaded data.
- [ ] `udir-gsi` appears in `meta_sources.served_as` after a real deploy, independently verified via
  live `curl`. **Pending Phase 4.**
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped, only once
  Phase 4 confirms rows actually arrived.

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
- `atlas-data/migrations/059_raw_udir_gsi.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (asset registration)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__udir_gsi.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__udir_gsi.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `udir` listing)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  shipped; re-rank [Q39]/[Q40] as fast follow-ups per Phase 1.4's finding)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
