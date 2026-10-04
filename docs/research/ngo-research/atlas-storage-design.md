# Storing NGOs, chapters and activities in Atlas — so people can search across all of them

Research, 3 October 2026, against `terchris/atlas` at commit `59e8bc3` (cloned read-only) and the
live API `api-atlas.urbalurba.com`. Every Atlas claim below names the file or request it came
from. Nothing has been written to Atlas.

**The question.** A person should be able to search for an activity — *språkkafé*, *besøke
eldre*, *leksehjelp* — and get every NGO that runs it, where, without knowing which NGO to ask.
That needs all activities in one table, all NGOs in one table, and something that joins one
NGO's vocabulary to another's.

## The short answer

**Atlas already has the right tables.** One per entity, every NGO in the same table, designed in
`plans/completed/INVESTIGATE-ngo-supply-data-model.md` and published in the API:

| Table (Atlas name) | One row per | Live rows today |
|---|---|---:|
| `dim_ngo` | organisation | 11 |
| `dim_chapter` | unit at any level — national, regional, local | **0** |
| `dim_activity` | one NGO's own activity definition | **0** |
| `fact_chapter_activities` | "this chapter runs this activity" | **0** |
| `ref_atlas_service_category` | cross-NGO category (*the shared vocabulary*) | 22 |
| `chapter_kommune_coverage` | regional chapter × kommune it covers | **0** |

Row counts: `curl -s -o /dev/null -D - -H "Prefer: count=exact" "https://api-atlas.urbalurba.com/<relation>?limit=0"`, 3 Oct 2026.

So the shape you describe is right, and it is already the shape. What is missing is everything
that makes it *searchable across NGOs*:

1. **No data.** The only feed is `redcross-branches`, parked waiting for an API credential
   (`plans/backlog/PLAN-redcross-branches-private-input.md`). This research holds **4 032 units,
   200 activity definitions and 1 506 unit–activity provisions for 11 NGOs** — none of it in Atlas.
2. **No cross-NGO join.** Search across NGOs works only through `ref_atlas_service_category`.
   **Of our 200 activity definitions, 0 map to any of its 22 codes** (measured below). Without that
   mapping, "all activities in one table" is one table of 11 private vocabularies.
3. **No search.** No full-text index, no `tsvector`, no synonyms, no RPC; consumers have PostgREST
   `ilike` only. `brreg_enhet.navn ilike` with no match takes **8.96 s**
   (`plans/backlog/INVESTIGATE-parquet-duckdb-wasm-surface.md`).
4. **No "near me".** No coordinates anywhere in Atlas. (PostGIS was absent from every
   migration when this was measured; the owner has since installed it, 2026-10-04 — see §3.3.) Geography is `kommune_nr` and `dim_postnummer` only.

This document proposes what to add for each, keeping every rule Atlas already enforces.

---

## 1. The model — six tables and one search table

```
                     ref_atlas_service_category_family     (≈8 rows: "Social contact", "Beredskap"…)
                                   │
                     ref_atlas_service_category            (≈30 rows: elderly_visiting, language_practice…)
                          │                 │
       ref_atlas_service_category_term      crosswalk_activity_service_category
       (synonyms: "språkkafé",              (each NGO definition → category, with method,
        "besøksvenn", nynorsk…)              confidence, reviewed_by — hand-reviewed seed)
                                                  │
dim_ngo ──< dim_chapter ──< fact_chapter_activities >── dim_activity
 (11 →)     (self-ref        (the "where": chapter ×       (each NGO's own definitions,
            parent_chapter_id) activity, local name kept)   description text)
                │
                └── dim_chapter_contact   (published contact persons — as the NGO published them)

marts.mart_activity_search  ← ONE denormalised row per chapter × activity, with a tsvector
```

### 1.1 `dim_ngo` — organisations

Keep. Our `data/_organizations/organizations.json` uses the **same 11 slugs and organisation
numbers** as `atlas-data/dbt/seeds/dim_ngo.csv` (checked row by row). Add what the research
measured and Atlas lacks:

| Column | From | Why |
|---|---|---|
| `structure` (`federated` / `unitary`) | `Organization.structure` | Explains why a unitary NGO has few registered chapters — Frelsesarmeen's units are *underenheter*, not *enheter* |
| `legal_form` | Brreg | A `STI` has no members, hence no member chapters |
| `chapter_count` | derived | GOVERNANCE + OPERATIONAL units, excluding root, related entities, inactive |

The `icnpo_code_1..3` columns are empty for all 11 (`curl …/ngo_index?limit=2`). Our
`data/_icnpo/icnpo-assignments.csv` holds every ICNPO category of every voluntary organisation —
fill them from there, or from `dim_brreg_enhet`.

### 1.2 `dim_chapter` — every unit of every NGO, one table

Keep the existing grain and columns (`chapter_id`, `ngo_orgnr`, `chapter_level`,
`parent_chapter_id`, `chapter_orgnr`, `name`, `kommune_nr`, `is_active`, address, phone, email,
web). Add what the research found is needed to read a row correctly — SERVING-A-SOURCE §2: *"a
property a consumer must read in order to render a value correctly belongs in a column"*:

| Column | Values | Why it must be a column |
|---|---|---|
| `chapter_level` | add `related_entity` | 49 units are companies/foundations an NGO owns (Fretex, nursing homes). Never counted as chapters |
| `unit_kind` | `governance` / `operational` | Frelsesarmeen: 98 governance units (99 with the root) vs 272 counted chapters. "How many chapters" has two honest answers |
| `registration` | `legal_entity` / `sub_unit` / `unregistered` | 866 units have no organisation number — **this answers Atlas's open Q5** (regions without orgnr): a unit is a chapter whether or not it is registered; the column says which |
| `parent_method` | `url_path` / `sitemap_path` / `municipality_county` | 1 729 regional links; 166 of them inferred. Atlas's own rule: inferred edges carry their method |
| `reconciliation` | `both` / `registry_only` / `source_only` | Two independent sources agreeing is the confidence rule |
| `confidence` | `high` / `medium` / `low` | |
| `latitude`, `longitude` | numeric | For "near me" (§3.3). Only 880 of 4 032 units have them today |
| `source_url` | | Every row must be citable |

**Ids.** Atlas mints `chapter_id = 'redcross-' || branch_id` (`dim_chapter.sql`); the research
mints `redcross:<orgnr>`. Adopt Atlas's form — `<ngo_slug>-<orgnr>` where registered, else
`<ngo_slug>-<derived-slug>` — and keep a crosswalk to the Red Cross `branch_id` for when the NRX
feed arrives (join on organisation number).

### 1.3 `dim_activity` — each NGO's own definitions, one table

Keep: one row per (NGO, canonical name). This is where *"all activities are in the same table"*
holds literally — Sanitetskvinnene's *Omsorgsberedskap*, Nasjonalforeningen's *Gå med oss* and
Kirkens Bymisjon's *Aktivitetshuset* are rows in the same table. Add:

| Column | Why |
|---|---|
| `description`, `description_language` | The text a search matches against and a human reviews. Median 16 words today; only the N.K.S. catalogue has real paragraphs |
| `origin` (`national` / `local`) | 2 of N.K.S.'s 7 provided activities are defined locally, not nationally |
| `aliases` | Spellings chapters actually use — `Omsorgsber.` (300 chapters), `Språkvenn` |
| `service_category_code` | from the crosswalk (§2) — **the cross-NGO join** |

### 1.4 `fact_chapter_activities` — the "where"

Keep: one row per chapter × activity, `local_activity_name` preserved. This is the table
*"who runs språkkafé in Bergen"* is answered from. 1 506 rows from the research today (N.K.S.
649, Nasjonalforeningen 470, Kirkens Bymisjon 349, Frelsesarmeen 38), plus the Red Cross
feed when it lands — PLAN-002 loaded 1 941 fact rows from the April dump.

### 1.5 `dim_chapter_contact` — the people to contact

