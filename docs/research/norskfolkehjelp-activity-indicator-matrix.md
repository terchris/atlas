# Norsk Folkehjelp — activity → indicator matrix

For each of NF's six canonical activities, the open data indicators that signal where the humanitarian need is highest. Pairs with:

- `norskfolkehjelp-activities.md` — the six-bin activity catalogue (scraped from folkehjelp.no)
- `redcross-activity-indicator-matrix.md` — the template this file mirrors
- `data-sources.md` — verified Norwegian sources
- `ngo-landscape.md` — NF's position in the sector and org-structure context

This file is intentionally a **diff** against the Red Cross matrix. Most indicators transfer without adaptation because NF and Red Cross operate in the same humanitarian-beredskap-migration triangle. Where the NF activity is broader (Samfunnsarbeid) or NF-unique (Solidaritetsungdom, Internasjonale spørsmål), the diff is called out explicitly.

Verified 2026-04-19.

---

## How to read this

**Direction**: **↑ need** = higher indicator value means more humanitarian need; **↓ need** = lower value = more need.

**Granularity**: **K** = kommune, **B** = bydel (Oslo/Bergen/Trondheim/Stavanger), **F** = fylke, **N** = national only, **Region** = hazard/forecast region.

Same conventions as `redcross-activity-indicator-matrix.md`.

---

## The common bundle — same as Red Cross

Of the eight pipelines that power ~85% of the Red Cross matrix, **all eight reuse unchanged for NF**. NF's narrower activity taxonomy is a subset, not a superset, of Red Cross's indicator needs.

| Indicator | Source | NF activities served |
|---|---|---|
| Population by age/sex | SSB table 07459 (PxWebApi v2) | Sanitetsungdom, Solidaritetsungdom, Samfunnsarbeid, Flyktning og inkludering |
| Household composition | SSB table 06070 | Samfunnsarbeid |
| Child poverty | Bufdir Barnefattigdom monitor | Samfunnsarbeid (BARK-equivalent slice) |
| Child welfare | Bufdir Barnevern monitor | Samfunnsarbeid |
| Refugee settlement numbers | IMDi bosettingstall | Flyktning og inkludering |
| Folkehelseprofil / Oppvekstprofil | FHI Folkehelsestatistikk OpenAPI | Sanitetsungdom, Samfunnsarbeid |
| Municipal preparedness | DSB Kommuneundersøkelsen | Førstehjelp og redningstjeneste |
| Sentralitetsindeks | SSB Klass 128 | Førstehjelp og redningstjeneste, Samfunnsarbeid |

**Build these eight once, get NF for free on top of Red Cross.** The framework validation this test was designed to produce is positive.

---

## Activity matrix

### Førstehjelp og redningstjeneste (~80 chapters)

First-aid corps + search and rescue. Collapses what Red Cross splits into Hjelpekorps (285) + Beredskapsvakt (156). Same need drivers — structural (risk exposure), not demographic.

| Indicator | Source | Granularity | Direction | Notes |
|---|---|---|---|---|
| ROS-analyse status | DSB Kommuneundersøkelsen 2026 | K, annual | ↑ need where kommune preparedness is weak | Same as RC Hjelpekorps |
| Days/year at warning level ≥3 (snøskred + flom + jordskred) | NVE via `api01.nve.no/hydrology/forecast/…` | Region | ↑ = ↑ need | Spatial-join to kommune |
| Sentralitetsindeks | SSB Klass 128 | K | ↓ = ↑ need | Rural chapters matter more |
| Travel time to nearest hospital | Derived: SSB 07459 + Entur | K | ↑ = ↑ need | |
| Historical farevarsel frequency | MET metalerts archive | Polygon | ↑ = ↑ need | |
| Road-accident density (Ulykkespunkt) | Vegvesen NVDB v4 | K | ↑ = ↑ need | Beredskapsvakt driver |
| Traffic volume (AADT) | Vegvesen Trafikkdata GraphQL | K | ↑ = ↑ road-incident exposure | |
| Tourist overnights | SSB table 08403 | K, monthly | ↑ = ↑ transient population for event beredskap | |
| Skredfaresoner overlap | NVE via Geonorge WMS | K | ↑ = ↑ need | |

