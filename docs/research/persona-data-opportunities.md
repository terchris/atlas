# Persona data opportunities

This note translates `personas.md` into data we should add or promote in the Atlas data model. It is not a generic source catalogue; `data-sources.md` already does that. The focus here is: which missing or underused data would make each persona's experience materially more useful?

Sources read for this pass:

- `personas.md`
- `data-sources.md`
- `redcross-activity-indicator-matrix.md`
- `norskfolkehjelp-activity-indicator-matrix.md`
- `sanitetskvinnene-activity-indicator-matrix.md`
- `nasjonalforeningen-activity-indicator-matrix.md`
- `compare-ngos-spec.md`
- `common-schema.md`
- `sector-research.md`
- `redcross-data-sources-funding.md`
- `tilskuddsmatcher-data-availability.md`

---

## Executive read

The highest-value additions are not one-off datasets. They are reusable layers that make the same source material answer real persona questions.

1. **Activity-instance layer**: per chapter/activity, capture time, place, age range, cost, language, accessibility, coordinator name, phone/email, photos, and last-seen date. This is the biggest lift for Kari, Amira, Sara, Magnus, Tone, and Inger.
2. **Need x coverage overlay**: join chapter presence and activity coverage to kommune/bydel need indicators. Samfunnspuls has need; NGO websites have presence; Atlas should be the layer that joins them.
3. **Funding and methodology layer**: normalise annual reports, Lottstift, Innsamlingskontrollen, ministry/framework funding, and Brreg accounts into comparable metrics with source notes. This is essential for Jonas, Ola, Henrik, and Lisa.
4. **Open-call grant layer**: treat `tilskudd.lottstift.no/ordninger` as the primary current-call source, then enrich with foundations, EU SEDIA, Interreg, and large kommuner. This turns Lisa from a secondary persona into a concrete v1 wedge.
5. **Chapter vitality layer**: founding date, activity count, recent news/events, board/leadership where public, account filing, employee count, active/dormant status, and data freshness. This powers Tone, Magnus, Inger, Arne, and Ola.
6. **Crisis and preparedness layer**: persistent helpline registry plus MET/NVE/DSB/Kartverket/Varsom/Politiet-style situational data for storm mode. This serves Åse, Lars, and Mette.
7. **Provenance layer**: every displayed field needs source URL, scrape/API method, last fetched, and confidence. This is not only for Dev; it is also what makes Jonas and Ola trust the product.

---

## Persona-by-persona recommendations

### 1. Kari — "I want to help, somehow"

Add **activity-instance data**, not just chapter/activity names. Kari does not know the canonical activity vocabulary; she needs concrete answers to "what would I do next Tuesday?".

Best data to add:

- Scraped event/session data from chapter pages across NGOs: title, time, place, recurrence, coordinator, phone/email, cost, prerequisites, and "what you actually do".
- Elderly/social-contact need bundle: SSB `06070` single-person households 65+, SSB `07459`/`10826` age-sex denominators, FHI loneliness/mental-health indicators, KOSTRA home-care load.
- Frivillighet Norge barrier taxonomy from `sector-research.md` as copy metadata: knowledge, time, culture, accessibility, economy, follow-up.

Product value: activity-first matching can say "three ways to visit or support lonely elderly near you" instead of making her pick Røde Kors vs Sanitetskvinnene vs Nasjonalforeningen first.

### 2. Jonas — "I want to donate, but meaningfully"

Add a **funding-truth layer** that avoids naive efficiency comparisons.

Best data to add:

- Annual-report extraction per organisation: total income, restricted/unrestricted funds, purpose/admin/fundraising split, private donations, corporate income, institutional funding, investment income.
- Lottstift grants and open data, but explicitly separate from ministry/framework funding that does not flow through Lottstift.
- Innsamlingskontrollen metrics, source year, and methodology notes.
- Grasrotandelen per chapter where available: org number, direct link, givers, local amount.
- Brreg Regnskapsregisteret accounts for chapters that file.

