# Samfunnspuls — desktop field notes

Captured by: Claude desktop app with Chrome connector
Date: 2026-04-21
Session duration: ~90 minutes
Completion: complete

## Summary of what the site is (context for the sections below)

- `https://samfunnspuls.rodekors.no/` is a React single-page app whose `/statistikker/` directory exposes **37 indicator pages** grouped into 6 topic areas (not the 4 on the homepage): Barn og unge (15), Demografi og boforhold (7), Helse og eldre (2), Asylsøkere/flyktninger/migrasjon (3), Frivillighet (3), Økonomi (7).
- Every indicator page embeds a **Power BI report** in an iframe (`app.powerbi.com/reportEmbed?...`) and renders an expandable **"Om tallene"** block next to it with verbatim source metadata.
- The 37 indicator pages back onto **24 unique Power BI reports** (some reports are reused across several pages; e.g. report `af3083c3-…` serves Mobbing 7/10, Mobbing Vg1, Støtte hjemmefra grunnskolen and Støtte hjemmefra Vg1).
- All 24 Power BI reports live in the **same Power BI workspace** `groupId = 02550945-38e7-4da5-8072-4575d130615e`, cluster `WABI-NORTH-EUROPE-N-PRIMARY-redirect.analysis.windows.net`.
- Upstream providers named in "Om tallene" across the 37 reports: **SSB** (Statistisk sentralbyrå), **Udir** (Utdanningsdirektoratet, via Elevundersøkelsen / fraværsstatistikk / VIGO), **IMDi** (Integrerings- og mangfoldsdirektoratet), **NAV**, **Brønnøysundregistrene / Digitaliseringsdirektoratet** (Frivillighetsregisteret), and **Røde Kors** (for its own member/volunteer counts). No FHI, Bufdir, Husbanken or city open-data portal is cited for any report.
- `robots.txt` → 404. `sitemap.xml` → 404. Both paths return an ASP.NET-style "The resource you are looking for has been removed, had its name changed, or is temporarily unavailable." error page.

## Site-level pages (not reports)

| Path | Purpose / content |
| --- | --- |
| `/` | Landing page; 4 promoted tiles (Population, Child poverty, Overcrowded housing, Nursing home residents) linking into `/statistikker/...`. |
| `/statistikker/` | Index of all 37 indicators, grouped into the 6 topic areas above. Each topic shows 3 items + "Se alle (N)". |
| `/om-samfunnspuls/` | About page (verbatim excerpt below in §Notes). Names the providers: "Statistisk sentralbyrå, NAV, Utdanningsdirektoratet (Udir), Integrerings- og mangfoldsdirektoratet (IMDi) og flere andre offentlige instanser." Cites the Red Cross report "Humanitære behov i Norge" (2017) as the selection basis. |
| `/mine-statistikker/` | User-configurable scratchpad ("Mine statistikker" with Eksporter til PowerPoint). |
| `/andre-ressurser/` | Outbound links to: Ungdata (NOVA/OsloMet), Bufdir Barnefattigdom, Bufdir Barnevern kommunemonitor, FHI Folkehelseprofil/Oppvekstprofil, DSB Kommuneundersøkelsen. |

## ReportId → Power BI dataset name (primary source evidence)

Obtained by calling the first-party endpoint `GET /api/powerbi/reportembeddata/{reportId}` for every `reportId` found in page HTML. The `name` field names the underlying Power BI dataset and — for direct SSB tables — follows the pattern `ssb-{tableId}`. R-script-based datasets carry explicit filenames describing their update mechanism.

| reportId | Power BI dataset name | Upstream implied by name |
| --- | --- | --- |
| `517f6fd6-0ae1-4132-857a-31a1d379c2b8` | `13_SSB_befolkning` | SSB (generic; no table id in dataset name) |
| `d67bcbd0-3975-417b-a6ec-d85368f3149c` | `tabell2_rode_kors_pers` | Red Cross internal copy (Om tallene says "spesialbestilt fra SSB") |
| `af3083c3-e573-4fe2-b540-65dfb6c60b73` | `2_Udir_Elevundersøkelsen(translated-r-script-auto-update-from-udr-site)` | Udir Elevundersøkelsen (R-script scrape) |
| `5c7c52b0-3a9f-4386-b3a0-32b9e020589b` | `3_Udir_fravaer(translated-r-script-auto-update-from-udr-site)` | Udir fraværsstatistikk (R-script scrape) |
| `aa52766c-75f5-4454-b53c-ac04daeeaae7` | `2b_Udir_sluttet(translated-r-script-auto-update-from-udr-site)` | Udir/VIGO sluttet-statistikk (R-script scrape) |
| `7d926ca6-0cf0-4b69-86bc-93c46728471b` | `ssb-08764` | SSB statbank tabell 08764 |
| `10016d88-f971-48c6-9aba-092741be28cd` | `4_Udir_antall_elever (translated-r-script-auto-update-from-udr-site)` | Udir antall elever/skoler (R-script scrape) |
| `c51bc3d5-1522-438a-961f-76dd34697d79` | `ssb-12063` | SSB statbank tabell 12063 |
| `1293b109-06b8-46e3-a51b-3017d9ea7d4b` | `ssb-12944` | SSB statbank tabell 12944 |
| `92bfaba4-445d-4581-a6d0-0d4b103f146f` | `ssb-06913` | SSB statbank tabell 06913 |
| `65b6a7b5-c273-4ef3-b110-40198e27537d` | `ssb-07459` | SSB statbank tabell 07459 (Om tallene additionally cites 04362 and 10826) |
| `976df883-9f8e-41c0-9492-841d505512f4` | `ssb-06083` | SSB statbank tabell 06083 |
| `76abd854-5c27-4fc3-85f0-cb0f5a5d5a16` | `ssb-09429` | SSB statbank tabell 09429 |
| `1210933a-41bb-434c-aed4-0db038b76b8c` | `ssb-12292` | SSB statbank tabell 12292 |
| `8317274a-bd9f-4eb1-b87c-ef97460085b3` | `6_IMDi_bosatt(auto-update-from-udir-site)` | IMDi bosetting (note: dataset filename says "udir-site" but Om tallene says IMDi) |
| `59ea0fce-0997-4dc4-941e-0bf1abc63128` | `7_IMDi_innvandringsgrunn_kjonn(translated-r-script)` | IMDi innvandringsgrunn (R-script scrape) |
| `62356076-19e7-498d-ac51-283283fd9ecf` | `8_IMDi_landbakgrunn(translated-r-script-auto-update-from-imdi-site)` | IMDi landbakgrunn (R-script scrape) |
| `3bb287aa-a8d6-4094-b0d1-f017b197acf7` | `redcross_medlemmer_frivillige` | Red Cross internal |
| `45b98d41-0561-485b-a35a-834c773e9aff` | `frivillighetsregisteret` | Brønnøysund / Digitaliseringsdirektoratet (Frivillighetsregisteret) |
| `690db65f-f9bc-4b8b-b5b3-1a64d8cfec72` | `ssb-06947` | SSB statbank tabell 06947 |
| `70e38d9f-e117-49c3-9462-1876e205f5a5` | `NAV(translated-r-script-auto-update-from-nav-site)` | NAV arbeidsledighet (R-script scrape) |
| `8e57dbe8-ebe5-40f9-967b-a0876c7ceac7` | `ssb-13138` | SSB statbank (dataset name says 13138, but Om tallene on "Antall sosialhjelpsmottakere" cites **13995** and on "gjennomsnittlig stønadstid" cites **13006** — dataset name mismatches the cited table ids; flagged in §Notes) |
| `132f4515-6e61-474b-abef-df12f48ad47d` | `ssb-12131` | SSB statbank tabell 12131 |
| `099bc410-30d8-4fb0-890f-bf8344947c4c` | `ssb-12132` | SSB statbank tabell 12132 |

All 24 reports share `groupId = 02550945-38e7-4da5-8072-4575d130615e`. Every page calls `/api/powerbi/reportembeddata/{reportId}` which returns a JSON `{id, name, accessToken, embedUrl}`; the `accessToken` is a 2-segment non-standard JWT (1781 or 1785 chars, gzip-prefix `H4…`), i.e. a **Power BI Embed Token** (app-owns-data pattern), not a user AAD token and not a publish-to-web token.

## Report inventory and "Om tallene" captures

The 37 report entries below include URL, indicator, reportId, the Power BI dataset name, the page description (as shown above the embed), and the full verbatim "Om tallene" block + its outbound links. Granularity / time range / filters cannot be enumerated from the parent page HTML because the selectors live inside the cross-origin Power BI iframe; for the four topic areas sampled live in the browser, the observed selectors are noted in §Network-traffic sanity check.

### Barn og unge — Antall barn og unge under 19 år, etter aldersgruppe og bosted

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/aldersgrupper_bosted/
- Power BI reportId: 517f6fd6-0ae1-4132-857a-31a1d379c2b8
- Power BI dataset name: 13_SSB_befolkning
- Page description (verbatim): Her finner du statistikk som viser antall barn og unge under 19 år som bor i henholdsvis tettbygd og spredtbygd strøk. Det er mulig å filtrere på aldersgruppe.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Antall barn og unge under 19 år, etter aldersgruppe og bosted (tettbygd/spredtbygd strøk) og husholdningstype
> Kilde: Statistisk sentralbyrå (SSB)
> Type: registerdata
> Telletidspunkt:
> Innhenting: spesialbestilt fra SSB
> Definisjoner og forklaringer:
> Variabelen husholdningstype har to kategorier: enehusholdning og flerpersonhusholdning. Personer i enehusholdning bor alene, mens personer som bor i flerpersonhusholdning bor sammen med andre, enten familie, venner, bekjente eller fremmede. Personer som bor i institusjon regnes også med i denne kategorien.
> Variabelen tettbygd/spredtbygd strøk følger SSBs tettstedsdefinisjon:
> En hussamling skal registreres som tettsted dersom det bor minst 200 personer der. Avstanden mellom husene skal normalt ikke overstige 50 meter, men for noen arealkrevende bygningstyper – som boligblokker, industribygg, kontor/forretningsbygg, skoler, sykehus osv. – kan avstanden økes til 200 meter. Tilgrensende bebygde og opparbeidede områder, som parker, idrettsanlegg og industriområder, skal være del av tettstedet. Husklynger med minst 5 næringsbygninger eller 5 boligbygninger tas med inntil en avstand på 400 meter fra tettstedskjernen.
> Tettsteder er geografiske områder som har en dynamisk avgrensing, og antall tettsteder og deres yttergrenser vil endre seg over tid avhengig av byggeaktivitet og befolkningsutvikling.
> Tettstedene avgrenses uavhengig av de administrative grensene.Personer fordeles etter bostedsstrøk, dvs. om de bor i tettbygd eller spredtbygd strøk. Tettbygde strøk er de områdene som omfattes av tettsteder, og spredtbygde strøk er alle områder utenfor.
> [1] SSB (2019): Tettsteders befolkning og areal – Om statistikken

**Outbound links inside Om tallene:**

- "[1]" → #_ftnref1
- "Tettsteders befolkning og areal – Om statistikken" → https://www.ssb.no/befolkning/statistikker/beftett/aar

---

### Barn og unge — Barn og unge som bor trangt/romslig/uoppgitt

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/barn-og-unge-som-bor-trangt-romslig-uoppgitt/
- Power BI reportId: d67bcbd0-3975-417b-a6ec-d85368f3149c
- Power BI dataset name: tabell2_rode_kors_pers
- Page description (verbatim): Statistikken viser antall barn og unge under 19 år om bor i henholdsvis trange og romslige boliger, etter aldersgruppe.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Antall barn og unge som bor trangt/romslig/uoppgitt, etter aldersgruppe
> Kilde: Statistisk sentralbyrå (SSB)
> Type: registerdata
> Telletidspunkt:
> Innhenting: spesialbestilt fra SSB
> Definisjoner:
> Statistikken omfatter alle barn og unge i alderen 0 til 19 år som ifølge folkeregisteret var bosatt i en privathusholdning i Norge per 1. januar.[1]
> Trangboddhet: SSB definerer trangboddhet slik:
> Husholdninger regnes som trangbodd dersom: 1. Antall rom i boligen er mindre enn antall personer eller én person bor på ett rom, og 2. Antall kvadratmeter (p-areal) er under 25 kvm per person. I tilfeller hvor det mangler opplysninger om antall rom eller p-areal, vil husholdninger regnes som trangbodde dersom en av de to betingelsene er oppfylt.[2]
> [1] SSB: Boforhold, registerbasert – Om statistikken
> [2] Ibid.

