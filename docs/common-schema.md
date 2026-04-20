# Common schema — chapter, organisation, profile, indicator

Formal data model for a multi-NGO Norwegian civil-society app. Synthesises what we've discovered across 11 organisations (4 Tier A with activities+matrix, 7 Tier C with profiles).

Pairs with:
- `goal.md` — product framing
- `ngo-landscape.md` — sector map and structural-fit tiers
- `{org}-activities.md` — Tier A activity catalogues (RC, NF, N.K.S., Nasjonalforeningen)
- `{org}-activity-indicator-matrix.md` — Tier A framework-validation artefacts
- `{org}-profile.md` — Tier C reference profiles (NRC + 6 so far)

Version: draft 2026-04-20. Not frozen. Expected to evolve as more orgs are added.

---

## Why this doc exists

Four orgs through the full activities+matrix treatment and seven through profile showed that a multi-NGO platform needs a data model that is:

1. **Heterogeneous-tolerant** — RC has a live API with canonical activity IDs; NF has a scrapable 6-bin CMS; Nasjonalforeningen has no per-chapter activity data at all; NRC has no chapters at all. The schema must accommodate all four shapes.
2. **Extensible, not fixed** — N.K.S. adds an `institutions` sub-array; Nasjonalforeningen adds a `chapter_type` enum; Sanitetskvinnene adds gender-filterable indicators. These aren't one-off hacks; they're the fourth-to-seventh entity each org adds.
3. **Kommunenummer-anchored** — every Norwegian need-indicator pipeline we've validated (SSB, FHI, Bufdir, IMDi, DSB, FHI) joins on `kommunenummer`. If chapters (or the orgs themselves) resolve cleanly to kommuner, 80+ sources unlock.
4. **Honest about shape differences** — RC activity = chapter × (canonical_id, local_name). NF activity = chapter × CMS_bin. Nasjonalforeningen "activity" = programme × chapter_type, not per-chapter at all. The schema records which shape applies per org.

---

## Entity map

Five core entities:

```
Organisation   ─┬─ Chapter ──┬─ Activity (canonical or local)
                │            └─ Institution (optional)
                ├─ Profile   (Tier C orgs, no chapters)
                └─ Pathway   (volunteer / donate / member / campaign / employment)

Indicator      (kommune-level open data, joined to Chapter via kommunenummer)
```

Organisation is the root. Everything attaches to it.

---

## Organisation

