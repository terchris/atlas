# Nasjonalforeningen for folkehelsen activities

The activity catalogue for Nasjonalforeningen for folkehelsen's lokallag, derived from a near-complete scrape of the per-fylke chapter listings under `https://nasjonalforeningen.no/lokallag/{fylke}/lokallag-i-{fylke}/` on 2026-04-18, cross-checked against Brønnøysundregistrene Enhetsregisteret the same day.

## Source and method

- **Primary source**: the fylkeslag overview at `https://nasjonalforeningen.no/lokallag/` (15 fylkeslag) and per-fylke chapter listings at `https://nasjonalforeningen.no/lokallag/{fylke}/lokallag-i-{fylke}/` (one HTML page per fylke listing all lokallag).
- **Scale**: NF reports **430 lokallag nationwide** on its `bli-frivillig` page; Brreg returns **291 helselag + 173 demensforening = 464 FLI entities** under those names. The listing pages we scraped cumulatively contain **~415 chapters across 15 fylker** — within 4% of NF's 430 figure and the right order of magnitude against Brreg's 464.
- **Sample**: 15 of 15 fylker fetched (effectively a census of the lokallag listings, not a sample). Per-fylke counts in the table below. Individual chapter pages on `nasjonalforeningen.no` were tested (several `/lokallag/{fylke}/lokallag-i-{fylke}/{slug}/` URLs) and uniformly returned 404 — there is **no per-chapter page** on the NF website. Each chapter is exposed as a row in the fylke listing with name + Facebook URL only.
- **Note on derivation**: Unlike Red Cross, Norsk Folkehjelp, and N.K.S., Nasjonalforeningen has **no chapter-level CMS activity vocabulary at all**. The fylke listings expose chapter name and (where it exists) a Facebook page URL; that's it. To know what an individual chapter actually does, you have to follow the Facebook link or call. The activity catalogue below is therefore reconstructed from (a) the central-org activity vocabulary on the `bli-frivillig` page, (b) the chapter-name typology (helselag vs demensforening), and (c) central programme brands (Aktivitetsvenn, Demenskor, Hjertegruppa, Demensvennlige samfunn).
- **Caveats**: Sub-activity granularity is wholly invisible from the website. The chapter-type binary (helselag / demensforening / combined) is the strongest single signal of what a given lokallag does. Active-vs-dormant status is not surfaced — Brreg shows several `helselag` entries with stiftelsesdato 1884–1929 still active in Frivillighetsregisteret, but how many actually run weekly activities is unknowable from the public surface.

## Chapter types — the structural finding

**Nasjonalforeningen has two parallel chapter types, listed in the same per-fylke list, with the type embedded in the chapter name:**

| Type | What it does | Older/newer |
|---|---|---|
| **Helselag** | Heart/cardiovascular focus + general folkehelse. Older tradition (1884 oldest in Brreg). Walking groups, social gatherings, fundraising for forskning, post-MI rehab support, `Hjertegruppa` programme. | Older |
| **Demensforening** | Dementia focus. Newer (oldest 1908 in Brreg, but most are post-2000). Pårørendegrupper, samtalegrupper, `Aktivitetsvenn` recruitment, `Demenskor`, advocacy for `Demensvennlig samfunn`. | Newer |
| **Combined ("X demensforening og helselag" / "X helselag og demensforening")** | Single legal entity covers both functions. Found only in 3 of ~415 chapters — Kristiansund, Surnadal, Skodje (all in Møre og Romsdal). Likely a merger pattern in small kommuner. | Hybrid |
| **Other** | A handful of edge cases: `Slagforeningen Rogaland` (a slagrammede support group sitting under NF in Stavanger), `Foreldrelaget i Åsnes` (a parent-group lokallag), `Sandviken Seniorsenter` and `Landåstorget seniorsenter` (Bergen senior centres listed alongside the lokallag). 4–6 entities total. | Edge |

### The structural question, answered

**Yes — the two-cluster structure is real, persistent, and reflected at every layer:**

1. **In the lokallag listing**: Each chapter's name explicitly contains either `helselag` or `demensforening`. They are listed alphabetically in a flat per-fylke list, but the type is unambiguous from the name string.
2. **In Brreg**: Two distinct legal-name patterns. `navn=helselag` returns 291 FLI; `navn=demensforening` returns 173 FLI. They share no naming overlap — a single legal entity is one or the other, except for the 3 combined chapters which carry both terms.
3. **In Brreg næringskoder**: Helselag predominantly use `94.992` (annen medlemsorganisasjon) plus `88.996` (andre sosialtjenester uten botilbud) and a long tail (`85.100`, `86.992/3`, `88.103`, `96.210`, `68.200`). Demensforening cluster much tighter — only `88.996` and `94.992`. This reflects helselag's older multi-purpose role (a few own helsehus or barnehager) vs demensforening's narrow informational/pårørende role.
4. **In stiftelsesdato distribution**: Helselag oldest is **1884-12-31**, newest is **2023-09-18** — a 140-year span dominated by the original 1910s–1960s tuberculosis/folkehelse founding wave. Demensforening oldest is **1908-01-01** (likely a pre-existing entity rebranded), newest is **2025-10-20** — but the bulk of demensforening were founded post-1990 in line with NF's reorganisation of dementia work.
5. **In the central activity vocabulary**: NF's `bli-frivillig` page lists six volunteer activities. Three are demens-coded (sanggrupper for personer med demens, Aktivitetsvenn-adjacent, demensvennlig påvirkning); three are general-folkehelse (gå- og treningsgrupper, sosiale samlinger, tiltak for barn og unge, styreverv). The activity surface is bifurcated to match the chapter typology.

