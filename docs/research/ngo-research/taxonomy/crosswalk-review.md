# Crosswalk review — every NGO activity → a taxonomy v2 category (R1)

4 October 2026. **Status: proposed by the research; not yet reviewed** (task O2). Built by
`python3 taxonomy/build_crosswalk.py` (from `ngo/`) → `crosswalk_activity_service_category.csv`.

## What it is

Each NGO names its activities in its own words. The crosswalk maps every one to a category of
taxonomy v2 (`categories-v2.csv`, 38 active categories in 10 families), so one search reaches the
same kind of help across all NGOs. It replaces the hard-coded `CASE` in Atlas's
`supply__redcross_branch_activities.sql` (Røde Kors only) with one reviewed table for every NGO.
It becomes a seed in PR 2.

**One row per (activity, category).** `is_primary = true` is the category the activity is filed
under; extra rows (`is_primary = false`) are secondary categories it should also be found under.
An activity that is not a service has one row, `is_service = false`, with the reason in `note`.

| Column | Meaning |
|---|---|
| `activity_id` | the research's activity id; Røde Kors: `redcross:<slug of global_activity_name>` |
| `atlas_case_code` | Røde Kors only: what Atlas's `CASE` says today |
| `basis` | what supports the mapping: `name`, `description`, `source_group` (only the NGO's own grouping), `programme`, `atlas_case`, or `none` |
| `confidence` | `HIGH` stated by name or description · `MEDIUM` strongly implied · `LOW` best guess, review first |
| `reviewed_by`, `reviewed_at` | empty until someone signs off |

## Coverage

| | Activities | Mapped | Not a service |
|---|---:|---:|---:|
| Kirkens Bymisjon | 144 | 141 | 3 |
| Frelsesarmeen | 36 | 34 | 2 |
| Sanitetskvinnene | 14 | 11 | 3 |
| Nasjonalforeningen | 6 | 6 | 0 |
| Røde Kors (rodekors.no + Atlas's list) | 254 | 233 | 21 |
| LHL | 17 | 17 | 0 |
| Folkehjelp | 6 | 6 | 0 |
| Diabetesforbundet | 7 | 7 | 0 |
| Mental Helse | 7 | 7 | 0 |
| 4H | 3 | 3 | 0 |
| **Total** | **494** | **465** | **29** |

Primary confidence: 231 HIGH, 144 MEDIUM, 90 LOW (4 Oct, after R10, R8 and R3). Røde Kors
alone: 62 HIGH, 91 MEDIUM, 80 LOW — 79 of its LOW rows are one-branch local activities
caught by a broad keyword rule; the 32 national activities, which carry 1 270 of its 1 535
provisions, are HIGH or MEDIUM. 37 of the 38 categories are used; only `bullying_prevention` has no activity yet.

After R3 (4 Oct) ten of eleven NGOs have activities; Speiderforbundet's method is still open.

## Røde Kors: from rodekors.no (R8, 4 Oct)

The crosswalk now reads Røde Kors's activities from its branch pages: 32 national activities (local
names mapped by rule in `redcross-branches.ts`) and 203 local ones (keyword rules, `REDCROSS_LOCAL` in
`build_crosswalk.py`). National activities in Atlas's list that no branch page publishes keep a row,
noted as such, for the comparison with Atlas.

What changes against Atlas's `CASE`:

| Activity | Atlas today | Proposed | Why |
|---|---|---|---|
| Visitor | `elderly_visiting` | **`prison_reintegration`** | branch texts: confidential conversations with prisoners |
| EVA | not a service | **`crisis_shelter`** | a support person for a year after domestic violence, negative social control or trafficking |
| Døråpner | not a service | **`meeting_place`** + addiction, prison | free evening activity groups after addiction, psychiatry, prison or loneliness |
| Habil | `family_support` | **`work_inclusion`** | a volunteer to practise driving with, for a licence |
| Turgruppe | `youth_activity_groups` | **`physical_activity`** | v2 has the category |
| Møteplasser | `family_support` | **`meeting_place`** | v2 has the category |
| Akuttovernatting for bostedsløse tilreisende | `housing_outreach` | **`emergency_shelter`** | v2 has the category |
| Beredskap | `first_aid_standby` | + `crisis_preparedness` | also *psykososial førstehjelp* groups on 31 branches |

Unchanged: Nattevandring (`street_mediation`), Våketjenesten (`elderly_visiting`). Praktiske tjenester
is on no branch page; its row keeps Atlas's guess. Local activities add three more gap cases:
**equipment lending** (*Utstyrsbanken*, *TURBO*, *Utlånssentralen*), **practical help** (shopping,
transport, digital help for older people) and **hospital guides and hosts**.

## Review first: the LOW mappings

Outside Røde Kors's local activities (79 one-branch rows, best reviewed as a list in the CSV,
filtered on `ngo = redcross` and `confidence = LOW`):

