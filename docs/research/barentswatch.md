# BarentsWatch — and the Felles Ressursregister (FRR)

BarentsWatch is a Norwegian state programme that collects, develops and shares cross-sectoral information about Norwegian coastal and marine areas. It is the host of **Felles Ressursregister (FRR)** — the shared resource information repository used by the rescue services to see, in real time, which volunteer and public resources are available, where they are, and how to reach them.

Pairs with:
- [forf.md](forf.md) — FRR is the operational data layer that surfaces FORF members' resources to HRS and politiet
- [ngo-landscape.md](ngo-landscape.md) — multiple NGOs in the rescue cluster (Røde Kors Hjelpekorps, Norsk Folkehjelp Sanitet, Redningsselskapet, Norske Redningshunder, NLF Flytjenesten) feed data into FRR
- [data-sources.md](data-sources.md) — BarentsWatch operates several open-data APIs that overlap with the data-sources catalogue

Verified on **2026-04-19** against barentswatch.no and kystverket.no.

---

## 1. BarentsWatch — programme identity

| Field | Value |
|---|---|
| Established | 2012 (part of Regjeringens nordområdesatsing) |
| Hosting agency | Kystverket (Norwegian Coastal Administration) |
| Office location | Tromsø, Framsenteret |
| Funding | Statsbudsjettet via Nasjonal transportplan (NTP) |
| Sponsor ministry | Samferdselsdepartementet (via Kystverket) |
| Scope | 10 ministries + 29 etater og forskningsinstitutter as partners |
| Public portal | barentswatch.no |
| FRR contact | fellesressursregister@barentswatch.no |

Mission (verbatim): *"BarentsWatch will collect, develop and share information about Norwegian coastal and marine areas."*

Beyond the maritime-data scope, BarentsWatch has become the natural host for cross-agency operational tools — FRR is the prime example, since rescue resources naturally span sea, coast, and land.

---

## 2. Partner ministries and agencies

### Ministries (10)

Klima- og miljødepartementet · Forsvarsdepartementet · Kunnskapsdepartementet · Finansdepartementet · Utenriksdepartementet · Justis- og beredskapsdepartementet · Kommunal- og moderniseringsdepartementet · Olje- og energidepartementet · Nærings- og fiskeridepartementet · *(plus Samferdselsdepartementet via Kystverket as host)*

### Agencies and research institutes (29)

| Operational / regulatory | Research / data |
|---|---|
| Forsvaret | Forsvarets forskningsinstitutt (FFI) |
| Kystverket | Meteorologisk institutt |
| Fiskeridirektoratet | Kartverket |
| Politidirektoratet | Norsk Polarinstitutt |
| Tolletaten | Havforskningsinstituttet |
| Hovedredningssentralene (HRS Sør-Norge, HRS Nord-Norge) | Norges geologiske undersøkelse (NGU) |
| Sokkeldirektoratet | Norsk Romsenter |
| Sjøfartsdirektoratet | SINTEF |
| Mattilsynet | UiT — Norges arktiske universitet |
| Direktoratet for samfunnssikkerhet og beredskap (DSB) | NILU |
| Miljødirektoratet | NIVA — Norsk institutt for vannforskning |
| Sysselmesteren på Svalbard | NORCE |
| Skatteetaten | Nansen Environmental and Remote Sensing Center |
| | CICERO |
| | UNIS — University Centre in Svalbard |
| | Nofima |
| | NIBIO |

This is an unusually wide cross-sectoral collaboration — note the co-presence of police (POD, HRS), defence (Forsvaret, FFI), tax/customs (Skatt, Toll), maritime/coastal (Kystverket, Sjøfart), civil protection (DSB), and environmental research. That breadth is what makes BarentsWatch a credible host for shared inter-agency tools.

---

## 3. Services BarentsWatch operates

| Service | Domain |
|---|---|
| **Felles Ressursregister (FRR)** | Shared rescue-resource catalogue (see §4) |
| **Felles Operasjonelt Verktøy (Joint Operation Tool)** | Operational picture for inter-agency action |
| NAIS | Real-time AIS ship traffic |
| ArcticInfo | Voyage information for safe Arctic navigation |
| Wave and current forecast | Bølge- og strømvarsel for Norwegian fairways |
| FishInfo · Fishhealth · AkvaInfo · Ohoi | Fisheries, aquaculture and fish-health |
| Marine spatial management tool · NordicSpatial | Marine spatial planning |
| Ocean Surveillance Programme | Cross-agency ocean monitoring |

*"Most of the data content you find in our services is also available as open data through APIs and downloads."* — relevant for the data-sources catalogue.

---

## 4. Felles Ressursregister (FRR) — the rescue-resource layer