### Compared with the N.K.S. institutions layer

This is **a cleaner split than N.K.S.'s institutions layer.** N.K.S.'s institutions axis is messy because:
- Only 10 of 580 chapters carry it (1.7%).
- Many institutions live in separate legal entities (stiftelser, AS) sibling to the chapter, not nested in the chapter org.nr.
- It's a long-tail, optional dimension that complicates the data model but only matters for a small minority.

The Nasjonalforeningen helselag/demensforening split is **a primary, exhaustive, mutually-exclusive type that applies to 99% of chapters**, name-encoded, and structurally represented in Brreg via two distinct query patterns. The cleanest implementation is **a `chapter_type` enum field with values `helselag | demensforening | combined | other`** on the chapter record, populated from regex on the chapter name. This is *less* extension work than N.K.S.'s institutions layer (which is a 1:N child-table relationship), not more.

## Activities, by chapter footprint

Because there is no per-chapter activity tagging, the table below counts activities by **chapter type** rather than by per-chapter CMS tags. Activity-name-to-chapter-type mapping is from the NF central-activity vocabulary and the helselag/demensforening role split.

| Activity | Likely run by | Estimated chapter footprint (of ~430 lokallag) | What it is |
|---|---|---:|---|
| **Sanggrupper / Demenskor for personer med demens** | Demensforening + central programme | ~150 (most demensforeninger) | Singing groups for people with dementia and their pårørende. The `Demenskor` brand became a national wave after the 2023 NRK series. NF's central role is methodology and toolkit; lokal demensforeninger are typical hosts. |
| **Gå- og treningsgrupper for alle aldre** | Helselag (primary) + some demensforening | ~250 (most helselag + a portion of demensforening) | Walking groups, light exercise. Direct functional peer to N.K.S. Kløvertur. The Hjerteliv-aligned helselag tradition. |
| **Sosiale samlinger med matservering** | Both types | ~350 (most chapters) | Social meetings, eldretreff, monthly café, Christmas dinners. Listed by NF as an explicit volunteer activity; the basic chapter operating mode for both helselag and demensforening. Brreg "aktivitet" fields confirm this — e.g. Alversund helselag explicitly says "inviterer til eldretreff hver onsdag". |
| **Pårørendegrupper og samtalegrupper for demens** | Demensforening | ~150 (most demensforeninger) | Peer-support for family members of persons with dementia. Often tied to the `Pårørendeskole` programme (run together with kommune). Brreg activity-text confirms this is the canonical demensforening service — e.g. Alta demensforening: "Informasjonsarbeid blant pårørende til demente, pårørendeskoler, åpne møter, samtalegrupper". |
| **Aktivitetsvenn** (national program) | Demensforening + kommune partnership | ~140 kommuner (NF central count) — ~2 400 trained volunteers | NF-trained volunteers paired with persons with dementia for shared activities (walks, cafés, theatre). Centrally trained and quality-assured by NF; locally run via demensforeninger and demensvennlige kommuner. The single most-distinguishing NF programme. |
| **Hjertegruppa** | Helselag + sykehus partnership | Unknown (not surfaced on website) | Post-MI / post-revascularisation training and peer-support groups. Mentioned by Hjertelinjen but no current count of active groups was findable on the public site. Was historically run in partnership with sykehus rehabilitation departments. |
| **Demensvennlig samfunn — kommuneprogrammet** | Demensforening + kommune | ~200 kommuner participating | Local awareness programme: demens-vennlig training of butikkansatte, kollektivtransport, restauranter. Demensforening drives the kommune partnership; central NF provides materials. |
| **Tiltak for barn og unge** | Both types, sporadic | low single-digit % | Listed on bli-frivillig but rarely chapter-coded. NF's children/youth work is much weaker than RC's BARK or N.K.S.'s Sisterhood — the implementation is mostly via skole-besøk and folkehelseuke events, not standing groups. |
| **Politisk påvirkning i kommune/bydel** | Both types | small but increasing | Advocacy on hjerte-vennlig + demensvennlig kommunal planning. Listed as an explicit volunteer pathway on bli-frivillig. |
| **Styreverv** | Both types | ~430 (every chapter has a board) | Volunteer board service. Pathway-equivalent, not activity. |
| **Helsetelefonene (Hjertelinjen 23 12 00 50, Demenslinjen 23 12 00 40)** | Central, not chapter | n/a | National helplines staffed centrally. Not a chapter activity. |