Product value: Jonas can compare "share to cause" against funding model, private-donor share, and local-giving options instead of seeing a misleading single percentage.

### 3. Amira — "I just arrived and I need people"

Add **integration activity specificity** plus language-aware metadata.

Best data to add:

- Språkkafé/Norsktrening/Flyktningguide-style activity instances: time, address, coordinator, language level, whether drop-in is allowed, whether children can come, photos.
- IMDi bosettingstall, SSB immigration tables (`07110`, `07108`, `05183`, `05184`, `05196`), UDI asylmottak locations, HK-dir norskopplæring/norskprøve where available.
- Language availability on page/activity: Norwegian plain language, English, Arabic/Ukrainian/other relevant languages where local activity pages provide it or where machine translation is approved.

Product value: the app can answer "who meets where, and can I safely text them?" rather than only showing that a chapter has a broad "migrasjon" activity.

### 4. Lars — "I'm worried about my parents out there"

Add **public storm-mode data** that combines hazard, local capacity, and contact paths.

Best data to add:

- MET `metalerts`, NVE/Varsom flood/landslide/avalanche warnings, Kartverket/Geonorge hazard layers, DSB Kommuneundersøkelsen, tilfluktsrom, road and ferry disruption where accessible.
- Rescue-capable chapter index across organisations: Red Cross Hjelpekorps, Norsk Folkehjelp Sanitet, Redningsselskapet, local preparedness contacts.
- Public contact and escalation rules: who can be called by the public, when to use 110/112/113, when to call kommune crisis line, and when NGO contacts are informational only.

Product value: Lars sees "what is happening here and who is nearby" in one minute, not a pile of national PDFs and organisation-specific pages.

### 5. Tone — "I might join a chapter / I'm a board member"

Add **chapter vitality and structure**.

Best data to add:

- Brreg founding date, legal status, board roles where public, employees, Frivillighetsregisteret membership, account filing status.
- Scraped activity mix, event/news recency, page freshness, and coordinator presence.
- Historical context from Nasjonalbiblioteket, Wikidata/Wikipedia, chapter pages, and archive-style sources where available.
- Organisation-specific structure fields from `common-schema.md`: `chapter_type` for Nasjonalforeningen, `institutions` for N.K.S., pathway flags for campaign/member/donate/volunteer.

Product value: Tone can compare "healthy chapter" signals across organisations without needing to understand every NGO's internal structure.

### 6. Ola — "I want to see the numbers"

Add **citation-ready sector data and exports**.

Best data to add:

- Every metric in compare/coverage views should carry `source_url`, year, methodology note, and last fetched.
- SSB satellite account sector numbers from `sector-research.md`: GDP share, volunteer årsverk, income composition.
- Cross-org chapter counts, pathway types, funding composition, geography, activity coverage, and gaps.
- Downloadable CSV/JSON for derived views, or at minimum an "Om dataene" page with source list and methodology.

Product value: Ola can cite the app because it behaves like a transparent research surface, not a marketing site.

### 7. Inger — chapter leader

Add **data quality and correction metadata**.

Best data to add:

- Last-seen timestamp per scraped field.
- Source URL per activity/contact/photo.
- "Meld feil" route that stores field, correction text, reporter context, and target organisation/contact.
- Public confidence flags: "from API", "from chapter page", "from Brreg", "not recently verified".

Product value: Inger trusts the public rendering because she can see where the data came from and how to fix it.

### 8. Arne — district coordinator

Add **district planning views from the coverage overlay**.

Best data to add:

- Chapter coverage by district/kommune across organisations.
- Activity-specific need indicators from the common bundle: age/sex, household composition, child poverty, child welfare, refugee settlement, FHI profiles, DSB preparedness, sentralitet.
- Recruitment and activity-gaps: high need + no active local activity + nearby chapter with adjacent capacity.

Product value: Arne can spot where a district has too little activity coverage, or where cooperation with another NGO is more realistic than starting from scratch.

