# Data sources

This document lists every data source we've discussed across the conversation, what it contains, how we access it, and what it uniquely contributes to the project.

---

## Primary — the spine of the project

### 1. Red Cross Organizations API

- **URL**: `https://api.redcross.no/nrx/v1/organizations`
- **Portal**: https://developer.redcross.no/api-details#api=organizations&operation=getOrganizations
- **Auth**: Requires `Ocp-Apim-Subscription-Key` header (free, request via portal)
- **Format**: JSON
- **Pagination**: None — a single call returns all branches

**What it brings:**
- Complete hierarchy of every Red Cross organizational unit in Norway: National Office → 19 Districts → ~400 Local Chapters
- Per-branch identity: `branchId`, `branchNumber`, `branchName`, `branchType` (Lokalforening / Distrikt / Nasjonalkontor)
- Norwegian organization number (`organisasjonsnummer`) — the key to cross-referencing with Brreg
- Status: active/terminated, creation date (chapters going back to 1865), termination date
- Location: municipality, county, region, postal address, street address, **GeoJSON Point coordinates**
- Contacts: array of people with role, name, email, phone, volunteer/member status
- Communication: chapter phone, email, website
- Activities: list of `{globalActivityName, localActivityName}` — canonical activity type + chapter-specific name
- Hierarchy parent via `branchParent`

**Why it's the spine:** It's the only structured source that ties everything together — coordinates enable maps, org numbers enable Brreg joins, branch names enable website scraping, activities enable cross-chapter aggregation.

---

### 2. Norwegian Red Cross Design System

- **Repo**: https://github.com/norwegianredcross/DesignSystem
- **Storybook**: https://norwegianredcross.github.io/DesignSystem/storybook/
- **npm packages**: `rk-designsystem`, `@digdir/designsystemet-css`, `rk-design-tokens`
- **License**: MIT

**What it brings:**
- 65 production-ready React components built on Digdir's Designsystemet with Røde Kors theme
- Key components for data display: Card, Table, Search, Tabs, Tag, Badge, Pagination, Select, Spinner, SkeletonLoader, Breadcrumbs, Alert, Heading, Dialog, Details, Chip, Avatar
- Pre-configured for Next.js
- Pairs with `@navikt/aksel-icons` for icon coverage
- Built-in accessibility and brand consistency

---

## Red Cross internal knowledge products

### 3. Samfunnspuls — Red Cross knowledge bank

- **URL**: https://samfunnspuls.rodekors.no/
- **About**: https://samfunnspuls.rodekors.no/om-samfunnspuls/
- **Statistics index**: https://samfunnspuls.rodekors.no/statistikker/
- **Auth**: None (publicly accessible despite being built for internal planning)
- **Format**: Embedded PowerBI reports (data not directly downloadable as API)

**What it is:**
- Red Cross Nasjonalkontoret's own "kunnskapsbank" for volunteers and staff
- Purpose: analyze local humanitarian needs and plan activities
- Indicator shortlist anchored in the 2017 report "Humanitære behov i Norge", refined with input from districts and lokalforeninger

**What it brings:**
- ~37 curated statistics across 6 themes:
  - **Barn og unge** (15): children per age group, crowded housing, bullying rates, and more
  - **Demografi og boforhold** (7): population change, live births, relocation, age/sex breakdowns
  - **Helse og eldre** (2): nursing home residents, home care recipients
  - **Flyktninger og asylsøkere** (3): refugee settlement, immigration by reason/background
  - **Frivillighet** (3): Red Cross members, Red Cross volunteers, orgs in Frivillighetsregisteret
  - **Økonomi** (7): low-income households, long-term low income, unemployment, social assistance recipients, family types
- All sourced from **SSB, NAV, Udir, IMDi** and other public bodies
- Kommune- and fylke-level; for **Oslo, Bergen, Trondheim, Stavanger** also bydel-level
- Each report includes an "Eksport" button (presumably Excel) and "Om tallene" explainer

**Technical architecture:**
- Pages load embedded PowerBI reports via `/api/powerbi/reportembeddata/{reportId}` (unauthenticated)
- Report names encode source table IDs (e.g. `ssb-08764` → SSB table 08764) — useful reverse lookup
- Data itself lives in a PowerBI dedicated capacity, not served as a clean API

**Why it matters:**
- **The curated indicator list is intellectual property we can reuse.** Saves us from choosing which humanitarian-need indicators to visualize — Red Cross's own planners have already decided.
- Maps indicator names to concrete public-dataset IDs, which we can then query directly via SSB PxWebApi rather than going through PowerBI
- **Confirms the core concept**: Red Cross internally treats demographic/socioeconomic context + chapter presence as complementary. Any app combining both is doing what their planners actually need.

