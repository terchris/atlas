# Sanitetskvinnene (N.K.S.) — activity → indicator matrix

For each of N.K.S.'s seven canonical activities, the open data indicators that signal where the need is highest. Pairs with:

- `sanitetskvinnene-activities.md` — the seven-bin activity catalogue (scraped from sanitetskvinnene.no)
- `redcross-activity-indicator-matrix.md` — the original template
- `norskfolkehjelp-activity-indicator-matrix.md` — the peer adaptation for NF
- `data-sources.md` — verified Norwegian sources
- `ngo-landscape.md` — N.K.S. structural-fit context

**This is the first org we've tested that genuinely extends the framework** rather than using a subset of it. Same activity-vocabulary shape as NF (fixed CMS bins), same ~90% Frivillighetsregisteret coverage, but N.K.S. introduces:

1. **Nine new kommune-level indicator columns** — mostly gender- and women's-health-specific, driven by N.K.S.'s women's-health mission. Not needed by RC or NF.
2. **A chapter-owned `institutions` entity type** — some lokalforeninger operate hospitals (NKS Olaviken 224 ansatte, NKS Jæren DPS 291 ansatte, NKS Bjørkeli 94 ansatte), sykehjem, barnehager, avlastningsplasser. Neither RC nor NF has this at chapter level.

Framework-fit: ~65% direct reuse, ~25% extension, ~10% activity-specific adaptation. Lower than NF's ~90%, but because the framework legitimately expands — not because it breaks.

Verified 2026-04-19.

---

## How to read this

Direction: **↑ need** = higher indicator value means more need; **↓ need** = lower = more need.

Granularity: **K** = kommune, **B** = bydel (Oslo/Bergen/Trondheim/Stavanger), **F** = fylke, **N** = national only.

Same conventions as the RC and NF matrices.

---

## The common bundle — still the spine

Six of the eight common-bundle pipelines reuse directly from the RC matrix. N.K.S. adds new columns (next section) on top — it doesn't replace the core.

| Indicator | Source | N.K.S. activities served |
|---|---|---|
| Population by age/sex | SSB table 07459 (PxWebApi v2) | All activities; gender-slicing matters more here than for RC/NF |
| Household composition (incl. single-person 65+) | SSB table 06070 | Omsorgsberedskap, Kløvertur, Lesevenn |
| Folkehelseprofil / Oppvekstprofil | FHI Folkehelsestatistikk OpenAPI | All — but gender-filtered variants preferred |
| Refugee settlement numbers | IMDi bosettingstall | Språkvenn, Ressursvenn (integration-adjacent) |
| Child poverty | Bufdir Barnefattigdom | Dig In, Sisterhood (youth-focused slices) |
| DSB Kommuneundersøkelsen | Preparedness | Omsorgsberedskap |
| Sentralitetsindeks | SSB Klass 128 | Omsorgsberedskap (rural reachability) |
| Child welfare | Bufdir Barnevern | Sisterhood, Ressursvenn (youth violence exposure) |

---

## Nine new indicator columns (N.K.S.-driven extensions)

These are the framework-extension signals N.K.S. introduces. Some serve only N.K.S.; several are useful for any women's-health or gender-focused activity at any NGO (Sanitetsungdom, Kvinnefellesskap, etc.).

| New indicator | Source | Granularity | Serves | Direction |
|---|---|---|---|---|
| **FHI Kvinnehelseregister / Kvinnehelseutvalget kunnskapsgrunnlag** | `statistikk-data.fhi.no/api/open/v1/` + FHI Kvinnehelserapporten | K where possible, F otherwise | All Kvinnehelsehus activities; Sisterhood | ↑ = ↑ need |
| **FHI Medisinsk fødselsregister (MFR)** | `statistikk-data.fhi.no/api/open/v1/` | K, annual | Kvinnehelsehus barselkafé, mødregruppe | ↑ complications = ↑ need |
| **Bufdir krisesenterstatistikk** | `bufdir.no/statistikk-og-analyse/krisesenterstatistikk/` | K + F, annual | Ressursvenn (post-violence mentor) | ↑ = ↑ need |
| **Kripos voldsutsatte kvinner / anmeldelser vold i nære relasjoner** | `politiet.no/om-politiet/tall-og-fakta/` (PDF) + SSB 08484 filtered | Politidistrikt, annual | Ressursvenn, Sisterhood | ↑ = ↑ need |
| **Ungdata kvinner 16–24** (gender-sliced Ungdata indicators — ensom, trives, psykiske plager, mobbet) | FHI Folkehelsestatistikk via Oppvekstprofil with kjønn filter | K + B, biennial | Sisterhood, Dig In | Mixed (↑ ensom = ↑ need) |
| **FHI kjønnsfordelt ensomhet 65+** | FHI Folkehelseprofil — Ensom indicator filtered by kjønn | K + B, biennial | Kløvertur, Lesevenn (strongest for women 65+) | ↑ = ↑ need |
| **SSB innvandrerkvinner** (landbakgrunn kjønnsfordelt) | SSB tables 07111 / 07108 / 05184 with kjønn filter | K, annual | Språkvenn (gender-specific language groups) | ↑ = ↑ need |
| **KOSTRA sykehjems- og barnehagedekning** | SSB KOSTRA pleie-omsorg + barnehage | K, annual | Institutions layer — identifies where chapter-owned institutions fill a gap | ↑ coverage = ↓ incremental institutional need |
| **SSB aleneboende ungdom 18–29** | SSB table 06070 filtered by age 18–29 | K, annual | Dig In (nutrition-for-young-adults target) | ↑ = ↑ need |