### 9. Signe — national office planner

Add **competitor/collaborator overlays**.

Best data to add:

- Cross-org activity taxonomy: map local terms into common activity families without erasing original names.
- Organisation presence by kommune/bydel, activity family, target group, and pathway.
- Comparable metrics that internal single-org tools usually miss: other NGOs' coverage, public-facing freshness, and local contactability.

Product value: Signe sees what the public sees across the whole sector, not only her organisation's internal dashboard.

### 10. Mette — emergency response coordinator

Add **operational-adjacent preparedness data**, with a hard public/private boundary.

Best data to add:

- Public hazard and municipal readiness data: MET, NVE, Varsom, DSB, Kartverket, Vegvesen, tourist overnights, road-accident exposure.
- Public rescue-capable chapter footprint.
- Non-public wishlist, separated from v1 public app: operational status, phone trees, rehearsal data, equipment, trained volunteers.

Product value: the public app can support awareness and routing, while documenting what would require an internal tool or NGO partnership.

### 11. Lisa — tilskuddsansvarlig

Add the **open-call grant layer**.

Best data to add:

- Primary: `tilskudd.lottstift.no/ordninger`, parsed from `__NEXT_DATA__`, with stable `DT-XXXX` IDs, deadline, grantor, eligibility, amount, purpose, and status.
- Secondary: Stiftelsen Dam, Gjensidigestiftelsen, Sparebankstiftelsen DNB, Fritt Ord, EU SEDIA API, Interreg ICS, and large kommune grant pages.
- Matching metadata: target groups, activity tags, eligibility org types, geography, typical grant size, historical award pattern, and related need indicators.

Product value: Lisa sees "three open calls that fit your activities and local need" instead of another retrospective grant database.

### 12. Magnus — existing active volunteer

Add **chapter public-profile QA signals**.

Best data to add:

- Same activity-instance layer as Kari/Amira/Sara, but with data-freshness and mismatch warnings.
- Recent news/events feed, contact freshness, discontinued-activity detection, and "last verified from source".
- Error-reporting workflow routed to the correct source owner.

Product value: Magnus can share the page with a recruit and flag wrong data without feeling the app is pretending to replace internal tools.

### 13. Henrik — corporate partnership lead

Add **office-footprint x need x partner-contact data**.

Best data to add:

- Company office locations as user-provided input; join to chapter coverage and local need indicators.
- Macro sector stats: GDP share, volunteer årsverk, funding composition, chapter/station/unit footprint.
- Corporate partnership contact paths per organisation, including national intake and regional contacts where public.
- Funding and impact context: what kinds of activities in the company's geographies have unmet need.

Product value: Henrik can scope a serious multi-region partnership instead of being pushed into a private-donor checkout.

### 14. Åse — person in acute crisis

Add a **maintained crisis-resource registry**.

Best data to add:

- Persistent helpline table with phone number, target group, opening hours, owner, source URL, and when to use emergency numbers instead.
- Contextual tags: mental health, children/youth, violence, forced marriage, abuse, flood/fire/weather event, acute medical/police/fire.
- Page-level routing rules: crisis band always visible, not dependent on organisation or location.

Product value: Åse gets the right number immediately. This is a data-maintenance obligation, not just a UI component.

### 15. Dev — developer exploring Norwegian civil-society data

Add **machine-readable provenance and schema documentation**.

Best data to add:

- "Om dataene" page generated from source metadata: source, endpoint, licence, auth, cadence, fields used, caveats.
- Per-field attribution in the app: source URL, fetched timestamp, transformation notes.
- Public schema docs based on `common-schema.md` and a small sample export.

Product value: Dev can understand and reuse the stack, and the project becomes a reference implementation for Norwegian civil-society data.

### 16. Sara — 15-year-old interested in youth activities

Add **youth eligibility and safety metadata**.

Best data to add:

- Activity-instance fields: age min/max, parental consent, cost/free, equipment needed, adult contact, whether a parent must be involved, meeting time/place, photos that match the target age.
- Youth need/supply indicators: SSB age/sex by kommune/bydel, FHI/Oppvekstprofil, Ungdata, Udir Elevundersøkelsen/nasjonale prøver/fravær, Bufdir child poverty/barnevern.
- Youth support resources: Kors på halsen and other youth helplines in the crisis registry.

Product value: Sara can filter across organisations by age and expectation, and the app does not accidentally push a minor into an adult signup flow.

---

## Current ingest status

This status reflects source folders currently implemented under `atlas-data-repo/ingest/src/sources`. "Implemented" means the ingest code exists; it does not necessarily mean every downstream mart/model or UI surface is complete.

### Already implemented source groups

| Data group | Implemented sources | Personas currently helped | What they gain |
|---|---|---|---|
| Red Cross supply skeleton | `redcross-branches` | Kari, Amira, Lars, Tone, Ola, Inger, Arne, Signe, Mette, Magnus, Dev | Baseline Red Cross branch hierarchy, locations and branch activities. Enough to build first chapter/activity coverage maps for one NGO. |
| Geography dimensions | `ssb-klass-kommuner`, `ssb-klass-fylker` | Everyone using local views | Canonical kommune/fylke codes and names for joins, filtering and maps. |
| Age/sex denominator | `ssb-07459` | Kari, Sara, Tone, Ola, Arne, Signe, Lisa, Henrik | Kommune/fylke/country population by single-year age and sex. Core denominator for need rates and target-age filters. |
| Population change | `ssb-06913` | Ola, Arne, Signe, Henrik | Context on growth/decline, births, deaths and migration at kommune/fylke level. |
| Household/family vulnerability | `ssb-06083`, `fhi-bor-alene` | Kari, Tone, Arne, Lisa, Nasjonalforeningen-style elderly flows | Family type, single-parent patterns and adults living alone. Useful for loneliness, care and family-pressure signals. |
| Income and low-income | `ssb-06944`, `ssb-06947`, `ssb-08764`, `ssb-12944` | Kari, Jonas, Ola, Lisa, Henrik, Sara, Arne | Household income, whole-population low income, children in low-income households and persistent low income. Strong evidence base for child/youth, poverty and grant applications. |
| Education/youth wellbeing | `ssb-09429`, `fhi-mobbing`, `fhi-vgs-gjennomforing`, `ssb-12063` | Sara, Kari, Ola, Lisa, Arne, Signe | Education level, bullying, upper-secondary completion and municipal youth/leisure support. Useful for youth activity targeting and grant evidence. |
| Housing | `fhi-trangbodd` | Amira, Sara, Kari, Lisa, Arne | Overcrowded housing as a concrete pressure signal for integration, child/youth and family activities. |
| Social assistance | `ssb-12131`, `ssb-12132`, `ssb-13995` | Kari, Sara, Lisa, Ola, Henrik | Social assistance rates, rules, cases, amounts and duration. Useful for economic vulnerability and funding applications. |
| Care services | `ssb-12292` | Kari, Tone, Nasjonalforeningen-style elderly personas, Lisa, Arne | Nursing-home and home-care indicators. Useful for elderly social-contact, caregiver load and care-service gap proxies. |
| FHI profile substitutes | `fhi-bor-alene`, `fhi-mobbing`, `fhi-trangbodd`, `fhi-vgs-gjennomforing` | Kari, Sara, Lisa, Arne, Signe | First implemented FHI OpenAPI layer. Covers living alone, bullying, overcrowding and VGS completion; proves the non-SSB ingest path. |

### What is not implemented yet