```typescript
Organisation {
  // Identity
  orgnr: string                    // 9 digits, Brreg primary, required
  name: string                     // legal name from Brreg
  brand_name: string?              // if different (Sanitetskvinnene vs N.K.S., Flyktninghjelpen vs NRC)
  website_url: string
  founded_iso: date                // Brreg stiftelsesdato
  legal_form: "FLI" | "STI" | "AS" | "SA" | "FKF" | "ORGL"

  // Mission
  mission_short: string            // one-line pitch
  primary_focus: "humanitarian" | "health" | "social" | "youth" | "environment"
                 | "civic" | "patient_support" | "faith_adjacent" | "service_club"
  secondary_focuses: string[]      // e.g. ["beredskap", "migrasjon"] for RC

  // Structural-fit tier (from ngo-landscape.md)
  tier: "A" | "B" | "B-minus" | "C-donor" | "C-petition" | "C-industry" | "C-quasigovernmental"
  tier_reasoning: string           // one-line justification
  // Tier C sub-categories discovered during profile research (2026-04-20):
  // - C-donor (NRC, KN, SOS, UNICEF, LUG, CARE, Plan, Regnskogfondet): donate-only, fadder/monthly-giver model
  // - C-petition (WWF, Amnesty, Naturvernforbundet): donate + flagship campaign-action pathway
  // - C-industry (Bellona, ZERO): corporate-partnership dominant, minimal donor/member base
  // - C-quasigovernmental (Norsk Luftambulanse): state-contracted operations in a sibling AS, donor foundation as advocacy + fundraising wing
  // Also observed: "institutionally-mediated mass engagement" (Kirkens Nødhjelp Fasteaksjonen runs through DNK menigheter) — a shape between C and B that may warrant a fifth sub-category if more orgs show it

  // Scale (latest reported year)
  scale: {
    central_employees: number
    global_employees: number?      // for orgs with international operations
    volunteers_active: number?
    members: number?               // note: "fadder" is not the same as member — see below
    supporters: number?            // fadder + donors with ongoing relationship
    chapter_count: number?         // null for Tier C
    institution_count: number?     // null unless org has institutions sub-array
    income_nok: number
    income_year: number
  }

  // Funding composition (latest reported year, ideally 2024)
  funding: {
    // From tilskudd.lottstift.no (retrospective registry)
    state_grants_lottstift_nok: number?

    // From annual report — framework agreements + sector-ministry contracts OUTSIDE Lottstift
    state_via_ministries_nok: number?    // Norad, Justis, Helse, etc.

    // Private
    fadder_nok: number?                  // sponsor-a-child model
    monthly_giver_nok: number?
    one_time_giver_nok: number?
    arv_testament_nok: number?

    // Other
    corporate_nok: number?
    eu_international_nok: number?
    postkodelotteriet_nok: number?

    // Derived metrics
    gov_funding_share: number?           // (lottstift + ministries) / total
    private_share: number?
    share_to_cause_pct: number?
    fundraising_cost_share_pct: number?
    methodology_note: string?            // because 4 defensible share-to-cause numbers is common
  }

  // Engagement pathways supported
  pathways: {
    volunteer: boolean
    donate: boolean
    member: boolean
    campaign_action: boolean            // added for Solidaritetsungdom, Amnesty, Naturvernforbundet, WWF
    employment: boolean                 // true for everyone, but flagged prominent for MSF
    pathway_notes: string?              // e.g. "member gated to field-veterans (MSF)"
  }

  // Chapter structure
  has_chapters: boolean                 // false for Tier C
  chapter_type_enum: string[] | null    // for bifurcated orgs: ["helselag", "demensforening", "combined", "other"]
  chapters_url_pattern: string?         // where we scrape / fetch
  chapter_data_shape: "api_canonical" | "cms_bins" | "programme_only" | "no_structure"
    // RC = api_canonical, NF/NKS = cms_bins, Nasjonalforeningen = programme_only, NRC = no_structure

  // Institutions sub-structure (N.K.S., Frelsesarmeen, Kirkens Bymisjon pattern)
  has_institutions: boolean
  institutions_tier1_count: number?     // separate legal entities (AS/STI)
  institutions_tier2_count: number?     // operated inside FLI chapters

  // Indicator bundle
  indicator_bundle_tags: string[]       // which indicator extensions apply:
                                        // ["common", "gender_filter", "disease_hjerte", "disease_demens"]
  // Governance
  ceo_name: string
  ceo_since: date
  board_chair_name: string
  board_chair_since: date

  // Source attribution
  last_verified: date
  sources: string[]                     // URLs cited
}
```

### Notes on fields

- **`orgnr`**: the universal primary key. Same format across Brreg, Lottstift, Grasrotandelen, Regnskapsregisteret.
- **`share_to_cause_pct`** requires a `methodology_note`. Four defensible numbers per org is common.
- **`chapter_data_shape`** is the single most important shape field. Drives how the scraper, finder, and matrix work for that org.

---

## Chapter

```typescript
Chapter {
  // Identity
  chapter_id: string                    // stable internal key
  parent_orgnr: string                  // → Organisation
  own_orgnr: string?                    // if chapter is separately registered

  // Naming
  name: string                          // local display name, e.g. "Arendal Røde Kors"
  brand_prefix_stripped_name: string?   // e.g. "Arendal" for nicer rendering
  chapter_type: string?                 // from Organisation.chapter_type_enum

  // Geography — kommunenummer is the universal join key
  location: {
    kommune: string
    kommunenummer: string               // 4 digits, SSB Klass 131
    fylke: string
    fylkesnummer: string
    region: string?
    coordinates: [lon: number, lat: number]  // GeoJSON
    postal_address: Address?
    visiting_address: Address?
  }

  // Lifecycle
  creation_date_iso: date
  termination_date_iso: date?
  status: "active" | "dormant" | "terminated"
  in_frivillighetsregisteret: boolean
  registered_employees: number          // Brreg antallAnsatte — 0 for most

  // Contacts
  contacts: Contact[]

  // Activities — shape varies per Organisation.chapter_data_shape
  activities_api: {                     // for chapter_data_shape = "api_canonical" (Red Cross)
    global_activity_id: string
    local_activity_id: string
    activity_name: string
    canonical_name: string?             // resolved via lookup
  }[] | null

  activities_bins: string[] | null       // for chapter_data_shape = "cms_bins" (NF, N.K.S.)

  // Programmes mapping (for chapter_data_shape = "programme_only" — Nasjonalforeningen)
  // No per-chapter activities; programmes attach at Organisation level

  // Institutions (for orgs where has_institutions = true — N.K.S.)
  institutions: Institution[]           // empty array for most chapters

  // Scrape / API provenance
  data_source: "api" | "scrape_html" | "scrape_json" | "brreg_only"
  last_verified: date
  raw_url: string?                      // where the chapter data came from
}
```

