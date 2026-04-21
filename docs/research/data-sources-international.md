# Data sources — international / humanitarian ecosystem

This document lists international and global data sources that can enrich a Norway-focused Red Cross app with movement, humanitarian, and comparative context. The primary catalogue (Norwegian domestic + Red Cross ecosystem) is `data-sources.md`. The activity → indicator mapping is `redcross-activity-indicator-matrix.md`.

Verification: URLs re-verified against live endpoints on **2026-04-18**. Moves and deprecations are summarised at the bottom.

Bias of this catalogue: **framing and context over runtime data**. Most of these are useful for "Norway in the world" panels, explanatory stripes, and donation-transparency narratives — not for powering the core chapter finder. Build the Norwegian spine first; layer these in where they add clear value.

---

## Red Cross / Red Crescent movement

### 1. IFRC GO Platform
- **Base**: https://goadmin.ifrc.org/api/v2/ — verified
- **Swagger**: https://goadmin.ifrc.org/docs/
- **Wiki**: https://go-wiki.ifrc.org/en/go-api/api-overview
- **Auth**: Open for reads; token auth for authoring

70+ endpoints covering every National Society globally, active emergencies, Emergency Appeals, DREF allocations, Surge Alerts, Field Reports, Situation Reports, PER (Preparedness for Effective Response).

Key endpoints:
- `/country/{iso}/` — Norwegian Red Cross record with KPIs
- `/appeal/?atype={0|1|2}` — DREF / Emergency Appeal / International Appeal
- `/dref-final-report/`
- `/surge_alert/` — active calls for international delegates
- `/event/` — every tracked disaster globally

**Feature fit**: "You're part of a global movement" strip on every chapter page. Shows real-time count of active IFRC operations + Norwegian Red Cross involvement.

### 2. IFRC IATI publication (NEW)
- **URL**: https://iati.ifrc.org/ — verified
- **Format**: IATI Activity + Organisation XML, monthly snapshots back to August 2018

IFRC project-level finance including where Norwegian Red Cross is the `participating-org`. Complements GO for the money-flow story without scraping annual reports.

### 3. American Red Cross "Whatnow" API (NEW — worth prioritising)
- **Docs**: https://whatnow.preparecenter.org/docs — verified
- **Also**: GitHub org https://github.com/AmericanRedCross (149 repos)

Multi-society localised first-aid and early-action messaging keyed to hazard type. Norwegian Red Cross participates. Could power Storm Mode's message layer with canonical, reviewed wording rather than custom copy.

### 4. ICRC
- **Main site**: https://www.icrc.org/
- **Healthcare in Danger**: https://healthcareindanger.org/hcid-project/ — verified (old icrc.org/en/healthcare-in-danger now 404s)
- **IHL Databases**: https://ihl-databases.icrc.org/en — verified (no open API, HTML only)

