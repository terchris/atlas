# Samfunnspuls — upstream data sources

This file catalogues the **upstream public data sources** cited by the Norwegian Red Cross's Samfunnspuls site (`samfunnspuls.rodekors.no`). Samfunnspuls itself is a presentation layer; Atlas does not consume it. Instead, Atlas plans to consume the same upstream providers (SSB, Udir, IMDi, NAV, Brreg, and two Red Cross internal feeds) directly.

Each `###` entry follows the per-source schema defined in `data-source-schema.md` — the SSB 08764 block is the canonical worked example. The 37 Samfunnspuls reports captured in `desktop-field-notes.md` collapse to the 24 unique upstream sources listed below; shared sources list every citing report under `samfunnspuls_reports`.

Scope is deliberately narrow: only sources Samfunnspuls itself cites. Broader Atlas sources (Red Cross Organizations API, Kartverket boundaries, Brreg Enhetsregisteret, FHI Folkehelsestatistikk, met.no, IFRC GO, etc.) live in `docs/research/data-sources.md` and will be migrated into this schema once it is promoted.

Most entries are `atlas_decision: evaluate_later` — the field notes give us enough to identify the source and sketch use cases, but upstream verification (endpoint response, latest year, licence, granularity) has not yet been done for each. Entries marked `adopt_v1_core` are the handful clearly needed for the Coverage-gap explorer MVP (population demographics, child poverty, overcrowded housing).

---

### ssb-08764 — Barn og unge under 18 år i lavinntektshusholdning (EU-60)

```yaml
id: ssb-08764
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "08764"
title_no: Antall barn og unge under 18 år som tilhører husholdninger med lavinntekt (EU-60)
what_it_is: >
  Count of children and youth under 18 living in households with equivalised
  income below 60% of the national median, per kommune, annual.

use_cases:
  - coverage_gap_explorer: primary child-poverty need signal — overlay with
    cross-organisation chapter presence to surface kommuner with high need
    and low NGO coverage.
  - tilskuddsmatcher: need-weighting input when matching grant calls aimed
    at child welfare to specific kommuner; Lisa cites this directly in
    applications.
  - compare_organisations: lets Jonas see how different NGOs' chapter
    footprints correlate with child-poverty rates.

questions_answered:
  - What share of children in kommune X grow up in EU-60 low-income households?
  - Which kommuner have the highest child-poverty rates in Norway?
  - Has child poverty in kommune X worsened or improved over the last decade?
  - Which kommuner combine high child poverty with low NGO presence?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/08764
auth: none

samfunnspuls_reports:
  - "Barn og unge — Barn og unge i husholdninger med lavinntekt (EU-60)"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 08764"

atlas_decision: adopt_v1_core
verified_on: 2026-04-21

# optional — partially filled from field notes
data_type: register
telletidspunkt: 31. desember
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-12944 — Personer i husholdninger med vedvarende lavinntekt (EU-60, 3-års periode)

```yaml
id: ssb-12944
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "12944"
title_no: Personer i husholdninger med vedvarende lavinntekt
what_it_is: >
  Count and share of persons (all ages, and sub-ages including under 18)
  living in households with equivalised income below 60% of the national
  median over a three-year period — the persistent-low-income measure.

use_cases:
  - coverage_gap_explorer: persistent-poverty signal that complements the
    single-year 08764 indicator — useful for identifying chronic-need kommuner
    rather than transient dips.
  - tilskuddsmatcher: grant applications often specifically target persistent
    rather than single-year poverty; this is the canonical source.
  - chapter_detail: lets a chapter view show "in this kommune, N% of
    households live in persistent low income".

questions_answered:
  - How many people in kommune X live in persistent low income (3-year EU-60)?
  - What share of children under 18 in kommune X are in persistent low income?
  - Which kommuner have the largest gap between single-year and persistent
    low-income rates (i.e. chronic vs transient)?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/12944
auth: none

samfunnspuls_reports:
  - "Barn og unge — Barn og unge under 18 år i husholdninger med vedvarende lavinntekt (EU-skala 60 prosent)"
  - "Økonomi — Personer i husholdninger med vedvarende lavinntekt (EU-skala 60 prosent), etter alder"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 12944"

atlas_decision: adopt_v1_core
verified_on: 2026-04-21

data_type: register
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
telletidspunkt: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-06947 — Personer i husholdninger med lavinntekt (EU-60), hele befolkningen