**Outbound links inside Om tallene:**

- "[1]" → #_ftn1
- "[2]" → #_ftn2
- "[1]" → #_ftnref1
- "Boforhold, registerbasert – Om statistikken" → https://www.ssb.no/boforhold
- "[2]" → #_ftnref2

---

### Barn og unge — Andel elever på 7. og 10. trinn som har blitt mobbet

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/mobbing-pa-skolen/
- Power BI reportId: af3083c3-e573-4fe2-b540-65dfb6c60b73
- Power BI dataset name: 2_Udir_Elevundersøkelsen(translated-r-script-auto-update-from-udr-site)
- Page description (verbatim): Denne statistikken viser prosentandel av elevene som svarer ja på om de er blitt mobbet flere ganger i måneden de siste månedene. Tallene kommer fra Elevundersøkelsen til Utdanningsdirektoratet.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Andel elever på 7 og 10 trinn som har blitt mobbet på skolen
> Kilde: Utdanningsdirektoratet (Udir), Elevundersøkelsen
> Type: spørreundersøkelse
> Telletidspunkt: Elevundersøkelsen gjennomføres to ganger per år. I høstsemesteret er det er obligatorisk for skolene å gjennomføre den på 7. og 10. trinn og på Vg1.
> Innhenting:
> Definisjoner:
> Statistikken viser andel (%) av elevene som har svart bekreftende og «2-3 ganger i måneden» eller «oftere» på følgende spørsmål:
> Er du blitt mobbet av andre elever på skolen de siste månedene? Er du blitt mobbet av voksne på skolen de siste månedene? Er du blitt mobbet digitalt (mobil, iPad, PC) de siste månedene?
> I Samfunnspuls er tallene presentert separat for grunnskole og Vg1.

**Outbound links inside Om tallene:**

- "Elevundersøkelsen" → https://www.udir.no/tall-og-forskning/brukerundersokelser/elevundersokelsen/

---

### Barn og unge — Andel elever på Vg1 som har blitt mobbet

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/mobbing-pa-skolen-vg1/
- Power BI reportId: af3083c3-e573-4fe2-b540-65dfb6c60b73
- Power BI dataset name: 2_Udir_Elevundersøkelsen(translated-r-script-auto-update-from-udr-site)
- Page description (verbatim): Denne statistikken viser prosentandel av elevene som svarer ja på om de er blitt mobbet flere ganger i måneden de siste månedene. Tallene kommer fra Elevundersøkelsen til Utdanningsdirektoratet.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Andel elever på Vg1 som har blitt mobbet på skolen
> Kilde: Utdanningsdirektoratet (Udir), Elevundersøkelsen
> Type: spørreundersøkelse
> Telletidspunkt: Elevundersøkelsen gjennomføres to ganger per år. I høstsemesteret er det er obligatorisk for skolene å gjennomføre den på 7. og 10. trinn og på Vg1.
> Innhenting:
> Definisjoner:
> Statistikken viser andel (%) av elevene som har svart bekreftende og «2-3 ganger i måneden» eller «oftere» på følgende spørsmål:
> Er du blitt mobbet av andre elever på skolen de siste månedene? Er du blitt mobbet av voksne på skolen de siste månedene? Er du blitt mobbet digitalt (mobil, iPad, PC) de siste månedene?
> I Samfunnspuls er tallene presentert separat for grunnskolen og Vg1. Tallene for Vg1 vises for hver videregående skole.

**Outbound links inside Om tallene:**

- "Elevundersøkelsen" → https://www.udir.no/tall-og-forskning/brukerundersokelser/elevundersokelsen/

---

### Barn og unge — Støtte hjemmefra til skolearbeidet – grunnskolen

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/stotte-hjemmefra-til-skolearbeidet/
- Power BI reportId: af3083c3-e573-4fe2-b540-65dfb6c60b73
- Power BI dataset name: 2_Udir_Elevundersøkelsen(translated-r-script-auto-update-from-udr-site)
- Page description (verbatim): Denne statistikken viser hvordan elevene vurderer hjelpen og støtten de får til skolearbeid hjemme. I undersøkelsen fra Utdanningsdirektoratet har elevene vurdert tre påstander om hjelp hjemmefra. Grafen viser gjennomsnittskåren for valgt enhet (land, fylke, kommune eller skole).
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Støtte hjemmefra i skolearbeidet
> Kilde: Utdanningsdirektoratet (Udir), Elevundersøkelsen
> Type: spørreundersøkelse
> Telletidspunkt: «I høstsemesteret er det er obligatorisk for skolene å gjennomføre Elevundersøkelsen på 7. og 10. trinn og på Vg1.
> Innhenting:
> Definisjoner:
> I seksjonen "hjem - skole" i Elevundersøkelsen tar elevene blant annet stilling til disse tre påstandene:
> Hjemme viser de interesse for det jeg gjør på skolen. Jeg får god hjelp til leksene mine hjemme. Hjemme oppmuntrer de voksne meg i skolearbeidet.
> For påstand 1 skal de angi om det skjer "svært ofte eller alltid", "ofte", "av og til", "sjelden" eller "aldri". For 2 og 3 skal de angi om det skjer "alltid", "ofte", "av og til", "sjelden" eller "aldri". Svaralternativene er kodet slik at svært "ofte/alltid" har verdien 5, "ofte" har verdien 4, og så videre. Statistikken viser gjennomsnittsskåren for elevene som har svart i et gitt område (landet, fylke, kommune eller skole). Jo høyere verdi, jo bedre støtte opplever elevene i snitt at de får.
> I Samfunnspuls er tallene presentert separat for 7. trinn, 10. trinn og Vg1. Tallene for Vg1 vises separat for hver videregående skole.

**Outbound links inside Om tallene:**

- "Elevundersøkelsen" → https://www.udir.no/tall-og-forskning/brukerundersokelser/elevundersokelsen/
- "" → https://skoleporten.udir.no/rapportbygger

---

### Barn og unge — Støtte hjemmefra til skolearbeidet – Vg1

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/stotte-hjemmefra-til-skolearbeidet-1/
- Power BI reportId: af3083c3-e573-4fe2-b540-65dfb6c60b73
- Power BI dataset name: 2_Udir_Elevundersøkelsen(translated-r-script-auto-update-from-udr-site)
- Page description (verbatim): Denne statistikken viser hvordan elevene vurderer hjelpen og støtten de får til skolearbeid hjemme. I undersøkelsen fra Utdanningsdirektoratet har elevene vurdert tre påstander om hjelp hjemmefra. Grafen viser gjennomsnittskåren for valgt enhet (land, fylke, kommune eller skole).
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Støtte hjemmefra i skolearbeidet
> Kilde: Utdanningsdirektoratet (Udir), Elevundersøkelsen
> Type: Spørreundersøkelse
> Telletidspunkt: «I høstsemesteret er det er obligatorisk for skolene å gjennomføre Elevundersøkelsen på 7. og 10. trinn og på Vg1.
> Innhenting:
> Definisjoner:
> I seksjonen "hjem - skole" i Elevundersøkelsen tar elevene blant annet stilling til disse tre påstandene:
> Hjemme viser de interesse for det jeg gjør på skolen. Jeg får god hjelp til leksene mine hjemme. Hjemme oppmuntrer de voksne meg i skolearbeidet.
> For påstand 1 skal de angi om det skjer "svært ofte eller alltid", "ofte", "av og til", "sjelden" eller "aldri". For 2 og 3 skal de angi om det skjer "alltid", "ofte", "av og til", "sjelden" eller "aldri". Svaralternativene er kodet slik at svært "ofte/alltid" har verdien 5, "ofte" har verdien 4, og så videre. Statistikken viser gjennomsnittsskåren for elevene som har svart i et gitt område (landet, fylke, kommune eller skole). Jo høyere verdi, jo bedre støtte opplever elevene i snitt at de får.
> I Samfunnspuls er tallene presentert separat for 7. trinn, 10. trinn og Vg1. Tallene for Vg1 vises separat for hver videregående skole.

**Outbound links inside Om tallene:**

- "Elevundersøkelsen" → https://www.udir.no/tall-og-forskning/brukerundersokelser/elevundersokelsen/

---

### Barn og unge — Registrert fravær i grunnskolen (10. trinn)

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/registrert-fravaer-i-grunnskolen-10-trinn/
- Power BI reportId: 5c7c52b0-3a9f-4386-b3a0-32b9e020589b
- Power BI dataset name: 3_Udir_fravaer(translated-r-script-auto-update-from-udr-site)
- Page description (verbatim): Denne statistikken viser elevenes fravær målt i timer og dager. I tabellen kan man se medianen for fravær som står på vitnemålet for elever på 10. trinn.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Tall for fravær på 10. trinn
> Kilde: Utdanningsdirektoratet (Udir)
> Type: registerdata
> Telletidspunkt: Høst
> Innhenting: Fra Udirs nettside
> Definisjoner:
> Udir beskriver målingen slik:
> Statistikken viser tall for elevers fravær, både i timer og dager. Tabellen viser medianen for fravær målt i antall dager og antall timer på vitnemålet for elever på 10. trinn. Medianen viser til den midterste verdien når fraværet settes opp i synkende eller stigende rekkefølge. Det vil si at det er like mange elever som har verdier over og under medianen. Medianen påvirkes mindre av ekstremverdier enn gjennomsnittet, og gir derfor et mer riktig mål på hvor høyt det normale fraværet for elever i grunnskolen er.[1]
> [1] Udir: Om statistikken: Fravær i grunnskolen

**Outbound links inside Om tallene:**

- "Udirs nettside" → https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/fravarstall/
- "[1]" → #_ftn1
- "[1]" → #_ftnref1
- "Om statistikken: Fravær i grunnskolen" → https://statistikkportalen.udir.no/api/rapportering/rest/v1/Tekst/visTekst/137364?dataChanged=2020-11-09_143332

---

### Barn og unge — Registrert fravær i videregående skole

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/registrert-fravaer-i-videregaende-skole/
- Power BI reportId: 5c7c52b0-3a9f-4386-b3a0-32b9e020589b
- Power BI dataset name: 3_Udir_fravaer(translated-r-script-auto-update-from-udr-site)
- Page description (verbatim): Denne statistikken viser elevenes fravær målt i timer og dager. I tabellen kan man se medianen for fravær som står på vitnemålet for elever i videregående skole. Tallene kan vises for den enkelte skole.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Fravær i videregående skole
> Kilde: Utdanningsdirektoratet (Udir)
> Type: registerdata
> Telletidspunkt: Høst
> Innhenting: fra Udirs nettside
> Definisjoner:
> Udir beskriver målingen slik:
> Statistikken viser tall for elevers fravær, både i timer og dager. Tabellen viser medianen for fravær målt i antall dager og antall timer på vitnemålet for elever i videregående skole. Medianen viser til den midterste verdien når fraværet settes opp i synkende eller stigende rekkefølge. Det vil si at det er like mange elever som har verdier over og under medianen. Medianen påvirkes mindre av ekstremverdier enn gjennomsnittet, og gir derfor et mer riktig mål på hvor høyt det normale fraværet for elever i videregående skole er.[1]
> [1] Udir: Om statistikken: Fravær på vitnemålet

**Outbound links inside Om tallene:**

- "Udirs nettside" → https://www.udir.no/tall-og-forskning/statistikk/statistikk-videregaende-skole/fravar-vgs/
- "[1]" → #_ftn1
- "[1]" → #_ftnref1
- "Om statistikken: Fravær på vitnemålet" → https://statistikkportalen.udir.no/api/rapportering/rest/v1/Tekst/visTekst/28?dataChanged=2020-11-09_143719

---

### Barn og unge — Andel elever som har sluttet på videregående skole

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/andel-elever-som-har-sluttet-i-videregaende-opplaering-i-lopet-av-skolearet/
- Power BI reportId: aa52766c-75f5-4454-b53c-ac04daeeaae7
- Power BI dataset name: 2b_Udir_sluttet(translated-r-script-auto-update-from-udr-site)
- Page description (verbatim): Denne statistikken viser andel elever som har sluttet på videregående skole i løpet av et skoleår. Statistikken omfatter ikke lærlinger.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Andel elever som har sluttet i videregående skole i løpet av skoleåret
> Kilde: Utdanningsdirektoratet (Udir)/VIGO
> Type: registerdata
> Innhenting: Fra Udirs nettside
> Definisjoner:
> Elever regnes som sluttet i videregående skole i løpet av skoleåret dersom vedkommende er regnet med fullførtkode sluttet, «S», som eneste gyldige resultat på slutten av skoleåret. Utfyllende informasjon om produksjonen av statistikken og definisjonene som gjelder er tilgjengelig her.