No general open-data API. For incident-level open data on attacks against healthcare/aid workers, use **Insecurity Insight** (see #19) instead.

### 5. IFRC Climate Centre
- **URL**: https://www.climatecentre.org/ — verified
- No raw-data API. Forecast-based Financing (FbF) trigger tables, Anticipatory Action protocols, country briefings. Good narrative layer for Hjelpekorps climate framing.

### 6. British Red Cross research
- **URL**: https://www.redcross.org.uk/
- No open API. Periodic "Everyone Counts" (loneliness) and "Cost of Living" research — useful UK comparator for Norwegian framing.

### 7. IFRC Network Databank
- **URL**: https://data.ifrc.org/
- Status: mostly a links hub since the 2023 reorg. Use IFRC GO + IATI instead.

### 8. IFRC Disaster Law Database
- **URL**: https://disasterlaw.ifrc.org/
- Country disaster legislation profiles. Mostly HTML with structured fields; limited API.

---

## UN / humanitarian

### 9. UN OCHA HDX (Humanitarian Data Exchange)
- **Portal**: https://data.humdata.org/ — verified
- **Developer docs**: https://data.humdata.org/faqs/devs
- **CKAN API v3**: `https://data.humdata.org/api/3/action/` — `package_search`, `package_show`, `resource_show`
- **HDX HAPI (Beta)** — `https://data.humdata.org/hapi` — unified cleaned API layer over top datasets; prefer this for standardised country-level indicators
- **Auth**: None for read; API key available for higher limits

Aggregated humanitarian datasets: COD (Common Operational Datasets) boundaries, population stats from multiple sources, FTS flows, ACLED, IOM DTM mirror. Norway mostly appears as a donor country.

### 10. UN OCHA FTS (Financial Tracking Service)
- **API**: https://api.hpc.tools/docs/v2/ — verified (Swagger)
- **Portal**: https://fts.unocha.org/content/fts-public-api
- **Auth**: None for reads; email `ocha-hpc@un.org` for a client ID when needed

Every reported humanitarian donation flow globally. Filter `sourceCountry=NOR` for "Norway's humanitarian footprint this year".

### 11. ReliefWeb API
- **Docs**: https://apidoc.reliefweb.int/ — verified (replaces older rwlabs.org)
- **Endpoints**: `/v1/reports`, `/disasters`, `/countries`, `/jobs`, `/training`, `/sources`
- **Auth**: Register your app with ReliefWeb for a pre-approved `appname` param — required from 1 November 2025

Curated humanitarian news, disaster pages with GLIDE IDs, country situation reports.

### 12. UNHCR Refugee Statistics API
- **Root**: http://api.unhcr.org/ — verified
- **Docs**: https://api.unhcr.org/docs/refugee-statistics.html
- **Base**: `https://api.unhcr.org/population/v1/`
- **Endpoints**: `/population`, `/asylum-applications`, `/asylum-decisions`, `/demographics`, `/solutions`, `/unrwa`
- **Auth**: None

**Best source for "where Norway's refugee arrivals come from"** — maps origin country to asylum seekers in Norway across years since 1951. Directly supports Flyktningguide and Norsktrening chapter pages.

### 13. UNHCR Operational Data Portal
- **URL**: https://data.unhcr.org/en/situations — verified (32 active situations)
- **Per-situation**: Ukraine, Syria, Afghanistan, Sudan, Myanmar, South Sudan, DRC, Venezuela etc. expose CSV/Excel dashboards
- No single REST API; scrape per-situation dashboards for live border-crossing counts.

### 14. WHO Global Health Observatory
- **API**: https://ghoapi.azureedge.net/api/ — verified (OData, ~1 500 entity sets)
- **Auth**: None

Mortality, HIV, TB, malaria, NCDs, nutrition, air quality, violence, tobacco, health-workforce. Useful for "Norway vs Nordic neighbours" comparators.

### 15. WHO Europe HFA-DB
- **Portal**: https://gateway.euro.who.int/en/ — verified
- **API**: https://gateway.euro.who.int/en/api/ — verified (8 000+ indicators, 53 European countries)

Regional health comparators — ~1 450 indicators in HFA-DB alone.

### 16. UNICEF SDMX API
- **Portal**: https://sdmx.data.unicef.org/ — verified (v10.8.3)
- **Docs**: https://data.unicef.org/sdmx-api-documentation/
- **Endpoints**: `/data`, `/structure`, `/schema` (SDMX-JSON / SDMX-ML)

Child-focused indicators for Norway in international comparison. Good fit for chapters running BARK, Leksehjelp, Ferie for alle, Kors på halsen.

### 17. World Bank Open Data
- **API**: https://api.worldbank.org/v2/ — verified
- **Auth**: None

Global indicators with complete country coverage back to 1960. Norway-in-OECD context (Gini, GDP per capita, social-protection spend).

---

## Risk, hazards, crisis

### 18. ACAPS Crisis InSight
- **API**: https://api.acaps.org/ — verified
- **Version**: `/api/v1/` — endpoints include `/inform-severity-index/`
- **Auth**: `POST /api/v1/get-auth-token/` with free account → `Authorization: Token …`
- **Important**: INFORM Severity Index methodology was upgraded at the start of 2026 — historical series not directly comparable across the break

~150 crises with standardised severity scores + access-constraint data.

### 19. Insecurity Insight (NEW)
- **URL**: https://insecurityinsight.org/ — verified
- Open incident-level dataset of attacks on healthcare, schools, aid workers. The machine-readable complement to ICRC's Healthcare in Danger analytical reports. Monthly CSVs, country filters.

### 20. INFORM Risk Index (JRC / ECHO)
- **URL**: https://drmkc.jrc.ec.europa.eu/inform-index — verified
- **Latest**: INFORM Risk 2026, XLSX download: `/inform-index/Portals/0/InfoRM/2026/INFORM_Risk_2026_v072.xlsx`
- No open REST API — treat as periodic import

Composite risk per country (hazard × vulnerability × lack-of-coping-capacity). Norway scores very low — useful "Norway ranks X of 191 on coping capacity" framing.

### 21. GDACS
- **RSS**: https://www.gdacs.org/xml/rss.xml — verified (live, 231 records on check)
- **Feeds**: GeoRSS, CAP, ATOM at `/xml/`
- **Auth**: None

Near-real-time global disaster alerts with severity (green/orange/red) and estimated population exposed.

### 22. EM-DAT
- **URL**: https://public.emdat.be/ — verified
- **Access**: Open account required; CSV/XLSX download; not a live API
- **License**: CC-BY-NC (Red Cross qualifies for non-commercial use)

Authoritative historical disaster record from 1900. Norway has ~60 recorded events.

### 23. USGS Earthquake API
- **Base**: https://earthquake.usgs.gov/fdsnws/event/1/ — verified
- **Real-time feeds**: https://earthquake.usgs.gov/earthquakes/feed/v1.0/
- **Auth**: None
- **Format**: GeoJSON / XML / CSV / KML

Complete global catalogue near-real-time. Relevant for Svalbard/Jan Mayen region and Iceland-adjacent traveler context.

### 24. NASA FIRMS
- **API**: https://firms.modaps.eosdis.nasa.gov/api/ — verified (API v4)
- **Auth**: Free MAP_KEY
- **Caveat**: `country`/`countries` endpoints unavailable — use `area` with a bbox for Norway

Satellite-detected active fires within ~3 hours. Increasingly relevant in Nordic wildfire seasons.

### 25. NOAA Space Weather
- **Base**: https://services.swpc.noaa.gov/ — verified
- Kp index, aurora forecast, solar storm alerts. Relevant for northern chapters.

---

## European

### 26. EU Open Data Portal
- **Portal**: https://data.europa.eu/en — verified (1.8M datasets, 208 catalogues, 36 countries)
- **API**: https://data.europa.eu/api/hub/search/
- Federated discovery layer; for Norway-specific data, SSB/Geonorge are almost always better.

### 27. Eurostat
- **API docs**: https://ec.europa.eu/eurostat/web/main/data/web-services — verified
- **Formats**: SDMX 2.1 web services + Eurostat statistics web services (replaces older JSON/Unicode)
- **Updates**: Twice daily (11:00 & 23:00 CET)
- Norway included in most datasets as EFTA. NUTS-3 regional comparisons map to Norwegian fylker.

### 28. European Environment Agency
- **Datahub**: https://www.eea.europa.eu/en/datahub — verified
- **SDI endpoints**: https://sdi.eea.europa.eu/ (OGC services)
- Air quality, climate projections, water quality. European AQI live stations include Norway.

### 29. ECDC surveillance
- **Data**: https://www.ecdc.europa.eu/en/data — verified
- Key products: EpiPulse, Surveillance Atlas, ERVISS (respiratory viruses), ECDC Geoportal, RespiCast.

### 30. Copernicus EMS (Emergency Management)
- **URL**: https://emergency.copernicus.eu/ — verified
- Per-activation GeoTIFF/Shapefile/PDF. No documented open REST. Norwegian events (e.g. Hans 2023 flood) are Copernicus activations — useful historical layer.

### 31. Copernicus Climate Data Store
- **URL**: https://cds.climate.copernicus.eu/ — verified (new CDS migrated 2024/2025 from legacy `cdsapi`)
- **API docs**: https://cds.climate.copernicus.eu/how-to-api
- **Auth**: Free account + personal key

ERA5 reanalysis, seasonal forecasts, CAMS air-quality forecasts. Heavy — pre-process for anomaly indicators rather than run-time queries.

### 32. EU Civil Protection / ERCC
- **Current**: https://civil-protection-humanitarian-aid.ec.europa.eu/what/civil-protection/emergency-response-coordination-centre-ercc_en (old `ec.europa.eu/echo/…` redirects)
- PDF-first daily maps and sitreps. Reference, not ingestion.

---

## Migration

### 33. IOM Missing Migrants Project
- **URL**: https://missingmigrants.iom.int/data — verified
- CSV by region/year. Geolocated record of migrant deaths since 2014. Moral-framing layer for Flyktningguide-capable chapters.

### 34. IOM Displacement Tracking Matrix (DTM)
- **URL**: https://dtm.iom.int/data-and-analysis/dtm-api — verified (v3 current)
- **HDX mirror**: https://data.humdata.org/dataset/global-iom-dtm-from-api
- Publicly accessible IDP figures at country/Admin1/Admin2 for active crises.

### 35. Mixed Migration Centre 4Mi (NEW)
- **URL**: https://mixedmigration.org/4mi/ — verified
- 125 000+ structured interviews with refugees/migrants. Quarterly data releases + 4Mi Interactive explorer. Lived-experience counterpart to UNHCR's counts.

### 36. UN DESA World Population Prospects
- **URL**: https://population.un.org/wpp/ — verified
- Bulk CSVs per country. Essential for ageing-population context alongside SSB projections.

---

## Evidence, indices, comparators

### 37. OECD Data (MIGRATED)
- **New**: https://data-explorer.oecd.org/ — verified (replaces data.oecd.org)
- **SDMX REST**: https://sdmx.oecd.org/public/rest/
- **Rate limit**: 60/hr (up from 20); `lastNObservations` / `firstNObservations` parameters blocked

Harmonised social protection, inequality, education, employment indicators across OECD. Nordic-norm comparators.

### 38. Our World in Data
- **Site**: https://ourworldindata.org/ — verified
- **Data via GitHub**: https://github.com/owid
- **Per-chart CSV**: `https://ourworldindata.org/grapher/{slug}.csv` + `.metadata.json`
- **License**: CC-BY

Curated global datasets; embed a CSV-driven chart re-styled in Red Cross Design System as the "global context" card.

### 39. Gapminder
- **Data**: https://www.gapminder.org/data/ — verified
- CSV/XLSX per indicator. Long time-series, CC-BY.

### 40. V-Dem
- **URL**: https://www.v-dem.net/data/the-v-dem-dataset/ — verified (Version 16, March 2026)
- Democracy/governance indicators. Stata, CSV, R, SPSS.

### 41. Freedom House
- **Portal**: https://freedomhouse.org/report/freedom-world — verified
- **Raw data**: email-request only (`research@freedomhouse.org`, subject "FIW Data Request"). Not an API.

### 42. Fragile States Index
- **URL**: https://fragilestatesindex.org/ — verified
- **Format**: Excel download; annual release

### 43. ALNAP HELP Library
- **URL**: https://alnap.org/help-library/ — verified
- 20 000+ humanitarian learning resources. Search works; no REST API. SOHS 2026 inception report published. Best "what works" evidence source for activity pages.

### 44. CrisisReady
- **URL**: https://www.crisisready.io/ — verified
- Harvard + Direct Relief; mobility/vulnerability/healthcare-facility layers. US-operational, but methodology informs presentation. Inspirational rather than ingestable.

---

## Conflict data

### 45. UCDP (Uppsala Conflict Data Program)
- **Docs**: https://ucdp.uu.se/apidocs/ — verified
- **GED**: https://ucdp.uu.se/ged
- **Auth**: Free token required from February 2026 (email `ucdp@pcr.uu.se` with use-case description)

Georeferenced Event Dataset through v25.1. Useful for mapping conflicts refugees to Norway are fleeing.

### 46. ACLED
- **Docs**: https://acleddata.com/acled-api-documentation — verified
- **HDX mirror**: https://data.humdata.org/organization/acled
- **Auth**: Free researcher tier at `developer.acleddata.com` (non-profit/humanitarian usage typically qualifies above default)

Weekly updates; stronger near-real-time than UCDP.

---

## Climate attribution (NEW category)

### 47. Carbon Brief extreme-event attribution tracker
- **URL**: https://interactive.carbonbrief.org/attribution-studies/index.html — verified (updated March 2026)
- 967 extremes from 819 studies. Interactive map + exportable underlying dataset. 85 % of events attributed to climate influence.

For Hjelpekorps beredskap pages: "the 2023 Agder storm was made X% more likely by climate change" with a citable study.

### 48. World Weather Attribution
- **URL**: https://www.worldweatherattribution.org/event-papers/ — verified
- 100+ rapid attribution studies since 2014 (fires, heatwaves, rainfall, drought, cold spells). Each has a reproducible-code GitHub repo + PDF with return-period numbers.

---

## Loneliness + ageing context

### 49. Meta-Gallup Global State of Social Connections (NEW — high priority for Besøkstjeneste)
- **URL**: https://www.gallup.com/analytics/509675/state-of-social-connections.aspx — verified
- 142-country survey on loneliness (2023 baseline, expanding). Country-level loneliness by age band.

**Best global loneliness dataset for the Besøkstjeneste narrative.** Norway as one bar in a 142-country chart, with the 24% of adults / 27% of 19–29s headline numbers from a credible non-Norwegian source.

---

## Nordic comparators (NEW category)

### 50. Nordic Health and Welfare Statistics (NOMESCO/NOSOSCO)
- **URL**: https://nhwstat.org/ + https://nhwstat.org/database — verified
- Comparable health and welfare indicators across NO/SE/DK/FI/IS. **Stronger local storytelling than global averages** — Norwegian loneliness and elderly-care numbers in a Nordic peer context.

### 51. Nordic Statistics Database
- **URL**: https://www.nordicstatistics.org/ — verified
- Nordic Council of Ministers; integrates Eurostat + national stats. Covers Nordic-wide refugee settlement, language integration.

### 52. Nordregio — State of the Nordic Region
- **Nordic Welfare**: https://nordicwelfare.org/integration-norden/en/ — verified
- **Pub portal**: https://pub.norden.org/
- 2026 report includes diversity-by-country-of-birth deep dive. Downloadable CC-licensed publications.

---

## Structured knowledge

### 53. Wikidata SPARQL
- **Endpoint**: https://query.wikidata.org/sparql — verified
- **UI**: https://query.wikidata.org/

Enables cross-connecting IFRC GO, Red Cross chapters in Norway, Commons imagery, Wikipedia summaries, and foreign-language labels. Can retrieve founding year + volunteer count + HQ coordinates for all 191 National Societies in a single query — powers a "movement globe" visualization.

---

## Activity tie-in — which international sources matter for which activities

Most international data serves **framing**, not runtime. The matches that actually justify work:

### Flyktningguide / Norsktrening / Migrasjon

| Source | What it adds |
|---|---|
| UNHCR Refugee Statistics API | Where Norway's asylum seekers originate; multi-year trend |
| IOM DTM + Missing Migrants | Displacement context in origin countries + cost of journey |
| Mixed Migration Centre 4Mi | Lived-experience evidence for why welcome activities matter |

### BARK / Leksehjelp / Kors på halsen / Ferie for alle

| Source | What it adds |
|---|---|
| UNICEF SDMX API | Country-comparable child poverty, education, mental health — OECD/Nordic context |
| Meta-Gallup Global Social Connections | 27% of young adults feel lonely globally — anchors Kors på halsen framing |
| Nordic Health and Welfare Statistics | Norwegian youth numbers next to Swedish/Danish/Finnish equivalents |

### Hjelpekorps / Beredskapsvakt

| Source | What it adds |
|---|---|
| IFRC GO API | Live "our sister societies are responding to X" strip |
| Carbon Brief attribution + WWA | Climate-attribution citations for past storms |
| GDACS + USGS + Copernicus EMS | Real-time global hazard layer for national live wall |

### Besøkstjeneste

| Source | What it adds |
|---|---|
| Meta-Gallup Global Social Connections | Country-comparable loneliness rates; anchors local number |
| WHO GHO + WHO Europe HFA-DB | Ageing-population indicators, mental health burden across peers |
| UN DESA WPP + Nordic Health and Welfare | 2045/2050 ageing projections globally and Nordic |

### Vitnestøtte, Nettverk etter soning, Gatemegling, Bruktbutikk

Thin international fit. These are locally-driven activities. Skip international layer.

---

## Authentication summary

| Source | Auth |
|---|---|
| IFRC GO (reads) | None |
| IFRC IATI | None |
| American Red Cross Whatnow | None (API key for higher use) |
| HDX / HDX HAPI | None (key for higher limits) |
| UN OCHA FTS | None; client ID optional |
| ReliefWeb | Pre-approved `appname` param required |
| UNHCR Population | None |
| WHO GHO / WHO Europe | None |
| UNICEF SDMX | None |
| World Bank | None |
| ACAPS | Free account → token |
| Insecurity Insight | None |
| INFORM Risk Index | None (Excel download) |
| GDACS | None |
| EM-DAT | Free account |
| USGS FDSN | None |
| NASA FIRMS | Free MAP_KEY |
| NOAA SWPC | None |
| EU Open Data Portal | None |
| Eurostat | None |
| EEA | None |
| ECDC | None |
| Copernicus EMS | None (per activation) |
| Copernicus CDS | Free account + personal key |
| IOM Missing Migrants | None |
| IOM DTM | None (some datasets need registration) |
| Mixed Migration Centre 4Mi | None |
| UN DESA WPP | None |
| OECD | None |
| OWID | None |
| Gapminder | None |
| V-Dem | None |
| Freedom House | Email request only |
| Fragile States Index | None |
| ALNAP HELP | None |
| UCDP | Free token required (Feb 2026+) |
| ACLED | Free researcher tier |
| Carbon Brief attribution | None |
| World Weather Attribution | None |
| Meta-Gallup Social Connections | None |
| Nordic Health and Welfare | None |
| Nordic Statistics | None |
| Nordregio | None |
| Wikidata SPARQL | None (polite use) |

---

## Cross-cutting join keys

| Key | Used by |
|---|---|
| **ISO 3166-1 alpha-3** (`NOR`) | IFRC GO, ReliefWeb, UNHCR, World Bank, OCHA FTS, ACAPS, INFORM, UNICEF, EEA |
| **ISO 3166-1 alpha-2** (`NO`) | Eurostat, ECDC, some EU sources |
| **GLIDE number** (e.g. `FL-2023-000148-NOR`) | ReliefWeb ↔ IFRC GO events ↔ EM-DAT — single disaster identity across humanitarian systems |
| **NUTS code** | Bridges Norwegian fylker to Eurostat regional indicators |
| **Wikidata QID** (e.g. Q12304 = Norwegian Red Cross) | Pivot to Commons, Wikipedia, translated labels |

---

## Moves and deprecations

- **OECD**: data.oecd.org → data-explorer.oecd.org; SDMX REST at sdmx.oecd.org; `lastNObservations` params disabled; rate limit raised to 60/hr.
- **ReliefWeb**: rwlabs.org → apidoc.reliefweb.int; `appname` pre-approval required from Nov 2025.
- **Copernicus CDS**: legacy `cdsapi` → new CDS at cds.climate.copernicus.eu/how-to-api (2024/2025 migration).
- **ICRC Healthcare in Danger**: icrc.org/en/healthcare-in-danger 404s → healthcareindanger.org/hcid-project/. Use Insecurity Insight for machine-readable incidents.
- **UCDP**: anonymous access ended Feb 2026 → free token required.
- **ACAPS INFORM Severity**: methodology changed start of 2026 — historical series not directly comparable.
- **NASA FIRMS**: `country`/`countries` endpoints unavailable — use `area` with bbox.
- **EU ECHO / ERCC**: ec.europa.eu/echo redirects → civil-protection-humanitarian-aid.ec.europa.eu.
- **Evidence Aid**: closed 31 October 2024. Use ALNAP HELP library.
- **IFRC Network Databank**: low utility; use GO + IATI instead.

---

## Prioritisation for v1

If we ship even one international integration:

1. **IFRC GO** — highest ecosystem signal, free, JSON, clear Norway row. Powers the "global movement" strip.
2. **Meta-Gallup Global Social Connections** — anchors Besøkstjeneste framing with a credible non-Norwegian number.
3. **UNHCR Refugee Statistics API** — targeted relevance for Flyktningguide pages.
4. **American Red Cross Whatnow** — canonical preparedness messaging for Storm Mode.
5. **GDACS** — lightweight world-events ticker.
6. **Nordic Health and Welfare Statistics** — stronger local storytelling than global averages.

Everything else is situational. Build the Norwegian core first.
