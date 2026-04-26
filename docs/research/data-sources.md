# Data sources — Norwegian domestic + Red Cross ecosystem

This document lists every Norwegian and Red Cross-ecosystem source we can draw on. International / humanitarian sources live in `data-sources-international.md`. Funding-specific sources live in `redcross-data-sources-funding.md`. The activity → indicator mapping lives in `redcross-activity-indicator-matrix.md`.

Verification: URLs were re-verified against live endpoints on **2026-04-18**. Where a source has moved or been deprecated since the prior research pass, the change is flagged inline and summarised in the "Moves and deprecations" section at the bottom.

---

## Primary — the spine of the project

### 1. Red Cross Organizations API

- **URL**: `https://api.redcross.no/nrx/v1/organizations`
- **Portal**: https://developer.redcross.no/api-details#api=organizations&operation=getOrganizations
- **Auth**: Requires `Ocp-Apim-Subscription-Key` header (free, request via portal)
- **Format**: JSON; single call returns all branches
- **Local cache**: A real dump lives at `atlas-private-data-repo/redcross/organisations/api-getOrganizations-output-21apr26.json` (gitignored, per-NGO private data)

Complete hierarchy of every Red Cross organizational unit in Norway: National Office → 19 Districts → ~400 Local Chapters. Per-branch identity (`branchId`, `branchNumber`, `branchName`, `branchType`), Norwegian organization number, status, creation/termination dates, location, GeoJSON Point coordinates, contacts (with PII masking), activities (`globalActivityId` + local names), hierarchy via `branchParent`.

The spine: coordinates enable maps, org numbers enable Brreg joins, branch names enable website scraping, `globalActivityId` enables cross-chapter aggregation. See `redcross-activities.md` for the canonical activity catalogue derived from this dump.

### 2. Norwegian Red Cross Design System

- **Repo**: https://github.com/norwegianredcross/DesignSystem
- **Storybook**: https://norwegianredcross.github.io/DesignSystem/storybook/
- **npm packages**: `rk-designsystem`, `@digdir/designsystemet-css`, `rk-design-tokens`
- **License**: MIT

65 production-ready React components built on Digdir's Designsystemet with Røde Kors theme. Key components for data display: Card, Table, Search, Tabs, Tag, Badge, Pagination, Select, Spinner, SkeletonLoader, Breadcrumbs, Alert, Heading, Dialog, Details, Chip, Avatar. Pre-configured for Next.js. Pairs with `@navikt/aksel-icons`.

---

## Red Cross internal knowledge products

### 3. Samfunnspuls — Red Cross knowledge bank

- **URL**: https://samfunnspuls.rodekors.no/
- **Statistics index**: https://samfunnspuls.rodekors.no/statistikker/
- **Auth**: None (publicly accessible despite being built for internal planning)
- **Format**: Embedded PowerBI reports — data not served as a clean API

Nasjonalkontoret's internal "kunnskapsbank" for volunteers and staff. ~37 curated statistics across 6 themes (Barn og unge, Demografi og boforhold, Helse og eldre, Flyktninger og asylsøkere, Frivillighet, Økonomi). All sourced from SSB, NAV, Udir, IMDi and other public bodies. Kommune- and fylke-level; bydel-level for Oslo, Bergen, Trondheim, Stavanger.

Technical note: Report names encode source table IDs (e.g. `ssb-08764` → SSB table 08764) — useful reverse lookup. Data lives in PowerBI dedicated capacity, not a clean API, so use Samfunnspuls as an **indicator curation list** and query the underlying SSB/FHI tables directly.

**What it's missing**: no chapter/activity overlay. Samfunnspuls shows needs per kommune but doesn't cross-reference with Red Cross presence. That gap is our opportunity.

### 4. Samfunnspuls "Andre ressurser"

Curated external resources Red Cross planners use:

- **Ungdata (NOVA / OsloMet)** — https://www.ungdata.no/
  The definitive kommune-level youth survey (~109 700 respondents per 3-year round). Life satisfaction, loneliness, mental health, friendships, bullying, substance use. Oslo/Bergen/Stavanger/Trondheim get **bydel-level** data. Best single source for youth-focused activities (BARK, RØFF, Leksehjelp).

- **Bufdir Barnefattigdom** — https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/
  Per-kommune child poverty indicators (EU-60 threshold). Full ZIP download, **K+B+delbydel Oslo**. 2024 data as of April 2026; 2025 expected June 2026.

- **Bufdir Barnevern kommunemonitor** — https://www.bufdir.no/statistikk-og-analyse/monitor/barnevern/
  Per-kommune child welfare indicators. 2024 kommunestruktur; preliminary 2025 KOSTRA + March 2026 barnevernsnemnd data available.

- **Bufdir Open Data API** — https://data.bufdir.no/
  Machine-readable access to the monitors above. New since last pass.

- **Folkehelseprofil + Oppvekstprofil (FHI)** — see source #5 below.

- **DSB Kommuneundersøkelsen** — https://www.dsb.no/ros-og-beredskap/kommuner/kommuneundersokelsen/
  Annual kommune preparedness survey. 2026 edition with Excel raw data available. Directly relevant to Hjelpekorps and Beredskapsvakt.

### 5. FHI Folkehelsestatistikk (critical migration — replaces Kommunehelsa + Norgeshelsa)

- **Portal**: https://statistikk.fhi.no/
- **Open API**: `https://statistikk-data.fhi.no/api/open/v1/` — verified live
- **OpenAPI spec**: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- **Auth**: None
- **Format**: JSON

**Important change**: Kommunehelsa statistikkbank and Norgeshelsa closed **10 November 2025**. The new unified statistikkbank is Folkehelsestatistikk. All prior references to `kommunehelsa.fhi.no` must be replaced.

Endpoints: `/Common/source`, `/{SourceId}/table`, `/{SourceId}/table/{tableId}/data`. Covers Folkehelseprofil + Oppvekstprofil indicators (ensomhet, mobbing, trivsel, psykiske plager, frafall videregående, trangbodd bolig, etc.) and the health registries (SYSVAK, MSIS, NPR, Legemiddel, Dødsårsak). **K + B**, biennial for Folkehelseprofil.