**Outbound links inside Om tallene:**

- "Udirs nettside" → https://www.udir.no/tall-og-forskning/statistikk/statistikk-videregaende-skole/sluttet/
- "her" → https://skoleporten.udir.no/rapportvisning/videregaaende-skole/gjennomfoering/slutta/nasjonalt/hjelptiltolkning

---

### Barn og unge — Barn og unge i husholdninger med lavinntekt (EU-60)

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/lavinntekt/
- Power BI reportId: 7d926ca6-0cf0-4b69-86bc-93c46728471b
- Power BI dataset name: ssb-08764
- Page description (verbatim): Denne statistikken viser antall barn og unge under 18 år som vokser opp i lavinntektshusholdninger. Det finnes flere måter å definere lavinntekt på.  I denne statistikken er lavinntektshusholdninger definert som husholdninger som har en samlet inntekt som ligger under 60 prosent av medianinntekten i befolkningen.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Antall barn og unge under 18 år som tilhører husholdninger med lavinntekt (EU-60)
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 08764
> Type: registerdata
> Telletidspunkt: 31. desember
> Innhenting: fra SSBs åpne API
> Definisjoner:
> I Store norske leksikon er begrepet fattigdom definert slik:
> Fattigdom er å ha for lite penger og materielle goder til å leve et tilfredsstillende liv. Det er vanlig å skille mellom absolutt og relativ fattigdom. Absolutt fattigdom er å ikke være i stand til å dekke fysiske primærbehov som nok mat, klær og bolig. Relativ fattigdom er at man ikke har nok midler til å delta fullt ut i det samfunnet man lever i.
> For å skille fattige fra ikke-fattige trekker man en fattigdomsgrense.[1]
> Begrepene «lavinntekt» og «fattigdom» brukes ofte om hverandre. I en kunnskapsoppsummering om barnefattigdom fra 2020 skriver Fløtten og Nielsen fra Fafo at «begge begrepene brukes for å betegne en situasjon der en husholdning har for lite penger eller materielle ressurser til at husholdsmedlemmene kan forventes å kunne opprettholde en gjengs levestandard».[2]
> Antall personer i husholdninger med lavinntekt (EU-60) er et mål på relativ fattigdom. Mens man i målinger av absolutt fattigdom forholder seg til en fastsatt inntektsgrense, vil man i en måling av relativ fattigdom benytte det generelle inntektsnivået i landet som referanse. Antallet eller andelen personer som ligger under denne grensen er da et mål på forekomsten av relativ fattigdom i en befolkning.
> Lavinntektsgrensen settes vanligvis til 50 eller 60 prosent av medianinntekten.[3] 60 prosent av medianen er da det romsligste målet på relativ fattigdom. Med en strengere definisjon, for eksempel 50 prosent, vil færre personer og husholdninger bli definert som fattige.
> Medianinntekten er det inntektsbeløpet som deler en gruppe i to like store halvdeler, etter at inntekten er sortert i stigende eller synkende rekkefølge. Det vil altså være like mange personer med en inntekt over som under medianinntekten.[4] I EU-60 er det inntekt etter skatt per forbruksenhet som legges til grunn. Det er summen av husholdningens skattepliktige og skattefrie inntekter, fratrukket skatt, fordelt på antall forbruksenheter i husholdningen.
> Når man skal regne ut antall forbruksenheter i en husholdning, bruker man en såkalt ekvivalensskala. En slik skala gjør det mulig å sammenligne den økonomiske velferden til husholdninger av ulik type og størrelse. Man kan da beregne hvor stor inntekt en husholdning med et gitt antall medlemmer må ha for å ha samme økonomi og levestandard som en enslig person.[5] I EUs ekvivalensskala tildeles den første voksne i husholdningen vekt lik 1 og den neste voksne vekt lik 0,5. Hvert barn får vekt lik 0,3. En husholdning på to voksne og to barn representerer da 2,1 forbruksenheter, ifølge EU-skalaen.[6] Husholdningens samlede inntekt deles så på antall forbruksenheter. Hvis resultatet ligger under 60 prosent av medianinntekten i befolkningen, har husholdningen lav inntekt i henhold til EU-60-definisjonen.
> [1] Lind, Jo Thori (2017): Fattigdom (artikkel i Store norske leksikon)
> [2] Barne- og familiedepartementet (2020): Like muligheter i oppveksten – Regjeringens samarbeidsstrategi for barn og ungdom i lavinntektsfamilier (2020–2023), se vedlegg 3, s. 192.
> [3] SSB (2016): Økonomi og levekår for ulike lavinntektsgrupper
> [4] SSB benytter medianen i stedet for gjennomsnittet som mål på det generelle inntektsnivået. Selv om gjennomsnittet gjerne er lettere å forholde seg til, er medianen et mer robust mål ettersom den i mindre grad blir påvirket av observasjoner med svært høye eller lave verdier.
> [5] SSB (2016): Økonomi og levekår for ulike lavinntektsgrupper
> [6] SSB: Variabeldefinisjon, EU-ekvivalensskala

**Outbound links inside Om tallene:**

- "08764" → https://www.ssb.no/statbank/table/08764
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api
- "[1]" → #_ftn1
- "[2]" → #_ftn2
- "[3]" → #_ftn3
- "[4]" → #_ftn4
- "[5]" → #_ftn5
- "[6]" → #_ftn6
- "[1]" → #_ftnref1
- "Fattigdom" → https://snl.no/fattigdom
- "[2]" → #_ftnref2
- "Like muligheter i oppveksten – Regjeringens samarbeidsstrategi for barn og ungdom i lavinntektsfamilier (2020–2023)" → https://www.regjeringen.no/contentassets/bb45eed3479549719fb14c78eba35bd4/strategi-mot-barnefattigdom_web.pdf
- "[3]" → #_ftnref3
- "Økonomi og levekår for ulike lavinntektsgrupper" → https://www.ssb.no/inntekt-og-forbruk/artikler-og-publikasjoner/_attachment/281093?_ts=157f60210a8
- "[4]" → #_ftnref4
- "[5]" → #_ftnref5
- "Økonomi og levekår for ulike lavinntektsgrupper" → https://www.ssb.no/inntekt-og-forbruk/artikler-og-publikasjoner/_attachment/281093?_ts=157f60210a8
- "[6]" → #_ftnref6
- "Variabeldefinisjon, EU-ekvivalensskala" → https://www.ssb.no/a/metadata/conceptvariable/vardok/3365/nb

---

### Barn og unge — Nøkkeltall for grunnskoler

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/nokkeltall-for-grunnskoler/
- Power BI reportId: 10016d88-f971-48c6-9aba-092741be28cd
- Power BI dataset name: 4_Udir_antall_elever (translated-r-script-auto-update-from-udr-site)
- Page description (verbatim): Statistikken gir en oversikt over hvor mange skoler det finnes i Norge, og hvor mange elever de har.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Antall skoler og antall elever
> Kilde: Utdanningsdirektoratet (Udir)
> Type: registerdata
> Innhenting: Fra Udirs nettside

**Outbound links inside Om tallene:**

- "Udirs nettside" → https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/tall-om-elever-og-skoler/

---

### Barn og unge — Kommunale fritidstilbud - antall kommunale fritidssenter

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/antall-kommunale-fritidssenter/
- Power BI reportId: c51bc3d5-1522-438a-961f-76dd34697d79
- Power BI dataset name: ssb-12063
- Page description (verbatim): Denne statistikken viser hvor mange kommunale fritidssentre det er i valgt område (hele landet, fylke eller kommune).
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Antall kommunale fritidssentre
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 12063
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "12063" → https://www.ssb.no/statbank/table/12063
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Barn og unge — Kommunale fritidstilbud - antall frivillige barne- og ungdomsforeninger som får kommunalt tilskudd

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/kommunale-fritidstilbud-antall-frivillige-barne-og-ungdomsforeninger-som-far-kommunalt-tilskudd/
- Power BI reportId: c51bc3d5-1522-438a-961f-76dd34697d79
- Power BI dataset name: ssb-12063
- Page description (verbatim): Denne statistikken viser hvor mange frivillige barne- og ungdomsforeninger som får kommunalt tilskudd i valgt område (hele landet, fylke eller kommune).
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Kommunale fritidstilbud - antall frivillige barne- og ungdomsforeninger som får kommunalt tilskudd
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 12063
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "12063" → https://www.ssb.no/statbank/table/12063
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Barn og unge — Kommunale fritidstilbud - tilskudd/overføringer til frivillige barne- og ungdomsforeninger per lag som mottar tilskudd

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/kommunale-fritidstilbud-tilskudd-overforinger-til-frivillige-barne-og-ungdomsforeninger-per-lag-som-mottar-tilskudd/
- Power BI reportId: c51bc3d5-1522-438a-961f-76dd34697d79
- Power BI dataset name: ssb-12063
- Page description (verbatim): Denne statistikken viser antall kroner frivillige barne- og ungdomsforeninger i snitt mottar i tilskudd/overføringer i valgt område (hele landet, fylke eller kommune).
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Kommunale fritidstilbud - tilskudd/overføringer til frivillige barne- og ungdomsforeninger per lag som mottar tilskudd
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 12063
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "12063" → https://www.ssb.no/statbank/table/12063
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Barn og unge — Barn og unge under 18 år i husholdninger med vedvarende lavinntekt (EU-skala 60 prosent)

- URL: https://samfunnspuls.rodekors.no/statistikker/barn-og-unge/vedvarende_lavinntekt_barn_unge/
- Power BI reportId: 1293b109-06b8-46e3-a51b-3017d9ea7d4b
- Power BI dataset name: ssb-12944
- Page description (verbatim): Denne statistikken viser antall og andel personer under 18 år som bor i husholdninger med vedvarende lavinntekt. Husholdninger med vedvarende lavinntekt er her definert som husholdninger som har en samlet inntekt som ligger under 60 prosent av medianinntekten i befolkningen over en periode på tre år.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Personer i husholdninger med vedvarende lavinntekt
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 12944
> Type: registerdata
> Innhenting: fra SSBs åpne API
> Definisjoner:
> I Store norske leksikon er begrepet fattigdom definert slik:
> Fattigdom er å ha for lite penger og materielle goder til å leve et tilfredsstillende liv. Det er vanlig å skille mellom absolutt og relativ fattigdom. Absolutt fattigdom er å ikke være i stand til å dekke fysiske primærbehov som nok mat, klær og bolig. Relativ fattigdom er at man ikke har nok midler til å delta fullt ut i det samfunnet man lever i.
> For å skille fattige fra ikke-fattige trekker man en fattigdomsgrense.[1]
> Begrepene «lavinntekt» og «fattigdom» brukes ofte om hverandre. I en kunnskapsoppsummering om barnefattigdom fra 2020 skriver Fløtten og Nielsen fra Fafo at «begge begrepene brukes for å betegne en situasjon der en husholdning har for lite penger eller materielle ressurser til at husholdsmedlemmene kan forventes å kunne opprettholde en gjengs levestandard».[2]
> Antall personer i husholdninger med lavinntekt (EU-60) er et mål på relativ fattigdom. Mens man i målinger av absolutt fattigdom forholder seg til en fastsatt inntektsgrense, vil man i en måling av relativ fattigdom benytte det generelle inntektsnivået i landet som referanse. Antallet eller andelen personer som ligger under denne grensen er da et mål på forekomsten av relativ fattigdom i en befolkning.
> Lavinntektsgrensen settes vanligvis til 50 eller 60 prosent av medianinntekten.[3] 60 prosent av medianen er da det romsligste målet på relativ fattigdom. Med en strengere definisjon, for eksempel 50 prosent, vil færre personer og husholdninger bli definert som fattige.
> Medianinntekten er det inntektsbeløpet som deler en gruppe i to like store halvdeler, etter at inntekten er sortert i stigende eller synkende rekkefølge. Det vil altså være like mange personer med en inntekt over som under medianinntekten.[4] I EU-60 er det inntekt etter skatt per forbruksenhet som legges til grunn. Det er summen av husholdningens skattepliktige og skattefrie inntekter, fratrukket skatt, fordelt på antall forbruksenheter i husholdningen.
> Når man skal regne ut antall forbruksenheter i en husholdning, bruker man en såkalt ekvivalensskala. En slik skala gjør det mulig å sammenligne den økonomiske velferden til husholdninger av ulik type og størrelse. Man kan da beregne hvor stor inntekt en husholdning med et gitt antall medlemmer må ha for å ha samme økonomi og levestandard som en enslig person.[5] I EUs ekvivalensskala tildeles den første voksne i husholdningen vekt lik 1 og den neste voksne vekt lik 0,5. Hvert barn får vekt lik 0,3. En husholdning på to voksne og to barn representerer da 2,1 forbruksenheter, ifølge EU-skalaen.[6] Husholdningens samlede inntekt deles så på antall forbruksenheter. Hvis resultatet ligger under 60 prosent av medianinntekten i befolkningen, har husholdningen lav inntekt i henhold til EU-60-definisjonen.
> [1] Lind, Jo Thori (2017): Fattigdom (artikkel i Store norske leksikon)
> [2] Barne- og familiedepartementet (2020): Like muligheter i oppveksten – Regjeringens samarbeidsstrategi for barn og ungdom i lavinntektsfamilier (2020–2023), se vedlegg 3, s. 192.
> [3] SSB (2016): Økonomi og levekår for ulike lavinntektsgrupper
> [4] SSB benytter medianen i stedet for gjennomsnittet som mål på det generelle inntektsnivået. Selv om gjennomsnittet gjerne er lettere å forholde seg til, er medianen et mer robust mål ettersom den i mindre grad blir påvirket av observasjoner med svært høye eller lave verdier.
> [5] SSB (2016): Økonomi og levekår for ulike lavinntektsgrupper
> [6] SSB: Variabeldefinisjon, EU-ekvivalensskala

