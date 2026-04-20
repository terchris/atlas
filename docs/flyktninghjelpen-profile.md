# Flyktninghjelpen / NRC — organisation profile

Reference profile for **Stiftelsen Flyktninghjelpen / Norwegian Refugee Council (NRC)**, org.nr `977538319`. NRC is the largest Norwegian humanitarian by income (NOK 9.29 bn in 2024 — about 2.8× Norges Røde Kors central) and the country's most visible humanitarian operator internationally.

In our framework NRC is a **Tier C** organisation (`ngo-landscape.md` §5): a professional humanitarian operator with no domestic chapter network, no member democracy, and no volunteer pathway. The chapter-anchored model that drives Tier A surfaces (Red Cross, Sanitetskvinnene, Nasjonalforeningen, Folkehjelp, etc.) doesn't apply, so NRC doesn't get an `activities.md` or `activity-indicator-matrix.md`. It does still appear in three places in the app — Compare NGOs, Funding transparency, and the Global-context panel during active crises — and this profile is the data source behind those surfaces.

Verified live on **2026-04-18** against Brreg, Innsamlingskontrollen, nrc.no and flyktninghjelpen.no. Caveats and gaps at the bottom.

---

## At a glance

| Field | Value | Source |
|---|---|---|
| Legal name | NORWEGIAN REFUGEE COUNCIL (NRC) - STIFTELSEN FLYKTNINGHJELPEN | Brreg |
| Org.nr | 977 538 319 | Brreg |
| Form | Stiftelse (foundation) | Brreg |
| Stiftelsesdato (legal entity) | 1997-03-13 | Brreg |
| Founded (org history) | 1946 as **Europahjelpen**; renamed Norwegian Refugee Council in 1953 | NRC 75-year publication, Wikipedia |
| Foundation capital | NOK 1 000 000 (fully paid) | Brreg |
| HQ | Prinsens gate 2, 0152 Oslo | Brreg |
| Næringskode | 88.996 — Andre sosialtjenester uten botilbud ellers | Brreg |
| Sector | Ideelle organisasjoner | Brreg |
| Generalsekretær | **Jan Egeland** (since August 2013) | NRC, Wikipedia |
| Styreleder | Kristin Skogen Lund (elected December 2024) | nrc.no/leadership |
| Employees (Brreg `antallAnsatte`, central) | **325** | Brreg |
| Employees globally (NRC self-report 2024) | ~15 000 aid workers across 40 countries | nrc.no/who-we-are |
| Beneficiaries reached 2024 | **9.1 million people** (some sources round to 10m) | nrc.no/about-nrc |
| Countries of operation | **40** active country programmes | nrc.no/where-we-work |
| Total income 2024 | **NOK 9 290.2 m** (USD ~864 m); +15% vs 2023 | Innsamlingskontrollen, NRC finances |
| Income 2023 (comparator) | NOK 8 097.4 m | Innsamlingskontrollen |
| Income 2022 (comparator) | NOK 7 062.1 m | Innsamlingskontrollen |
| Direct purpose costs 2024 | NOK 9 034.7 m | Innsamlingskontrollen |
| Fundraising costs 2024 | NOK 134.8 m | Innsamlingskontrollen |
| Share-to-cause | NRC self-reports **>90%** every year 2020–2024; ngo-landscape.md cites 97.2% from earlier Innsamlingskontrollen calc — see Caveats | NRC, Innsamlingskontrollen |
| Innsamlingsprosent (5-year avg) | 72.1% | Innsamlingskontrollen |
| Members | n/a (stiftelse — no membership concept) | — |
| Volunteers in Norway | **None as a formal pathway** — see "How to engage" | flyktninghjelpen.no FAQ |

---

## What they do

NRC organises its operational work around **six core competencies** (the same six in Norwegian and English; the taxonomy is stable and identical to the framework used by ECHO, OCHA, and most institutional donors):

| Programme | Norwegian | What it covers |
|---|---|---|
| **Education** | Utdanning | Schools-in-emergencies, accelerated learning, teacher training, safe learning environments |
| **Information, Counselling and Legal Assistance (ICLA)** | Rettshjelp | Civil documentation, housing/land/property rights, legal aid for displaced people. NRC is the global standard-bearer for this |
| **Livelihoods and Food Security** | Matsikkerhet | Cash transfers, livelihood support, food assistance |
| **Protection from Violence** | Beskyttelse fra vold | Protection monitoring, GBV response, child protection |
| **Shelter and Settlements** | Husly | Emergency and transitional shelter, site planning, NFI distribution |
| **Water, Sanitation and Hygiene (WASH)** | Rent vann | Water supply, sanitation, hygiene promotion |