This is the single most important change for the Ensomhetskartet and Youth well-being atlas ideas.

---

## Red Cross scrapable pages

### 6. rodekors.no district pages
- **URL pattern**: `https://www.rodekors.no/lokalforeninger/{district-slug}/`
- **Example**: https://www.rodekors.no/lokalforeninger/agder/

District-level narrative, curated chapter list with hero images, tagline, link. Test entries and legal entities filtered out (unlike the API).

### 7. rodekors.no chapter pages
- **URL pattern**: `https://www.rodekors.no/lokalforeninger/{district-slug}/{chapter-slug}/`

Hero image, prose description, per-activity sections with meeting times/places/age groups/cost, per-activity coordinator contact (not just the chapter leader), news feed ("Aktuelt"), chapter address, Grasrotandelen org number, social links, sub-activities not in the API's flat taxonomy ("Besøksvenn med hund", "Kameleonkvinnene", "UtPåTur").

**The API is the skeleton; these pages are the flesh.**

### 8. mittrodekors.no — volunteer signup
- **URL**: https://www.mittrodekors.no/innmelding/
- **Platform**: Microsoft Power Apps portal

Current volunteer signup form (read-only without login). The full flat list of ~400 chapters including legal entities. Reference for the "end state" of the volunteer journey.

### 9. rodekors.no donation page
- **URL**: https://www.rodekors.no/stott-arbeidet/

Overview of all donation paths. "Over 90% to cause" efficiency stat. Tax-deduction rules. Corporate partnership entry points. See `redcross-data-sources-funding.md` for deeper funding coverage.

### 10. nettbutikk.rodekors.no
- **URL**: https://nettbutikk.rodekors.no/
- **Platform**: WooCommerce (Klarna + Vipps)

Preparedness product catalogue. Surplus flows to humanitarian work.

### 11. Spleis (Red Cross org page)
- **URL**: https://www.spleis.no/org/1785

Live crowdfunding campaigns. Only live-updating fundraising source across the organisation.

---

## Statistics core

### 12. SSB — PxWebApi v2 (NEW — primary)

- **Base**: `https://data.ssb.no/api/pxwebapi/v2/` — verified live
- **Query**: `tables/{tableId}/data?lang=no&valuecodes[Dim]=…&outputFormat=json-stat2`
- **Klass (classifications)**: `https://data.ssb.no/api/klass/v1/`
- **Auth**: None
- **Limits**: 800 000 cells/request, 30 requests/minute/IP
- **Formats**: json-stat2, csv, xlsx, px, html, json-px

**Important change**: the new Statbank launched 29 January 2026. v2 is GET-friendly (v1 was POST-only). v1 still works during transition but will be sunset.

Verified at kommune level for our purposes: population by age/sex (07459), household composition (06070), KOSTRA pleie-omsorg, immigration by background (07110, 07108, 05183, 05184, 05196), low-income households (11605), NAV sosialhjelp (12221), tourist overnights (08403), crime (08484), kultur, projection tables.

SSB's own Livskvalitet (incl. loneliness index) is national-only — for kommune-level loneliness use FHI Folkehelseprofil.

### 13. Helsedirektoratet HAPI (new to catalogue)

- **Portal**: https://utvikler.helsedirektoratet.no — verified
- **Auth**: Varies per API
- **Format**: REST / JSON

APIs: Content services, Hospital admissions, COVID archive, Health reimbursement, **NKI** (Nasjonale Kvalitetsindikatorer), Medications (ATC/FEST), Tobacco + alcohol licensing register (TBR). Complements FHI with provider-side views.

### 14. Helfo fastlegestatistikk (new)
- **URL**: https://www.helfo.no/fastlegeordninga/fastlegestatistikk — verified
- **Format**: Dashboard + Excel
- **Granularity**: K, F, N; monthly updates

Fastlege coverage / list status per kommune. Proxy for unmet health-contact risk → relevant to Besøkstjeneste and Omsorg need signals.

### 15. Helseatlas (SKDE)
- **URL**: https://skde.no/helseatlas — verified (redirected from helseatlas.no)
- **Reports**: https://analyser.skde.no
- **Format**: HTML atlases + CSV/Excel per atlas

Regional variation atlases: dagkirurgi, barnehelseatlas, eldrehelseatlas, psykisk helse atlas. **Helseregion** not kommune.

---

## Geodata

### 16. Kartverket + Geonorge
- **Kartverket APIs overview**: https://www.kartverket.no/en/api-and-data — verified
- **Geonorge portal**: https://www.geonorge.no/ + https://kartkatalog.geonorge.no/ — verified
- **Service status**: https://status.geonorge.no/
- **Auth**: None for open datasets
- **License**: CC BY 4.0 for most

Authoritative GeoJSON/WFS/WMS for:
- Kommune and fylke boundaries (grensedata)
- SSR placenames (incl. Sámi/Kvensk variants): `https://ws.geonorge.no/stedsnavn/v1/`
- Høydedata (1 m LIDAR) — portal at hoydedata.no is viewer-only; use Kartverket WCS/WMS for programmatic DEM
- Matrikkel (buildings, property)
- Base map tiles
- **DOK datasets** (~150 critical layers for kommunal planning): skredfaresoner, flomsoner, kvikkleiresoner, støysoner, brannsmitteområder, tilfluktsrom, kulturminner, reinbeiteområder

### 17. Kartverket Vannstand (MOVED)
- **NEW**: https://vannstand.kartverket.no/tideapi_en.html — verified
- **OLD (deprecated)**: `api.sehavniva.no` — deprecated September 2024; replace any refs

Tide predictions per coastal station; storm surge warnings.

### 18. Tilfluktsrom (Sivilforsvar shelters)
- **Dataset page**: https://kartkatalog.geonorge.no/metadata/tilfluktsrom-offentlige/dbae9aae-10e7-4b75-8d67-7f0e8828f3d8 — verified
- **Owner**: DSB
- **Format**: GeoJSON via DSB WFS, also FGDB/GML/PostGIS download
- **Caveat**: Coverage incomplete — only shelters with registered coordinates