**Outbound links inside Om tallene:**

- "12944" → https://www.ssb.no/statbank/table/12944
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api
- "[1]" → #_ftn1
- "[2]" → #_ftn2
- "[3]" → #_ftn3
- "[4]" → #_ftn4
- "[5]" → #_ftn5
- "[6]" → #_ftn6
- "[1]" → #_ftnref1
- "Fattigdom" → https://snl.no/fattigdom
- "[2]" → #_ftnref2
- "Like muligheter i oppveksten – Regjeringens samarbeidsstrategi for barn og ungdom i lavinntektsfamilier (2020–2023)" → https://www.regjeringen.no/contentassets/bb45eed3479549719fb14c78eba35bd4/strategi-mot-barnefattigdom_web.pdf
- "[3]" → #_ftnref3
- "Økonomi og levekår for ulike lavinntektsgrupper" → https://www.ssb.no/inntekt-og-forbruk/artikler-og-publikasjoner/_attachment/281093?_ts=157f60210a8
- "[4]" → #_ftnref4
- "[5]" → #_ftnref5
- "Økonomi og levekår for ulike lavinntektsgrupper" → https://www.ssb.no/inntekt-og-forbruk/artikler-og-publikasjoner/_attachment/281093?_ts=157f60210a8
- "[6]" → #_ftnref6
- "Variabeldefinisjon, EU-ekvivalensskala" → https://www.ssb.no/a/metadata/conceptvariable/vardok/3365/nb

---

### Demografi og boforhold — Befolkningsendring

- URL: https://samfunnspuls.rodekors.no/statistikker/demografi-og-boforhold/befolkningsendring-folketilvekst/
- Power BI reportId: 92bfaba4-445d-4581-a6d0-0d4b103f146f
- Power BI dataset name: ssb-06913
- Page description (verbatim): Denne statistikken gir en oversikt over folketilvekst , som er det antall personer befolkningen i et valgt område har økt eller sunket med i løpet av et år.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Endringer i kommuner, fylker og hele landets befolkning - folketilvekst
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 06913
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "06913" → https://www.ssb.no/statbank/table/06913
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Demografi og boforhold — Levendefødte

- URL: https://samfunnspuls.rodekors.no/statistikker/demografi-og-boforhold/antall-levendefodte/
- Power BI reportId: 92bfaba4-445d-4581-a6d0-0d4b103f146f
- Power BI dataset name: ssb-06913
- Page description (verbatim): Denne statistikken viser antall barn som har blitt født i valgt område i løpet av et år.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Endringer i kommuner, fylker og hele landets befolkning - levendefødte
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 06913
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "06913" → https://www.ssb.no/statbank/table/06913
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Demografi og boforhold — Tilflytting

- URL: https://samfunnspuls.rodekors.no/statistikker/demografi-og-boforhold/endringer-i-befolkningen-tilflytting/
- Power BI reportId: 92bfaba4-445d-4581-a6d0-0d4b103f146f
- Power BI dataset name: ssb-06913
- Page description (verbatim): Denne statistikken viser antall personer som har flyttet til et valgt område i løpet av et år.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Endringer i kommuner, fylker og hele landets befolkning - tilflytting
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 06913
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "06913" → https://www.ssb.no/statbank/table/06913
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Demografi og boforhold — Antall personer, etter alder og kjønn

- URL: https://samfunnspuls.rodekors.no/statistikker/demografi-og-boforhold/antall-personer-etter-alder-og-kjonn/
- Power BI reportId: 65b6a7b5-c273-4ef3-b110-40198e27537d
- Power BI dataset name: ssb-07459
- Page description (verbatim): Her finner du statistikk om hvor mange mennesker det bor i Norge. Statistikken gir en oversikt over antall personer, etter aldersgruppe og kjønn.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Alders- og kjønnsfordeling i kommuner, fylker og hele landets befolkning
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabellene 04362, 07459 og 10826
> Type: registerdata
> Telletidspunkt: 1.1
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "04362" → https://www.ssb.no/statbank/table/04362
- "07459" → https://www.ssb.no/statbank/table/07459
- "10826" → https://www.ssb.no/statbank/table/10826
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Demografi og boforhold — Antall personer, etter aldersgruppe, husholdningstype og bosted

- URL: https://samfunnspuls.rodekors.no/statistikker/demografi-og-boforhold/alder_husholdningstype_bosted/
- Power BI reportId: 517f6fd6-0ae1-4132-857a-31a1d379c2b8
- Power BI dataset name: 13_SSB_befolkning
- Page description (verbatim): Denne statistikken gir en oversikt over antall personer, etter aldersgruppe og husholdningstype (enehusholdning, flerpersonhusholdning). Det er også mulig å filtrere på bosted og vise separate tall for personer som bor i henholdsvis tettbygd og spredtbygd strøk.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Antall personer, etter aldersgruppe og bosted (tettbygd/spredtbygd strøk) og husholdningstype
> Kilde: Statistisk sentralbyrå (SSB)
> Type: registerdata
> Telletidspunkt:
> Neste oppdatering: vår 2023
> Innhenting: spesialbestilt fra SSB
> Definisjoner og forklaringer:
> Variabelen husholdningstype har to kategorier: enehusholdning og flerpersonhusholdning. Personer i enehusholdning bor alene, mens personer som bor i flerpersonhusholdning bor sammen med andre, enten familie, venner, bekjente eller fremmede. Personer som bor i institusjon regnes også med i denne kategorien.
> Variabelen tettbygd/spredtbygd strøk følger SSBs tettstedsdefinisjon:
> En hussamling skal registreres som tettsted dersom det bor minst 200 personer der. Avstanden mellom husene skal normalt ikke overstige 50 meter, men for noen arealkrevende bygningstyper – som boligblokker, industribygg, kontor/forretningsbygg, skoler, sykehus osv. – kan avstanden økes til 200 meter. Tilgrensende bebygde og opparbeidede områder, som parker, idrettsanlegg og industriområder, skal være del av tettstedet. Husklynger med minst 5 næringsbygninger eller 5 boligbygninger tas med inntil en avstand på 400 meter fra tettstedskjernen.
> Tettsteder er geografiske områder som har en dynamisk avgrensing, og antall tettsteder og deres yttergrenser vil endre seg over tid avhengig av byggeaktivitet og befolkningsutvikling.
> Tettstedene avgrenses uavhengig av de administrative grensene.Personer fordeles etter bostedsstrøk, dvs. om de bor i tettbygd eller spredtbygd strøk. Tettbygde strøk er de områdene som omfattes av tettsteder, og spredtbygde strøk er alle områder utenfor.

**Outbound links inside Om tallene:**

- (none)

---

### Demografi og boforhold — Antall familier, etter familietype

- URL: https://samfunnspuls.rodekors.no/statistikker/demografi-og-boforhold/antall-familier-etter-familietype/
- Power BI reportId: 976df883-9f8e-41c0-9492-841d505512f4
- Power BI dataset name: ssb-06083
- Page description (verbatim): Denne statistikken gir en oversikt over antall familier, etter familietype.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Familier, etter familietype
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 06083
> Type: registerdata
> Telletidspunkt: 1.1
> Neste oppdatering: foreløpig ikke fastsatt
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "06083" → https://www.ssb.no/statbank/table/06083
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Demografi og boforhold — Antall personer i alderen 16 år og over, etter utdanningsnivå og kjønn

- URL: https://samfunnspuls.rodekors.no/statistikker/demografi-og-boforhold/antall-personer-16-ar-og-over-etter-utdanningsniva-og-kjonn/
- Power BI reportId: 76abd854-5c27-4fc3-85f0-cb0f5a5d5a16
- Power BI dataset name: ssb-09429
- Page description (verbatim): Statistikken viser antall personer i alderen 16 år og over, etter utdanningsnivå og kjønn.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Utdanningsnivå, etter kommune og kjønn
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 09429
> Type: registerdata
> Telletidspunkt: 1.10
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "09429" → https://www.ssb.no/statbank/table/09429
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Helse og eldre — Antall beboere i sykehjem

- URL: https://samfunnspuls.rodekors.no/statistikker/helse-og-eldre/sykehjem/
- Power BI reportId: 1210933a-41bb-434c-aed4-0db038b76b8c
- Power BI dataset name: ssb-12292
- Page description (verbatim): Her finner du statistikk over antall beboere i sykehjem.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Institusjon - sykehjemsbeboere
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 12292
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "12292" → https://www.ssb.no/statbank/table/12292
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Helse og eldre — Antall personer som bruker hjemmetjeneste

- URL: https://samfunnspuls.rodekors.no/statistikker/helse-og-eldre/brukere-av-hjemmetjeneste/
- Power BI reportId: 1210933a-41bb-434c-aed4-0db038b76b8c
- Power BI dataset name: ssb-12292
- Page description (verbatim): Denne statistikken viser antall personer som bruker hjemmetjeneste, etter bistandsbehov og alder. Bistandsbehov er delt inn i tre kategorier: «omfattende», «middels» og «noe/avgrenset behov».
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Brukere av hjemmetjeneste, etter aldersgruppe og bistandsbehov
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 12292
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "12292" → https://www.ssb.no/statbank/table/12292
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Flyktninger og migrasjon — Bosetting av flyktninger

- URL: https://samfunnspuls.rodekors.no/statistikker/asylsokere-flyktninger-og-migrasjon/bosetting-av-flyktninger/
- Power BI reportId: 8317274a-bd9f-4eb1-b87c-ef97460085b3
- Power BI dataset name: 6_IMDi_bosatt(auto-update-from-udir-site)
- Page description (verbatim): Statistikken viser antall flyktninger Integrerings- og mangfoldsdirektoratet (IMDi) har anmodet kommunene om å bosette og antall flyktninger kommunene har gjort vedtak om å bosette. Den viser også hvor mange flyktninger som har blitt bosatt i kommunene. Tallene for inneværende år er foreløpige og vil bli oppdatert flere ganger frem mot årsskiftet.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Anmodnings-, vedtaks- og bosettingstall
> Kilde: Integrerings- og mangfoldsdirektoratet (IMDi)
> Type: registerdata
> Innhenting: Fra IMDis nettside
> Definisjoner:
> IMDi beskriver målingen slik:
> Anmodning om bosetting fra IMDi: Anmodning er det antallet flyktninger IMDi på vegne av staten ber en kommune om å bosette, basert på prognoser for bosettingsbehovet neste år.
> Vedtak om bosetting: Antall flyktninger kommunen har vedtatt å bosette i løpet av året, på bakgrunn av anmodning fra IMDi. Kommunen bestemmer selv hvor mange flyktninger de skal bosette i løpet av året. Kommuner som har fattet vedtak om å ikke bosette er ført opp med 0 i vedtak. Kommuner som ikke har fattet vedtak, vises med "manglende data".
> Faktisk bosetting: En flyktning er bosatt når han eller hun ankommer kommunen som har vedtatt å bosette ham eller henne. Tallene inkluderer både overføringsflyktninger og flyktninger bosatt fra mottak i Norge. Personer med familieinnvandringstillatelse som er bosatt fra mottak er inkludert. Personer med familieinnvandringstillatelse som ankommer direkte til sin familie, telles ikke med.
> Bosatte flyktninger med skjermet identitet er ikke telt med på lavere administrative nivåer enn nasjonalt nivå. Dette betyr at dersom man har flyktninger med skjermet identitet i landet, vil det totale antall flyktninger bosatt i Norge i løpet av ett år være høyere enn summen bosatte flyktninger fordelt på kommuner samme år.
> Hvis tall ikke vises for en kategori (anmodning, vedtak, faktisk bosetting) i et gitt geografisk område, betyr det enten at tall ikke har blitt rapportert inn til IMDi eller at antallet personer i gruppen er 0 eller lavt. Av personvernsmessige hensyn er små tall tatt vekk fra statistikken: Dersom en gruppe består av 4 personer, eller færre, vil den ikke vises. Opplysninger kan også bli skjult dersom de vil gjøre det mulig å regne seg frem til det riktige antallet observasjoner i en annen, liten gruppe.[1]
> På grunn av dette kan de aggregerte tallene som ligger i kommunevisningen være noe lavere enn de tilsvarende tallene i fylkesvisningen. På samme måte kan summen av tallene i fylkesvisningen være lavere enn tallene som ligger under fanen landet. Hvis formålet er å hente ut tall for hele landet eller for et fylke, må en altså bruke tallene som ligger under de to respektive fanene.
> [1] IMDi (2018): Bosetting i Norge, se Anmodnings-, vedtaks- og bosettingstall - "Om statistikken"