One row per contact person a chapter publishes: `chapter_id`, `role`, `given_name`,
`family_name`, `phone`, `email`, `source_url`, `is_masked`. 3 550 today. Its own table, so a
chapter row never carries a person and a person can be suppressed without touching the chapter.

**Decision 3 Oct 2026 (owner):** contact persons an NGO publishes are stored and served — they
published their details to be contacted, which is what Kari and Amira need
(`personas.md`). The owner carries the legal responsibility; the rules that make the decision
safe to implement — only as published, with the page URL, removed when the page removes them —
are in `scraping-practice.md`. Atlas's scraping rule §D.3 needs the matching amendment.
The 542 N.K.S. names are malformed (known defect) and are re-parsed before export.

---

## 2. The cross-NGO vocabulary — the part that makes search work

Measured 3 Oct 2026: every activity definition in `data/*/activities.json` checked against
`seeds/ref_atlas_service_category.csv`:

| | definitions | with an Atlas category |
|---|---:|---:|
| Kirkens Bymisjon | 144 | 0 (carries KB's own 9 codes: `arbeidsinkludering`, `rusomsorg`, `eldre`…) |
| Frelsesarmeen | 36 | 0 |
| Sanitetskvinnene | 14 | 0 |
| Nasjonalforeningen | 6 | 0 |
| **total** | **200** | **0** |

The 22 codes were derived from the Red Cross catalogue (`supply__redcross_branch_activities.sql`
hard-codes the mapping in a `CASE`), and it shows: activities other NGOs run at scale have no
code at all:

| Missing category | Examples in the data |
|---|---|
| Physical activity / walking groups | *Gå med oss*, *Gåfotball*, *Kløvertur* (198 N.K.S. chapters), *Kom-som-du-er-trimmen* |
| Social meeting place / kafé | *Spis med oss*, *Åpen kafé*, *Kvinnekafé*, *Formiddagstreff*, *Aktivitetskafé* |
| Dementia support | *Demensvennlig med oss* |
| Addiction support | *A-senteret*, *Berørt av rus* |
| Work inclusion | *Arbeid Ute*, *Enter jobb*, *Aktivitetsplikten* |
| Emergency overnight shelter | *Akuttovernatting* (≠ `crisis_shelter`, which is krisesenter) |
| Reading friend | *Lesevenn* (48 chapters) |
| Music / choir | Frelsesarmeen's korps and kor |
| Crisis-preparedness groups | *Omsorgsberedskap* (300 chapters — the most widespread activity in the data) |

And the words people type are not the category labels: `language_practice` is labelled
*Norsktrening*; nobody searches that, they search *språkkafé*. Kari in `personas.md` *"doesn't
know the word Besøkstjeneste"*.

**Recommendation — this is Atlas's open Q4** (`plans/backlog/INVESTIGATE-semantic-foundation-before-expansion.md`):

1. **Extend `ref_atlas_service_category` to ≈30 codes and add a `family` level** — the outcome
   that investigation already names as likely. The table above is the evidence for which codes.
2. **Move the mapping out of SQL into a seed**: `crosswalk_activity_service_category.csv` —
   `activity_id, service_category_code, is_primary, method (manual / rule / ai_assisted),
   confidence, reviewed_by, reviewed_at`. Atlas's `crosswalk_*` prefix exists for exactly this.
   At 200–2 600 rows it is small enough that every row is human-reviewed — the research's
   `serviceCategory` field already carries method and confidence for this.
3. **Add `ref_atlas_service_category_term`** — `code, term, language (nb/nn/en), kind (label /
   synonym / lay)`: *språkkafé*, *språkvenn*, *norsktrening* → `language_practice`;
   *besøksvenn*, *besøke eldre*, *ensomme eldre* → `elderly_visiting`. Nynorsk is not mentioned
   anywhere in Atlas today; this is where it goes. The terms feed the search vector (§3), so
   synonyms work without a database thesaurus file — which a managed Postgres would not let you
   install anyway.
4. **Keep each NGO's own name.** The category is *added*, never a replacement — Atlas's rule
   that upstream values are published as upstream publishes them.

Atlas decided one category per activity (Q34). `is_primary` keeps that for counting while letting
*Aktivitetshuset* — a multi-purpose house — also be found under its secondary categories.

---

## 3. Search — one table built for it

### 3.1 `mart_activity_search`

One denormalised row per **chapter × activity**, rebuilt by dbt, published as
`api_v1.activity_search`:

| Column | |
|---|---|
| `chapter_id`, `chapter_name`, `chapter_level` | |
| `ngo_orgnr`, `ngo_name`, `ngo_brand_name` | |
| `activity_id`, `activity_name`, `local_activity_name` | the NGO's words |
| `service_category_code`, `service_category_label`, `family_code` | the shared words |
| `kommune_nr`, `kommune_name`, `fylke_nr` | |
| `latitude`, `longitude` | where known |
| `search_vector` | `tsvector` |

```sql
setweight(to_tsvector('norwegian', activity_name || ' ' || coalesce(local_activity_name,'')), 'A') ||
setweight(to_tsvector('norwegian', service_category_label || ' ' || <all terms for the code>), 'A') ||
setweight(to_tsvector('norwegian', ngo_name || ' ' || chapter_name), 'B') ||
setweight(to_tsvector('norwegian', coalesce(activity_description,'')), 'C')
```

with a GIN index added by post-hook (Atlas's documented way to add an index to a model).

**No extension and no RPC are needed for this.** `norwegian` is a text-search configuration
built into PostgreSQL, and PostgREST filters a `tsvector` column directly:

```
GET /activity_search?search_vector=wfts(norwegian).språkkafé&kommune_nr=eq.4601
GET /activity_search?search_vector=wfts(norwegian).besøke eldre&fylke_nr=eq.46
GET /activity_search?service_category_code=eq.homework_help&kommune_nr=eq.0301
```

That matters because adding to `api_v1` is a published contract and waits for a human: a new
view is one decision; a new RPC function is a second, larger one.

### 3.2 One search box for everything

If the frontend wants a single box across NGOs, chapters *and* activities, add
`mart_search` with an `entity_type` column (`ngo` / `chapter` / `activity`) and the same
`search_vector` — one row per entity, not per pair. `activity_search` answers *"what and where"*;
`search` answers *"is there anything called…"*.

### 3.3 "Near me" — in two steps

1. **Now, by kommune.** Postnummer → `kommune_nr` already exists in `dim_postnummer`. A regional
   chapter's reach is in `chapter_kommune_coverage`. Covers the 69% of units with a kommune.
2. **By distance, with PostGIS** (installed in Atlas's Postgres by the owner, 2026-10-04). Store a
   `geography(Point, 4326)` per unit with a GiST index, and expose a function
   `search_nearby(q, lat, lon, radius_km)` ordered by `ST_Distance`, filtered by `ST_DWithin`.
   Every point carries `location_precision` — `exact` (an address the NGO publishes for the unit),
   `postal_code` (a Brreg address, deliberately placed only at its postal-code area, because a small
   chapter's registered address is often a volunteer's home), `kommune` (centroid) — so a consumer
   never presents a postal-code point as a doorstep. Coverage today: 880 of 4 032 units have
   coordinates, 547 more have a street address to geocode (Kartverket's open address API), 3 089
   have a Brreg address; geocoding is task R9 in `PLAN-remaining-work.md`.

Typo tolerance (`språkafe`) needs `pg_trgm`, an extension the platform must create. Atlas's
backlog already proposes `pg_trgm` for `brreg_enhet.navn`; the same decision covers this.

---

## 4. Getting the research data in, inside Atlas's rules

Atlas's rules that bind this (`CLAUDE.md`, `docs/stack/naming-conventions.md`,
`website/docs/ai-developer/AGENT-onboard-source.md`):

- `raw.*` is verbatim upstream, append-only migrations, never altered.
- Transformations are derivations recorded **beside** source columns, in dbt — never edits.
- If a source is ingested it must be served, and a deploy is not done until rows arrive.

**The tension.** The research's `chapters.json` is not verbatim upstream. It is already
*reconciled*: a Brreg row and a website page joined into one chapter, a parent inferred, ids
minted. Loading it as `raw.*` would put derivations where Atlas promises source data.

**Two ways, in order:**

| | How | Honest about |
|---|---|---|
| **Phase 1 — one research source** | `raw.atlas_ngo_research_units (unit_id, doc jsonb)` and `…_activity_definitions`, landing `data/*/chapters.json` and `activities.json` as they are — the same `(key, doc jsonb)` pattern as `raw.brreg_enheter_snapshot`. dbt unpacks into the existing dims. The source's README states it is a *derived* dataset and that every derived field carries its method (`matchMethod`, `parentMethod`, `reconciliation`, `confidence`). | Gets 3 955 units searchable quickly; the derivations are recorded beside the values, which is Atlas's rule — but they happen outside dbt |
| **Phase 2 — one source per website** | Each extractor (`nks-chapters`, `site-chapters`, `kirkens-bymisjon-tilbud`…) becomes an Atlas ingest source landing what the page said, verbatim. Reconciliation moves into dbt as `int_` models. | The principled form. Needs the crawl and registry intermediate files kept — today they are not on disk (`ingest/README.md`) |

Phase 1 keeps the existing `supply__<ngo>_*` → `UNION ALL` pattern: one `supply__research_*`
model per entity alongside `supply__redcross_*`.

**Licence, before anything is published.** `dim_chapter`'s description says *"Atlas holds NO
republication licence… ask Røde Kors"*, while `PLAN-redcross-branches-private-input.md` records
the data as cleared on 2026-08-25. The research crawled ten other NGOs' sites; N.K.S. has no
NLOD licence and a courtesy mail is still pending. Each NGO's terms need a line in the source
README before its rows reach `api_v1`.

---

## 5. What this research hands Atlas

| Atlas gap | Delivered here |
|---|---|
| Chapters for 10 NGOs beyond Red Cross | `data/<org>/chapters.json` — 4 032 units, schema-validated, 1 729 regional links with method |
| Q5 — units without orgnr | `registration` + `unit_kind` + synthesised tier rows marked `unregistered` |
| Activity definitions with text | `data/<org>/activities.json` — 200 definitions |
| Provisions | 1 506 chapter × activity rows |
| ICNPO for every voluntary org | `data/_icnpo/icnpo-assignments.csv` — 95 008 rows |
| Evidence for Q4 (taxonomy) | §2 above + `activity-taxonomy.md`, `classification-systems.md` |
| Observed aliases | `aliases` on definitions |

**Not delivered, and needed:** the ≈30-code category list, its synonym terms, and the 200-row
crosswalk. That is human review work — the research can propose the first draft
(`serviceCategory.method = AI_ASSISTED`), but `reviewed_by` has to be a person.

## 6. Decisions for a human

1. **Q4:** extend `ref_atlas_service_category` to ≈30 codes + families, with a reviewed crosswalk seed? (Recommended.)
2. **Phase 1 research source** as `(key, doc jsonb)` raw tables, documented as derived? Or wait for per-website sources?
3. **New `api_v1` relation** `activity_search` (and optionally `search`) — a published-contract addition.
4. **`pg_trgm`** on the platform — shared with the `brreg_enhet.navn` fix already in the backlog.
5. **Contacts** — decided 3 Oct 2026: published contact persons are served, in their own table; amend Atlas §D.3.
6. **Licence line per NGO** before its rows are served.

## Measurements behind this document

Run 3 Oct 2026 in this repository and against the cloned Atlas checkout:

- Category coverage: every `data/*/activities.json` definition's `serviceCategory.code` tested for
  membership in `seeds/ref_atlas_service_category.csv` → 0 of 200.
- Units, levels, registration, coordinates, kommune, provisions: counted over `data/*/chapters.json`
  → 3 955 / 548 with coordinates / 2 716 with kommune / 1 506 provisions on 975 units.
- Live API: OpenAPI at `https://api-atlas.urbalurba.com/` (91 relations, no `/rpc/`), row counts
  with `Prefer: count=exact`.
- Atlas file references are to `terchris/atlas` at `59e8bc3`.