**Reusability beyond N.K.S.**: six of these nine are useful for any gender-focused or women's-health activity at any NGO (krisesenter, voldsutsatt, Ungdata kvinner, kjønnsfordelt ensomhet, innvandrerkvinner, aleneboende ungdom). Two are institution-specific (KOSTRA coverage). One is uniquely N.K.S. territory (Kvinnehelseregister). So roughly ⅔ of the extension is reusable sector-wide.

---

## Activity matrix

### Omsorgsberedskap (~360 chapters)

Hybrid of beredskap and omsorg — trained volunteer response during crises + ongoing social support. Closest to RC Omsorg + RC Beredskapsvakt.

| Indicator | Source | Direction | Notes |
|---|---|---|---|
| DSB Kommuneundersøkelsen ROS-analyse | DSB | ↑ need where kommune is weak | Same as RC/NF |
| Single-person households 65+ | SSB 06070 | ↑ = ↑ need | |
| FHI kjønnsfordelt ensomhet 65+ | FHI | ↑ = ↑ need | **New column** — stronger signal than ungendered ensomhet for this activity |
| Sentralitetsindeks | SSB Klass 128 | ↓ = ↑ need | Rural chapters matter more |
| Farevarsel frequency + NVE forecast warnings | MET metalerts + api01.nve.no | ↑ = ↑ need | |
| KOSTRA hjemmetjeneste-dekning | SSB | ↓ = ↑ Omsorgsberedskap role | |

### Kløvertur (~275 chapters)

Social walking groups — mostly seniors. Loneliness + physical-activity cross-cut.

| Indicator | Source | Direction |
|---|---|---|
| Single-person households 65+ | SSB 06070 | ↑ = ↑ need |
| FHI kjønnsfordelt ensomhet 65+ | FHI | ↑ = ↑ need (stronger for women 65+) |
| FHI Folkehelseprofil — fysisk aktivitet | FHI | ↓ = ↑ need |
| Share 80+ in home care | SSB KOSTRA | ↑ = larger potential participant pool |

### Språkvenn (~155 chapters)

Language practice for immigrant women — gender-specific mentor pairing. Same driver as RC Flyktningguide / NF Flyktning og inkludering, but with female-only pairing.

| Indicator | Source | Direction |
|---|---|---|
| IMDi bosettingstall | IMDi | ↑ = ↑ need |
| SSB innvandrerkvinner etter landbakgrunn | SSB 07111 filtered by kjønn | ↑ = ↑ need (**new column** vs RC/NF) |
| Norskprøve results | HK-dir | ↓ pass rate = ↑ practice need |
| SSB 05183 innvandring | SSB | ↑ = ↑ need |

### Lesevenn (~55 chapters)

Reading companion — elderly-focused literacy and cognitive engagement.

| Indicator | Source | Direction |
|---|---|---|
| Share 80+ | SSB 07459 | ↑ = ↑ need |
| Share 80+ in home care | SSB KOSTRA | ↑ = ↑ institutional deployment sites |
| FHI Folkehelseprofil — psykiske plager 65+ | FHI | ↑ = ↑ need |
| Dementia prevalence proxies | FHI Demensregister (where available) | ↑ = ↑ need |

### Sisterhood (~45 chapters)

Gendered youth program for girls / young women. No RC or NF parallel.

| Indicator | Source | Direction |
|---|---|---|
| Population 13–19, kvinner | SSB 07459 filtered | Scale-setter |
| Ungdata kvinner 16–24 (ensom, mobbet, psykiske plager, trives) | FHI via Oppvekstprofil | Mixed (↑ ensom = ↑ need) |
| Bufdir Barnefattigdom — omfang etter husholdningstype | Bufdir | ↑ = ↑ need |
| Kripos voldsutsatte kvinner (politidistrikt) | SSB 08484 filtered by kjønn + alder | ↑ = ↑ need |
| Frafall videregående — kvinner | FHI Oppvekstprofil | ↑ = ↑ relevant audience |