```yaml
id: ssb-06947
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "06947"
title_no: Personer i husholdninger med lavinntekt
what_it_is: >
  Count of persons (full population, all ages) living in households with
  equivalised income below 60% of the national median, per kommune, annual.

use_cases:
  - coverage_gap_explorer: whole-population poverty signal complementing the
    child-specific 08764 — needed for adult-focused NGO activities
    (besøkstjeneste, economic counselling).
  - tilskuddsmatcher: need-weighting for grant calls that are not
    child-specific.

questions_answered:
  - How many people in kommune X live in EU-60 low-income households?
  - What share of the whole population in kommune X is in low income?
  - How does low-income prevalence vary across fylker?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/06947
auth: none

samfunnspuls_reports:
  - "Økonomi — Personer i husholdninger med lavinntekt (EU-60), hele befolkningen"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 06947"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 31. desember
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-07459 — Alders- og kjønnsfordeling (befolkning, kommune/fylke/nasjon)

```yaml
id: ssb-07459
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "07459"
title_no: Alders- og kjønnsfordeling i kommuner, fylker og hele landets befolkning
what_it_is: >
  Population count by single year of age and sex, per kommune, fylke and
  nation, annual at 1 January. Samfunnspuls also cites companion tables
  04362 and 10826 for this indicator.

use_cases:
  - coverage_gap_explorer: the fundamental denominator — every per-capita and
    per-child indicator needs this to convert counts into shares.
  - chapter_detail: "X people in this kommune, Y% under 18, Z% over 67" — the
    baseline demographic profile shown on every chapter view.
  - compare_organisations: normalises chapter-coverage comparisons across
    kommuner of different sizes.

questions_answered:
  - How many people live in kommune X? How many children under 18? How many
    over 67?
  - What is the age distribution of kommune X's population?
  - How is the sex ratio split across age groups in kommune X?
  - How is kommune X's population changing year-on-year by age cohort?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/07459
auth: none

samfunnspuls_reports:
  - "Demografi og boforhold — Antall personer, etter alder og kjønn"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabellene 04362, 07459 og 10826"

atlas_decision: adopt_v1_core
verified_on: 2026-04-21

data_type: register
telletidspunkt: 1.1
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

Companion tables 04362 and 10826 are cited jointly in the Samfunnspuls Om tallene block but are not separately entered here — they provide alternative cuts of the same underlying population register. During upstream verification, decide whether Atlas consolidates on 07459 only or treats the trio as one logical "population" source.

---

### ssb-06913 — Befolkningsendringer (folketilvekst, levendefødte, flytting)

```yaml
id: ssb-06913
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "06913"
title_no: Endringer i kommuner, fylker og hele landets befolkning
what_it_is: >
  Annual population change components per kommune — net population change,
  live births, in-migration (and companion outflows), at 31 December.

use_cases:
  - coverage_gap_explorer: population-change direction signals where need
    pressure is rising (fast-growing kommuner with lagging NGO coverage).
  - chapter_detail: shows demographic trajectory on a chapter view — is this
    kommune growing, shrinking, or ageing?

questions_answered:
  - Is kommune X's population growing or shrinking this year?
  - How many children were born in kommune X last year?
  - How many people moved into kommune X last year?
  - Which kommuner are losing population fastest?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/06913
auth: none

samfunnspuls_reports:
  - "Demografi og boforhold — Befolkningsendring"
  - "Demografi og boforhold — Levendefødte"
  - "Demografi og boforhold — Tilflytting"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 06913"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 31.12
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-06083 — Familier, etter familietype

```yaml
id: ssb-06083
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "06083"
title_no: Familier, etter familietype
what_it_is: >
  Count of families by family type (single parent, couple with/without
  children, etc.) per kommune, annual at 1 January.

use_cases:
  - coverage_gap_explorer: single-parent-family share is a common
    socioeconomic-vulnerability proxy — useful overlay for activities like
    Ferie for alle or homework help.
  - chapter_detail: family-composition baseline for a kommune.

questions_answered:
  - How many single-parent families live in kommune X?
  - What share of families in kommune X have children?
  - How does family structure vary across kommuner?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/06083
auth: none

samfunnspuls_reports:
  - "Demografi og boforhold — Antall familier, etter familietype"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 06083"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 1.1
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-09429 — Utdanningsnivå, etter kommune og kjønn