```typescript
Address {
  address_line_1: string
  address_line_2: string?
  postal_code: string                   // 4 digits
  post_office: string
}

Contact {
  role: string                          // "Leder", "Nestleder", "Koordinator"
  first_name: string
  last_name: string
  email: string?
  phone: string?
  is_volunteer: boolean
  is_member: boolean
  pii_masked: boolean                   // RC's privacy flag
  scope: "chapter" | "activity"         // chapter-leader vs per-activity coordinator
  activity_tag: string?                 // if scope = "activity"
}
```

---

## Institution

Only applies when `Organisation.has_institutions = true`.

```typescript
Institution {
  institution_id: string                // internal key
  parent_orgnr: string                  // → Organisation
  parent_chapter_id: string?            // nullable — central-level institutions have no parent chapter

  // Type taxonomy
  type: "psykiatrisk_sykehus" | "dps" | "sykehjem" | "barnehage" | "hospice"
      | "avlastning" | "kvinnehelsehus" | "helsestasjon" | "kurssenter" | "other"
  name: string

  // Legal structure
  separate_legal_entity: boolean        // true for Tier 1 institutions (own org.nr)
  own_orgnr: string?                    // e.g. NKS Olaviken AS 987554401

  // Scale
  employee_count: number?
  location: Location?                   // same shape as Chapter.location
}
```

Tier distinction matters:
- **Tier 1** (separate legal entity, own orgnr) — enumerable via Brreg
- **Tier 2** (operated inside FLI chapter, no separate orgnr) — only discoverable via chapter page scrape

---

## Profile (Tier C orgs)

When `Organisation.has_chapters = false`, we substitute a Profile — the lightweight shape used for donate-first orgs. Holds everything Organisation holds plus:

```typescript
Profile {
  // ...all Organisation fields plus:

  programmes: {
    name: string                        // "Education", "ICLA", "Shelter", "WASH", "Protection", etc.
    description: string
    geographic_scope: "domestic" | "international" | "both"
  }[]

  countries_operating_in: string[]      // ISO 3166 alpha-3 country codes
  top_donors_2024: {
    donor_name: string
    share_pct: number
    category: "norwegian_state" | "foreign_state" | "un" | "eu" | "foundation" | "private" | "corporate"
  }[]
  share_to_cause_note: string           // explicit methodology because of known variance
}
```

Tier C orgs have no `Chapter[]` — the Profile IS the entity, and it links directly to Indicator data at the aggregate level (not kommune).

---

## Activity (canonical)

Each Organisation owns its activity taxonomy. The taxonomy *shape* depends on `Organisation.chapter_data_shape`.

```typescript
Activity {
  activity_id: string
  parent_orgnr: string                  // → Organisation
  canonical_name: string                // "Hjelpekorps", "Flyktningguide" (RC) or "Sanitet" (NF) or "Omsorgsberedskap" (NKS)
  canonical_key: string                 // stable machine key (slug or UUID for RC)
  description: string
  target_population: string
  chapter_type_scope: string[]?         // restrict to specific chapter_types (e.g. demensforening only)

  // Mapping to indicators
  indicator_tags: string[]              // which indicators this activity binds to for need-overlay
}
```

### Activity-vocabulary shapes we've observed

| Shape | Orgs | Characteristics |
|---|---|---|
| **api_canonical** | Red Cross | Stable GUID per canonical activity + chapter-local name per instance. 48 canonical IDs, 2 407 local names. |
| **cms_bins** | Norsk Folkehjelp, N.K.S. | 6–7 fixed tags in CMS, applied per chapter. Cleaner schema, less fidelity. |
| **programme_only** | Nasjonalforeningen | No per-chapter tagging at all. Programmes bind to `chapter_type` at the Organisation level. |
| **no_structure** | NRC + all Tier C | Programmes listed at org level; no chapter breakdown. |