Source: nrc.no/where-we-work + flyktninghjelpen.no/om-oss; cross-referenced with NRC's 2024 reporting.

### Flagship initiatives

- **NORCAP** — global standby roster providing humanitarian, development and peacebuilding expertise. Deploys experts to UN agencies and host governments (and increasingly to climate and peace operations). Run as a unit with its own Executive Director (Benedicte Giæver, 2026).
- **Internal Displacement Monitoring Centre (IDMC)** — Geneva-based, NRC-owned. Publishes the annual **Global Report on Internal Displacement (GRID)** — the world's authoritative IDP statistics. GRID 2025 reported a record **83.4 million internally displaced people** at end-2024 and **45.8 million disaster displacements** in 2024 alone (highest since 2008).
- **Flyktningregnskapet** — NRC's Norwegian-language flagship publication, launched annually around World Refugee Day (June). Combines IDMC's IDP data with UNHCR refugee data into a single Norwegian-facing displacement account. Edition 2025 is the most recent.
- **Education Cannot Wait (ECW)** — NRC is a key implementing partner; Jan Egeland has been a consistent public advocate.

---

## Where they work

NRC structures field operations into five regions plus representation offices. Country list as of April 2026 (40 active programmes; two recent closures noted):

| Region | Countries |
|---|---|
| Africa (19) | Burkina Faso, Cameroon, Central African Republic, Chad, Djibouti, DR Congo, Eritrea, Ethiopia, Kenya, Libya, Mali, Mozambique, Niger, Nigeria, Somalia, South Sudan, Sudan, Tanzania, Uganda |
| Americas (8) | Colombia, Ecuador, El Salvador, Guatemala (closed Dec 2025), Honduras, Mexico, Panama, Venezuela |
| Asia (4) | Afghanistan, Bangladesh, Iran, Myanmar |
| Europe (3) | Moldova, Poland (closed March 2025), Ukraine |
| Middle East (6) | Iraq, Jordan, Lebanon, Palestine, Syria, Yemen |
| Representation offices (5) | Berlin, Brussels, Geneva, London, Washington D.C. |

Source: nrc.no/where-we-work (live, 2026-04-18).

NRC's own page does **not** publish country-level expenditure or beneficiary breakdowns. For that, FTS (`api.hpc.tools/v2/public/flow`) and ReliefWeb sitreps are the better sources for our app's Global-context panel — both query by appeal/operation rather than by NRC alone.

---

## Money in — funding composition

This is the data point that lands hardest for **Jonas (transparency-focused donor)** and **Ola (data-curious observer)**: NRC's NOK 9.29 bn income is overwhelmingly **institutional** and the largest single donor is **American**, not Norwegian.

### Top 5 donors 2024 (share of total income)

| Rank | Donor | Share | Type |
|---:|---|---:|---|
| 1 | **US Bureau for Humanitarian Assistance (BHA)** | 17.2% | US gov |
| 2 | **Norwegian Ministry of Foreign Affairs (UD)** | 14.2% | Norwegian gov |
| 3 | **EU Civil Protection and Humanitarian Aid (ECHO)** | 11.1% | EU institution |
| 4 | **Norwegian Agency for Development Cooperation (Norad)** | 6.2% | Norwegian gov |
| 5 | **World Food Programme (WFP)** | 6.1% | UN agency (pass-through) |
| | **Top 5 combined** | **~54.8%** | |

Source: nrc.no/finances (live, 2026-04-18).

### What this tells us

- **Norwegian state share (UD + Norad) is ~20.4%** of NRC's 2024 income — meaningful but smaller than commonly assumed. NRC is genuinely a globally-funded humanitarian operating from a Norwegian base, not a NORAD pass-through.
- **US BHA is the single biggest donor** (17.2%). Any change to US humanitarian funding policy is a first-order risk for NRC's revenue. Worth flagging in transparency UX given the ~2025 US BHA contraction discussions.
- **EU ECHO is 11.1%** — the EU is essentially co-equal with the Norwegian state as a funder.
- **UN agency pass-through** (WFP at 6.1%, plus other UN flows not in top 5) confirms NRC's heavy implementing-partner role for UN-led responses.
- **Private giving from Norway is a small share** of overall income but is growing — NRC notes increased private donations in 2024 vs 2023, with corporate giving flat.

