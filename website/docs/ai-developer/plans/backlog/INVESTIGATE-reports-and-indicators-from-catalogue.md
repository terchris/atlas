# Investigate: Reports & indicators we can build from the 41-source catalogue

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Survey the 41 sources Atlas now ingests, identify the **reports and composite indicators** they enable end-to-end (catalogue → ingest → mart → frontend), and document the **conformed dimensions, crosswalks, and reference seeds** that have to land in dbt before those indicators become queryable. Output: a sequenced list of indicator-PLAN candidates the user can pick from, plus a clean inventory of the dimensional plumbing each one depends on.

**Last Updated**: 2026-05-04 (onboarded `bufdir-barnefattigdom` — Bufdir Barnefattigdom kommunemonitor API; catalogue is now 41 sources)

**Origin**: Atlas's catalogue grew from 21 to 38 sources between 2026-04-30 and 2026-05-03 (PLAN-007 phase 2 + the FHI onboarding wave). Seventeen new FHI sources extended Atlas from a Samfunnspuls-replication scope into broader public-health-statistics coverage — population projection, immigrant-background mix, youth wellbeing (Ungdata: QoL / depression / painkillers / confiding-friend / alcohol / cannabis / screen-time × 3), primary-care contacts (KPR), and 5-year suicide. The user asked: *"create an investigate file on the potential reports and stats we can create based on the data we have gathered. what relations we need to make them happen."* This document is the answer — it does not implement anything; it scopes the surface so a follow-up `PLAN-*` can land each indicator under PLAN-007's catalogue + frontend.

---

## The 41-source catalogue at a glance

Tagged by `topic` (Atlas-domain), with `eu_theme` (DCAT-AP) and `geo`. All annual unless noted; all kommune-resolved unless noted.

### Demographics (11 sources, eu_theme=SOCI mostly)
| Source | What |
|---|---|
| `ssb-07459` | Population by region × sex × single-year age (1986–2026) |
| `ssb-10826` | Population by bydel/city-total region × sex × single-year age (2001–2026) |
| `ssb-06083` | Families by family type — single-parent share is a vulnerability proxy |
| `ssb-06913` | Population change — births, deaths, migration (1951–2026) |
| `fhi-befolkning` (338) | FHI population composition (counts) |
| `fhi-befolkningsvekst` (185) | Year-over-year population growth (2002–2024) |
| `fhi-prognose` (171) | Population projection to 2030 / 2040 / 2050 |
| `fhi-innvandrere` (175) | Immigrant background by country (LANDBAK) |
| `fhi-innvkat` (650) | 1st-gen / 2nd-gen / combined immigrant categories |
| `fhi-bor-alene` (187) | Adults living alone (16+, by age band) |

### Income & poverty (5 sources, eu_theme=SOCI)
| Source | What |
|---|---|
| `ssb-08764` | Children under 18 in low-income households (EU/OECD scales) |
| `ssb-06947` | Whole-population low-income (EU/OECD scales) |
| `ssb-12944` | Persistent low-income, 3-year rolling, by age group |
| `ssb-06944` | Household income median by household type |
| `bufdir-barnefattigdom` | Bufdir Barnefattigdom kommunemonitor — kommune-level child-poverty indicator family (annual API time series; triangulates with `ssb-08764` on methodology) |

### Education (4 sources, eu_theme=EDUC)
| Source | What |
|---|---|
| `ssb-09429` | Educational attainment by kommune × sex × level |
| `fhi-vgs-gjennomforing` (360) | Upper-secondary completion rate (3-year cohorts) |
| `fhi-mobbing` (377) | School bullying, 7th + 10th grade (3-year averages) |
| `fhi-trangbodd` (794) | Overcrowded housing by education |

### Youth & mental health (11 sources, eu_theme=HEAL or EDUC)
| Source | What |
|---|---|
| `fhi-neet` (809) | Not in Education, Employment, or Training, by parents' education |
| `fhi-livskvalitet` (373) | Subjective quality of life — Ungdata sample-survey |
| `fhi-depresjon` (339) | Depressive symptoms — Ungdata sample-survey |
| `fhi-smertestillende` (390) | At-least-weekly painkiller use — Ungdata sample-survey, marker of chronic pain / psychological distress |
| `fhi-fortrolig-venn` (354) | Has-a-confiding-friend share — Ungdata sample-survey, **protective**-direction social-connectedness indicator |
| `fhi-alkohol` (332) | Alcohol use one or more times — Ungdata sample-survey, risk-direction substance-use indicator |
| `fhi-hasj` (363) | Cannabis use one or more times — Ungdata sample-survey, risk-direction substance-use indicator (heavier suppression than alkohol due to lower prevalence) |
| `fhi-mediebruk-spill` (601) | >3h/day TV+gaming — Ungdata sample-survey, risk-direction screen-time |
| `fhi-mediebruk-some` (602) | >3h/day social-media use — Ungdata sample-survey, **strongest mental-health-outcome correlation** of the three media tables; large sex gap (girls higher) |
| `fhi-mediebruk-underhold` (667) | >3h/day streaming/entertainment — Ungdata sample-survey, weakest mental-health-outcome correlation of the three; included for time-budget completeness |
| `fhi-selvmord` (344) | Suicide deaths, 5-year rolling, smoothed MEIS |

### Welfare & social (3 sources, eu_theme=SOCI)
| Source | What |
|---|---|
| `ssb-12131` | Social-assistance monthly rates set by each kommune |
| `ssb-12132` | Welfare-income rules — what counts as income (kommune policy) |
| `ssb-13995` | Social-assistance cases, payouts, support duration |

### Health-services (2 sources, eu_theme=HEAL)
| Source | What |
|---|---|
| `ssb-12292` | KOSTRA omsorgstjenester — nursing home + home-care indicators |
| `fhi-kpr-1aar` (370) | Primary-care contacts by ICPC-2 code group (P-codes for psych, K for cardio, L for muscle, "Skader" for injuries) |

### NGO supply (3 sources, eu_theme=SOCI)
| Source | What |
|---|---|
| `ssb-12063` | KOSTRA kommunale fritidstilbud + voluntary-association count |
| `redcross-branches` | Red Cross HQ + Distrikt + Lokalforening with per-branch activities |
| `frr` | Frivillig Resource Register (private; per-NGO volunteer roster) |