| Activity | Name | Proposed | Basis | Why it is LOW |
|---|---|---|---|---|
| `kirkens-bymisjon:gatesosionomen` | Gatesosionomen | `housing_outreach` | description | GAP: help with public services has no category |
| `kirkens-bymisjon:gi-det-videre` | Gi det videre | `family_support` | description | GAP: donated clothes and sports equipment for children 0-18; equipment lending/donation has no category |
| `kirkens-bymisjon:risenga-bo-og-omsorgssenter` | Risenga bo- og omsorgssenter | `health_services` | name | GAP: residential elderly care has no category |
| `kirkens-bymisjon:skattkammeret` | Skattkammeret | `youth_activity_groups` | description | GAP: free lending of sports and leisure equipment, under 25; no category |
| `kirkens-bymisjon:verdensrommet` | Verdensrommet | `addiction_support` | source_group | no description on disk |
| `kirkens-bymisjon:vibemyr-skoleverksted` | Vibemyr skoleverksted | `homework_help` | description | GAP: an upper-secondary school with adapted teaching; no category for alternative education |
| `kirkens-bymisjon:valerengahjemmet-bo-og-kultursenter` | Vålerengahjemmet bo- og kultursenter | `health_services` + `meeting_place` | description | GAP: residential elderly care has no category |
| `sanitetskvinnene:dig-in` | Dig In | `physical_activity` | none | a placeholder: nothing on disk says what Dig In is; needs R10 before review |
| `sanitetskvinnene:sisterhood` | Sisterhood | `meeting_place` + `migrant_mentoring` | name | page on disk is training material; the activity itself needs R10 |
| `redcross:praktiske-tjenester` | Praktiske tjenester | `family_support` | atlas_case | Atlas best guess kept; check content (R8); not on any rodekors.no branch page (2026-10-04) |

## Gaps in the taxonomy — decisions for the owner

Several activities fit no category well. They point at these candidate categories:

| Candidate | Activities here | Elsewhere | Decide |
|---|---|---|---|
| **Help with public services** (*sosialrådgivning*, *veiledning i møte med NAV*) | Gatesosionomen (digital exclusion), Ressurssenter for norske romer, Tillitsperson | likely in several NGOs not yet covered | add a category, or keep under `legal_aid` / `addiction_support` |
| **Free equipment lending** (*utstyrssentral*, *BUA*) | Skattkammeret (25 locations, under 25s), Gi det videre (donated clothes and equipment, 0–18), a **BUA point run by Frivilligsentralen Sør-Varanger**, and Røde Kors branches' *Utstyrsbanken*, *TURBO*, *Utlånssentralen* | Røde Kors's **BUA**, which Atlas marks *not a service* | add a category and make BUA a service — it lends sports equipment to the public free of charge |
| **Residential care for older people** (*sykehjem*, *bo- og omsorgssenter*) | Risenga (104 long-term places), Vålerengahjemmet | — | probably out of scope: municipal-contracted care, not something a person signs up for. Mark not-a-service, or keep under `health_services` |
| **Alternative education** (*tilrettelagt videregående opplæring*) | Vibemyr skoleverksted | — | probably out of scope: a school with admission, not a drop-in service |
| **Practical help** (*handlehjelp*, *følgetjeneste*, *transport*, *datahjelp*) | Røde Kors branches: Handlehjelpen, Følgetjeneste, Transportgruppe, Datahjelp for eldre, Digital Senior | Atlas's *Praktiske tjenester* | add a category, or keep under `elderly_visiting` |
| **Volunteers in hospitals** (*sykehusvert*, *pasientvert*) | Røde Kors: Sykehusguide, Sykehusvert, Frivilligtjenesten ved UNN; Kirkens Bymisjon Sør-Varanger's patient hosts | — | add a category, or keep under `health_services` |

None of these has been tested in Keyword Planner. Before adding one, its search terms
(`utlån av sportsutstyr`, `bua utlån`, `utstyrssentral`, `sosialrådgivning`, `hjelp med nav`)
should be run in the next round.

## Not a service

Røde Kors (16, Atlas's own list): governance bodies, administration, volunteer recruitment,
blood donor recruitment, travel. One question: **BUA** (see gaps).

| Activity | Name | Reason |
|---|---|---|
| `frelsesarmeen:bostedsattest` | Bostedsattest | an information page about the residence certificate the unit asks for, not an activity |
| `frelsesarmeen:utleie-av-selskapslokaler-egersund` | Utleie av selskapslokaler, Egersund | venue rental |
| `kirkens-bymisjon:byparken` | Byparken | conference venue rental; the page describes no service for people |
| `kirkens-bymisjon:tekstilinnsamling` | Tekstilinnsamling | textile collection that funds the NGO's services |
| `kirkens-bymisjon:viste-strandhotell` | Viste strandhotell | hotel and conference venue; the page describes no service for people |
| `sanitetskvinnene:eldre` | Eldre | a thematic area page (group heading), not an activity |
| `sanitetskvinnene:integrering` | Integrering | a thematic area page (group heading), not an activity |
| `sanitetskvinnene:naeringsliv` | Næringsliv | guidance for chapters on working with local businesses |

`Eldre`, `Integrering` and `Næringsliv` are theme pages that `nks-activities.ts` keeps on purpose,
to preserve the site's own structure (themes vs programmes). They are themes, not services.

## Settled by R10

- **Nasjonalforeningen's "Med oss"** is its general programme of local activities, not a dementia
  programme. Its page files Gåfotball and Syng med oss under dementia (secondary `dementia_support`),
  and names a dementia café as one example of Spis med oss; Gå and Strikk med oss are for everyone.
- **Kirkens Bymisjon's own grouping is a hint, not the answer.** Its `Arbeidsinkludering` group
  holds cafés, a hotel and a conference venue as well as work training. Cafés are filed under
  `meeting_place`; the hotel and the venue describe no service for people and are not services.

## How to review

Fill `reviewed_by` and `reviewed_at` in the CSV on each row you accept. To change a mapping,
edit `M` (or `ATLAS_REDCROSS`) in `build_crosswalk.py` and rebuild. A rebuild keeps the sign-off on
every row whose activity, category and primary flag are unchanged, and drops it where the mapping
changed. The script fails if an activity on disk
has no mapping, if a mapping names an activity that is not on disk, or if a category code is
not active in `categories-v2.csv`.