### Funding flows outside Lottstift

Like other operational humanitarians, NRC's Norwegian state funding routes through **direct UD and Norad framework agreements**, not through `tilskudd.lottstift.no` ordninger. A naive Lottstift query for 977538319 will return little to nothing — the real money is in Statsbudsjettet kap. 151–160 (UD humanitarian and development) and Norad rammeavtaler. This is the same pattern that hides Kirkens Nødhjelp's Norad ~350m, Folkehjelpens Norad/UD frame, and Plan/Redd Barna rammeavtaler. See `ngo-landscape.md` §4 caveats.

---

## Money out — by programme and geography

NRC publishes:
- Total direct purpose costs 2024: **NOK 9 034.7 m** (97.3% of income, gross)
- Fundraising costs 2024: **NOK 134.8 m** (1.5%)
- Administration: residual ~1–2%

A programme split (Education vs ICLA vs Shelter etc.) and a country expenditure split are reported in NRC's annual report PDF (`arsregnskap-stiftelsen-flyktninghjelpen-2024.pdf`, hosted on Innsamlingskontrollen) but the PDF couldn't be parsed as text in this verification pass. For app surfaces that need country-level expenditure, the better data source is **OCHA FTS** (`api.hpc.tools/v2/public/flow?destinationOrganization=nrc`) cross-referenced with appeal IDs.

---

## How to engage

NRC is **donor-only** for the Norwegian public. There is no member, no lokallag, no volunteer pathway, no school-ambassador or student-ambassador programme on the public site.

Verified pathways (flyktninghjelpen.no/hjelp/sporsmal-og-svar):

| Pathway | URL / route | Note |
|---|---|---|
| Recurring giver (AvtaleGiro / Vipps) | `donate.nrc.no/no?df=recurring` | Primary ask |
| One-off donation | `stott.flyktninghjelpen.no/hjelp/` | Vipps + card |
| Crowdfunding (Spleis) | `spleis.no/project/select/template` | Birthday/event campaigns |
| Webshop — gaver med mening | `shop.flyktninghjelpen.no` | Symbolic gifts |
| Minnegave (memorial gift) | flyktninghjelpen.no link | Funeral-context giving |
| Testamentarisk gave (arv) | flyktninghjelpen.no link | Bequest |
| Tax deduction | 500–25 000 NOK qualifies for skattefradrag | Norwegian rules |

Why no volunteer pathway? Three structural reasons:
1. **Operational model.** NRC is a professional humanitarian operator; field staff are paid national or international employees, deployed through HR processes and security/duty-of-care vetting. Untrained volunteers don't fit that model.
2. **Stiftelse form.** Foundations don't have members; the only governance bodies are the styre and (where applicable) the råd. Volunteer involvement would require a separate organisational structure.
3. **Where the volunteer ask sits.** When NRC needs surge capacity, it goes through **NORCAP** — but NORCAP recruits on professional rosters, not as a public-engagement programme. Norwegian volunteers who want refugee-adjacent work are systematically pointed toward Røde Kors flyktningsguide, Folkehjelp's flyktningguide-arbeid, or kommune-level integration partners.

For the app, this means NRC's chapter card in the Compare-NGOs view should explicitly say "donasjonsbasert organisasjon — ingen lokallag, ingen frivilligplassering" rather than show an empty volunteer slot.

---

## Governance

- **Form**: Stiftelse, regulated under stiftelsesloven; supervised by Stiftelsestilsynet. Foundation capital NOK 1 000 000.
- **Generalsekretær**: Jan Egeland, since August 2013 (came from European Director role at Human Rights Watch 2011–2013).
- **Styreleder**: Kristin Skogen Lund (elected Dec 2024).
- **Nestleder**: Amira Malik Miller.
- **Board**: 11 members total, mix of Norwegian and international humanitarian/business/policy backgrounds.
- **Senior Management Group** (Oslo HQ, 2026): Geir Olav Lisle (CFO + Deputy SG), Maureen Magee (Field Operations), Benedicte Giæver (NORCAP), Sean Nicholson (Private Fundraising), Camilla Waszink (Partnerships and Policy), Ragna Eskeland (People and Organisation), Marianne Irion (Risk Management).

### Governance documents (publicly available)

