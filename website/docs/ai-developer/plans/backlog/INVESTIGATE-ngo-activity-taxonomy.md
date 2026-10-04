# Investigate: One activity taxonomy across the NGOs — Norwegian as people search it

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — validated 2026-10-04 (atlas, urb-agents #1844); merged as #555 (#554 had to
be replaced after a squash-merge ancestry conflict — same content, sha256-verified). [Q1]–[Q4] and
[Q6] answered below; [Q5] (the crosswalk's candidate categories and its row-by-row content) is the
owner's decision, not atlas's — nothing here should be read as pre-empting it.

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

- **[Q1]** *Adopt the 38-category taxonomy.* **Accept.** Verified directly: the 22 existing codes
  are all present unchanged in the new 38; `ref_atlas_service_category.csv` has exactly 22 rows
  today, the new `taxonomy-nb-en.csv` exactly 38 across exactly 10 `family_code` values. Nothing
  existing breaks; families are additive.
- **[Q2]** *Labels, and which languages `api_v1` serves.* Checked directly:
  `ref_atlas_service_category.csv`'s only columns today are `label_no`/`label_en` — there is no
  nynorsk column anywhere in `api_v1` to land a draft in. **Accept bokmål + English now**; nynorsk
  has nowhere to go until a column is added, so `categories-v2.csv`'s drafts correctly wait — this
  isn't a decision deferred without reason, it's blocked on schema that doesn't exist yet.
- **[Q3]** *Search terms as data.* **Accept** the term-table design; it's additive and the search
  index is a separate PLAN regardless (Next Steps already says so).
- **[Q4]** *Crosswalk replaces the CASE, many-to-many with `is_primary`.* **Accept the design.**
  Checked the actual file: 500 distinct `activity_id` across 589 rows, `is_primary` true for 471,
  false for 89, and correctly blank for the 29 `is_service = false` rows — the shape already matches
  what's proposed. Loading its *content* is [Q5]/[Q6], not this.
- **[Q5]** *Candidate categories.* **The owner's decision, not atlas's** — see Status above. Not
  assessed here beyond confirming the file is structurally ready for a decision: every one of the
  7 named Røde Kors reclassifications (Visitor, EVA, Døråpner, Habil, Turgruppe, Møteplasser,
  Akuttovernatting) was checked against the *current*, live `supply__redcross_branch_activities.sql`
  CASE and matches the "Today" column exactly — the "what changes" table above is accurate, not
  aspirational.
- **[Q6]** *Review / load policy.* Checked: `reviewed_by` is empty on **all 589 rows** right now — 0
  reviewed. A rule of "Atlas loads only reviewed rows" means `dim_activity.service_category_code`
  stays unpopulated via the crosswalk until the owner reviews at least some rows; "load all rows
  with their confidence" means it's populated today but some of it is [Q5]-pending. **Recommend the
  second** (load all rows, confidence visible) so Atlas isn't silently uncategorized while review is
  in progress — but flagging this explicitly as the owner's call, since it trades a visible
  "pending review" state for not blocking on review. State a preference when deciding [Q5].

---

## Next Steps

- [ ] Owner: review the crosswalk (start with the LOW rows, 92 of them) and decide [Q5], and state
      a preference on [Q6]'s load policy.
- [x] Settle [Q1]–[Q4] — done above.
- [ ] PLAN: taxonomy seeds (`ref_activity_category`, `…_family`, `…_term`) and the crosswalk seed;
      retire the `CASE`; `dim_activity` gets its categories through the crosswalk. Depends on [Q5]/[Q6].
- [ ] PLAN: the search index uses the term table (with PostGIS distance, per the handover plan).
