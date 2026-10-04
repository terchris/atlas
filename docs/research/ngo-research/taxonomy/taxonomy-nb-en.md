# The activity taxonomy — Norwegian as people search it, and English

4 October 2026. Built by `python3 taxonomy/build_nb_en.py` (from `ngo/`) →
`taxonomy-nb-en.csv` (38 categories) and `taxonomy-nb-en-families.csv` (10 families).

## The rule

**The Norwegian label is what people type into Google.** Each label is made from the generic
terms with the most searches in Keyword Planner (rounds 1–5, `search-terms-validated.csv`), and
`label_nb_evidence` names those terms with their monthly volume band. 25 of the 38 labels changed:
the previous ones were written by us and often had no searches at all —
*Familiestøtte og familiesenter* (0) became **Åpen barnehage og familiesenter** (*åpen barnehage*
≈5 000), *Lavterskel helsetilbud og behandling* (0) became **Gratis helsehjelp**.

**English follows Norwegian.** It is the plain term an English-speaking person in Norway would
use (*Drop-in playgroup*, *Food bank*), with a one-sentence description and synonyms. English
search volume has **not** been measured (`en_measured = no`); a Keyword Planner round in English,
targeted at Norway, would test it.

The build fails if any volume in `label_nb_evidence` does not match the Keyword Planner data.

## Columns (`taxonomy-nb-en.csv`)

| Column | What |
|---|---|
| `code` | stable key — the one Atlas and the crosswalk use; never changes when a label does |
| `label_nb`, `description_nb` | the Norwegian name and one plain sentence |
| `label_nb_evidence` | the searched terms behind the label, with volume (`(behov)` = how people describe the need) |
| `search_terms_nb` | every generic term with searches, highest first — for the search index |
| `need_terms_nb` | how people describe the problem (*ikke råd til mat*, *har ikke sted å bo*) |
| `volunteer_terms_nb` | how people look for a way to help (*bli fosterhjem*, *frivillig leksehjelp*) |
| `label_en`, `description_en`, `terms_en` | the English equivalent; `en_measured = no` |
| `search_entry` | `yes` a search entry point · `no` used for classification only · `sensitive` Google hides the volume |
| `previous_label_nb` | the label before this change, where it changed |

Left out of the search terms: NGO programme names (*Kors på Halsen*, *Ferie for alle*,
*Natteravnene*), and terms whose volume belongs to another meaning — *matkasser* (meal-kit
subscriptions), *møteplass skilt* (the road sign), *flyktninger* and *asylmottak* (news, not
looking for help). The list and the reason for each is `EXCLUDE` in the script.

## The taxonomy

Volumes are Keyword Planner's monthly bands (50 = 10–100, 500 = 100–1 000, 5 000 = 1 000–10 000).
🔒 sensitive: Google hides the volume. ⓘ classification only, not a search entry point.

### Beredskap og førstehjelp — *Emergency preparedness and first aid*

| Norsk (det folk søker) | English | Søkeord etter volum | Tidligere navn |
|---|---|---|---|
| **Hjelpekorps** | Search and rescue | hjelpekorpset (500) · hjelpekorps (50) · redningskorps (50) | = |
| **Sanitetsvakt** ⓘ | First-aid cover at events | — | Sanitetsvakt og beredskapsvakt |
| **Førstehjelpskurs** | First-aid course | førstehjelpskurs (5000) · hlr kurs (500) · førstehjelpskurs gratis (50) · førstehjelpskurs barn (50) · gratis førstehjelpskurs på nett (50) | = |
| **Krisehjelp** ⓘ | Support after a crisis | omsorgsberedskap (50) · frivillig beredskap (50) · psykososial støtte (50) · støtte etter krise (50) · krisehjelp (50) | Omsorgsberedskap |

### Sosialt fellesskap — *Social connection*

| Norsk (det folk søker) | English | Søkeord etter volum | Tidligere navn |
|---|---|---|---|
| **Besøksvenn** | Visiting friend | besøksvenn (500) · besøkstjeneste (50) · besøksvenn med hund (50) · ensomme eldre (50) · besøksvenn for eldre (50) | Besøksvenn og besøkstjeneste |
| **Møteplass og åpen kafé** | Meeting place and drop-in café | møteplass (500) · åpen kafe (500) · treffpunkt (500) · aktiviteter for eldre (500) · sosial møteplass (50) | Møteplass og kafé |
| **Frivilligsentral** | Volunteer centre | frivilligsentral (500) · frivilligsentralen (500) · frivillighetssentral (50) | = |

