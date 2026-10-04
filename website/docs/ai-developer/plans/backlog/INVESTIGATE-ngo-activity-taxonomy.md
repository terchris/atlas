# Investigate: One activity taxonomy across the NGOs — Norwegian as people search it

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Let a person search for a kind of help — *leksehjelp*, *besøksvenn*, *gratis mat* — and find
it across every NGO, whatever each NGO calls it, by replacing the 22-code `ref_atlas_service_category`
and the Røde Kors-only `CASE` in `supply__redcross_branch_activities.sql` with a reviewed taxonomy and
one crosswalk for all eleven NGOs.

**Last Updated**: 2026-10-04

**Depends on**: `INVESTIGATE-ngo-research-handover.md` (the method; Atlas's own activity ingestion).

**Abstract**: The atlas-research project built a taxonomy of 38 categories in 10 families. Every
Norwegian label is made from the terms people actually search for (Google Keyword Planner, 858
phrases with volume), with an English equivalent. All of Atlas's 22 codes are kept; 16 are added.
A crosswalk maps all 500 activities the eleven NGOs publish into it. Everything is in
[`docs/research/ngo-research/taxonomy/`](https://github.com/terchris/atlas/tree/main/docs/research/ngo-research/taxonomy/README.md).
**Proposed, not yet reviewed**: the owner reviews the crosswalk before Atlas adopts it.

---

## What this PR contains

Documentation and data files only — no models, seeds, migrations or published relations change.

| Path | What |
|---|---|
| `docs/research/ngo-research/taxonomy/taxonomy-nb-en.csv` + `-families.csv` | 38 categories, 10 families — code, Norwegian label with its search evidence, description, search terms by volume, need terms, volunteer terms, English label, description, terms |
| `docs/research/ngo-research/taxonomy/crosswalk_activity_service_category.csv` | 500 activities → category, with basis and confidence; 29 marked not-a-service with a reason |
| `docs/research/ngo-research/taxonomy/crosswalk-review.md` | the review sheet |
| `docs/research/ngo-research/taxonomy/search-terms-validated.csv` | the evidence |

---

## What changes against Atlas today

**Categories:** the 22 codes stay; 16 are added — `meeting_place`, `physical_activity`,
`work_inclusion`, `addiction_support`, `health_services`, `emergency_shelter`, `legal_aid`,
`peer_support`, `dementia_support`, `child_welfare`, `volunteer_centre`, `reading_friend`,
`crisis_preparedness`, `music_choir`, `creative_crafts`, `worship_open_church`. Labels change to what
people search (`elderly_visiting`: *Besøksvenn*; `family_support`: *Åpen barnehage og familiesenter*).

**Røde Kors's `CASE`**, read against the branches' own texts on rodekors.no:

| Activity | Today | Proposed |
|---|---|---|
| Visitor | `elderly_visiting` | `prison_reintegration` — confidential conversations with prisoners |
| EVA | not a service | `crisis_shelter` — a support person after domestic violence or trafficking |
| Døråpner | not a service | `meeting_place` (+ addiction, prison) — activity groups after addiction, psychiatry, prison |
| Habil | `family_support` | `work_inclusion` — practising driving for a licence |
| Turgruppe | `youth_activity_groups` | `physical_activity` |
| Møteplasser | `family_support` | `meeting_place` |
| Akuttovernatting for bostedsløse tilreisende | `housing_outreach` | `emergency_shelter` |

---

## Questions to Answer

- **[Q1]** *Adopt the 38-category taxonomy* as the successor of `ref_atlas_service_category`, codes
  stable, with families as a second level?
- **[Q2]** *Labels.* Norwegian (bokmål) from search evidence, English as given; nynorsk drafts in
  `categories-v2.csv` wait for a native writer. Which languages does `api_v1` serve?
- **[Q3]** *Search terms as data.* Ship `search_terms_nb`, `need_terms_nb`, `volunteer_terms_nb`
  and `terms_en` as a term table the search index uses — so *ikke råd til mat* finds `food_distribution`?
- **[Q4]** *The crosswalk replaces the `CASE`*, as a seed keyed on Atlas's activity id; primary plus
  secondary categories (a many-to-many, revisiting single-category Q34)?
- **[Q5]** *Candidate categories* — decided by the owner before adoption (`crosswalk-review.md`):
  free equipment lending (BUA, *Utstyrsbanken*, Kirkens Bymisjon's *Skattkammeret*), help with
  public services, practical help (shopping, transport, digital help), volunteers in hospitals,
  residential care for older people, alternative education.
- **[Q6]** *Review.* The owner signs off rows in `reviewed_by` / `reviewed_at`; Atlas loads only
  reviewed rows, or all rows with their confidence?

---

## Next Steps

- [ ] Owner: review the crosswalk (start with the LOW rows) and decide [Q5].
- [ ] Settle [Q1]–[Q4], [Q6].
- [ ] PLAN: taxonomy seeds (`ref_activity_category`, `…_family`, `…_term`) and the crosswalk seed;
      retire the `CASE`; `dim_activity` gets its categories through the crosswalk.
- [ ] PLAN: the search index uses the term table (with PostGIS distance, per the handover plan).
