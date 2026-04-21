# Activity → indicator matrix

For each canonical Red Cross activity, the open data indicators that signal where the humanitarian need is highest. Pairs with:

- `redcross-activities.md` — the canonical activity catalogue (what each activity is, chapter footprint)
- `data-sources.md` — verified Norwegian + Red Cross sources
- `data-sources-international.md` — global/humanitarian framing sources

Verified against live endpoints on **2026-04-18**.

---

## How to read this

**Direction**: **↑ need** = higher indicator value means more humanitarian need; **↓ need** = lower value = more need.

**Granularity**:
- **K** = kommune
- **B** = bydel (Oslo, Bergen, Trondheim, Stavanger)
- **F** = fylke
- **N** = national only
- **Region** = hazard/forecast region (not kommune-aligned)
- **Rettskrets** = court jurisdiction (for Vitnestøtte)

**Caveat flag**: some indicators correlate with need; others correlate with *unmet* need. The difference matters. Where "high value = services present" could be confused with "high value = need met", the caveat is noted.

---

## The common bundle — build these first

Eight data pipelines cover ~85% of activity-need mappings. Build these before chasing niche indicators.

| Indicator | Source | Serves | Granularity |
|---|---|---|---|
| Population by age/sex | SSB table 07459 (PxWebApi v2) | Besøkstjeneste, RØFF, Treffpunkt, BARK, Ferie for alle, Flyktningguide, Bruktbutikk | K + B |
| Household composition (incl. single-person 65+) | SSB table 06070 | Besøkstjeneste, BARK, Ferie for alle | K |
| Child poverty (EU-60) | Bufdir Barnefattigdom monitor | Leksehjelp, BARK, Ferie for alle, Treffpunkt | K + B + delbydel |
| Child welfare | Bufdir Barnevern monitor | BARK, Treffpunkt, Gatemegling | K + B |
| Refugee settlement numbers | IMDi bosettingstall | Norsktrening, Flyktningguide, Migrasjon | K |
| Folkehelseprofil / Oppvekstprofil indicators (ensom, mobbet, trives, psykiske plager, trangbodd) | FHI Folkehelsestatistikk OpenAPI | Besøkstjeneste, RØFF, Leksehjelp, BARK, Treffpunkt, Gatemegling | K + B, biennial |
| Municipal preparedness / ROS-analyse status | DSB Kommuneundersøkelsen | Hjelpekorps, Beredskapsvakt | K, annual |
| Sentralitetsindeks | SSB Klass 128 | Hjelpekorps, Bruktbutikk, Sykehusguide | K |

Joining key for all of these: **kommunenummer** (4 digits). If chapter → kommunenummer resolves cleanly from the Organizations API, these unlock together.

---

## Activity matrix

### Hjelpekorps (285 chapters) — search/rescue + beredskap

Need is structural (risk exposure) rather than demographic.

| Indicator | Source | Granularity | Direction | Caveat |
|---|---|---|---|---|
| ROS-analyse status | DSB Kommuneundersøkelsen 2026 | K, annual | ↑ need where kommune preparedness is weak | Excel raw data |
| Days/year at warning level ≥3 (snøskred + flom + jordskred) | NVE via `api01.nve.no/hydrology/forecast/…` | Region | ↑ = ↑ need | Spatial-join to kommune |
| Sentralitetsindeks | SSB Klass 128 | K | ↓ sentralitet = ↑ need (longer response times) | Updated at kommune mergers |
| Travel time to nearest hospital | Derived: SSB 07459 + Entur | K | ↑ time = ↑ need | Needs isochrone build |
| Historical farevarsel frequency | MET metalerts archive | Polygon | ↑ = ↑ need | |
| Road-accident density (Ulykkespunkt) | Vegvesen NVDB v4 | K | ↑ = ↑ need | |
| Skredfaresoner area overlap | NVE via Geonorge WMS | K | ↑ = ↑ need | |

Demographic indicators don't map well. The best signals are terrain, weather, and remoteness.

### Besøkstjeneste (232) — visiting lonely elderly

The classic Samfunnspuls theme.