### Dig In (~45 chapters)

Nutrition program for young adults. No RC or NF parallel.

| Indicator | Source | Direction |
|---|---|---|
| SSB aleneboende ungdom 18–29 | SSB 06070 filtered | ↑ = ↑ target population (**new column**) |
| SSB 12221 NAV sosialhjelp ungdom | SSB | ↑ = ↑ need |
| FHI spiseforstyrrelse-indikatorer | FHI statistikkbank | ↑ = ↑ need |
| Frafall videregående | Udir + FHI | ↑ = ↑ relevant audience |
| Bufdir Barnefattigdom | Bufdir | ↑ = ↑ young-adult food insecurity |

### Ressursvenn (~45 chapters)

Post-violence mentor program — support for women rebuilding after abuse. No RC or NF parallel; closest is RC Nettverk etter soning but for a very different population.

| Indicator | Source | Direction |
|---|---|---|
| Bufdir krisesenterstatistikk (beboere + henvendelser) | Bufdir | ↑ = ↑ need (**primary indicator, new column**) |
| Kripos voldsutsatte kvinner (anmeldelser) | Politidistrikt | ↑ = ↑ need |
| SSB 08484 vold i nære relasjoner | SSB | ↑ = ↑ need |
| IMDi innvandrerkvinner | IMDi | ↑ may = ↑ specific need (negativt sosial kontroll, tvang) |
| SSB sosialhjelp | SSB 12221 | ↑ = ↑ financial precarity co-occurrence |

---

## Institutions layer — the second framework extension

N.K.S. lokalforeninger own institutions at two tiers. The chapter data model needs an `institutions` array to represent both.

### Tier 1 — Major institutions (separate legal entities)

Registered as AS with own Brreg org.nr. Significant employee bases. Sibling to the chapter FLI, not under it — so a naive "chapter → institution" join via Brreg overordnetEnhet won't work; must be enumerated by navn-pattern search + manual curation.

| Entity | Org.nr | Form | Employees | Type |
|---|---|---|---:|---|
| NKS Olaviken Alderspsykiatriske Sykehus | 987554401 | AS | 224 | Psykiatrisk sykehus |
| NKS Jæren Distriktspsykiatriske Senter | 996380041 | AS | 291 | DPS |
| Voss DPS NKS Bjørkeli | 916270097 | AS | 94 | DPS |
| NKS Holding | 998261635 | AS | — | Holding |

Plus stiftelser (e.g. Stiftinga NKS Tuberkulosesamlinga på Voss, Sanitetsforeningas Boligstiftelse) carrying historical trusts. Need: separate enumeration pass via Brreg.

### Tier 2 — Minor institutions (operated inside the FLI)

Barnehage, sykehjem, avlastning, hospice, hotell-helsehus and similar operated by lokalforeninger as part of their FLI operations. No separate org.nr — they show up as part of the parent forening's accounts and as N55/N85/N86/N87/N88 sub-activities in Brreg næringskoder. Best enumerated by:

1. Filtering the 580 FLI chapters by `antallAnsatte > 0` (10 found in the Brreg census — Bergen 91, Stavanger 15, Oslo 11, Mandal 11, Mo 11 — these are the FLI chapters running institutional operations internally).
2. Inspecting each chapter's page on sanitetskvinnene.no for named institutions.

The `ngo-landscape.md` figure of "~30 institutions" reconciles: ~4 Tier-1 AS + ~10 Tier-2 FLI-embedded + ~15 smaller programmes that don't register as separate operations = ~30 total.

### Implications for the chapter data model

```
chapter {
  orgnr: "9xxxxxxxx",
  navn: "N.K.S. Bergen Sanitetsforening",
  activities: ["Omsorgsberedskap", "Kløvertur", ...],
  institutions: [
    { type: "psykiatrisk-sykehus", navn: "NKS Olaviken", orgnr: "987554401", ansatte: 224 },
    { type: "sykehjem", navn: "...", embedded_in_fli: true }
  ]
}
```

RC's chapter model has nothing analogous (RC activities are a flat list; RC-owned institutions like Haugland rehabiliteringssenter live outside the chapter structure). NF's chapter model is simpler still. For the multi-NGO framework this is the first genuine schema extension.

---

## International framing layer

Same tie-ins as the RC and NF matrices, plus one N.K.S.-specific addition:

| Activity cluster | International sources |
|---|---|
| Omsorgsberedskap | IFRC GO API (sister societies), Carbon Brief climate attribution, GDACS |
| Kløvertur, Lesevenn | Meta-Gallup Global Social Connections, WHO GHO ageing indicators, UN DESA WPP |
| Språkvenn | UNHCR Refugee Statistics API, IOM DTM |
| Sisterhood, Dig In | UNICEF SDMX API (child/youth indicators), Meta-Gallup loneliness by age |
| **Ressursvenn** | **WHO Violence Info, UN Women global gender-based violence indicators, OECD Gender Data Portal** |