```yaml
id: ssb-09429
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "09429"
title_no: Utdanningsnivå, etter kommune og kjønn
what_it_is: >
  Count of persons aged 16 and over by educational attainment and sex, per
  kommune, annual at 1 October.

use_cases:
  - coverage_gap_explorer: education-level distribution is a general
    socioeconomic signal — useful for activities targeting low-education
    populations (norsktrening, CV-help).
  - chapter_detail: demographic baseline for a kommune.

questions_answered:
  - What share of adults in kommune X have only compulsory schooling?
  - What share have higher education?
  - How does educational attainment differ between men and women in kommune X?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/09429
auth: none

samfunnspuls_reports:
  - "Demografi og boforhold — Antall personer i alderen 16 år og over, etter utdanningsnivå og kjønn"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 09429"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 1.10
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-12292 — Beboere i sykehjem og brukere av hjemmetjeneste

```yaml
id: ssb-12292
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "12292"
title_no: Institusjon — sykehjemsbeboere / Brukere av hjemmetjeneste, etter aldersgruppe og bistandsbehov
what_it_is: >
  Counts of nursing-home residents and home-care service recipients (by age
  group and assistance-need category) per kommune, annual at 31 December.

use_cases:
  - coverage_gap_explorer: elder-care load signal — useful for activities
    like besøkstjeneste, nettverksarbeid for eldre, and volunteering at
    institutions.
  - chapter_detail: elder-care footprint for a kommune.
  - tilskuddsmatcher: grants targeting eldreomsorg can use this as need
    weighting.

questions_answered:
  - How many nursing-home residents are there in kommune X?
  - How many people in kommune X use home-care services?
  - What share of elderly residents in kommune X live in institutional care
    vs. at home?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/12292
auth: none

samfunnspuls_reports:
  - "Helse og eldre — Antall beboere i sykehjem"
  - "Helse og eldre — Antall personer som bruker hjemmetjeneste"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 12292"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 31.12
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-12063 — Kommunale fritidstilbud (fritidssentre, frivillige barne- og ungdomsforeninger)

```yaml
id: ssb-12063
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "12063"
title_no: Kommunale fritidstilbud — fritidssentre og tilskudd til frivillige barne- og ungdomsforeninger
what_it_is: >
  Municipal leisure-services statistics — count of kommunal youth-leisure
  centres, count of voluntary children-and-youth associations receiving
  kommunal grants, and the average grant size per recipient association,
  per kommune, annual at 31 December.

use_cases:
  - coverage_gap_explorer: quantifies the kommune's own investment in youth
    leisure — low values flag kommuner where NGO coverage matters more.
  - tilskuddsmatcher: directly relevant — shows where kommunal grant
    capacity exists for children-and-youth associations.
  - compare_organisations: lets Jonas compare which NGO federations attract
    kommunal grants in which regions.

questions_answered:
  - How many kommunal youth-leisure centres exist in kommune X?
  - How many voluntary children/youth associations get kommunal grants in X?
  - What is the average kommunal grant per association in X vs. national
    median?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/12063
auth: none

samfunnspuls_reports:
  - "Barn og unge — Kommunale fritidstilbud - antall kommunale fritidssenter"
  - "Barn og unge — Kommunale fritidstilbud - antall frivillige barne- og ungdomsforeninger som får kommunalt tilskudd"
  - "Barn og unge — Kommunale fritidstilbud - tilskudd/overføringer til frivillige barne- og ungdomsforeninger per lag som mottar tilskudd"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 12063"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 31.12
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-13995 — Sosialhjelpsmottakere (antall), inkl. barneforsørgere

```yaml
id: ssb-13995
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "13995"
title_no: Sosialhjelpsmottakere, utbetalt beløp og stønadstid — sosialhjelpsmottakere (antall), sosialhjelpsmottakere som forsørger barn under 18 år (antall)
what_it_is: >
  Count of social-assistance recipients per kommune, including the subset
  who are guardians of children under 18, annual at 31 December.

use_cases:
  - coverage_gap_explorer: direct welfare-receipt signal — a strong proxy
    for acute economic vulnerability.
  - tilskuddsmatcher: need-weighting for grants targeting households in
    social-assistance; Lisa cites this in economic-vulnerability applications.
  - chapter_detail: economic-need baseline for a kommune view.

questions_answered:
  - How many people in kommune X receive social assistance?
  - How many social-assistance recipients in X are supporting children?
  - Which kommuner have the highest per-capita social-assistance rates?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/13995
auth: none

samfunnspuls_reports:
  - "Økonomi — Antall sosialhjelpsmottakere"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 13995"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 31.12
samfunnspuls_transformation: none
open_questions: >
  Field notes flag a mismatch — the Samfunnspuls Power BI dataset is named
  "ssb-13138" but the Om tallene block cites table 13995. Claude Code should
  resolve which is canonical during upstream verification and update this
  entry accordingly. See desktop-field-notes.md §4.

first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-13006 — Økonomisk sosialhjelp, gjennomsnittlig stønadstid