| Gap | Why it matters | Personas blocked or under-served |
|---|---|---|
| Bydel age/sex denominator `ssb-10826` | `ssb-07459` is implemented, but the bydel table added to `data-sources.md` is not yet in the ingest tree. Oslo/Bergen/Stavanger/Trondheim need this for lowest-level age/sex views. | Kari, Sara, Tone, Ola, Arne, Signe, Lisa, Henrik |
| Activity-instance scrapers | Current Red Cross data says a branch has an activity, but not when, where, age range, cost, coordinator, photos or meeting expectations. | Kari, Amira, Sara, Magnus, Inger, Tone |
| Non-Red-Cross NGO supply | Only Red Cross branch/activity supply is ingested. Norsk Folkehjelp, Sanitetskvinnene, Nasjonalforeningen, Redningsselskapet and others remain research/planned sources. | Kari, Amira, Lars, Tone, Ola, Henrik, Arne, Signe, Magnus |
| Funding-truth ingest | Lottstift, annual reports, Innsamlingskontrollen, Brreg accounts and ministry/framework funding are catalogued but not ingested as comparable organisation metrics. | Jonas, Ola, Henrik, Lisa |
| Open grant-call ingest | `tilskudd.lottstift.no/ordninger` and foundation/EU/kommune call sources are researched but not implemented. | Lisa, Arne, Signe |
| Crisis-resource registry | Emergency/helpline numbers are in `personas.md`, not maintained as data with owner, hours, source and routing rules. | Åse, Sara, Lars |
| Preparedness/hazard ingests | DSB, MET, NVE/Varsom, Kartverket hazard layers and road disruption are catalogued but not implemented. | Lars, Mette, Åse |
| Chapter vitality and provenance layer | Ingest outputs have `loaded_at`-style fields, but there is no unified public-facing freshness/confidence/correction model. | Tone, Magnus, Inger, Ola, Dev |
| Organisation-specific extensions | N.K.S. institutions/gender indicators and Nasjonalforeningen `chapter_type`, disease pipelines and coverage flags are not implemented. | Tone, Kari, Lisa, Ola, Henrik, Nasjonalforeningen/N.K.S.-specific users |

---

## Prioritized data roadmap

The priority order below starts from the current ingest state, not from an empty project. It favours data that unlocks several personas and can be reused across multiple organisations.

