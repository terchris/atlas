# Norwegian NGO landscape

Research on the Norwegian NGO sector — who the large organisations are, what they focus on, how they are structured, and which of them could plug into the chapter-anchored framework we've built. Norges Røde Kors is included as the **reference case** against which structural fit is evaluated.

Pairs with:
- `data-sources.md` — Brreg, Lottstift, and other registries used here as the evidence base
- `sector-research.md` — macro trends (Frivillighetsbarometeret, ISF reports)
- `goal.md` — the generalised project framing; the `redcross-*.md` files remain as the reference case the framework was built against

Verified on **2026-04-18** against Brønnøysundregistrene Enhetsregisteret + organisations' own live sites. Some claims (chapter counts, member figures) draw on secondary sources where primary fetches were blocked; status flags inline.

---

## 1. Landscape map — 35+ Norwegian NGOs

### Humanitarian / international aid

| Name | Focus | Size | Structure | Chapters? | Brreg |
|---|---|---|---|---|---|
| **Norges Røde Kors** (reference case) | Humanitarian across beredskap, omsorg, migrasjon, ungdom; domestic + international | NOK 3.4 bn income (2024), ~160 000 members, ~42 000 volunteers, 372 lokalforeninger | Federated: Nasjonalkontoret + 19 distrikter + ~400 lokalforeninger | **Yes** — `api.redcross.no/nrx/v1/organizations` (key required) | 864139442 |
| **Norsk Folkehjelp** | Humanitarian solidarity; mine clearance, rescue, dev co-op (~35 countries) | NOK 1.8 bn income (2024), ~16 000 members, ~100 lokallag | Democratic member org, sentralstyret + regions + lokallag | **Yes** — `folkehjelp.no/lokallag` finder | 871033552 |
| **Kirkens Nødhjelp** | Church-based humanitarian aid in 30+ countries | ~450 employees; 90% to cause | Single legal entity, Oslo-centric; country offices | No (uses menigheter) | 951434353 |
| **Flyktninghjelpen / NRC** | Displaced populations in ~40 countries | NOK 9.3 bn income (2024); 325 HQ employees, ~15 000 aid workers globally; top donor US BHA 17.2%, UD+Norad combined ~20.4% | Stiftelse; operational, not member-based | No | 977538319 |
| **SOS-barnebyer Norge** | International child welfare | 49 employees; 85% to cause | Stiftelse (Oslo HQ) | No | 947571958 |
| **UNICEF-komiteen Norge** | Children's rights internationally + domestic | Stiftelse | Oslo-centric | No | 915972438 |
| **Leger Uten Grenser Norge** | Medical humanitarian, 70+ countries | 209 employees; NOK 618m income (2024) | Association, operational | No | 977097495 |
| **Redd Barna** | Children's rights domestically + 100+ countries | ~100 000 supporters; youth wing Press | 5 HQ regions (Øst/Sør/Vest/Midt/Nord — none with own org.nr) + 20 geographic lokallag (own org.nr) + aktivitetsgrupper (programmatic, regionally administered) | **Partial — Tier B-minus** | 941296459 |
| **CARE Norge** | Women/girls globally; emergency + empowerment | 23 employees | Stiftelse | No | 995722186 |
| **Plan International Norge** | Girls' rights, education, child protection | 70 employees | Stiftelse | No | 976793382 |
| **Regnskogfondet** | Rainforests in Amazon/Africa/SE Asia | Forening, Oslo | Oslo-only | No | 985828806 |

### Rescue / safety

| Name | Focus | Size | Structure | Chapters? | Brreg |
|---|---|---|---|---|---|
| **Redningsselskapet (RS)** | Maritime rescue + water safety education | 58 vessels, 50 stations, 1 751 volunteers (2025) | Association with coastal stations | **Station-anchored** | 954360709 |
| **Stiftelsen Norsk Luftambulanse** | Prehospital emergency medicine + helikoptertjeneste (state contract, 13 bases) | 5 regional councils | Stiftelse | Partial (13 bases + 5 councils) | 939483136 |

### Health / patient organisations

| Name | Focus | Size | Structure | Chapters? | Brreg |
|---|---|---|---|---|---|
| **Kreftforeningen** | Cancer prevention, research, patient support, advocacy | 135 000+ members, 13 000 volunteers | 6 regional sections + 17 partner pasientforeninger (each independent with own lokallag) | **Partial** — granularity lives with partner orgs | 951812528 |
| **Nasjonalforeningen for folkehelsen** | Heart/circulation + dementia | 450+ lokallag (helselag + demensforening) across 15 fylkeslag; runs Demenslinjen + Hjertelinjen | Federated | **Yes — strongest health-cluster match** | 938429863 |
| **Diabetesforbundet** | Diabetes advocacy + peer support | Fylkeslag (all 15) + lokallag | Federated | **Yes** | 970169113 |
| **Norges Blindeforbund** | Rights + rehab for blind/visually impaired | ~8 300 members | 18 fylkeslag + lokallag | **Yes** | 971038179 |
| **Norges Handikapforbund** | Rights for people with disabilities | Regions + landsforeninger (diagnosis-specific) + lokallag | Dual-axis (geography × diagnosis) | **Yes** | 938661316 |
| **LHL** | Heart, lung, stroke patient support + advocacy | ~52 000 members | Member-democratic; local lag + tematiske grupper | **Yes** | 940190738 |
| **Barnekreftforeningen** | Childhood cancer family support | 26 employees | National + fylkesforeninger | **Yes** (thin) | 985550999 |
| **Mental Helse** | Mental health advocacy; Hjelpetelefonen (116 123), Sidetmedord | Fylkes- + lokallag | Federated | **Yes** | 971322926 |