Reuse from RC: 100% of Hjelpekorps + Beredskapsvakt indicators.

### Sanitetsungdom (~49 chapters)

Youth first-aid wing. = Red Cross RØFF. Need = youth supply + recruitment-gap indicators.

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Population 13–19 | SSB table 07459 | K + B, annual | ↑ = ↑ supply of potential volunteers |
| Trives på skolen | FHI Oppvekstprofil | K + B, biennial | ↓ = ↑ recruitment opportunity |
| Deltar i organiserte fritidsaktiviteter | FHI Oppvekstprofil | K + B | ↓ = ↑ gap NF can fill |
| Venner i nærmiljøet | FHI (via Ungdata) | K + B | ↓ = ↑ need |
| Idrett membership rate | Bufdir / NIF aggregates | K | ↓ may = ↑ alternative-activity need |

Reuse from RC RØFF: 100%.

### Flyktning og inkludering (~44 chapters)

Refugee and integration work — **collapses** what Red Cross splits into Flyktningguide (60) + Norsktrening (69) + Migrasjon/Asylmottak (119). The union of indicators applies.

| Indicator | Source | Granularity | Direction | Notes |
|---|---|---|---|---|
| Bosettingstall per kommune | IMDi | K, daily updates | ↑ = ↑ need | Primary indicator |
| Innvandrere + norskfødte med innvandrerforeldre | SSB tables 07110 / 07108 | K, annual | ↑ = ↑ long-term demand | |
| Innvandring etter landbakgrunn | SSB table 05183 | K, annual | ↑ = ↑ need | |
| Flyktninger etter statsborgerskap | SSB table 05196 | K, annual | ↑ = ↑ need | |
| Introduksjonsprogrammet deltakere | SSB / IMDi NIR | K, annual | ↑ = ↑ pairing supply | |
| Norskprøve results | HK-dir | K, annual | ↓ pass rate = ↑ practice need | |
| Active UDI asylmottak locations | udi.no/asylmottak/ | Coordinate | Hard constraint for mottak-activities | HTML scrape |
| UNHCR refugee origin data for Norway | api.unhcr.org/population/v1/asylum-applications | Country of origin | Framing layer | International context |

Reuse from RC: 100% (union of Flyktningguide + Norsktrening + Migrasjon indicator sets).

### Samfunnsarbeid (~51 chapters) — the open umbrella

Catch-all for women's networks, diaspora groups, drop-in cafés, språkkafé, leksehjelp, kvinnefellesskap, integration experiments. Because the bin is open-umbrella, the indicator stack is correspondingly wide — pair with chapter-level events or coordinator contact to know what a chapter is actually running.

| Indicator | Source | Granularity | Direction | Corresponds to RC activity |
|---|---|---|---|---|
| Child poverty (EU-60) | Bufdir Barnefattigdom | K + B, annual | ↑ = ↑ need | Leksehjelp, BARK, Ferie for alle |
| Barnevern meldinger/barn | Bufdir Barnevern | K + B | ↑ = ↑ need | BARK, Gatemegling |
| Aleneforsørger-husholdninger | SSB 06070 | K, annual | ↑ = ↑ need | BARK, Ferie for alle |
| Trangbodd bolig | FHI Oppvekstprofil | K + B, biennial | ↑ = ↑ need | Ferie for alle |
| Frafall videregående | FHI Oppvekstprofil | K + B | ↑ = ↑ relevant audience | Treffpunkt, Gatemegling |
| Sosiale tjenester NAV, ungdom | SSB tables 12213 / 12221 | K, annual | ↑ = ↑ need | Treffpunkt |
| Ensom + Psykiske plager | FHI Folkehelseprofil | K + B | ↑ = ↑ need | Besøkstjeneste, Treffpunkt |
| Single-person households 65+ | SSB 06070 | K | ↑ = ↑ need | Besøkstjeneste (rare for NF but possible) |
| Trives i lokalmiljøet | FHI Oppvekstprofil | K + B | ↓ = ↑ need | Treffpunkt |