---

## Indicator

Kommune-level need signals. These join to Chapter via `kommunenummer`.

```typescript
Indicator {
  indicator_id: string                  // stable key
  name: string                          // human label
  description: string
  category: "demographic" | "health" | "social" | "economic" | "migration"
          | "safety" | "environment" | "education" | "governance"
  source: {
    name: string                        // "SSB 07459", "FHI Folkehelsestatistikk", "Bufdir Barnefattigdom"
    url: string
    api_endpoint: string?
    format: "json" | "json_stat2" | "csv" | "xlsx" | "html_scrape" | "pdf"
    auth_required: "none" | "free_key" | "registration" | "agreement"
  }
  granularity: "N" | "F" | "K" | "B" | "region"   // national, fylke, kommune, bydel, hazard_region
  update_frequency: "annual" | "biennial" | "monthly" | "continuous" | "triennial"
  direction: "higher_is_more_need" | "lower_is_more_need" | "mixed"

  // Filterability
  gender_filterable: boolean
  age_filterable: boolean

  // Derivation
  derived: boolean
  derivation_formula: string?           // e.g. "SSB 07459 (65+) × FHI age-stratified prevalence rate"

  // Activity binding
  activity_tags: string[]               // which canonical activities this indicator serves across orgs
  extension_origin: "common_bundle" | "gender_filter" | "disease_hjerte" | "disease_demens"
                  | "institutions_coverage" | "advocacy_proxy"

  // Reusability flag
  reusable_beyond_origin_org: boolean   // true if useful for other NGOs too (6 of N.K.S.'s 9 are)
}
```

### The common-bundle 8 pipelines

From the RC + NF matrices, eight indicators cover ~85% of activity-need mappings. These are the indicator set every multi-org instance must support:

1. SSB 07459 — Population by age/sex (kommune, annual)
2. SSB 06070 — Household composition including single-person 65+ (kommune, annual)
3. Bufdir Barnefattigdom monitor (kommune + bydel + delbydel Oslo, annual)
4. Bufdir Barnevern monitor (kommune + bydel, annual)
5. IMDi bosettingstall (kommune, daily)
6. FHI Folkehelsestatistikk + Oppvekstprofil (kommune + bydel, biennial)
7. DSB Kommuneundersøkelsen (kommune, annual)
8. SSB Klass 128 Sentralitetsindeks (kommune, updated at kommune mergers)

### Extensions observed so far

| Extension | Introduced by | Indicators | Reusability |
|---|---|---|---|
| **Gender-filter layer** | N.K.S. | 6 indicators (ungdata kvinner, kjønnsfordelt ensomhet, krisesenter, Kripos voldsutsatt, aleneboende ungdom, innvandrerkvinner) | Any gender-focused org |
| **Disease-hjerte pipelines** | Nasjonalforeningen helselag | FHI Hjerte- og karregisteret, Folkehelseprofil hjerte-components, Dødsårsak CV subset | LHL, Diabetesforbundet (partial) |
| **Disease-demens pipelines** | Nasjonalforeningen demensforening | Derived prevalence (SSB × FHI rates), Folkehelseprofil kjønnsfordelt ensomhet | N.K.S. Lesevenn, any elderly-focused org |
| **Institution-coverage indicators** | N.K.S. | KOSTRA sykehjems-/barnehagedekning | Frelsesarmeen, Kirkens Bymisjon, Kreftforeningen |
| **Advocacy proxy** | NF Solidaritetsungdom | Valgdeltakelse, AUF/SU/Rød Ungdom density (partial) | Amnesty, Natur og Ungdom |
| **Age-stratified base** | Nasjonalforeningen | Population 65+/75+/85+ + projections to 2050 | All elderly-focused orgs |

---

## Pathway

```typescript
Pathway {
  pathway_id: string                    // stable key
  parent_orgnr: string                  // → Organisation
  type: "volunteer" | "donate" | "member" | "campaign_action" | "employment"
  label_nb: string                      // "Gi tid", "Gi penger", "Bli medlem", "Ta et standpunkt"
  label_en: string?
  chapter_scoped: boolean               // true = deep-link with chapter pre-filled; false = org-level

  // Deep-link template
  url_template: string                  // e.g. "https://mittrodekors.no/innmelding?chapter={chapter_id}"

  // Restrictions (edge cases)
  restriction_note: string?             // e.g. "members must have served as field personnel" (MSF)
}
```