**What it's missing:**
- **No chapter / activity overlay.** Samfunnspuls shows needs per kommune but doesn't cross-reference with Red Cross presence. That gap is the exact opportunity for an external app using the Organizations API.
- Heavy PowerBI UX (slow, not mobile-friendly, off-brand, not using the Design System)
- Not accessible as a clean API; data export is per-chart

**Andre ressurser — Red Cross's curated list of authoritative external resources:**

Samfunnspuls's "Andre ressurser" page points to five statistical products Red Cross planners also use. All are free, all are kommune-level, and together they cover themes the main Samfunnspuls catalog doesn't.

- **Ungdata (NOVA / OsloMet)** — https://www.ungdata.no/
  Norway's definitive youth survey, ~109,700 respondents per round, every three years, in nearly every kommune. Covers life satisfaction, loneliness, mental health, friendships, bullying, substance use, media habits, violence, physical activity. Oslo, Bergen, Stavanger, Trondheim get **bydel-level** data. Paid for by Helsedirektoratet, run by NOVA at OsloMet. **This is the single best kommune-level source for youth loneliness and mental-health indicators** — directly relevant to BARK, RØFF, Leksehjelp.

- **Bufdir Barnefattigdom kommunemonitor** — https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/
  Per-kommune child poverty indicators (EU-60 low-income threshold), organized into 4 categories: omfang (extent), omfang etter husholdningstype, risiko, boforhold. Covers kommuner, bydeler in Oslo/Stavanger/Bergen/Trondheim, and delbydeler in Oslo. Full dataset downloadable. Supplied by SSB register data via Bufdir. Directly relevant to Ferie for alle, Leksehjelp, BARK.

- **Bufdir Barnevern kommunemonitor** — https://www.bufdir.no/Statistikk_og_analyse/Barnevern_kommunemonitor/
  Per-kommune child welfare indicators: cases, measures, placements outside home, finances, interkommunalt samarbeid. Updated from KOSTRA + kommunenes halvårsrapportering. Bydel-level in big cities. Context for chapters running youth/family-support activities.