```yaml
id: ssb-13006
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "13006"
title_no: Sosialhjelpsmottakere, utbetalt beløp og stønadstid — gjennomsnittlig stønadstid for sosialhjelpsmottakere (overall, 18–24 år, 25–66 år)
what_it_is: >
  Average duration (months) that social-assistance recipients receive
  support, overall and by age cohort (18–24, 25–66), per kommune, annual
  at 31 December.

use_cases:
  - coverage_gap_explorer: distinguishes short-term crisis assistance from
    long-term dependency — useful for targeting interventions.
  - tilskuddsmatcher: grants aimed at breaking long-term welfare dependency
    can use this as need weighting.

questions_answered:
  - On average, how long do social-assistance recipients in kommune X stay
    on support?
  - Are young adults (18–24) in kommune X on social assistance longer or
    shorter than the national average?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/13006
auth: none

samfunnspuls_reports:
  - "Økonomi — Økonomisk sosialhjelp - gjennomsnittlig stønadstid"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 13006"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 31.12
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-12131 — Stønadssatser for sosialhjelp (månedssatser)

```yaml
id: ssb-12131
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "12131"
title_no: Stønadssatser for sosialhjelp og vedtakstidspunkt — stønadssats per måned for enslig / samboere/ektepar
what_it_is: >
  Social-assistance monthly payment rates set by each kommune, for single
  recipients and for cohabitants/spouses (plus child supplements), annual
  at 31 December.

use_cases:
  - coverage_gap_explorer: kommunal generosity signal — high local rates
    suggest active social-support policy; low rates suggest gaps NGOs may
    need to fill.
  - compare_organisations: lets observers see which kommuner an NGO
    federation operates in have higher or lower welfare floors.

questions_answered:
  - What is kommune X's monthly social-assistance rate for a single person?
  - How do kommunal assistance rates vary across Norway?
  - Which kommuner apply the government's veiledende satser vs. their own
    higher/lower rates?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/12131
auth: none

samfunnspuls_reports:
  - "Økonomi — Stønadssatser for sosialhjelp"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 12131"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 31.12
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-12132 — Utgifter som inngår i stønadssatsene for økonomisk sosialhjelp

```yaml
id: ssb-12132
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "12132"
title_no: Utgifter som inngår i stønadssatsene for økonomisk sosialhjelp (ja/nei-indikatorer for barnetrygd, barns inntekter, kontantstøtte)
what_it_is: >
  Per-kommune indicators showing whether child benefit, children's own
  income, and cash-support for childcare are counted as income when
  calculating social-assistance payments. Boolean (1/0) per kommune.

use_cases:
  - coverage_gap_explorer: reveals which kommuner effectively reduce benefits
    for families with children — structural disadvantage signal.
  - tilskuddsmatcher: policy context for family-welfare grant applications.

questions_answered:
  - Does kommune X count child benefit as income when calculating social
    assistance?
  - Which kommuner have the most family-friendly social-assistance
    calculation rules?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/12132
auth: none

samfunnspuls_reports:
  - "Økonomi — Økonomisk sosialhjelp - beregningsgrunnlag"
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 12132"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 31.12
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### ssb-spesialbestilt-bosted-husholdning — Befolkning etter aldersgruppe, tettbygd/spredtbygd og husholdningstype

```yaml
id: ssb-spesialbestilt-bosted-husholdning
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: none
title_no: Antall personer (og antall barn og unge under 19 år), etter aldersgruppe, bosted (tettbygd/spredtbygd strøk) og husholdningstype; inkl. trangboddhet under 19 år
what_it_is: >
  Bespoke SSB extract covering (a) population and children-under-19 counts
  by age group, urban/rural residence and household type (single vs.
  multi-person), and (b) overcrowding among children and youth under 19.
  Not available as a standard statistikkbank table — ordered directly from
  SSB.

use_cases:
  - coverage_gap_explorer: overcrowded-housing share among children is one
    of Samfunnspuls's headline indicators and a core Atlas need signal.
  - chapter_detail: urban/rural and household-type breakdown at kommune level
    informs which chapter activities are a fit.
  - tilskuddsmatcher: overcrowding data supports housing-and-integration
    grant applications.

questions_answered:
  - How many children under 19 in kommune X live in overcrowded housing?
  - How many residents in kommune X live in single-person vs. multi-person
    households?
  - How does the urban/rural split vary by age across kommuner?

endpoint: "[TBD — bespoke extract; verify with SSB whether equivalent public tables (e.g. trangboddhet via 17376/12578 or boforhold register tables) can replace this]"
auth: "[TBD — verify during upstream check]"