**Outbound links inside Om tallene:**

- "IMDis nettside" → https://www.imdi.no/om-integrering-i-norge/statistikk/F00/bosetting
- "" → #_ftn1
- "[1]" → #_ftn1
- "" → #_ftn1
- "[1]" → #_ftnref1
- "Bosetting i Norge" → https://www.imdi.no/om-integrering-i-norge/statistikk/F00/bosetting

---

### Flyktninger og migrasjon — Antall innvandrere, etter innvandringsgrunn og kjønn

- URL: https://samfunnspuls.rodekors.no/statistikker/asylsokere-flyktninger-og-migrasjon/innvandrere-etter-innvandringsgrunn-og-kjonn/
- Power BI reportId: 59ea0fce-0997-4dc4-941e-0bf1abc63128
- Power BI dataset name: 7_IMDi_innvandringsgrunn_kjonn(translated-r-script)
- Page description (verbatim): Statistikken viser antall innvandrere, etter innvandringsgrunn og kjønn.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Innvandrere, etter innvandringsgrunn og kjønn
> Kilde: Integrerings- og mangfoldsdirektoratet (IMDi)
> Type: registerdata
> Telletidspunkt: 1.1
> Innhenting: Fra IMDis nettside
> Definisjoner:
> Statistikk over innvandringsgrunn omfatter alle personer som har innvandret til Norge, etter grunn til innvandring. Nordiske borgere er inkludert i statistikken. Statistikken viser antall personer med gitt innvandringsgrunn som bodde i et valgt område på måletidspunktet.
> IMDi beskriver målingen slik:
> Innvandringsgrunn: Grunn til første innvandring, slik grunnen framkommer i registreringer i utlendingsforvaltningens registre, og slik en ellers kan avlede den til ut fra ulike relevante variabler. Variabelen er altså laget i SSB for demografisk bruk, og avspeiler ikke direkte de juridisk orienterte registreringene i utlendingsforvaltningen.
> Arbeidsinnvandrere: Førstegangsinnvandrere som er registrert med arbeid som innvandringsgrunn
> Flyktninger og deres familieinnvandrede: Førstegangsinnvandrere som er registrert som flyktninger, samt familiegjenforente med disse
> Familieinnvandrede: Førstegangsinnvandrere som er registrert som familiegjenforente og familieetablerte. Familieinnvandrede til flyktninger er ikke inkludert i denne kategorien
> Utdanning (inkl. au pair) eller andre grunner: Førstegangsinnvandrere som er registrert med andre innvandringsgrunner. Kategorien inneholder utdanning, au pair, og andre grunner
> Uoppgitt: Statikken over innvandringsgrunn omfatter innvandrere som har flyttet til Norge første gang i 1990 eller senere. Personer som flyttet til Norge før 1990 har dermed "uoppgitt" som innvandringsgrunn.
> Hvis tall ikke vises for gitt kombinasjon av innvandringsgrunn og kjønn i et gitt geografisk område, betyr det enten at tall ikke har blitt rapportert inn til IMDi eller at antallet personer i gruppen er 0 eller lavt. Av personvernsmessige hensyn er små tall tatt vekk fra statistikken: Dersom en gruppe består av 4 personer, eller færre, vil den ikke vises. Opplysninger kan også bli skjult dersom de vil gjøre det mulig å regne seg frem til det riktige antallet personer i en annen, liten gruppe.[1]
> På grunn av dette kan de aggregerte tallene som ligger i kommunevisningen være noe lavere enn de tilsvarende tallene i fylkesvisningen. På samme måte kan summen av tallene i fylkesvisningen være lavere enn tallene som ligger under fanen landet. Hvis formålet er å hente ut tall for hele landet eller for et fylke, må en altså bruke tallene som ligger under de to respektive fanene.
> [1] IMDi (2020): Innvandringsgrunn og kjønn, se "Om statistikken"

**Outbound links inside Om tallene:**

- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "IMDis nettside" → https://www.imdi.no/om-integrering-i-norge/statistikk/F00/befolkning
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "[1]" → #_ftn1
- "" → #_ftn1
- "[1]" → #_ftnref1
- "Innvandringsgrunn og kjønn" → https://www.imdi.no/tall-og-statistikk/steder/F00/befolkning/befolkning_innvandringsgrunn

---

### Flyktninger og migrasjon — Antall innvandrere, etter landbakgrunn

- URL: https://samfunnspuls.rodekors.no/statistikker/asylsokere-flyktninger-og-migrasjon/innvandrere-etter-landbakgrunn/
- Power BI reportId: 62356076-19e7-498d-ac51-283283fd9ecf
- Power BI dataset name: 8_IMDi_landbakgrunn(translated-r-script-auto-update-from-imdi-site)
- Page description (verbatim): Statistikken viser antall innvandrere, etter landbakgrunn.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Opprinnelse - land
> Kilde: Integrerings- og mangfoldsdirektoratet (IMDi)
> Type: registerdata
> Telletidspunkt: 1.1
> Innhenting: Fra IMDis nettside
> Definisjoner:
> Statistikk over innvandrere etter opprinnelsesland omfatter alle personer som har innvandret til Norge. Statistikken viser antall personer fra en gitt region som bodde i et valgt område på måletidspunktet.
> Statistikken er basert på opplysninger fra folkeregisteret (DSF). Den omfatter ikke asylsøkere, personer på korttidsopphold i Norge og personer uten lovlig grunnlag for opphold i landet.
> Hvis tall ikke vises for en gitt opprinnelsesregion i et valgt geografisk område, betyr det enten at tall ikke har blitt rapportert inn til IMDi eller at antallet personer i gruppen er 0 eller lavt. Av personvernsmessige hensyn er små tall tatt vekk fra statistikken: Dersom en gruppe består av 4 personer, eller færre, vil den ikke vises. Opplysninger kan også bli skjult dersom de vil gjøre det mulig å regne seg frem til det riktige antallet personer i en annen, liten gruppe.[1]
> På grunn av dette kan de aggregerte tallene som ligger i kommunevisningen være noe lavere enn de tilsvarende tallene i fylkesvisningen. På samme måte kan summen av tallene i fylkesvisningen være lavere enn tallene som ligger under fanen landet.
> Hvis formålet er å hente ut tall for hele landet eller for et fylke, må en altså bruke tallene som ligger under de to respektive fanene.
> [1] IMDi (2016): Opprinnelse – land, se «Om statistikken»

**Outbound links inside Om tallene:**

- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "" → #_ftn1
- "IMDis nettside" → https://www.imdi.no/om-integrering-i-norge/statistikk/F00/befolkning
- "" → #_ftn1
- "[1]" → #_ftn1
- "[1]" → #_ftnref1
- "Opprinnelse – land" → https://www.imdi.no/tall-og-statistikk/steder/F00/befolkning/befolkning_opprinnelsesland

---

### Frivillighet — Medlemmer i Røde Kors - årsrapport

- URL: https://samfunnspuls.rodekors.no/statistikker/frivillighet/medlemmer-i-rode-kors-arsrapport/
- Power BI reportId: 3bb287aa-a8d6-4094-b0d1-f017b197acf7
- Power BI dataset name: redcross_medlemmer_frivillige
- Page description (verbatim): Statistikken viser antall unike betalende medlemmer med stemmerett ved utgangen av hvert år, med mulighet for å se fordeling på lokalforeninger, distrikter og totalt i Norge.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Medlemmer i Røde Kors - årsrapport
> Kilde: Røde Kors
> Type: Registerdata
> Telletidspunkt: Tallene tas ut 31.12 hvert år og er de offisielle medlemstallene for organisasjonen for gjeldende år.
> Definisjoner:
> Registrerte medlemmer: Antall personer som har en avtale som er startet i eller før et gitt år og som ikke er avsluttet.
> Betalende medlemmer: Antall personer med en eller flere betalende medlems- eller givermedlemsavtaler.
> Nye registrerte medlemmer: Antall personer som har startet en ny medlems- eller givermedlemsavtale i et distrikt eller en lokalforening i løpet av et år, og som ikke tidligere har hatt en medlems- eller givermedlemsavtale der.
> Frafall registrerte medlemmer: Antall personer som har avsluttet alle sine medlems- eller givermedlemsavtaler i et distrikt eller en lokalforening i løpet av et år.

**Outbound links inside Om tallene:**

- (none)

---

### Frivillighet — Frivillige i Røde Kors - årsrapport

- URL: https://samfunnspuls.rodekors.no/statistikker/frivillighet/frivillige-i-rode-kors-arsrapport/
- Power BI reportId: 3bb287aa-a8d6-4094-b0d1-f017b197acf7
- Power BI dataset name: redcross_medlemmer_frivillige
- Page description (verbatim): Statistikken viser totalt antall unike frivillige i lokalforeninger, distrikter og totalt i Norge.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Frivillige i Røde Kors - årsrapport
> Kilde: Røde Kors
> Type: Registerdata
> Telletidspunkt: Tallene tas ut 31.12 hvert år og er de offisielle tallene på antall frivillige i organisasjonen for gjeldende år.

**Outbound links inside Om tallene:**

- (none)

---

### Frivillighet — Organisasjoner som er registrert i Frivillighetsregisteret

- URL: https://samfunnspuls.rodekors.no/statistikker/frivillighet/organisasjoner-som-er-registrert-i-frivillighetsregisteret/
- Power BI reportId: 45b98d41-0561-485b-a35a-834c773e9aff
- Power BI dataset name: frivillighetsregisteret
- Page description (verbatim): Statistikken gir en oversikt over organisasjoner som er registrert i Frivillighetsregisteret.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Frivillighetsregisteret
> Kilde: Brønnøysundregisteret/Digitaliseringsdirektoratet
> Type: registerdata
> Telletidspunkt: Datasettet blir oppdatert en gang per døgn mandag til torsdag samt lørdag
> Innhenting: fra data.norge.no/Digitaliseringsdirektoratets åpne API
> Definisjoner:
> Frivillighetsregisteret definerer frivillig virksomhet slik:
> Som frivillig virksomhet regnes aktiviteter som ikke bygger på fortjeneste. Slik frivillig virksomhet blir driven av:
> Ikke-økonomiske (ideelle) foreninger alminnelige stiftelser som ikke deler ut midler, eller som bare gir utdelinger til frivillig virksomhet næringsdrivende stiftelser som bare foretar utdelinger til frivillig virksomhet aksjeselskap som bare foretar utdelinger til frivillig virksomhet[1]
> [1] Brønnøysundregistrene (2018): Om Frivillighetsregisteret

**Outbound links inside Om tallene:**

- "API" → https://hotell.difi.no/api
- "Om Frivillighetsregisteret" → https://www.brreg.no/om-oss/oppgavene-vare/alle-registrene-vare/om-frivillighetsregisteret/

---

### Økonomi — Personer i husholdninger med lavinntekt (EU-60), hele befolkningen