### 19. Skredfaresoner (NVE via Geonorge)
- **WMS**: `https://nve.geodataonline.no/arcgis/services/Skredfaresoner1/MapServer/WMSServer` — verified (URL changed Feb 2026)
- **WFS INSPIRE**: https://register.geonorge.no/inspire-statusregister/skredfaresoner-wfs/f5f79615-8ce0-49d5-995b-0674f046f435

Avalanche/rockfall hazard zones. Pairs with tilfluktsrom + Varsom for Hjelpekorps/Beredskap need signals.

---

## Environment, climate, hazards

### 20. MET Norway API
- **Base**: https://api.met.no/ — verified
- **Auth**: None (User-Agent header required)
- **License**: CC BY

Forecast (`locationforecast`), nowcast, ocean, **`metalerts`** (farevarsler as GeoJSON polygons — critical for Storm Mode), textforecast, aviation, marine, sunrise/moon.

### 21. MET Frost API (historical)
- **Base**: https://frost.met.no/ — verified
- **Auth**: Free client ID (self-serve)
- **Format**: JSON

The observation archive (distinct from the forecast API): decades of daily temperature, precipitation, wind from all MET stations. 30-year normals. Enables chapter-level climate anomaly detection (hetebølge, kuldebølge).

### 22. NVE HydAPI (hydrology)
- **Base**: `https://hydapi.nve.no/api/v1/` — verified
- **Auth**: Free API key (`X-API-Key` header)
- **License**: NLOD / CC BY 3.0

Live + historical streamflow, water level, snow depth, snow water equivalent, groundwater, reservoir fill from ~1 600 stations. Percentile endpoint enables "is this abnormal for Rauma now?" framing.

### 23. Varsom / NVE forecasts (URL correction)
- **Snøskredvarsel**: `https://api01.nve.no/hydrology/forecast/avalanche/v6.3.0/api` — verified
- **Jordskred/flom**: `https://api01.nve.no/hydrology/forecast/landslide/v1.0.10` — verified
- **Swagger**: https://api01.nve.no/hydrology/forecast/avalanche/v6.3.0/swagger/
- **Python client**: https://github.com/NVE/python-varsom-avalanche-client

**Important**: the old `api.varsom.no` host no longer resolves. Use `api01.nve.no` paths.

### 24. NILU Luftkvalitet
- **Base**: https://api.nilu.no/ — verified
- **Auth**: None
- **Format**: JSON

Near-real-time PM2.5, PM10, NO2, O3, SO2 from ~120+ stations. Also UV forecast (`/uv/forecast/{lat}/{lon}`, 3-day).

### 25. Miljødirektoratet
- **Service catalog**: https://kartkatalog.miljodirektoratet.no/mapservice — verified
- **Naturbase felles API**: https://felles.naturbase.no/Help — verified (partial auth)
- **Grunnforurensning WMS**: `https://kart.miljodirektoratet.no/arcgis/services/grunnforurensning2/MapServer/WMSServer` — verified
- **Vannmiljø Web API**: https://vannmiljoapi.miljodirektoratet.no/swagger/ui/index — verified

Protected areas, biodiversity, pollution sites, water quality.

### 26. Miljødirektoratet klimaprofiler (MOVED)
- **2025 edition**: https://www.miljodirektoratet.no/ansvarsomrader/klima/for-myndigheter/klimatilpasning/klimatilpasning-krever-kunnskap/fylkesvise-klimaprofiler/ — verified

Per-fylke climate projections to 2100 (temperature, nedbør, flom, skred, havstigning) — now hosted by Miljødirektoratet, not Klimaservicesenteret. Klimaservicesenter.no still exists but its homepage is nearly empty; point at Miljødirektoratet instead.

### 27. MET Seklima (historical observations viewer)
- **Portal**: https://seklima.met.no/observations/ — verified

Web viewer; underlying data via Frost API.

### 28. Artsdatabanken / GBIF Norge
- **Developers**: https://artsdatabanken.no/developers — verified
- **Taxon + Help**: https://artsdatabanken.no/help
- **Traits API**: https://traitsapi.artsdatabanken.no/
- **DOI API**: https://doiapi.artsdatabanken.no/api/docs/swagger/index.html
- **Artskart public API**: https://artskart.artsdatabanken.no/publicapi/
- **Biota**: https://data.artsdatabanken.no/Biota/
- **GBIF (global, country=NO)**: `https://api.gbif.org/v1/occurrence/search?country=NO`

Niche relevance for Ferie for alle nature programming and BARK outdoor activities.

### 29. OpenStreetMap Overpass
- **Endpoint**: `https://overpass-api.de/api/interpreter` — verified
- **Mirrors**: https://overpass.kumi.systems/api/interpreter

Crowd-mapped infrastructure in Norway: defibrillators (AEDs), shelters, benches, drinking fountains, public toilets — at coordinate precision Kartverket doesn't cover for amenities. `amenity=defibrillator`, `emergency=assembly_point`, `social_facility=*` produce cheap "nearby help" layers for the crisis band.

### 30. Norwegian Polar Institute
- **REST API**: https://api.npolar.no/ — verified (open source, github.com/npolar/api.npolar.no)
- **Data portal**: https://data.npolar.no/dataset
- **Geodata**: https://geodata.npolar.no/
- **OAI-PMH**: https://oai.data.npolar.no/oai-pmh/

Sea ice, glaciers, polar bear observations, Svalbard/Jan Mayen/Hopen stations. Relevant for Longyearbyen Røde Kors and national "we are everywhere" framing.

---

## Transport

### 31. Entur Journey Planner
- **Base**: `https://api.entur.io/journey-planner/v3/` — verified
- **Auth**: Client-name header only
- All public transport in Norway. Also aggregates GBFS feeds (bysykkel, e-scooters) at `https://api.entur.io/mobility/v2/gbfs/`.