| Indicator | Source | Granularity | Direction | Caveat |
|---|---|---|---|---|
| Single-person households 65+ | SSB table 06070 | K + B, annual | ↑ = ↑ need | Gold-standard proxy |
| Ensom indicator | FHI Folkehelseprofil (Ungdata-basert) | K + B, biennial | ↑ = ↑ need | Ungdata source means youth loneliness; directional proxy only |
| Psykiske plager | FHI Folkehelseprofil | K + B | ↑ = ↑ need | |
| Share 80+ in home care | SSB KOSTRA pleie-omsorg (table 12209) | K, annual | ↑ = ↑ public-service load | High share may mean services present, not need unmet |
| Share 80+ with no kommunal service | Derived from SSB pleie-omsorg | K, annual | ↑ = ↑ gap Besøkstjeneste fills | Derivation required |
| Projected 80+ share 2040 | SSB befolkningsframskriving | K | Future-facing need | |
| Fastlege-dekning | Helfo fastlegestatistikk dashboard | K, monthly | ↓ = ↑ social-contact gap | |

### Besøksvenn med hund (127)

Uses Besøkstjeneste indicators. Additional signals:

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Institutional elderly-care share | SSB KOSTRA pleie-omsorg | K | ↑ = ↑ deployment sites |
| Kommunal institution count | Kartverket Matrikkel / SSR | K | ↑ = ↑ access points |

### Beredskapsvakt (156) — first-aid standby

Similar to Hjelpekorps but weighted toward event density.

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Traffic volume (AADT) | Vegvesen Trafikkdata GraphQL | K, continuous | ↑ = ↑ road-incident exposure |
| Large public events proxy | SSB kultur tables + Brreg NACE 93.29 | K, annual | ↑ = ↑ need |
| Tourist overnights | SSB table 08403 | K, monthly | ↑ = ↑ transient population |
| Extreme-weather frequency | Frost API anomalies | Station | ↑ = ↑ standby need |
| DSB Kommuneundersøkelsen beredskapsressurser | DSB | K | ↓ kommunal capacity = ↑ Red Cross role |

### Ung / RØFF (178) — youth volunteers

Need = places with many teens + weak existing youth infrastructure.

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Population 13–19 | SSB table 07459 | K + B, annual | ↑ = ↑ supply of potential volunteers |
| Trives på skolen | FHI Oppvekstprofil | K + B, biennial | ↓ = ↑ recruitment opportunity |
| Deltar i organiserte fritidsaktiviteter | FHI Oppvekstprofil | K + B | ↓ = ↑ gap |
| Venner i nærmiljøet | FHI Oppvekstprofil (via Ungdata) | K + B | ↓ = ↑ need |
| Idrett membership rate | Bufdir kjønnslikestillings-monitor / NIF aggregates | K | ↓ may = ↑ alternative-activity need |

### Kursholder (90) — first-aid instructors

Supply/infrastructure role, not humanitarian need. Frame as "where can we train more instructors."

| Indicator | Source | Granularity |
|---|---|---|
| Population density + sentralitet | SSB 07459 + Klass 128 | K |
| Barnehage + school count (target audience) | Udir BAF + NSR | K |
| Brreg NACE 85 + 88 count (education, care) | Brreg Enhetsregisteret | K |

### Norsktrening (69) — Norwegian language practice

Strong demographic-indicator mapping.

| Indicator | Source | Granularity | Direction | Caveat |
|---|---|---|---|---|
| Bosettingstall per kommune | IMDi | K, daily updates | ↑ = ↑ need | HTML scrape; no open API |
| Innvandrere + norskfødte med innvandrerforeldre | SSB tables 07110 / 07108 | K, annual | ↑ = ↑ long-term demand | |
| Norskopplæring for voksne innvandrere | SSB voksenopplæring stats | K, annual | Who's enrolled — gap = who isn't | |
| NIR (Nasjonalt introduksjonsregister) participants | IMDi | K, continuous | ↑ = ↑ guide-pairing supply | Requires data request |
| HK-dir norskprøve results | HK-dir | K, annual | ↓ pass rate = ↑ practice need | |

### Leksehjelp (66) — homework help

Three strong drivers: child poverty, school-age population, immigration.

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Child poverty (omfang + omfang etter husholdningstype) | Bufdir Barnefattigdom monitor | K + B + delbydel Oslo | ↑ = ↑ need |
| Frafall videregående | FHI Oppvekstprofil | K + B | ↑ = ↑ need |
| Lav utdanning foreldre | FHI Oppvekstprofil | K + B | ↑ = ↑ need |
| Nasjonale prøver grade 5/8/9 | Udir | K (some school-level), annual | ↓ performance = ↑ need |
| Low-income children | SSB table 11605 | K, annual | ↑ = ↑ need |

### Omsorg (65) — broad care

Catch-all in the API taxonomy. Map to whichever specific need the chapter's local description indicates (from scraped rodekors.no page). Use Besøkstjeneste bundle + hjemmetjeneste dekningsgrad + dementia-prevalence proxies from FHI.