Five pathway types cover everything observed across the 11 orgs:

- **volunteer** — tid, typically chapter-scoped (RC, NF, N.K.S., Speiderforbundet, RS)
- **donate** — penger, always in scope, chapter-scoped if the org has Grasrotandelen-eligible chapters
- **member** — medlemskap, org-level (sometimes chapter-scoped)
- **campaign_action** — petition/standpunkt, org-level, only for advocacy-adjacent orgs (Amnesty, WWF, Natur og Ungdom, Naturvernforbundet, Solidaritetsungdom)
- **employment** — not strictly a pathway, but prominent for MSF because of their restricted-member model

---

## Relationships summary

- `Chapter.parent_orgnr` → `Organisation.orgnr`
- `Chapter.institutions[].parent_orgnr` → `Organisation.orgnr`
- `Institution.parent_chapter_id` → `Chapter.chapter_id` (nullable)
- `Activity.parent_orgnr` → `Organisation.orgnr`
- `Chapter.activities_api[].canonical_key` → `Activity.canonical_key`
- `Pathway.parent_orgnr` → `Organisation.orgnr`
- `Chapter.location.kommunenummer` — joins to all `Indicator` values for that kommune

---

## What the schema does NOT cover (deliberate)

- **Per-chapter member rolls** — private information, not public
- **Volunteer shift schedules** — internal to each NGO's operational tool
- **Financial transactions** — we deep-link to Vipps / Grasrotandelen / Spleis, we don't process
- **Crisis intake** — we signpost to helplines; no triage
- **Event calendars** — flagged as an extension for Samfunnsarbeid bin specificity, not in core

---

## Open questions to resolve before committing

1. **`chapter_data_shape` vs `chapter_type`** — are these orthogonal? `chapter_data_shape` is how activities are structured (api vs cms_bins vs programme_only). `chapter_type` is the enum (helselag vs demensforening) for bifurcated orgs. Yes, orthogonal. An RC chapter has shape=api_canonical, no chapter_type. A Nasjonalforeningen helselag has shape=programme_only, chapter_type=helselag.

2. **Canonical activity resolution across orgs** — when Kari searches for "visit lonely elderly" activities across all orgs, we need a **cross-org canonical taxonomy**. Right now each org has its own (RC Besøkstjeneste, N.K.S. Omsorgsberedskap, Nasjonalforeningen Aktivitetsvenn). A sector-wide meta-taxonomy (`cross_org_canonical = "elderly_visiting_scheme"`) is needed for the Activity Atlas feature. Not in v1 core.

3. **Pathway deep-link reliability** — each org's deep-link schema can change without notice. Need a per-org config with smoke tests.

4. **Historic chapter lifecycle** — RC has 217 terminated chapters with creation+termination dates; N.K.S. goes back to 1896. Time-travel mode uses this. Other orgs' historical data is thinner. Accept asymmetry; display what's available.

5. **Funding year-mismatches** — Brreg data is point-in-time; Innsamlingskontrollen is calendar-year; Lottstift is fiscal allocations; Plan is Jul–Jun fiscal. Schema should label `income_year` and `funding_year` explicitly; avoid cross-year averaging.

6. **Redd Barna's "20 lokallag + 5 HQ regions"** — the regions don't have own org.nr, so they're not Chapter entities by the schema. But they're real operational units with 237 employees and real regional work. Either model regions as a separate entity, or stretch Chapter to include "HQ-administered region" shape. Flag as TBD.

---

## Minimum viable schema for v1

Not every field needs to be populated on day one. For v1 MVP, the required fields are:

- **Organisation**: orgnr, name, tier, has_chapters, chapter_data_shape, pathways, scale.chapter_count, scale.income_nok
- **Chapter** (if has_chapters): parent_orgnr, own_orgnr?, name, kommunenummer, coordinates, status
- **Activity**: parent_orgnr, canonical_name, indicator_tags
- **Indicator**: just the common-bundle 8
- **Pathway**: type, label_nb, url_template

Everything else — institutions, disease-specific indicators, historical lifecycle, Profile for Tier C, gender-filtering — comes online incrementally as we expand coverage.