### Purpose

*"All rescue and emergency workers must have the resource information they need through a secure system."* FRR streamlines operational efforts by sharing live information about relevant resources across agencies and volunteer organisations to strengthen public security.

### Resource users (who consults FRR)

- **Hovedredningssentralene** (HRS Sør-Norge i Sola, HRS Nord-Norge i Bodø)
- **Politiets operasjonssentraler** (alle politidistrikt)
- **Politidirektoratet (POD)**

### Resource owners (who publishes data into FRR)

| Organisation | Notes |
|---|---|
| Norske Redningshunder (NRH) | First volunteer org connected (2015) |
| Redningsselskapet (RS) | Integration work began 2015 |
| Norsk Folkehjelp Sanitet (NFS) | Registered spring 2016 |
| Røde Kors Hjelpekorps (RKH) | Quality assurance from autumn 2016 |
| NLF Flytjenesten | Air resources from Norges Luftsportforbund |
| Seløy Kystferie | Private actor — small-vessel capacity in distressed situations |
| *Coming* | Kystverket (own resources), Sivilforsvaret (DSB) |

The FRR resource-owner list overlaps almost 1:1 with FORF membership ([forf.md](forf.md)) — FORF is the *political/representational* forum, FRR is the *operational/data* layer. Together they cover both sides of the volunteer-rescue coordination problem.

### What's in a FRR record

- Type of resource (people / dog-team / vessel / aircraft / radio operator / vehicle)
- Capacity (area of usage, what the resource can actually do)
- Position (live / last-known)
- Contact (how to reach the resource owner / leader)
- Availability status (in service / out of service / on assignment)

### How it works technically

- **Data ingestion**: API integration from member orgs' professional systems (e.g. RS vessels via AIS), manual updates via secure web login, or via Nødnett-tilkoblede terminals.
- **Position updates**: automatic and real-time where the source system supports it.
- **Search & dispatch**: HRS/operasjonssentral can filter resources by type, capacity, distance/ETA from incident, status. The system computes response time from location and geography.
- **Authentication**: ID-porten (DIFI) at the highest civil-security level. Confidentiality, integrity, availability designed for offline-tolerant operation if internet is lost.

### Operational track record

JRCC has *"several times"* deployed nearest available rescue dogs purely on the basis of FRR position data. Seløy Kystferie has been used in smaller incidents where other vessels had problems.

### Governance

Initiated and funded through the BarentsWatch programme. Steering and prioritisation involves:

- Hovedredningssentralene (early main driver)
- Politidirektoratet
- DSB
- Operational expert group with representatives from all member orgs
- User conferences and continuous user feedback

Development is delivered by commercial suppliers procured by BarentsWatch / Kystverket.

---

## 5. Why this matters for an NGO-explorer / Red Cross-anchored framework

- **Operational truth-source.** For volunteer rescue resources at any moment in time, FRR — not Brreg, not the org websites — is the canonical "who is where, doing what". Any crisis-band UI that tries to surface live volunteer capacity has to reckon with the fact that the authoritative live picture is already inside FRR (and not publicly readable).
- **Why FRR is not a public API.** Rescue operations expect resource positions and statuses to be sensitive. FRR is access-controlled at the highest civil-security level via ID-porten. Public-facing chapter finders cannot ride on FRR data; they have to build their own, slower, public layer.
- **What public-facing tools *can* reuse.** BarentsWatch's open-data side (NAIS AIS, weather/wave forecast, Fisheries APIs) is directly consumable. For a chapter-anchored finder this is mostly relevant if you ever want maritime context (e.g. distance to nearest Redningsselskapet station combined with sea conditions).
- **Coordination model.** FORF + FRR together is the canonical Norwegian model for *"public authority coordinates volunteer capacity"*: FORF on the policy/competence side, FRR on the operational-data side, both anchored in the *integrert, koordinert, offentlig redningstjeneste* doctrine.

---

## Key references

- [BarentsWatch — Shared Resource Information Repository (FRR)](https://www.barentswatch.no/en/articles/shared-resource-information-repository/)
- [BarentsWatch — about](https://www.barentswatch.no/en/about/)
- [BarentsWatch — partners](https://www.barentswatch.no/en/partners/)
- [Kystverket — BarentsWatch (English)](https://www.kystverket.no/en/about-us/barentswatch/)
- [BarentsWatch — Wikipedia](https://en.wikipedia.org/wiki/BarentsWatch)
- [Forskrift om tilskudd til frivillige organisasjoner i redningstjenesten (FOR-2020-12-10-2679)](https://lovdata.no/dokument/LTI/forskrift/2020-12-10-2679) — sister legal framework on the funding side