samfunnspuls_reports:
  - "Barn og unge — Antall barn og unge under 19 år, etter aldersgruppe og bosted"
  - "Barn og unge — Barn og unge som bor trangt/romslig/uoppgitt"
  - "Demografi og boforhold — Antall personer, etter aldersgruppe, husholdningstype og bosted"
om_tallene_kilde: "Statistisk sentralbyrå (SSB)"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
samfunnspuls_transformation: none
open_questions: >
  Innhenting is "spesialbestilt fra SSB" — Atlas can't just call an open API
  for this. Need to determine whether (a) SSB publishes equivalent open
  tables (the boforhold-registerbased statistikk referenced in the
  trangboddhet report suggests tables 12578, 17376 or similar may exist),
  or (b) Atlas must place its own bespoke order. Desktop note §5 also flags
  that Samfunnspuls's trangboddhet report has a stale "Neste oppdatering: vår
  2023" — source may be infrequently refreshed.

first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
telletidspunkt: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### udir-elevundersokelsen — Elevundersøkelsen (mobbing og støtte hjemmefra)

```yaml
id: udir-elevundersokelsen
provider: Utdanningsdirektoratet (Udir)
kind: measurement
provider_table_id: none
title_no: Elevundersøkelsen — andel mobbede (7./10. trinn, Vg1) og opplevd støtte hjemmefra i skolearbeidet
what_it_is: >
  Mandatory autumn school survey covering pupils on 7th grade, 10th grade
  and Vg1 — Samfunnspuls uses two blocks of items: bullying (share who
  answer that they have been bullied 2-3 times a month or more often) and
  home-school support (average score on three statements about parental
  engagement with schoolwork).

use_cases:
  - coverage_gap_explorer: youth-wellbeing signals — mobbing and weak
    home-school support flag schools and kommuner where NGO youth
    activities (leksehjelp, fritid, mentorprogrammer) matter most.
  - chapter_detail: school-level breakdown enables chapter-to-school pairing
    for NGOs that work directly with schools (Ungdommens Røde Kors, Natteravn).

questions_answered:
  - What share of 7th-graders in kommune X report being bullied?
  - Is bullying increasing or decreasing at school Y over recent years?
  - Which kommuner have the weakest reported home-school support?
  - How does a specific Vg1 school compare to national averages on
    perceived home support?

endpoint: https://www.udir.no/tall-og-forskning/brukerundersokelser/elevundersokelsen/
auth: none

samfunnspuls_reports:
  - "Barn og unge — Andel elever på 7. og 10. trinn som har blitt mobbet"
  - "Barn og unge — Andel elever på Vg1 som har blitt mobbet"
  - "Barn og unge — Støtte hjemmefra til skolearbeidet – grunnskolen"
  - "Barn og unge — Støtte hjemmefra til skolearbeidet – Vg1"
om_tallene_kilde: "Utdanningsdirektoratet (Udir), Elevundersøkelsen"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: survey
telletidspunkt: "Elevundersøkelsen gjennomføres to ganger per år. I høstsemesteret er det obligatorisk for skolene å gjennomføre den på 7. og 10. trinn og på Vg1."
samfunnspuls_transformation: "Samfunnspuls ingests the data through an R-script auto-update from the Udir site (per Power BI dataset naming convention), not via a dedicated Udir API. Atlas should determine whether Udir exposes a programmatic endpoint (Skoleporten rapportbygger) or whether scraping is required."
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### udir-fravar — Registrert fravær i grunnskolen (10. trinn) og videregående skole

```yaml
id: udir-fravar
provider: Utdanningsdirektoratet (Udir)
kind: measurement
provider_table_id: none
title_no: Fravær på vitnemålet — median fraværsdager og -timer, 10. trinn og videregående skole
what_it_is: >
  Median days and hours of registered absence recorded on pupils' leaving
  certificates for 10th grade (lower-secondary) and Vg1-Vg3 (upper-secondary),
  per school/kommune/fylke/nasjon. Samfunnspuls uses the median rather than
  the mean because extreme values skew the mean.

use_cases:
  - coverage_gap_explorer: school-absence is a well-known dropout and
    vulnerability signal — useful for targeting mentoring and drop-out
    prevention activities.
  - chapter_detail: school-level context for chapters running school-linked
    programmes.

questions_answered:
  - What is the median absence for 10th-graders in kommune X?
  - Which kommuner have the highest school absence rates?
  - Is absence at school Y rising or falling?

endpoint: https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/fravarstall/
auth: none

samfunnspuls_reports:
  - "Barn og unge — Registrert fravær i grunnskolen (10. trinn)"
  - "Barn og unge — Registrert fravær i videregående skole"
