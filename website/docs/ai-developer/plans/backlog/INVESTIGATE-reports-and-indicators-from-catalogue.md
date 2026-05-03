# Investigate: Reports & indicators we can build from the 31-source catalogue

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Survey the 31 sources Atlas now ingests, identify the **reports and composite indicators** they enable end-to-end (catalogue → ingest → mart → frontend), and document the **conformed dimensions, crosswalks, and reference seeds** that have to land in dbt before those indicators become queryable. Output: a sequenced list of indicator-PLAN candidates the user can pick from, plus a clean inventory of the dimensional plumbing each one depends on.

**Last Updated**: 2026-05-03

**Origin**: Atlas's catalogue grew from 21 to 31 sources between 2026-04-30 and 2026-05-03 (PLAN-007 phase 2 + the FHI onboarding wave). Seven new FHI sources extended Atlas from a Samfunnspuls-replication scope into broader public-health-statistics coverage — population projection, immigrant-background mix, youth wellbeing (Ungdata), primary-care contacts (KPR), and 5-year suicide. The user asked: *"create an investigate file on the potential reports and stats we can create based on the data we have gathered. what relations we need to make them happen."* This document is the answer — it does not implement anything; it scopes the surface so a follow-up `PLAN-*` can land each indicator under PLAN-007's catalogue + frontend.

---

## The 31-source catalogue at a glance

Tagged by `topic` (Atlas-domain), with `eu_theme` (DCAT-AP) and `geo`. All annual unless noted; all kommune-resolved unless noted.

### Demographics (10 sources, eu_theme=SOCI mostly)
| Source | What |
|---|---|
| `ssb-07459` | Population by region × sex × single-year age (1986–2026) |
| `ssb-06083` | Families by family type — single-parent share is a vulnerability proxy |
| `ssb-06913` | Population change — births, deaths, migration (1951–2026) |
| `fhi-befolkning` (338) | FHI population composition (counts) |
| `fhi-befolkningsvekst` (185) | Year-over-year population growth (2002–2024) |
| `fhi-prognose` (171) | Population projection to 2030 / 2040 / 2050 |
| `fhi-innvandrere` (175) | Immigrant background by country (LANDBAK) |
| `fhi-innvkat` (650) | 1st-gen / 2nd-gen / combined immigrant categories |
| `fhi-bor-alene` (187) | Adults living alone (16+, by age band) |

### Income & poverty (4 sources, eu_theme=SOCI)
| Source | What |
|---|---|
| `ssb-08764` | Children under 18 in low-income households (EU/OECD scales) |
| `ssb-06947` | Whole-population low-income (EU/OECD scales) |
| `ssb-12944` | Persistent low-income, 3-year rolling, by age group |
| `ssb-06944` | Household income median by household type |

### Education (4 sources, eu_theme=EDUC)
| Source | What |
|---|---|
| `ssb-09429` | Educational attainment by kommune × sex × level |
| `fhi-vgs-gjennomforing` (360) | Upper-secondary completion rate (3-year cohorts) |
| `fhi-mobbing` (377) | School bullying, 7th + 10th grade (3-year averages) |
| `fhi-trangbodd` (794) | Overcrowded housing by education |

### Youth & mental health (4 sources, eu_theme=HEAL or EDUC)
| Source | What |
|---|---|
| `fhi-neet` (809) | Not in Education, Employment, or Training, by parents' education |
| `fhi-livskvalitet` (373) | Subjective quality of life — Ungdata sample-survey |
| `fhi-depresjon` (339) | Depressive symptoms — Ungdata sample-survey |
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

### 3. Youth Outcomes Report

**Reports**: per-kommune education + employment + wellbeing card for the 15-24 / 16-19 cohorts:
- VGS completion rate (`fhi-vgs-gjennomforing`)
- NEET rate (`fhi-neet`)
- Self-reported quality of life (`fhi-livskvalitet`)
- Self-reported depression symptoms (`fhi-depresjon`)
- School bullying (`fhi-mobbing`, 7th + 10th grade)