- URL: https://samfunnspuls.rodekors.no/statistikker/okonomi/personer-som-tilhorer-husholdninger-med-lavinntekt-eu-60-hele-befolkningen/
- Power BI reportId: 690db65f-f9bc-4b8b-b5b3-1a64d8cfec72
- Power BI dataset name: ssb-06947
- Page description (verbatim): Denne statistikken viser antall personer som bor i lavinntektshusholdninger. Det finnes flere måter å definere lavinntekt på.  I denne statistikken er lavinntektshusholdninger definert som husholdninger som har en samlet inntekt som ligger under 60 prosent av medianinntekten i befolkningen.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Personer i husholdninger med lavinntekt
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 06947
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API
> Definisjoner:
> I Store norske leksikon er begrepet fattigdom definert slik:
> Fattigdom er å ha for lite penger og materielle goder til å leve et tilfredsstillende liv. Det er vanlig å skille mellom absolutt og relativ fattigdom. Absolutt fattigdom er å ikke være i stand til å dekke fysiske primærbehov som nok mat, klær og bolig. Relativ fattigdom er at man ikke har nok midler til å delta fullt ut i det samfunnet man lever i.
> For å skille fattige fra ikke-fattige trekker man en fattigdomsgrense.[1]
> Begrepene «lavinntekt» og «fattigdom» brukes ofte om hverandre. I en kunnskapsoppsummering om barnefattigdom fra 2020 skriver Fløtten og Nielsen fra Fafo at «begge begrepene brukes for å betegne en situasjon der en husholdning har for lite penger eller materielle ressurser til at husholdsmedlemmene kan forventes å kunne opprettholde en gjengs levestandard».[2]
> Antall personer i husholdninger med lavinntekt (EU-60) er et mål på relativ fattigdom. Mens man i målinger av absolutt fattigdom forholder seg til en fastsatt inntektsgrense, vil man i en måling av relativ fattigdom benytte det generelle inntektsnivået i landet som referanse. Antallet eller andelen personer som ligger under denne grensen er da et mål på forekomsten av relativ fattigdom i en befolkning.
> Lavinntektsgrensen settes vanligvis til 50 eller 60 prosent av medianinntekten.[3] 60 prosent av medianen er da det romsligste målet på relativ fattigdom. Med en strengere definisjon, for eksempel 50 prosent, vil færre personer og husholdninger bli definert som fattige.
> Medianinntekten er det inntektsbeløpet som deler en gruppe i to like store halvdeler, etter at inntekten er sortert i stigende eller synkende rekkefølge. Det vil altså være like mange personer med en inntekt over som under medianinntekten.[4] I EU-60 er det inntekt etter skatt per forbruksenhet som legges til grunn. Det er summen av husholdningens skattepliktige og skattefrie inntekter, fratrukket skatt, fordelt på antall forbruksenheter i husholdningen.
> Når man skal regne ut antall forbruksenheter i en husholdning, bruker man en såkalt ekvivalensskala. En slik skala gjør det mulig å sammenligne den økonomiske velferden til husholdninger av ulik type og størrelse. Man kan da beregne hvor stor inntekt en husholdning med et gitt antall medlemmer må ha for å ha samme økonomi og levestandard som en enslig person.[5] I EUs ekvivalensskala tildeles den første voksne i husholdningen vekt lik 1 og den neste voksne vekt lik 0,5. Hvert barn får vekt lik 0,3. En husholdning på to voksne og to barn representerer da 2,1 forbruksenheter, ifølge EU-skalaen.[6] Husholdningens samlede inntekt deles så på antall forbruksenheter. Hvis resultatet ligger under 60 prosent av medianinntekten i befolkningen, har husholdningen lav inntekt i henhold til EU-60-definisjonen.
> [1] Lind, Jo Thori (2017): Fattigdom (artikkel i Store norske leksikon)
> [2] Barne- og familiedepartementet (2020): Like muligheter i oppveksten – Regjeringens samarbeidsstrategi for barn og ungdom i lavinntektsfamilier (2020–2023), se vedlegg 3, s. 192.
> [3] SSB (2016): Økonomi og levekår for ulike lavinntektsgrupper
> [4] SSB benytter medianen i stedet for gjennomsnittet som mål på det generelle inntektsnivået. Selv om gjennomsnittet gjerne er lettere å forholde seg til, er medianen et mer robust mål ettersom den i mindre grad blir påvirket av observasjoner med svært høye eller lave verdier.
> [5] SSB (2016): Økonomi og levekår for ulike lavinntektsgrupper
> [6] SSB: Variabeldefinisjon, EU-ekvivalensskala

**Outbound links inside Om tallene:**

- "06947" → https://www.ssb.no/statbank/table/06947
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api
- "[1]" → #_ftn1
- "[2]" → #_ftn2
- "[3]" → #_ftn3
- "[4]" → #_ftn4
- "[5]" → #_ftn5
- "[6]" → #_ftn6
- "[1]" → #_ftnref1
- "Fattigdom" → https://snl.no/fattigdom
- "[2]" → #_ftnref2
- "Like muligheter i oppveksten – Regjeringens samarbeidsstrategi for barn og ungdom i lavinntektsfamilier (2020–2023)" → https://www.regjeringen.no/contentassets/bb45eed3479549719fb14c78eba35bd4/strategi-mot-barnefattigdom_web.pdf
- "[3]" → #_ftnref3
- "Økonomi og levekår for ulike lavinntektsgrupper" → https://www.ssb.no/inntekt-og-forbruk/artikler-og-publikasjoner/_attachment/281093?_ts=157f60210a8
- "[4]" → #_ftnref4
- "[5]" → #_ftnref5
- "Økonomi og levekår for ulike lavinntektsgrupper" → https://www.ssb.no/inntekt-og-forbruk/artikler-og-publikasjoner/_attachment/281093?_ts=157f60210a8
- "[6]" → #_ftnref6
- "Variabeldefinisjon, EU-ekvivalensskala" → https://www.ssb.no/a/metadata/conceptvariable/vardok/3365/nb

---

### Økonomi — Personer i husholdninger med vedvarende lavinntekt (EU-skala 60 prosent), etter alder

- URL: https://samfunnspuls.rodekors.no/statistikker/okonomi/vedvarende_lavinntekt/
- Power BI reportId: 1293b109-06b8-46e3-a51b-3017d9ea7d4b
- Power BI dataset name: ssb-12944
- Page description (verbatim): Denne statistikken viser antall og andel personer som bor i husholdninger med vedvarende lavinntekt. Husholdninger med vedvarende lavinntekt er her definert som husholdninger som har en samlet inntekt som ligger under 60 prosent av medianinntekten i befolkningen over en periode på tre år.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Personer i husholdninger med vedvarende lavinntekt
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 12944
> Type: registerdata
> Innhenting: fra SSBs åpne API
> Definisjoner:
> I Store norske leksikon er begrepet fattigdom definert slik:
> Fattigdom er å ha for lite penger og materielle goder til å leve et tilfredsstillende liv. Det er vanlig å skille mellom absolutt og relativ fattigdom. Absolutt fattigdom er å ikke være i stand til å dekke fysiske primærbehov som nok mat, klær og bolig. Relativ fattigdom er at man ikke har nok midler til å delta fullt ut i det samfunnet man lever i.
> For å skille fattige fra ikke-fattige trekker man en fattigdomsgrense.[1]
> Begrepene «lavinntekt» og «fattigdom» brukes ofte om hverandre. I en kunnskapsoppsummering om barnefattigdom fra 2020 skriver Fløtten og Nielsen fra Fafo at «begge begrepene brukes for å betegne en situasjon der en husholdning har for lite penger eller materielle ressurser til at husholdsmedlemmene kan forventes å kunne opprettholde en gjengs levestandard».[2]
> Antall personer i husholdninger med lavinntekt (EU-60) er et mål på relativ fattigdom. Mens man i målinger av absolutt fattigdom forholder seg til en fastsatt inntektsgrense, vil man i en måling av relativ fattigdom benytte det generelle inntektsnivået i landet som referanse. Antallet eller andelen personer som ligger under denne grensen er da et mål på forekomsten av relativ fattigdom i en befolkning.
> Lavinntektsgrensen settes vanligvis til 50 eller 60 prosent av medianinntekten.[3] 60 prosent av medianen er da det romsligste målet på relativ fattigdom. Med en strengere definisjon, for eksempel 50 prosent, vil færre personer og husholdninger bli definert som fattige.
> Medianinntekten er det inntektsbeløpet som deler en gruppe i to like store halvdeler, etter at inntekten er sortert i stigende eller synkende rekkefølge. Det vil altså være like mange personer med en inntekt over som under medianinntekten.[4] I EU-60 er det inntekt etter skatt per forbruksenhet som legges til grunn. Det er summen av husholdningens skattepliktige og skattefrie inntekter, fratrukket skatt, fordelt på antall forbruksenheter i husholdningen.
> Når man skal regne ut antall forbruksenheter i en husholdning, bruker man en såkalt ekvivalensskala. En slik skala gjør det mulig å sammenligne den økonomiske velferden til husholdninger av ulik type og størrelse. Man kan da beregne hvor stor inntekt en husholdning med et gitt antall medlemmer må ha for å ha samme økonomi og levestandard som en enslig person.[5] I EUs ekvivalensskala tildeles den første voksne i husholdningen vekt lik 1 og den neste voksne vekt lik 0,5. Hvert barn får vekt lik 0,3. En husholdning på to voksne og to barn representerer da 2,1 forbruksenheter, ifølge EU-skalaen.[6] Husholdningens samlede inntekt deles så på antall forbruksenheter. Hvis resultatet ligger under 60 prosent av medianinntekten i befolkningen, har husholdningen lav inntekt i henhold til EU-60-definisjonen.
> [1] Lind, Jo Thori (2017): Fattigdom (artikkel i Store norske leksikon)
> [2] Barne- og familiedepartementet (2020): Like muligheter i oppveksten – Regjeringens samarbeidsstrategi for barn og ungdom i lavinntektsfamilier (2020–2023), se vedlegg 3, s. 192.
> [3] SSB (2016): Økonomi og levekår for ulike lavinntektsgrupper
> [4] SSB benytter medianen i stedet for gjennomsnittet som mål på det generelle inntektsnivået. Selv om gjennomsnittet gjerne er lettere å forholde seg til, er medianen et mer robust mål ettersom den i mindre grad blir påvirket av observasjoner med svært høye eller lave verdier.
> [5] SSB (2016): Økonomi og levekår for ulike lavinntektsgrupper
> [6] SSB: Variabeldefinisjon, EU-ekvivalensskala

**Outbound links inside Om tallene:**

- "12944" → https://www.ssb.no/statbank/table/12944
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api
- "[1]" → #_ftn1
- "[2]" → #_ftn2
- "[3]" → #_ftn3
- "[4]" → #_ftn4
- "[5]" → #_ftn5
- "[6]" → #_ftn6
- "[1]" → #_ftnref1
- "Fattigdom" → https://snl.no/fattigdom
- "[2]" → #_ftnref2
- "Like muligheter i oppveksten – Regjeringens samarbeidsstrategi for barn og ungdom i lavinntektsfamilier (2020–2023)" → https://www.regjeringen.no/contentassets/bb45eed3479549719fb14c78eba35bd4/strategi-mot-barnefattigdom_web.pdf
- "[3]" → #_ftnref3
- "Økonomi og levekår for ulike lavinntektsgrupper" → https://www.ssb.no/inntekt-og-forbruk/artikler-og-publikasjoner/_attachment/281093?_ts=157f60210a8
- "[4]" → #_ftnref4
- "[5]" → #_ftnref5
- "Økonomi og levekår for ulike lavinntektsgrupper" → https://www.ssb.no/inntekt-og-forbruk/artikler-og-publikasjoner/_attachment/281093?_ts=157f60210a8
- "[6]" → #_ftnref6
- "Variabeldefinisjon, EU-ekvivalensskala" → https://www.ssb.no/a/metadata/conceptvariable/vardok/3365/nb

---

### Økonomi — Registrerte helt arbeidsledige, etter måned