### Reference (2 sources, eu_theme=GOVE)
| Source | What |
|---|---|
| `ssb-klass-kommuner` | Canonical kommune-code list (Klass 131) |
| `ssb-klass-fylker` | Canonical fylke-code list (Klass 104) |

### Justice / public safety (1 source, eu_theme=JUST)

| Source | What |
|---|---|
| `ssb-crime-tables` | SSB Px bundle 08484–09406 — reported + investigated offences (national series + kommune-by-place-of-offence averages for 08487) |

---

## Reports & composite indicators we can build

Each row below is an *indicator* or *report-page* that the catalogue currently supports. Each names the sources it joins, the conformed dimensions it needs, and the open methodological questions.

### 1. Kommune Demographic Profile (per-kommune card)

**Reports**: total pop now / projected to 2030+2050; year-over-year growth trajectory; age structure (kids share / working-age / elderly); sex ratio; adults-living-alone share; immigrant-background share + 1st-gen/2nd-gen split + country mix; single-parent-family share.

**Sources**: `fhi-befolkning` + `fhi-befolkningsvekst` + `fhi-prognose` + `fhi-bor-alene` + `fhi-innvandrere` + `fhi-innvkat` + `ssb-06083` + `ssb-07459`.

**Required relations**:
- `dim_kommune` (canonical 4-digit code) — exists already in `ssb-klass-kommuner`.
- **`crosswalk_geo_to_kommune`** — handle FHI's mixed-level GEO column (kommune/fylke/bydel/national in one dim).
- **`dim_age_band`** — harmonise SSB's single-year `Alder` with FHI's `min_max` bands. Pick a canonical partition (suggested: 0-5, 6-15, 16-19, 20-29, 30-44, 45-66, 67-79, 80+).
- **`dim_period`** — splice annual observed (`ssb-07459`, `fhi-befolkning`), 3-year rolling growth (`fhi-befolkningsvekst`'s annual series), and projection (`fhi-prognose`).

**Planned additions**:
- `ssb-10826` landed as the bydel-level age/sex denominator for Oslo, Stavanger, Bergen and Trondheim. It doesn't change the kommune-resolved Profile, but it closes the denominator gap for **Report #14 (Bydel-Level City Profile)** as a sister view that turns 4 city-rows into bydel rows.

### 2. Child Welfare / Vulnerability Composite

**Reports**: a per-kommune composite ranking + per-axis breakdown:
- Child low-income share (`ssb-08764` EU60)
- Persistent low-income share (`ssb-12944`, age 0-17 slice)
- Single-parent-family share (`ssb-06083`)
- School bullying rate (`fhi-mobbing`)
- Overcrowded-housing share (`fhi-trangbodd`, age 0-17 slice)

**Sources**: 5 indicators above.

**Required relations**:
- `dim_kommune` ✓
- **`ref_indicator_direction`** — every indicator's "more is worse / better" sign, so a composite z-score has consistent orientation.
- **`crosswalk_alder_band`** — extract the 0-17 slice cleanly from FHI's overlapping bands.
- **Methodology decision**: equal-weight z-score? PCA? Per-domain sub-indices (poverty / housing / school)? This belongs in a separate INVESTIGATE since the choice shapes interpretation.

**Planned additions** (from [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md)):
- `bufdir-barnevern` — adds the formal-intervention axis Atlas currently lacks (the prior research notes barnevern as the canonical kommune-level child-welfare measurement).
- `bufdir-barnefattigdom` — **onboarded** (kommune-level time series from the public monitor API). Still pending for this report: explicit composite wiring + Oslo **bydel** crosswalk alignment (Q3) before the vulnerability card treats Bufdir as a full peer to `ssb-08764` at sub-kommune resolution.
- `husbanken-statistikkbank` — adds the housing-policy-response axis (bostøtte recipients, kommunal bolig stock) to complement Atlas's existing `fhi-trangbodd` *symptom* side.

### 3. Youth Outcomes Report

**Reports**: per-kommune education + employment + wellbeing card for the 15-24 / 16-19 cohorts:
- VGS completion rate (`fhi-vgs-gjennomforing`)
- NEET rate (`fhi-neet`)
- Self-reported quality of life (`fhi-livskvalitet`)
- Self-reported depression symptoms (`fhi-depresjon`)
- At-least-weekly painkiller use (`fhi-smertestillende`)
- Has-a-confiding-friend share (`fhi-fortrolig-venn`) — **protective** direction
- Alcohol use share (`fhi-alkohol`) — risk direction
- Cannabis use share (`fhi-hasj`) — risk direction
- Social-media >3h/day share (`fhi-mediebruk-some`) — risk direction, strongest mental-health correlation; pair with `fhi-mediebruk-spill` (TV+gaming) and `fhi-mediebruk-underhold` (streaming) for full time-budget
- School bullying (`fhi-mobbing`, 7th + 10th grade)

**Sources**: 12 indicators above.

**Required relations**:
- `dim_kommune` ✓
- **`crosswalk_alder_band`** — youth-band consensus across FHI tables (15-24 in NEET, 7+10 grades in mobbing, "1_6" Ungdata cohort identifier in livskvalitet/depresjon — these are *not* directly comparable).
- **Methodology decision**: do we treat Ungdata's `1_6` as a youth proxy, or only present it as an index from FHI without claiming a precise age band? The README for `fhi-livskvalitet` already flags this as TODO — confirming with FHI's Ungdata methodology is a precondition.
- **`crosswalk_kjonn`** — combined / male / female across all sources.

**Planned additions**:
- `udir-elevundersokelsen` — annual, per-school mobbing + støtte hjemmefra (much sharper than FHI's 3-year-rolling 7th + 10th-grade aggregate).
- `udir-fravar` — median absence days/hours for 10th grade + VGS; strong dropout-prediction signal.
- `udir-sluttet-vgs` — annual VGS dropout share; complements `fhi-vgs-gjennomforing`'s 3-year completion measure with the *within-school-year* dropout angle that directorate grants cite specifically.
- `udir-nasjonale-prover` — the only direct learning-outcome signal Atlas would carry.

### 4. Mental-Health Triangulation

**Reports**: cross-validate self-report vs care-seeking vs mortality, per kommune:
- Self-report risk axes (Ungdata): `fhi-livskvalitet` (low score share inverted) + `fhi-depresjon` + `fhi-smertestillende` (frequent painkiller use as a somatised-distress proxy)
- Self-report protective axis (Ungdata): `fhi-fortrolig-venn` — having a close confiding friend is a known protective factor
- Substance-use risk axes (Ungdata): `fhi-alkohol` + `fhi-hasj` — the two are correlated; their *gap* (cannabis high but alcohol low, or vice versa) is itself an interesting cluster signal
- Screen-time risk axes (Ungdata): `fhi-mediebruk-some` (highest mental-health correlation) + `fhi-mediebruk-spill` + `fhi-mediebruk-underhold` (the 3-domain time budget)
- Care-seeking (KPR P-codes): `fhi-kpr-1aar` filtered to `KODEGRUPPE` ∈ {P01_P29, P70_P99}
- Mortality (smoothed): `fhi-selvmord`

**Sources**: 11 above.

**Required relations**:
- `dim_kommune` ✓
- **`ref_icpc2_chapter`** — map ICPC-2 code ranges (P01_P29, etc.) to chapter labels.
- **`dim_period`** — Ungdata is annual, KPR is annual, suicide is 5-year rolling. Join on the most recent overlapping window.
- **Discrepancy detector**: a derived indicator flagging kommuner where self-report ≫ care-seeking (under-treatment) or where suicide rate ≫ self-report (sample bias in Ungdata) — this is the analytically interesting output, not just the four columns side by side.

**Planned additions**:
- `nav-uforetrygd` + `nav-aap` — registry-side care-claiming counterparts to FHI's KPR (which catches contacts) and Ungdata (which catches self-report). Together they let the discrepancy detector triangulate self-report ↔ contact ↔ welfare-claim ↔ mortality on a single canvas.
- `helfo-fastlege` — *access* axis (do GPs even exist in this kommune?) distinct from *use* (KPR contact rates) and *outcome* (suicide). Critical for distinguishing "low contact rate because no doctor" from "low contact rate because no need".

### 5. Income & Welfare Trajectory

**Reports**: per-kommune household-economy story:
- Median household income (`ssb-06944`) and trend
- Low-income share, whole-pop (`ssb-06947`) and child slice (`ssb-08764`)
- Persistent low-income (`ssb-12944`)
- Social-assistance caseload + payouts (`ssb-13995`)
- Kommune's own welfare policy: `ssb-12131` rate-setting + `ssb-12132` income-counting rules

**Sources**: 6 above.

**Required relations**:
- `dim_kommune` ✓ (note: `ssb-12131/12132/12292/13995` use `KOKkommuneregion0000` — a KOSTRA region code that needs mapping to the canonical 4-digit kommune; mostly identical but with KOSTRA-specific aggregates).
- **`crosswalk_kostra_region_to_kommune`** — already partially handled in existing dbt models; verify coverage.
- **`crosswalk_household_type`** — `ssb-06944`'s `HusholdType` codes 0000..0004; not yet a `dim`.

**Planned additions**:
- `husbanken-statistikkbank` — bostøtte recipients, kommunal bolig stock, vanskeligstilte, bostedsløse — the *policy-response* axis Atlas currently has zero coverage on.
- `nav-helt-ledige` — monthly registered unemployment (Samfunnspuls cross-check addition); freshest economic-distress signal at kommune level, complementing annual SSB low-income with much shorter lag.
- ~~`ssb-13006` — average duration on social assistance (Samfunnspuls cross-check addition); pairs with `ssb-13995`'s case-count to distinguish transient from chronic dependency.~~ **Resolved 2026-05-05 — already in Atlas via `ssb-13995`.** SSB consolidated the duration data into `ssb-13995`'s ContentsCode dimension (`KOSsosgjantmnd0000`, `KOSgjsnittvklo0000`, plus per-age-band variants); table `13006` doesn't exist as a separate API endpoint. See [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md) [Q38] for the verification trail.
- `nav-sykefravaer` — quarterly absence rate; the labour-market axis missing from Atlas's current household-economy framing. **Note**: the four NAV families together also stand up the new **Report #15 (Labor-Market Distress Composite)**.

### 6. Population-Forecast Planner View

**Reports**: per-kommune school-cohort, working-age, and elderly trajectories to 2030 / 2040 / 2050. Use case: kommune planners — *"how many primary-school places will we need in 2035? How many home-care recipients?"*

**Sources**: `fhi-befolkning` (observed) + `fhi-befolkningsvekst` (recent trend) + `fhi-prognose` (projected).

**Required relations**:
- `dim_kommune` ✓
- **`dim_period`** that distinguishes observed-AAR vs projected-PROGNOSEAAR — joining requires `fhi-befolkning.AAR ↔ fhi-prognose.PROGNOSEAAR`, **not** `AAR ↔ AAR` (the prognose's AAR is the *base* year). README for `fhi-prognose` documents this; the dbt model has to enforce it.
- **`crosswalk_alder_band`** to get a clean school-age (6-15), working-age (16-66), elderly (67+) partition from the 31 ALDER bands.

### 7. NGO Footprint vs Need

**Reports**: per-kommune coverage map:
- Atlas-tagged need indicators (low-income, NEET, adults-living-alone, mental-health composite)
- vs NGO supply: Red Cross chapters present + their activity mix (`redcross-branches`)
- vs kommune's own count of voluntary associations receiving public support (`ssb-12063`)
- "Coverage gap": kommuner with high need indicators but no Red Cross local chapter (or thin activity mix)

**Sources**: 5+ need indicators + `redcross-branches` + `ssb-12063`.

**Required relations**:
- `dim_kommune` ✓
- **`dim_chapter`** (Red Cross side) — already in PLAN-002 marts.
- **`dim_activity`** + the 50→22 category mapping — already in PLAN-002 marts.
- **Gap definition**: needs an editorial choice — "high need" = top quartile on composite? Bottom decile on `fhi-livskvalitet`? Whatever the choice, it's a `ref_*` decision worth documenting.

**Planned additions**:
- `brreg-frivillighetsregisteret` + `lottstift-tilskudd` — generalises this report from "Røde Kors-only supply" to "all-Norwegian-NGO supply". Frivillighetsregisteret gives every registered NGO with ICNPO category; Lottstift gives every state grant by org number. Together they form the Norwegian NGO sector at organisational + financial resolution. **Sequencing dependency**: blocked by [`INVESTIGATE-tag-indicators-sdg-icnpo.md`](./INVESTIGATE-tag-indicators-sdg-icnpo.md) for the ICNPO crosswalk.

### 8. Integration Outcomes Gradient

**Reports**: do educational and health outcomes vary by immigrant background? Per-fylke (kommune samples too small):
- Educational attainment (`ssb-09429`) by sex
- VGS completion (`fhi-vgs-gjennomforing`) by INNVKAT
- Primary-care psych contacts (`fhi-kpr-1aar`)

**Sources**: 3 above.

**Required relations**:
- `dim_fylke` ✓ (Atlas already handles `is_active` filter to avoid pre-2020-reform doubling — see existing memory).
- **`crosswalk_innvkat`** — `2`/`3`/`23` → 1st-gen / 2nd-gen / combined.
- **`crosswalk_landbak`** — country-of-origin codes (`100` ≈ no immigrant background, etc.) — codes are not human-readable; needs a hand-authored seed against FHI's dimension reference.
- **Sensitivity guidance**: integration-outcome reports are politically sensitive; downstream pages should follow careful presentation conventions (no per-kommune naming-and-shaming; aggregate at fylke level minimum).

**Planned additions** — converts this from a snapshot to a longitudinal pipeline:
- `imdi-bosetting` — refugee resettlement *inflow* (which kommune received how many; quota vs actual). Atlas currently has zero inflow signal.
- `imdi-innvandringsgrunn-kjonn` — *composition* axis (work / refugee + family-reunified / family / education / unknown). Atlas's `fhi-innvkat` only carries 1st-gen / 2nd-gen / combined; the *reason for immigration* axis is what integration research uses universally to distinguish labour-migrant from refugee outcomes.
- `imdi-landbakgrunn` — country-of-origin (faster cycle than FHI's LANDBAK).
- Together with `nav-uforetrygd` / `nav-aap` (long-term economic outcomes) and `fhi-vgs-gjennomforing` (educational outcomes), these complete an inflow → composition → origin → education → economic-outcome longitudinal pipeline.

### 9. Care-Services Capacity vs Population

**Reports**: per-kommune per-capita care capacity:
- Nursing-home + home-care indicators (`ssb-12292` ContentsCode subset)
- Normalised by elderly population share (`fhi-befolkning` + `ssb-07459`)
- Compared with projection: *"capacity per elderly resident in 2030 if today's services hold"*

**Sources**: `ssb-12292` + `fhi-befolkning` + `fhi-prognose`.

**Required relations**:
- `dim_kommune` ✓
- **`crosswalk_alder_band`** — pull elderly slice (67+, 80+) consistently.
- **`crosswalk_kostra_kommune`** — `ssb-12292` uses `KOKkommuneregion0000`.
- **`dim_period`** — for the projection-aware variant, see #6.

**Planned additions**:
- `helfo-fastlege` — primary-care *coverage* layer beneath KOSTRA omsorg's secondary-care view. With monthly cadence (per [Q5] / [Q32] in the new-sources INVESTIGATE), it also moves Report #9 from a once-per-year snapshot to a within-year trend.
- `helsedir-NKI` (Tier-3) — provider-side service-quality complement.

### 10. School-Capacity Forecast

**Reports**: kids 6-15 today vs projected, per kommune. Use case: school construction planning.

**Sources**: `fhi-befolkning` + `fhi-prognose` (filtered to school-age bands).

**Required relations**: same as #6 + `dim_kommune`. Simplest indicator in this list — could ship first as a Phase-3 demonstration.

**Planned additions**:
- `udir-gsi` — adds the *supply* side (current school count + enrolment) to complement the *demand* side (FHI projection of the school-age population). Also unlocks the new **Report #16 (School-System Effectiveness)** as a per-school view of the same school inventory.

---

## Forward-looking: reports unlocked by planned new sources

The 10 reports above are what Atlas's *current* **41** sources support. The companion investigation [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md) (2026-05-04) still proposes additional sources across Bufdir, NAV, Husbanken, Udir, IMDi, Helfo, DSB, Brreg Frivillighetsregisteret + Lottstift — and a Samfunnspuls cross-check that surfaced four additional Tier-1 source families. **Tier-2 crime tables** from that file are now onboarded as **`ssb-crime-tables`**; Report #11 gains real data (kommune slice from 08487 in `fact_kommune_indicators`, national slices via the companion indicator models). The `ssb-13006` candidate from earlier in this file was resolved 2026-05-05 as a phantom — its data is already in Atlas's `ssb-13995` ingest. Each report below remains a **new analytical surface** beyond the base 10 whenever it still needs editorial or modelling work; updates are noted inline.

The maintenance ritual at the bottom of this file says a new report is justified only when a source "brings a genuinely new analytical axis (categories the current 10 don't cover)". Six new reports below clear that bar — three for new themes (JUST, GOVE, HEAL provider-side), two for new geographic resolutions (bydel, per-school), and one for a domain (labor-market vulnerability) that was lurking inside Report #5 but deserves its own scope once NAV's four indicator families land.

### 11. Crime / Public-Safety Profile

**Reports**: per-kommune registered-offence statistics (two-year averages by place of offence) + national administrative series for investigation outcomes. First-ever JUST-themed Atlas source family.

**Sources**: **`ssb-crime-tables`** ingests Px **08484** (national reported offences by offence type), **08487** (reported offences by *gjerningssted* — kommune and higher aggregates; two-year averages), **09405** (investigated offences × police disposition, national), **09406** (investigated counts + clearance percentage, national). The **kommune slice** (08487-derived rows with a 4-digit kommune code) is included in `fact_kommune_indicators`; national Px tables are exposed as `indicators__ssb_08484`, `indicators__ssb_09405`, and `indicators__ssb_09406` pending a dedicated national fact pattern.

**Pairs naturally with**: `fhi-mobbing` (school violence), `fhi-alkohol` + `fhi-hasj` (substance use), `fhi-neet` (youth disengagement), `ssb-13995` (welfare receipt as economic-distress correlate).

**Required relations**:
- `dim_kommune` ✓
- `dim_age_band` (shared with Reports 1-4, 6, 7, 9, 10)
- `dim_kjonn` (shared)
- **`crosswalk_lovbrudd_type`** *(new)* — SSB's lovbrudd-type taxonomy → Atlas display labels. Hand-authored seed against SSB's classification.

**Open questions**:
- Customer-facing language for "anmeldte lovbrudd" — foreground "registered offences" / "victimisation" framing, not headline crime ranking. Same `presentation_policy: 'sensitive'` flag as Report #8.
- Suppression: SSB's small-kommune × type intersections hit "0 or 1" → `..` pattern. Atlas's existing SSB ingest already handles this.

### 12. Preparedness & Resilience

**Reports**: per-kommune ROS-analyse status × NGO emergency-response supply. First-ever GOVE-themed Atlas report. Use case: *the* report Røde Kors's Hjelpekorps and Beredskapsvakt divisions actually need — "is this kommune prepared, and is the NGO presence sufficient to backstop?"

**Sources**: `dsb-kommuneundersokelsen` (planned via Tier-2 #8) + `redcross-branches` (existing — filtered to Hjelpekorps + Beredskapsvakt activities) + later `ssb-12063` for the broader voluntary-association count. Could extend with NVE skred/flom hazard layers + MET farevarsler statistics in a v2.

**Required relations**:
- `dim_kommune` ✓
- **`ref_preparedness_axis`** *(new)* — DSB Kommuneundersøkelsen's question schema typically has 6-8 thematic axes (ROS-analyse, øvelsesfrekvens, kompetanse, samordning, etc.). Hand-authored seed.
- **`crosswalk_redcross_activity_to_beredskap`** — filter for activity-codes that count as emergency-response. Already partially in `redcross-activities` mart.

**Open questions**:
- DSB response rate is uneven; capture `is_response` to distinguish "low score" from "no submission".
- Composite-or-two-columns? "Is this kommune prepared" (DSB self-report) and "is NGO supply adequate" (Atlas chapter data) measure different things — surface as a 2D scatter rather than a single composite ranking.

### 13. Primary-Care Access

**Reports**: per-kommune GP coverage (% of population on a fastlegeliste), share of "lister uten fast lege", monthly trend. Pairs with `fhi-kpr-1aar` care-contact rates (which Atlas has) to distinguish *access* from *use*.

**Sources**: `helfo-fastlege` (planned via Tier-2 #7) + `fhi-kpr-1aar` (existing) + later `helsedir-NKI` (Tier-3) for service-quality complement. Provider-side counterpart to Report #4 (Mental-Health Triangulation) and a refinement of Report #9 (Care-Services Capacity) at the *primary*-care layer.

**Required relations**:
- `dim_kommune` ✓
- `dim_period` with monthly support (per [Q5] / [Q32] in the new-sources INVESTIGATE — Helfo Fastlege is monthly).

**Open questions**:
- "Lister uten fast lege" vs "ubesatt liste" — pin Helfo's own definitions in the manifest.
- Whether to surface this as its own report or fold as an axis inside Report #4 + Report #9. Recommendation: own report, because the *access* dimension (do GPs even exist?) is qualitatively different from *quality* or *use*.

### 14. Bydel-Level City Profile

**Reports**: per-bydel demographic profile + per-capita normalisation of every existing bydel-resolved indicator, for Norway's four bydel-organised cities (Oslo 17 bydeler, Stavanger 9, Bergen 8, Trondheim 4). Demonstrates intra-city inequality — the gap between best-off and worst-off bydel within a city is often *larger* than the gap between rural kommuner.

**Sources**: `ssb-10826` (bydel-level age/sex population denominator — onboarded from the Samfunnspuls cross-check, [Q48] in the new-sources INVESTIGATE) + Atlas's existing bydel-resolved FHI sources (FHI's `GEO` column already carries 6-digit bydel codes) + `bufdir-barnefattigdom` (kommune series live; **Oslo bydel rows** still need a confirmed Klass/crosswalk before this report can join Bufdir at bydel resolution — see Q3 in the new-sources INVESTIGATE).

**Required relations**:
- **`dim_bydel`** *(new)* — Klass 103 (Standard for bydelsinndeling). 38 active bydeler across 4 cities + historical entries; respect SSB's `(2001-2003)` / `(-2019)` annotations to avoid pre-reform double-counting (same pattern as `dim_kommune`'s `is_active` filter).
- **`crosswalk_bydel_to_kommune`** *(new)* — first 4 digits of bydel-code = kommune-code; trivial. Needed so Atlas's existing kommune-keyed marts can join bydel rows under the parent kommune.
- `crosswalk_geo_to_kommune` — FHI's mixed-level GEO column already handles bydel for read; this report formalises the bydel slot as first-class.
- `dim_age_band` (shared).

**Open questions**:
- **Coverage scope** — bydel-resolved data only exists for the 4 biggest cities. The frontend needs to handle "this report applies to {Oslo, Stavanger, Bergen, Trondheim}" as a first-class scope, not as an exception.
- **Klass 103 versioning** — Oslo's bydeler restructured 2003, Bergen 2019, Stavanger added Finnøy + Rennesøy 2020. Pin the active-bydel filter year per refresh.
- **Why this matters strategically** — Atlas's current 10 reports are kommune-resolved and Norway has 357 kommuner with most populated kommuner being big cities. A bydel layer turns the 4 largest cities (~2.1M people, ~38% of national population) from 4 kommune-rows into 38 bydel-rows, dramatically lifting analytical resolution where most users actually live.

### 15. Labor-Market Distress Composite

**Reports**: per-kommune labor-market vulnerability composite covering acute (helt ledige) + transitional (AAP / sykefravær) + long-tail (uføretrygd). Per-axis breakdowns, plus a unified "labor-market stress" score. Connects to but is distinct from Report #5 (which frames the household-economy story).

**Sources**: `nav-helt-ledige` + `nav-aap` + `nav-sykefravaer` + `nav-uforetrygd` — all four NAV families planned via Tier-1 #2 in the new-sources INVESTIGATE. Could extend with `ssb-06947` (low-income, existing) and the NAV `pam-stilling-feed` (vacancies, deferred).

**Required relations**:
- `dim_kommune` ✓
- `dim_period` — must handle monthly cadence properly per [Q5] / [Q32]. NAV publishes uføretrygd / AAP monthly; sykefravær quarterly.
- `dim_age_band` — useful for the youth-NEET axis (Report #3 cross-link).
- **`ref_indicator_direction`** — all four NAV indicators are risk-direction (more = worse); document for composite z-score.

**Open questions**:
- **Composite-vs-per-axis** (same as Reports #2, #4, #7). Recommendation: per-axis pages first, composite later in a methodology-explicit follow-up.
- **NAV-internal kommune groupings** — verify per indicator (NAV-region or NAV-kontor catchment is sometimes substituted for canonical kommune).
- **Sensitivity** — per-kommune uføretrygd shares in small kommuner are politically charged. `presentation_policy: 'sensitive'` per [Q35] in the new-sources INVESTIGATE.

### 16. School-System Effectiveness (per-school)

**Reports**: per-school view combining capacity (GSI enrolment + pupil-teacher ratio) + engagement (median absence) + climate (Elevundersøkelsen mobbing + støtte hjemmefra) + outcomes (Nasjonale prøver + VGS dropout). Aggregates to kommune. First per-school (sub-kommune) Atlas report.

**Sources**: `udir-gsi` + `udir-fravar` + `udir-elevundersokelsen` + `udir-nasjonale-prover` + `udir-sluttet-vgs` (all planned via Tier-1 #4 + Samfunnspuls cross-check additions in the new-sources INVESTIGATE).

**Required relations**:
- **`dim_school`** *(new)* — first-class school dimension keyed by school org number. Per [Q33] in the new-sources INVESTIGATE: dim_school becomes catalogue-level, not source-mart-local.
- **`crosswalk_school_to_kommune`** *(new)* — registered kommune for v1, catchment is a separate methodology decision per [Q10] in the new-sources INVESTIGATE.
- `dim_period` — annual.

**Open questions**:
- **Resolution choice** — ingest at school level (preferred) and let the mart aggregate to kommune, vs aggregate at staging. Recommendation: school-level raw, mart-aggregated downstream.
- **Small-cell suppression** — school-level Elevundersøkelsen suppresses items with <5 respondents. Respect verbatim ([Q11] in new-sources INVESTIGATE); no re-derivation across years.
- **School-identifier stability** — Norwegian school org numbers occasionally change at mergers. Need a `crosswalk_historical_school` to link successor + predecessor numbers.
- **Why this matters strategically** — same logic as Report #14: Atlas's kommune-resolved school summaries hide intra-kommune variation between rich-area schools and poor-area schools that's often larger than between-kommune variation.

---

## Conformed dimensions Atlas needs

Below are the dbt-side artefacts each set of indicators depends on. Many partly exist; a few are missing entirely.

| Dimension | Status | Used by | Notes |
|---|---|---|---|
| `dim_kommune` | ✓ exists (PLAN-002 / dim_kommune) | All | Already filtered to `is_active` to avoid pre-2020-reform row multiplication (per memory). |
| `dim_fylke` | ✓ exists | Reports 1, 8 | |
| `dim_period` | partial | All time-series | Today individual marts handle their own periodicity (`P1Y` / `P3M` / `5Y rolling`). Atlas needs a canonical period dim that maps each to a comparable axis (e.g. `period_start_year`, `period_kind` ∈ {annual, rolling-3, rolling-5}, `is_projection`). |
| `dim_age_band` | **missing** | Reports 1-4, 6, 7, 9, 10 | The biggest gap. SSB single-year ages, SSB binned bands, FHI overlapping `min_max` bands, Ungdata `1_6` cohort identifier — none harmonised. Pick a canonical 8-band partition and map every source's bands to it. |
| `dim_kjonn` | trivial | Reports 1, 3, 4, 8 | Three rows — `0`/`1`/`2` to `all`/`male`/`female`. One-line seed. |
| `dim_household_type` | **missing** | Report 5 | `ssb-06944.HusholdType` codes 0000..0004 — needs labels. Already partially in `ref_ssb_household_type` seed. |
| `dim_indicator` | partial | Composites (Reports 2, 7) | An indicator-catalogue table: id, label, source, direction (+1/-1), unit, suppression-policy. Atlas already has scattered per-source indicator views; consolidating them gives Phase-4 frontend a uniform schema for indicator cards. |
| `dim_bydel` | **needed** for Report 14 | Report 14 | Klass 103 bydel codes for Oslo, Stavanger, Bergen and Trondheim. Filter to active bydeler per year (Oslo restructure 2003, Bergen 2019). `ssb-10826` now supplies bydel population facts; the conformed dimension remains to land. |
| `dim_school` | **needed** for Report 16 | Report 16 | School org number as PK. Lands with `udir-gsi` ingest per [Q33] in [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md) — first-class catalogue dimension. |

## Crosswalks Atlas needs

| Crosswalk | Status | Used by | Notes |
|---|---|---|---|
| `crosswalk_geo_to_kommune` | partial | All FHI sources | Maps FHI's mixed-level `GEO` column to canonical kommune / fylke / bydel slots. The complication: `0` = national, 2-digit = fylke, 4-digit = kommune, 6-digit = bydel. Existing dbt views likely handle this implicitly; making it a named crosswalk simplifies new sources. |
| `crosswalk_kostra_region_to_kommune` | partial | Reports 5, 9 | Maps `KOKkommuneregion0000` to standard kommune. |
| `crosswalk_alder_band` | **missing** | Reports 1-4, 6, 7, 9, 10 | The big new one. Source bands → canonical 8-band partition. Some bands map cleanly; some require splitting/aggregating. |
| `crosswalk_innvkat` | **missing** | Report 8 | `2` / `3` / `23` → 1st-gen / 2nd-gen / combined. 3-row seed. |
| `crosswalk_landbak` | **missing** | Reports 1, 8 | FHI's 8 country-background codes. Hand-authored against FHI's dimension reference. |
| `crosswalk_icpc2_chapter` | **missing** | Reports 4, 9 | ICPC-2 code-range identifier → chapter / topic. Hand-authored; ~10 entries given the table's KODEGRUPPE values. |
| `crosswalk_aldersrelasjon_ungdata` | **missing** | Reports 3, 4 | Maps Ungdata's `ALDER="1_6"` cohort identifier to a meaningful age band — only after methodology verification with FHI. |
| `crosswalk_bydel_to_kommune` | partial | Report 14 | `ssb-10826` derives parent `kommune_nr` from the first four digits of bydel-like Region codes in its source mart. A reusable named crosswalk still needs to land for cross-source joins. |
| `crosswalk_school_to_kommune` | **needed** for Reports 10, 16 | Reports 10, 16 | School org number → registered kommune (per [Q10] in `INVESTIGATE-new-norwegian-public-sources`). v2 may add catchment-vs-registered methodology. |
| `crosswalk_lovbrudd_type` | **needed** for Report 11 | Report 11 | SSB lovbrudd-type codes → Atlas display labels. Hand-authored seed against SSB classification. |
| `crosswalk_kostra_region_kostragroup` | **needed** for Reports 5, 9, 11 | Reports 5, 9, 11 | KOSTRA-group codes (EKG01-EKG17 visible in `ssb-13138` metadata). Useful for stratified comparisons (small-rural vs big-city kommuner). |
| `crosswalk_imdi_innvandringsgrunn` | **needed** for Report 8 | Report 8 | Work / refugee+family-reunified / family / education / unknown — IMDi's 5-category schema. Lands with `imdi-innvandringsgrunn-kjonn`. |

## Reference seeds we'd add

| Seed | What | Cost |
|---|---|---|
| `ref_eu_data_theme` | ✓ already in PLAN-007 phase 2.10 | 0 |
| `ref_age_band` | Canonical 8 bands with min/max + label | small (~8 rows) |
| `ref_indicator_direction` | Per-indicator +1 / -1 sign | small (one row per indicator we surface; ~30-40 indicators eventually) |
| `ref_icpc2_chapter` | ICPC-2 chapter lookup | small (~17 chapters) |
| `ref_landbak` | FHI LANDBAK codes | small (8 rows + verified labels) |
| `ref_innvkat` | FHI INNVKAT codes | trivial (3 rows) |
| `ref_kjonn` | Sex codes | trivial (3 rows) |
| `ref_bydel` | Klass 103 bydel labels (Oslo/Stavanger/Bergen/Trondheim) — needed for Report 14 | small (~38 active rows + historical) |
| `ref_lovbrudd_type` | SSB crime-type taxonomy — needed for Report 11 | small (~12 main types) |
| `ref_preparedness_axis` | DSB Kommuneundersøkelsen question themes — needed for Report 12 | trivial (~6-8 axes) |
| `ref_imdi_innvandringsgrunn` | IMDi 5-category immigration-reason codes — needed for Report 8/17 | trivial (5 rows) |
| `ref_nav_indicator_family` | NAV's helt-ledige / AAP / sykefravær / uføretrygd as a coherent labour-market family — needed for Report 15 | trivial (4 rows + direction sign) |

---

## Open questions for decision

1. **Composite-index methodology**. Reports 2, 4, 7 all involve combining multiple indicators into a single ranking or score. Equal-weight z-score is the default; PCA gives data-driven weights but obscures interpretation. **Recommendation**: ship per-axis pages first (no composite); add composites in a second-wave INVESTIGATE that explicitly chooses methodology with stakeholders.

2. **Suppression handling.** FHI suppresses small counts (NULL `value`). Reports 4 (mental-health triangulation), 8 (integration), 7 (NGO gap) will hit suppression at fine kommune × subgroup slices. Two options: (a) propagate NULL — incomplete cards; (b) fall back to fylke aggregate — less granular but complete. **Recommendation**: per-indicator policy in `ref_indicator_direction` with a `fallback_geo_level` column.

3. **Smoothing default**. FHI publishes both raw `RATE` and smoothed `MEIS` for small-area indicators (suicide, primary-care contacts). Atlas already chose MEIS for `fhi-selvmord` and RATE for `fhi-kpr-1aar`. Should there be a global "use smoothed where the source provides it" preference? **Recommendation**: yes, default to smoothed; document the choice in `dim_indicator`.

4. **Period harmonisation**. Annual + 3-year rolling + 5-year rolling sources have different time semantics. Joining them naively produces wrong answers (e.g. averaging an annual rate against a 5-year rate). **Recommendation**: a `dim_period` with a `period_kind` discriminator that downstream marts must respect; the frontend exposes this in indicator metadata.

5. **Sample-source caveat ("Ungdata is not a census")**. `fhi-livskvalitet` and `fhi-depresjon` are sample-survey aggregations. They're not directly comparable to enumeration-based sources like `fhi-befolkning`. **Recommendation**: tag indicators with `data_quality_kind` ∈ {`enumeration`, `register`, `sample`, `projection`} so the frontend can render appropriate caveats.

6. **Suicide-publication policy**. `fhi-selvmord`'s README notes that downstream consumers should follow FHI's *veileder for omtale av selvmord*. **Recommendation**: tag the indicator with `presentation_policy: 'sensitive'` and have the frontend surface a banner / policy-link on those pages.

7. **NGO-gap definition**. Report 7 needs an editorial choice on what "high need" means. **Recommendation**: settle this with NGO partners (e.g. Røde Kors, Folkehjelp) — it's a sector-knowledge call, not a data-modelling call.

---

## Sequencing recommendation

The smallest indicator that demonstrates the catalogue in `/data` end-to-end is **#10 School-Capacity Forecast** — two sources, one period join, one age-band crosswalk. Ship it first as the Phase-3 / Phase-4 demonstrator, then layer:

1. **#10 School-Capacity Forecast** — proves the period/age-band plumbing.
2. **#1 Kommune Demographic Profile** — adds the immigrant-background slice + bor-alene; proves the multi-dim FHI joins.
3. **#3 Youth Outcomes** — first cross-topic (education + health) report; uses Ungdata sources, exposes the sample-vs-enumeration caveat.
4. **#5 Income & Welfare Trajectory** — first SSB-only report; tests the KOSTRA-region crosswalk.
5. **#9 Care-Services Capacity vs Population** — first projection-aware report.
6. **#4 Mental-Health Triangulation** — first cross-validation report; exposes discrepancy as the interesting signal.
7. **#7 NGO Footprint vs Need** — last because it depends on most of #1-#5 and adds the NGO-side joins.

Reports 2, 6, 8 are higher-leverage but each opens a methodology question that benefits from earlier reports' learnings.

**Forward-looking reports (#11–16)** plug in once the corresponding planned sources land per the [new-sources INVESTIGATE](./INVESTIGATE-new-norwegian-public-sources.md) sequencing. Suggested layering on top of #1–#10:

8. **#10 → #16** — once `udir-gsi` lands for Report #10, the per-school resolution it pioneers (`dim_school`) makes Report #16 (School-System Effectiveness) the cheapest follow-up: same source family, same dim, more axes.
9. **#1 → #14** — with `ssb-10826` landed, Report #14 (Bydel-Level City Profile) is the cheapest big-impact addition once the conformed `dim_bydel` / reusable bydel crosswalk work lands.
10. **#5 → #15** — once the four NAV families land for Report #5's expansion, Report #15 (Labor-Market Distress Composite) folds them into a coherent labour-market story (with the same composite-vs-per-axis question as Reports #2, #4).
11. **#11 Crime / Public Safety** — SSB Px bundle **`ssb-crime-tables`** is ingested (`08484`, `08487`, `09405`, `09406`). **Product work** remaining: tighten customer-facing wording (Q18), optional `crosswalk_lovbrudd_type`, and richer joins with FHI survey registers already in Report #4/#3.
12. **#13 Primary-Care Access** — once `helfo-fastlege` lands, separates *access* from *use* in the mental-health and care-services stack.
13. **#12 Preparedness & Resilience** — last in the new-report wave because it depends on `dsb-kommuneundersokelsen` AND on the NGO-side activity filter. The most operationally useful report for Hjelpekorps / Beredskap stakeholders.

---

## What this investigation does NOT cover

- **Implementation**: each row above becomes its own `PLAN-*` once the user picks one. This file is the menu, not the recipe.
- **Frontend design**: how indicator cards / chart compositions / filter sidebars look on `/data`. That's PLAN-007 phase 4.
- **External integrations**: federated discovery via DCAT-AP-NO, MCP exposure, etc. — separately tracked in `INVESTIGATE-felles-datakatalog-classification.md`, `INVESTIGATE-data-discovery-surface.md`.
- **Single-NGO supply analytics**: covered in PLAN-002 + supply marts; this catalogue augments demand-side tools but doesn't change supply-side modelling.

---

## Maintenance — keep this current as new sources land

This document is the menu of reports the catalogue *currently supports*. When a new ingest source lands (the user pastes an FHI / SSB / etc. URL and we onboard it), this file MUST be refreshed in the same commit.

**Per-new-source checklist:**

1. **Update the source count** in the title, the `Goal` paragraph, the `Origin` paragraph, the `## The N-source catalogue at a glance` heading, and the `Cross-references` line that names `atlas-data/ingest/src/sources/` count.
2. **Slot the new source into the right thematic cluster** under "The catalogue at a glance" — Demographics / Income / Education / Youth & mental health / Welfare / Health-services / NGO supply / Reference. Bump the cluster's source count in the heading.
3. **Walk the 10 reports** and identify which gain a new column. Common patterns:
   - A new Ungdata-shaped source slots into Report 3 (Youth Outcomes) and Report 4 (Mental-Health Triangulation).
   - A new income / welfare source slots into Report 5.
   - A new demographic source slots into Reports 1 + 6 + 9 + 10.
   - A new health-services source slots into Reports 4 + 9.
4. **Consider whether the new source enables a brand-new report** (an 11th, 12th…) — only when the source brings a genuinely new analytical axis (e.g. environmental data, transport flows, crime statistics — categories the current 10 don't cover). Add the new report with the same shape: short reports paragraph, source list, required relations, methodology question. Update the sequencing recommendation to slot it in.
5. **Note any new dimension or crosswalk** the source introduces (e.g. new FHI dimension code like `KODEGRUPPE`, `INNVKAT`, `LANDBAK`) in the "Conformed dimensions Atlas needs" / "Crosswalks Atlas needs" tables.
6. **Update `Last Updated`** at the top.

The contributor guide ([`website/docs/contributors/ingest-modules.md`](../../../contributors/ingest-modules.md)) references this maintenance ritual in its adding-a-source workflow — don't ship a new source without doing the walk-through above.

---

## Cross-references

- [PLAN-007-data-display-open-by-default.md](../active/PLAN-007-data-display-open-by-default.md) — the catalogue + frontend plumbing every report below depends on.
- [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md) — the catalogue of planned new sources that unlock Reports #11–#16 and the inline "Planned additions" notes on Reports #1–#10. Updates to that file should trigger updates here.
- [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) — separately motivates SDG / ICNPO tagging on the indicator catalogue (could feed `dim_indicator`).
- [INVESTIGATE-felles-datakatalog-classification.md](INVESTIGATE-felles-datakatalog-classification.md) — DCAT-AP / EU-theme classification on the source side; not the indicator side.
- [INVESTIGATE-data-discovery-surface.md](INVESTIGATE-data-discovery-surface.md) — the broader discovery / query / governance surface stack; this file is the per-indicator content layer that feeds it.
- [INVESTIGATE-semantic-foundation-before-expansion.md](INVESTIGATE-semantic-foundation-before-expansion.md) — settled MCP via dbt-mcp + Postgres MCP; many of the relations here will surface there too.
- `atlas-data/dbt/seeds/` — where `dim_kommune`, `dim_fylke`, existing `ref_*` seeds live; new dimensions and crosswalks land alongside.
- `atlas-data/ingest/src/sources/` — the 41 manifest.yml files this investigation surveys.