- **Folkehelseprofil + Oppvekstprofil (FHI)** — https://www.fhi.no/he/folkehelse/folkehelseprofil/
  Per-kommune + bydel (Oslo/Bergen/Stavanger/Trondheim) + fylke profiles, published annually. Covers befolkning, oppvekst og levekår, miljø, skader og ulykker, helserelatert atferd, helsetilstand. **Includes Ungdata-indikatorer — so loneliness and subjective well-being ARE available at kommune level via FHI** (correcting my earlier note that SSB's Livskvalitet only gives this nationally).

  **Critical discovery: FHI has an official open API.** Repo: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI — Swagger-documented, JSON responses, no auth required. Endpoints: `/api/open/v1/{SourceId}/table/{tableId}/data` and friends. This is the *machine-readable* path into folkehelseprofil data that Samfunnspuls's PowerBI version hides behind UI.

- **DSB Kommuneundersøkelsen** — https://www.dsb.no/menyartikler/statistikk/kommuneundersokelsen/
  Annual survey from Direktoratet for samfunnssikkerhet og beredskap on **municipal emergency preparedness readiness**. How well each kommune is prepared, what their risk and vulnerability analyses look like, whether they have ROS-analyser in place. Directly relevant to Hjelpekorps-capable chapters and the storm/beredskap mode concept.

---

## Red Cross ecosystem — scrapable pages

These are public HTML pages, not APIs. Scraping is feasible (predictable URL patterns) but fragile to site redesigns.

### 4. rodekors.no district pages

- **URL pattern**: `https://www.rodekors.no/lokalforeninger/{district-slug}/`
- **Example**: https://www.rodekors.no/lokalforeninger/agder/

**What it brings:**
- District-level narrative descriptions
- List of local chapters with hero images, short tagline, link to chapter page
- Curated, human-facing view (test entries and legal entities filtered out — unlike the API)

---

### 5. rodekors.no chapter pages

- **URL pattern**: `https://www.rodekors.no/lokalforeninger/{district-slug}/{chapter-slug}/`
- **Example**: https://www.rodekors.no/lokalforeninger/agder/arendal/

**What it brings:**
- Hero image per chapter
- Full prose chapter description
- Per-activity sections with descriptions, meeting times, meeting locations, age groups, cost
- Per-activity contact person (coordinator name, phone, email) — not just the chapter leader
- News feed ("Aktuelt") with dated items
- Chapter-specific details: address, Grasrotandelen org number, Facebook/social links
- Sub-activities and local programs that don't exist in the API's flat activity taxonomy (e.g. "Besøksvenn med hund", "Kameleonkvinnene", "UtPåTur")

**Why it matters:** The API is the skeleton; these pages are the flesh. Real practical detail about what joining looks like only exists here.

---

### 6. mittrodekors.no — volunteer signup

- **URL**: https://www.mittrodekors.no/innmelding/
- **Platform**: Microsoft Power Apps portal

**What it brings:**
- The current volunteer signup form (read-only without login)
- The full flat list of ~400 chapters including raw branch IDs and legal entities that shouldn't be in a volunteer-facing dropdown — useful as a reference for data quality work
- The ethics and confidentiality declarations a volunteer must accept
- Reference for what the "end state" of the volunteer journey looks like

---

### 7. rodekors.no donation page

- **URL**: https://www.rodekors.no/stott-arbeidet/

**What it brings:**
- Overview of all donation paths: fastgiver, one-time, Vipps (2272), bank account, webshop, Spleis, Grasrotandelen, pantelotteri, gavekort, memorial, testament
- "Over 90% goes to the cause" efficiency stat
- Tax deduction rules (500–25,000 NOK/year)
- Corporate partnership entry points

**Why it matters:** Reveals the full engagement surface area of Red Cross beyond volunteering.

---

### 8. nettbutikk.rodekors.no — webshop

- **URL**: https://nettbutikk.rodekors.no/
- **Platform**: WooCommerce (with Klarna + Vipps checkout)

**What it brings:**
- Preparedness product catalog (førstehjelpsskrin, egenberedskapspakker, røverkaffe, gavekort)
- Pricing, inventory status, product descriptions with detailed contents
- Product images
- Connects "preparedness" narrative to "giving" narrative — buying a first aid kit is both personal safety and humanitarian support

---

### 9. Spleis (Red Cross organization page)

- **URL**: https://www.spleis.no/org/1785

**What it brings:**
- Live crowdfunding campaigns tagged to Red Cross
- Real-time fundraising amounts
- Campaign narratives, photos, supporters

**Why it matters:** The only live-updating "what's happening right now" data source for fundraising activity across the organization.

---

## Norwegian government open data

All free, all open, no registration required, well-documented.

### 10. SSB — Statistics Norway

- **PxWebApi v2**: `https://data.ssb.no/api/pxwebapi/v2/`
- **Klass (classifications)**: `https://data.ssb.no/api/klass/v1/`
- **Format**: JSON-stat2
- **Auth**: None

**What it brings (verified queryable at kommune level):**
- Population by kommune, age, sex, year (table 07459 and related)
- Household composition — including single-person households by age (proxy for loneliness risk)
- Births, deaths, migration in/out
- Population projections (ageing curves through 2050)
- Immigration and country of background
- Low-income households
- Social assistance recipients
- Child welfare statistics
- Unemployment
- Education levels
- Disability benefit recipients
- Housing and living conditions
- KOSTRA data (kommune-level reporting on services, preparedness, culture)
- Standard classifications for municipalities, counties, age groups

**What's national-only (not per kommune) in SSB:**
- SSB's own Livskvalitet (Quality of Life) including loneliness index — broken down by age, gender, education, income, household type, and "sentralitet" (1–6 urban-rural scale), **not by specific kommune**
- **However**: kommune-level loneliness/well-being IS available through FHI's Folkehelseprofil (Ungdata-indikatorer). See Samfunnspuls "Andre ressurser" entry above.

**Cross-reference with Samfunnspuls:** Report names in Samfunnspuls embed URLs encode the source SSB table IDs (e.g. `ssb-08764`). We can use Samfunnspuls's curated indicator list as a shortcut to find exactly which SSB tables Red Cross planners care about, then query those tables directly via PxWebApi.

---

### 11. Kartverket / Geonorge

- **Geonorge portal**: https://geonorge.no/
- **Auth**: None

**What it brings:**
- GeoJSON boundaries for Norwegian kommuner and fylker (for choropleth maps)
- Authoritative Norwegian base map tiles
- Standard municipality codes that link SSB, Brreg, and Red Cross data

---

### 12. Brønnøysundregistrene (Brreg)

- **Enhetsregisteret**: https://data.brreg.no/enhetsregisteret/
- **Frivillighetsregisteret** (volunteer registry): https://data.brreg.no/frivillighetsregisteret/
- **Auth**: None

**What it brings:**
- Lookup by organization number — every Red Cross chapter has one in the API
- Founding date (cross-check with API)
- Board members and roles
- Address history
- Annual filings where public
- Related entities and subsidiaries
- ICNPO activity categorization for non-profits
- Grasrotandelen registration status

**Why it matters:** Lets us enrich every chapter's profile with real public registry data — board diversity, financial transparency, longevity verification.

---

### 13. MET Norway (met.no)

- **API**: https://api.met.no/
- **Auth**: None (user-agent required)

**What it brings:**
- `/locationforecast` — weather forecast for any lat/lon (we have coordinates for every chapter)
- `/nowcast` — short-term precipitation forecast
- `/metalerts` — active weather warnings (farevarsler) as GeoJSON polygons
- Historical weather observations

**Why it matters:** Real-time hazard awareness keyed to chapter locations. The "storm mode" idea depends on this.

---

### 14. Varsom.no (NVE)

- **API**: https://api.varsom.no/
- **Auth**: None

**What it brings:**
- Avalanche warnings (snøskredvarsel) by region
- Flood warnings (flomvarsel) by watershed
- Landslide warnings (jordskredvarsel) by region
- Active alert levels and descriptions

**Why it matters:** The hazards Hjelpekorps (Red Cross Rescue) specifically responds to. Overlay these against Hjelpekorps-capable chapters for beredskap storytelling.

---

### 15. Entur

- **Journey Planner API**: https://api.entur.io/journey-planner/v3/
- **Auth**: Client-name header only (no key)

**What it brings:**
- Norwegian public transport: all trains, buses, trams, ferries
- Journey planning from any location to any location
- Stop/station geodata
- Real-time departures

**Why it matters:** "How do I actually get to my nearest chapter?" turns an abstract distance into a practical travel plan.

---

### 16. Norsk Tipping — Grasrotandelen

- **Lookup URL pattern**: `https://www.norsk-tipping.no/grasrotandelen/#search={organisasjonsnummer}`
- **Auth**: None (for public lookup)

**What it brings:**
- Deep-link into Grasrotandelen signup with a specific chapter pre-filled, using the org number from the Organizations API
- Per-chapter Grasrotandelen standing (number of givers, amounts) where publicly displayed

**Why it matters:** The single donation mechanism that's inherently chapter-local. Every chapter can be supported individually via their org number.

---

## Potential / not yet explored

Sources we've mentioned but haven't verified in depth. Worth checking if relevant.

### 17. NAV

- Unemployment statistics at kommune level
- Social benefit recipients
- Complementary to SSB for labor market indicators

### 18. NRK / public media

- RSS feeds are available
- News items mentioning specific chapters, activities, or crises
- Would require text matching to be useful

### 19. Wikipedia / Wikidata

- Structured data about Norwegian municipalities, notable Red Cross chapters, historical events
- Free SPARQL endpoint on Wikidata

### 20. Kriseinfo.no

- Official Norwegian crisis information aggregator
- Complementary to met.no and Varsom for non-weather emergencies

### 21. DSB (Direktoratet for samfunnssikkerhet og beredskap)

- Emergency preparedness guidance ("72 timer" campaign)
- Relevant for preparedness narrative alongside the webshop

---

## Quick-reference joining keys

The IDs and codes that let us link data sources together:

| Key | Source | Links to |
|---|---|---|
| `branchId` (e.g. `L099`) | Red Cross API | Internal to API |
| `organizationNumber` (9 digits) | Red Cross API | Brreg, Grasrotandelen, Frivillighetsregisteret |
| Municipality name / `kommunenummer` (4 digits) | Red Cross API `branchLocation.municipality` | SSB, Kartverket, Klass |
| County name / `fylkesnummer` (2 digits) | Red Cross API `branchLocation.county` | SSB, Kartverket |
| `geoLocation.coordinates` [lon, lat] | Red Cross API | met.no, Varsom, Entur, any map |
| Chapter URL slug | rodekors.no path | Chapter page + image CDN |
| `globalActivityName` | Red Cross API `branchActivities` | Activity taxonomy (informal) |

---

## Authentication summary

| Source | Auth needed? |
|---|---|
| Red Cross Organizations API | Yes — subscription key |
| Red Cross Design System | No (npm install) |
| rodekors.no pages | No (HTML scraping) |
| mittrodekors.no | Form submission only when logged in |
| nettbutikk.rodekors.no | No for browsing; WooCommerce login for purchase |
| Spleis | No (for public campaign pages) |
| SSB APIs | No |
| Kartverket / Geonorge | No |
| Brreg | No |
| MET Norway | No (user-agent only) |
| Varsom | No |
| Entur | No (client-name header only) |
| Grasrotandelen lookup | No |
