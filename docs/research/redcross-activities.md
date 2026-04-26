# Red Cross activities

The canonical activities offered by Norwegian Red Cross chapters, derived from a live Red Cross Organizations API dump (kept locally at `atlas-private-data-repo/redcross/organisations/api-getOrganizations-output-21apr26.json`, gitignored).

## Source and method

- **Source**: Full export from `https://api.redcross.no/nrx/v1/organizations`, 1.1 MB JSON.
- **Scale**: ~400 chapters, 48 unique `globalActivityId` values, 2 407 unique `activityName` values.
- **Note on derivation**: The dump contains `globalActivityId` (GUID) and `activityName` (chapter-local name like `"Arendal Røde Kors Besøkstjeneste"`) but no `globalActivityName` field. The canonical names below are inferred by pattern-matching against local names, so the counts are an approximation of chapter-level footprint, not an authoritative mapping to the 48 canonical IDs. When a chapter-specific local name cleanly contains the canonical pattern, it's counted.

## Activities, by chapter footprint

Ordered by how many chapter-activity entries match each canonical pattern. Descriptions draw on `redcross-ideas.md`, `personas.md`, and public Red Cross sources.

| Activity | Chapter-activity entries | What it is |
|---|---:|---|
| **Hjelpekorps** | 285 | Volunteer search, rescue and first-aid corps. Operates in terrain (mountain, forest, water) and at large public events. The primary beredskap capability of Red Cross. |
| **Besøkstjeneste** | 232 | One-to-one visiting service for lonely or isolated people — typically elderly in their homes or in institutions. Core of the "Trygg oppvekst"-adjacent omsorg line. |
| **Ung + RØFF** | 178 | Youth volunteer corps. RØFF (Røde Kors Førstehjelp og Friluftsliv) is the youth wing of Hjelpekorps; "Ung" covers broader youth engagement. |
| **Beredskapsvakt** | 156 | First-aid standby at public events, festivals, sports. Trained volunteer first-aid presence. |
| **Besøksvenn med hund** | 127 | Variant of Besøkstjeneste where the volunteer brings an approved dog. High-demand subtype. |
| **Migrasjon / Flerkultur / mottak** | 119 | Umbrella for activities at or around asylum reception centres — children's activities, adult engagement, language practice, community-building. |
| **Kursholder** | 90 | Certified instructors running first-aid, caregiving and preparedness courses. Revenue-generating and capability-building. |
| **Treffpunkt / Fellesverket** | 67 | Youth drop-in centres. Fellesverket is the branded urban version (Oslo has several); Treffpunkt is the general term. |
| **Leksehjelp** | 66 | Homework help for primary and secondary pupils. Often partnered with schools or libraries. |
| **Omsorg** | 65 | Care — general umbrella used by some chapters for visiting + omsorgsberedskap + social inclusion. |
| **BARK** | 62 | Barnas Røde Kors — weekly activity groups for children (roughly age 6–13), focused on inclusion and friendship. |
| **Flyktningguide** | 60 | One-to-one mentoring between a Norwegian volunteer and a recently arrived refugee. Language, networks, practical help. |
| **Norsktrening** | 69 | Informal Norwegian language practice groups for immigrants. Low-threshold, volunteer-led. |
| **Vitnestøtte** | 43 | Trained volunteer support for witnesses in criminal trials, present at tinghuset. |
| **Ferie for alle** | 41 | Funded holidays (camps, weekend trips) for children in low-income families. National programme. |
| **Treffpunkt / Fellesverket** | 67 | Youth drop-in spaces — see above. |
| **Gatemegling** | 23 | Restorative-justice-style conflict mediation for youth. |
| **Bruktbutikk** | 19 | Thrift shops run by chapters. Revenue stream and community presence. |
| **Asylmottak (nested)** | 13 | Activities specifically at asylum reception centres. |
| **Nettverk etter soning** | 7 | Mentor-based support for people leaving prison. |
| **Sykehusguide** | 6 | Hospital way-finding and companionship for patients and visitors. |
| **Kompis** | 3 | Variant of buddy programmes (named in some chapters). |
| **Kors på halsen** | 2 | National chat/phone line for children and youth (800 33 321, korspåhalsen.no). Mostly a central service; a few chapters list related local activity. |
| **Kulturvenn** | 1 | Cultural-companion variant of Besøkstjeneste. |
| **Besteforeldre i skolen** | 1 | Volunteer grandparents in schools. |
| **Krisesenter (aktivitet ved)** | 2 | Activities for children at women's crisis centres. |
| **Frokostkafé** | 1 | Breakfast café — low-threshold social meeting point. |

## Thematic groupings

The canonical activities fall into a smaller number of thematic clusters that map naturally to humanitarian-need indicators:

### Beredskap and rescue
Hjelpekorps · Beredskapsvakt · Kursholder · RØFF
→ Need signals: terrain and weather exposure, road-accident density, population in skred/flom/kvikkleire-soner, distance from nearest akuttmottak.

### Loneliness and ageing
Besøkstjeneste · Besøksvenn med hund · Omsorg · Sykehusguide · Besteforeldre i skolen · Kulturvenn
→ Need signals: share of single-person households 65+, FHI Folkehelseprofil ensomhet, home-care coverage, fastlege-dekning.

### Children and youth
BARK · Leksehjelp · Ferie for alle · Treffpunkt / Fellesverket · Ung · Kors på halsen · RØFF
→ Need signals: child poverty (Bufdir Barnefattigdom), Ungdata loneliness/mobbing/trivsel, barnevernsstatistikk, skoleresultater per kommune.

### Refugees and integration
Flyktningguide · Norsktrening · Migrasjon/Flerkultur · Asylmottak-activities
→ Need signals: IMDi settlement figures, UDI asylmottak locations, norskprøve-resultater, antall bosatt per kommune, country of origin.

### Justice and reintegration
Vitnestøtte · Gatemegling · Nettverk etter soning
→ Need signals: domstolsvolum (domstol.no), SSB kriminalstatistikk, Konfliktrådet-saker, Kriminalomsorgen-data.

### Revenue and community infrastructure
Bruktbutikk · Kursholder · Frokostkafé
→ Need signals: less "humanitarian need" and more "local viability" — kommune population, footfall, partnership density.

## Local naming pattern

Chapters heavily localise their activity names. Examples of what the same canonical activity looks like across chapters:

- `"Arendal Røde Kors Besøkstjeneste"`
- `"Aalesund Røde Kors Besøkstjeneste"`
- `"Beiarn Røde Kors besøkstjeneste"` (lowercase b)
- `"Andøy Røde Kors - Besøkstjeneste"` (hyphen separator)
- `"Ballangen Røde Kors - Besøkstjenesten"` (definite form)
- `"BRK Besøkstjeneste"` (abbreviation — Bergen Røde Kors)

Implication: any UI that groups chapters by activity must match against the canonical name pattern, not exact strings. The cleanest path is to resolve `globalActivityId` → canonical name via a lookup (either from the API's full schema when available, or a curated mapping committed to this repo).

## Open question

We need the 48 canonical `globalActivityName` values, either by pulling them from the live API (requires the subscription key), or by compiling a lookup file keyed on `globalActivityId`. Until that exists, pattern-matching against local names is the workaround.