- URL: https://samfunnspuls.rodekors.no/statistikker/okonomi/registrerte-arbeidsledige-etter-maned/
- Power BI reportId: 70e38d9f-e117-49c3-9462-1876e205f5a5
- Power BI dataset name: NAV(translated-r-script-auto-update-from-nav-site)
- Page description (verbatim): Statistikken viser antall personer som er registrert som arbeidsledige hos NAV, etter måned.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Helt ledige, etter måned
> Kilde: NAV
> Type: registerdata
> Telletidspunkt: siste dag hver måned
> Innhenting: fra NAVs nettside
> Definisjoner:
> Helt ledige arbeidssøkere omfatter alle arbeidssøkere som er registrert hos NAV og har vært uten arbeid de siste to ukene. Helt permitterte er også inkludert i statistikken over helt ledige.[1]
> Hvis tall ikke vises for et gitt geografisk område, betyr det at antallet personer i gruppen er 0 eller lavt. Av personvernsmessige hensyn er små tall tatt vekk fra statistikken: Dersom et område har 4 personer eller færre som er registrert som helt ledige i en gitt måned, vil tallet ikke vises i grafen.[2]
> [1] NAV (2020): 4. Begreper, kjennemerker og grupperinger
> [2] NAV (2020): 3. Om produksjon av statistikken

**Outbound links inside Om tallene:**

- "NAVs nettside" → https://www.nav.no/no/nav-og-samfunn/statistikk/arbeidssokere-og-stillinger-statistikk/helt-ledige
- "Begreper, kjennemerker og grupperinger" → https://www.nav.no/no/nav-og-samfunn/statistikk/arbeidssokere-og-stillinger-statistikk/relatert-informasjon/om-statistikken-arbeidssokere/4.begreper-kjennemerker-og-grupperinger_kap
- "3. Om produksjon av statistikken" → https://www.nav.no/no/nav-og-samfunn/statistikk/arbeidssokere-og-stillinger-statistikk/relatert-informasjon/om-statistikken-arbeidssokere/3.om-produksjon-av-statistikken_kap

---

### Økonomi — Antall sosialhjelpsmottakere

- URL: https://samfunnspuls.rodekors.no/statistikker/okonomi/antall-sosialhjelpsmottakere/
- Power BI reportId: 8e57dbe8-ebe5-40f9-967b-a0876c7ceac7
- Power BI dataset name: ssb-13138
- Page description (verbatim): Statistikken viser antall sosialhjelpsmottakere i alt og antall sosialhjelpsmottakere som forsørger barn under 18 år.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Sosialhjelpsmottakere, utbetalt beløp og stønadstid - sosialhjelpsmottakere (antall), sosialhjelpsmottakere som forsørger barn under 18 år (antall)
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 13995
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "13995" → https://www.ssb.no/statbank/table/13995
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Økonomi — Stønadssatser for sosialhjelp

- URL: https://samfunnspuls.rodekors.no/statistikker/okonomi/stonadssatser-for-sosialhjelp/
- Power BI reportId: 132f4515-6e61-474b-abef-df12f48ad47d
- Power BI dataset name: ssb-12131
- Page description (verbatim): Statistikken gir en oversikt over gjennomsnittlig stønadssats for sosialhjelp i kommunene. Gjennomsnittlig stønadssats vises separat for enslige og samboere/ektepar. Statistikken viser også tilleggssatsene som gjelder for personer som forsørger barn.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Stønadssatser for sosialhjelp og vedtakstidspunkt - stønadssats per måned for enslig (kr), stønadssats per måned for samboere/ektepar (kr)
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 12131
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "12131" → https://www.ssb.no/statbank/table/12131
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Økonomi — Økonomisk sosialhjelp - gjennomsnittlig stønadstid

- URL: https://samfunnspuls.rodekors.no/statistikker/okonomi/okonomisk-sosialhjelp-gjennomsnittlig-stonadstid/
- Power BI reportId: 8e57dbe8-ebe5-40f9-967b-a0876c7ceac7
- Power BI dataset name: ssb-13138
- Page description (verbatim): Denne statistikken viser gjennomsnittlig stønadstid for personer som mottar økonomisk sosialhjelp i valgt område (hele landet, fylke eller kommune).
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Sosialhjelpsmottakere, utbetalt beløp og stønadstid - gjennomsnittlig stønadstid for sosialhjelpsmottakere, gjennomsnittlig stønadstid 18-24 år, gjennomsnittlig stønadstid 25-66 år
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 13006
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "13006" → https://www.ssb.no/statbank/table/13006
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

### Økonomi — Økonomisk sosialhjelp - beregningsgrunnlag

- URL: https://samfunnspuls.rodekors.no/statistikker/okonomi/utgifter-som-inngar-i-stonadssatsene-for-okonomisk-sosialhjelp/
- Power BI reportId: 099bc410-30d8-4fb0-890f-bf8344947c4c
- Power BI dataset name: ssb-12132
- Page description (verbatim): Statistikken viser om kommuner inkluderer eller holder henholdsvis barnetrygd, kontantstøtte og barns inntekter utenfor beregningsgrunnlaget ved utmåling av sats for økonomisk sosialhjelp.
- Om tallene present: yes

**Om tallene (verbatim):**

> Statistikkens navn: Utgifter som inngår i stønadssatsene for økonomisk sosialhjelp - Barnetrygd holdes utenfor ved utmåling av stønad (ja=1, nei=0), Barns inntekter holdes utenfor ved utmåling av stønad (ja=1, nei=0), Kontantstøtte holdes utenfor ved utmåling av stønad (ja=1, nei=0)
> Kilde: Statistisk sentralbyrå (SSB), statistikkbanktabell 12132
> Type: registerdata
> Telletidspunkt: 31.12
> Innhenting: fra SSBs åpne API

**Outbound links inside Om tallene:**

- "12132" → https://www.ssb.no/statbank/table/12132/tableViewLayout1/
- "API" → https://www.ssb.no/omssb/tjenester-og-verktoy/api

---

## Network-traffic sanity check

### Hosts observed (across all indicator pages)

Classified per the provided categories, observed from the parent page via `performance.getEntriesByType('resource')` and by inspecting loaded iframes:

- **First-party** (`samfunnspuls.rodekors.no`):
  - Page HTML + `/Frontend/vendor.*.js`, `/Frontend/client.*.js`, `/Frontend/style.*.css` (hashed bundle assets)
  - `/Frontend/assets/favicons/manifest.json`
  - `/media/{key}/…` (images/icons served by the CMS)
  - `/media/exyf2q4g/samfunnspuls-theme.json` — Power BI JSON theme fetched alongside each report iframe
  - **`/api/powerbi/reportembeddata/{reportId}`** — first-party proxy that returns `{id, name, accessToken, embedUrl}` (the embed-token mint). Same-origin, no Microsoft sign-in.
- **Power BI** (`app.powerbi.com`, `*.analysis.windows.net`):
  - Iframe `src = https://app.powerbi.com/reportEmbed?reportId=…&groupId=…&w=…&config=…&uid=…`
  - `config` param is base64-encoded JSON: `{"clusterUrl":"https://WABI-NORTH-EUROPE-N-PRIMARY-redirect.analysis.windows.net","embedFeatures":{"usageMetricsVNext":true}}`
  - All DAX `executeQueries` / metadata / visualisation requests happen inside the cross-origin iframe and are invisible to the parent page (Network API scoped to same origin). Token pattern (observed only in the `accessToken` returned by the first-party proxy): 2-segment, gzip-prefixed — a Power BI Embed Token, not AAD user token, not a publish-to-web token.
- **Microsoft auth** (`login.microsoftonline.com`, `login.live.com`): **not observed.** No sign-in prompt is triggered anywhere on the site. Consistent with app-owns-data embedding.
- **Public data sources** (`*.ssb.no`, `*.fhi.no`, `*.bufdir.no`, `*.husbanken.no`, `*.helsedirektoratet.no`, city open-data portals): **not observed as direct calls from the browser.** Upstream data reaches the user only via the Power BI dataset inside the iframe.
  - SSB, Udir, IMDi, NAV, Brønnøysund URLs appear only as outbound *links* inside "Om tallene" (source citations + "`Statbank` tabell NNNNN" deep links). Not as fetches.
- **Map tiles**: none observed. No report uses a map visualisation that loads a basemap (visualisations observed: grouped bar charts, tables, KPI tiles). A few indicator pages mention `Bydeler`/`Grunnkrets` granularity but the chart renders bars, not a map.
- **Analytics / tracking**:
  - `siteimproveanalytics.com/js/siteanalyze_6012388.js` (script include)
  - `6012388.global.siteimproveanalytics.io/image.aspx` (tracking pixel)
- **Other**: none.

### Direct upstream calls