### 32. Statens vegvesen — NVDB (MIGRATED v3 → v4)
- **V4 (current)**: `https://nvdbapiles.atlas.vegvesen.no/` — verified
- **Docs v4**: https://nvdb-docs.atlas.vegvesen.no/nvdbapil/v4/introduksjon/Oversikt/
- **V3 (legacy)**: `https://nvdbapiles-v3.atlas.vegvesen.no/` — authorised X-Clients only
- **Auth**: X-Client header

Every road object (speed limits, bridges, tunnels, EV chargers), winter road status, **Ulykkespunkt** (accident-prone stretches — Hjelpekorps need signal). Update all refs from v3 to v4.

### 33. Statens vegvesen — Trafikkdata GraphQL
- **API**: https://trafikkdata-api.atlas.vegvesen.no/ — verified
- **Docs**: https://github.com/trafikkdata/trafikkdata.no-dokumentasjon

AADT (traffic volumes), live closures, accidents, weather-related road events. Pairs with Varsom in Storm Mode for "who can reach whom".

### 34. Avinor FlyData
- **URL**: https://avinor.no/en/corporate/services/flydata/flydata-api
- **Auth**: None; XML only

Arrival/departure feeds. Niche but relevant for Flyplass-ansvarlige chapters during refugee arrivals.

### 35. BaneNOR open data
- **URL**: https://data.banenor.no/
- **Format**: GeoJSON, CSV

Railway crossings, stations, signalling, tunnels.

---

## Beredskap / crisis