**Sources**: 5 indicators above.

**Required relations**:
- `dim_kommune` ✓
- **`crosswalk_alder_band`** — youth-band consensus across FHI tables (15-24 in NEET, 7+10 grades in mobbing, "1_6" Ungdata cohort identifier in livskvalitet/depresjon — these are *not* directly comparable).
- **Methodology decision**: do we treat Ungdata's `1_6` as a youth proxy, or only present it as an index from FHI without claiming a precise age band? The README for `fhi-livskvalitet` already flags this as TODO — confirming with FHI's Ungdata methodology is a precondition.
- **`crosswalk_kjonn`** — combined / male / female across all sources.

### 4. Mental-Health Triangulation

**Reports**: cross-validate self-report vs care-seeking vs mortality, per kommune:
- Self-report (Ungdata): `fhi-livskvalitet` (low score share inverted) + `fhi-depresjon`
- Care-seeking (KPR P-codes): `fhi-kpr-1aar` filtered to `KODEGRUPPE` ∈ {P01_P29, P70_P99}
- Mortality (smoothed): `fhi-selvmord`

**Sources**: 4 above.

**Required relations**:
- `dim_kommune` ✓
- **`ref_icpc2_chapter`** — map ICPC-2 code ranges (P01_P29, etc.) to chapter labels.
- **`dim_period`** — Ungdata is annual, KPR is annual, suicide is 5-year rolling. Join on the most recent overlapping window.
- **Discrepancy detector**: a derived indicator flagging kommuner where self-report ≫ care-seeking (under-treatment) or where suicide rate ≫ self-report (sample bias in Ungdata) — this is the analytically interesting output, not just the four columns side by side.

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

### 10. School-Capacity Forecast

**Reports**: kids 6-15 today vs projected, per kommune. Use case: school construction planning.

**Sources**: `fhi-befolkning` + `fhi-prognose` (filtered to school-age bands).

**Required relations**: same as #6 + `dim_kommune`. Simplest indicator in this list — could ship first as a Phase-3 demonstration.

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

---

## What this investigation does NOT cover

- **Implementation**: each row above becomes its own `PLAN-*` once the user picks one. This file is the menu, not the recipe.
- **Frontend design**: how indicator cards / chart compositions / filter sidebars look on `/data`. That's PLAN-007 phase 4.
- **External integrations**: federated discovery via DCAT-AP-NO, MCP exposure, etc. — separately tracked in `INVESTIGATE-felles-datakatalog-classification.md`, `INVESTIGATE-data-discovery-surface.md`.
- **Single-NGO supply analytics**: covered in PLAN-002 + supply marts; this catalogue augments demand-side tools but doesn't change supply-side modelling.

---

## Cross-references

- [PLAN-007-data-display-open-by-default.md](../active/PLAN-007-data-display-open-by-default.md) — the catalogue + frontend plumbing every report below depends on.
- [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) — separately motivates SDG / ICNPO tagging on the indicator catalogue (could feed `dim_indicator`).
- [INVESTIGATE-felles-datakatalog-classification.md](INVESTIGATE-felles-datakatalog-classification.md) — DCAT-AP / EU-theme classification on the source side; not the indicator side.
- [INVESTIGATE-data-discovery-surface.md](INVESTIGATE-data-discovery-surface.md) — the broader discovery / query / governance surface stack; this file is the per-indicator content layer that feeds it.
- [INVESTIGATE-semantic-foundation-before-expansion.md](INVESTIGATE-semantic-foundation-before-expansion.md) — settled MCP via dbt-mcp + Postgres MCP; many of the relations here will surface there too.
- `atlas-data/dbt/seeds/` — where `dim_kommune`, `dim_fylke`, existing `ref_*` seeds live; new dimensions and crosswalks land alongside.
- `atlas-data/ingest/src/sources/` — the 31 manifest.yml files this investigation surveys.