### Social / church-adjacent

| Name | Focus | Size | Structure | Chapters? | Brreg |
|---|---|---|---|---|---|
| **Stiftelsen Kirkens Bymisjon** | Urban diaconal — addiction, housing, street outreach | 2 526 employees; 12 independent foundations in 50+ byer; 651 entities with "Kirkens Bymisjon" in name | Federation of 12 stiftelser | **City-anchored** | 944384448 |
| **Frelsesarmeen** | Christian social work — addiction, elderly, emergency, prison, Fretex | 294 units; 2 711 employees; ~4 250 soldater + ~1 760 tilhørige | 5 divisioner + 285 korps | **Yes** (korps = local chapters) | 938498318 |
| **Blå Kors Norge** | Edruskap, addiction treatment, youth, schools | 291 employees | National foundation with service units | Weak (thematic, not member) | 962323855 |
| **Norske Kvinners Sanitetsforening (N.K.S.)** | Women's health, emergency preparedness, community resilience | **550 lokalforeninger, 45 000+ medlemmer**; 51 HQ employees | Decentralised federation, each forening own board | **Yes — closest structural parallel to Red Cross** | 970168001 |

### Youth / scouting / rural

| Name | Focus | Size | Structure | Chapters? | Brreg |
|---|---|---|---|---|---|
| **Norges Speiderforbund** | Scouting | ~18 000 members; ~300–450 grupper; 25 kretser | Forbund → kretser → grupper | **Yes** | 954877841 |
| **4H Norge** | Rural youth; Kløvergrupper | ~10 500 members; ~463 klubber; 16 fylkeslag | Forbund → fylkeslag → klubber | **Yes** | 943838240 |
| **Norges KFUK-KFUM** | Christian youth + adult community | ~15 000 members; 500+ grupper | Forbundskontor + kretskontorer + foreninger + leirsteder | **Yes** | 957914330 |

### Service clubs

| Name | Focus | Size | Structure | Chapters? | Brreg |
|---|---|---|---|---|---|
| **Lions Norge** | Local service, fundraising (Rødefjæren, Tulipanaksjonen) | ~340–380 klubber; ~7 800 medlemmer; 5 distrikter | MD104 → distrikter → soner → klubber | **Yes** | 971437391 |
| **Rotary Norge (NORFO)** | Service, networking, youth programs | 268 klubber, 8 218 medlemmer (Aug 2025); 6 distrikter | Distrikter → klubber (each own org.nr) | **Yes** | 885315402 |
| **Zonta Norge (D13)** | Women's rights via scholarships, education | 6 clubs | District umbrella | **No** (too sparse) | 987328541 |

### Environmental

| Name | Focus | Size | Structure | Chapters? | Brreg |
|---|---|---|---|---|---|
| **Naturvernforbundet** | Nature conservation + climate | **43 000 members; 113 lokallag**; 15 fylkeslag | Landsforbund → fylkeslag → lokallag | **Yes — strong match** | 938418837 |
| **WWF Verdens naturfond Norge** | Climate, nature, animals | Single entity; Pandaklubben for kids | Oslo HQ | No | 952330071 |
| **Natur og Ungdom** | Youth environmental activism | 16 fylkeslag | National + fylkeslag | **Yes** (county-level) | 970261451 |
| **Framtiden i våre hender** | Sustainable consumption, food, clothing, finance | ~50 000 members; 26 lokallag | Sentralt Oslo + lokallag | **Yes** (moderate) | 970221115 |
| **Bellona** | Climate, industry, policy | Oslo + Brussels + Berlin + Vilnius + Lofoten | No lokallag | No | 948778599 |
| **ZERO** | Climate, clean energy transition | Single Oslo entity; thematic teams | Oslo | No | 984143028 |

### Civic / rights

