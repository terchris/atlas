# Nasjonalforeningen for folkehelsen — activity → indicator matrix

For Nasjonalforeningen's chapter network and programmes, the open data indicators that signal where the need is highest. Pairs with:

- `nasjonalforeningen-activities.md` — the chapter catalogue (scraped from nasjonalforeningen.no)
- `redcross-activity-indicator-matrix.md` — the original template
- `norskfolkehjelp-activity-indicator-matrix.md` — peer adaptation (strict subset)
- `sanitetskvinnene-activity-indicator-matrix.md` — peer adaptation (first genuine extension)
- `data-sources.md` — verified Norwegian sources
- `ngo-landscape.md` — Nasjonalforeningen structural-fit context

**This is the fourth org tested and the second that genuinely extends the framework.** The extension here is very different from N.K.S.:

1. **`chapter_type` as a first-class enum** — helselag (291) vs demensforening (173) vs combined (3) vs edge (~6). Unlike N.K.S.'s institutions (a sub-array), this is a flat required field on every chapter, name-encoded, no derivation needed.
2. **Disease-specific indicator pipelines** — FHI Hjerte- og karregisteret + derived dementia prevalence + cardiovascular risk factors.
3. **Age-stratified demographic base** — both diseases skew elderly, so 65+/75+/85+ slices of SSB 07459 are foundational, not incidental.
4. **Activity mapping at programme level, not per chapter** — Nasjonalforeningen lokallag lack per-chapter CMS activity tagging (each chapter's web presence is essentially its Facebook page). The indicator overlay works at the national-programme level (Hjertegruppa, Aktivitetsvenn, Demenskoor) crossed with chapter_type, not at a chapter-activity-matrix level.

Framework-fit: ~55% direct reuse + ~35% new extensions + ~10% activity-adaptation. **Lowest reuse of the four orgs so far**, but the pattern is instructive — see closing summary.

Verified 2026-04-19.

---

## How to read this

Same conventions as the RC, NF-folkehjelp, and N.K.S. matrices.

**New scoping dimension**: every indicator is optionally scoped by `chapter_type`. A helselag chapter in Bergen should see hjerte-indicators; a demensforening chapter in the same kommune should see demens-indicators; a combined chapter sees both.

---

## The common bundle — mostly N/A here

Of the eight common-bundle pipelines from the RC matrix, **only three reuse directly** for Nasjonalforeningen. Five don't apply because Nasjonalforeningen has no beredskap line, no migrasjon line, and only thin youth engagement.

| Indicator | Reuses? | Why or why not |
|---|---|---|
| Population by age/sex (SSB 07459) | **Yes — with 65+/75+/85+ emphasis** | Primary driver; both diseases skew elderly |
| Household composition incl. single-person 65+ (SSB 06070) | **Yes** | Loneliness-adjacent activities (Aktivitetsvenn, Demenskafé) |
| Sentralitetsindeks (SSB Klass 128) | **Yes** | Rural chapter reachability for physical groups |
| Bufdir Barnefattigdom | Weak reuse (thin youth engagement) | Only for "Tiltak for barn og unge" — marginal footprint |
| Bufdir Barnevern | Does not apply | No child-welfare line |
| IMDi bosettingstall | Does not apply | No migrasjon line |
| FHI Folkehelseprofil / Oppvekstprofil | **Replaced by disease-specific indicators** | Ensomhet 65+ still useful but disease indicators dominate |
| DSB Kommuneundersøkelsen | Does not apply | No beredskap line |

The indicator overlay for Nasjonalforeningen is dominated by the new columns below, not the common bundle.

---

## New indicator columns

### Disease-specific (primary)

| Indicator | Source | Granularity | Chapter_type scope |
|---|---|---|---|
| **FHI Hjerte- og karregisteret (HKR)** | `statistikk.fhi.no/hkr/` (PxWeb queryable) | F + some K, 2012–2023 | helselag, combined |
| **Hjerneslag subset of HKR** | Same PxWeb | F + some K | helselag, combined |
| **SSB Dødsårsaksregisteret — cardiovascular + dementia subset** | FHI PxWeb open aggregate; detailed cuts require datatilgang application | K aggregate, annual | helselag (CV) + demensforening (dementia) |
| **FHI Folkehelseprofil hjerte-components**: røyking, fedme, fysisk aktivitet, kosthold, blodtrykk | FHI Folkehelsestatistikk OpenAPI | K + B, biennial | helselag, combined |
| **Derived dementia prevalence** | SSB befolkning 65+/75+/85+ × FHI age-stratified prevalence rates | K, annual | demensforening, combined |

**Critical data gap**: FHI's clinical Demensregister (DemReg) is not exposed with kommune cuts in any open statistikkbank. The standard workaround is to derive prevalence from age-stratified population and published rates (approx 2% of 65+, 10% of 75+, 25% of 85+ per FHI). Good enough for need-mapping; not good enough for intervention evaluation.

### Age-stratified demographic base (foundational)

| Indicator | Source | Granularity |
|---|---|---|
| Population 65+ per kommune | SSB 07459 (age-filtered) | K + B, annual |
| Population 75+ | Same | K + B |
| Population 85+ | Same | K + B |
| Projected 65+/75+/85+ in 2030, 2040, 2050 | SSB befolkningsframskriving | K |
| Single-person households 65+ (kjønnsfordelt) | SSB 06070 (+ FHI kjønnsfordelt ensomhet) | K + B |

These carry more weight for Nasjonalforeningen than for any other org we've tested. A helselag or demensforening chapter in a kommune with a rising 75+ population has demonstrably more latent need each year — that's quantifiable.

### Coverage indicators (NF-specific, presence/absence)

Two NF-maintained lists identify kommuner where specific programmes are active. Scraping `nasjonalforeningen.no` gives boolean flags.

| Indicator | Source | What it measures |
|---|---|---|
| **Demensvennlig kommune** | NF page listing ~200 kommuner | Presence of kommune-signed dementia-friendly initiative |
| **Aktivitetsvenn-kommuner** | NF page listing ~140 kommuner | Presence of active Aktivitetsvenn programme |

Both are coverage indicators (NF presence), not need indicators. Useful for:
- Identifying gaps — kommuner with high need but no Aktivitetsvenn programme
- Surfacing on chapter pages ("Your kommune is a Demensvennlig kommune since 2019")

---

## Activity → indicator mapping

Grouped by `chapter_type` because activity programmes bind to chapter type, not to individual chapters (no per-chapter CMS tagging available).

### helselag programmes (291 chapters)

| Programme | Primary indicators | Chapter-finder relevance |
|---|---|---|
| **Hjertegruppa** (post-infarct rehab groups) | HKR hjerteinfarkt per F/K + population 45+ + FHI fysisk aktivitet folkehelseprofil | Kommuner with high hjerteinfarkt incidence and low fysisk aktivitet scores |
| **Hjertekafé / møteplass** | Population 55+ + FHI fysisk aktivitet + FHI kjønnsfordelt ensomhet 65+ | Rural/semi-urban kommuner with elderly population density |
| **Politisk påvirkning / advokasi** | No indicator column — organisational activity | N/A |
| **Walking and exercise groups (shared with demensforening)** | Sentralitetsindeks + population 65+ | Rural kommuner where fewer alternatives exist |

### demensforening programmes (173 chapters)

| Programme | Primary indicators | Chapter-finder relevance |
|---|---|---|
| **Aktivitetsvenn** (trained activity-companion) | Derived demens prevalence (SSB × FHI rates) + population 80+ alone + ensomhet 65+ | High-need kommuner without existing Aktivitetsvenn coverage — recruitment targets |
| **Demenskoor** | Population 65+ + derived prevalence + cultural-venue presence proxy | Medium-density urban kommuner |
| **Demenskafé / møteplass** | Same cluster + FHI kjønnsfordelt ensomhet 65+ | Shared with Aktivitetsvenn |
| **Demensvennlig kommune** (advocacy) | Coverage flag + derived prevalence | Identifies kommuner **without** Demensvennlig status but with high projected 2040 75+ — advocacy targets |
| **Pårørendeskole** (caregiver training) | Derived prevalence + SSB KOSTRA hjemmetjeneste-dekning | Kommuner with high prevalence and low institutional coverage = high caregiver load |

### Shared / cross-type

| Programme | Primary indicators |
|---|---|
| Sosiale samlinger med matservering | Single-person households 65+ + sentralitet |
| Tiltak for barn og unge | Bufdir Barnefattigdom (thin) |
| Styreverv / board service | No need indicator — supply indicator is civically engaged 60+ population |

---

## Chapter-type scoping example

A helselag chapter in Kongsvinger would see:
- Hjerteinfarkt incidence (HKR) in Innlandet fylke
- Population 45–75 in Kongsvinger
- FHI folkehelseprofil hjerte-components for Kongsvinger
- Ensomhet 65+ in Kongsvinger

A demensforening chapter in Kongsvinger would see:
- Derived demens prevalence (SSB 75+ × FHI rates) for Kongsvinger
- Population 80+ alone
- Aktivitetsvenn and Demensvennlig coverage flags
- FHI kjønnsfordelt ensomhet 65+

Both share:
- Sentralitetsindeks
- Single-person 65+
- Projected 75+/85+ in 2040

---

## International framing layer

| Programme cluster | International sources |
|---|---|
| Hjerte (helselag) | WHO GHO cardiovascular indicators, OECD Health at a Glance, European Society of Cardiology statistics |
| Demens (demensforening) | Alzheimer Europe Dementia in Europe Yearbook, WHO Global Dementia Observatory, OECD Care Needed report |
| Ageing demographics | UN DESA World Population Prospects, Nordic Health and Welfare Statistics |
| Ensomhet | Meta-Gallup Global Social Connections (useful for Kløvertur-equivalent framing) |

Alzheimer Europe's Dementia in Europe Yearbook is a strong new addition — useful for any dementia-adjacent activity across orgs, not just Nasjonalforeningen. Worth adding to `data-sources-international.md`.

---

## Cross-activity patterns and framework fit

1. **Activity mapping shifts from per-chapter to per-programme.** Where RC has chapter × activity matrix and NF / N.K.S. have chapter × activity-bin, Nasjonalforeningen has programme × chapter_type. The framework must accommodate all three shapes.
2. **Chapter_type is a cleaner structural extension than institutions.** N.K.S.'s institutions layer is a sub-array that varies by chapter. Chapter_type is a flat enum populated from name regex, exhaustive (99%+ of chapters). It composes well with the base chapter schema.
3. **Common-bundle coverage drops sharply.** Only 3 of 8 pipelines apply. This is the first org where a substantial part of the common bundle simply isn't relevant.
4. **Demographic-pyramid emphasis is a systemic pattern for elderly-focused orgs.** Not just Nasjonalforeningen — any org with a 65+/75+/85+ target population needs the same pipelines. Diabetesforbundet, LHL, Kreftforeningen, Blindeforbundet, Mental Helse all have similar structures. This is a reusable addition.
5. **Derived prevalence as a pattern.** When clinical-register kommune cuts aren't open (Demensregister, possibly Diabetesregister, Kreftregister), the SSB × FHI-rate workaround becomes a generalisable technique, not a hack. The framework should expose "prevalence-by-population × rate" as a first-class derived indicator type.

**Framework-fit conclusion**: ~55% direct reuse + ~35% new extensions (chapter_type + disease-specific indicators + derived prevalence + coverage flags) + ~10% activity-adaptation. Lower than the other three, but this is the shape to expect as we move deeper into specialty orgs.

---

## Caveats and open questions

- **No per-chapter activity tagging.** Chapters have no individual web pages; each chapter's web presence is essentially its Facebook page. The activity → chapter linkage is programme-mediated, not CMS-tagged.
- **Hjertegruppa and Demenskoor operating counts not published.** The programmes exist nationally but chapter-level deployment is invisible from public data. A Nasjonalforeningen internal data request could fill this.
- **Active vs dormant chapter status not surfaced.** Brreg has 464 FLI entities; NF's website lists 430. The gap (~7%) is likely dormant chapters still in Brreg but not active on the site.
- **Demensregister kommune cuts unavailable.** Derivation via SSB × FHI rates is the workaround; good for need-mapping, not for outcome evaluation.
- **HKR's public PxWeb sometimes 503s** on WebFetch (works fine in browsers). Mirror or cache expected.
- **Chapter_type edge cases.** 3 combined chapters (all in MR) and ~6 edge entities (Slagforeningen, seniorsenter, foreldrelag) don't fit the helselag/demensforening enum cleanly. Allow `other` as a tail value.
- **Aktivitetsvenn and Demensvennlig kommune lists.** NF maintains these on their own site; scraping required. The data is stable but can change quarterly as new kommuner sign up.

---

## Missing / hard-to-get

- Per-chapter Hjertegruppa or Demenskoor deployment status
- Per-chapter board composition (styreverv)
- Historical chapter vitality (founding, mergers, dissolutions)
- Research-grant recipients tied to specific lokallag (most NF research funding goes to universities, not lokallag, so this gap may be trivial)
- Detailed demens prevalence at kommune level (clinical registry not open) — workaround via derivation
- Detailed cardiovascular mortality at kommune × age × cause level (Dødsårsaksregister requires datatilgang) — workaround via aggregate PxWeb

---

## Summary

Nasjonalforeningen is the fourth org tested and introduces **three new systemic framework requirements**:

1. **`chapter_type` as a first-class enum field** on the chapter schema — will generalise to any bifurcated patient-org (patient-type vs caregiver-type, condition-A vs condition-B)
2. **Disease-specific indicator pipelines** — FHI Hjerte- og karregisteret, derived demens prevalence, cardiovascular risk factors — will generalise to Diabetesforbundet, LHL, Kreftforeningen, Blindeforbundet, Mental Helse
3. **Age-stratified demographic base with projections** — the 65+/75+/85+ × projection cube — will generalise to every elderly-focused org

Cumulative framework shape after four orgs:

| Org | Framework reuse | What it adds |
|---|---|---|
| Red Cross | Reference 100% | — |
| Norsk Folkehjelp | ~90% | 4th engagement pathway (campaign action), global-context panel |
| N.K.S. | ~65% | `institutions` array + 9 gender-aware indicator columns + systematic gender-filtering |
| Nasjonalforeningen | ~55% | `chapter_type` enum + disease-specific pipelines + age-stratified + derived prevalence + coverage-flag indicators |

The falling "reuse rate" is **positive signal**, not regression. Each addition is a real framework element that other orgs in the same cluster will reuse. We're building the intersection of what the Tier A cluster actually needs — not a fixed schema.