- Open Information Policy
- Conflict of Interest Policy
- Personal Data and Privacy Policy (GDPR-compliant)
- Safeguarding Policy
- Anti-corruption annual reporting (published by 30 June each year)
- **Core Humanitarian Standard (CHS)** certification

Information requests routed via `openinformation@nrc.no` (response within 7 working days, 30-day max).

---

## Where NRC appears in our app (and where it doesn't)

| Surface | Included? | Why |
|---|---|---|
| **Compare NGOs** (Jonas/Tone) | **Yes** | NRC's 9.29 bn dwarfs any domestic NGO; transparency contrast vs Røde Kors/Folkehjelp/Kirkens Nødhjelp is genuinely informative |
| **Funding transparency / sector overview** (Ola) | **Yes** | NRC is the canonical example of "Norwegian NGO funded mostly from outside Norway" — anchors the international-vs-domestic story |
| **Global-context panel during crises** (Lars/Tone) | **Yes** | Surface NRC alongside IFRC appeals, ReliefWeb sitreps, GDACS alerts when active crisis is in a country where NRC operates |
| **Chapter finder** (Kari/Amira/Lars) | **No** | No domestic chapters — Tier C |
| **Activity Atlas** (cross-NGO activity discovery) | **No** | No Norwegian-public activities to surface |
| **Volunteer pathway (Gi tid)** | **No** | No volunteer programme — show explicit "donasjonsbasert" label instead |
| **Member pathway (Bli medlem)** | **No** | Stiftelse — no membership |
| **Campaign action (Ta et standpunkt)** | **No** | NRC is operational, not advocacy-led; advocacy work goes through institutional channels (UN briefings, op-eds), not public petitions |
| **Donate pathway (Gi penger)** | **Yes** | Deep-link to `donate.nrc.no/no` |
| **Activity-indicator matrix** (kommune-level need × NGO presence) | **No** | NRC operates internationally; not relevant to kommune-level Norwegian-need indicators |
| **Tilskuddsmatcher** (Lisa) | **Marginal** | Most NRC funding is institutional UD/Norad/EU/UN, not the directorate-grant universe Lisa works in. Could surface UD humanitarian appeals but those aren't open competitive ordninger |

---

## Data sources specific to NRC

| Source | URL | What it gives us | Update cadence |
|---|---|---|---|
| Brreg Enhetsregisteret | `data.brreg.no/enhetsregisteret/api/enheter/977538319` | Legal name, form, address, antallAnsatte, næringskode | Live |
| Innsamlingskontrollen org page | `innsamlingskontrollen.no/organisasjoner/stiftelsen-flyktninghjelpen/` | Income, ratios, links to annual report PDFs | Annual (April–May) |
| Annual accounts PDF | `app.innsamlingskontrollen.no/storage/document/arsregnskap-stiftelsen-flyktninghjelpen-{year}.pdf` | Full activity account, programme split, geographic split | Annual |
| Annual board report PDF | `app.innsamlingskontrollen.no/storage/document/arsberetning-stiftelsen-flyktninghjelpen-{year}.pdf` | Narrative, governance, risk | Annual |
| NRC finances page | `nrc.no/who-we-are/finances` | Top donors, USD income, year-over-year change | Annual (English) |
| NRC where we work | `nrc.no/where-we-work` | Country list, regional structure | Live |
| Flyktningregnskapet | `flyktninghjelpen.no/flyktningregnskapet` | Annual displacement statistics (Norwegian) | Annual (June) |
| GRID (IDMC) | `internal-displacement.org/global-report/` | Global IDP statistics | Annual (May) |
| OCHA FTS | `api.hpc.tools/v2/public/flow?destinationOrganization=nrc` | Country-level humanitarian funding flows to NRC | Live |
| ReliefWeb | `api.reliefweb.int/v1/reports?filter[field][source]=NRC` | Operational sitreps | Live |
| NRC English site | `nrc.no` | Programmes, leadership, governance docs (English) | Live |
| NRC Norwegian site | `flyktninghjelpen.no` | Public-facing donor pathways | Live |

---

## Similar Tier C orgs — same profile pattern applies

These professional-operator stiftelser/foreninger sit in the same structural slot as NRC: no domestic chapters, no member democracy, donate-first engagement. Each could be profiled with the same template (At a glance / What they do / Where they work / Money in / Money out / How to engage / Governance / App fit / Sources). Income figures from `ngo-landscape.md` §4.1.