| Name | Focus | Size | Structure | Chapters? | Brreg |
|---|---|---|---|---|---|
| **Amnesty International Norge** | Human rights advocacy, campaign signatures | ~100 000 medlemmer/aktivister; 86 employees | Foreningsdemokratisk; national + lokallag + studentlag | **Partial** | 970148698 |
| **Human-Etisk Forbund** | Secular humanism; konfirmasjon/navnefest/gravferd ceremonies | **130 000 members** (Norway's largest life-stance org after Den norske kirke); ~95 lokallag; 16 regionlag | Forbund → regionlag → lokallag | **Yes — strong match** | 943762236 |

---

## 2. How to measure NGO economy

Three public sources answer "how big is this NGO", each with different limits:

1. **Total income (sum anskaffede midler)** — top line of the activity account filed to Regnskapsregisteret and published by Innsamlingskontrollen. Includes donations, grants, investment income, fees, bequests, in-kind transfers. **Primary metric used here.** Limitation: umbrella orgs report only the central entity. Local chapters of N.K.S., Nasjonalforeningen, Frelsesarmeen korps, etc. file separate accounts, so the central number understates full federation throughput by a factor of 2–10.
2. **State grants (`tilskudd.lottstift.no`)** — sum of `tildelt` across all state grant schemes per org number per year. Captures momskompensasjon, Norsk Tipping samfunnsnyttige midler, and ~700 department-administered ordninger. **Does not capture** direct operating contracts from sector ministries (Justis → Redningsselskapet, Helse → Norsk Luftambulanse helicopter, Norad framework agreements to Kirkens Nødhjelp / Norsk Folkehjelp / Redd Barna / Plan). "Gov-funding share %" shown here therefore understates state dependency for operational humanitarians.
3. **Share-to-cause (formålsprosent)** — Innsamlingskontrollen quality metric; only covers the ~180 Innsamlingskontrollen-member orgs. Useful for donor-facing UX, not as a size metric.

### Secondary comparators

- **Employees** — Brreg `antallAnsatte` (headcount, point-in-time).
- **Volunteers** — annual reports only; federated orgs under-report because local chapters don't roll up.
- **Members** — org websites; mixed definitions ("registered" vs "paying" vs "aktivister").
- **Founding year** — Brreg `stiftelsesdato`.
- **International vs domestic spend split** — from annual reports for humanitarians.
- **Grasrotandelen standing** — eligible for orgs with local chapters having own org.nr (Red Cross, N.K.S., 4H klubber, speidergrupper, Rotary clubs, Lions clubs); not eligible for stiftelser (NRC, SOS, UNICEF, Plan) or central umbrella orgs.
- **Implicit volunteer-hour value** — SSB satellittregnskap implies ~930 000 NOK/årsverk, ~500 NOK/hour. Applies where volunteer hours are reported.

### What we don't quantify

Admin-share % (not consistent across stiftelse vs forening accounting), geographic reach (kommuner touched — would require per-chapter geocoding), and share-to-cause for non-Innsamlingskontrollen members.

---

## 3. Leaderboards

### Top 10 by total income (2024, NOK million)

| Rank | Org | Income (NOK m) | Org.nr |
|---:|---|---:|---|
| 1 | Flyktninghjelpen / NRC* | 9 290 | 977538319 |
| 2 | **Norges Røde Kors** | 3 364 | 864139442 |
| 3 | Frelsesarmeen | 2 492 | 938498318 |
| 4 | Stiftelsen Kirkens Bymisjon | 1 983 | 944384448 |
| 5 | Norsk Folkehjelp | 1 801 | 871033552 |
| 6 | Redd Barna | 1 690 | 941296459 |
| 7 | Blå Kors Norge | 1 551 | 962323855 |
| 8 | Kirkens Nødhjelp | 1 379 | 951434353 |
| 9 | Redningsselskapet | 913 | 954360709 |
| 10 | Kreftforeningen | 826 | 951812528 |

*NRC is an outlier — 9.3 bn reflects consolidated international operations across 40 countries, dominated by UN/EU/non-Norwegian state grants. On Norway-only private donations it would rank mid-pack. Red Cross 3.4 bn is the **central-entity** figure; federation-wide throughput (including 372 lokalforeninger's own accounts) is materially higher.

### Top 10 by Lottstift-grant dependency (central entity only)

`state_grants_2024 / income_2024`. Excludes direct ministry contracts and Norad framework agreements (see methodology).

| Rank | Org | State grants (NOK m) | Income (NOK m) | Share % |
|---:|---|---:|---:|---:|
| 1 | Mental Helse | 92.2 | 99.1 | ~93% |
| 2 | N.K.S. (Sanitetskvinnene) | 58.3 | 130 | ~45% |
| 3 | LHL | 60.3 | 161 | ~37% |
| 4 | Nasjonalforeningen | 52.5 | 238 | ~22% |
| 5 | **Norges Røde Kors** | 530.2 | 3 364 | ~16% |
| 6 | Blå Kors Norge | 180.7 | 1 551 | ~12% |
| 7 | Frelsesarmeen | 251.8 | 2 492 | ~10% |
| 8 | Kirkens Bymisjon (central) | 151+ | 1 983 | ~8% |
| 9 | Amnesty Norge | 10.6 | 179 | ~6% |
| 10 | WWF Norge | 11.4 | 265 | ~4% |

Reading: Mental Helse is the most state-dependent of the ones we sized. Sanitetskvinnene, LHL and Nasjonalforeningen are all 20–45% state-funded on central accounts. For rescue infrastructure (Redningsselskapet ~40% real dependency, Norsk Luftambulanse) and operational humanitarians (Kirkens Nødhjelp ~350m/yr Norad, Norsk Folkehjelp Norad rammeavtaler, Redd Barna Norad), the true state-dependency is much higher but routes outside Lottstift — see methodology.

---

## 4. Financial + people detail by sector

Target year **2024**, with 2023 fallback noted where applicable. Two tables per sector: **A — economy**, **B — people**. Caveats and blocked fetches at bottom of file.

### 4.1 Humanitarian / international aid

**A — Economy (NOK m)**

| Name | Income | State grants (Lottstift) | Gov-share | Share-to-cause | Main funding sources |
|---|---:|---:|---:|---:|---|
| **Norges Røde Kors** | 3 364 | 530.2 | ~16% | 93% | Norsk Tipping speleoverskot (334m), momskomp (46m), redningstj. (45m), arv/private/innsamling, investment returns (~75–80m/yr from pre-2007 portfolio) |
| Norsk Folkehjelp | 1 801 | 69.9 | ~4% Lottstift only | 96.1% | Norad/UD framework, fagbevegelsen, private, Norsk Tipping |
| Kirkens Nødhjelp | 1 379 | n/a via Norad (~350m/yr direct) | — | 88.9% | Norad (~350m), menigheter, private, EU |
| Flyktninghjelpen / NRC | 9 290 | n/a (donor states direct) | — | 97.2% | UN, EU, UK/SE/US/CH etc. — int'l donors |
| Redd Barna | 1 690 | 40.7 | ~2% Lottstift only | 92.8% | Norad framework, private fadder, TV-aksjonen legacies |
| SOS-barnebyer Norge | 668 | 20.8 | ~3% | 84.5% | Private sponsors, Postkodelotteriet, momskomp |
| Plan International Norge | 612 | n/a (Norad rammeavtale ~60m/yr) | — | 76.5% | 115 000 fadder, Norad, UD |
| Leger Uten Grenser Norge | 618 | ~0 | 0% by policy | 89.0% | 100% private donors (policy since 2016) |
| Regnskogfondet | 328 | 1.0 | ~0.3% Lottstift | 88.4% | Norad/Klimainvest (~300m), UD, private |
| UNICEF-komiteen Norge | 250 | 0 | 0% by policy | 71.1% (2024 calc; 5-yr avg 61–77% depending on method) | 100% private individuals + corp |
| CARE Norge | 227 | n/a (UD/Norad direct) | — | 95.4% | UD, Norad, SIDA, EU, Postkodelotteriet |

**B — People**

| Name | Employees | Volunteers | Members/supporters | Local chapters | Founded |
|---|---:|---:|---:|---|---:|
| **Norges Røde Kors** | 1 011 (central) | ~42 000 | ~160 000 medlemmer | 372 lokalforeninger + 19 distrikter | 1865 |
| Norsk Folkehjelp | 170 NO / ~2 300 globally | ~2 000 | ~13 000 NO | ~100 lokallag | 1939 |
| Kirkens Nødhjelp | 165 | — | n/a | n/a (uses menigheter) | 1947 |
| Flyktninghjelpen / NRC | 325 HQ / ~9 200 globally | — | n/a | n/a | 1946 |
| Redd Barna | 237 | ~4 000 | ~100 000 supporters | Regions + aktivitetsgrupper | 1946 |
| SOS-barnebyer Norge | 49 | — | ~100 000 givers | n/a | 1983 |
| Plan International Norge | 70 | — | ~115 000 fadder | n/a | 1996 |
| Leger Uten Grenser Norge | 209 | — | — | n/a | 1996 |
| Regnskogfondet | 69 | — | — | n/a | 1989 (stiftelse 2003) |
| UNICEF-komiteen Norge | 64 | — | — | n/a | 2015 (as stiftelse) |
| CARE Norge | 23 | — | — | n/a | 2010 |

### 4.2 Rescue / safety

**A — Economy**

| Name | Income | State grants (Lottstift) | Gov-share | Share-to-cause | Main funding sources |
|---|---:|---:|---:|---:|---|
| Redningsselskapet | 913 | 5.0 + momskomp | ~40% incl. Justis-contract | 82.5% | Justis-contract (~366m), Norsk Tipping, medlemmer, gaver |
| Stiftelsen Norsk Luftambulanse | 410 | modest | Low on stiftelse; helicopter contract via subsidiary | 69.0% | 300 000 støttemedlemmer, 4 000 bedrifter, arv, Norsk Tipping |

**B — People**

| Name | Employees | Volunteers | Members/supporters | Chapters | Founded |
|---|---:|---:|---:|---|---:|
| Redningsselskapet | 422 | 1 751 | ~120 000 | 50 stations | 1891 |
| Stiftelsen Norsk Luftambulanse | 204 | ~4 000 bedriftsmedlemmer | ~706 000 støttemedlemmer (largest in NO) | 13 bases | 1977 |

### 4.3 Health / patient organisations

**A — Economy**

| Name | Income | State grants (Lottstift) | Gov-share | Share-to-cause | Main funding sources |
|---|---:|---:|---:|---:|---|
| Kreftforeningen | 826 | 39+ | ~5% Lottstift only | — | Arv/testamente, innsamling, næringsliv, partnerskap, medlemskap |
| Norges Blindeforbund | 420 | data partial | — | 79.4% | Norsk Tipping, legater, medlemmer, spill/lotteri |
| Barnekreftforeningen | 490 | data partial | low | 49.0%* | TV-aksjonen 2024 (415m), innsamling, medlemskap |
| Nasjonalforeningen | 238 | 52.5 | ~22% | 61.1% | Norsk Tipping, forskningsmidler, momskomp, private |
| LHL | 161 | 60.3 | ~37% | 57.1% | Funksjonshemmede-tilskudd, Norsk Tipping, LHL-lotteriet, medlemmer |
| Mental Helse | 99 | 92.2 | ~93% | 89.6% | Hdir driftstilskudd, rådgivningstjenester-tilskudd, kontingent |
| Norges Handikapforbund | ~80 | 27.4 | high | n/a | Funksjonshemmede-tilskudd, momskomp, medlemmer |
| Diabetesforbundet | 48 | 5.9 + momskomp | ~12%+ | 83.2% | Medlemskontingent, diabeteslotteriet, statstilskudd |

*Barnekreftforeningen's low 2024 share-to-cause is transient — the 415m TV-aksjonen revenue is earmarked for family-houses to be built 2025–2027; spending tail lags revenue spike.

**B — People**

| Name | Employees | Volunteers | Members | Chapters | Founded |
|---|---:|---:|---:|---|---:|
| Kreftforeningen | 229 | ~13 000 | 135 000+ | 6 regional + 17 partner orgs | 1988 |
| Norges Blindeforbund | 466 | — | ~8 300 | 18 fylkeslag | 1909 |
| Barnekreftforeningen | 26 | — | — | Fylkesforeninger | 1982 |
| Nasjonalforeningen | 73 | — | — | 450+ lokallag, 15 fylkeslag | 1995 |
| LHL | 45 | — | ~52 000 | — | 1943 |
| Mental Helse | 106 | — | — | Fylkes- + lokallag | 1995 |
| Norges Handikapforbund | 48 | — | — | Regions + landsforeninger | 1979 |
| Diabetesforbundet | 18 | — | ~32 000 | 15 fylkeslag + lokallag | 1948 |

### 4.4 Social / church-adjacent

**A — Economy**

| Name | Income | State grants (Lottstift) | Gov-share | Share-to-cause | Main funding sources |
|---|---:|---:|---:|---:|---|
| Frelsesarmeen | 2 492 | 251.8 | ~10% | 90.5% | Institusjonsdrift rusomsorg (88m), Norsk Tipping (62m), momskomp (40m), bøsser/gaver, Fretex |
| Stiftelsen Kirkens Bymisjon | 1 983 | 151+ | ~8% central | 89.0% | Kommunale/fylkes-driftskontrakter, stat, innsamling, arv, Norsk Tipping |
| Blå Kors Norge | 1 551 | 180.7 | ~12% | 94.5% | Helseforetak-kontrakter, Hdir, Norsk Tipping, private |
| N.K.S. | 130 | 58.3 | ~45% central | 88.5% | Dam forskningsmidler, Norsk Tipping, lokalforeningsbidrag, medlemmer |

Structural note: Kirkens Bymisjon 1 983m and N.K.S. 130m are **central only**. Kirkens Bymisjon has 12 separate city foundations each with its own regnskap; N.K.S. has 550 lokalforeninger + ~30 health/care institutions owned by lokalforeninger, none rolled up.

**B — People**

| Name | Employees | Volunteers | Members | Chapters | Founded |
|---|---:|---:|---:|---|---:|
| Frelsesarmeen | 2 317 / 2 711 (feder. 2023) | — | ~4 250 soldater + ~1 760 tilhørige | 285 korps / 94 kirke- og nærmiljøsentre | 1888 |
| Stiftelsen Kirkens Bymisjon | 2 526 (central) / 2 432 (feder.) | ~3 700 | n/a | 12 stiftelser in 50+ byer | 1855 |
| Blå Kors Norge | 291 | — | — | Service units | 1910 |
| N.K.S. | 51 (HQ) | ~45 000 (members are mostly active volunteers) | ~44 000 | 550 lokalforeninger | 1896 |

### 4.5 Youth / scouting / rural

**A — Economy** (central org only; local groups file separately)

| Name | Income (central) | State grants (Lottstift) | Gov-share | Main funding |
|---|---:|---:|---:|---|
| Norges KFUK-KFUM | ~50 | 22+ (inklusjon 18.5m + Frifond 3.9m) | high | Bufdir inklusjon, Frifond, kontingent |
| Norges Speiderforbund | ~40 | 12.8 | ~32% | Frifond, LAM, Bufdir grunnstøtte, kontingent |
| 4H Norge | ~30 | 20.1 | ~67% | Bufdir grunnstøtte (5.5m), organisasjonstilskudd (5.0m), momskomp, kontingent |

**B — People**

| Name | Employees | Members | Chapters | Founded |
|---|---:|---:|---|---:|
| Norges KFUK-KFUM | 205 | ~15 000 | 500+ grupper | 1970 (forbund) |
| Norges Speiderforbund | 21 | ~18 000 | 300–450 grupper, 25 kretser | 1978 |
| 4H Norge | 48 | ~10 500 | ~463 klubber, 16 fylkeslag | 1936 |

### 4.6 Service clubs

**A — Economy** (central umbrella only; all money lives in independent clubs)

| Name | Income (central) | State grants | Gov-share | Funding |
|---|---:|---:|---:|---|
| Lions Norge MD104 | ~5 (central); ~26 raised via clubs | minimal | ~0% | Medlemskontingent, klubbinntekt to samfunnsformål |
| Rotary Norge NORFO | thin | ~0 | ~0% | Per-capita kontingent fra distrikter/klubber |
| Zonta Norge (D13) | ~0 | 0 | — | Klubbkontingent |

Structural note: NORFO (org.nr 885315402) is a coordination forum with no income of its own — all Rotary economic activity lives in 268 club entities each with own org.nr. Same for Lions' ~330 clubs. Zonta D13 is too small to have central finances.

**B — People**

| Name | Employees | Members | Chapters | Founded |
|---|---:|---:|---|---:|
| Lions Norge | not reported | ~7 500 (2024) | ~330 klubber | 1949 |
| Rotary Norge | not reported (NORFO has `harRegistrertAntallAnsatte: false`) | 8 218 (Aug 2025) | 268 klubber | 1956 |
| Zonta Norge | not reported | small | 6 clubs | 1968 |

### 4.7 Environmental

**A — Economy**

| Name | Income | State grants (Lottstift) | Gov-share | Share-to-cause | Main funding |
|---|---:|---:|---:|---:|---|
| WWF Verdens naturfond Norge | 265 | 11.4 | ~4% | 90.3% | Private givere, næringslivspartnere, testamentariske gaver |
| Bellona | 63.1 (2023 driftsinntekter) | 0 | 0% | n/a (stiftelse, not IK member) | 63% int'l climate philanthropy (CIFF, ClimateWorks, ECF, EU Horizon), ~28% direct corporate, ~9% other (KLD 3%, momskomp 3%, individual 2%) |
| Naturvernforbundet | 74 | 8.0 + momskomp | ~15–20% | 82.7% | Miljødirektoratet, medlemmer, Norsk Tipping |
| Framtiden i våre hender | ~30 (est.) | — | — | — | Medlemskontingent (~50 000), gaver, stiftelser |
| ZERO | ~30 (est.) | 0 | ~10% (org report) | n/a (stiftelse) | Næringsliv 86%, offentlige prosjekt 10%, event 4% |
| Natur og Ungdom | ~10 | 9.8 | ~98% | — | Miljødirektoratet, Bufdir ung, momskomp, Frifond |

**B — People**

| Name | Employees | Members | Chapters | Founded |
|---|---:|---:|---|---:|
| WWF Verdens naturfond Norge | 82 | — | n/a | 1970 |
| Bellona | 37 NO / ~100 globally | n/a (stiftelse) | 0 NO (Brussels, Berlin, Vilnius, Lofoten — Murmansk closed 2022 after Russia invasion; declared "undesirable" April 2023) | 1986 |
| Naturvernforbundet | 45 | ~43 000 | 113 lokallag, 15 fylkeslag | 1914 |
| Framtiden i våre hender | 78 | ~50 000 | 26 lokallag | 1974 |
| ZERO | ~25 | n/a (stiftelse) | 0 | 2002 |
| Natur og Ungdom | 19 | — | 16 fylkeslag, ~70 lokallag | 1967 |

### 4.8 Civic / rights

**A — Economy**

| Name | Income | State grants (Lottstift) | Gov-share | Share-to-cause | Main funding |
|---|---:|---:|---:|---:|---|
| Human-Etisk Forbund | ~190 (est.) | ~130+ (livssynstilskudd — outside Lottstift) | ~60–70% effective | — | Livssynstilskudd per-capita (~1 300 NOK × 130 000+ medlemmer), kontingent |
| Amnesty International Norge | 179 | 10.6 (10.1 momskomp + 0.5 anti-rasisme) | ~6% | 69.3% | Medlemskontingent, private givere (165m innsamling) |

Structural note: Human-Etisk Forbund's state-funding works through **livssynstilskudd** — a per-capita grant from Barne- og familiedepartementet, benchmarked to Den norske kirkes offentlige støtte. Dominant income source but lives outside Lottstift, so a naive Lottstift query returns little.

**B — People**

| Name | Employees | Volunteers | Members | Chapters | Founded |
|---|---:|---:|---:|---|---:|
| Human-Etisk Forbund | 125 | thousands | 130 000 (2024) / 180 000 (2026) | ~95 lokallag, 16 regionlag | 1956 |
| Amnesty International Norge | 86 | — | ~100 000 medlemmer/aktivister | Lokallag + studentlag | 1964 |

---

## 5. Structural-fit tiers

Ranking criteria: (a) real chapter network ≥ 50 units; (b) chapters have own org.nr (so Grasrotandelen + Lottstift + Regnskapsregisteret joins work); (c) volunteer + member + donate pathways; (d) humanitarian/social-need-indicator alignment.

### Tier A — drop-in fit (framework maps with minor label changes)

| Org | Chapters | Own org.nr? | V/M/D? | Need-indicator alignment |
|---|---|---|---|---|
| **Norges Røde Kors** (reference) | 372 | Yes | All three | Strong — the activity-indicator matrix in `redcross-activity-indicator-matrix.md` is built against this |
| **N.K.S. (Sanitetskvinnene)** | 550 | Yes | All three | Strong: women's health, omsorg, beredskap |
| **Nasjonalforeningen for folkehelsen** | 450+ | Yes | All three | Strong: FHI dementia + cardiovascular, fastlege-dekning |
| **4H Norge** | ~463 | Yes | Member; adult leader | Moderate: rural youth |
| **Lions Norge** | ~340 | Yes | Member; donate; projects | Weak: clubs pick own projects |
| **Norges Speiderforbund** | 300+ | Yes | Member; volunteer leaders | Moderate: Ungdata + child-poverty |
| **Frelsesarmeen** | 285 korps | Yes | All three | Strong: addiction, homelessness, emergency food |
| **Rotary Norge** | 268 | Yes | Member primary | Weak: club-mediated donations |
| **Naturvernforbundet** | 113 | Mostly yes | Member, volunteer, donate, petition | Weak-moderate: biodiversity frame |
| **Norsk Folkehjelp** | ~100 | Yes | All three | Strong: overlaps literally with Hjelpekorps/Beredskap/Migrasjon |
| **Human-Etisk Forbund** | ~95 | Yes | Member, volunteer, donate | Weak: cultural, not humanitarian |

### Tier B — fit with adaptation

| Org | What to adapt |
|---|---|
| Diabetesforbundet, LHL, Blindeforbundet, NHF, Mental Helse, Barnekreftforeningen | Chapter counts in tens, not hundreds; activity taxonomy is patient-support (likeperson, brukermedvirkning, turgrupper) rather than humanitarian ops |
| Kirkens Bymisjon | 12 stiftelser → city-anchored, not kommune-anchored. Rich activity portfolio maps to social-need indicators (Husbanken, NAV, SSB fattigdom) |
| KFUK-KFUM | 500+ groups; ChapterDetail must expose Christian-youth activity list (Y's Men, Global, Speidere, idretter, musikk) |
| Redd Barna | Primary ask is fadder/støttespiller, not "join your local chapter". Activity layer would reframe around children's rights campaigns |
| Kreftforeningen | 6 regional sections too coarse; real chapter density is in 17 partner pasientforeninger. A meta-finder across the foreningsfamilie |
| Natur og Ungdom, Framtiden i våre hender | Campaign-driven activity layer; needs a petition/action pathway |

### Tier C — framework doesn't map cleanly

- **Kirkens Nødhjelp, Flyktninghjelpen/NRC, SOS-barnebyer, UNICEF Norge, Leger Uten Grenser, CARE, Plan, Regnskogfondet** — professional humanitarian operators, no domestic chapters, donate-first. Right UX is cause-and-impact-anchored, not geography-anchored.
- **WWF, Bellona, ZERO** — Oslo advocacy. Donor + supporter model.
- **Redningsselskapet, Norsk Luftambulanse** — rescue infrastructure providers. RS adaptable (58 stations) but narrower volunteer model.
- **Blå Kors** — service-unit model.
- **Zonta Norge** — 6 clubs is too sparse.

---

## 6. What generalises and what doesn't

Roughly 70% of the Red Cross framework reuses directly:

| Module | Generalises? |
|---|---|
| Chapter finder, map, filter | **Yes** — invariant is `{geographic unit, org number, coordinates, activities, contacts}`; every Tier-A org exposes this (usually HTML scrape) |
| Three engagement pathways (Gi tid / Gi penger / Bli medlem) | **Mostly yes** — service clubs and 4H/Speiderforbundet are member-first; advocacy orgs (Naturvernforbundet, Amnesty, NU) need a fourth **campaign action / petition** pathway |
| Crisis band | **Conditional** — fits humanitarian/rescue/social orgs; noise for environmental/service-club orgs. Must be configurable, not chrome-invariant |
| Activity-indicator matrix | **Pluggable per org** — architecture reuses, specific matrix doesn't. Naturvernforbundet pivots to Miljødirektoratet/Artsdatabanken; patient orgs to FHI registries; service clubs to project-portfolio tags |

Net: ~70% code reuse across finder, pathways, chapter detail, scraping model, Brreg/Lottstift/Grasrotandelen deep-linking. Crisis band becomes optional. Activity-indicator matrix is reskinnable but not reusable.

---

## 7. Structural patterns across the sector

Five dominant patterns:

1. **Dense-chapter federations** (Red Cross, N.K.S., Nasjonalforeningen, Speiderforbundet, 4H, Frelsesarmeen, Lions, Rotary, Naturvernforbundet, Human-Etisk Forbund, Norsk Folkehjelp) — 100–550 local units with own org numbers. Chapter-anchoring is the right frame.
2. **Fylkeslag-only patient organisations** (Diabetesforbundet, LHL, Blindeforbundet, NHF, Mental Helse, Barnekreftforeningen) — 15–18 county units + thin lokallag. Finder works but at different grain.
3. **City-foundation federations** (Kirkens Bymisjon) — 12 independent foundations in largest cities.
4. **Regional-office operators** (Kreftforeningen, Redd Barna) — 3–6 regional offices + partner/activity groups; chapter-ness is diluted.
5. **Professional humanitarian stiftelser** (NRC, Kirkens Nødhjelp, MSF, SOS, UNICEF, CARE, Plan, Regnskogfondet, WWF, Bellona, ZERO) — Oslo-centric, donor-first, no chapters.

Roughly half the top ~35 NGOs by size have a chapter finder worth building. **Red Cross's ~400 chapters sits comfortably in the median-to-high end of the dense-federation cluster — it is not an outlier.**

---

## 8. Data sources for enumerating NGOs

All free, polite User-Agent headers sufficient:

1. **Frivillighetsregisteret (Brreg)** — `data.brreg.no/frivillighetsregisteret/`. Authoritative registry of ~70 000 frivillige organisasjoner, ICNPO-kategori, Grasrotandelen-standing. The obvious spine for a multi-NGO catalog.
2. **Frivillighet Norge member directory** — `frivillighetnorge.no/medlemmer`. 300+ member orgs, standardised one-pagers, member counts.
3. **Innsamlingskontrollen** — `innsamlingskontrollen.no/organisasjoner/`. ~200+ orgs with annual reports and 90%-to-cause verification.
4. **Lottstift tilskudd database** — `tilskudd.lottstift.no/`. State grants + momskompensasjon + Grasrotandelen distributions per org.nr per year. Single best sizing source.
5. **Stiftelsesregisteret (Lottstift)** — stiftelser specifically.
6. **Stiftelsen Dam organisasjonsliste** — `dam.no/organisasjoner/`. 150+ health/humanitarian members eligible for Dam funding.
7. **Brreg Enhetsregisteret API** — `data.brreg.no/enhetsregisteret/api/enheter?navn=X`. Practical programmatic entry for any org lookup.

Combined query pattern: Frivillighetsregisteret filter → Regnskapsregisteret income → tilskudd.lottstift.no grants → own site scrape. Builds a sized, comparable NGO catalogue in a week.

---

## 9. Strategic implications

Three realistic shapes a multi-NGO product could take:

1. **Single-org framework, Red Cross-first** — what we're currently building. Tightest fit, richest domain knowledge, crispest UX.
2. **Platform for the ~10 Tier-A dense-chapter NGOs** — same finder + pathways + Brreg/Lottstift backbone, pluggable activity taxonomy per org. ~70% code reuse. Each org gets its own branded surface.
3. **Meta-site "all Norwegian NGOs"** — browse the sector with Brreg/Frivillighetsregisteret as the spine. Different product entirely; closer to a civil-society explorer than a chapter finder.

Option 2 is the realistic version of "a site for all NGOs." Option 3 is a different product.

---

## Caveats

### Structural

- Chapter/member counts draw on 2023–2025 sources and are order-of-magnitude, not current-year.
- "Chapter has own org.nr" is true as a *pattern* (each 4H klubb, each Rotary club, each Speidergruppe, each sanitetsforening typically has one) but not uniformly verified. **NF update (2026-04-19)**: Brreg query confirms 121 geographic NF lokallag have own org.nr, 107 in Frivillighetsregisteret. Most don't file annual accounts (below threshold) but the org.nr itself exists, so Grasrotandelen and Brreg joins work. Amnesty and Framtiden still unverified.
- Four primary fetches hit 403 bot protection (reddbarna.no, legerutengrenser.no, amnesty.no, rotary.no). Confirmed via Brreg + Frivillighet Norge + Innsamlingskontrollen.
- Rotary NORFO (885315402) is a collaboration forum; individual distrikter have separate entities (e.g. D2310: 991333428).
- Kreftforeningen's chapter story is unusual: central org has 6 regional offices but real density is in 17 partner pasientforeninger. For framework port, the partner-foreningsfamilie is the right unit.
- Secondary sources (SNL, Wikipedia) sometimes give conflicting counts (Speidere 300 vs 450, Lions 340 vs 380). Most recent primary figure used where possible.

### Financial

- **Federation income under-reported.** Figures in section 4 are **central-entity only** for umbrella orgs (N.K.S., Nasjonalforeningen, Frelsesarmeen, Kirkens Bymisjon, Red Cross, Speiderforbund, 4H, Rotary, Lions, Naturvernforbundet, Human-Etisk). Add 2–10× for full federation throughput. Rotary and Lions have virtually no central income; the money lives in 268 / 330 independent club entities.
- **State-contract funding invisible to Lottstift.** Redningsselskapet's ~366m Justis-contract, Norsk Luftambulanse's helicopter state-contract (via operating subsidiary, not the foundation), Kirkens Nødhjelp's ~350m/yr Norad framework agreement, Norsk Folkehjelp's large Norad/UD frames, Plan/Redd Barna Norad rammeavtaler, and UD/Norad grants to CARE/Plan/Regnskogfondet are all outside Lottstift. "Gov-share %" in section 4 *understates* true state dependency for operational humanitarians and rescue providers.
- **Human-Etisk Forbund livssynstilskudd** is a BFD ministry-administered per-capita grant outside Lottstift and dominates their income.
- **Leger Uten Grenser and UNICEF-komiteen take no Norwegian state money by organisational policy.** LUG has not applied since 2016.
- **Flyktninghjelpen (NRC) 9.29 bn income is international** (UN, EU, non-Norwegian states). Not comparable to others on a "size in Norway" basis.
- **Barnekreftforeningen 49% share-to-cause in 2024 is transient** — 415m TV-aksjonen revenue earmarked for family-houses to be built 2025–2027, so spending tail lags revenue spike.
- **Mental Helse 93% Lottstift-share is anomalous.** Fylkeslag and lokallag have separate finances.
- **Lottstift JS render gap.** `tilskudd.lottstift.no/mottaker/{orgnr}/…` renders client-side; WebFetch sometimes hits the "Loading…" shell. Totals for Norges Blindeforbund 2024, Diabetesforbundet 2024, Kreftforeningen 2024 (beyond 39m momskomp), and Barnekreftforeningen 2024 could not be confirmed live. Figures used: (a) Google search-snippet caches, (b) momskomp ordning page. Exact live totals need a headless-browser fetch.
- **Not all 35 orgs file with Innsamlingskontrollen.** Bellona, ZERO, Lions, Rotary, Zonta, Human-Etisk, Framtiden, and Norges Handikapforbund either don't file or weren't found. Figures come from Brreg regnskap, annual reports, and SNL.
- **Year mismatches.** Brreg `antallAnsatte` is point-in-time; Innsamlingskontrollen income is calendar-year 2024; Lottstift grants are allocated to 2024 but sometimes disbursed the following year. Treat to ±5%.

---

## Key references

- [Frivillighetsregisteret (Brreg)](https://data.brreg.no/frivillighetsregisteret/)
- [Frivillighet Norge — medlemmer](https://www.frivillighetnorge.no/medlemmer)
- [Innsamlingskontrollen — organisasjoner](https://www.innsamlingskontrollen.no/organisasjoner/)
- [Lottstift tilskudd](https://tilskudd.lottstift.no/)
- [Stiftelsen Dam — organisasjoner](https://www.dam.no/organisasjoner/)
- [Norsk Folkehjelp Resultatrapport 2024](https://app.innsamlingskontrollen.no/storage/document/arsberetning-norsk-folkehjelp-2024.pdf)
- [Nasjonalforeningen — Lokallag](https://nasjonalforeningen.no/lokallag/)
- [Frelsesarmeen i tall](https://frelsesarmeen.no/om-oss/frelsesarmeen-i-tall)
- [Human-Etisk Forbund — 130 000 medlemmer](https://www.human.no/aktuelt/130-000-medlemmer-i-human-etisk-forbund)
- [Norges Blindeforbund — organisasjonen](https://www.blindeforbundet.no/om-blindeforbundet/organisasjonen-norges-blindeforbund)
- [Amnesty Norge — organisasjon](https://amnesty.no/administrativt/organisasjon)
- [Rotary-distriktene i Norge](https://rotary.no/no/rotarydistriktene-i-norge)
- [Sanitetskvinnene — Wikipedia](https://no.wikipedia.org/wiki/Norske_Kvinners_Sanitetsforening)
- [Kirkens Bymisjon — Wikipedia](https://no.wikipedia.org/wiki/Kirkens_Bymisjon)
