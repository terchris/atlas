# Investigate: New Norwegian public-data sources to ingest

> **IMPLEMENTATION RULES:** Before implementing any plan from this investigation, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog

**Goal**: Pick the next batch of Norwegian public-data sources Atlas should ingest. Atlas's catalogue currently has 38 implemented sources (mostly SSB + FHI, all kommune-resolved). The companion investigation [`INVESTIGATE-reports-and-indicators-from-catalogue.md`](./INVESTIGATE-reports-and-indicators-from-catalogue.md) has scoped 10 reports those 38 sources can support — several of which have *named per-column gaps* (no NAV welfare-claim signal in Report 4, no IMDi integration data in Report 8, no crime axis at all, etc.). This file picks which gap-filling sources to onboard, in what order, with the source-specific quirks already worked out so each one becomes a thin PLAN-*.md afterwards.

**Last Updated**: 2026-05-04 (added §"Cross-check against Samfunnspuls" — confirmed 6 candidates, surfaced 5 brand-new gap-fills incl. ssb-10826 bydel-level population, deferred 2, resolved 1 discontinued series)

🔴 **2026-10-01 — a THIRD independent consumer (a Lovable-built UI, recreating samfunnspuls.rodekors.no) re-asked almost every question this investigation already answered in May, five months ago.** Checked what actually got built since then: **3 candidates shipped** — `bufdir-barnefattigdom` and `ssb-10826` (Tier 1), plus `ssb-crime-tables` (Tier 2, #6) which this header previously missed entirely. None of NAV (4 families), IMDi, Udir (5 families), Husbanken or `bufdir-barnevern` were started. ⚠️ **This is not a case of the work being lost — it is filed, correctly, in exactly the detail this file already has.** It simply was never executed. A fully-specified plan rotting unexecuted is a different failure from a report never being filed at all, and arguably a more wasteful one: the investigation cost already happened.

🔴 **2026-10-01 — `PLAN-001-new-provider-enum-and-period-monthly.md` was never a real blocker; its three premises don't match the code.** Checked each directly rather than trusting this file's own description:
- **No `provider` enum exists to bump.** `manifest.schema.json`'s `provider` field is a free-form `^[a-z0-9][a-z0-9-]*[a-z0-9]$` pattern, cross-referenced against `publishers.yaml` — not a closed enum. Adding a new provider is one `publishers.yaml` entry, done per-source as needed (NAV/IMDi/Udir/Husbanken entries landed 2026-10-01, see `PLAN-phase0-new-publisher-metadata`, merged in #486). No schema-bump commit required, and none is blocking anything.
- **No `dim_period` table exists** (`find atlas-data/dbt/models -iname '*dim_period*'` → nothing). Every existing indicator model just carries a plain `year` column (e.g. `indicators__ssb_06944.sql`). "Add a `period_grain` column to `dim_period`" assumes a dimension that was never built — it's not a prerequisite, it's a per-source modelling decision the *first* monthly source's own PLAN makes (add a `period_grain`/`month` column on that one model, same way `year` already works), exactly as [Q32]'s own recommendation (b) already said, just without a dimension table to extend first.
- **No `dim_indicator` table exists either**, and no `presentation_policy`/sensitivity convention exists anywhere in the schema or models today. Same shape of correction: sensitivity flagging is a column/convention the first sensitive source's PLAN introduces, not a prerequisite schema bump.

**So there is no Phase 0 to execute.** The provider half is already done (publisher metadata, #486). The `dim_period`/`presentation_policy` half isn't a blocker at all — it's a decision each of `PLAN-004-nav-uforetrygd` (first monthly) and whichever PLAN first carries a politically-sensitive per-kommune figure makes locally. **`PLAN-001-new-provider-enum-and-period-monthly.md` should not be drafted.** `PLAN-003-bufdir-barnevern.md` (reused `bufdir-barnefattigdom`'s ingest plumbing) has since shipped end to end (2026-10-01) — next up, since publisher metadata for NAV/IMDi/Udir/Husbanken already landed, is any of `PLAN-004` (nav-uforetrygd), `PLAN-008` (husbanken) or `PLAN-009` (imdi-bosetting).

---

## Companion documents

Read first:
- [`INVESTIGATE-reports-and-indicators-from-catalogue.md`](./INVESTIGATE-reports-and-indicators-from-catalogue.md) — the 10-report menu the 38 current sources support, and the per-report gap notes that motivate every Tier-1 candidate below.
- [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/README.md) — the implemented-sources catalogue + manifest.yml schema every new source must conform to.
- [`docs/research/data-sources.md`](https://github.com/terchris/atlas/tree/main/docs/research/data-sources.md) — the broader ~90-source roadmap. URLs were verified there 2026-04-18; spot-checks for this file (2026-05-04) flagged a couple of moves recorded inline below.

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
- **Provider tag**: `bufdir` (new — extends the [manifest.yml `provider` namespace](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/README.md#manifestyml-schema))
- **EU theme**: `SOCI`

**Plugs into**: Report #2 (Child Welfare / Vulnerability Composite). Today the composite has child low-income (`ssb-08764`), persistent low-income (`ssb-12944`), single-parent share (`ssb-06083`), bullying (`fhi-mobbing`), and overcrowded housing (`fhi-trangbodd`) — but **no barnevern axis at all**. Bufdir's Barnevern monitor is the canonical kommune-level child-welfare measurement and is a named-gap fill. Atlas can additionally cross-validate `ssb-08764` against Bufdir's Barnefattigdom (different methodology, same kommune — useful triangulation).

**Source-specific quirks**:
- **[Q1]** Bufdir's monitors merge several upstream methodologies (KOSTRA, NUDB, EU-SILC); each indicator has its own `data_quality_kind` per [INVESTIGATE-reports-and-indicators §5](./INVESTIGATE-reports-and-indicators-from-catalogue.md#open-questions-for-decision). Worth ingesting one indicator family per source folder (`bufdir-barnefattigdom`, `bufdir-barnevern`) rather than one mega-source, so manifest dimensions stay clean.
- **[Q2]** New `provider` value in `manifest.yml` enum. Trivial schema bump; PLAN must update [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/README.md#manifestyml-schema) in the same commit.
- **[Q3]** Bydel resolution for Oslo. Atlas's [`crosswalk_geo_to_kommune`](./INVESTIGATE-reports-and-indicators-from-catalogue.md#crosswalks-atlas-needs) already handles 6-digit bydel codes for FHI; Bufdir likely uses a different bydel coding scheme — confirm against the Klass register before writing the dbt model.

### 2. NAV statistikk — uføretrygd, sykefravær, AAP per kommune

✅ **`nav-aap` (PLAN-012) shipped end to end, 2026-10-02 — see the "Next steps" checklist below for the full
Phase 1 summary.** The CC BY 4.0 correction below was scoped to uføretrygd only ("unverified for
AAP/sykefravær — re-check per source"); independently re-confirmed for AAP specifically rather than
assumed, and the file shape turned out simpler than PST302's, not harder.

✅ **"nav-sykefravaer" shipped end to end, 2026-10-02, as `ssb-12451` (PLAN-013) — wrong on the
mechanism, not just a detail.** NAV's own sykefravær/sykepenger statistics pages publish no
kommune-level table at all (checked live — every downloadable table is fylke-level or coarser).
The real kommune-resolved data is at **SSB table 12451**, reached via this project's existing
`lib/pxweb.ts` — the same mechanism every `ssb-*` source uses, not a NAV-family Excel parser.
Licence is therefore **NLOD** (SSB's own), not CC BY 4.0. See the "Next steps" checklist below for
the full summary.

🔴 **Corrected 2026-10-01, for uføretrygd specifically — three claims below were wrong, found while
drafting `PLAN-004-nav-uforetrygd.md`:**
- **Licence is CC BY 4.0, not NLOD.** Verified directly against NAV's own statement:
  `nav.no/.../praksis-rutiner-og-retningslinjer-rundt-offisiell-og-offentlig-statistikk-fra-nav` —
  *"Statistikk fra Nav på nav.no er åpne data og lisens for bruk er Creative Commons Navngivelse
  4.0 Internasjonal"*, linking `creativecommons.org/licenses/by/4.0/deed.no`. NAV does not use NLOD.
- **The downloadable file is not a flat table.** PST302 (the kommune-level uføretrygd table) is a
  pivoted Excel export: a `Kommune-bydel. Antall` / `Kommune-bydel. Andel` sheet pair, each a
  repeating fylke-header → fylke-total → kommune-rows structure, with Oslo/Bergen/Stavanger/
  Trondheim additionally nested one level deeper into bydel rows under their own kommune-total row.
  See `PLAN-004-nav-uforetrygd.md` Phase 1 for the full verified shape.
- **"Bulk open data is published on data.norge.no" is also wrong, for this table.** Queried the
  real backing search API directly (not a web search, which only sees the client-rendered app
  shell): `PST302` returns zero hits anywhere in the catalogue; NAV's one registered dataset that
  does match "uføretrygd statistikk" is a *different* product (aggregate kroner paid out across
  every NAV benefit combined, not uføretrygd-recipient counts), explicitly flagged
  `isOpenData: false`, with no distribution and three years stale. `www.nav.no` is the actual,
  current, only publication surface. See `PLAN-004-nav-uforetrygd.md` Phase 1.6 for the full
  verification.

- **URL (verified live 2026-05-04 — research catalogue's older URL is stale)**: index at `https://www.nav.no/no/nav-og-samfunn/statistikk`; uføretrygd month-by-month at `https://www.nav.no/no/nav-og-samfunn/statistikk/aap-nedsatt-arbeidsevne-og-uforetrygd-statistikk/uforetrygd/uforetrygd-manedsstatistikk`. ~~Bulk open data is published on `https://data.norge.no/` (DCAT-AP catalogue, where NAV registers its datasets).~~ **Wrong for uføretrygd — see the 2026-10-01 correction above.**
- **Format**: Excel + CSV; some datasets exposed as JSON via data.norge.no's distribution links
- **Auth**: none for aggregate kommune statistics. (`pam-stilling-feed` for vacancies needs Bearer auth — out of scope for this candidate.)
- **Licence**: ~~NLOD~~ **CC BY 4.0** for uføretrygd and AAP (corrected above; independently
  re-confirmed for AAP, 2026-10-02, PLAN-012 Phase 1.2). **For sykefravær specifically, NLOD** —
  the real kommune-level source is SSB table 12451, not a NAV page, so NAV's CC BY 4.0 correction
  does not transfer; see PLAN-013 Phase 1.5.
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

✅ **`husbanken-bostotte` (PLAN-011) shipped end to end, 2026-10-02 — Phase 1 live-verified this
entire section and found the "Power-BI-backed" claim was wrong.** See
[`PLAN-011-husbanken-statistikkbank.md`](../completed/PLAN-011-husbanken-statistikkbank.md) for the full
research. Headline correction: `statistikk.husbanken.no` is **Qlik Sense**, not Power BI, with a
real anonymously-reachable backend (`qlik.husbanken.no`) this agent drove live — a full
`OpenDoc`/hypercube/`GetLayout` exchange over the Qlik Engine API (WebSocket, officially documented
by Qlik — Qlik also publishes an official open-source client, `enigma.js`, though the shipped
ingest ended up not needing it; see PLAN-011 Phase 2) returned real per-kommune bostøtte figures.
The Boligsosial Monitor (this section's original URL) turned out to be a **separate**
mechanism with no discoverable backend and no bostedsløshet/kommunal-bolig fields in the Qlik app
either — deliberately not chased further, same shape as `imdi-bosetting`'s IMDikator decision.
**Licence resolved, 2026-10-02** — Terje: *"Husbanken is owned by the norwegian goverment and they
follow NLOD."* A direct statement of the licence (not merely an authorization to proceed despite
one being unknown, unlike IMDi's); still not independently verified on a Husbanken-published terms
page, since none was found.

- **URL**: `https://boligsosial-monitor.husbanken.no/region/0/Norge` (browse, now confirmed a
  separate mechanism — see above) + `https://www.husbanken.no/statistikk/` →
  `https://statistikk.husbanken.no/` (the real statistikkbank, confirmed live 2026-10-02 to be a
  Qlik Sense app, backend at `qlik.husbanken.no`)
- **Format**: JSON over a WebSocket (Qlik Engine API) — confirmed live, not Excel/HTML as this
  entry originally guessed; see `PLAN-011`
- **Auth**: none (confirmed live — anonymous Qlik session, `mustAuthenticate:false`)
- **Licence**: NLOD — stated directly by Terje, 2026-10-02 (*"Husbanken is owned by the norwegian
  goverment and they follow NLOD"*), not independently verified on a Husbanken-published terms
  page (none was found live, see `PLAN-011` **[Q1]**) — this entry's original "NLOD" guess turned
  out to be the right answer, just not for a reason this agent could confirm on its own
- **Geo**: kommune (real SSB `KommuneNr`, confirmed live, no crosswalk needed); the real underlying
  grain is **daily**, not annual as this entry originally guessed — Atlas can still choose to
  publish annually, see `PLAN-011` **[Q4]**
- **Provider tag**: `husbanken` (already landed, #486)
- **EU theme**: `SOCI`

**Plugs into**: Reports #2 (Child Welfare) and #5 (Income & Welfare Trajectory). Atlas currently has the *symptom* side of housing distress (`fhi-trangbodd` — overcrowded housing share) but **no policy-response side** (who receives bostøtte, who is in kommunal bolig, who is registered as bostedsløs). Husbanken is the authoritative Norwegian source for the response side and pairs naturally with FHI's symptom data. ⚠️ Confirmed live: the Qlik app's own data model covers bostøtte (housing allowance) and startlån (start loan) richly — it does NOT cover kommunal bolig or bostedsløshet; those remain unanswered, tracked under `PLAN-011` **[Q5]**.

**Source-specific quirks**:
- **[Q8]** RESOLVED, 2026-10-02 — wrong on both options posed. Not a Power-BI monitor scrape, not an Excel statistikkbank download: the real mechanism is the Qlik Sense Engine API (WebSocket), confirmed live and proven end-to-end by pulling real data. See `PLAN-011-husbanken-statistikkbank.md`.
- **[Q9]** "Vanskeligstilte" definition has changed across Husbanken's monitor versions. Atlas should pin the methodology version it ingested in the manifest's `description` field and re-verify on each annual refresh. Not yet re-checked against the Qlik app's own field definitions — do so during `PLAN-011` Phase 2.

### 4. Udir — school-level data (Grunnskolens informasjonssystem + Elevundersøkelsen + Nasjonale prøver)

✅ **`udir-gsi` shipped end to end, 2026-10-02 — Phase 1 live-verified this entire section and
found a real working API this section didn't know existed.** See
[`PLAN-010-udir-gsi.md`](../completed/PLAN-010-udir-gsi.md) for the full research. Headline
corrections: Udir's own public docs name a **dead** API hostname
(`api.udir-statistikkbanken.no` — TLS cert mismatch, Azure 404 page); the real, working host is
`api.statistikkbanken.udir.no` (`statistikkportalen.udir.no/api/rapportering` for the
Swagger-documented endpoints). That one API covers GSI, Elevundersøkelsen, Nasjonale prøver,
`udir-fravar` ([Q39]) and `udir-sluttet-vgs` ([Q40]) — not five separate acquisition problems, one
client with different table-name parameters. `kommune_nr` needs no crosswalk, but IS resolved
through a derivation macro (`classify_region_code`), not passed straight through — Svalbard sits
at the same API hierarchy depth as genuine kommuner, caught during implementation.

✅ **`udir-elevundersokelsen-mobbing` (PLAN-015) shipped end to end, 2026-10-03** — ingested
(2,804 rows, zero dropped), published to `api_v1`, deployed to the live cluster by imac
([urb-agents#1822](https://github.com/terchris/urb-agents/issues/1822)), independently
re-verified against the public API. Phase 1 found the Elevundersøkelsen response shape is
genuinely different from `udir-gsi`'s despite sharing one client: geography is a column dimension
here, not a row dimension, so `udir-gsi`'s depth-filtered-`radSti` technique doesn't apply. Also
found and corrected an assumption that would have carried over silently: `udir-gsi`'s `-10` =
"alle" sentinel does NOT hold for this report's `TrinnID` filter. **[Q1]** resolved in favour of
correctness over call count (~702 per-kommune calls, not a bulk decode) — the real cost turned
out to be wall time, not request volume: per-call latency settles at ~3.5-6s each, not predicted
in Phase 1, for ~60 minutes in dev and 23.5 minutes in production. Two genuinely new findings on
the real run: a region/grade pair can be entirely absent, not suppressed (Hægebostad's missing
10th-grade cohort); and a new sentinel, "Utlandet, uspesifisert" (`2599`), falls through
`classify_region_code`'s existing `unspecified_within_fylke` branch cleanly.

✅ **`udir-nasjonale-prover` (PLAN-016) shipped end to end, 2026-10-03** — ingest (8,589 rows,
zero dropped), dbt staging + api_v1 publication, deployed to the live cluster by imac
([urb-agents#1824](https://github.com/terchris/urb-agents/issues/1824)), independently
re-verified against the public API. Phase 1 found this report's shape matches `udir-gsi`'s, not
`udir-elevundersokelsen-mobbing`'s: `EnhetID` is the row hierarchy here (confirmed via the
response's own `rowHierarchy` metadata, not assumed from either sibling), so the cheap `radSti`
depth-filter technique applies — 18 calls total, 29.9s in dev, 52.72s in production, no slow-run
warning needed unlike its sibling. A real correction, caught mid-implementation not in Phase 1:
the 5th-grade report's own `Rapportside.gyldigeFiltre` omits `TrinnID`, read as "no TrinnID
filter exists" — wrong; `filterVerdier` still carries one real `TrinnID` entry and the data
endpoint accepts it explicitly with an identical result, so `parse.ts` discovers grade uniformly
from `filterVerdier` for both report versions, no special-casing. Genuinely asymmetric
grade×subject matrix (English only at 8th grade, not 9th — confirmed live via a real empty
response, same "absent, not suppressed" shape PLAN-015 found). One genuinely new finding neither
sibling Udir source needed: `Utlandet` (schools abroad) sits under its own top-level node, a
sibling of "Hele landet" rather than a descendant, so a second `radSti` anchor (`-13.*.*`) is
required to reach it — and it carries real, non-suppressed data, so v1 includes it rather than
dropping it. Both Udir sentinels (Svalbard's `2100`, `Utlandet, uspesifisert`'s `2599`) resolved
exactly as predicted via `classify_region_code`'s existing branches, no macro changes needed.

- **URL**: `https://www.udir.no/om-udir/data` (portal; old `data.udir.no` redirects here)
- **Datasets in scope**: GSI (grunnskolens informasjonssystem — enrolment, pupil-teacher ratio, special-ed share); Elevundersøkelsen (pupil survey — trivsel, mobbing); Nasjonale prøver (national tests, 2022→ resumed); Barnehagefakta (BAF — kindergarten coverage)
- **Format**: JSON (confirmed live, 2026-10-02 — not CSV/Excel as this entry originally guessed; see `PLAN-010`)
- **Auth**: none for aggregates (confirmed live)
- **Licence**: NLOD (confirmed live, 2026-10-02, on Udir's own terms page — explicit, not inferred)
- **Geo**: kommune AND per-school (school org number) both directly queryable — see **[Q10]**'s update below for why `PLAN-010` deliberately ingests kommune-only for v1.
- **Cadence**: annual
- **Provider tag**: `udir` (already landed, #486)
- **EU theme**: `EDUC`

**Plugs into**: Reports #3 (Youth Outcomes) and #10 (School-Capacity Forecast). Today's bullying signal is `fhi-mobbing`, which is a **3-year-rolling 7th + 10th-grade aggregate**; Udir's Elevundersøkelsen gives *annual, per-school* trivsel/mobbing scores — much sharper. Nasjonale prøver gives the only direct learning-outcome signal Atlas would have. For Report #10, GSI's *current* school-age enrolment is the supply side that the FHI projection (demand) maps against.

**Source-specific quirks**:
- **[Q10]** First school-level (sub-kommune) ingest. New `dim_school` table with school org number as PK, plus `crosswalk_school_to_kommune`. Schools cross kommune lines occasionally (boarding, special-needs); decide whether to use the school's *registered* kommune or its *student-catchment* kommune. **Recommendation**: registered kommune for v1; catchment is a separate methodology decision. ⚠️ **`PLAN-010` (2026-10-02) deliberately does NOT build this for GSI** — kommune-level only for v1, named as a deviation from this row's own framing, not silently dropped. `dim_school` stays real future work once a second school-grain source makes the crosswalk worth building.
- **[Q11]** Elevundersøkelsen has known suppression on small schools (< 5 respondents per item). Inherits the Atlas-wide suppression policy proposed in [INVESTIGATE-reports-and-indicators §2](./INVESTIGATE-reports-and-indicators-from-catalogue.md#open-questions-for-decision).
- **[Q12]** Per-school resolution may overshoot Atlas's target audience. Decide whether to ingest at school level or aggregate to kommune in the staging layer. **Recommendation**: ingest at school level (raw stays granular, marts aggregate) so future use-cases aren't blocked. Superseded for GSI by `PLAN-010`'s **[Q2]** — kommune-only, see above.
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
- **[Q15]** Sensitivity. Per-kommune refugee-arrival counts are politically charged in small kommuner. ⚠️ **`presentation_policy` is not a real field — corrected 2026-10-01, same finding as the Phase 0 correction above.** No sensitivity-flagging column or convention exists anywhere in the schema today. This isn't a blocker: IMDi's own small-cell suppression (the published `:` marker, not an Atlas derivation) already carries the privacy protection the data needs — Atlas represents what IMDi published, including the suppression. A presentation-layer sensitivity flag, if ever wanted, is a decision the PLAN introducing it makes locally, not a prerequisite.
- **[Q16]** Methodology drift. IMDi's "introduksjonsprogram" definition and 1/3/5-year follow-up cohorts have evolved; pin a methodology version per refresh.

---

## Tier 2 — opens a new analytical axis (warrants a brand-new report)

These don't fill an existing report — they enable an *11th, 12th, 13th* report Atlas's current 10 don't cover. Each unlocks a distinct topic area.

### 6. SSB crime tables (08484, 08487, 09405, 09406) — public safety — ✅ shipped as `ssb-crime-tables`, all four tables in one bundle (confirmed 2026-10-01)

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

⚠️ **Phase 1 checked live 2026-10-03 and found this section's own mechanism wrong — see
[`PLAN-018-helfo-fastlegestatistikk.md`](./PLAN-018-helfo-fastlegestatistikk.md) for the full
research. Does NOT proceed to Phase 2 without a human decision.** The dashboard genuinely is
Power BI (not a Qlik app wearing a Power-BI-shaped URL, unlike Husbanken's own correction), but
**"HAPI" is NOT this dataset's backend** — checked directly on
`helsedirektoratet.no/om-oss/apne-data-api`: HAPI is a content-syndication API for
helsedirektoratet.no's own editorial website content (guidelines, antibiotic-use model,
outage notices), unrelated to Fastlegestatistikk. The embed's own token is minted server-side,
per page load, by an internal undocumented endpoint with roughly a 2-minute validity window —
not a documented, anonymously-reachable backend the way Qlik's Engine API was. No raw-file
fallback exists on Helfo's own site (`?tidligere-versjoner` returns "no older versions"), and
SSB's PxWebApi (checked live, 20 "fastlege" matches) publishes GP demographics and consultation
patterns, not this list-coverage/vacancy statistic. **Recommendation**: outreach to
Helsedirektoratet (`HelsedirektoratetAPI@helsedir.no`) before any further Atlas-side work, or
move to Tier 3 — not something to resolve unilaterally.

- **URL (verified 2026-05-04)**: `https://www.helfo.no/Fastlegeordninga/fastlegestatistikk` — page is a Power BI dashboard. Open-data API directs to Helsedirektoratet's developer portal at `https://utvikler.helsedirektoratet.no` (where the underlying dataset is registered). ⚠️ **The parenthetical is wrong — see the correction above; no dataset for this candidate is registered there.**
- **Format**: Power BI dashboard for browse; underlying data via Helsedirektoratet HAPI's data catalogue ⚠️ **Wrong, see above — HAPI serves unrelated website content.**
- **Auth**: free registration on developer portal; specifics per API
- **Licence**: NLOD
- **Geo**: kommune, fylke, national; **monthly** cadence (first-of-month snapshots)
- **Provider tag**: `helsedirektoratet` (new — covers HAPI broadly, Fastlege is the first dataset)
- **EU theme**: `HEAL`

**Plugs into**: Report #4 (Mental-Health Triangulation) as a *system-access* axis (does the kommune have GPs at all?), and Report #9 (Care-Services Capacity vs Population) as a complement to KOSTRA omsorg + KPR contacts. Could also seed a new **Report #12 — Primary-Care Access** that combines Fastlege coverage, KPR contact rates, and Helsedirektoratet's NKI quality indicators.

**Source-specific quirks**:
- **[Q19]** Power-BI-only browse + developer-portal API — ⚠️ **NOT the same pattern as Husbanken, checked live 2026-10-03 — see the correction above. Resolved: no developer-portal path exists for this specific dataset.**
- **[Q20]** Monthly cadence — same `dim_period` discussion as NAV ([Q5]). If both NAV and Helfo land in the same period, resolve `dim_period` once. Moot until [Q19]'s access question resolves.
- **[Q21]** "List uten fast lege" definition — Helfo's terminology includes "lister uten fast lege" vs. "ubesatt liste" (subtle distinction). Pin the source's own definitions in the manifest.

### 8. DSB Kommuneundersøkelsen — municipal preparedness

⚠️ **Phase 1 checked live 2026-10-04 and found this agent cannot reach `dsb.no` at all — see
[`PLAN-019-dsb-kommuneundersokelsen.md`](./PLAN-019-dsb-kommuneundersokelsen.md) for the full
research. Does NOT proceed to Phase 2 without a human fetch.** `dsb.no` sits behind a Cloudflare
managed JS challenge — confirmed with two independent tools (`curl` with two different
User-Agent strings, and `WebFetch`), both blocked (challenge page / bare 403). No alternate
download host or indexed direct-file URL found. Unlike Helfo (§7), this is NOT a "the claimed
mechanism doesn't exist" finding — the Excel/PDF download this section describes may well be
exactly real; this agent simply cannot reach it with the tools it has.

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

✅ **The Frivillighetsregisteret/ICNPO half is already shipped — checked live 2026-10-04, not
previously marked here.** `raw.brreg_frivillige` (migration 054) and the `brreg-frivillige`
Dagster asset already exist, already daily-polled, and are already joined into `dim_brreg_enhet`
("Frivillighetsregisteret enrichment", an older pre-renumbering PLAN-003 — this document's own
numbering warning at the top of "Sequencing recommendation" applies here too). [Q26]'s
sequencing dependency on the SDG/ICNPO investigation turned out not to matter: Brreg's own API
supplies ICNPO codes directly, confirmed live, and they are already in production.

✅ **The Lottstift half shipped as `lottstift-momskompensasjon` — see
[`PLAN-020-lottstift-momskompensasjon.md`](../active/PLAN-020-lottstift-momskompensasjon.md).** Not the
Power-BI/GraphQL app at `tilskudd.lottstift.no` the investigation's URL pointed at (no public API
found there) — the real mechanism is `lottstift.no/nb/om-oss/apne-data/`'s own direct static
XLSX downloads, one per year. Six years (2019-2024) have a usable recipient organisasjonsnummer;
2016-2018 don't (name-only recipients under an umbrella applicant) and are deliberately deferred.
Geography and ICNPO category come from joining the recipient's orgnr against the already-shipped
`dim_brreg_enhet`, not from each year's own inconsistent text columns.

- **URLs**: Frivillighetsregisteret API at `https://data.brreg.no/frivillighetsregisteret/` (note: `https://www.brreg.no/produkter-og-tjenester/apne-data/` is the new browse portal — see [Moves & deprecations](https://github.com/terchris/atlas/tree/main/docs/research/data-sources.md#moves-and-deprecations-what-changed-since-the-prior-pass)); Lottstift Tilskudd at `https://tilskudd.lottstift.no/` ⚠️ **Wrong surface for the data — see the correction above; the real files are at `lottstift.no/nb/om-oss/apne-data/`.**
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
- 🟢 **[Q26] update, 2026-09-11 — the upstream supplies ICNPO itself.** Verified against the live
  dedicated API: `GET /frivillighetsregisteret/api/frivillige-organisasjoner` returns
  `icnpoKategorier` per organisation — e.g. `{"icnpoNummer": "9100", "kategori":
  "ICNPOKategori.internasjonaleOrganisasjoner"}` — alongside `grasrotandel`, `innfoertDato` and
  `vedtekter`. So Atlas does not need to *derive* ICNPO codes, only map the register's own onto
  `ref_atlas_service_category`. **The sequencing dependency below should be re-judged rather than
  inherited**; it may shrink to a mapping table.
  Design deep-dive, including the change-feed architecture and the 2026 API verification:
  [INVESTIGATE-all-brreg-organisations](INVESTIGATE-all-brreg-organisations.md).
  ⚠️ That file also carries a *wider* question this candidate does not: whether Atlas should hold the
  **full Enhetsregisteret (~1.17M)** rather than the voluntary subset (**72,806**). This candidate is
  the subset.
- **[Q26]** ICNPO category mapping. Atlas's existing `ref_atlas_service_category` (22 cross-NGO categories from PLAN-002) needs an explicit ICNPO crosswalk. Companion: [`INVESTIGATE-tag-indicators-sdg-icnpo.md`](./INVESTIGATE-tag-indicators-sdg-icnpo.md) is already in the backlog and resolves the vocabulary side. **Sequencing dependency**: this candidate should land *after* the SDG/ICNPO tagging investigation produces a settled crosswalk.

---

## Tier 3 — useful but specialised; defer

These are real candidates but each is either narrower in impact or has a known cleaner-replacement upstream that argues for waiting.

### 10. Skatteetaten åpne data

⚠️ **Checked live 2026-10-04 — this row's own "What" is wrong, and the real barrier is stronger
than "Tier 3, low marginal value."** `https://data.skatteetaten.no/` itself returns an empty
`200` response (zero-length body) — not a real open-data portal. The real surface
(`skatteetaten.no/deling/...`, "Bruke data fra Skatteetaten") is a **restricted, authorized
data-sharing scheme for named institutional partners** (banks, municipalities doing
means-testing) — queried per PERSON or per ORGANISATION number under a signed "Bruksvilkår for
utlevering av opplysninger" (terms for DISCLOSURE of information) agreement, not a public
aggregate statistics API. This is not "Atlas could ingest this but SSB already covers it better"
— **Atlas could never ingest this at all**, regardless of value: it is person-level data shared
under formal authorization to named partners, categorically outside what an anonymous public
project can or should access. The "aggregate inntekt/formue per kommune" dataset this row
described was not found and may not exist in this form.
- **URL**: `https://data.skatteetaten.no/` ⚠️ **empty/non-functional, see correction above**
- **What**: aggregate inntekt / formue per kommune; a-ordningen aggregates ⚠️ **not confirmed to exist publicly — see correction above**
- **Why Tier 3**: substantially overlapping with `ssb-06944` (median household income), which Atlas already ingests. Skatteetaten updates faster but the marginal analytical value over SSB is small for the existing reports. Worth ingesting later for *trend velocity* (within-year change) but not gap-fill.
- **[Q27]** ~~Decide later whether the within-year cadence justifies a separate ingest path.~~ Moot — no public aggregate path was found to decide about.

### 11. Valgresultat API

- **URL**: `https://www.valg.no/om-valgdirektoratet/om-valgdirektoratet/pressesider/API-med-valgresultater/`
- **What**: Stortings-/kommune-/sameting-/fylkestingsvalg per kommune back to 1999; turnout
- **Why Tier 3**: civic-engagement proxy useful for an NGO-recruitment overlay on Report #7, but not a need-side or supply-side measurement. Add when Atlas grows the audience-side analytics surface.
- **[Q28]** Cadence is event-driven (every valg), not periodic. Atlas's `dim_period` will need an "event-cohort" classifier, similar to FHI's projection year.

### 12. Helsedirektoratet NKI (Nasjonale Kvalitetsindikatorer)

⚠️ **[Q29] resolved live 2026-10-04 — same blocked mechanism as Helfo Fastlege (§7,
`PLAN-018-helfo-fastlegestatistikk.md`), confirmed directly rather than assumed from the shared
developer-portal note.** Fetched a real per-kommune NKI indicator page directly
(`.../allmennlegetjenesten/andel-fastleger-med-spesialitet`, confirmed per-kommune indicators do
exist — e.g. a dedicated "...per kommune" article for hospital-readmission rates) and found the
identical pattern: a genuine Power BI embed (`reportEmbed`) with a token minted server-side per
page load via the same kind of internal `updatePowerBiToken` endpoint, expiring in minutes — not
a stable, documented backend. The page's own "Åpne data (API)" link points at the same bare
`utvikler.helsedirektoratet.no` HAPI portal already confirmed (§7) to serve unrelated
website-content, not this dataset. **The "export tool" is not a separate mechanism either** — fetched its page directly and found
it ALSO embeds its own Power BI report with the same `updatePowerBiToken` pattern; "export to
Excel/CSV" is Power BI's own native viewer button, not a distinct stable API. No part of NKI's
real data surface is reachable outside the blocked Power BI mechanism.
- **URL**: `https://utvikler.helsedirektoratet.no` (same developer-portal as Helfo Fastlege; Helsedir HAPI catalogue)
- **What**: provider-side service-quality indicators
- **Why Tier 3**: complementary to KOSTRA omsorg (`ssb-12292`), but the value-add is incremental rather than gap-filling. Bundle with Helfo Fastlege under a single Helsedirektoratet provider rollout once that ingest path is wired.
- **[Q29]** ~~Confirm that NKI's per-kommune indicators are released as machine-readable; NKI is browsed via dashboards similar to Helfo's pattern.~~ **Resolved: no.** Both the browse dashboards and the dedicated export tool are the same Power-BI-embed mechanism, blocked for the identical reason as Helfo. Not viable without outreach to Helsedirektoratet, same as §7.

### 13. SSB Sentralitetsindeks (Klass 128)

⚠️ **Partially checked live 2026-10-04 — the real mechanism found, and [Q30]'s own "slowly-changing"
assumption corrected, but deliberately NOT implemented tonight.** Every other candidate this
session got a dedicated PLAN; this one explicitly doesn't, per this row's own standing advice —
and that advice holds up on reflection even with every Tier-1 candidate now shipped: `dim_kommune`
is the single most depended-upon table in the schema, and enriching it is a different, higher-
blast-radius kind of change than adding one more `indicators__<source>` relation. Not something
to do as a side effect of an unattended run; a real future implementer should re-read this note
and decide deliberately.

**The real mechanism, confirmed live**: `classifications/128/codesAt.json` returns only the 6
class DEFINITIONS (`01`-`06`), not a per-kommune mapping — the actual kommune→class assignment is
a **correspondence table** between classification 131 (Kommuner) and 128 (Sentralitet), fetched
via `GET /classifications/131/corresponds.json?targetClassificationId=128&from=<date>&to=<date>`
(confirmed live: 492 real mappings for 471 distinct historical kommune codes over 2020-2026).
⚠️ The point-in-time `correspondsAt.json` equivalent returned an empty result for this exact pair
for reasons not established — use the date-range `corresponds.json` endpoint, not `correspondsAt`.

⚠️ **[Q30]'s own premise is wrong — checked live, not assumed.** Sentralitet is NOT a
"slowly-changing one-value-per-kommune attribute" safe for a flat column: a real kommune (e.g.
`1124`) genuinely changes class at a reclassification boundary within the current correspondence
window (confirmed live: class `03`→`02` at the 2024 boundary, each with its own real
`validFrom`/`validTo`). A column on `dim_kommune` would need to be explicitly "current
classification only," named as a simplification, not "the" value — version boundaries exist at
2008, 2018, 2020, and 2024.

- **URL**: same Klass v1 endpoint Atlas already uses for `ssb-klass-kommuner` and `ssb-klass-fylker`
- **What**: 1–6 urban-rural classification per kommune
- **Why Tier 3**: not a report on its own — but a high-leverage *stratification dimension* for every existing indicator (city vs distrikt). One-shot, trivially small. Land it as a sub-task of any Tier-1 PLAN that motivates urban-rural splits, not a standalone PLAN.
- **[Q30]** Decide whether `dim_kommune` carries `sentralitet` as a column, or `dim_kommune_attributes` is a separate table. ⚠️ **"Recommendation: column on dim_kommune — sentralitet is a slowly-changing one-value-per-kommune attribute" is corrected above — it is NOT slowly-changing in the way that sentence assumed.** Whichever shape is chosen, it must represent (or deliberately simplify away) the real reclassification history, not assume there isn't one.

### 14. Bibliofil / Biblioteksentralen

- **URL**: `https://openapi.bib.no/`
- **What**: per-library catalogue
- **Why Tier 3**: useful for Leksehjelp / Norsktrening partnerships in the NGO frontend; doesn't move any of the 10 reports. Defer until a partner-side tool needs it.

---

---

## Cross-check against Samfunnspuls (Røde Kors's older system)

Samfunnspuls (`samfunnspuls.rodekors.no`) is Røde Kors's existing kunnskapsbank — a 37-report Power-BI front-end over the same upstream-public-data sources Atlas wants to consume. Each statistikk page exposes an "Om tallene" block that names the upstream provider + table ID exactly. Re-crawled live 2026-05-04 (37 reports across 6 themes, matching the 2026-04-21 baseline in [`docs/research/samfunnspuls/data-sources.md`](https://github.com/terchris/atlas/tree/main/docs/research/samfunnspuls/data-sources.md) — no new reports added since the prior pass).

The 37 reports collapse to **24 unique upstream sources**; the reconciliation against Atlas (38 implemented sources) and against the Tier-1/2/3 candidates above resolves into three buckets.

### A. Already in Atlas — no action

The 12 SSB tables Samfunnspuls cites that Atlas already ingests: `ssb-08764`, `ssb-12944`, `ssb-06947`, `ssb-07459`, `ssb-06913`, `ssb-06083`, `ssb-09429`, `ssb-12292`, `ssb-12063`, `ssb-13995`, `ssb-12131`, `ssb-12132`.

🔵 **Of the Tier-1 gap-fill candidates below, 2 have actually shipped since this file was written**: `bufdir-barnefattigdom` and `ssb-10826` (bydel population, [Q48]). Confirmed 2026-10-01 by checking `atlas-data/ingest/src/sources/` directly, not by trusting this file's own status markers — **none of the `bufdir-barnevern` / `nav-*` / `imdi-*` / `udir-*` / `husbanken-*` families exist**, including the Phase-0 schema-prep PLAN that was supposed to unblock all of them.

⚠️ **`ssb-13995` is in Atlas, but not for every year it claims to cover.** The manifest declares `time_coverage: 2022–2025`; the served relation (`indicators__ssb_13995`) has rows for **2025 only** — 30,294 rows, zero for 2022–2024. Not previously caught by this investigation.

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

🔵 **Confirmed again 2026-10-01**: a third independent consumer (Lovable-built UI) re-listed `13006` as a table to ingest, not knowing [Q38] below had already resolved it as a phantom in May. The answer is unchanged — query `ssb-13995`'s `ContentsCode` dimension instead.

- **[Q38] `ssb-13006` — Sosialhjelp, gjennomsnittlig stønadstid.** **Resolved 2026-05-05 — phantom table; data already in `ssb-13995`.** A Cursor BG onboarding attempt (PR #56, issue #55) confirmed `13006` is **not exposed via SSB's PxWebApi v2-beta** (metadata 404, search 0 hits, v0 metadata 400). The statbank UI URL returns 200 but that's the SPA shell, not a working data endpoint. Direct SSB API search for `stønadstid` returns four tables — `08856`, `08857`, `13995`, `12404` — **not 13006**. Atlas's existing `ssb-13995` ingest already carries the same data: its `ContentsCode` dimension exposes 8+ stønadstid codes including `KOSsosgjantmnd0000` (overall mean duration), `KOSgjsnitt18240000` (18–24 yrs), `KOSgj25290000` / `30390000` / `40490000` / `50670000` per age band, and `KOSgjsnittvklo0000` (mean duration when sosialhjelp is the main income). Anyone wanting "duration on welfare" should query `marts.indicators__ssb_13995` filtered by those content codes. **No PLAN required; no separate folder.** [Q50]'s 2026-05-04 wording said `13138` was split into `13995 + 13006`; the actual SSB restructure consolidated the duration data into `13995`'s ContentsCode dimension, so `13006` was never created (or never re-published) as a standalone table.

#### C.2 Udir-family extensions (extend Tier-1 #4)

- **[Q39] `udir-fravar` — Median fravær, 10. trinn + videregående**. Udir, register data, fall snapshot. Pulled from `https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/fravarstall/` (and the videregående equivalent). Atlas has `fhi-vgs-gjennomforing` (3-year completion) but no annual-absence axis. Strong dropout-prediction signal. Plugs into Report #3 (Youth Outcomes).
- **[Q40] `udir-sluttet-vgs` — VGS dropout share (VIGO)**. Different framing from `fhi-vgs-gjennomforing` (which measures *completion*); this measures *dropout within school year*. Probably worth ingesting as a separate family because the directorate grants targeting dropout cite this number specifically. Plugs into Report #3.
- **[Q41] `udir-grunnskoler` — Schools + pupils baseline**. Already implicitly required by Tier-1 #4's `dim_school` resolution ([Q10]) — Udir's nøkkeltall for grunnskoler is the canonical source for the school-roster baseline. Make it a sub-step of `PLAN-009-udir-gsi.md`, not a separate PLAN.

#### C.3 IMDi-family extensions (extend Tier-1 #5)

- **[Q42] `imdi-innvandringsgrunn-kjonn` — Immigrants by reason for first immigration**. Work / refugee + family-reunified / family / education / unknown, by sex, per kommune. Atlas has `fhi-innvkat` (1st-gen / 2nd-gen / combined) but **no immigration-reason axis**. This is the column Report #8 (Integration Outcomes) would need to distinguish "labour migrant" vs "refugee" outcomes — a key differentiator that integration-research uses universally. Strong gap-fill. ⚠️ **Not folded into `PLAN-009-imdi-bosetting.md`** (2026-10-01, deliberate deviation, see that PLAN's Implementation Notes) — the only lead found, IMDikator, has no documented API and needs headless-browser reverse-engineering, out of proportion for that plan. Split out as its own investigation: [`INVESTIGATE-imdikator-api.md`](INVESTIGATE-imdikator-api.md).
- **[Q43] `imdi-landbakgrunn` — Immigrants by country of origin**. Atlas has `fhi-innvandrere` (immigrant background by LANDBAK code) which is similar but FHI-mediated; IMDi's version is published faster and uses a different bucketing. **[Q44]** Decide whether to ingest both or pick one — the answer probably depends on which release schedule downstream consumers care about more. Same deferral as [Q42] — see [`INVESTIGATE-imdikator-api.md`](INVESTIGATE-imdikator-api.md).

#### C.4 NAV-family extension (extend Tier-1 #2)

- **[Q45] `nav-helt-ledige` — Registrerte helt arbeidsledige, monthly**. NAV register data; same scrape/Excel pattern as the other NAV families (per [Q4]). Small-cell suppression at ≤4 (consistent with Atlas's other suppression handling — confirmed live 2026-10-02, 15 kommuner suppressed in the live sample, citing Statistikklovens § 7-1). Slots cleanly between `nav-uforetrygd` (long-tail outcome) and `nav-aap` (transitional benefit) as the *short-tail* labour-market signal. Plugs into Report #5 (Income & Welfare) and as an additional axis on Report #4 (Mental-Health Triangulation — because acute unemployment ↔ mental health is well-documented).

  ✅ **`nav-helt-ledige` (PLAN-014) drafted 2026-10-02 — mechanism confirmed live, matching this
  description for once** (unlike `nav-sykefravaer`, where it didn't): NAV's own `HL060 "Fylke og
  kommune"` table is genuinely kommune-resolved, same NAV-Excel shape as `nav-uforetrygd`/`nav-aap`.
  ⚠️ The "last-day-of-month snapshot" framing above was not independently re-confirmed — not
  contradicted either, just not specifically checked; the workbook itself doesn't state its own
  measurement timing in what was inspected. See the plan's own Phase 1 for the full research,
  including two sentinel shapes (Svalbard's `2100`, a bare `Ukjent` bucket) both already handled by
  `classify_region_code` from prior sources, no new macro branch needed.

#### C.5 Bespoke / cooperative — flag, defer

- **[Q46] `ssb-spesialbestilt-bosted-husholdning` — Population by age × tettbygd/spredtbygd × household-type**. Samfunnspuls notes this is a *bespoke* SSB extract, not a public statistikkbank table; the trangbodd component is covered by Atlas's `fhi-trangbodd`, but the urban-rural × household-type cut is genuinely unique.

  🔴 **RESOLVED 2026-10-01 — the lookup was finally done, and it closes the question the other way.** Both candidates checked live:
  - **`ssb-17376`** returns `{"error":"Parameter error"}` on the v1 API — the **identical signature** a deliberately-bogus table id (`99999999`) returns. It does not exist, or at minimum is not reachable the way every real table is.
  - **`ssb-12578`** exists and returns 200 — but it is *"Kjørelengder, etter kjøretøytype, drivstofftype..."* (**vehicle mileage by vehicle and fuel type**). Wrong domain entirely; the May note's guess was wrong.
  - A keyword search (`tettbygd husholdning`, `boforhold barn`) against SSB's own statbank search returns only **discontinued series from 1999–2012 and 2005–2012** — nothing current.

  **So: no public SSB table covers this cross-tabulation today.** The bespoke-order path is confirmed correct, not merely assumed. **Recommendation, now final**: this is not an Atlas ingest task. Røde Kors needs to either locate its original SSB order reference (the live Samfunnspuls page literally states *"Innhenting: spesialbestilt fra SSB"*, so an order already exists and may be reusable) or place a new order via `bestilling@ssb.no` with the specification below, then hand Atlas the resulting file. Atlas ingests it the same way `redcross-branches` was ingested — a private, dated, static extract, documented as such rather than as a live feed.

  **Specification to hand SSB or Røde Kors**, as given by the agent that found the need:

  | field | content |
  |---|---|
  | population | persons 0–18 |
  | dimension 1 | age group (0–5, 6–12, 13–18) |
  | dimension 2 | bostedsstrøk — tettbygd / spredtbygd (SSB's tettsted definition, ≥200 persons) |
  | dimension 3 | household type — enehusholdning / flerpersonhusholdning (institution counts as flerperson) |
  | geography | kommune (+ fylke, national) |
  | time | per year |
  | columns on arrival | `kommune_nr, year, age_group, bosted, husholdningstype, value` — Atlas's standard shape |
- **[Q47] `rk-internal-medlemmer-frivillige` — Røde Kors annual member + volunteer counts per lokalforening**. Internal data; not a public API. Adjacent to Atlas's existing `redcross-branches` ingest. Atlas's parallel ambition is generalising NGO supply (see [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](./INVESTIGATE-multi-ngo-supply-model-extensions.md) and the Folkehjelp investigation), so a per-NGO members/volunteers register fits the same supply layer. **Recommendation**: track separately under the multi-NGO supply investigation, not this one — it's a supply-side ingestion needing org-level cooperation, not a demand-side public-data dataset.

#### C.6 SSB-companion tables flagged by the prior research (verified live 2026-05-04)

The prior Samfunnspuls research file flagged three table-ID open questions that were never resolved. Verified against the SSB PxWebApi v2 `/metadata` endpoint:

- **[Q48] `ssb-10826` — Alders- og kjønnsfordeling for befolkningen i bydeler (B), 2001–2026**. Verified live: bydel-level companion to `ssb-07459` (which Atlas already ingests at kommune/fylke/national). Covers Oslo (17 bydeler), Stavanger (7 + Finnøy/Rennesøy), Bergen (8 bydeler), Trondheim (4 bydeler) — single-year ages 0–105+, both sexes. **Genuine net-new value**: Atlas currently has zero bydel-resolution population denominator. With FHI sources at bydel level (per `crosswalk_geo_to_kommune` which already handles 6-digit bydel codes) and Bufdir at bydel level for Oslo (per [Q3]), a bydel population denominator unlocks per-capita normalisation for every existing bydel-resolved indicator. **Recommendation**: Tier-1, ingest immediately after `ssb-07459` plumbing is verified to extend cleanly. ~3h PLAN.
- **[Q49] `ssb-04362` — companion to `ssb-07459`** (cited jointly in Samfunnspuls's Om tallene block per the field notes, but never separately catalogued). The prior research's open question was: "Atlas should decide whether to consolidate on 07459 only or treat the trio as one logical 'population' source." **Recommendation**: leave as deferred — verify during the `ssb-10826` PLAN whether `ssb-04362` adds a temporal extension (older years), an alternative grouping, or is fully redundant with `ssb-07459`. If redundant, document as superseded; if not, fold as a sibling table in the same `ssb-07459` source folder rather than a new folder. ⚠️ **Still unresolved 2026-10-01** — attempted during the Lovable cross-check; SSB's v2-beta metadata API returned 503 for `04362` AND for `07459` (a table Atlas already ingests successfully), so the 503 is an SSB-side outage, not evidence either way. Not re-attempted after the outage cleared. Still open.
- **[Q50] `ssb-13138` — Sosialhjelpstilfeller, utbetalt beløp og stønadstid (K) (avslutta serie) 2015–2021**. **Resolved by metadata fetch 2026-05-04**: this is a *discontinued series* (`avslutta serie`, last year 2021). SSB consolidated the data into `ssb-13995` (cases + amounts + duration as ContentsCode entries) when the welfare statistikk was restructured. Atlas's existing `ssb-13995` ingest covers everything from the predecessor. Samfunnspuls's Power BI dataset name "ssb-13138" is therefore stale tooling-side metadata referring to the predecessor — no action needed beyond resolving the open question that flagged the mismatch. **No PLAN required.** *(2026-05-05 footnote: this entry originally said `13138` was split into `13995` + `13006`; that was wrong — only `13995` exists as a successor. See [Q38] resolution for the full story.)*

### D. What this means for sequencing

The Phase 1 PLAN sequence in the section above expands by 3 PLANs (`udir-fravar`, `udir-sluttet-vgs`, `nav-helt-ledige`, plus the IMDi extensions folded into the existing IMDi PLAN). The `ssb-sosialhjelp-stønadstid` PLAN that originally appeared here was dropped on 2026-05-05 after Cursor BG (PR #56) confirmed `ssb-13006` is a phantom and the data is already in Atlas via `ssb-13995`'s ContentsCode dimension — see [Q38] resolution above. Updated phase 1 sequence:

```
Phase 1 — Tier-1 ingests (parallelisable; no Phase 0 — see 2026-10-01 correction above, there was nothing to prep)
  PLAN-002-bufdir-barnefattigdom.md    ← shipped
  PLAN-003-bufdir-barnevern.md         ← shipped 2026-10-01
  PLAN-004-nav-uforetrygd.md           ← shipped 2026-10-01; plain month column, no dim_period
  PLAN-005-nav-aap.md
  PLAN-006-nav-sykefravaer.md
  PLAN-007-nav-helt-ledige.md          ← NEW (Samfunnspuls cross-check)
  PLAN-008-husbanken-statistikkbank.md
  PLAN-009-imdi-bosetting.md           ← drafted 2026-10-01; does NOT fold in imdi-innvandringsgrunn
                                           /imdi-landbakgrunn — their real data source (IMDikator)
                                           wasn't confirmed, see the plan's own Implementation Notes.
                                           Blocked on licence verification [Q1].
  PLAN-010-udir-gsi.md                 ← settles dim_school; folds udir-grunnskoler in
  PLAN-011-udir-elevundersokelsen.md
  PLAN-012-udir-nasjonale-prover.md
  PLAN-013-udir-fravar.md              ← NEW (Samfunnspuls cross-check)
  PLAN-014-udir-sluttet-vgs.md         ← NEW (Samfunnspuls cross-check)
  PLAN-015-ssb-bydel-population.md     ← NEW (Samfunnspuls cross-check; ssb-10826 — bydel-level age/sex; unblocks per-capita normalisation for every bydel-resolved indicator)
  -- (PLAN-015-ssb-sosialhjelp-stønadstid.md was originally listed here but
  --  dropped 2026-05-05 — see [Q38] resolution. Numbers shifted accordingly.)
```

Phase 2 / Phase 3 unchanged from the original sequencing — but renumber subsequent PLANs (the ssb-crime / helfo-fastlege / dsb / brreg-frivillighetsregisteret PLANs become PLAN-017+).

### E. Decisions resolved during the cross-check

9. **[Q37]** Extend Tier-1 #2 (NAV) with a fourth family `nav-helt-ledige`. Resolved 2026-05-04.
10. **[Q41]** `udir-grunnskoler` is a sub-step of the Udir GSI PLAN, not a standalone PLAN. Resolved 2026-05-04.
11. **[Q47]** `rk-internal-medlemmer-frivillige` belongs in [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](./INVESTIGATE-multi-ngo-supply-model-extensions.md), not here. Resolved 2026-05-04.
12. **[Q48]** `ssb-10826` (bydel-level age/sex) is Tier-1 — verified live, ingested as `PLAN-016-ssb-bydel-population.md` after the kommune-level `ssb-07459` plumbing. Resolved 2026-05-04.
13. **[Q50]** `ssb-13138` is a discontinued series (`avslutta serie 2015-2021`); the data lives in `ssb-13995`'s ContentsCode dimension which Atlas already ingests. No PLAN needed. Resolved 2026-05-04 via SSB metadata fetch; corrected 2026-05-05 (originally said `13138 → 13995 + 13006`; the actual restructure consolidated everything into `13995`).
14. **[Q38]** `ssb-13006` is a phantom — not in SSB's PxWebApi v2-beta; data already covered by `ssb-13995`'s ContentsCode dimension (8+ stønadstid codes). PR #56 / issue #55 closed without merging. Resolved 2026-05-05 via Cursor BG escalation + manual SSB API verification.

### F. Open questions added by the cross-check

27. **[Q39]** `udir-fravar` ingest mechanism — Skoleporten programmatic endpoint vs HTML scrape (Samfunnspuls uses an R-script auto-update). Investigate during the Udir PLAN. **Partially resolved, 2026-10-02**: `skoleporten.udir.no` is **NXDOMAIN** — confirmed by direct DNS lookup, not a fetch-tool glitch; a web-search result pointing at a live-looking `rapportvisning` URL there was stale. Neither of the two options this question posed is the real mechanism — it's the same unified `statistikkportalen.udir.no`/USS API found for GSI (`PLAN-010-udir-gsi.md`). Confirmed live: the `GSK` (grunnskole) schema has a `FravaerG` table, covering the "10. trinn" half. The videregående half's table name under `VGO` wasn't checked (not in the table list pulled for `PLAN-010`'s unrelated `SluttaV` check) — confirm when implementing `udir-fravar`.
28. **[Q40]** `udir-sluttet-vgs` vs `fhi-vgs-gjennomforing` — Atlas already has the completion side; document the methodological difference (annual dropout-during-year vs 3-year-cohort completion) so consumers don't double-count.
29. **[Q42]** IMDi-extension scope — fold `imdi-innvandringsgrunn-kjonn` into the same `imdi` source family as `imdi-bosetting`, so one PLAN (`PLAN-009-imdi-bosetting`) covers all three IMDi indicators. **Rejected, 2026-10-01**: `PLAN-009` shipped bosettingstall only — the other two need an undocumented API reverse-engineered first. See [`INVESTIGATE-imdikator-api.md`](INVESTIGATE-imdikator-api.md).
30. **[Q43]** `imdi-landbakgrunn` vs `fhi-innvandrere` — overlap analysis. Recommendation: ingest IMDi only if the methodology gap is meaningful (FHI typically lags IMDi by one cycle). Still open — tracked in [`INVESTIGATE-imdikator-api.md`](INVESTIGATE-imdikator-api.md) [Q4].
31. **[Q44]** IMDi small-cell suppression (≤4) — consistent application across all IMDi sources. `imdi-bosetting` uses the literal `:` marker (confirmed, see its own README); apply the same check if/when the other two indicators are ingested.
32. **[Q45]** `nav-helt-ledige` is the third monthly source after Helfo Fastlege and `nav-uforetrygd`/`nav-aap`. Reinforces the urgency of resolving [Q5] / [Q32] (`dim_period` monthly handling) early.
33. **[Q46]** `ssb-spesialbestilt-bosted-husholdning` — investigate whether SSB 17376 / 12578 (boforhold register-based) cover the bespoke extract's content. Track outcome here, not in a separate INVESTIGATE.
34. **[Q49]** `ssb-04362` companion-table reconciliation — verify during the `ssb-10826` PLAN whether 04362 adds a temporal/grouping extension to `ssb-07459` or is redundant. If non-redundant, fold as a sibling table in the existing `ssb-07459` source folder.

---

## Cross-cutting decisions this batch surfaces

These are decisions worth resolving once across all Tier-1 PLANs, not per-source:

### A. New `provider` enum values

- **[Q31]** Atlas's `manifest.yml` `provider` namespace currently allows `ssb / fhi / redcross / brreg`. Tier 1 alone adds `bufdir`, `nav`, `husbanken`, `udir`, `imdi`. Tier 2 adds `helsedirektoratet`, `dsb`, `lottstift`. Decision: add all eight in a single schema-bump commit at the start of the batch, with an updated [`manifest.yml schema`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/README.md#manifestyml-schema) section. Trying to extend the enum incrementally per PLAN risks merge churn.

### B. New `eu_theme` values used

The current enum already covers all needed values: `JUST` (crime), `HEAL` (Helfo, NKI), `EDUC` (Udir), `SOCI` (Bufdir, NAV, Husbanken, IMDi, Brreg/Lottstift), `GOVE` (DSB). No schema bump needed.

### C. Sub-cadence support (`P1M`, monthly)

- **[Q32]** NAV (uføretrygd, AAP), Helfo Fastlege are both monthly. Resolve `dim_period` to handle this *before* shipping either source to mart. Two options: (a) downsample to annual at staging (loses currency); (b) keep monthly, expose a `period_grain` column, push the join responsibility downstream. **Recommendation**: (b), and add a default-annual view on top so existing report queries continue to work without migration.

### D. New geographic resolutions

- **[Q33]** Udir at school level (org number) and IMDi at kommune-with-bydel breakouts both push beyond Atlas's current kommune/fylke/bydel scheme. Decide whether `dim_school` and bydel coverage become first-class catalogue dimensions, or whether they live in source-specific marts only. **Recommendation**: first-class — Atlas's value is conformed dimensions; a school dim that lives only in the Udir mart breaks the [introspection-driven catalogue at `/data`](https://github.com/terchris/atlas/tree/main/atlas-frontend/) story.

### E. Power-BI-backed sources

- **[Q34]** ⚠️ **Husbanken corrected, 2026-10-02**: it fronts its data with **Qlik Sense**, not Power BI — confirmed live, see `PLAN-011-husbanken-statistikkbank.md`. Helfo, Helsedir NKI, Bufdir not re-checked; this row's claim about them is unverified, not confirmed wrong. Whichever BI tool a source uses, none expose a clean JSON endpoint from the dashboard itself — but each has a separate machine-readable distribution (Excel, developer-portal API, or — as Husbanken turned out to have — a documented, anonymously-reachable backend API). **Convention**: never scrape a BI tool's iframe. Always trace to the underlying dataset or backend API. Document this as a rule in [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/README.md).

### F. Sensitivity tagging propagation

- **[Q35]** NAV per-kommune uføretrygd, IMDi per-kommune refugee inflow, SSB per-kommune crime, Bufdir barnevern — every Tier-1 + several Tier-2 candidates carry per-kommune readings that are politically sensitive in small kommuner. Consistent application of `presentation_policy: 'sensitive'` (per [INVESTIGATE-reports-and-indicators §6](./INVESTIGATE-reports-and-indicators-from-catalogue.md#open-questions-for-decision)) needs to be a checklist item in the per-source PLAN template.

---

## Decisions resolved during planning

1. **[Q1]** Bufdir: ingest as one folder per indicator family (`bufdir-barnefattigdom`, `bufdir-barnevern`), not one mega-source. Resolved 2026-05-04.
2. **[Q4]** NAV: one folder per indicator family (`nav-uforetrygd`, `nav-aap`, `nav-sykefravaer`). Resolved 2026-05-04.
3. **[Q8]** Husbanken: ingest the Excel statistikkbank, not the Power BI monitor HTML. Resolved 2026-05-04. **Superseded, 2026-10-02** — live verification found neither option was real: `statistikk.husbanken.no` is Qlik Sense, not Power BI, and no Excel download was found. The real mechanism is the Qlik Engine API (WebSocket), confirmed live. See `PLAN-011-husbanken-statistikkbank.md`.
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

⚠️ **The numbered Phase 1 list immediately below is stale** — it predates the Samfunnspuls
cross-check's renumbering (§D above) and still says `PLAN-008-imdi-bosettingstall.md` /
`PLAN-009-udir-gsi.md`. The code block in **§D "What this means for sequencing"** is the current
one: `PLAN-009-imdi-bosetting.md`, `PLAN-010-udir-gsi.md`. Confirmed 2026-10-01 while drafting the
IMDi plan — use that block's numbers, not this section's.

Atlas's [PLANS.md `Splitting Investigations into Multiple Plans`](../../PLANS.md#splitting-investigations-into-multiple-plans) section says: group by dependency and risk, group by completeness, keep optional/deferred work separate. Applied here:

**Phase 0 — none.** Dropped 2026-10-01: `PLAN-001-new-provider-enum-and-period-monthly.md` assumed a closed `provider` enum and existing `dim_period`/`dim_indicator` tables, none of which exist (see correction above). The provider half is satisfied per-source via `publishers.yaml` (NAV/IMDi/Udir/Husbanken entries landed in #486); the period-grain and sensitivity-flag halves are per-source modelling decisions, not prerequisites. Nothing to prep — go straight to Phase 1.

**Phase 1 — Tier-1 ingests (one PLAN per source family, ~6–8h each, parallelisable)**
1. `PLAN-002-bufdir-barnefattigdom.md` — ✅ shipped
2. `PLAN-003-bufdir-barnevern.md` — ✅ shipped (2026-10-01)
3. `PLAN-004-nav-uforetrygd.md` — ✅ shipped (2026-10-01). First monthly source; adds a plain `month` column, no `dim_period` built (there's nothing to "settle in practice" — the 2026-10-01 correction already established no such infrastructure is needed).
4. `PLAN-005-nav-aap.md` and `PLAN-006-nav-sykefravaer.md` (parallel after PLAN-004)
5. `PLAN-007-husbanken-statistikkbank.md`
6. `PLAN-008-imdi-bosettingstall.md` — superseded by `PLAN-009-imdi-bosetting.md` (correct current number, see the warning at the top of this section)
7. `PLAN-009-udir-gsi.md` (first sub-kommune resolution; settles `dim_school`)
8. `PLAN-010-udir-elevundersokelsen.md` and `PLAN-011-udir-nasjonale-prover.md` (after PLAN-009 lands `dim_school`)

**Phase 2 — Tier-2 (one PLAN per source family)**
1. `PLAN-012-ssb-crime-tables.md` — ✅ shipped (smallest, closed off Atlas's missing JUST theme)
2. ⚠️ `PLAN-018-helfo-fastlegestatistikk.md` — **Phase 1 only, blocked 2026-10-03.** Not "uses
   Helsedirektoratet developer-portal pattern" — that pattern was checked live and does not exist
   for this dataset. Needs outreach to Helsedirektoratet or a Tier-3 redesignation before any
   further work; see §7 above.
3. ⚠️ `PLAN-019-dsb-kommuneundersokelsen.md` — **Phase 1 only, blocked 2026-10-04.** `dsb.no` is
   behind a Cloudflare JS challenge this agent's tools cannot pass. Needs a human (or
   browser-capable tool) to fetch the file once; see §8 above.
4. ✅ Frivillighetsregisteret/ICNPO half already shipped (checked live 2026-10-04, see §9); the
   ICNPO-crosswalk block this line described never materialised — Brreg supplies ICNPO
   directly. [`PLAN-020-lottstift-momskompensasjon.md`](../active/PLAN-020-lottstift-momskompensasjon.md)
   covers the remaining Lottstift half.

**Phase 3 — Tier-3 (only if a stakeholder asks)**
- Skatteetaten / Valgresultat / NKI / Sentralitetsindeks / Bibliofil — pull from the deferred list when motivated.

Each PLAN follows the standard Atlas pattern (per-source folder under `atlas-data/ingest/src/sources/<id>/`, manifest.yml, dbt staging, marts join, end with `dbt run && dbt test`, update `INVESTIGATE-reports-and-indicators-from-catalogue.md` per its [maintenance ritual](./INVESTIGATE-reports-and-indicators-from-catalogue.md#maintenance--keep-this-current-as-new-sources-land)).

---

## Next steps

- [x] `PLAN-002-bufdir-barnefattigdom.md` — shipped.
- [x] `ssb-10826` and `ssb-crime-tables` — shipped (outside this file's original numbering, confirmed 2026-10-01).
- [x] Publisher metadata for NAV/IMDi/Udir/Husbanken — landed 2026-10-01 (#486), unblocking their PLANs.
- [ ] ~~Draft `PLAN-001-new-provider-enum-and-period-monthly.md`~~ — dropped, see the 2026-10-01 correction above. Nothing to prep.
- [x] ✅ **Shipped end to end, 2026-10-01.** [`PLAN-003-bufdir-barnevern.md`](../completed/PLAN-003-bufdir-barnevern.md) — all four phases done: ingest (23 workbooks, 191,673 rows, zero dropped), dbt staging + api_v1 publication, deployed to the live cluster by imac, and independently re-verified against the public API (not taken on trust) — `GET /indicators__bufdir_barnevern?limit=1` returns real rows, `Content-Range` confirms 191,673. Caught two real data defects by validating against real ingested data rather than an empty schema: Barnevern's own `andel`/`prosent` vocabulary mismatch (silently dropped 9 of 23 workbooks before being caught), and a Svalbard-as-kommune/fylke misclassification (the exact class of bug `classify_region_code` was built to fix, urb-agents #700). Full exchange: [urb-agents#1796](https://github.com/terchris/urb-agents/issues/1796).
- [x] ✅ **Shipped end to end, 2026-10-01.** [`PLAN-004-nav-uforetrygd.md`](../completed/PLAN-004-nav-uforetrygd.md) — all four phases done: ingest (1 workbook, 6,560 rows, zero dropped), dbt staging + api_v1 publication, deployed to the live cluster by imac, independently re-verified against the public API — `GET /indicators__nav_uforetrygd?limit=1` returns real rows, `Content-Range` confirms 6,560. Found and corrected two more wrong investigation claims before drafting: licence is CC BY 4.0, not NLOD; the file is a nested pivot table (fylke→kommune→bydel blocks), not a flat table. Resolved [Q5]/[Q32] directly: a plain `month` integer column, no `dim_period` built. Full exchange: [urb-agents#1797](https://github.com/terchris/urb-agents/issues/1797).
- [x] ✅ **Shipped end to end, 2026-10-01.** [`PLAN-009-imdi-bosetting.md`](../completed/PLAN-009-imdi-bosetting.md) — all four phases done: ingest (5 pages, 7,848 rows, zero dropped), dbt staging + api_v1 publication, deployed to the live cluster by imac, independently re-verified against the public API — `GET /indicators__imdi_bosetting?kommune_name=eq.Oslo&year=eq.2024` returns real rows, `Content-Range` confirms 7,848. Confirmed live: no kommune codes (names only, resolved via the
  existing `crosswalk_kommune_name` model restricted to active-only rows — 352/359 matched with zero
  ambiguity, vs. 259/359 ambiguous unrestricted), suppression marker `:` with IMDi's own inline
  explanation, and a real alternative API lead (IMDikator) that didn't pan out within reasonable
  effort — chased far enough to decide not to depend on it, not abandoned on a guess. **[Q1]
  (licence) resolved by authorization, 2026-10-01** — Terje: *"IMDI is ok. we can use it."*
  `manifest.yml` records `license: NLOD` as Atlas's own default for an unstated licence, applied
  under that authorization, not found on IMDi's own site — kept visibly distinct, not conflated
  with a verified citation. Also found the real column count varies by year/kommune (IMDi piloted
  2 extra "avtalt" metrics on Oslo's 2024 table before rolling them out everywhere in 2026) —
  parser resolves metrics by header text, not position, to represent this rather than normalize it
  away. Full exchange: [urb-agents#1799](https://github.com/terchris/urb-agents/issues/1799).
- [x] ✅ **Shipped end to end, 2026-10-02.** [`PLAN-011-husbanken-statistikkbank.md`](../completed/PLAN-011-husbanken-statistikkbank.md) — all four phases done: ingest (35,295 rows, zero dropped), dbt staging + api_v1 publication, deployed to the live cluster by imac, independently re-verified against the public API — `GET /indicators__husbanken_bostotte?limit=1` returns real rows, `content-range` confirms 35,295. Atlas's first Husbanken source and first WebSocket-based ingest (Qlik Engine API). Caught a new region-code defect: Husbanken's `KommuneNr` carries Oslo's bydeler under a 4-digit numbering distinct from FHI's 6-digit one — `classify_region_code` now recognises both. Deploy itself took three attempts: a missing `ingest:husbanken-bostotte` npm script ([urb-agents#1807](https://github.com/terchris/urb-agents/issues/1807)), then a `WebSocket` global absent on the deployed image's Node 20 ([urb-agents#1808](https://github.com/terchris/urb-agents/issues/1808)) — both invisible to local testing done on a newer Node, both fixed and verified against the deployed Node version before the third attempt landed clean ([urb-agents#1809](https://github.com/terchris/urb-agents/issues/1809)). **[Q1] (licence) resolved by direct statement, 2026-10-02** — Terje: *"Husbanken is owned by the norwegian goverment and they follow NLOD."*
- [x] ✅ **Shipped end to end, 2026-10-02.** [`PLAN-012-nav-aap.md`](../completed/PLAN-012-nav-aap.md) — Atlas's second NAV source and second monthly-cadence source. Ingested (5,720 rows, zero dropped), published to `api_v1`, deployed to the live cluster, independently re-verified against the public API. Phase 1 found AAP155 (the kommune-resolved table) is simpler than `nav-uforetrygd`'s PST302: no fylke-sheet duplicate, no bydel nesting, no Oslo/Stavanger row-order inconsistency. Independently re-confirmed CC BY 4.0 for AAP specifically (fetched NAV's general statistics-licence page directly) rather than inheriting the uføretrygd correction by assumption — resolves the "unverified for AAP/sykefravær" flag above for this source. One genuinely new finding, caught by a real test failure against the real fixture: a non-numeric `Ukjent` (unknown-region) bucket exists only in the Antall sheet, not Andel (358 regions vs 357) — falls through to `classify_region_code`'s existing `unknown` branch, confirmed with a real dbt test. Deploy hit an unrelated platform incident — checksum-verified PostgreSQL corruption on `marts.dim_brreg_enhet`, the second that day — correctly declined to self-repair and escalated rather than retried blind; verified clean before retry, then landed cleanly ([urb-agents#1810](https://github.com/terchris/urb-agents/issues/1810)). Applied the `husbanken-bostotte` deploy's npm-script lesson (#1807) proactively this time — `ingest:nav-aap` verified via the real `npm run` invocation and the new CI gate before any other Phase 2 work began.
- [x] ✅ **Shipped end to end, 2026-10-02.** [`PLAN-013-nav-sykefravaer.md`](../completed/PLAN-013-nav-sykefravaer.md)
  — implemented as `ssb-12451`, not `nav-sykefravaer`: NAV's own sykefravær/sykepenger pages
  publish no kommune-level table at all (checked live — every downloadable table there is
  fylke-level or coarser). The real kommune-resolved data is SSB table 12451
  ("Bostedskommune- og kjønnsfordelt sykefravær"), reached via this project's existing
  `lib/pxweb.ts` — the same mechanism every `ssb-*` source already uses, not a new NAV-family
  Excel parser. Licence NLOD (SSB's own), not CC BY 4.0. Ingested (196,770 rows, zero dropped),
  published to `api_v1`, deployed to the live cluster, independently re-verified against the
  public API — `GET /indicators__ssb_12451?limit=1` returns real rows, `content-range` confirms
  196,770. One new finding, caught by querying the built table directly rather than assumed:
  `0716u` ("Våle (-2001)"), SSB's own disambiguation suffix for a historical kommune whose code
  was later reused — falls through `classify_region_code`'s existing branches to `unknown`
  cleanly, no macro change needed. The simplest Phase 2 of any NAV-adjacent source this session:
  zero relationship-test failures on the first `dbt build`. Full exchange:
  [urb-agents#1811](https://github.com/terchris/urb-agents/issues/1811).
- [x] ✅ **Shipped end to end, 2026-10-02.**
  [`PLAN-014-nav-helt-ledige.md`](../completed/PLAN-014-nav-helt-ledige.md) — Atlas's fourth
  NAV-adjacent source. Ingested (5,744 rows, zero dropped), published to `api_v1`, deployed to the
  live cluster by imac ([urb-agents#1813](https://github.com/terchris/urb-agents/issues/1813)),
  independently re-verified against the public API. Phase 1 found this candidate's mechanism
  matches the investigation's original description for once (unlike `nav-sykefravaer`, which
  didn't): NAV's own `HL060 "Fylke og kommune"` table is genuinely kommune-resolved, confirmed live
  by direct download. Licence CC BY 4.0, confirmed against this table's own `"Kilde: NAV"`
  provenance, not assumed by family resemblance. A fourth distinct pivot shape within the
  NAV-Excel family, but the simplest to classify: neither the bare fylke header row nor the "I alt
  <name>" total row carries any digit at all, so "exactly 4 leading digits" alone separates
  kommune rows with no "I alt" prefix check needed. Two sentinel shapes present (Svalbard's
  `2100`, a bare `Ukjent` bucket) both resolved exactly as predicted, zero relationship-test
  failures on the first `dbt build`. One new finding: unlike `nav-aap`, `Ukjent` is present in
  BOTH the Antall and Prosent sheets here — its Prosent cells are suppressed, not omitted.
- [x] ✅ **Shipped end to end, 2026-10-03.**
  [`PLAN-015-udir-elevundersokelsen-mobbing.md`](../completed/PLAN-015-udir-elevundersokelsen-mobbing.md)
  — Atlas's second Udir source. Ingested (2,804 rows, zero dropped), published to `api_v1`,
  deployed to the live cluster by imac
  ([urb-agents#1822](https://github.com/terchris/urb-agents/issues/1822)), independently
  re-verified against the public API. Phase 1 found this report's response shape is NOT
  `udir-gsi`'s shape despite sharing one client: geography (`EnhetID`) is a column dimension here,
  not a row dimension, so `udir-gsi`'s depth-filtered-`radSti` technique doesn't apply. Found and
  corrected an assumption carried from `udir-gsi`: `TrinnID(-10)` is NOT an "alle" sentinel for
  this report — it silently resolved to a single wrong grade without erroring. **[Q1]** resolved
  in favour of correctness over call count — ~702 per-kommune calls, not a bulk decode; the real
  cost turned out to be wall time, not request volume, since per-call latency settles at ~3.5-6s
  each, not predicted in Phase 1 — 60.3 minutes in dev, 23.5 minutes in production, both well
  inside the "SLOW RUN, NOT STUCK" envelope flagged in the deploy request. Two genuinely new
  findings on the real run: a region/grade pair can be entirely absent, not suppressed
  (Hægebostad's missing 10th-grade cohort, confirmed in both dev and production); and a new
  sentinel, "Utlandet, uspesifisert" (`2599`, Norwegian schools abroad), falls through
  `classify_region_code`'s existing `unspecified_within_fylke` branch cleanly, alongside the
  already-known Svalbard (`2100`) sentinel.
- [x] ✅ **Shipped end to end, 2026-10-03.**
  [`PLAN-016-udir-nasjonale-prover.md`](../completed/PLAN-016-udir-nasjonale-prover.md)
  — Atlas's third Udir source, and its first direct learning-outcome signal. Ingested (8,589
  rows, zero dropped), published to `api_v1`, deployed to the live cluster by imac
  ([urb-agents#1824](https://github.com/terchris/urb-agents/issues/1824)), independently
  re-verified against the public API. Phase 1 found this report's shape matches `udir-gsi`'s, not
  `udir-elevundersokelsen-mobbing`'s — `EnhetID` is the row hierarchy here, confirmed via the
  response's own `rowHierarchy` metadata, not assumed from either sibling — so the cheap `radSti`
  depth-filter technique applies: 18 calls total, 29.9s in dev, 52.72s in production, no slow-run
  warning needed unlike its sibling. A real correction, caught mid-implementation not in Phase 1:
  the 5th-grade report's own `Rapportside.gyldigeFiltre` omits `TrinnID`, read as "no TrinnID
  filter exists" — wrong; `filterVerdier` still carries one real `TrinnID` entry and the data
  endpoint accepts it explicitly with an identical result, so `parse.ts` discovers grade uniformly
  from `filterVerdier` for both report versions. Genuinely asymmetric grade×subject matrix
  (English only at 8th grade, not 9th, confirmed live via a real empty response). One genuinely
  new finding neither sibling Udir source needed: `Utlandet` (schools abroad) sits under its own
  top-level node, a sibling of "Hele landet" rather than a descendant, so a second `radSti` anchor
  is required to reach it — and it carries real, non-suppressed data, so v1 includes it. Both
  Udir sentinels (Svalbard's `2100`, `Utlandet, uspesifisert`'s `2599`) resolved exactly as
  predicted via `classify_region_code`'s existing branches.
- [x] ⚠️ **Phase 1 only, blocked 2026-10-03.**
  [`PLAN-018-helfo-fastlegestatistikk.md`](./PLAN-018-helfo-fastlegestatistikk.md) — Tier-2
  item #7. Checked live: the investigation's own assumed mechanism ("Power-BI-backed, same
  pattern as Husbanken, use the developer-portal API") does not hold. The dashboard genuinely is
  Power BI, but "HAPI" — named as the backend — is Helsedirektoratet's own website-content API,
  unrelated to this dataset (confirmed directly on its own description page). The embed's token
  is server-minted per page load by an undocumented internal endpoint with a ~2-minute validity
  window, not a stable anonymous backend like Qlik's Engine API was for Husbanken. No raw-file
  fallback on Helfo's own site; SSB's PxWebApi publishes GP demographics/consultation patterns,
  not this list-coverage statistic. Does not proceed to Phase 2 without outreach to
  Helsedirektoratet (`HelsedirektoratetAPI@helsedir.no`) or a Tier-3 redesignation — this is now
  the action the line below was written for, not a non-blocking optional step.
- [ ] Outreach email to Helsedirektoratet (`HelsedirektoratetAPI@helsedir.no`) asking whether
  Fastlegestatistikk's underlying dataset — list vacancy/coverage per kommune — exists anywhere
  outside the Power BI dashboard. This is now **the** blocker for `PLAN-018`, not an optional
  extra. (Pattern reused from [`INVESTIGATE-folkehjelp-supply` § A.4](./INVESTIGATE-folkehjelp-supply.md#a4-craft-cms-graphql-probe--q2-outreach-worth-pursuing).)
  Separately, optionally: the same pattern for Bufdir, NAV, IMDi — non-blocking for those, since
  Atlas already ships around their public surfaces.
- [x] ⚠️ **Phase 1 only, blocked 2026-10-04.**
  [`PLAN-019-dsb-kommuneundersokelsen.md`](./PLAN-019-dsb-kommuneundersokelsen.md) — Tier-2 item
  #8. `dsb.no` is behind a Cloudflare managed JS challenge, confirmed blocked with two
  independent tools (`curl`, `WebFetch`); no alternate download host found. Unlike Helfo, the
  claimed mechanism (Excel/PDF download) may be entirely real — this agent just cannot reach it.
  Needs a human, or a tool with a real browser, to fetch
  `kommuneundersokelsen-2025/`'s files once; resume from Phase 2 at that point.

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
- [`INVESTIGATE-tag-indicators-sdg-icnpo.md`](./INVESTIGATE-tag-indicators-sdg-icnpo.md) — the
  blocking relationship this line described never materialised; see §9's correction, 2026-10-04.
- [`INVESTIGATE-felles-datakatalog-classification.md`](./INVESTIGATE-felles-datakatalog-classification.md) — DCAT-AP-NO classification on the source side; every new source must keep its `eu_theme` consistent with the federated classification.
- [`INVESTIGATE-data-discovery-surface.md`](./INVESTIGATE-data-discovery-surface.md) — the broader discovery / governance surface stack; new sources must be discoverable through the same MCP / API surface.
- [`INVESTIGATE-folkehjelp-supply.md`](./INVESTIGATE-folkehjelp-supply.md) — pattern reference for HTML-scrape sources (IMDi PLAN reuses the same scraping infra).
- [`PLAN-001-brreg-enheter`](../completed/PLAN-001-brreg-enheter.md) — pattern reference for cross-NGO Brreg ingest (PLAN-015 extends this).
- [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/README.md) — manifest.yml schema and the conventions every new source must conform to.
- [`docs/research/data-sources.md`](https://github.com/terchris/atlas/tree/main/docs/research/data-sources.md) — broader Norwegian + Red-Cross-ecosystem source catalogue (the menu this investigation selects from).
- [`docs/research/samfunnspuls/data-sources.md`](https://github.com/terchris/atlas/tree/main/docs/research/samfunnspuls/data-sources.md) — the prior Samfunnspuls cross-reference research (24-source catalogue, 2026-04-21). The cross-check in §"Cross-check against Samfunnspuls" above is the live (2026-05-04) reconciliation against this baseline.