None. No request from the browser targets `*.ssb.no`, `*.fhi.no`, `*.bufdir.no`, `*.husbanken.no`, `*.helsedirektoratet.no`, `*.imdi.no`, `*.udir.no`, `*.nav.no`, `*.brreg.no`, or any municipal open-data host. Upstream data is rehosted into the Red Cross Power BI workspace (some of it via R scripts that scrape the providers' public portals — see dataset names ending in `(translated-r-script-auto-update-from-*-site)`).

### Power BI embed pattern

- **Embed type:** iframe, URL `app.powerbi.com/reportEmbed?reportId=…&groupId=…&w=…&config=…&uid=…`. Not `app.powerbi.com/view?r=…`, so not "publish to web".
- **Token source:** first-party `GET /api/powerbi/reportembeddata/{reportId}` returns JSON with `accessToken` (1781–1785 chars, 2 segments, gzip prefix `H4`). Classic **Power BI Embed Token** — i.e. app-owns-data: a Red Cross service principal / master user signs in on the backend and mints an embed token scoped to the specific report, which the unauthenticated browser then passes into the iframe via the Power BI JS SDK handshake.
- **Anonymous user access:** yes. No sign-in required; the embed token grants read access to the single report.
- **Proxy vs direct:** all Power BI auth bootstrapping is proxied through `samfunnspuls.rodekors.no/api/powerbi/...`. After that, the iframe itself talks to `api.powerbi.com` / `*.analysis.windows.net` directly (cross-origin to the parent).
- **Theme:** a first-party JSON theme (`/media/exyf2q4g/samfunnspuls-theme.json`) is fetched per page and presumably applied via the JS SDK (`powerbi.embed(...)`) — confirms the SDK is in use to configure the iframe, not just a bare `<iframe src=…>`.
- **Interaction pattern (sampled on population + child-poverty reports):** changing area or year inside the iframe triggers additional requests *inside the iframe* to `api.powerbi.com` / `*.analysis.windows.net` that the parent cannot observe; the parent sees no traffic beyond the initial embed-token fetch and theme JSON.

## Stack and infrastructure

- **Frontend framework:** **React 16.13.1** (confirmed via `window.React.version` and `data-reactroot`-equivalent markers — React is mounted into a root div inside `<main>`). No `__NEXT_DATA__`, no Svelte markers, no Vue. Bundler output is custom-hashed (`Frontend/vendor.86f4d517…js`, `Frontend/client.9c280c20…js`, `Frontend/style.91a15963…css`), i.e. in-house build, not Next/Remix/Vite defaults.
- **Server-rendered content:** the "Om tallene" block and the page intro paragraph are **present in the initial HTML** (server-rendered). The Power BI iframe and the "Finn ditt område" selectors are not — they are injected by React after hydration. This is what makes it scrapable for metadata but not for values.
- **Hosting / CDN:** response headers of `/` are minimal — `cache-control: private`, `content-encoding: gzip`, `content-length: 4355`, `content-type: text/html; charset=utf-8`, `date`, `vary: Accept-Encoding`. **No `Server`, `X-Powered-By`, `X-Azure-Ref`, `X-Vercel-*`, `CF-Ray`, `Via`, or `X-Cache` headers are exposed** — so the hosting provider is not identifiable from headers alone. The 404 page (`/robots.txt`, `/sitemap.xml`) returns the classic ASP.NET "The resource you are looking for has been removed, had its name changed, or is temporarily unavailable." text, which strongly implies the backend is IIS / ASP.NET (consistent with Umbraco — see CMS below).
- **CMS signatures:** media URLs follow the `/media/{shortKey}/{filename}` pattern (e.g. `/media/exyf2q4g/samfunnspuls-theme.json`, `/media/iobo3eqe/ppt.svg`, `/media/dybk2evw/pdf.svg`, `/media/wxxdnfuy/png.svg`). This is the canonical **Umbraco** CMS media-path pattern (Umbraco is .NET-based and very common in Norwegian government/NGO sites). The API route `/api/powerbi/reportembeddata/{id}` also fits Umbraco's convention of custom Web API controllers. Not confirmed, but strongly suggestive.
- **Language:** `<html lang="nb">` (Norwegian Bokmål).
- **Meta description:** `<title>Samfunnspuls - Frontpage</title>` — no `<meta name="description">` detected on the home page HTML scan (or it was empty).
- **Service worker:** `navigator.serviceWorker` API is present in the browser, but **no site service worker is registered** (`navigator.serviceWorker.controller` is null on first visit). No offline or push-notification behaviour.
- **Analytics:** Siteimprove (`siteanalyze_6012388`) — the only third-party script on the page.
- **React/React-DOM are 16.13.1**, which is a notable fact on its own (released March 2020 — this codebase predates the Concurrent Mode / Suspense rewrite). If Atlas ever proxies or fork-imitates this site, React 16 conventions apply.

## Notes / anomalies / things that surprised me

### 1. The "4 topic areas on the homepage" is a teaser, not the real inventory

The briefing (and the homepage) emphasises 4 topics (population, child poverty, housing, nursing home). The real site has **6 topic areas and 37 indicator pages**, including bullying, school attendance, drop-out, school key figures, municipal youth clubs, persistent low-income, population change, live births, migration, family types, educational attainment, home-care users, refugee settlement, immigrants by reason and by country, Red Cross members/volunteers, Frivillighetsregisteret, registered unemployment, social assistance recipients/rates/duration/basis, etc. The homepage only promotes the four; everything else is reached via `/statistikker/`.

### 2. Upstream providers: no FHI, no Bufdir, no Husbanken, no city portals

The research plan's hypothesis enumerates SSB / FHI / Bufdir / Husbanken / city open-data portals as the expected providers. The 37 "Om tallene" blocks cite only **SSB, Udir, IMDi, NAV, Brønnøysund/Digitaliseringsdirektoratet, and Røde Kors**. FHI, Bufdir, Husbanken, and municipal open-data portals are not used for any indicator. (Bufdir and FHI appear only under `/andre-ressurser/` as outbound links to external tools, not as indicator sources.)

Similarly, **"neighbourhood-level (delbydel) data for Oslo/Stavanger/Bergen/Trondheim"** — which the homepage highlights for Child Poverty — is not delivered by a city portal but appears to be inside the SSB tables themselves or inside `tabell2_rode_kors_pers`. The Om tallene text does not mention any municipal data source.

### 3. Many indicators are "scraped-then-rehosted via R scripts", not live API feeds

Dataset names reveal the update pipeline:

- `N_Udir_*(translated-r-script-auto-update-from-udr-site)` — Udir indicators (bullying, attendance, drop-out, school key figures)
- `N_IMDi_*(translated-r-script-…-from-imdi-site)` — IMDi indicators (settlement, immigration reason, country background)
- `NAV(translated-r-script-auto-update-from-nav-site)` — NAV unemployment

These are not API integrations in the Atlas sense; they're R scripts that scrape the providers' publication portals and feed the result into Power BI datasets on a schedule. The Om tallene text correspondingly says `Innhenting: Fra Udirs nettside` / `Fra IMDis nettside` / `fra NAVs nettside` (nettside = "website"), not `fra ...s åpne API`.

This matters for Atlas: for Udir/IMDi/NAV indicators, the upstream source Atlas can hit directly is **the provider's website/portal**, not a PxWebAPI-style endpoint. SSB indicators, in contrast, are fetched `fra SSBs åpne API` and have a clickable statbank table id — directly fetchable via the PxWebAPI.

### 4. Dataset-name vs Om-tallene table-id mismatch for social-assistance reports

Report `8e57dbe8-ebe5-40f9-967b-a0876c7ceac7` has dataset name `ssb-13138`, but is reused by two indicator pages whose Om tallene cite **different** SSB tables:

- `/statistikker/okonomi/antall-sosialhjelpsmottakere/` cites `statistikkbanktabell 13995`
- `/statistikker/okonomi/okonomisk-sosialhjelp-gjennomsnittlig-stonadstid/` cites `statistikkbanktabell 13006`

Three different table ids for one dataset name. Claude Code should verify which is actually canonical (likely the Om tallene citations are correct; the dataset name may just be an internal code rather than the authoritative table id).

### 5. "Trangboddhet" is rehosted, not live

`/statistikker/barn-og-unge/barn-og-unge-som-bor-trangt-romslig-uoppgitt/` has dataset name `tabell2_rode_kors_pers` and Om tallene says `Innhenting: spesialbestilt fra SSB` — this is a bespoke SSB extract that Red Cross paid for and now hosts internally. There is no public SSB statbank table id in the citation. Atlas cannot fetch it from SSB's open API; it would need to either (a) commission the equivalent extract from SSB or (b) derive trangboddhet from a public SSB table (SSB 06509 / 06510 or equivalent — Claude Code can confirm in the repo context).

### 6. Two reports have no public-source lineage at all

- `redcross_medlemmer_frivillige` (Medlemmer i Røde Kors / Frivillige i Røde Kors): source is "Røde Kors" itself, i.e. internal organisational data. These indicators are not reproducible from any public API.
- `13_SSB_befolkning` (Antall barn og unge under 19 år, etter aldersgruppe og bosted; and also Antall personer, etter aldersgruppe, husholdningstype og bosted): source is "Statistisk sentralbyrå (SSB)" with `Innhenting: spesialbestilt fra SSB`. Another bespoke extract. No statbank table id given. The "Neste oppdatering: vår 2023" field in the second of these two pages is stale (today is 2026) — suggesting this dataset has not been refreshed since at least 2023.

### 7. Re-use of Power BI reports across indicator pages

24 Power BI reports serve 37 indicator pages. Re-use map (reports serving multiple pages):

- `af3083c3-…` → 4 pages: Mobbing 7/10, Mobbing Vg1, Støtte hjemmefra grunnskolen, Støtte hjemmefra Vg1 (Udir Elevundersøkelsen)
- `5c7c52b0-…` → 2 pages: Fravær grunnskolen 10. trinn + Fravær videregående
- `92bfaba4-…` → 3 pages: Befolkningsendring + Levendefødte + Tilflytting (all SSB 06913)
- `c51bc3d5-…` → 3 pages: Antall kommunale fritidssenter + Antall frivillige barne-/ungdomsforeninger m. tilskudd + Tilskudd per lag (all SSB 12063)
- `517f6fd6-…` → 2 pages: Aldersgrupper/bosted + Alder/husholdningstype/bosted (13_SSB_befolkning)
- `1210933a-…` → 2 pages: Sykehjemsbeboere + Brukere av hjemmetjeneste (SSB 12292)
- `1293b109-…` → 2 pages: Vedvarende lavinntekt barn/unge + Vedvarende lavinntekt (hele befolkningen, etter alder) (SSB 12944)
- `3bb287aa-…` → 2 pages: Medlemmer i Røde Kors + Frivillige i Røde Kors
- `8e57dbe8-…` → 2 pages: Antall sosialhjelpsmottakere + Gjennomsnittlig stønadstid

### 8. Granularity / time-range / filters — only spot-sampled inside the iframe

Because the Power BI UI is cross-origin and not enumerable from the parent page, I cannot programmatically list selectors for all 37 reports. Live sampling on two representative reports:

- **Antall personer, etter alder og kjønn** (SSB 07459): "Finn ditt område" search; granularity buttons `Hele landet / Fylker / Kommuner / Bydeler / Grunnkrets`; `Kjønn` checkboxes (Kvinner / Menn); `Velg år` radio list (2025 selected, plus prior years).
- **Barn og unge i husholdninger med lavinntekt (EU-60)** (SSB 08764): "Finn ditt område" tree (Fylker → Kommuner → Bydeler); `Velg enhet` radio (Antall personer / Andel (%)); `Velg år` radio (2024, 2023, 2022).

Pattern across pages (inferred from page structure identity): every report has a "Finn ditt område" selector + granularity buttons (at minimum Hele landet / Fylker / Kommuner) + at least one "Velg …" filter (år, kjønn, aldersgruppe, enhet, bistandsbehov, or similar) depending on the report. Maps are not used; visualisations are grouped horizontal/vertical bar charts + a total-tile, with an optional "Gruppert stolpe liggende / stående" chart-view toggle under the chart. Several reports also export to PowerPoint/PDF/PNG via download buttons (the three `/media/.../*.svg` icons fetched by every page are those export-format icons).

### 9. Power BI workspace is singular and stable

All 24 reports live in `groupId = 02550945-38e7-4da5-8072-4575d130615e`. The cluster URL embedded in every page's Power BI config is `https://WABI-NORTH-EUROPE-N-PRIMARY-redirect.analysis.windows.net` — i.e. the reports run on Power BI capacity in the North Europe region. Stable across all 24 observed reports.

### 10. "Om Samfunnspuls" page text (verbatim, useful for methodology synthesis)

From `/om-samfunnspuls/`:

> Samfunnspuls: en kunnskapsbank for Røde Kors. Samfunnspuls er et verktøy laget for frivillige og ansatte i Røde Kors. Det kan brukes blant annet i planlegging av aktiviteter og til analyser av lokale humanitære behov. Kunnskapsbanken Samfunnspuls er utviklet av nasjonalkontoret til Røde Kors i Norge. Dette finner du i Samfunnspuls. I denne kunnskapsbanken finner du demografisk statistikk som kan brukes som bakgrunnsinformasjon i planleggings- og analysearbeid. Du finner også statistikker som enten viser omfanget av forskjellige type humanitære behov i landets fylker og kommuner eller indikerer at slike behov finnes. Statistikkene i Samfunnspuls kommer fra Statistisk sentralbyrå, NAV, Utdanningsdirektoratet (Udir), Integrerings- og mangfoldsdirektoratet (IMDi) og flere andre offentlige instanser. Slik er statistikkene valgt ut. I arbeidet med å velge ut statistikker til Samfunnspuls har Røde Kors hovedsakelig tatt utgangspunkt i de nasjonale funnene i rapporten «Humanitære behov i Norge» fra 2017. Basert på analyser av tilgjengelig statistikk og forskning på nasjonalt nivå identifiseres det her en rekke sårbare grupper og deres humanitære behov. Noen av distriktskontorene og lokalforeningene til Røde Kors har også gitt nasjonalkontoret en oversikt over statistikker som de bruker i sitt planleggingsarbeid og ønsker å få samlet i Samfunnspuls. Nasjonalkontoret har tatt hensyn til disse ønskene så langt det var mulig. Kildene oppdaterer statistikkene på forskjellige tider av året og med forskjellig hyppighet. Statistikkene blir oppdatert i Samfunnspuls kort tid etter at de blir oppdatert hos kilden. Nasjonalkontoret vil jevnlig vurdere porteføljen av statistikker som inngår i Samfunnspuls, slik at Samfunnspuls tar opp i seg endringer som skjer i samfunnet. Nye statistikker kan derfor komme til, og noen av de eksisterende kan på sikt bli tatt ut. Kontakt Samfunnspuls: samfunnspuls@redcross.no

### 11. "Andre ressurser" outbound links (verbatim)

From `/andre-ressurser/`:

- Ungdata (NOVA, OsloMet) → https://www.ungdata.no/
- Barnefattigdom (Bufdir) → https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom#/
- Barnevern kommunemonitor (Bufdir) → https://www.bufdir.no/Statistikk_og_analyse/Barnevern_kommunemonitor/#/
- Folkehelseprofil og oppvekstprofil (Folkehelseinstituttet) → https://www.fhi.no/he/folkehelse/folkehelseprofil/
- Kommuneundersøkelsen (Direktoratet for samfunnssikkerhet og beredskap) → https://www.dsb.no/menyartikler/statistikk/kommuneundersokelsen/

These are outbound links, not data sources integrated into any Samfunnspuls report. They mark the "adjacent tools that Samfunnspuls users are directed toward" — useful context for Atlas when thinking about complementary indicators.

### 12. Empty-text link anomalies in the Om tallene captures

Several Om tallene blocks (especially the IMDi ones) list outbound links with empty `text` — these are footnote-anchor `<a>` tags with no inner text (only CSS-styled superscripts), i.e. in-document footnote markers pointing to `#_ftn1`. They are not separate outbound URLs; they are noise from the DOM scrape. The meaningful outbound links in those same blocks are the named ones (e.g. `"IMDis nettside" → https://www.imdi.no/...`, `"Opprinnelse – land" → https://www.imdi.no/tall-og-statistikk/...`).

### 13. Potential method flag for Atlas (flagged per briefing rule 7)

The research plan lists an expected granularity of "delbydel for four largest cities" for child-poverty. Observed: the Child Poverty report supports `Fylker / Kommuner / Bydeler` buttons (no `Grunnkrets`, no separate "delbydel" tier). "Bydeler" in SSB terminology covers the four largest cities' administrative districts. So delbydel-level data as observable here is at the same tier as "bydeler" and is served by the same SSB table 08764, not by city open-data portals. This overturns working-assumption #3 in the research plan.

---

Ready for Claude Code synthesis