**Average activity footprint per chapter is hard to estimate from the data we have.** The per-fylke listings give name + Facebook URL only — no activity tags. A real chapter-activity matrix would require either Facebook-scraping (most chapters' weekly activity is posted there) or an outreach pass.

## Thematic groupings

The activity surface naturally clusters along the helselag/demensforening axis:

### Heart and cardiovascular health (helselag-coded)
Hjertegruppa · Gå- og treningsgrupper · Hjertelinjen · advocacy for hjerte-vennlig kommunal planning · forskningsfinansiering via Stiftelsen Dam (national)
→ Need signals: FHI hjerte- og karregisteret per kommune, SSB dødsårsaksregister filtered cardiovascular, hjerneslag-statistikk per kommune, røyking + alkohol + fedme indikatorer (FHI Folkehelseprofil). See "Indicator-requirement signals" below.

### Dementia (demensforening-coded)
Pårørendegrupper · Demenskor · Aktivitetsvenn · Demensvennlig samfunn · Demenslinjen · forskningsfinansiering via Stiftelsen Dam
→ Need signals: dementia prevalence projection per kommune (FHI estimates), pårørendebelastning, share of population 65+ and 80+ per kommune, share with hjemmebaserte tjenester, share of bo- og aktivitetstilbud i kommunen.

### Loneliness, ageing, social inclusion (both types)
Sosiale samlinger · Gå- og treningsgrupper · eldretreff (Brreg-confirmed)
→ Need signals: SSB aleneboende 65+ per kommune, FHI Folkehelseprofil ensomhet, fastlege-dekning, hjemmesykepleie-dekning. Same core signals as RC Besøkstjeneste / N.K.S. Kløvertur.

### Children and youth (weak)
Folkehelseuke skolebesøk · sporadic chapter-level events
→ Need signals: Ungdata levevaner (kosthold, fysisk aktivitet, røyking), but NF doesn't run a sustained youth programme like RC BARK / N.K.S. Sisterhood. This indicator column is light for NF.

### Forskning og politikk (national-only)
Stiftelsen Dam grants for hjerte- og karforskning + demensforskning · Hjernerådet partnership · advocacy
→ Not indicator-driven in the kommune-need sense. Mission layer; sits alongside N.K.S. forskning and outside the activity-indicator matrix.

## Local naming patterns

Far more uniform than Red Cross and slightly more rigid than N.K.S. or NF:

- **Display name**: nearly always `Nasjonalforeningen {Stedsnavn} {helselag|demensforening}`. Examples: `Nasjonalforeningen Alta helselag`, `Nasjonalforeningen Bergen demensforening`, `Nasjonalforeningen Tønsberg og Færder demensforening`. Roughly 5% drop the `Nasjonalforeningen` prefix in the listing (e.g. `Sveio helselag`, `Indre Østfold demensforening`, `Løkta helselag`) — possibly a CMS data-entry inconsistency, not a real naming difference.
- **Brreg legal name**: UPPERCASE — `ALVERSUND HELSELAG`, `ALTA DEMENSFORENING`. Brreg names omit the `Nasjonalforeningen` prefix in roughly half of cases, retain it in the other half (`NASJONALFORENINGEN FOR FOLKEHELSENS HELSELAG I NORDRE LAND` is the longest pattern observed, and is also the only helselag with registered employees on the page-2 sample).
- **No URL slug pattern that resolves to a chapter page** — every individual-chapter URL tested (`/lokallag/{fylke}/lokallag-i-{fylke}/{slug}/`) returned 404. The chapter's web presence is its Facebook page, listed as the only outbound link on the fylke listing.
- **Combined chapters use "demensforening og helselag" or "helselag og demensforening"** in the name. 3 observed (Kristiansund, Surnadal, Skodje). Brreg may carry these as a single FLI under one of the two names — needs verification.
- **Multi-kommune chapters are explicit in the name**: `Asker demensforening (covers Asker, Hurum, Røyken)`, `Follo demensforening (covers Nordre Follo, Enebakk, Ås, Frogn, Nesodden)`, `Tønsberg og Færder demensforening`, `Hattfjelldal og Grane demensforening`, `Kvinesdal, Sirdal og Flekkefjord demensforening`. Reflects post-2020 kommunesammenslåing pattern; one demensforening typically covers a wider geography than one helselag.
- **Two non-standard "seniorsenter" entries appear in Hordaland's listing** (`Sandviken Seniorsenter`, `Landåstorget Seniorsenter`) — likely a Bergen-specific convention where senior centres get listed alongside lokallag because the demensforening uses the senter as a venue. Worth flagging as an edge case.

Implication for a framework port: NF chapter records need `chapter_type ∈ {helselag, demensforening, combined, other}` derived from name regex. URL/web-presence is `null` for the central site and Facebook-only at the chapter level. The 3 combined chapters and ~6 edge-case entities (seniorsenter, slagforening, foreldrelag) need a small lookup-override table.

## Brreg chapter-level org.nr findings

Queries:
- `https://data.brreg.no/enhetsregisteret/api/enheter?navn=helselag&organisasjonsform=FLI&size=200` (page 0 + page 1)
- `https://data.brreg.no/enhetsregisteret/api/enheter?navn=demensforening&organisasjonsform=FLI&size=200`

| Metric | Helselag (FLI) | Demensforening (FLI) | Combined |
|---|---:|---:|---:|
| Total entities in Brreg | 291 | 173 | **464** |
| Registered in Frivillighetsregisteret | 216 (~74%)* | 154 (~89%) | **~370 (~80%)** |
| With `antallAnsatte > 0` | 7 | 0 | **7** |
| Oldest stiftelsesdato | 1884-12-31 | 1908-01-01 | 1884-12-31 |
| Newest stiftelsesdato | 2023-09-18 | 2025-10-20 | 2025-10-20 |
| Predominant næringskode | 94.992 + 88.996 + long tail | 88.996 + 94.992 (tight cluster) | — |

*Helselag Frivillighetsregisteret rate: page 0 (n=200) had ~146/200 = 73%; page 1 (n=78 of 78 actually returned, totalElements=291 minus 200 = 91 expected, observed 78) had ~70/78 = ~90%. Aggregate is roughly 74% — markedly lower than NF's 88% and N.K.S.'s 90% — driven by the long tail of pre-1960 helselag that exist in Enhetsregisteret but never enrolled in Frivillighetsregisteret (which only opened in 2009). Demensforening, mostly post-2000, register at near-N.K.S. rates.

### Sizing reading

- **Approximately 80% of Nasjonalforeningen lokallag have own org.nr in Frivillighetsregisteret**, somewhat lower than NF (88%) and N.K.S. (90%) but high enough that Grasrotandelen and Brreg joins work for the vast majority of chapters.
- **Only 7 chapters have registered employees, all helselag**, none demensforening. Suggests these 7 helselag may operate small institutions (unlike N.K.S.'s sykehjem operators, the scale here is much smaller — none are likely to operate full sykehjem; more likely barnehage or aktivitetshus). Confirmation would require checking each chapter's website. The largest by employees identified in the sample is `NASJONALFORENINGEN FOR FOLKEHELSENS HELSELAG I NORDRE LAND`.
- **Brreg total of 464 vs NF's stated 430** is a typical 5–10% gap — older registered-but-dormant helselag still in Brreg but not on NF's count. NF's `bli-frivillig` page wording ("vi har 430 lokallag") is the operating-chapter count; Brreg is the legal-entity-still-registered count.
- **No N.K.S.-style institutions layer**. Where N.K.S. has 10 employee-bearing chapters running sykehjem/barnehage/Kvinnehelsehus, NF's 7 ansatte-bearing chapters are an order of magnitude smaller and probably don't constitute an asset-layer on the N.K.S. scale. The institutions axis from `sanitetskvinnene-activities.md` is **not needed for NF**.

## Comparison to Red Cross, Norsk Folkehjelp, and Sanitetskvinnene

### Shared activities (four-way overlap where applicable)

| Red Cross | Norsk Folkehjelp | Sanitetskvinnene | Nasjonalforeningen | Notes |
|---|---|---|---|---|
| Besøkstjeneste (232) + Besøksvenn med hund (127) + Kulturvenn | — | Kløvertur (~275) | Aktivitetsvenn (~140 kommuner, ~2 400 volunteers) | **All three other orgs have a 1-to-1 elderly-companionship line, but Nasjonalforeningen's Aktivitetsvenn is the only one specifically scoped to people with dementia.** Strongest functional peer is RC Besøkstjeneste, but Aktivitetsvenn is centrally trained + quality-assured (RC isn't). |
| BARK (62) + Treffpunkt | Samfunnsarbeid (~51) | Lesevenn (~55) + Sisterhood (~45) | Sanggrupper / Demenskor (~150) | All have group-based community programmes; NF's are uniquely intergenerational + dementia-coded. Demenskor is closest to Sisterhood in being a national-branded weekly format, but for an entirely different demographic. |
| (Nothing) | (Nothing) | Kløvertur (~275) | Gå- og treningsgrupper (~250) | NF + N.K.S. both run organised walking groups. RC and NF (folkehjelp) don't. The aging-membership profile of both health-focused orgs makes outdoor low-threshold activity their natural community-engagement form. |
| (Nothing — Krisesenter aktivitet ved is for children) | (Nothing) | Ressursvenn (~45) | Pårørendegrupper for demens (~150) | All four orgs have small peer-support / mentor lines, but NF's is for pårørende of dementia patients (caregivers), not direct service-users. Closest functional peer is N.K.S. Ressursvenn (post-violence women), and the operational template is similar — trained volunteer + structured group. |
| (Nothing) | (Nothing) | Stopp partnervold + Kvinnehelse-advocacy | Demensvennlig samfunn (~200 kommuner) + politisk påvirkning | All four have advocacy lines; NF's is the most kommune-coupled and the most behaviour-change-oriented (training butikkansatte etc.). |
| Hjelpekorps + Beredskapsvakt | Førstehjelp og redningstjeneste | Omsorgsber. (~360) | (None) | **The single biggest activity gap.** NF has no beredskap arm whatsoever. The other three orgs all do; NF doesn't. NF's identity is forskning + folkeopplysning + pårørendestøtte, not respons. |
| Norsktrening + Flyktningguide + Migrasjon | Flyktning og inkludering | Språkvenn | (None) | NF has no migrasjon line. |
| RØFF + Ung | Sanitetsungdom + Solidaritetsungdom | Sisterhood + Dig In + unge sanitetsforening | (Very weak — sporadic skolebesøk + folkehelseuke) | NF's youth footprint is the weakest of the four orgs. There is no equivalent of RØFF, no Sanitetsungdom, no Sisterhood — only national-level prevention messaging (røyking, fysisk aktivitet) delivered through schools when invited. |

### Nasjonalforeningen-unique activities (no RC, NF-folkehjelp, or N.K.S. parallel)

| NF activity | What it is | Why no other org has it |
|---|---|---|
| **Aktivitetsvenn** | Centrally-trained 1-to-1 volunteer companion specifically for a person with dementia. ~2 400 volunteers in ~140 kommuner. | RC Besøkstjeneste and N.K.S. Kløvertur are general elder-care; Aktivitetsvenn is dementia-scoped and individualised. Closest functional peer is RC `Besøksvenn med hund` (a structured 1-to-1 with central training), but Aktivitetsvenn has a clinical-care-pathway adjacent role that no other org claims. |
| **Demenskor** | Singing groups for persons with dementia + pårørende. Wave of 2023+ post-NRK series. | Music-as-therapy with this specific dementia-coded format is NF's flagship; N.K.S. has no dementia line, RC has no dementia line, NF-folkehjelp has no health-condition-coded chapter activity. |
| **Pårørendeskole** | Structured course for caregivers of persons with dementia, often co-delivered with kommune. | Caregiver-education programmes exist elsewhere (LHL has likepersonsarbeid; Kreftforeningen has pårørendetilbud) but NF's is the only canonical 6–8 weeks programme with national curriculum. |
| **Hjertegruppa** | Post-MI / post-revascularisation training and peer support, run by helselag in partnership with sykehus rehab departments. | RC has no condition-specific support; N.K.S. has no cardiovascular line; LHL has parallel patient-support but with a more explicit pasientorganisasjon framing. |
| **Demensvennlig samfunn — kommunesertifisering** | Norway-wide kommune programme: ~200 kommuner participate, butikkansatte-training, demensvennlig planning advice. | Closest analogy is N.K.S.'s Kvinnehelsealliansen (national women's health policy network) but Demensvennlig samfunn is the only one that names and certifies individual kommuner. |
| **Helsetelefoner: Hjertelinjen + Demenslinjen** | Two condition-specific national helplines staffed centrally. | RC has Kors på halsen (children); N.K.S. has no national helpline; NF-folkehjelp has none. Mental Helse's Hjelpetelefonen is the only structural parallel. |