### BARK (62) — Barnas Røde Kors

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Child poverty | Bufdir Barnefattigdom | K + B | ↑ = ↑ need |
| Aleneforsørger-husholdninger med barn | SSB table 06070 | K, annual | ↑ = ↑ need |
| Barnevern meldinger/barn | Bufdir Barnevern monitor | K + B + interkomm | ↑ = ↑ need |
| Trangbodd bolig | FHI Oppvekstprofil | K + B, biennial | ↑ = ↑ need |
| Lavinntekt husholdninger med barn | FHI Oppvekstprofil | K + B | ↑ = ↑ need |
| Population 6–12 | SSB table 07459 | K, annual | Scale-setter |

### Flyktningguide (60)

Essentially the same stack as Norsktrening, weighted toward recent arrivals.

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Bosettingstall | IMDi | K, daily | Primary indicator |
| Innvandring etter landbakgrunn | SSB table 05183 | K, annual | ↑ = ↑ need |
| Flyktninger etter statsborgerskap | SSB table 05196 | K, annual | ↑ = ↑ need |
| Introduksjonsprogrammet-deltakere | SSB / IMDi NIR | K, annual | ↑ = ↑ guide-pairing supply |
| UNHCR refugee origin data for Norway | api.unhcr.org/population/v1/asylum-applications | Country of origin | Framing layer |

### Vitnestøtte (43) — court witness support

Uniquely tied to court locations, not kommune-level need.

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Court caseload (Tingrett, Lagmannsrett) | Norges domstoler statistics | Rettskrets, annual | ↑ = ↑ witness volume |
| Anmeldte lovbrudd | SSB table 08484 | Politidistrikt, annual | ↑ = ↑ downstream witness need |

**Don't try to map Vitnestøtte to kommune poverty/demography.** ~45 courts offered vitnestøtte as of 2018 — chapters offering this activity need to be joined to court locations, not to kommune need indicators.

### Migrasjon / Flerkultur / Asylmottak (119)

Similar to Flyktningguide with asylmottak location as a hard geographic constraint.

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Active UDI asylmottak locations | udi.no/asylmottak/ | Coordinate | Hard constraint — scrape required |
| Innvandrere etter landbakgrunn og botid | SSB table 05184 | K, annual | Integration maturity |
| IMDi Flerkultur-statistikk | IMDi | K | Contextual |
| Norskprøve results | HK-dir | K, annual | ↓ = ↑ need |

### Ferie for alle (41) — holidays for low-income kids

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Barnefattigdom omfang etter husholdningstype | Bufdir | K + B | ↑ = ↑ need |
| Barn i lavinntektshusholdninger (EU60) | SSB table 11605 | K, annual | ↑ = ↑ need |
| Enslige forsørgere med sosialhjelp | SSB table 12562 | K, annual | ↑ = ↑ need |
| Trangbodd / utrygge boforhold | Husbanken Boligsosial Monitor | K, annual | ↑ = ↑ respite-holiday need |

### Treffpunkt / Fellesverket (67) — youth drop-in

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Ensom, Trives i lokalmiljøet, Deltar i fritidsaktiviteter | FHI Oppvekstprofil | K + B, biennial | Mixed (see direction per indicator) |
| Population 13–25 | SSB table 07459 | K + B | Scale-setter |
| Barnefattigdom omfang | Bufdir | K + B | ↑ = ↑ need |
| Sosiale tjenester NAV, ungdom | SSB tables 12213 / 12221 | K, annual | ↑ = ↑ need |
| Frafall videregående | Udir/SSB | K, annual | ↑ = ↑ relevant audience |

### Gatemegling (23) — conflict mediation

| Indicator | Source | Granularity | Direction |
|---|---|---|---|
| Anmeldte lovbrudd, age-disaggregated | SSB table 08484 | Politidistrikt, annual | ↑ = ↑ need |
| Mobbet + Trives på skolen | FHI Oppvekstprofil | K + B, biennial | Mixed |
| Barnevern meldinger | Bufdir | K, annual | ↑ = ↑ need |
| Youth violence exposure (Ungdata) | FHI Folkehelseprofil | K | ↑ = ↑ need |
| Konfliktrådssaker per region | Konfliktrådet (PDF) | Region | ↑ = ↑ demand |

### Bruktbutikk (19)

Business/supply-demand signals, not humanitarian need.

| Indicator | Source | Granularity |
|---|---|---|
| Population within 30-min drive | SSB 07459 + Entur | K |
| Sentralitet | SSB Klass 128 | K |
| Detaljhandel concentration (NACE 47) | Brreg | K |
| Household income | SSB table 06944 | K |

Treat as a business-planning tool, not a need map.