### Språk og inkludering — *Language and inclusion*

| Norsk (det folk søker) | English | Søkeord etter volum | Tidligere navn |
|---|---|---|---|
| **Språkkafé og gratis norsktrening** | Language café and free Norwegian practice | språkkafe (500) · gratis norskkurs (500) · språkkafé (50) · norsktrening (50) · språkvenn (50) | Språkkafé og norsktrening |
| **Flyktningguide og flyktningvenn** | Refugee guide and refugee friend | flyktningguide (50) · flyktningvenn (50) · frivillig flyktninger (50) · frivillig asylmottak (50) · jobbe frivillig flyktninger (50) | Flyktningguide og integreringsvenn |

### Barn, unge og familier — *Children, youth and families*

| Norsk (det folk søker) | English | Søkeord etter volum | Tidligere navn |
|---|---|---|---|
| **Leksehjelp** | Homework help | leksehjelp (500) · digital leksehjelp (500) · gratis leksehjelp (50) · leksehjelp i matte (50) · leksehjelp barneskole (50) | = |
| **Ungdomsklubb og fritidsklubb** | Youth club | ungdomsklubb (500) · fritidsklubb (500) · fritidsklubben (50) · møteplass for ungdom (50) · ungdomshus (50) | Ungdomsklubb og treffpunkt for ungdom |
| **Fritidsaktiviteter for barn og unge** | Leisure activities for children and young people | fritidsaktiviteter barn (500) · speiding (500) · friluftsliv ungdomsskolen (50) | Barne- og ungdomsgrupper |
| **Sommerleir og gratis ferie** | Summer camp and free holidays | sommerleir (500) · gratis sommerleir for barn (50) | Ferie for alle |
| **Åpen barnehage og familiesenter** | Drop-in playgroup and family centre | åpen barnehage (5000) · familiesenteret (500) · familiesenter (50) · mentorfamilie (50) · barseltreff (50) | Familiestøtte og familiesenter |
| **Lesevenn** ⓘ | Reading friend | lesevenn (50) · leseombud (50) · lesehjelp (50) · lesetrening barn (50) · lesestund (50) | = |
| **Fosterhjem og barnevernstiltak** | Foster care and child welfare services | barneverntiltak (50) · tilsyn ved samvær (50) | Barnevern og omsorgstiltak |

### Helse og mestring — *Health and coping*

| Norsk (det folk søker) | English | Søkeord etter volum | Tidligere navn |
|---|---|---|---|
| **Helseopplysning og mestringskurs** | Health information and self-management courses | helseopplysning (500) · mestringskurs (50) · diabeteskurs (50) · mestringskurs asperger (50) | Helseopplysning og kurs |
| **Likeperson og støttegruppe** | Peer support and support groups | likeperson (500) · likemann (50) · samtalegruppe (50) · selvhjelpsgruppe (50) · pårørendegruppe (50) | Likepersonarbeid |
| **Demensforening og aktivitetsvenn** 🔒 | Dementia support and activity friends | demensvennlig samfunn (500) · demenskoordinator (500) · demensforening (50) · aktivitetsvenn (50) · demensvennlig kommune (50) | Demensvennlig tilbud |
| **Trening for eldre og turvenner** | Exercise for older people and walking groups | gåfotball (500) · trening for eldre (500) · gåfotball norge (500) · turvenner (500) · styrketrening for eldre (500) | Turgrupper og fysisk aktivitet |
| **Gratis helsehjelp** 🔒 | Free health care | helsesenter for papirløse (50) · helsesenter for papirløse migranter (50) · gratis helsehjelp (50) | Lavterskel helsetilbud og behandling |

### Rus, bolig og fattigdom — *Addiction, housing and poverty*

