# What Atlas should change — proposals from the NGO research

3 October 2026. Atlas's NGO model (`dim_ngo`, `dim_chapter`, `dim_activity`,
`fact_chapter_activities`, `ref_atlas_service_category`) was designed in April 2026 from one
NGO's data — Røde Kors's activity API — and has never held a row. This research has since
measured eleven NGOs from three kinds of source. Where the two disagree, the model is what should
move. Each proposal states the evidence, the change, and when it should land.

Counts are from `data/*/chapters.json` and `activities.json` (local + regional units unless
said otherwise) and from `terchris/atlas@59e8bc3`.

## Ranked

| # | Proposal | Why it matters | Lands with |
|---|---|---|---|
| P1 | Ingest Brreg **underenheter** | Atlas cannot see the local units of the two unitary NGOs | new source, before PR 2 |
| P2 | **Taxonomy**: ≈30 categories + families, synonyms, many categories per activity | Cross-NGO search is impossible without it; 0 of 200 definitions map today | PR 2 |
| P3 | **Programme activities**: an activity defined once, applying to every chapter of a type | 7 of 11 NGOs publish no per-chapter activities, yet what their chapters do is known | PR 2 |
| P4 | **Identity resolution across sources** instead of one supply model per NGO | Every NGO has 2–3 sources; UNION ALL double-counts | before a second source of any NGO |
| P5 | **Lifecycle status**: active / dormant / dissolved | 21 dormant chapters are not the 4 dissolved ones | PR 2 or 3 |
| P6 | **Several kommuner per local chapter** | 182 local chapters name several places | PR 3 (search needs it) |
| P7 | **Non-geographic units** labelled, not mapped | 34 youth wings and diagnosis groups placed by a registered address | PR 2 |
| P8 | **Correct `dim_ngo.chapter_data_shape`**, or move it to the source | wrong for 7 of 11 | PR 2 |
| P9 | **Three clocks** on every supply row | `updated_at` means load time, which a consumer reads as "current as of" | PR 3 |
| P10 | **Published contact persons** as their own table | Kari and Amira need a person to call; §D.3 forbids it today | after the N.K.S. re-parse |
| P11 | **Deeper hierarchy** without new levels | 52 Røde Kors hjelpekorps sit under a lokalforening | when NRX lands |
| P12 | **Separate the NGO-facing standard** from Atlas's aggregation fields | prerequisite for inviting NGOs to publish | before the standard |
| P13 | **Location with a stated precision**, in PostGIS | "near me" needs a point for every unit; a registry address is often a volunteer's home | with PR 3 |

---

### P1 — Ingest Brreg `underenheter`

**Evidence.** Frelsesarmeen and Kirkens Bymisjon are unitary: their local units are registered as
*underenheter* (form BEDR) of one national entity, not as *enheter*. Searching `enheter` finds
Frelsesarmeen as **1** row and Kirkens Bymisjon as **3**; `underenheter` reached through
`overordnetEnhet` gives **175** and **151** — 326 units with no name matching at all, precision
100% by construction. Atlas ingests `enheter` only (`brreg-enheter-alle`, `brreg-oppdateringer`);
no source or migration mentions `underenheter`.

**Change.** A `brreg-underenheter` source on the same pattern as `brreg-enheter-alle` (Brreg
publishes the bulk file and a change feed for both). Then `dim_brreg_enhet` — or a sibling
`dim_brreg_underenhet` — joins to `dim_chapter.chapter_orgnr` for `registration = 'sub_unit'`.
This is Norwegian public data under NLOD; it helps every unitary organisation, not just these two.

### P2 — Taxonomy that can carry eleven NGOs

**Evidence.** `ref_atlas_service_category` has 22 codes derived from Røde Kors's catalogue (the
mapping is a hard-coded CASE in `supply__redcross_branch_activities.sql`). **0 of the research's
200 definitions map to it.** Missing categories, each with the activities that need it:
walking/physical activity (*Gå med oss*, *Gåfotball*, *Kløvertur* in 198 N.K.S. chapters), meeting
places (*Spis med oss*, *Åpen kafé*, *Formiddagstreff*), dementia support, addiction support
(*A-senteret*, *Berørt av rus*), work inclusion (*Enter jobb*, *Arbeid Ute*), emergency overnight
shelter (≠ `crisis_shelter`), reading friend (*Lesevenn*, 48 chapters), music and choirs,
crisis-preparedness groups (*Omsorgsberedskap*, 300 chapters — the most widespread activity in the
data). And the labels are not the words people type: `language_practice` is *Norsktrening*;
people search *språkkafé*.