### Nettverk etter soning (7) — re-entry mentoring

Geography is prison-locations-and-receivers. No clean public dataset for the second.

| Indicator | Source | Granularity |
|---|---|---|
| Prison locations | Kriminalomsorgen | Coordinate |
| Sosialhjelp share | SSB NAV table 12221 | K, annual |
| Løslatelseskoordinator presence | DSB Kommuneundersøkelsen (proxy) | K |

### Sykehusguide (6)

Fewer than 10 chapters; indicator investment doesn't scale.

| Indicator | Source | Granularity |
|---|---|---|
| Population 70+ per hospital catchment | SSB + Kartverket | Region |
| Sentralitet + travel time to hospital | SSB Klass + Entur | K |
| Activity levels per hospital | Helseatlas (SKDE) | Region |

### Kors på halsen (2) and Besteforeldre i skolen (1)

Too-thin footprint for kommune indicator work. National framing only — use FHI "psykiske plager ungdom" national trend and Ungdata summaries.

---

## International framing layer (optional)

See `data-sources-international.md` for full details. The high-value matches:

| Activity cluster | International sources that add real value |
|---|---|
| Refugee/integration | UNHCR Refugee Statistics API, IOM DTM + Missing Migrants, Mixed Migration Centre 4Mi |
| Youth | UNICEF SDMX API, Meta-Gallup Global Social Connections, Nordic Health and Welfare Statistics |
| Hjelpekorps / Beredskap | IFRC GO API, Carbon Brief attribution tracker, World Weather Attribution, GDACS |
| Besøkstjeneste | Meta-Gallup, WHO GHO + Europe, UN DESA WPP, Nordic Health and Welfare |

Locally-driven activities (Vitnestøtte, Nettverk etter soning, Gatemegling, Bruktbutikk) have thin international fit — skip.

---

## Cross-activity patterns

1. **Kommunenummer is the universal pivot.** Clean chapter → kommunenummer resolution unlocks 80+ sources simultaneously.
2. **Demographic signals cluster around children + youth + elderly + immigrants.** Four personas, four indicator families.
3. **Hjelpekorps and Beredskapsvakt are structural, not demographic.** Drivers are terrain, weather, sentralitet, road accidents — not poverty/loneliness.
4. **Vitnestøtte doesn't fit the kommune model.** Join to rettskrets.
5. **Bruktbutikk is supply/demand, not need.** Frame as business planning.
6. **FHI Folkehelseprofil + Oppvekstprofil + Bufdir Barnefattigdom + IMDi bosettingstall + SSB population + DSB Kommuneundersøkelsen** is the core indicator spine. If you build APIs for these five sources, you can show need for every activity except Vitnestøtte and the micro-footprint ones.

---

## Caveats and open questions

- **Bosettingstall vs bosatte vs asylsøkere.** IMDi's bosettingstall is settlement *requests* to a kommune per year. Actual arrivals vary. SSB 05196 (flyktninger etter statsborgerskap) is the retrospective stock measure. Use both, label clearly.
- **Ungdata via FHI is youth-biased.** When FHI's Folkehelseprofil shows "Ensom", the underlying Ungdata source means it reflects *youth* loneliness. Don't use as elderly-loneliness indicator without caveat.
- **KOSTRA pleie-omsorg is services-delivered, not need.** High home-care share in a kommune may mean services are *present* and filling need, not that need is unmet.
- **Nasjonale prøver per-school data** is partially public but sensitive — display at kommune aggregate to avoid ranking individual schools.
- **Fastlege coverage** reflects current capacity, not historical demand. A newly-staffed kommune may show healthy numbers despite long-run unmet need.
- **DSB Kommuneundersøkelsen is self-reported** by kommune administrations. Correlates with administrative capacity, not necessarily actual preparedness on the ground.

---

## Missing / hard-to-get

Data we'd want but can't easily get:

- **Asylmottak occupancy in real time** — UDI publishes facility list but not per-mottak daily headcount.
- **Chapter-level volunteer counts** — not in Organizations API; would need a separate scrape or API.
- **Per-kommune release from prison counts** — Kriminalomsorgen publishes national figures, not where released people resettle.
- **Court-level witness volume** — Norges domstoler publishes caseload but not witness numbers specifically.
- **Loneliness at bydel-level outside Oslo/Bergen/Trondheim/Stavanger** — Ungdata / FHI bydel coverage is limited to the big four cities.
- **Private-donation flows per chapter** — captured internally by Red Cross but not publicly exposed.
- **Real-time kommune-level incident data from Politiet** — politiloggen works but is undocumented and its TOS is unclear for bulk republishing.