| Norsk (det folk søker) | English | Søkeord etter volum | Tidligere navn |
|---|---|---|---|
| **Rusbehandling og rusomsorg** 🔒 | Addiction treatment and support | rusbehandling (500) · rusomsorg (50) · rusomsorgen (50) · rusproblemer hjelp (50) · rusbehandling institusjon (50) | Hjelp ved rusproblemer |
| **Akuttovernatting og herberge** | Emergency night shelter | herberge (500) · akuttovernatting (50) · natthjem (50) · natthjemmet (50) · sovested (50) | Akuttovernatting |
| **Bolighjelp for bostedsløse** | Housing help and outreach for homeless people | bostedsløs (500) · bostedsløse (500) · bolighjelp (50) · oppsøkende arbeid (50) · bostedsløse i norge (50) | Bolighjelp og oppsøkende arbeid |
| **Gratis mat og matutdeling** | Free food and food parcels | gratis mat (500) · matutdeling (50) · gratis middag (50) · suppekjøkken (50) · få gratis mat (50) | Matutdeling |
| **Bruktbutikk** | Second-hand shop | bruktbutikk (50000) · gjenbruksbutikk (5000) · brukt butikk (5000) · bruktbutikker (500) · bruktbutikk i nærheten (500) | = |

### Arbeid og aktivitet — *Work and activity*

| Norsk (det folk søker) | English | Søkeord etter volum | Tidligere navn |
|---|---|---|---|
| **Arbeidstrening og arbeidspraksis** | Work training and job placement | arbeidstrening (500) · arbeidsinkludering (500) · arbeidspraksis (500) · arbeidstrening nav (500) · nav arbeidstrening (500) | Arbeidstrening og arbeidsinkludering |

### Rettigheter og trygghet — *Rights and safety*

| Norsk (det folk søker) | English | Søkeord etter volum | Tidligere navn |
|---|---|---|---|
| **Gratis rettshjelp** | Free legal aid | fri rettshjelp (5000) · gratis rettshjelp (500) · gratis juridisk hjelp (50) · gratis juridisk hjelp for kvinner (50) · gratis rettshjelp nav (50) | = |
| **Vitnestøtte** ⓘ | Witness support | vitnestøtte (50) · vitne i rettssak (50) | = |
| **Nettverk etter soning** | Support after prison | nettverk etter soning (500) | = |
| **Hjelpetelefon og chat** | Helpline and chat | hjelpetelefon (500) · hjelpetelefon chat (50) · hvor kan jeg snakke med noen anonymt (50) · hjelpetelefon døgnåpent (50) · hjelpetelefon rus (50) | = |
| **Krisesenter** | Crisis shelter and support after violence | krisesenter (5000) · krisesenter for kvinner (500) | = |
| **Hjelp mot mobbing** 🔒 | Help against bullying | — | Mobbeforebygging |
| **Nattevandring og gatemegling** | Night patrols and street mediation | gatemegling (50) · nattevandring (50) | Gatemegling og nattevandring |

### Kultur, tro og fellesskap — *Culture, faith and community*

| Norsk (det folk søker) | English | Søkeord etter volum | Tidligere navn |
|---|---|---|---|
| **Kor og korps** | Choir and brass band | hornorkester (50) · musikkgruppe (50) · hornorkesteret (50) · musikkgrupper (50) | Kor, korps og musikk |
| **Strikkekafé og hobbygruppe** | Knitting café and craft group | strikkekafe (500) · hobbygruppe (50) · sy og strikk (50) | Strikking og kreative grupper |
| **Gudstjeneste og åpen kirke** | Church services and open church | gudstjeneste (5000) · gudstjenestelisten (500) · gudstjeneste søndag (500) · åpen kirke (50) | = |

### Påvirkning og samfunn — *Advocacy and society*

| Norsk (det folk søker) | English | Søkeord etter volum | Tidligere navn |
|---|---|---|---|
| **Politisk påvirkning** ⓘ | Advocacy | politisk påvirkning (50) · humanitær rett (50) · politisk påvirkningsarbeid (50) · internasjonal humanitær rett (50) · påvirkningsarbeid (50) | = |

## Still open

- **Nynorsk** (`label_nn` in `categories-v2.csv`) is not yet rebuilt from the new labels; it needs a native
  writer (task O3).
- **English volumes** are unmeasured.
- **Three candidate categories** from the crosswalk — help with public services, free equipment lending,
  residential care for older people (`crosswalk-review.md`) — need a Keyword Planner round before they
  get a label in either language.
- `categories-v2.csv` keeps its old `label_nb` for the record; **`taxonomy-nb-en.csv` is the version
  to hand to Atlas** in PR 2.
