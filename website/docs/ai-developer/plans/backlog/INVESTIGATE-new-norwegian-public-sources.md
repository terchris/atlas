# Investigate: New Norwegian public-data sources to ingest

> **IMPLEMENTATION RULES:** Before implementing any plan from this investigation, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog

**Goal**: Pick the next batch of Norwegian public-data sources Atlas should ingest. Atlas's catalogue currently has 38 implemented sources (mostly SSB + FHI, all kommune-resolved). The companion investigation [`INVESTIGATE-reports-and-indicators-from-catalogue.md`](./INVESTIGATE-reports-and-indicators-from-catalogue.md) has scoped 10 reports those 38 sources can support — several of which have *named per-column gaps* (no NAV welfare-claim signal in Report 4, no IMDi integration data in Report 8, no crime axis at all, etc.). This file picks which gap-filling sources to onboard, in what order, with the source-specific quirks already worked out so each one becomes a thin PLAN-*.md afterwards.

**Last Updated**: 2026-05-04 (added §"Cross-check against Samfunnspuls" — confirmed 6 candidates, surfaced 5 brand-new gap-fills incl. ssb-10826 bydel-level population, deferred 2, resolved 1 discontinued series)

---

## Companion documents

Read first:
- [`INVESTIGATE-reports-and-indicators-from-catalogue.md`](./INVESTIGATE-reports-and-indicators-from-catalogue.md) — the 10-report menu the 38 current sources support, and the per-report gap notes that motivate every Tier-1 candidate below.
- [`atlas-data/ingest/src/sources/README.md`](../../../../../atlas-data/ingest/src/sources/README.md) — the implemented-sources catalogue + manifest.yml schema every new source must conform to.
- [`docs/research/data-sources.md`](../../../../../docs/research/data-sources.md) — the broader ~90-source roadmap. URLs were verified there 2026-04-18; spot-checks for this file (2026-05-04) flagged a couple of moves recorded inline below.

Don't duplicate data-sources.md. This file's job is to *select* and *justify*, not to re-list.

---

## Selection criteria

Every candidate below was scored on five axes. Tier assignments fall out of the score, not the topical area:

1. **Report fit** — does it plug a *named column gap* in one of the 10 reports, or does it open a brand-new analytical axis (would warrant an 11th–13th report)?
2. **Geographic resolution** — kommune-level is the Atlas default. Fylke-level is acceptable when the indicator only makes sense aggregated; sub-kommune (bydel) is a bonus, not required.
3. **Access mechanism** — clean API > documented bulk download > Excel-on-a-CMS > pure HTML scrape. Atlas's [scraping infrastructure](../completed/INVESTIGATE-ngo-scraping-infrastructure.md) exists for the bottom two cases but each scraped source carries higher operating cost than each API-fed source.
4. **Licence & attribution** — NLOD or CC BY are the defaults; restrictive or unclear licences disqualify or need explicit approval.
5. **Ingestion complexity vs upstream cadence** — daily-updated sources warrant more engineering than annual ones. We prefer annual / monthly / quarterly cadences that match Atlas's existing ingest rhythm.

Each candidate's row below records all five so the user can disagree per axis (`[Q<N>]` IDs).

---

## Tier 1 — fills a named gap in an existing planned report

These are the highest-leverage adds: each one upgrades a specific report from "incomplete card" to "full card" without any new methodology decisions.

### 1. Bufdir Open Data API — child welfare + child poverty