| Priority | Add | Current status | Personas served | What they gain |
|---|---|---|---|---|
| P0 | **Activity-instance schema and scrapers** for event/session/contact detail | Not implemented. Red Cross branch/activity skeleton exists, but no time/place/coordinator layer. | Kari, Amira, Sara, Magnus, Inger, Tone | Concrete "what happens where, when, for whom, and who do I contact?" instead of abstract activity labels. This is the biggest public-user value gap. |
| P0 | **Unified source provenance and freshness model** | Partly present per raw ingest (`loaded_at`, source READMEs), not unified into a public data-quality layer. | Dev, Ola, Jonas, Inger, Magnus, Tone | Trust, citation, and correction. Users can see source, date, confidence and report wrong data. |
| P0 | **Crisis-resource registry** | Not implemented as data. Helpline list exists only in persona research. | Åse, Sara, Lars | Immediate correct emergency/helpline routing on every page, with owner/source/opening-hours metadata. |
| P0 | **SSB bydel age/sex `10826`** | Catalogued in `data-sources.md`; not implemented under `sources`. `07459` kommune/fylke age/sex is implemented. | Kari, Sara, Tone, Ola, Arne, Signe, Lisa, Henrik | Lowest-level demographic denominator in Oslo, Bergen, Stavanger and Trondheim; enables bydel-normalised activity and need views. |
| P1 | **Non-Red-Cross NGO supply scrapers** starting with Norsk Folkehjelp, Sanitetskvinnene and Nasjonalforeningen | Scraper convention exists; no NGO scraper folders yet. | Kari, Amira, Lars, Tone, Ola, Henrik, Arne, Signe, Magnus | Organisation-neutral discovery. Users can compare real local options across NGOs instead of seeing a Red Cross-only Atlas. |
| P1 | **Need x coverage mart** joining current ingests to chapter/activity coverage | Inputs partly implemented: Red Cross supply, kommune/fylke dimensions, age/sex, poverty, housing, social assistance, care, youth/FHI indicators. | Arne, Signe, Lisa, Ola, Henrik, Kari | Turns raw indicators into "high need + low coverage" views for planning, grants, partnerships and public explanation. |
| P1 | **IMDi/UDI/HK-dir integration stack** | Catalogued; not implemented in `sources`. | Amira, Kari, Lisa, Arne, Signe | Stronger integration and language-practice targeting: settlement, asylum reception centres, adult Norwegian training and norskprøve context. |
| P1 | **Bufdir child poverty/barnevern API/monitor ingests** | Some low-income proxies are implemented via SSB, but Bufdir monitor/API is not in `sources`. | Sara, Kari, Lisa, Arne, Signe | Better child/youth need evidence, including monitor-specific indicators and bydel/delbydel coverage where Bufdir supports it. |
| P1 | **Funding-truth layer**: Lottstift, annual reports, Innsamlingskontrollen, Brreg accounts, ministry/framework funding | Researched and catalogued; not implemented. | Jonas, Ola, Henrik, Lisa | Honest donation and organisation comparison: funding mix, efficiency with methodology, local giving, and grant dependence. |
| P1 | **Open grant-call layer** beginning with `tilskudd.lottstift.no/ordninger` | Feasibility researched; not implemented. | Lisa, Arne, Signe | Current open calls matched to activity profile, eligibility, geography and local need. This is the clearest internal-user wedge. |
| P1 | **Preparedness/hazard stack**: DSB, MET, NVE/Varsom, Kartverket/Geonorge, Vegvesen | Catalogued; not implemented. | Lars, Mette, Åse, Henrik | Storm mode and preparedness compass: local hazard context plus rescue-capable coverage. |
| P2 | **Chapter vitality inputs**: news/event recency, board/leadership where public, account filing, status, history | Some static Red Cross fields and Brreg-style plans exist; no unified vitality layer. | Tone, Magnus, Inger, Ola, Arne | Helps users distinguish active, contactable, healthy chapters from dormant or stale ones without hiding source uncertainty. |
| P2 | **N.K.S. gender/institution extensions** | Researched in `sanitetskvinnene-activity-indicator-matrix.md`; not implemented. | Kari, Amira, Sara, Tone, Lisa, Henrik | Women's-health, violence, immigrant-women, young-women and institution-aware views that the common bundle cannot express. |
| P2 | **Nasjonalforeningen extensions**: `chapter_type`, dementia/cardiovascular indicators, age projections, coverage flags | Researched in `nasjonalforeningen-activity-indicator-matrix.md`; not implemented. | Kari, Tone, Ola, Lisa, Henrik | Dementia/heart-specific coverage and need maps; better elderly-focused chapter comparison. |
| P2 | **Global/campaign context panels** for international and advocacy activities | International sources catalogued; not implemented in runtime ingests. | Ola, Henrik, Dev, NF Solidaritetsungdom-style users | Gives global/campaign activities useful context without pretending they are kommune-need services. |
| P2 | **Legal/jurisdiction layers** for non-kommune activities | Catalogued; not implemented. | Ola, Lisa, activity-specific users, Vitnestøtte-style flows | Prevents wrong kommune joins where the real geography is rettskrets, court, institution or programme area. |
| P3 | **Sector research refresh layer** for Frivillighetsbarometeret/ISF/SSB satellite account | Research captured in docs; not implemented as data. | Kari, Sara, Jonas, Ola, Tone, Henrik, Dev | Keeps public copy and compare pages grounded in current sector evidence rather than stale manually copied figures. |

---

## What not to overbuild

- Do not add more kommune indicators before the activity-instance layer. Kari, Amira and Sara need time/place/contact first.
- Do not show share-to-cause without methodology and funding-model context.
- Do not force every activity into kommune need mapping. Some are court-district, global, campaign, institutional, or programme-level.
- Do not treat Lottstift geography as spend geography; it is recipient-address geography.
- Do not make internal emergency operations look public. Storm mode needs a strict public-information boundary.