om_tallene_kilde: "Utdanningsdirektoratet (Udir)"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: Høst
samfunnspuls_transformation: "Ingested via R-script auto-update from Udir's site — Atlas should determine whether Skoleporten offers a programmatic endpoint."
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### udir-sluttet-vgs — Andel elever som har sluttet i videregående skole (VIGO)

```yaml
id: udir-sluttet-vgs
provider: Utdanningsdirektoratet (Udir) / VIGO
kind: measurement
provider_table_id: none
title_no: Andel elever som har sluttet i videregående skole i løpet av skoleåret
what_it_is: >
  Share of upper-secondary pupils coded as "sluttet" (dropped out) as their
  only valid result at the end of the school year. Excludes apprentices.

use_cases:
  - coverage_gap_explorer: dropout rate is a top-tier youth-outcome signal
    and a classic need indicator for mentoring/outreach activities.
  - tilskuddsmatcher: directorate grants targeting dropout prevention
    explicitly reference these figures.
  - chapter_detail: school-level context for chapters running school-linked
    programmes.

questions_answered:
  - What share of Vg1 pupils in kommune X drop out within the school year?
  - Which fylker have the highest dropout rates?
  - Is dropout at school Y trending up or down?

endpoint: https://www.udir.no/tall-og-forskning/statistikk/statistikk-videregaende-skole/sluttet/
auth: none

samfunnspuls_reports:
  - "Barn og unge — Andel elever som har sluttet på videregående skole"
om_tallene_kilde: "Utdanningsdirektoratet (Udir)/VIGO"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
samfunnspuls_transformation: "Ingested via R-script auto-update from Udir's site."
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
telletidspunkt: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### udir-grunnskoler — Antall skoler og antall elever (grunnskole)

```yaml
id: udir-grunnskoler
provider: Utdanningsdirektoratet (Udir)
kind: measurement
provider_table_id: none
title_no: Antall skoler og antall elever (grunnskole)
what_it_is: >
  Count of schools and pupils in lower-secondary (grunnskole) per
  kommune/fylke/nasjon.

use_cases:
  - coverage_gap_explorer: school-network baseline — denominator for other
    Udir indicators.
  - chapter_detail: schools-in-kommune count for chapter pages.

questions_answered:
  - How many schools are there in kommune X?
  - How many pupils attend grunnskole in kommune X?

endpoint: https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/tall-om-elever-og-skoler/
auth: none

samfunnspuls_reports:
  - "Barn og unge — Nøkkeltall for grunnskoler"
om_tallene_kilde: "Utdanningsdirektoratet (Udir)"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
samfunnspuls_transformation: "Ingested via R-script auto-update from Udir's site."
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
telletidspunkt: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### imdi-bosetting — Anmodnings-, vedtaks- og bosettingstall for flyktninger

```yaml
id: imdi-bosetting
provider: Integrerings- og mangfoldsdirektoratet (IMDi)
kind: measurement
provider_table_id: none
title_no: Anmodnings-, vedtaks- og bosettingstall (flyktninger bosatt i kommuner)
what_it_is: >
  Per-kommune figures on three stages of refugee settlement: (1) IMDi's
  request to the kommune, (2) the kommune's settlement decision, and (3)
  actual settlements. Small-cell suppression: groups of 4 or fewer hidden.

use_cases:
  - coverage_gap_explorer: directly tells Atlas where refugee settlement is
    concentrated — drives overlay for integration-focused activities
    (flyktningguide, språkkafé, leksehjelp).
  - tilskuddsmatcher: integration-grant need weighting; IMDi-administered
    grants explicitly cite these figures.
  - chapter_detail: shows a chapter's kommunal integration load.

questions_answered:
  - How many refugees was kommune X asked to settle this year?
  - How many did kommune X actually settle?
  - Which kommuner consistently under-settle vs. their IMDi quota?

endpoint: https://www.imdi.no/om-integrering-i-norge/statistikk/F00/bosetting
auth: none

samfunnspuls_reports:
  - "Flyktninger og migrasjon — Bosetting av flyktninger"
om_tallene_kilde: "Integrerings- og mangfoldsdirektoratet (IMDi)"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
samfunnspuls_transformation: "Ingested via R-script auto-update from IMDi's site."
caveats: "IMDi applies small-cell suppression (<=4). As a consequence, summed kommune-level totals may be lower than fylke-level totals; use fylke/nasjon figures for aggregation."
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
telletidspunkt: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### imdi-innvandringsgrunn-kjonn — Innvandrere etter innvandringsgrunn og kjønn

```yaml
id: imdi-innvandringsgrunn-kjonn
provider: Integrerings- og mangfoldsdirektoratet (IMDi)
kind: measurement
provider_table_id: none
title_no: Innvandrere, etter innvandringsgrunn og kjønn
what_it_is: >
  Count of immigrants by reason for first immigration (work, refugee +
  family-reunified, family immigration, education/au pair/other, unknown)
  and sex, per kommune, annual at 1 January. Covers immigrants from 1990
  onward; earlier arrivals coded "uoppgitt".