### Framework-fit assessment

Nasjonalforeningen is Tier-A in `ngo-landscape.md` (430+ lokallag, ~80% with own org.nr). Three specific framework deltas relative to the RC + NF + N.K.S. composite template:

1. **Chapter-type field is required.** This is the single most important new field. `chapter_type ∈ {helselag, demensforening, combined, other}` derived from name regex. **Cleaner to implement than N.K.S.'s institutions sub-table** because it's flat (one enum field), exhaustive (covers 99% of chapters), and name-encoded (no extra data source needed). Recommend committing this as a first-class field in the common chapter schema — it's also useful for any future dual-typology org (e.g. Mental Helse fylkes- vs lokallag have a similar split).
2. **No chapter-level CMS activity vocabulary; activities live one level up.** Where RC has 25+ free-text per-chapter names, NF-folkehjelp has 6 fixed bins, and N.K.S. has 7 fixed bins, **NF has zero chapter-level activity tagging.** What a chapter does is inferred entirely from its `chapter_type` plus the central programme footprint. The chapter-detail page would show "this is a demensforening — likely activities are pårørendegruppe + Aktivitetsvenn + Demenskor; check Facebook for current schedule." The activity matrix becomes a **type × activity-likelihood crosstab**, not a chapter × activity boolean. This is a *simpler* model than RC's, but the loss of chapter-level granularity is significant — the framework will look thin on NF compared to RC unless we backfill from Facebook scrape.
3. **No beredskap, no migrasjon, no youth.** Three of the dominant Tier-A activity columns simply don't exist for NF. The chapter-finder activity-filter UI for NF will look quite different — heart vs dementia + a small handful of community-life rows.
4. **Demensvennlig kommune is a kommune-level programme overlay.** ~200 kommuner participate in Demensvennlig samfunn; this is a kommune-attribute, not a chapter-attribute. The data model already has kommune as a join axis (for indicators); adding a `demensvennlig_status` kommune-attribute is a small extension.