| Org | 2024 income (NOK m) | Note |
|---|---:|---|
| Kirkens Nødhjelp | 1 379 | Church-anchored; uses menigheter as engagement surface |
| SOS-barnebyer Norge | 668 | Sponsorship model (~100 000 givers); stiftelse |
| Leger Uten Grenser Norge | 618 | 100% private donors by policy since 2016 |
| Plan International Norge | 612 | 115 000 fadder; Norad rammeavtale |
| Regnskogfondet | 328 | Norad/Klimainvest-dominated |
| UNICEF-komiteen Norge | 250 | 100% private; no Norwegian state money |
| CARE Norge | 227 | UD/Norad/SIDA/EU/Postkodelotteriet |

For app implementation, all seven plus NRC could share a single `tier-c-operator` template component differing only in donor mix, programme list, and country list.

---

## Caveats and gaps

- **Share-to-cause discrepancy.** `ngo-landscape.md` cites 97.2% — that's the older Innsamlingskontrollen-method figure. Current Innsamlingskontrollen page no longer shows a single formålsprosent number explicitly; instead reports the gross direct-purpose-cost ratio (97.3% of income on direct purpose costs in 2024) and a 5-year innsamlingsprosent (72.1%). NRC's own narrative consistently says ">90%" for 2020–2024. All three are defensible; pick one and label methodology.
- **Staff figures vary.** Brreg `antallAnsatte` is 325 (Oslo HQ point-in-time). NRC's own "who we are" page says **15 000 aid workers globally**. Wikipedia/Grokipedia cite **16 500 staff and incentive workers**. The 9 200 figure in `ngo-landscape.md` looks low — likely a 2022 or 2023 number; the current global figure is 15 000+. Updated count should be propagated to the landscape doc.
- **Annual accounts PDF parsing failed.** The `arsregnskap-stiftelsen-flyktninghjelpen-2024.pdf` couldn't be extracted as text via WebFetch — parsed as binary. Programme-by-programme expenditure split and country-level expenditure split exist in that PDF but require headless-browser or PDF-to-text extraction. Worth running offline once for exact numbers.
- **Founding-year ambiguity.** Brreg says 1997-03-13 (current legal entity registered as stiftelse). Organisational history goes back to **1946** (Europahjelpen) and the name Norwegian Refugee Council was adopted in **1953**. App should display "Founded 1946" with a footnote about the 1997 stiftelse re-registration.
- **No country-level expenditure on NRC's own site.** For the Global-context panel we'll need OCHA FTS as the primary geographic-funding source, not NRC.
- **Board roster.** Verified styreleder + nestleder + count (11). Full board roster not extracted — would need a follow-up fetch to nrc.no/who-we-are/leadership for the full names.
- **Country closures noted on NRC site as of 2026-04**: Guatemala (Dec 2025) and Poland (March 2025). The 40-country count includes these as "recently closed" rather than excluding them. Live verification needed before any country list goes into production.

---

## Key references

- [Brreg Enhetsregisteret 977538319](https://data.brreg.no/enhetsregisteret/api/enheter/977538319)
- [Innsamlingskontrollen — Stiftelsen Flyktninghjelpen](https://www.innsamlingskontrollen.no/organisasjoner/stiftelsen-flyktninghjelpen/)
- [NRC — Who we are](https://www.nrc.no/who-we-are/)
- [NRC — Where we work](https://www.nrc.no/where-we-work)
- [NRC — Finances 2024](https://www.nrc.no/who-we-are/finances)
- [NRC — Secretary General Jan Egeland](https://www.nrc.no/who-we-are/secretary-general-jan-egeland)
- [NRC — Leadership](https://www.nrc.no/who-we-are/leadership)
- [NRC — Accountability](https://www.nrc.no/who-we-are/accountability)
- [Flyktninghjelpen — spørsmål og svar](https://www.flyktninghjelpen.no/hjelp/sporsmal-og-svar)
- [Flyktningregnskapet 2025](https://www.flyktninghjelpen.no/flyktningregnskapet)
- [IDMC — Global Report on Internal Displacement](https://www.internal-displacement.org/global-report/)
- [NRC — 75 years 1946–2021](https://www.nrc.no/resources/reports/75-years-for-people-forced-to-flee-book/)
- [Wikipedia — Norwegian Refugee Council](https://en.wikipedia.org/wiki/Norwegian_Refugee_Council)