use_cases:
  - coverage_gap_explorer: distinguishes work vs. refugee vs. family
    immigrants — different service needs (labour-market guidance vs.
    integration activities vs. family support).
  - chapter_detail: composition of the immigrant population in a kommune.

questions_answered:
  - How many refugee-origin immigrants live in kommune X?
  - What share of immigrants in kommune X came for work?
  - How has the composition of immigration to kommune X shifted over time?

endpoint: https://www.imdi.no/tall-og-statistikk/steder/F00/befolkning/befolkning_innvandringsgrunn
auth: none

samfunnspuls_reports:
  - "Flyktninger og migrasjon — Antall innvandrere, etter innvandringsgrunn og kjønn"
om_tallene_kilde: "Integrerings- og mangfoldsdirektoratet (IMDi)"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 1.1
samfunnspuls_transformation: "Ingested via R-script translation of IMDi's published figures."
caveats: "Small-cell suppression (<=4); kommune sums may be lower than fylke/nasjon totals. Pre-1990 arrivals coded as unknown reason."
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### imdi-landbakgrunn — Innvandrere etter landbakgrunn

```yaml
id: imdi-landbakgrunn
provider: Integrerings- og mangfoldsdirektoratet (IMDi)
kind: measurement
provider_table_id: none
title_no: Opprinnelse — land (innvandrere etter landbakgrunn)
what_it_is: >
  Count of immigrants by country/region of origin, per kommune, annual at
  1 January. Based on DSF (folkeregister); excludes asylum seekers and
  short-term residents.

use_cases:
  - coverage_gap_explorer: country-of-origin profile helps NGOs align
    language-specific services with the actual populations present.
  - chapter_detail: "top origin countries in this kommune" context for
    chapter pages working on integration.

questions_answered:
  - Which origin countries are most represented among immigrants in
    kommune X?
  - Where do refugees from country Y tend to settle?
  - Which kommuner have the most diverse immigrant populations?

endpoint: https://www.imdi.no/tall-og-statistikk/steder/F00/befolkning/befolkning_opprinnelsesland
auth: none

samfunnspuls_reports:
  - "Flyktninger og migrasjon — Antall innvandrere, etter landbakgrunn"
om_tallene_kilde: "Integrerings- og mangfoldsdirektoratet (IMDi)"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: 1.1
samfunnspuls_transformation: "Ingested via R-script auto-update from IMDi's site."
caveats: "Small-cell suppression (<=4). Excludes asylum seekers and persons without legal residence."
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### nav-helt-ledige — Registrerte helt arbeidsledige, etter måned

```yaml
id: nav-helt-ledige
provider: Arbeids- og velferdsetaten (NAV)
kind: measurement
provider_table_id: none
title_no: Helt ledige, etter måned
what_it_is: >
  Count of people registered with NAV as fully unemployed (and fully
  laid-off) per kommune, monthly at the last day of each month.

use_cases:
  - coverage_gap_explorer: monthly unemployment is the freshest
    economic-distress signal available at kommune level — complements
    annual SSB low-income tables with much shorter lag.
  - tilskuddsmatcher: need-weighting for employment-focused grant calls.
  - chapter_detail: current economic climate for a kommune view.

questions_answered:
  - What is the current unemployment rate in kommune X?
  - Is unemployment in kommune X rising, stable, or falling month-over-month?
  - Which kommuner have the highest unemployment right now?

endpoint: https://www.nav.no/no/nav-og-samfunn/statistikk/arbeidssokere-og-stillinger-statistikk/helt-ledige
auth: none

samfunnspuls_reports:
  - "Økonomi — Registrerte helt arbeidsledige, etter måned"
om_tallene_kilde: "NAV"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: "siste dag hver måned"
samfunnspuls_transformation: "Ingested via R-script auto-update from NAV's site — Atlas should investigate whether NAV publishes a direct API (their developer portal has REST endpoints for some series) or whether scraping is required."
caveats: "Small-cell suppression: kommuner with <=4 registered unemployed in a given month are hidden."
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```

---

### brreg-frivillighetsregisteret — Organisasjoner i Frivillighetsregisteret

```yaml
id: brreg-frivillighetsregisteret
provider: Brønnøysundregistrene / Digitaliseringsdirektoratet
kind: measurement
provider_table_id: none
title_no: Frivillighetsregisteret
what_it_is: >
  Register of voluntary organisations (ideal foreninger, non-profit
  foundations, non-commercial distributing companies) in Norway. Updated
  daily Mon–Thu and Saturday; served via data.norge.no / Digdir's open API.