**Change.**
- `ref_atlas_service_category` ≈30 codes plus `ref_atlas_service_category_family` (≈8).
- `ref_atlas_service_category_term` — `code, term, language (nb/nn/en), kind (label/synonym/lay)`.
  Nynorsk appears nowhere in Atlas today.
- `crosswalk_activity_service_category` (seed) replacing the CASE — `activity_id,
  service_category_code, is_primary, method, confidence, reviewed_by`. Every row human-reviewed.
- **Revisit Q34** ("multi-category junction if 5+ activities need it"): multi-purpose units —
  Kirkens Bymisjon's *Aktivitetshuset*, *Bymisjonssenteret*, Frelsesarmeen's *korps* — serve
  several categories each. `is_primary` keeps single-category counting; the crosswalk keeps the
  rest findable.

### P3 — Programme activities

**Evidence.** 4H (591 klubber), Speiderforbundet (387 grupper), LHL, Diabetesforbundet and Mental
Helse publish **no** per-chapter activity list — but every 4H klubb runs 4H club activity, every
speidergruppe runs scouting by age branch  and LHL  Diabetesforbundet and Mental Helse describe
their lokallag's activities at national level (harvesting those catalogues is open research —
`atlas-handover.md` G2). Today's model can only express an activity a chapter page lists  so these
1 656 local chapters (with Folkehjelp's) would answer "no activities" to every search. The `programme_only` shape exists in `common-schema.md` but not in a
single model.

**Change.** `dim_activity.scope` (`chapter` / `programme`) and a programme table
`(activity_id, ngo_orgnr, chapter_type)` that generates provisions for every active chapter of
that type, marked `provision_method = 'programme'` so a consumer can tell "the page lists it" from
"the organisation runs it everywhere".

### P4 — Identity resolution across sources, not one supply model per NGO

**Evidence.** Atlas's pattern is one `supply__<ngo>_*` model per NGO, UNION ALL'd into
`dim_chapter`. Every NGO in the research has two or three sources — the register, its own site,
and (Røde Kors) its own API. 2 419 units are confirmed by both registry and site (4 Oct 2026); unioned, each
would be two rows. Even with careful reconciliation residue remains — *Levanger Unge
Sanitetsforening* and *LEVANGERS UNGE SANITETSFORENING* are one unit that survived as two. PR 1
works around this with "the NGO's own feed wins wholesale", which throws away the research's
units that the feed lacks.

**Change.** An intermediate layer: `int_chapter_source` (one row per source record) →
`bridge_chapter_source (chapter_id, source_id, source_key, match_method, confidence)` →
`dim_chapter` with one row per real unit. Matching order the research measured to work:
organisation number → normalised name → name minus town; every link carries its method. This is
the research's `reconcile-chapters.ts`, moved into dbt where Atlas can test it.

### P5 — Lifecycle status, not a boolean

**Evidence.** Diabetesforbundet writes the state into the name: 21 lokallag are *hvilende*
(dormant), 4 *nedlagt* (dissolved). A dormant chapter can be revived and is a recruitment target;
a dissolved one is history. `is_active = false` merges them.

**Change.** `dim_chapter.status` (`active` / `dormant` / `dissolved` / `unknown`), keep `is_active`
as `status = 'active'` for existing consumers.

### P6 — A local chapter can serve several kommuner

**Evidence.** 182 local chapters name several places — *Flekkefjord og omegn*, *GJØVIK/TOTEN*,
*Iveland, Evje og Hornnes*, *RISSA/LEKSVIK*. `dim_chapter.kommune_nr` holds one, and
`chapter_kommune_coverage` is documented for regional chapters only. A search in Evje would miss
*Iveland, Evje og Hornnes*.

**Change.** Allow local rows in `chapter_kommune_coverage`, with a third `source` value
`'named'` (derived from the chapter's own name against `crosswalk_kommune_name`, which Atlas
already has). `kommune_nr` stays the primary kommune.

### P7 — Units that are not places

**Evidence.** 22 youth and student wings (*Unge Sanitet*, *Diabetesforbundet … barn og unge*) and
12 LHL diagnosis groups (*LHL Sepsis og Meningitt*, afasi groups) are chapters of an *audience*,
not of a place. Placed on a map by their registered address — often a board member's home — they
mislead.

**Change.** Promote `chapter_subtype` from free text to a tested vocabulary that includes
`youth_wing`, `student`, `interest_group` (diagnosis/condition) — exactly the promotion its own
description promises "once 3+ NGOs populate it": Sanitetskvinnene, Diabetesforbundet and LHL do.
Map views exclude non-geographic subtypes by default.

### P8 — `chapter_data_shape` is wrong, and belongs to the source

**Evidence** (`seeds/dim_ngo.csv` against what each source actually gave): Nasjonalforeningen is
`programme_only`, yet its WordPress API yields 470 per-chapter activity provisions. 4H, LHL,
Diabetesforbundet and Mental Helse are `cms_bins`, yet their chapter pages carry no activity
bins. Kirkens Bymisjon is `cms_bins`; it is a WordPress taxonomy API. Shape is a property of a
*source*, and an NGO can have several (P4).

**Change.** Correct the values now; later move the field to the source manifest.

### P9 — Three clocks

**Evidence.** `dim_chapter.updated_at` is the load time. A consumer reads "updated" as "true as
of". The research separates `fetched_at` (we looked), `source_updated_at` (the page says it
changed) and `asserted_at` (the owner confirmed it) — and found that filling the third from the
first had created 6 936 false claims (`data-freshness.md`).