The Ressursvenn row is a **new international-framing requirement** — gender-based violence indicators not previously catalogued. See `data-sources-international.md` for verified endpoints and add these.

---

## Cross-activity patterns and framework fit

1. **Kommunenummer still the universal pivot.** Same as RC and NF.
2. **Activity-vocabulary shape matches NF.** Seven fixed CMS bins; scraper logic reuses. RC's free-text + canonical IDs is the outlier, not the norm — we've now seen the shallow-bin pattern at NF (6 bins) and N.K.S. (7 bins) both times.
3. **Indicator matrix is genuinely extensible.** N.K.S. adds nine columns, two-thirds of which serve other NGOs with gender-focused or women's-health missions. The matrix architecture is a common core + per-org extensions.
4. **Chapter data model needs `institutions` array.** Not optional for N.K.S. Likely also required for Frelsesarmeen (korps + Fretex operations), Kirkens Bymisjon (foundations + service units), Kreftforeningen (Vardesenteret).
5. **Gender-filtering on existing indicators is a systemic need**, not a one-off. Ungdata, ensomhet, innvandrerbakgrunn, sosialhjelp all benefit from kjønn-filtered variants — and the underlying data supports it.

**Framework-fit conclusion**: ~65% direct reuse + ~25% extension (9 new columns + institutional layer) + ~10% activity-specific adaptation. The lower reuse vs NF's 90% is **good news**, not bad — it tells us the framework's indicator catalogue and chapter schema both need to be extensible, not fixed, and that gender-cuts on existing indicators are a real pattern we'll see again (Kreftforeningen, Mental Helse, Kvinnenettverk across many orgs).

---

## Caveats and open questions

- **Activity taxonomy shallow like NF.** Same lossy-bin problem: "Omsorgsberedskap" tells you almost nothing about what a specific chapter is running week-to-week. Indicator overlay for this bin must be conditional on scraped event or institution-level detail.
- **Empty-activity rate higher than NF.** 24% of sampled N.K.S. chapter pages had no activities listed (vs NF's 9%). Cause unverified — could be CMS gap, genuinely inactive chapters, or data-quality issue. If real inactivity, ~130 of the 550 chapters may not be finder-usable.
- **Institution census incomplete.** The Tier-2 FLI-embedded institutions haven't been fully enumerated. Needs a targeted scrape of each large-employer FLI chapter's page.
- **Gender-filtering not uniformly available.** Most FHI indicators expose kjønn as a filter, but some Ungdata-indicator breakdowns may be suppressed at small kommune sizes for privacy reasons (n<10 often masked).
- **Krisesenterstatistikk granularity.** Bufdir publishes at kommune and F level, but not all indicators at both. Ressursvenn may have to work at F level for some metrics.
- **Kvinnehelsehus lives between brand and legal entity.** The four Kvinnehelsehus (Oslo, Bergen, Drammen, Kristiansand) don't appear in Brreg as separate legal entities (only the Brændeland ENK matches by name). They likely operate as programmes of the central N.K.S. or the relevant lokalforening. Resolving their legal status would clarify how to present them in the finder.

---

## Missing / hard-to-get

- **Per-chapter Ressursvenn deployment status.** The activity might be listed but not currently running. Chapter-pages don't always reflect operational reality.
- **Kvinnehelsehus sub-activities.** Barselkafé, mødregruppe, inkluderingsgruppe etc. aren't visible at the chapter-finder layer.
- **Historic N.K.S. hospital divestitures.** The hospital portfolio used to be larger; tracking historical ownership for Memorial view / heritage content requires archival work beyond the Brreg live data.
- **Ressursvenn effectiveness / award data.** No public data on how many participants exit the programme per year, success outcomes, etc. Only aggregate programme exists.

---

## Summary

N.K.S. is the first org of the three tested that genuinely **extends** the framework. The eight-pipeline common bundle still serves as the spine. On top:

1. **Nine new indicator columns** (six with sector-wide reusability, three N.K.S.-specific)
2. **An `institutions` array** on the chapter entity (two tiers: separate-legal-entity AS and FLI-embedded)
3. **Systematic gender-filtering** on existing indicators as a design pattern

Framework-fit ~65% direct + ~25% extension + ~10% activity-adaptation. This is the shape we should expect as we move from Tier A humanitarian orgs (RC, NF — high reuse) into Tier A specialty orgs (N.K.S., Nasjonalforeningen, patient orgs — genuine extension). Good data for the "what does the framework actually have to be" design question.