use_cases:
  - coverage_gap_explorer: per-kommune counts of registered voluntary
    organisations give a crude NGO-density baseline — a useful floor
    beneath Atlas's own NGO chapter data.
  - compare_organisations: lets Atlas verify a given NGO federation's
    listed lokallag against their published chapter network.
  - om_appen: attribution / data-lineage context.

questions_answered:
  - How many voluntary organisations are registered in kommune X?
  - Which NGOs have a registered entity in kommune X?
  - Does a given lokallag actually exist in Frivillighetsregisteret?

endpoint: "[TBD — verify during upstream check; likely https://data.brreg.no/enhetsregisteret/api or hotell.difi.no/api]"
auth: none

samfunnspuls_reports:
  - "Frivillighet — Organisasjoner som er registrert i Frivillighetsregisteret"
om_tallene_kilde: "Brønnøysundregisteret/Digitaliseringsdirektoratet"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: "Datasettet blir oppdatert en gang per døgn mandag til torsdag samt lørdag"
samfunnspuls_transformation: none
first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"

# Note: Atlas already plans to use Brreg for the Enhetsregister/org-number
# lookup — this Frivillighetsregister feed is a related but distinct dataset
# within the same provider. When migrating this schema across to the main
# docs/research/data-sources.md, the two should be linked under a single
# Brønnøysund "platform" entry with Frivillighetsregister as a sub-component.
```

---

### rk-internal-medlemmer-frivillige — Medlemmer og frivillige i Røde Kors (årsrapport)

```yaml
id: rk-internal-medlemmer-frivillige
provider: Røde Kors (internt)
kind: measurement
provider_table_id: none
title_no: Medlemmer og frivillige i Røde Kors — årsrapport (lokalforening, distrikt, nasjonalt)
what_it_is: >
  Internal Red Cross figures on registered members, paying members, new
  members, member attrition, and unique active volunteers, per lokalforening,
  per distrikt and nationally, annual at 31 December. Not a public API;
  captured via Samfunnspuls because they are the Red Cross's own numbers.

use_cases:
  - compare_organisations: internal reference for Red Cross; Atlas will need
    equivalent internal feeds (or scraping) for other NGOs to enable cross-
    organisation comparison.
  - chapter_detail: authoritative member/volunteer counts on each Red Cross
    chapter view — if accessible.
  - om_appen: transparency about what data Atlas has direct access to vs.
    what requires Red Cross cooperation.

questions_answered:
  - How many paying members does Red Cross have in kommune X?
  - How many active volunteers are at lokalforening Y?
  - How is member attrition trending at the distrikt level?

endpoint: "[TBD — internal Red Cross system; may be reachable via the Red Cross Organizations API with appropriate subscription scope, otherwise requires a direct data-sharing arrangement]"
auth: "[TBD — likely api_key via Red Cross subscription; verify during integration planning]"

samfunnspuls_reports:
  - "Frivillighet — Medlemmer i Røde Kors - årsrapport"
  - "Frivillighet — Frivillige i Røde Kors - årsrapport"
om_tallene_kilde: "Røde Kors"

atlas_decision: evaluate_later
verified_on: 2026-04-21

data_type: register
telletidspunkt: "31.12 hvert år; offisielle tall for gjeldende år"
samfunnspuls_transformation: none
open_questions: >
  Atlas's generalisation goal requires equivalent member/volunteer figures
  from every Tier A NGO, not just Red Cross. Treat this entry as the
  reference case; during framework rollout, check whether Norsk Folkehjelp,
  Kirkens Bymisjon, etc. publish comparable annual figures (typically
  embedded in their årsrapport PDFs).

first_year: "[TBD — verify during upstream check]"
latest_year: "[TBD — verify during upstream check]"
cadence: "[TBD — verify during upstream check]"
finest_granularity: "[TBD — verify during upstream check]"
granularities_available: "[TBD — verify during upstream check]"
code_scheme: "[TBD — verify during upstream check]"
coverage: "[TBD — verify during upstream check]"
unit: "[TBD — verify during upstream check]"
reference_population: "[TBD — verify during upstream check]"
protocol: "[TBD — verify during upstream check]"
example_query: "[TBD — verify during upstream check]"
response_format: "[TBD — verify during upstream check]"
licence: "[TBD — verify during upstream check]"
citation: "[TBD — verify during upstream check]"
```