- **URL (verified live 2026-05-04)**: `https://data.bufdir.no/`
- **Underlying portals**: Barnefattigdom monitor `https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/`; Barnevern monitor `https://www.bufdir.no/statistikk-og-analyse/monitor/barnevern/`
- **Format**: machine-readable JSON; Bufdir's portal calls it an "open data" surface, browse-style UI is a Single-Page-App over the API
- **Auth**: none
- **Licence**: NLOD (verify on first dataset fetch)
- **Geo**: kommune; bydel for Oslo
- **Cadence**: annual; 2024 data live, 2025 Barnefattigdom expected June 2026
- **Provider tag**: `bufdir` (new — extends the [manifest.yml `provider` namespace](../../../../../atlas-data/ingest/src/sources/README.md#manifestyml-schema))
- **EU theme**: `SOCI`

**Plugs into**: Report #2 (Child Welfare / Vulnerability Composite). Today the composite has child low-income (`ssb-08764`), persistent low-income (`ssb-12944`), single-parent share (`ssb-06083`), bullying (`fhi-mobbing`), and overcrowded housing (`fhi-trangbodd`) — but **no barnevern axis at all**. Bufdir's Barnevern monitor is the canonical kommune-level child-welfare measurement and is a named-gap fill. Atlas can additionally cross-validate `ssb-08764` against Bufdir's Barnefattigdom (different methodology, same kommune — useful triangulation).

**Source-specific quirks**:
- **[Q1]** Bufdir's monitors merge several upstream methodologies (KOSTRA, NUDB, EU-SILC); each indicator has its own `data_quality_kind` per [INVESTIGATE-reports-and-indicators §5](./INVESTIGATE-reports-and-indicators-from-catalogue.md#open-questions-for-decision). Worth ingesting one indicator family per source folder (`bufdir-barnefattigdom`, `bufdir-barnevern`) rather than one mega-source, so manifest dimensions stay clean.
- **[Q2]** New `provider` value in `manifest.yml` enum. Trivial schema bump; PLAN must update [`atlas-data/ingest/src/sources/README.md`](../../../../../atlas-data/ingest/src/sources/README.md#manifestyml-schema) in the same commit.
- **[Q3]** Bydel resolution for Oslo. Atlas's [`crosswalk_geo_to_kommune`](./INVESTIGATE-reports-and-indicators-from-catalogue.md#crosswalks-atlas-needs) already handles 6-digit bydel codes for FHI; Bufdir likely uses a different bydel coding scheme — confirm against the Klass register before writing the dbt model.

### 2. NAV statistikk — uføretrygd, sykefravær, AAP per kommune

- **URL (verified live 2026-05-04 — research catalogue's older URL is stale)**: index at `https://www.nav.no/no/nav-og-samfunn/statistikk`; uføretrygd month-by-month at `https://www.nav.no/no/nav-og-samfunn/statistikk/aap-nedsatt-arbeidsevne-og-uforetrygd-statistikk/uforetrygd/uforetrygd-manedsstatistikk`. Bulk open data is published on `https://data.norge.no/` (DCAT-AP catalogue, where NAV registers its datasets).
- **Format**: Excel + CSV; some datasets exposed as JSON via data.norge.no's distribution links
- **Auth**: none for aggregate kommune statistics. (`pam-stilling-feed` for vacancies needs Bearer auth — out of scope for this candidate.)
- **Licence**: NLOD
- **Geo**: kommune (some series fylke-only)
- **Cadence**: monthly for uføretrygd / AAP, quarterly for sykefravær
- **Provider tag**: `nav` (new)
- **EU theme**: `SOCI` (welfare claims) — possibly split with `HEAL` for sickness statistics

**Plugs into**: Report #4 (Mental-Health Triangulation) as a *care-claiming* axis sitting between FHI's KPR (primary-care contacts) and FHI's Ungdata (self-report). Today Report #4 has self-report + care-seeking + mortality but **no welfare-system signal** — uføretrygd / AAP are the canonical Norwegian "long-tail mental-health outcome" registry-side measurements. Also strengthens Report #5 (Income & Welfare Trajectory) with a labour-market dimension Atlas currently lacks.

**Source-specific quirks**:
- **[Q4]** Excel-first publication means each indicator family needs a parser. NAV publishes a known set of monthly Excel sheets in stable URL patterns; cleaner to write one ingest module per indicator family (`nav-uforetrygd`, `nav-aap`, `nav-sykefravaer`) than a generic NAV scraper.
- **[Q5]** Monthly cadence is a first for Atlas's marts, which are mostly annual. `dim_period` (proposed in [INVESTIGATE-reports-and-indicators §dim_period](./INVESTIGATE-reports-and-indicators-from-catalogue.md#conformed-dimensions-atlas-needs)) needs to handle a `P1M` periodicity discriminator. Decide whether the monthly NAV data is downsampled to annual at the mart layer (for join-ability with FHI/SSB) or kept at monthly resolution with downstream join responsibility on the consumer.
- **[Q6]** Some NAV statistics use NAV-internal kommune groupings (NAV-region, NAV-kontor catchment) rather than canonical kommune codes. Verify per indicator and crosswalk if needed.
- **[Q7]** Labour-market sensitivity. Per-kommune uføretrygd shares in small kommuner can be politically charged — flag the indicator with `presentation_policy: 'sensitive'` per the [Report #8 sensitivity guidance](./INVESTIGATE-reports-and-indicators-from-catalogue.md#8-integration-outcomes-gradient).

### 3. Husbanken Boligsosial Monitor — housing assistance + vanskeligstilte

- **URL**: `https://boligsosial-monitor.husbanken.no/region/0/Norge` (browse) + `https://www.husbanken.no/statistikk/` (statistikkbank)
- **Format**: HTML + Excel downloads; underlying data is Power-BI-backed (similar to Helfo's pattern)
- **Auth**: none
- **Licence**: NLOD
- **Geo**: kommune, annual
- **Provider tag**: `husbanken` (new)
- **EU theme**: `SOCI`

**Plugs into**: Reports #2 (Child Welfare) and #5 (Income & Welfare Trajectory). Atlas currently has the *symptom* side of housing distress (`fhi-trangbodd` — overcrowded housing share) but **no policy-response side** (who receives bostøtte, who is in kommunal bolig, who is registered as bostedsløs). Husbanken is the authoritative Norwegian source for the response side and pairs naturally with FHI's symptom data.

**Source-specific quirks**:
- **[Q8]** Power-BI-backed indicators rarely expose a clean JSON endpoint. Two options: scrape the HTML monitor (fragile, breaks on Power-BI template upgrades) or use Husbanken's Excel statistikkbank (stable, but requires per-indicator URL discovery). **Recommendation**: Excel statistikkbank route for v1; keep the HTML monitor as a fallback / verification surface.
- **[Q9]** "Vanskeligstilte" definition has changed across Husbanken's monitor versions. Atlas should pin the methodology version it ingested in the manifest's `description` field and re-verify on each annual refresh.

### 4. Udir — school-level data (Grunnskolens informasjonssystem + Elevundersøkelsen + Nasjonale prøver)

- **URL**: `https://www.udir.no/om-udir/data` (portal; old `data.udir.no` redirects here)
- **Datasets in scope**: GSI (grunnskolens informasjonssystem — enrolment, pupil-teacher ratio, special-ed share); Elevundersøkelsen (pupil survey — trivsel, mobbing); Nasjonale prøver (national tests, 2022→ resumed); Barnehagefakta (BAF — kindergarten coverage)
- **Format**: JSON / CSV per dataset; some Excel
- **Auth**: none for aggregates
- **Licence**: NLOD
- **Geo**: per-school (school org number) — first non-kommune resolution Atlas would ingest. Aggregates to kommune; school-level data optional.
- **Cadence**: annual
- **Provider tag**: `udir` (new)
- **EU theme**: `EDUC`

**Plugs into**: Reports #3 (Youth Outcomes) and #10 (School-Capacity Forecast). Today's bullying signal is `fhi-mobbing`, which is a **3-year-rolling 7th + 10th-grade aggregate**; Udir's Elevundersøkelsen gives *annual, per-school* trivsel/mobbing scores — much sharper. Nasjonale prøver gives the only direct learning-outcome signal Atlas would have. For Report #10, GSI's *current* school-age enrolment is the supply side that the FHI projection (demand) maps against.

**Source-specific quirks**:
- **[Q10]** First school-level (sub-kommune) ingest. New `dim_school` table with school org number as PK, plus `crosswalk_school_to_kommune`. Schools cross kommune lines occasionally (boarding, special-needs); decide whether to use the school's *registered* kommune or its *student-catchment* kommune. **Recommendation**: registered kommune for v1; catchment is a separate methodology decision.
- **[Q11]** Elevundersøkelsen has known suppression on small schools (< 5 respondents per item). Inherits the Atlas-wide suppression policy proposed in [INVESTIGATE-reports-and-indicators §2](./INVESTIGATE-reports-and-indicators-from-catalogue.md#open-questions-for-decision).
- **[Q12]** Per-school resolution may overshoot Atlas's target audience. Decide whether to ingest at school level or aggregate to kommune in the staging layer. **Recommendation**: ingest at school level (raw stays granular, marts aggregate) so future use-cases aren't blocked.
- **[Q13]** Privacy / minor-related data. Per-school small-cell suppression must be respected verbatim — no re-derivation across years to defeat suppression.

### 5. IMDi Bosettingstall — refugee resettlement

- **URL**: `https://www.imdi.no/bosetting/bosettingstall/` (verified — covers 344 kommuner for 2026); `https://arkiv.imdi.no/om-integrering-i-norge/statistikk/` (legacy archive)
- **Format**: HTML + Excel downloads; **no clean open API**
- **Auth**: none (HTML scrape)
- **Licence**: NLOD (per IMDi's terms; verify per-page)
- **Geo**: kommune
- **Cadence**: annual + interim quarterly updates
- **Provider tag**: `imdi` (new)
- **EU theme**: `SOCI`

**Plugs into**: Report #8 (Integration Outcomes Gradient). Today Report #8 has FHI's INNVKAT and LANDBAK demographics on the *who* side, but **no resettlement-flow data on the *when/where* side**. IMDi adds the inflow signal (how many refugees a kommune received per year, integration outcomes 1/3/5 years post-introduksjonsprogram) needed to make Report #8 a real outcomes report rather than a demographic snapshot.

**Source-specific quirks**:
- **[Q14]** Pure HTML/Excel scrape. Goes through [`INVESTIGATE-ngo-scraping-infrastructure`](../completed/INVESTIGATE-ngo-scraping-infrastructure.md) (already shipped) — sitemap discovery + per-page parser + golden-file fixtures. Cost roughly comparable to the Folkehjelp scrape PLAN.
- **[Q15]** Sensitivity. Per-kommune refugee-arrival counts are politically charged in small kommuner; same `presentation_policy: 'sensitive'` flag as the integration-outcomes report.
- **[Q16]** Methodology drift. IMDi's "introduksjonsprogram" definition and 1/3/5-year follow-up cohorts have evolved; pin a methodology version per refresh.

---

## Tier 2 — opens a new analytical axis (warrants a brand-new report)

These don't fill an existing report — they enable an *11th, 12th, 13th* report Atlas's current 10 don't cover. Each unlocks a distinct topic area.

### 6. SSB crime tables (08484, 08487, 09405, 09406) — public safety

- **URL**: reachable via the same SSB PxWebApi v2 endpoints Atlas already uses for every other SSB source (`https://data.ssb.no/api/pxwebapi/v2/tables/{tableId}/data`)
- **Tables**: 08484 (anmeldte lovbrudd per kommune), 08487 (etter type), 09405 (offer per region × kjønn × alder), 09406 (siktede per kommune)
- **Auth / format / licence**: identical to existing SSB ingest sources — zero new infrastructure
- **Provider tag**: `ssb` (existing)
- **EU theme**: `JUST` (new — first JUST-themed source in Atlas)

**Plugs into**: a brand-new **Report #11 — Public-Safety / Crime Profile** that pairs SSB crime aggregates with `fhi-mobbing` (school violence), substance-use indicators (`fhi-alkohol`, `fhi-hasj`), and NEET (`fhi-neet`) into a per-kommune safety/resilience report. Also feeds an additional axis on Report #4 (Mental-Health Triangulation): victimisation rates correlate with self-reported distress.

**Why Tier 2 not Tier 1**: zero ingest cost (Atlas already speaks SSB), but no current report has it slated as a column. Onboarding it adds analytical surface, not gap-fill — meaningful but not as urgent as Tier 1.

**Source-specific quirks**:
- **[Q17]** Crime statistics suppression at small-kommune × type intersections — typical SSB "0 or 1" → ".." pattern. Atlas's existing SSB ingest handles this.
- **[Q18]** "Crime" as a customer-facing label has framing risk. Report-side language should foreground "registered offences" / "victimisation" rather than headline crime ranking.

### 7. Helfo Fastlegestatistikk — primary-care access

- **URL (verified 2026-05-04)**: `https://www.helfo.no/Fastlegeordninga/fastlegestatistikk` — page is a Power BI dashboard. Open-data API directs to Helsedirektoratet's developer portal at `https://utvikler.helsedirektoratet.no` (where the underlying dataset is registered).
- **Format**: Power BI dashboard for browse; underlying data via Helsedirektoratet HAPI's data catalogue
- **Auth**: free registration on developer portal; specifics per API
- **Licence**: NLOD
- **Geo**: kommune, fylke, national; **monthly** cadence (first-of-month snapshots)
- **Provider tag**: `helsedirektoratet` (new — covers HAPI broadly, Fastlege is the first dataset)
- **EU theme**: `HEAL`

**Plugs into**: Report #4 (Mental-Health Triangulation) as a *system-access* axis (does the kommune have GPs at all?), and Report #9 (Care-Services Capacity vs Population) as a complement to KOSTRA omsorg + KPR contacts. Could also seed a new **Report #12 — Primary-Care Access** that combines Fastlege coverage, KPR contact rates, and Helsedirektoratet's NKI quality indicators.

**Source-specific quirks**:
- **[Q19]** Power-BI-only browse + developer-portal API — same pattern as Husbanken. Use the developer-portal API, not the dashboard. **Recommendation**: register for the Helsedirektoratet developer key as part of the PLAN.
- **[Q20]** Monthly cadence — same `dim_period` discussion as NAV ([Q5]). If both NAV and Helfo land in the same period, resolve `dim_period` once.
- **[Q21]** "List uten fast lege" definition — Helfo's terminology includes "lister uten fast lege" vs. "ubesatt liste" (subtle distinction). Pin the source's own definitions in the manifest.

### 8. DSB Kommuneundersøkelsen — municipal preparedness

- **URL**: `https://www.dsb.no/ros-og-beredskap/kommuner/kommuneundersokelsen/`
- **Format**: PDF report + Excel raw data
- **Auth**: none (download)
- **Licence**: NLOD
- **Geo**: kommune
- **Cadence**: annual
- **Provider tag**: `dsb` (new)
- **EU theme**: `GOVE` (governance) or `JUST`

**Plugs into**: a brand-new **Report #13 — Beredskap / Preparedness** correlating kommune ROS-analyse status with NGO supply data (Hjelpekorps, Beredskapsvakt) — the "is this kommune prepared, and is the NGO presence sufficient" report Røde Kors's Hjelpekorps/Beredskap divisions would actually use. Pairs naturally with the existing `redcross-branches` data.

**Source-specific quirks**:
- **[Q22]** Excel-from-PDF report style — typical "table 4.2 in Excel sheet" layout. Each annual edition's column structure can differ; treat each year's Excel as a separate raw upload per [scraping infra §C](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#section-c--cache-and-change-detection).
- **[Q23]** Survey response rate matters — DSB's Kommuneundersøkelsen has uneven kommune participation. Capture `is_response` as a column to distinguish "low score" from "no submission".

### 9. Brreg Frivillighetsregisteret + Lottstift Tilskudd — voluntary-sector supply

- **URLs**: Frivillighetsregisteret API at `https://data.brreg.no/frivillighetsregisteret/` (note: `https://www.brreg.no/produkter-og-tjenester/apne-data/` is the new browse portal — see [Moves & deprecations](../../../../../docs/research/data-sources.md#moves-and-deprecations-what-changed-since-the-prior-pass)); Lottstift Tilskudd at `https://tilskudd.lottstift.no/`
- **Format**: JSON (Brreg) + Excel (Lottstift momskompensasjon lists)
- **Auth**: none
- **Licence**: NLOD
- **Geo**: per-organisation (orgnr); aggregates to kommune via registered address
- **Cadence**: continuous (Brreg) + annual (Lottstift)
- **Provider tag**: `brreg` (existing — already used by `raw.brreg_enheter`) and `lottstift` (new)
- **EU theme**: `SOCI`

**Plugs into**: generalises Report #7 (NGO Footprint vs Need) from "Red Cross-only supply" to "all-Norwegian-NGO supply". Today Report #7 has Red Cross chapters + activities + voluntary-association counts from `ssb-12063`; adding Frivillighetsregisteret gives every registered NGO with an ICNPO category, and Lottstift gives every state grant by org number — together forming the Norwegian NGO sector at organisational + financial resolution.

**Source-specific quirks**:
- **[Q24]** Atlas already has shared `raw.brreg_enheter` (per [PLAN-001-brreg-enheter](../completed/PLAN-001-brreg-enheter.md)) — Frivillighetsregisteret is a sibling endpoint at the same data.brreg.no host. Pattern: extend the existing Brreg ingest module rather than spinning up a new one.
- **[Q25]** Lottstift's momskompensasjon Excel is annual; one parser per yearly file. Fits the [scraping infra `bulk_excel_drop` pattern](../completed/INVESTIGATE-ngo-scraping-infrastructure.md).
- **[Q26]** ICNPO category mapping. Atlas's existing `ref_atlas_service_category` (22 cross-NGO categories from PLAN-002) needs an explicit ICNPO crosswalk. Companion: [`INVESTIGATE-tag-indicators-sdg-icnpo.md`](./INVESTIGATE-tag-indicators-sdg-icnpo.md) is already in the backlog and resolves the vocabulary side. **Sequencing dependency**: this candidate should land *after* the SDG/ICNPO tagging investigation produces a settled crosswalk.

---

## Tier 3 — useful but specialised; defer

These are real candidates but each is either narrower in impact or has a known cleaner-replacement upstream that argues for waiting.

### 10. Skatteetaten åpne data

- **URL**: `https://data.skatteetaten.no/`
- **What**: aggregate inntekt / formue per kommune; a-ordningen aggregates
- **Why Tier 3**: substantially overlapping with `ssb-06944` (median household income), which Atlas already ingests. Skatteetaten updates faster but the marginal analytical value over SSB is small for the existing reports. Worth ingesting later for *trend velocity* (within-year change) but not gap-fill.
- **[Q27]** Decide later whether the within-year cadence justifies a separate ingest path.

### 11. Valgresultat API

- **URL**: `https://www.valg.no/om-valgdirektoratet/om-valgdirektoratet/pressesider/API-med-valgresultater/`
- **What**: Stortings-/kommune-/sameting-/fylkestingsvalg per kommune back to 1999; turnout
- **Why Tier 3**: civic-engagement proxy useful for an NGO-recruitment overlay on Report #7, but not a need-side or supply-side measurement. Add when Atlas grows the audience-side analytics surface.
- **[Q28]** Cadence is event-driven (every valg), not periodic. Atlas's `dim_period` will need an "event-cohort" classifier, similar to FHI's projection year.

### 12. Helsedirektoratet NKI (Nasjonale Kvalitetsindikatorer)

- **URL**: `https://utvikler.helsedirektoratet.no` (same developer-portal as Helfo Fastlege; Helsedir HAPI catalogue)
- **What**: provider-side service-quality indicators
- **Why Tier 3**: complementary to KOSTRA omsorg (`ssb-12292`), but the value-add is incremental rather than gap-filling. Bundle with Helfo Fastlege under a single Helsedirektoratet provider rollout once that ingest path is wired.
- **[Q29]** Confirm that NKI's per-kommune indicators are released as machine-readable; NKI is browsed via dashboards similar to Helfo's pattern.

### 13. SSB Sentralitetsindeks (Klass 128)

- **URL**: same Klass v1 endpoint Atlas already uses for `ssb-klass-kommuner` and `ssb-klass-fylker`
- **What**: 1–6 urban-rural classification per kommune
- **Why Tier 3**: not a report on its own — but a high-leverage *stratification dimension* for every existing indicator (city vs distrikt). One-shot, trivially small. Land it as a sub-task of any Tier-1 PLAN that motivates urban-rural splits, not a standalone PLAN.
- **[Q30]** Decide whether `dim_kommune` carries `sentralitet` as a column, or `dim_kommune_attributes` is a separate table. **Recommendation**: column on `dim_kommune` — sentralitet is a slowly-changing one-value-per-kommune attribute.

### 14. Bibliofil / Biblioteksentralen

- **URL**: `https://openapi.bib.no/`
- **What**: per-library catalogue
- **Why Tier 3**: useful for Leksehjelp / Norsktrening partnerships in the NGO frontend; doesn't move any of the 10 reports. Defer until a partner-side tool needs it.

---

---

## Cross-check against Samfunnspuls (Røde Kors's older system)

Samfunnspuls (`samfunnspuls.rodekors.no`) is Røde Kors's existing kunnskapsbank — a 37-report Power-BI front-end over the same upstream-public-data sources Atlas wants to consume. Each statistikk page exposes an "Om tallene" block that names the upstream provider + table ID exactly. Re-crawled live 2026-05-04 (37 reports across 6 themes, matching the 2026-04-21 baseline in [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md) — no new reports added since the prior pass).

The 37 reports collapse to **24 unique upstream sources**; the reconciliation against Atlas (38 implemented sources) and against the Tier-1/2/3 candidates above resolves into three buckets.

### A. Already in Atlas — no action

The 12 SSB tables Samfunnspuls cites that Atlas already ingests: `ssb-08764`, `ssb-12944`, `ssb-06947`, `ssb-07459`, `ssb-06913`, `ssb-06083`, `ssb-09429`, `ssb-12292`, `ssb-12063`, `ssb-13995`, `ssb-12131`, `ssb-12132`.

Plus: every Folkehelseprofil / Oppvekstprofil indicator Samfunnspuls cites in the "Andre ressurser" external-resources page is already covered by Atlas's 17 FHI Folkehelsestatistikk sources (Atlas has *more* FHI granularity than Samfunnspuls — `fhi-livskvalitet`, `fhi-depresjon`, `fhi-alkohol`, `fhi-hasj`, `fhi-fortrolig-venn`, `fhi-smertestillende`, three `fhi-mediebruk-*`, etc. — Samfunnspuls itself has zero direct Ungdata coverage and points users to ungdata.no instead).

### B. Already in this investigation's candidates — confirmed by Samfunnspuls

The crawl validates 6 of the Tier-1/2 picks above:
- **Bufdir Barnefattigdom + Bufdir Barnevern kommunemonitor** — both linked from the "Andre ressurser" page. Reinforces Tier-1 #1.
- **Udir Elevundersøkelsen** — used for 4 Samfunnspuls reports (mobbing 7./10. trinn, mobbing Vg1, støtte hjemmefra grunnskole + Vg1). Reinforces Tier-1 #4.
- **IMDi Bosettingstall** — Samfunnspuls's "Bosetting av flyktninger" report. Reinforces Tier-1 #5.
- **Brreg Frivillighetsregisteret** — Samfunnspuls's "Organisasjoner som er registrert i Frivillighetsregisteret" report. Reinforces Tier-2 #9.
- **DSB Kommuneundersøkelsen** — linked from "Andre ressurser". Reinforces Tier-2 #8.
- **NAV statistikk** — Samfunnspuls uses NAV `helt ledige` (monthly), which is a *different* indicator family from the uføretrygd / AAP / sykefravær split in Tier-1 #2. **Update**: extend Tier-1 #2 with a fourth family `nav-helt-ledige` (PLAN-006-nav-helt-ledige in the sequencing). See [Q37].

### C. Brand-new candidates surfaced by the crawl — not in Atlas, not yet in this investigation

These extend the existing Tier-1 family entries above, plus one fully-new candidate (rk-internal). Q-IDs are allocated in document order from Q38 onward.

#### C.1 SSB-extension family

- **[Q38] `ssb-13006` — Sosialhjelp, gjennomsnittlig stønadstid**. SSB statistikkbanktabell 13006. Annual at 31.12. Same SSB PxWebApi v2 plumbing Atlas already uses. Adds duration-on-welfare to Atlas's existing single-snapshot welfare picture — pairs naturally with `ssb-13995` (cases) and the existing welfare-policy tables. Trivial PLAN, ~3h. **Tier-1**, gap-fill into Report #5.
  - **2026-05-04 onboarding blocker:** `https://www.ssb.no/statbank/table/13006` is browsable and Samfunnspuls still cites it, but SSB's current PxWebAPI v2/v2-beta table metadata returns 404, v2/v2-beta table search returns zero `13006` hits, and v0 metadata returns 400. # TODO: human-review — confirm whether `ssb-13006` moved, was discontinued, or should be replaced by a selected `ssb-13995` content-code subset before writing ingest code.

#### C.2 Udir-family extensions (extend Tier-1 #4)

- **[Q39] `udir-fravar` — Median fravær, 10. trinn + videregående**. Udir, register data, fall snapshot. Pulled from `https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/fravarstall/` (and the videregående equivalent). Atlas has `fhi-vgs-gjennomforing` (3-year completion) but no annual-absence axis. Strong dropout-prediction signal. Plugs into Report #3 (Youth Outcomes).
- **[Q40] `udir-sluttet-vgs` — VGS dropout share (VIGO)**. Different framing from `fhi-vgs-gjennomforing` (which measures *completion*); this measures *dropout within school year*. Probably worth ingesting as a separate family because the directorate grants targeting dropout cite this number specifically. Plugs into Report #3.
- **[Q41] `udir-grunnskoler` — Schools + pupils baseline**. Already implicitly required by Tier-1 #4's `dim_school` resolution ([Q10]) — Udir's nøkkeltall for grunnskoler is the canonical source for the school-roster baseline. Make it a sub-step of `PLAN-009-udir-gsi.md`, not a separate PLAN.

#### C.3 IMDi-family extensions (extend Tier-1 #5)

- **[Q42] `imdi-innvandringsgrunn-kjonn` — Immigrants by reason for first immigration**. Work / refugee + family-reunified / family / education / unknown, by sex, per kommune. Atlas has `fhi-innvkat` (1st-gen / 2nd-gen / combined) but **no immigration-reason axis**. This is the column Report #8 (Integration Outcomes) would need to distinguish "labour migrant" vs "refugee" outcomes — a key differentiator that integration-research uses universally. Strong gap-fill.
- **[Q43] `imdi-landbakgrunn` — Immigrants by country of origin**. Atlas has `fhi-innvandrere` (immigrant background by LANDBAK code) which is similar but FHI-mediated; IMDi's version is published faster and uses a different bucketing. **[Q44]** Decide whether to ingest both or pick one — the answer probably depends on which release schedule downstream consumers care about more.

#### C.4 NAV-family extension (extend Tier-1 #2)

- **[Q45] `nav-helt-ledige` — Registrerte helt arbeidsledige, monthly**. NAV register data; same scrape/Excel pattern as the other NAV families (per [Q4]). Last-day-of-month snapshot per kommune. Small-cell suppression at ≤4 (consistent with Atlas's other suppression handling). Slots cleanly between `nav-uforetrygd` (long-tail outcome) and `nav-aap` (transitional benefit) as the *short-tail* labour-market signal. Plugs into Report #5 (Income & Welfare) and as an additional axis on Report #4 (Mental-Health Triangulation — because acute unemployment ↔ mental health is well-documented).

#### C.5 Bespoke / cooperative — flag, defer

- **[Q46] `ssb-spesialbestilt-bosted-husholdning` — Population by age × tettbygd/spredtbygd × household-type**. Samfunnspuls notes this is a *bespoke* SSB extract, not a public statistikkbank table; the trangbodd component is covered by Atlas's `fhi-trangbodd`, but the urban-rural × household-type cut is genuinely unique. **Recommendation**: don't pursue the bespoke order; instead identify whether SSB tables 17376 / 12578 (boforhold register-based statistikk) cover the same ground in publicly-queryable form. Defer pending that lookup.
- **[Q47] `rk-internal-medlemmer-frivillige` — Røde Kors annual member + volunteer counts per lokalforening**. Internal data; not a public API. Adjacent to Atlas's existing `redcross-branches` ingest. Atlas's parallel ambition is generalising NGO supply (see [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](./INVESTIGATE-multi-ngo-supply-model-extensions.md) and the Folkehjelp investigation), so a per-NGO members/volunteers register fits the same supply layer. **Recommendation**: track separately under the multi-NGO supply investigation, not this one — it's a supply-side ingestion needing org-level cooperation, not a demand-side public-data dataset.

#### C.6 SSB-companion tables flagged by the prior research (verified live 2026-05-04)

The prior Samfunnspuls research file flagged three table-ID open questions that were never resolved. Verified against the SSB PxWebApi v2 `/metadata` endpoint:

- **[Q48] `ssb-10826` — Alders- og kjønnsfordeling for befolkningen i bydeler (B), 2001–2026**. Verified live: bydel-level companion to `ssb-07459` (which Atlas already ingests at kommune/fylke/national). Covers Oslo (17 bydeler), Stavanger (7 + Finnøy/Rennesøy), Bergen (8 bydeler), Trondheim (4 bydeler) — single-year ages 0–105+, both sexes. **Genuine net-new value**: Atlas currently has zero bydel-resolution population denominator. With FHI sources at bydel level (per `crosswalk_geo_to_kommune` which already handles 6-digit bydel codes) and Bufdir at bydel level for Oslo (per [Q3]), a bydel population denominator unlocks per-capita normalisation for every existing bydel-resolved indicator. **Recommendation**: Tier-1, ingest immediately after `ssb-07459` plumbing is verified to extend cleanly. ~3h PLAN.
- **[Q49] `ssb-04362` — companion to `ssb-07459`** (cited jointly in Samfunnspuls's Om tallene block per the field notes, but never separately catalogued). The prior research's open question was: "Atlas should decide whether to consolidate on 07459 only or treat the trio as one logical 'population' source." **Recommendation**: leave as deferred — verify during the `ssb-10826` PLAN whether `ssb-04362` adds a temporal extension (older years), an alternative grouping, or is fully redundant with `ssb-07459`. If redundant, document as superseded; if not, fold as a sibling table in the same `ssb-07459` source folder rather than a new folder.
- **[Q50] `ssb-13138` — Sosialhjelpstilfeller, utbetalt beløp og stønadstid (K) (avslutta serie) 2015–2021**. **Resolved by metadata fetch 2026-05-04**: this is a *discontinued series* (`avslutta serie`, last year 2021) that SSB split into `ssb-13995` (cases) and `ssb-13006` (duration) when the welfare statistikk was restructured. Both successor tables are covered (`ssb-13995` already in Atlas; `ssb-13006` added as [Q38] above). Samfunnspuls's Power BI dataset name "ssb-13138" is therefore stale tooling-side metadata referring to the predecessor — no action needed beyond resolving the open question that flagged the mismatch. **No PLAN required.**

### D. What this means for sequencing

The Phase 1 PLAN sequence in the section above expands by 4 PLANs (`ssb-sosialhjelp-stønadstid`, `udir-fravar`, `udir-sluttet-vgs`, `nav-helt-ledige`, plus the IMDi extensions folded into the existing IMDi PLAN). Updated phase 1 sequence:

```
Phase 1 — Tier-1 ingests (parallelisable after Phase 0)
  PLAN-002-bufdir-barnefattigdom.md
  PLAN-003-bufdir-barnevern.md
  PLAN-004-nav-uforetrygd.md           ← settles dim_period monthly
  PLAN-005-nav-aap.md
  PLAN-006-nav-sykefravaer.md
  PLAN-007-nav-helt-ledige.md          ← NEW (Samfunnspuls cross-check)
  PLAN-008-husbanken-statistikkbank.md
  PLAN-009-imdi-bosetting.md           ← scrape; fold imdi-innvandringsgrunn + imdi-landbakgrunn into the same source family
  PLAN-010-udir-gsi.md                 ← settles dim_school; folds udir-grunnskoler in
  PLAN-011-udir-elevundersokelsen.md
  PLAN-012-udir-nasjonale-prover.md
  PLAN-013-udir-fravar.md              ← NEW (Samfunnspuls cross-check)
  PLAN-014-udir-sluttet-vgs.md         ← NEW (Samfunnspuls cross-check)
  PLAN-015-ssb-sosialhjelp-stønadstid.md  ← NEW (Samfunnspuls cross-check; smallest SSB add)
  PLAN-016-ssb-bydel-population.md        ← NEW (Samfunnspuls cross-check; ssb-10826 — bydel-level age/sex; unblocks per-capita normalisation for every bydel-resolved indicator)
```

Phase 2 / Phase 3 unchanged from the original sequencing — but renumber subsequent PLANs (the ssb-crime / helfo-fastlege / dsb / brreg-frivillighetsregisteret PLANs become PLAN-017+).

### E. Decisions resolved during the cross-check

9. **[Q37]** Extend Tier-1 #2 (NAV) with a fourth family `nav-helt-ledige`. Resolved 2026-05-04.
10. **[Q41]** `udir-grunnskoler` is a sub-step of the Udir GSI PLAN, not a standalone PLAN. Resolved 2026-05-04.
11. **[Q47]** `rk-internal-medlemmer-frivillige` belongs in [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](./INVESTIGATE-multi-ngo-supply-model-extensions.md), not here. Resolved 2026-05-04.
12. **[Q48]** `ssb-10826` (bydel-level age/sex) is Tier-1 — verified live, ingested as `PLAN-016-ssb-bydel-population.md` after the kommune-level `ssb-07459` plumbing. Resolved 2026-05-04.
13. **[Q50]** `ssb-13138` is a discontinued series (`avslutta serie 2015-2021`) superseded by `ssb-13995` + `ssb-13006`. Atlas already covers both successors; no PLAN needed. Resolved 2026-05-04 via SSB metadata fetch.

### F. Open questions added by the cross-check

26. **[Q38]** `ssb-13006` placement — own folder (`ssb-13006`) or extend an existing welfare-source folder. Recommendation: own folder for consistency with Atlas's "one SSB table = one folder" pattern.
27. **[Q39]** `udir-fravar` ingest mechanism — Skoleporten programmatic endpoint vs HTML scrape (Samfunnspuls uses an R-script auto-update). Investigate during the Udir PLAN.
28. **[Q40]** `udir-sluttet-vgs` vs `fhi-vgs-gjennomforing` — Atlas already has the completion side; document the methodological difference (annual dropout-during-year vs 3-year-cohort completion) so consumers don't double-count.
29. **[Q42]** IMDi-extension scope — fold `imdi-innvandringsgrunn-kjonn` into the same `imdi` source family as `imdi-bosetting`, so one PLAN (`PLAN-009-imdi-bosetting`) covers all three IMDi indicators.
30. **[Q43]** `imdi-landbakgrunn` vs `fhi-innvandrere` — overlap analysis. Recommendation: ingest IMDi only if the methodology gap is meaningful (FHI typically lags IMDi by one cycle).
31. **[Q44]** IMDi small-cell suppression (≤4) — consistent application across all IMDi sources.
32. **[Q45]** `nav-helt-ledige` is the third monthly source after Helfo Fastlege and `nav-uforetrygd`/`nav-aap`. Reinforces the urgency of resolving [Q5] / [Q32] (`dim_period` monthly handling) early.
33. **[Q46]** `ssb-spesialbestilt-bosted-husholdning` — investigate whether SSB 17376 / 12578 (boforhold register-based) cover the bespoke extract's content. Track outcome here, not in a separate INVESTIGATE.
34. **[Q49]** `ssb-04362` companion-table reconciliation — verify during the `ssb-10826` PLAN whether 04362 adds a temporal/grouping extension to `ssb-07459` or is redundant. If non-redundant, fold as a sibling table in the existing `ssb-07459` source folder.

---

## Cross-cutting decisions this batch surfaces

These are decisions worth resolving once across all Tier-1 PLANs, not per-source:

### A. New `provider` enum values

- **[Q31]** Atlas's `manifest.yml` `provider` namespace currently allows `ssb / fhi / redcross / brreg`. Tier 1 alone adds `bufdir`, `nav`, `husbanken`, `udir`, `imdi`. Tier 2 adds `helsedirektoratet`, `dsb`, `lottstift`. Decision: add all eight in a single schema-bump commit at the start of the batch, with an updated [`manifest.yml schema`](../../../../../atlas-data/ingest/src/sources/README.md#manifestyml-schema) section. Trying to extend the enum incrementally per PLAN risks merge churn.

### B. New `eu_theme` values used

The current enum already covers all needed values: `JUST` (crime), `HEAL` (Helfo, NKI), `EDUC` (Udir), `SOCI` (Bufdir, NAV, Husbanken, IMDi, Brreg/Lottstift), `GOVE` (DSB). No schema bump needed.

### C. Sub-cadence support (`P1M`, monthly)

- **[Q32]** NAV (uføretrygd, AAP), Helfo Fastlege are both monthly. Resolve `dim_period` to handle this *before* shipping either source to mart. Two options: (a) downsample to annual at staging (loses currency); (b) keep monthly, expose a `period_grain` column, push the join responsibility downstream. **Recommendation**: (b), and add a default-annual view on top so existing report queries continue to work without migration.

### D. New geographic resolutions

- **[Q33]** Udir at school level (org number) and IMDi at kommune-with-bydel breakouts both push beyond Atlas's current kommune/fylke/bydel scheme. Decide whether `dim_school` and bydel coverage become first-class catalogue dimensions, or whether they live in source-specific marts only. **Recommendation**: first-class — Atlas's value is conformed dimensions; a school dim that lives only in the Udir mart breaks the [introspection-driven catalogue at `/data`](../../../../../atlas-frontend/) story.

### E. Power-BI-backed sources

- **[Q34]** Husbanken, Helfo, Helsedir NKI, Bufdir all front their data with Power BI dashboards. None expose a clean JSON endpoint *from* Power BI — but each has a separate machine-readable distribution (Excel, developer-portal API, or backing dataset). **Convention**: never scrape Power BI iframes. Always trace to the underlying dataset. Document this as a rule in [`atlas-data/ingest/src/sources/README.md`](../../../../../atlas-data/ingest/src/sources/README.md).

### F. Sensitivity tagging propagation

- **[Q35]** NAV per-kommune uføretrygd, IMDi per-kommune refugee inflow, SSB per-kommune crime, Bufdir barnevern — every Tier-1 + several Tier-2 candidates carry per-kommune readings that are politically sensitive in small kommuner. Consistent application of `presentation_policy: 'sensitive'` (per [INVESTIGATE-reports-and-indicators §6](./INVESTIGATE-reports-and-indicators-from-catalogue.md#open-questions-for-decision)) needs to be a checklist item in the per-source PLAN template.

---

## Decisions resolved during planning

1. **[Q1]** Bufdir: ingest as one folder per indicator family (`bufdir-barnefattigdom`, `bufdir-barnevern`), not one mega-source. Resolved 2026-05-04.
2. **[Q4]** NAV: one folder per indicator family (`nav-uforetrygd`, `nav-aap`, `nav-sykefravaer`). Resolved 2026-05-04.
3. **[Q8]** Husbanken: ingest the Excel statistikkbank, not the Power BI monitor HTML. Resolved 2026-05-04.
4. **[Q19]** Helfo: developer-portal API (`utvikler.helsedirektoratet.no`), not the Power BI dashboard. Resolved 2026-05-04.
5. **[Q30]** SSB Sentralitetsindeks lands as a column on `dim_kommune`, not a separate attributes table. Resolved 2026-05-04.
6. **[Q31]** Add all eight new `provider` values in a single schema-bump commit at the head of the batch. Resolved 2026-05-04.
7. **[Q33]** `dim_school` becomes first-class. Resolved 2026-05-04.
8. **[Q34]** Never scrape Power BI iframes. Always trace to the underlying machine-readable distribution. Resolved 2026-05-04.

---

## Open questions

1. **[Q2]** Adding `bufdir` to `manifest.yml` `provider` enum — wait for the PLAN to land it, or pre-bump the schema in a separate prep PLAN? See [Q31].
2. **[Q3]** Bufdir bydel coding scheme — resolve before writing `bufdir-barnefattigdom` dbt model.
3. **[Q5]** / **[Q32]** Monthly cadence in `dim_period` — pick option (a) or (b) before either NAV or Helfo Fastlege ships.
4. **[Q6]** NAV-internal kommune groupings — verify per indicator.
5. **[Q7]** / **[Q15]** / **[Q35]** Standardise the sensitivity-flag application to per-kommune politically charged indicators.
6. **[Q9]** Husbanken methodology version drift — pin per refresh.
7. **[Q10]** Udir `crosswalk_school_to_kommune` — registered or catchment? Recommendation: registered for v1.
8. **[Q11]** Elevundersøkelsen suppression policy inheritance.
9. **[Q12]** Udir resolution — ingest at school level (recommended) vs aggregate to kommune at staging.
10. **[Q13]** Per-school small-cell suppression must be respected verbatim.
11. **[Q14]** IMDi scrape goes through the existing scraping infrastructure — confirm the existing helpers cover the page shape during PLAN drafting.
12. **[Q16]** IMDi methodology drift — pin per refresh.
13. **[Q17]** SSB crime tables suppression — same as existing SSB ingest.
14. **[Q18]** Customer-facing language for crime indicators — settle with stakeholders.
15. **[Q20]** Helfo monthly resolution — see [Q5].
16. **[Q21]** Helfo "list uten fast lege" vs "ubesatt liste" definitions — pin per refresh.
17. **[Q22]** DSB Kommuneundersøkelsen yearly column-structure drift.
18. **[Q23]** DSB response-rate column to distinguish low score from no submission.
19. **[Q24]** Frivillighetsregisteret extends the existing Brreg ingest module rather than a new one.
20. **[Q25]** Lottstift annual Excel parser pattern.
21. **[Q26]** ICNPO crosswalk — block this PLAN behind [`INVESTIGATE-tag-indicators-sdg-icnpo`](./INVESTIGATE-tag-indicators-sdg-icnpo.md).
22. **[Q27]** Skatteetaten — defer.
23. **[Q28]** Valgresultat — defer until civic-engagement surface is in scope.
24. **[Q29]** NKI dashboard-vs-API status — verify before promoting from Tier 3.
25. **[Q36]** Should this batch be sequenced as one investigation → many small PLANs, or as one big PLAN per tier? See sequencing recommendation below.

---

## Sequencing recommendation

Atlas's [PLANS.md `Splitting Investigations into Multiple Plans`](../../PLANS.md#splitting-investigations-into-multiple-plans) section says: group by dependency and risk, group by completeness, keep optional/deferred work separate. Applied here:

**Phase 0 — schema prep (one PLAN, ~2h)**
- `PLAN-001-new-provider-enum-and-period-monthly.md` — bump `manifest.yml` `provider` enum to add the 8 new values; add `period_grain` column to `dim_period`; add `presentation_policy` column to `dim_indicator`. No data ingest in this PLAN — just the catalogue side. Unblocks every Tier-1 + Tier-2 PLAN.

**Phase 1 — Tier-1 ingests (one PLAN per source family, ~6–8h each, parallelisable)**
1. `PLAN-002-bufdir-barnefattigdom.md` (lowest risk: clean API, named gap-fill)
2. `PLAN-003-bufdir-barnevern.md` (immediately after; reuses Bufdir ingest plumbing from PLAN-002)
3. `PLAN-004-nav-uforetrygd.md` (first monthly source; settles `dim_period` monthly handling in practice)
4. `PLAN-005-nav-aap.md` and `PLAN-006-nav-sykefravaer.md` (parallel after PLAN-004)
5. `PLAN-007-husbanken-statistikkbank.md`
6. `PLAN-008-imdi-bosettingstall.md` (uses scraping infra)
7. `PLAN-009-udir-gsi.md` (first sub-kommune resolution; settles `dim_school`)
8. `PLAN-010-udir-elevundersokelsen.md` and `PLAN-011-udir-nasjonale-prover.md` (after PLAN-009 lands `dim_school`)

**Phase 2 — Tier-2 (one PLAN per source family)**
1. `PLAN-012-ssb-crime-tables.md` (smallest, closes off Atlas's missing JUST theme)
2. `PLAN-013-helfo-fastlege.md` (uses Helsedirektoratet developer-portal pattern)
3. `PLAN-014-dsb-kommuneundersokelsen.md`
4. `PLAN-015-brreg-frivillighetsregisteret-lottstift.md` — **blocked by [`INVESTIGATE-tag-indicators-sdg-icnpo.md`](./INVESTIGATE-tag-indicators-sdg-icnpo.md)** for the ICNPO crosswalk, per [Q26]

**Phase 3 — Tier-3 (only if a stakeholder asks)**
- Skatteetaten / Valgresultat / NKI / Sentralitetsindeks / Bibliofil — pull from the deferred list when motivated.

Each PLAN follows the standard Atlas pattern (per-source folder under `atlas-data/ingest/src/sources/<id>/`, manifest.yml, dbt staging, marts join, end with `dbt run && dbt test`, update `INVESTIGATE-reports-and-indicators-from-catalogue.md` per its [maintenance ritual](./INVESTIGATE-reports-and-indicators-from-catalogue.md#maintenance--keep-this-current-as-new-sources-land)).

---

## Next steps

- [ ] User reviews this investigation and tags Q-IDs they want to revisit (`[Q<N>]`).
- [ ] Resolve the open `dim_period` monthly question ([Q5] / [Q32]) — block on this before drafting PLAN-002.
- [ ] Draft `PLAN-001-new-provider-enum-and-period-monthly.md` in `backlog/`.
- [ ] Draft `PLAN-002-bufdir-barnefattigdom.md` in `backlog/` — start here because it's the cleanest gap-fill (verified live API, named-column gap in Report #2, no methodology drama).
- [ ] Optionally: pre-write outreach emails to Bufdir, NAV, IMDi, Helsedirektoratet asking whether richer machine-readable distributions exist than what's surfaced publicly. (Pattern reused from [`INVESTIGATE-folkehjelp-supply` § A.4](./INVESTIGATE-folkehjelp-supply.md#a4-craft-cms-graphql-probe--q2-outreach-worth-pursuing) — non-blocking; we ship around the public surface either way.)

---

## What this investigation does NOT cover

- **The 10 existing reports' methodology** — out of scope; lives in [`INVESTIGATE-reports-and-indicators-from-catalogue.md`](./INVESTIGATE-reports-and-indicators-from-catalogue.md).
- **Sources outside Norway** — international / humanitarian data lives in `docs/research/data-sources-international.md` and is not gap-fill for Atlas's domestic-Norway scope.
- **Per-source ingest implementation** — that's the per-source PLAN-*.md downstream of this investigation.
- **Frontend rendering** — covered by [`INVESTIGATE-customer-frontend-data-display.md`](./INVESTIGATE-customer-frontend-data-display.md) and PLAN-007 phase 4.
- **NGO supply expansion beyond Brreg / Lottstift** — covered by [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](./INVESTIGATE-multi-ngo-supply-model-extensions.md) and the per-NGO investigations under it.

---

## Cross-references

- [`INVESTIGATE-reports-and-indicators-from-catalogue.md`](./INVESTIGATE-reports-and-indicators-from-catalogue.md) — the report menu that motivates every Tier-1 candidate's gap-fill claim.
- [`INVESTIGATE-tag-indicators-sdg-icnpo.md`](./INVESTIGATE-tag-indicators-sdg-icnpo.md) — must resolve before `PLAN-015-brreg-frivillighetsregisteret-lottstift`.
- [`INVESTIGATE-felles-datakatalog-classification.md`](./INVESTIGATE-felles-datakatalog-classification.md) — DCAT-AP-NO classification on the source side; every new source must keep its `eu_theme` consistent with the federated classification.
- [`INVESTIGATE-data-discovery-surface.md`](./INVESTIGATE-data-discovery-surface.md) — the broader discovery / governance surface stack; new sources must be discoverable through the same MCP / API surface.
- [`INVESTIGATE-folkehjelp-supply.md`](./INVESTIGATE-folkehjelp-supply.md) — pattern reference for HTML-scrape sources (IMDi PLAN reuses the same scraping infra).
- [`PLAN-001-brreg-enheter`](../completed/PLAN-001-brreg-enheter.md) — pattern reference for cross-NGO Brreg ingest (PLAN-015 extends this).
- [`atlas-data/ingest/src/sources/README.md`](../../../../../atlas-data/ingest/src/sources/README.md) — manifest.yml schema and the conventions every new source must conform to.
- [`docs/research/data-sources.md`](../../../../../docs/research/data-sources.md) — broader Norwegian + Red-Cross-ecosystem source catalogue (the menu this investigation selects from).
- [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md) — the prior Samfunnspuls cross-reference research (24-source catalogue, 2026-04-21). The cross-check in §"Cross-check against Samfunnspuls" above is the live (2026-05-04) reconciliation against this baseline.