Net: **~55% of the Red Cross framework maps across directly** (finder, chapter page scaffold, pathways, Brreg/Lottstift/Grasrotandelen backbone). ~10% needs the new `chapter_type` field. ~30% is condition-specific indicator work (see next section). ~5% is the Demensvennlig kommune overlay.

The reuse rate is lower than NF-folkehjelp's 75% and N.K.S.'s 65% because **NF is the first org in the comparison set that doesn't fit the humanitarian-beredskap-migration triangle at all.** It is a single-mission health-and-pårørende organisation, and the framework's bias toward humanitarian/social-work activities shows up as low coverage. The flip side is that the type bifurcation gives a clean structural extension axis that will generalise to other patient orgs (LHL, Diabetesforbundet, NHF — all of which have parallel disease-specific sub-organisations).

## Indicator-requirement signals

Activities NF runs imply **disease-specific indicator columns** that are not in the current RC + NF-folkehjelp + N.K.S. matrix. What's actually machine-readable:

| Indicator | Source | Machine-readable? | Which NF activity it supports |
|---|---|---|---|
| **Hjerte- og karregisteret per kommune** | [statistikk.fhi.no/hkr](https://statistikk.fhi.no/hkr/) (PxWeb statistics bank, formerly statistikkbank.fhi.no/hkr/ — redirected 2024). Covers 2012–2023 (newer years rolling out). Geographic granularity per the FHI redesign: fylke for most cuts, kommune for some prevalence/incidence cuts. | **Yes** via PxWeb API once you locate the right table; the public statistikk.fhi.no surface intermittently 503s in WebFetch — accessible from a real browser. Programmatic access via PxWeb URL pattern. | Hjertegruppa siting; helselag prioritisation |
| **Dødsårsaksregisteret — cardiovascular + dementia subset** | FHI overtok DÅR fra SSB i 2014. PxWeb endpoint at FHI Folkehelsestatistikk. SSB statbank `/dodsarsak/` is now a sluttarkiv (2013-11-01 last). | **Partial**: most-detailed kommune × kjønn × alder × dødsårsak cuts are restricted (datatilgang@fhi.no application required). Aggregate kommune × broad-cause-group cuts are open via PxWeb. | Both helselag and demensforening — baseline mortality footprint |
| **FHI Folkehelseprofil — kommune** | [helsedirektoratet.no/folkehelseprofil](https://www.helsedirektoratet.no/forebygging-diagnose-og-behandling/forebygging-og-levevaner/folkehelsestatistikk-og-profiler) | **Yes** as PDF per kommune; underlying tables live in FHI Folkehelsestatistikk PxWeb. Includes hjerte- og karkomponenter (røyking, fedme, fysisk aktivitet) per kommune. | All NF activities — generic folkehelse signal |
| **Demensregisteret (FHI)** | Not yet a public statistics bank with kommune cuts. FHI publishes aggregate dementia projection figures (currently ~110 000 with dementia in Norway, projected ~240 000 by 2050). Per-kommune projection is published by FHI as part of `Demens i Norge` rapport but not as a queryable API. | **No** for kommune-level prevalence as machine-readable open data. **Workaround**: combine SSB befolkning 65+ per kommune with FHI age-stratified prevalence rate (~2% at 65+, ~9% at 75+, ~25% at 85+, ~40% at 90+) to produce a derived per-kommune dementia-prevalence estimate. This is what NF's own kommune-prioritisation work does. | Demensforening + Aktivitetsvenn siting |
| **Hjerneslag-statistikk per kommune** | [statistikk.fhi.no/hkr](https://statistikk.fhi.no/hkr/) — slag is part of HKR. Per-kommune incidence and prevalence cuts available. | **Yes** via PxWeb (same statistikkbank as HKR) | Hjertegruppa adjacent — slagrammede support (note: NF Stavanger has a separate `Slagforeningen Rogaland` lokallag) |
| **Befolkning 65+ og 80+ per kommune** | [SSB statbank tabell 07459 / 07984](https://www.ssb.no/statbank/) — open PxWeb API. | **Yes** — fully open, kommune × kjønn × ettårig alder × årgang. The single most-important demographic signal for NF. | Both types — primary target-population sizing |
| **Hjemmebaserte tjenester / sykehjemsdekning per kommune** | SSB KOSTRA (helse- og omsorg) — open PxWeb. | **Yes** — `KOSTRA tjenestetilbud helse og omsorg`. | Aktivitetsvenn capacity-planning; Pårørendegrupper signal |
| **Pårørendebelastning** | No direct register; FHI HUNT-data, Helsedirektoratet pårørendeundersøkelse. | **Limited** — survey-based, not kommune-fine-grained. | Pårørendeskole signal |
| **Demensvennlig kommune-status** | NF's own list at [nasjonalforeningen.no/tilbud/disse-kommunene-er-med](https://nasjonalforeningen.no/tilbud/disse-kommunene-er-med/) | **Scrape**: ~200 kommuner listed on the NF site. Not in any public register. | Self-reference — useful for both UI and as a programme-coverage indicator |
| **Aktivitetsvenn-kommuner** | NF central programme list (~140 kommuner per the central page) | **Scrape**: not separately listed publicly; we know the count (140) but not the per-kommune list without contacting NF. | Aktivitetsvenn coverage UI |

### Architecture implication

The NF matrix needs **a condition-specific health-indicator column family** — distinct from the omsorg/integrasjon/beredskap columns the RC + NF-folkehjelp + N.K.S. composite uses. Specifically:

- **Hjerte- og kar** column: from FHI HKR PxWeb + SSB røyking/fedme.
- **Demens-prevalens (derived)** column: SSB befolkning 65+/75+/85+ × FHI age-stratified prevalence.
- **Pårørende-belastning (proxy)** column: SSB aleneboende 65+ + KOSTRA hjemmesykepleie + andel personer med demens i institusjon vs hjemme.
- **Demensvennlig kommune-status** flag: from NF's own list.

These are all eventually queryable from public sources, but the demens-prevalens-per-kommune part needs a derived calculation — there is no FHI "Demensregister" with open kommune-level statistics yet. The Demensregister exists at FHI as a clinical register (DemReg), but is not exposed as kommune-level open data as of 2026-04-18.

This indicator family is **disjoint from the N.K.S.-specific kvinnehelse columns** introduced in `sanitetskvinnene-activities.md`. In other words: each new Tier-A NGO so far has added a fresh indicator-column family, not just remixed existing ones. The framework should plan for this — indicator columns are **per-org pluggable**, not a fixed set.

## Open question / missing data

- **Sub-activity granularity is invisible.** The fylke listings carry name + Facebook URL only. Whether `Nasjonalforeningen Bergen demensforening` runs Demenskor + Aktivitetsvenn + Pårørendegruppe + samtalegruppe + Demensvennlig-Bergen-arbeid is impossible to know without scraping its Facebook page or asking. Per-chapter activity matrix is **unavailable from public data**.
- **No individual chapter pages** on `nasjonalforeningen.no`. Tested several `/lokallag/{fylke}/lokallag-i-{fylke}/{slug}/` URLs — all 404. The chapter's web presence is its Facebook page. This is materially different from RC, NF-folkehjelp, and N.K.S. all of which have per-chapter pages on the central CMS.
- **Active vs dormant chapter status is not surfaced.** Brreg shows several helselag with stiftelsesdato 1884–1929 still active. NF's "430 lokallag" count vs Brreg's 464 FLI suggests ~7% inactive-but-still-registered. Identifying the dormant tail would need either an outreach pass or a Facebook-activity heuristic.
- **Combined-type chapters: legal structure unclear.** 3 chapters list as "demensforening og helselag" or similar (Kristiansund, Surnadal, Skodje). Whether Brreg carries each as a single FLI or two sibling FLIs needs verification. The page-2 helselag query did surface a few "kombinert"-named entities but not these three explicitly.
- **The 7 employee-bearing helselag**: identities and what they operate are not all known. `NASJONALFORENINGEN FOR FOLKEHELSENS HELSELAG I NORDRE LAND` is one. The others would need a `harRegistrertAntallAnsatte=true` filter applied to the full Brreg query — doable but not done in this pass.
- **Demenskor count: not on the NF website.** A 2024 NRK series triggered a "demenskor til hver kommune"-opprop on kor.no. Actual current operating count is not published. The closest proxy is the ~200 demensvennlige kommuner list, but those are not 1:1 demenskor.
- **Hjertegruppa count: not on the NF website.** Was historically run with sykehus rehab departments. Whether the programme is still active, scaled down, or fully replaced by helseforetak's own rehab pathways is unclear from public sources. This is a real gap — Hjertegruppa is one of NF's flagship programmes per the brief, but doesn't surface on the bli-frivillig page or in the central tilbud structure.
- **Demensregister with kommune cuts is not open data.** FHI's clinical Demensregister (DemReg) exists but doesn't publish a kommune-level statistikk-bank. Per-kommune dementia prevalence has to be derived from age-stratified rates × SSB demography. This is fine but needs documenting in any indicator-pipeline.
- **Senior-senter and Slagforeningen edge cases**: 4–6 entities don't fit the helselag/demensforening typology. Worth a small lookup-override but not a structural concern.

## References

- [Nasjonalforeningen — bli frivillig](https://nasjonalforeningen.no/bli-frivillig/) — canonical volunteer-activity framing (6 activities)
- [Nasjonalforeningen — lokallag overview](https://nasjonalforeningen.no/lokallag/) — 15 fylkeslag entry points
- [Nasjonalforeningen — Aktivitetsvenn](https://nasjonalforeningen.no/aktivitetsvenn/) — central programme description (~2 400 volunteers, ~140 kommuner)
- [Nasjonalforeningen — Demensvennlige kommuner](https://nasjonalforeningen.no/tilbud/disse-kommunene-er-med/) — ~200 kommuner participating
- Per-fylke listings (15 of 15 fetched 2026-04-18):
  - [Oslo](https://nasjonalforeningen.no/lokallag/oslo/lokallag-i-oslo/) — 5 chapters
  - [Akershus](https://nasjonalforeningen.no/lokallag/akershus/lokallag-i-akershus/) — 12
  - [Innlandet](https://nasjonalforeningen.no/lokallag/innlandet/lokallag-i-innlandet/) — 56
  - [Vestfold og Telemark](https://nasjonalforeningen.no/lokallag/vestfold-og-telemark/lokallag-i-vestfold-og-telemark/) — 20
  - [Trøndelag](https://nasjonalforeningen.no/lokallag/trondelag/lokallag-i-trondelag/) — 46
  - [Nordland](https://nasjonalforeningen.no/lokallag/nordland/lokallag-i-nordland/) — 39
  - [Rogaland](https://nasjonalforeningen.no/lokallag/rogaland/lokallag-i-rogaland/) — 27
  - [Agder](https://nasjonalforeningen.no/lokallag/agder/lokallag-i-agder/) — 26
  - [Buskerud](https://nasjonalforeningen.no/lokallag/buskerud/lokallag-i-buskerud/) — 13
  - [Hordaland](https://nasjonalforeningen.no/lokallag/hordaland/lokallag-i-hordaland/) — 45
  - [Sogn og Fjordane](https://nasjonalforeningen.no/lokallag/sogn-og-fjordane/lokallag-i-sogn-og-fjordane/) — 24
  - [Finnmark](https://nasjonalforeningen.no/lokallag/finnmark/lokallag-i-finnmark/) — 24
  - [Troms](https://nasjonalforeningen.no/lokallag/troms/lokallag-i-troms/) — 12
  - [Møre og Romsdal](https://nasjonalforeningen.no/lokallag/more-og-romsdal/lokallag-i-more-og-romsdal/) — 56
  - [Østfold](https://nasjonalforeningen.no/lokallag/ostfold/lokallag-i-ostfold/) — 10
- [Brreg Enhetsregisteret, navn=helselag, organisasjonsform=FLI](https://data.brreg.no/enhetsregisteret/api/enheter?navn=helselag&organisasjonsform=FLI&size=200) — 291 entities, ~74% in Frivillighetsregisteret, 7 with ansatte
- [Brreg Enhetsregisteret, navn=demensforening, organisasjonsform=FLI](https://data.brreg.no/enhetsregisteret/api/enheter?navn=demensforening&organisasjonsform=FLI&size=200) — 173 entities, ~89% in Frivillighetsregisteret, 0 with ansatte
- [FHI HKR Statistikkbank](https://statistikk.fhi.no/hkr/) — hjerte- og karregisteret; 2012–2023 (HKR rebooted on new platform 2024)
- [FHI Folkehelsestatistikk og statistikkbanker](https://www.fhi.no/ta/statistikkalender_og_statistikkbanker/) — index of FHI statistics banks
- [SSB Statbank — dødsårsaker (avsluttet)](https://www.ssb.no/statbank/list/dodsarsak) — SSB closed dødsårsaker series 2013-11-01; FHI took over the register in 2014
- [Helsedata.no — åpne data](https://helsedata.no/no/apne-data/) — health-data open-data overview
- [SNL — Nasjonalforeningen for folkehelsen](https://snl.no/Nasjonalforeningen_for_folkehelsen) — secondary citation: 444 lokallag (2023 figure)
- [Red Cross activities](./redcross-activities.md) — reference template
- [Norsk Folkehjelp activities](./norskfolkehjelp-activities.md) — first peer-org adaptation
- [Sanitetskvinnene activities](./sanitetskvinnene-activities.md) — second peer-org adaptation (introduces institutions + gender extensions)
- [ngo-landscape.md](./ngo-landscape.md) — size/structure context (450+ lokallag, 73 employees, 238m NOK, ~22% Lottstift gov-funded)