### 36. DSB (Direktoratet for samfunnssikkerhet og beredskap)
- **Kommuneundersøkelsen 2026**: https://www.dsb.no/ros-og-beredskap/kommuner/kommuneundersokelsen/ — verified (PDF + Excel)
- **Tilfluktsrom**: via Geonorge (see #18)
- **Format**: Annual; PDF-first but Excel raw data available

Municipal preparedness readiness, ROS-analyse status. Primary structural signal for Hjelpekorps and Beredskapsvakt.

### 37. Sivilforsvaret
- **URL**: https://www.sivilforsvaret.no/
- **Format**: HTML pages only; data via Geonorge DSB layer

### 38. Politiet
- **Stats page**: https://www.politiet.no/om-politiet/tall-og-fakta — verified (PDF only)
- **Politiloggen**: https://www.politiet.no/politiloggen/ — undocumented JSON feed behind the UI

Real-time local incidents (accidents, missing persons, fires) geotagged to kommune and police district. The only live kommune-level incident feed; scrape with caution, not an official API, TOS unclear for bulk republishing.

### 39. Kriseinfo.no — REMOVED
**Status**: `kriseinfo.no` redirects permanently to `dsb.no` (verified 2026-04-18). Any prior "Kriseinfo RSS" reference is dead. DSB news is the nearest equivalent.

---

## Education

### 40. Udir — Grunnskolens informasjonssystem + related
- **Portal**: https://www.udir.no/om-udir/data — verified (data.udir.no redirects here)
- **Apps**: Elevundersøkelsen, Barnehagefakta (BAF), Nasjonale registre (NSR/NBR), Nasjonale prøver (from 2022), Grep (curricula)
- **Format**: JSON / CSV
- **License**: NLOD

Per-school enrolment, pupil-teacher ratios, special-education share, Nasjonale prøver, Elevundersøkelsen (trivsel, mobbing). Primary Leksehjelp demand signal.

### 41. Lånekassen open datasets
- **URL**: https://lanekassen.no/nb-NO/om-lanekassen/om-oss/apne-data/
- **Format**: CSV/Excel, some JSON

Student loan uptake/debt by age/kommune/utdanningsnivå; kvotestudenter; betalingsvansker. Signal for young-adult economic pressure.

### 42. DBH / HK-dir (higher education)
- **URL**: https://dbh.hkdir.no/
- **Format**: CSV / JSON via DBH-API

Per-institution student data. Identifies chapter catchments with large international-student populations (Flyktningguiden, Norsktrening).

### 43. HK-dir — Norsk og samfunnskunnskap
- **URL**: https://hkdir.no/voksenopplaering/norsk-og-samfunnskunnskap
- **Format**: CSV / Excel

Adult norskopplæring statistics; complements IMDi for Flyktningguide/Norsktrening.

### 44. IMDi
- **Bosettingstall**: https://www.imdi.no/bosetting/bosettingstall/ — verified (2026 data covers 344 kommuner)
- **Statistikk (arkiv)**: https://arkiv.imdi.no/om-integrering-i-norge/statistikk/
- **Format**: HTML (scrape) + Excel; no clean open API

Primary Flyktningguide/Norsktrening need signal. Integreringsbarometeret, norskprøve-resultater, employment 1/3/5 years after introduksjonsprogram.

### 45. UDI asylmottak list
- **URL**: https://www.udi.no/asylmottak/
- **Format**: HTML (scrape)

Active reception centres. No API. Essential for geolocating Migrasjon/Flerkultur/Asylmottak activities.

---

## Housing / labor / economy

### 46. Husbanken
- **Boligsosial Monitor**: https://boligsosial-monitor.husbanken.no/region/0/Norge — verified
- **Statistikkbank**: https://www.husbanken.no/statistikk/

Bostøtte, startlån, kommunal bolig stock, vanskeligstilte, bostedsløse, eldre og bolig, barn og unges boforhold, trangbodde. K, annual. Signal for Flyktningguide and BARK need.

### 47. NAV
- **Overview**: https://www.nav.no/no/nav-og-samfunn/statistikk/
- **Job vacancy feed**: https://navikt.github.io/pam-stilling-feed/ — bearer-auth required
- **Arbeidsplassen (browse)**: https://arbeidsplassen.nav.no/

Note: legacy "Ledige stillinger" dataset on data.norge.no is being wound down; use `pam-stilling-feed` instead. Aggregated kommune-level statistics on uføretrygd, sykefravær, AAP via data.nav.no.

### 48. Skatteetaten — åpne data
- **URL**: https://data.skatteetaten.no/
- **Format**: JSON
- Aggregate inntekt/formue per kommune; a-ordningen income stats. Additional low-income signal.

### 49. Arbeidstilsynet — inspections dataset
- **URL**: https://www.arbeidstilsynet.no/ (statistikk + data.norge.no)
- **Format**: CSV
- Inspection counts, pålegg per bransje/region. Low-priority.

### 50. Norges Bank Open Data
- **URL**: https://www.norges-bank.no/en/topics/statistics/open-data/ — verified
- Macro context for donation framing (purchasing power over time).

---

## Registries

### 51. Brønnøysundregistrene (Brreg)
- **Unified portal**: https://www.brreg.no/produkter-og-tjenester/apne-data/ — verified (data.brreg.no/... now redirects here)
- **Enhetsregisteret API**: `https://data.brreg.no/enhetsregisteret/api/enheter` — still works
- **Frivillighetsregisteret**: `https://data.brreg.no/frivillighetsregisteret/`
- **Regnskapsregisteret**: `https://data.brreg.no/regnskapsregisteret/regnskap/`
- **Reelle rettighetshavere** (beneficial ownership): new since prior pass
- **Auth**: None
- **Format**: JSON

Per-chapter org numbers, founding dates, board members, annual accounts where filed, Grasrotandelen standing, ICNPO category.

**Per-chapter financial transparency potential**: Regnskapsregisteret exposes machine-readable annual accounts for every chapter over the filing threshold. Combined with Lottstift momskompensasjon lists, you can build a chapter-level income/expense card that no existing Norwegian NGO tool offers.

### 52. Lottstift (Lotteri- og stiftelsestilsynet)
- **Portal**: https://lottstift.no/ — verified
- **Tilskudd database**: https://tilskudd.lottstift.no/ — verified
- **Open data**: https://lottstift.no/nb/om-oss/apne-data/

Every state grant received by any NGO in Norway, per year. Momskompensasjon recipient lists (Excel). Grasrotandelen admin. Directly queryable by org number.

### 53. Stiftelsen Dam, Gjensidigestiftelsen, Sparebankstiftelsen DNB
- **Dam**: https://www.dam.no/ + https://tilskudd.lottstift.no/forvalter/977468299/stiftelsen-dam
- **Dam Registry (OSF)**: https://osf.io/registries/dam
- **Gjensidige**: https://www.gjensidigestiftelsen.no/ (no open API; annual reports only)
- **Sparebankstiftelsen DNB**: https://sparebankstiftelsen.no/tildelinger/ (HTML list, no API)

Major foundation grants to chapters and frivillige organisasjoner. Some chapter-level data; pair with Brreg for financial dashboards.

---

## Courts / law

### 54. Norges domstoler
- **Statistics**: https://www.domstol.no/statistikk — verified (PDFs annually)
- **Internal API**: targets legal-tech vendors, not open

Caseload per court. **Vitnestøtte must be joined to rettskrets, not kommune** — this is the only activity that doesn't map to kommune-level need indicators.

### 55. Politiet (crime stats)
See #38 above. Aggregate stats live in SSB tables 08484, 08487, 09405, 09406.

### 56. Kriminalomsorgen
- **URL**: https://www.kriminalomsorgen.no/
- **Format**: Monthly nøkkeltall press releases; no structured open data

Prison locations and monthly headline stats. Relevant to Nettverk etter soning. No clean kommune-level release data — requires manual cross-reference.

### 57. Konfliktrådet
- **URL**: https://www.konfliktraadet.no/
- **Format**: PDF + Excel annual reports

Restorative-justice caseloads per region. Signal for Gatemegling capacity needs.

### 58. Lovdata open API (NEW — launched November 2025)
- **API**: https://api.lovdata.no/ + docs https://api.lovdata.no/docs — verified
- **Free datasets (no auth)**:
  - `https://api.lovdata.no/v1/publicData/get/gjeldende-lover.tar.bz2`
  - `https://api.lovdata.no/v1/publicData/get/gjeldende-sentrale-forskrifter.tar.bz2`
- **Protected endpoints**: X-API-Key / Basic Auth (require "api" role on a Lovdata user)
- **Key endpoints**: `/v1/search`, `/renderRefID`, `/genref` (identifies legal references in free text), `/documentHistory`

Legal texts — frivillighetsloven, personopplysningsloven, politiattest-krav, helsepersonell-loven. Useful for surfacing legal context on volunteer onboarding (reduces Kari friction), Beredskapsvakt (helsepersonelloven §7 nødhjelp), and Vitnestøtte.

---

## Culture / heritage / language / archives

### 59. Nasjonalbiblioteket (nb.no)
- **API landing (Swagger)**: https://api.nb.no/ — verified
- **DH-lab**: https://www.nb.no/dh-lab/ — verified
  - **Ngram**: https://app.nb.no/ngram/
  - **Corpus**: https://dh.nb.no/run/corpus-webapp/app/
  - **Bildesøk 1800-tallet**: https://dh.nb.no/run/bildesok/app/
  - **Python client**: https://www.nb.no/dh-lab/digital-tekstanalyse/
- **Språkbanken (resource catalogue)**: https://www.nb.no/sprakbanken/en/resource-catalogue/
- **Auth**: None for metadata & public-domain items; some full-text restricted to Norwegian IPs
- **Format**: JSON, IIIF images, ALTO XML (OCR)

Full-text search across every digitised Norwegian newspaper/book/magazine. Per-chapter historical press clippings via `"{chapter-name} Røde Kors"` query. N-gram for "humanitær" / "flyktning" trends over 200 years. **Best single source for auto-generated chapter history pages.**

### 60. Digitalarkivet / Arkivverket
- **Site**: https://www.digitalarkivet.no/ — verified (not an API itself)
- **Beta Arkivverket**: https://beta.arkivverket.no/
- **Fotoweb**: https://foto.digitalarkivet.no/fotoweb/ — verified
- **GitHub (Noark5 standard)**: https://github.com/arkivverket/noark5-tjenestegrensesnitt-standard
- **Note**: `data.arkivverket.no` is not reachable; treat prior references as invalid until Arkivverket publishes a working open-data endpoint

Folketellinger (1801, 1865, 1875, 1891, 1900, 1910, 1920), kirkebøker, emigration lists, military conscription rolls. WW2-era Røde Kors photos likely present in Fotoweb.

### 61. Kulturminnesøk / Riksantikvaren
- **Søk**: https://www.kulturminnesok.no/ — verified (>220 000 kulturminner)
- **Bildearkiv**: https://bildearkiv.ra.no/
- **Kulturminnebilder Fotoweb**: https://kulturminnebilder.ra.no/fotoweb/ — verified (CC BY bulk + CC BY-NC-ND subset)
- **WMS/WFS**: Askeladden via Geonorge

WW2 fangeleirer, krigsminner, historical buildings — pairs with chapter founding dates for heritage storytelling.

### 62. DigitaltMuseum
- **API docs**: https://dok.digitaltmuseum.org/en/api — verified
- **Full spec**: https://api.dimu.org/doc/public_api.html
- **Repos**: https://github.com/nasjonalmuseet/DiMu-API-documentation, https://github.com/NordicMuseum/DiMu-API-documentation
- **Auth**: Free API key
- **Format**: XML or JSON

6M+ digitised museum objects from Norwegian + Swedish museums. Many "Røde Kors"-tagged items (sanitet badges, uniforms, posters).

**Nasjonalmuseet API**: v1 retired Jan 2025; v2 in development. Use DiMu in the meantime.

### 63. Wikidata SPARQL
- **Endpoint**: https://query.wikidata.org/sparql — verified
- **UI**: https://query.wikidata.org/
- **Auth**: None (polite use expected)

Structured facts on ~450 Norwegian kommuner, every fylke, notable people by birthplace, Red Cross chapters with Wikidata items (inception date, image, Facebook page, org number). Powers "movement globe" viz when combined with IFRC data.

### 64. Wikipedia REST (nb + nn)
- **Summary endpoints**: `https://no.wikipedia.org/api/rest_v1/page/summary/{title}`, `https://nn.wikipedia.org/api/rest_v1/page/summary/{title}`
- Zero-config kommune intro on every chapter page.

### 65. Wikimedia Commons — Norwegian Red Cross
- **Category**: https://commons.wikimedia.org/wiki/Category:Norwegian_Red_Cross — verified (34 files + 7 subcategories as of 2026-04-18)
- **API**: `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Norwegian_Red_Cross&format=json`
- Free-licence historical imagery.

### 66. Flickr Commons — Nasjonalbiblioteket
- **Account**: https://www.flickr.com/photos/national_library_of_norway/ — verified (3 672 photos, public domain / waived)
- **API**: `https://www.flickr.com/services/rest/` — free API key
- Auto-hero images for chapter/district pages by kommune/place search.

### 67. Sámi language resources
- **Divvun (UiT)**: https://divvun.no/ — verified (dictionaries, spellcheckers)
- **Giellatekno**: https://giellatekno.uit.no/
- **Sámi speech corpora**: via NB Språkbanken
- **Nordic Dialect Corpus v4**: https://www.nb.no/sprakbanken/en/resource-catalogue/oai-tekstlab-uio-no-nordic-dialect-corpus-v4/

For multilingual activity discovery — North/South/Lule Sámi wrappers for chapter descriptions in Finnmark/Trøndelag/Nordland.

### 68. Histreg (UiT historical population register)
- **URL**: https://histreg.no/ — verified

Public search of deceased pre-1964; research-only access to closed part. Too privacy-adjacent for runtime use; useful for Memorial view / Anniversary radar narrative.

---

## News / media / civic

### 69. NRK RSS
- **Pattern**: `https://www.nrk.no/{fylke}/toppsaker.rss` and `/siste.rss` — verified
- **Fylker**: agder, akershus, buskerud, finnmark, innlandet, mr (Møre og Romsdal), nordland, oslo, rogaland, telemark, troms, trondelag, vestfold, vestland, ostfold

Per-fylke news; passive "Aktuelt" feed for district/chapter pages.

### 70. NRK PSAPI
- **URL**: https://psapi.nrk.no/ — open but rate-limited

Podcasts + TV metadata.

### 71. Regional newspapers (pattern, not single API)
- Polaris, Amedia, Schibsted papers mostly expose `/rss`
- Aggregation via Google News RSS: `https://news.google.com/rss/search?q=%22R%C3%B8de+Kors%22+%22{kommune}%22&hl=no&gl=NO&ceid=NO:no`

Per-chapter "Nevnt i pressen" feed.

### 72. Stortinget
- **URL**: https://data.stortinget.no/ — verified
- **Format**: JSON / XML

Saker, debatter, voteringer, representanter, spørretime. Searchable for "Røde Kors" mentions → civic-context feature.

### 73. Regjeringen.no
- **Portal**: https://data.regjeringen.no/
- **RSS**: per department at `https://www.regjeringen.no/no/aktuelt/rss/id446715/` and similar
- Press releases, NOUer, Meld. St. relevant to frivillighet / integration / beredskap.

### 74. Valgresultat
- **Site**: https://valgresultat.no/ — live but transient "nede for vedlikehold" windows observed 2026-04-18
- **API info**: https://www.valg.no/om-valgdirektoratet/om-valgdirektoratet/pressesider/API-med-valgresultater/ — verified

Stortingsvalg, kommunevalg, sametingsvalg, fylkestingsvalg per kommune back to 1999. Civic-engagement proxy for recruitment targeting.

### 75. NVA (replaces Cristin)
- **NVA**: https://nva.sikt.no/ — verified (>2M publications, launched Oct 2025 by Sikt)
- **Cristin**: closed for registration 2025
- Research on volunteer burnout, humanitarian logistics, loneliness etc. Replace all `Cristin` refs with NVA.

### 76. NORA (open research archive)
- **URL**: https://nora.openaccess.no/ — verified
- **Protocol**: OAI-PMH across ~70 institutional repositories; part of OpenAIRE

Master's theses + open-access PDFs referencing Red Cross activities.

### 77. Barneombudet — Barnebarometeret 2025
- **URL**: https://www.barneombudet.no/barnebarometeret-2025 — verified
- **Report**: `/uploads/documents/Publikasjoner/Barnebarometeret-2025-rapport.pdf.pdf`

Evidence base for BARK / Leksehjelp / Ferie for alle messaging ("67% of children want more play at school").

### 78. HUNT / UngHUNT4 (NTNU)
- **Site**: https://www.ntnu.edu/hunt
- **Access**: data by formal application; **reports openly downloadable**
- Helsestatistikk report 15 (Dec 2025). Sharper youth-wellbeing numbers than Ungdata in Trøndelag.

---

## NGO ecosystem

### 79. Frivillig.no
- **Site**: https://frivillig.no/ — verified
- **Open API**: no formal public API; partner-only integration available via Frivillighet Norge

Cross-promote "other ways to help" for users who can't commit to Red Cross. Org-ecosystem context.

### 80. Frivillighet Norge
- **URL**: https://www.frivillighetnorge.no/
- **Barometer microsite**: https://www.frivillighetnorge.no/rapport/frivillighetsbarometeret
- **Nøkkelfakta**: https://www.frivillighetnorge.no/fakta/n%C3%B8kkelfakta-om-frivillighet
- **Format**: HTML microsite + PDF / Excel (Frivillighetsbarometeret annually with Kantar)

Umbrella organisation for Norwegian NGOs (300+ member orgs, 50,000+ lag og foreninger). Publishes the annual Frivillighetsbarometer — the authoritative population survey on participation, motivations and barriers. 2025 headline: 61% of 15+ volunteered in past year, stable vs 2024, youth gap persists. See `sector-research.md` for the substantive findings.

### 81. Senter for forskning på sivilsamfunn og frivillig sektor
- **URL**: https://www.samfunnsforskning.no/sivilsamfunn/
- **Rapporter**: https://www.samfunnsforskning.no/sivilsamfunn/publikasjoner/rapporter/
- **Current programme**: Undersøkelser om frivillig innsats 2025–2029

Research centre at Institutt for samfunnsforskning, funded by Kulturdepartementet. The academic authority on Norwegian civil society. Key recent reports: Solheim (2026) Frivillig innsats i Oslo; Sivesind et al. (2025) on women and immigrants in board seats; Stoltenberg & Sivesind (2025) on state grant regimes; Skiple & Eimhjellen (2025) on digital engagement. See `sector-research.md` for report-level detail and how each maps to personas.

### 82. Den norske kirke
- **URL**: https://www.kirken.no/
- No public open-data API; membership and attendance via annual reports only.

### 83. Idrettsforbundet (NIF)
- **URL**: https://www.idrettsforbundet.no/ — verified (redirected from nif.no)
- Per-kommune membership in annual reports; no clean API.

---

## Municipal open data (fragmented post-Origo)

### 84. Oslo kommune
- **Oslo Origo / developer.oslo.kommune.no**: paused 1 January 2026
- **Bymiljøetaten ArcGIS Hub**: https://oslokommune-bym.opendata.arcgis.com — verified (live replacement surface)
- **GitHub org**: https://github.com/oslokommune — active
- **Statistikkbanken via data.norge.no**: https://data.norge.no/en/datasets/3b424c78-4975-4d3e-ae0b-5a5ce32cdccb

Replace any references to `developer.oslo.kommune.no` with the ArcGIS Hub + GitHub.

### 85. Bergen, Trondheim, Stavanger
- Previous pass listed `data.bergen.kommune.no`, `data.trondheim.kommune.no`, stavanger.kommune.no/smartby — **flagged for re-verification** before building.

### 86. Fellesdatakatalog (data.norge.no) — meta-catalog
- **Portal**: https://data.norge.no/ — verified
- **SPARQL API**: https://sparql.fellesdatakatalog.digdir.no — verified
- **Format**: DCAT-AP-NO (JSON-LD, RDF)

Meta-catalogue of ~10k Norwegian public datasets from ~300 publishers. Single biggest multiplier for discovering yet more sources per kommune.

### 87. Ruter open data
- **URL**: `opendata.ruter.no` — ECONNREFUSED
- **GitHub**: https://github.com/RuterNo/open-data
- Greater Oslo mobility data now flows via Entur.

---

## Research / restricted-but-useful metadata

### 88. microdata.no
- **URL**: https://www.microdata.no/ — verified
- **Access**: Norwegian institutions + directorates, registration required; metadata catalog open
- Metadata catalog useful for knowing what register data *exists* even without runtime access.

### 89. Språkrådet ordbok API
- **URL**: https://ord.uib.no/
- Bokmål/Nynorsk definitions; useful for Norsktrening tooling.

---

## Communication / mobility wildcards

### 90. GBFS mobility (via Entur)
- **Aggregator**: https://api.entur.io/mobility/v2/gbfs/
- Bysykkel/e-scooter live station positions for urban chapter context.

### 91. Unsplash / Pexels / Pixabay (auto-hero fallback)
- **Unsplash**: https://unsplash.com/documentation (demo 50 req/hr, prod 5 000/hr)
- **Pexels**: https://www.pexels.com/api/ (200 req/hr, 20k/month)
- **Pixabay**: https://pixabay.com/api/docs/ (100 req/min, no hotlinking)

For chapters lacking hero imagery, fallback to CC-licensed stock matched on kommune biome.

### 92. YouTube Data API v3
- **Channel**: https://www.youtube.com/channel/UCpXECg8Z047N-KZqjZOzOXg/playlists
- **Quota**: 10 000 units/day free (search 100, list 1 — daily cache keeps quota trivial)
- Embed latest 3 videos on landing page.

### 93. Biblioteksentralen / Bibliofil
- **Bibliofil open API**: https://openapi.bib.no/ — verified (library-issued key)
- Book catalogue for Leksehjelp partnerships with local libraries.

---

## Quick-reference joining keys

| Key | Source | Links to |
|---|---|---|
| `branchId` (e.g. `L099`) | Red Cross API | Internal to API |
| `organizationNumber` (9 digits) | Red Cross API | Brreg, Grasrotandelen, Frivillighetsregisteret, Regnskapsregisteret, Lottstift |
| `kommunenummer` (4 digits) | Red Cross API `branchLocation.municipality` → Klass 131 | SSB, FHI, Bufdir, IMDi, Kartverket, NVDB, Husbanken — **universal Norwegian join key** |
| `fylkesnummer` (2 digits) | Red Cross API `branchLocation.county` → Klass 104 | SSB fylke tables, NRK RSS, klimaprofiler |
| `geoLocation.coordinates` [lon, lat] | Red Cross API | met.no, NVE, Entur, Overpass, any map |
| Chapter URL slug | rodekors.no path | Chapter page + image CDN |
| `globalActivityId` (GUID) | Red Cross API `branchActivities` | Activity taxonomy (48 canonical — see `redcross-activities.md`) |
| Wikidata QID | Wikidata SPARQL | Commons images, Wikipedia summary, foreign-language labels |
| Sentralitetsindeks (1–6) | SSB Klass 128 | Urban-rural structural signal |

**The universal pivot**: if chapter → kommunenummer is clean, 80+ sources unlock.

---

## Authentication summary

| Source | Auth needed? |
|---|---|
| Red Cross Organizations API | Yes — subscription key (free, request via portal) |
| Red Cross Design System | No (npm install) |
| rodekors.no / mittrodekors / nettbutikk / Spleis | No for browsing |
| SSB PxWebApi v2 + Klass | No |
| FHI Folkehelsestatistikk | No |
| Helsedirektoratet HAPI | Varies per API |
| Bufdir Open Data | No |
| Samfunnspuls (embedded PowerBI) | No, but not a clean API |
| Kartverket / Geonorge | No for open datasets; Matrikkel person-level needs agreement |
| Brreg (all registers) | No |
| MET Norway | No (User-Agent only) |
| MET Frost (historical) | Free client ID |
| NVE HydAPI | Free API key |
| NVE Varsom forecasts | No |
| NILU | No |
| Miljødirektoratet Naturbase | Pre-registration expected for full API |
| Vannmiljø / Grunnforurensning WMS | No |
| Entur | Client-name header only |
| Statens vegvesen NVDB v4 / Trafikkdata | X-Client header |
| DSB Kommuneundersøkelsen | No (Excel download) |
| Politiet politiloggen | No (undocumented, TOS unclear) |
| Udir data | No |
| IMDi bosettingstall | No (HTML scrape) |
| UDI asylmottak list | No (HTML scrape) |
| Husbanken Boligsosial Monitor | No |
| NAV pam-stilling-feed | Bearer-auth required |
| NAV AA-registeret | Maskinporten |
| Skatteetaten aggregates | No; Folkeregister full access requires OAuth |
| Domstol.no | No |
| Lovdata open API (free datasets) | No |
| Lovdata open API (protected) | X-API-Key / Basic Auth |
| Konfliktrådet | No |
| Kriminalomsorgen | No (press releases only) |
| Nasjonalbiblioteket / DH-lab | No for metadata + public-domain |
| Digitalarkivet / Arkivverket Fotoweb | No |
| Kulturminnesøk / Riksantikvaren Fotoweb | No |
| DigitaltMuseum (DiMu) | Free API key |
| Wikidata / Wikipedia / Commons | No |
| Flickr API | Free API key |
| NRK RSS + PSAPI | No |
| Stortinget data | No |
| Regjeringen.no RSS | No |
| Valgresultat API | No |
| NVA / NORA | No |
| microdata.no | Institutional affiliation required for full data; metadata open |
| Fellesdatakatalog SPARQL | No |
| Oslo Bymiljøetaten ArcGIS Hub | No |
| Biblioteksentralen Bibliofil | Library-issued key |
| YouTube Data API v3 | Free API key |
| Unsplash / Pexels / Pixabay | Free API key |

---

## Moves and deprecations (what changed since the prior pass)

Fix before building against any of these:

- **Kommunehelsa / Norgeshelsa → FHI Folkehelsestatistikk.** Closed 10 November 2025. New open API: `statistikk-data.fhi.no/api/open/v1/`.
- **SSB PxWebApi v1 → v2.** `data.ssb.no/api/pxwebapi/v2/`. v1 still works during transition.
- **Kriseinfo.no → DSB.** Permanent redirect. Remove Kriseinfo RSS refs.
- **Varsom.** `api.varsom.no` does not resolve. Use `api01.nve.no/hydrology/forecast/…`.
- **Kartverket tide API.** `api.sehavniva.no` deprecated September 2024 → `vannstand.kartverket.no/tideapi_en.html`.
- **NVDB v3 → v4.** `nvdbapiles-v3.atlas.vegvesen.no` is authorised-clients-only. Use `nvdbapiles.atlas.vegvesen.no` with docs at `nvdb-docs.atlas.vegvesen.no/nvdbapil/v4/`.
- **Statens vegvesen trafikkdata.** `vegvesen.no/trafikkdata/start/` 404s → `trafikkdata-api.atlas.vegvesen.no/` (GraphQL).
- **Oslo Origo paused** 1 January 2026. Use Bymiljøetaten ArcGIS Hub + oslokommune GitHub.
- **Cristin → NVA (Sikt).** Cristin closed for registration 2025. NVA at `nva.sikt.no`.
- **Helseatlas.no → skde.no/helseatlas.** 301 redirect.
- **Nif.no → idrettsforbundet.no.** 301 redirect.
- **data.udir.no → udir.no/om-udir/data.** 302 redirect (bookmarks still work).
- **data.brreg.no (browse) → brreg.no/produkter-og-tjenester/apne-data/.** API endpoints (`data.brreg.no/…/api/…`) unchanged.
- **Klimaservicesenter.no → Miljødirektoratet klimaprofiler.** Point docs to the Miljødirektoratet page.
- **Skredfaresoner WMS URL changed Feb 2026.** Use the `Skredfaresoner1` path, not older.
- **Tilfluktsrom UUID corrected** to `dbae9aae-10e7-4b75-8d67-7f0e8828f3d8`.
- **Nasjonalmuseet API v1 retired Jan 2025.** Use DiMu until v2 ships.
- **Ruter opendata.ruter.no → Entur.** Ruter GitHub mirror kept.
- **Bergen/Trondheim/Stavanger open-data portals** flagged for re-verification.