**Change.** `fetched_at` and `source_updated_at` on supply rows; `asserted_at` only from a
source-stated date. Atlas's REQUIRED-v1 "Sist oppdatert" label should show `source_updated_at`
where it exists and `fetched_at` labelled as such otherwise.

### P10 — Published contact persons

**Evidence.** Kari's success criterion is a coordinator's name and number (`personas.md`); 3 550
published contacts exist in the research. `INVESTIGATE-ngo-scraping-infrastructure.md` §D.3 forbids
storing them; the owner's decision of 3 Oct 2026 reverses that for persons an NGO publishes as
contacts, with the owner carrying the legal responsibility.

**Change.** Amend §D.3. `dim_chapter_contact (chapter_id, role, given_name, family_name, phone,
email, scope chapter/activity, activity_id, source_url, is_masked)` in `private_marts` first;
exposure through `api_v1` as a separate owner decision. Removed on the run after the page drops
the person.

### P11 — Deeper hierarchy without new levels

**Evidence.** 52 Røde Kors *hjelpekorps* are registered units under a lokalforening — a fourth
tier. Speiderforbundet has krets → gruppe → age branch.

**Change.** Keep `chapter_level` coarse (national/regional/local/related_entity) and let
`parent_chapter_id` express depth; add `chapter_type` (in PR 1) so *Hjelpekorps* is a value, not a
level. Document that `local` may have a `local` parent.

### P12 — Separate the standard from the aggregation

The owner intends to publish this model as a standard NGOs are invited to follow. Today's columns
mix what an NGO knows about itself (name, place, activities, contacts) with what an aggregator
adds (`reconciliation`, `confidence`, `parent_method`, `source_id`, hashes, clocks). Define the
**publisher profile** as the standard and Atlas's columns as an extension of it, so an NGO is never
asked for a field only an aggregator can fill. When an NGO publishes in the standard, it becomes
that NGO's authoritative source (P4) and its scraper retires.

### P13 — Location with a stated precision

**Evidence.** 880 of 4 032 units have coordinates (all from one NGO); 547 more have a street address
the NGO publishes; 3 089 have only a Brreg address — and for a small chapter that is often a board
member's home. The owner installed PostGIS in Atlas's Postgres on 2026-10-04.

**Change.** `dim_chapter.location geography(Point, 4326)` with a GiST index, plus
`location_precision` (`exact` / `postal_code` / `kommune`) and `location_method`. Points from a
registry address are placed at the postal-code area, never the house. A `search_nearby` function
orders by distance and returns the precision with every row.

---

## Not proposed

- **More `chapter_level` values** — `chapter_type` and `unit_kind` carry the nuance without breaking
  every query that filters on `local`.
- **Volunteer demand in the contract** — designed (`volunteer-demand.md`), but no source populates it
  yet; Atlas's own rule keeps unpopulated fields out.