Reuse from RC: full union of BARK + Leksehjelp + Ferie for alle + Treffpunkt + Besøkstjeneste indicators. **Critical UX implication**: because Samfunnsarbeid is an open umbrella, a chapter listing it tells a user almost nothing concrete. The indicator overlay for this bin should be **conditional** on the chapter's specific event listings (scraped from `localBranchEvents` in sitemap) rather than displayed by default.

### Internasjonale spørsmål (~31 chapters) — international engagement

Chapter-level speaker series, international solidarity projects, mine-action awareness. **No Norwegian kommune-level need indicators apply.** This bin needs a different UX treatment — it's global context, not a local-need map.

| Source | What it brings | Granularity |
|---|---|---|
| UN OCHA HDX / HDX HAPI | Active humanitarian operations globally | Country |
| ACAPS Crisis InSight | Crisis severity scores (~150 crises) | Country |
| ReliefWeb API | Curated humanitarian news and sitreps | Country |
| GDACS | Near-real-time disaster alerts | Polygon |
| UNHCR Refugee Statistics | Global displacement flows | Country |
| Wikidata SPARQL | Countries where NF operates (mine action, dev co-op) | Country |

Reuse from `data-sources-international.md`: 100%. See that file for verified endpoints.

UX suggestion: render this bin as a "global engagement panel" on the chapter page (today's active IFRC appeals, where NF has delegates, mine-action progress per country) rather than as a need-indicator overlay on a Norwegian kommune map.

### Solidaritetsungdom (~18 chapters) — political/solidarity youth

Campaign-oriented youth wing. **No direct need indicator** — this activity is advocacy, not service delivery. Proxies for where political engagement is weak or strong.

| Indicator | Source | Granularity | Direction | Caveat |
|---|---|---|---|---|
| Valgdeltakelse per kommune (stortings + kommune) | valgresultat.no/api/ | K, per election | Mixed — low turnout signals both need and uninterest | |
| Population 16–25 | SSB table 07459 | K + B | Scale-setter | |
| Andel innvandrerungdom per kommune | SSB table 07110 filter | K | ↑ may = ↑ solidarity-theme resonance | Weak signal |

**Indicator matrix is thin here.** The more important framework change for this activity is a **fourth engagement pathway (campaign action / petition)** alongside volunteer / donate / member. This is the same requirement Natur og Ungdom and Amnesty have.

Reuse from RC: near zero — RC has no direct analogue. Gatemegling is the closest (advocacy-adjacent), but it's mediation, not campaigning.

---

## International framing layer

Same tie-ins as the Red Cross matrix, plus direct application via Internasjonale spørsmål:

| Activity cluster | International sources that add value |
|---|---|
| Flyktning og inkludering | UNHCR Refugee Statistics API, IOM DTM + Missing Migrants, Mixed Migration Centre 4Mi |
| Internasjonale spørsmål | IFRC GO API (sister National Society context), ACAPS, ReliefWeb, UCDP/ACLED for conflict context in mine-action countries, Wikidata SPARQL for country-level operation mapping |
| Førstehjelp og redningstjeneste | Carbon Brief attribution tracker, World Weather Attribution, GDACS |
| Sanitetsungdom | Meta-Gallup Global Social Connections, Nordic Health and Welfare Statistics |
| Samfunnsarbeid | UNICEF SDMX API (child indicators in international context) |
| Solidaritetsungdom | V-Dem, Freedom House, Fragile States Index (global democracy/rights context for solidarity-theme education) |

See `data-sources-international.md` for verified endpoints.

---

## Cross-activity patterns and framework fit

1. **Kommunenummer is still the universal pivot.** Same as Red Cross. If chapter → kommunenummer resolves from the lokallag scrape, the eight common-bundle pipelines unlock for NF the same way.
2. **Red Cross and NF share the humanitarian-beredskap-migration triangle.** All indicators applicable to Red Cross Hjelpekorps, Besøkstjeneste (partially), BARK, Leksehjelp, Ferie for alle, Flyktningguide, Norsktrening, RØFF transfer to NF directly.
3. **Solidaritetsungdom needs a fourth pathway**, not a new indicator column. Campaign/petition/action is a pathway, not a need signal.
4. **Internasjonale spørsmål is a different UX mode entirely.** It should not sit in the kommune-need-indicator matrix. Separate global panel.
5. **Samfunnsarbeid indicator overlay must be conditional** on scraped event listings, not displayed by default — the bin is too open to map to a single indicator set.

**Framework-fit conclusion**: ~90% indicator reuse from Red Cross. The ~10% adaptation is two things: (a) add a fourth engagement pathway (campaign action) for Solidaritetsungdom, (b) treat Internasjonale spørsmål as a global-context panel rather than a need-indicator overlay. Both are generalisations the framework needs anyway for Natur og Ungdom, Amnesty, and other Tier A/B advocacy-adjacent orgs.

---

## Caveats and open questions

- **Activity taxonomy much shallower than RC.** NF's 6 bins vs RC's 25+ named activities. Indicator columns per activity are broader — lower discriminating power per filter. Red Cross can tell you "show me chapters running Besøksvenn med hund in Vestfold"; NF cannot.
- **Samfunnsarbeid is lossy.** A user looking for "find my local språkkafé" gets no signal from the lokallag page alone; must drill into chapter events or contact coordinator. Indicator overlay for this bin is broader than it should be.
- **Solidaritetsungdom proxies are weak.** Valgdeltakelse per kommune is the best we have; it's not a great fit. A better signal would be AUF/Rød Ungdom/SU membership density per kommune — not openly published.
- **Chapter-level Regnskapsregisteret data is sparse.** As documented in `norskfolkehjelp-activities.md`, 121 lokallag have own org.nr but most don't file separate accounts (below threshold, all-volunteer, 2 of 121 have registered employees). So per-chapter financial transparency is thin — can't compare chapters by spend the way you could for larger Red Cross chapters with paid coordinators.
- **Internasjonale spørsmål chapter-level signals are invisible.** A chapter lists the bin but not which country/theme they work on. Without that, the international-context panel defaults to whatever NF's central priorities are (mine action, Palestine, Latin America, Ukraine historically) — less chapter-specific.

---

## Missing / hard-to-get

Data we'd want but can't easily obtain:

- **Per-chapter events and meeting schedules.** The NF sitemap has a `localBranchEvents` section that looks promising but wasn't scraped in the activity pass. Would resolve Samfunnsarbeid granularity.
- **Chapter-level membership counts.** NF reports ~16 000 members nationally but does not expose per-chapter numbers publicly.
- **Youth political engagement per kommune.** No open data on AUF/Rød Ungdom/SU membership density.
- **Mine-action per-chapter engagement.** The national mine-action programme lives at sentralt level; which chapters run awareness-raising or fundraising for mine action is not publicly visible.
- **Solidaritetsungdom chapter boundaries vs geographic chapters.** Unresolved from the activity scrape — some cities have both a Solidaritetsungdom Oslo entity and a Norsk Folkehjelp Oslo entity with separate org.nr. Whether members double-count and whether the chapter finder should show them as one or two is a vedtekter question.

---

## Summary

The NF matrix is essentially a **subset** of the Red Cross matrix. No new indicator pipelines needed; the eight-pipeline common bundle serves both orgs. The adaptations are structural:

1. Add a fourth engagement pathway (campaign action) for Solidaritetsungdom.
2. Treat Internasjonale spørsmål as a global-context panel, not a kommune-need overlay.
3. Gate Samfunnsarbeid indicator display on scraped event specificity.

This is the cleanest possible framework-validation result: **NF ports across without expanding the indicator catalogue.** Same eight pipelines, narrower activity taxonomy, additional pathway. Good evidence that the framework generalises to the Tier A humanitarian-cluster.
