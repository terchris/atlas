# Activity taxonomy and crosswalk — curated vocabulary for Atlas

Delivered as files, like `ref_atlas_service_category` (owner decision [Q1] in
`INVESTIGATE-ngo-research-handover.md`): unlike chapters and activities, which Atlas collects with its
own ingestion, the categories and the mapping into them are judgement, made once and reviewed.

**Status 2026-10-04: proposed by the research, not yet reviewed** (`reviewed_by` is empty on every row).

## Files

| File | What |
|---|---|
| [`taxonomy-nb-en.md`](taxonomy-nb-en.md) | **Read this first.** The taxonomy as a table: 10 families, 38 categories, Norwegian as people search it and English |
| [`taxonomy-nb-en.csv`](taxonomy-nb-en.csv) | the 38 categories: `code`, `label_nb` + the searched terms behind it (`label_nb_evidence`), `description_nb`, every generic search term by volume, how people describe the need, how they look for a way to help, `label_en`, `description_en`, `terms_en`, `search_entry` |
| [`taxonomy-nb-en-families.csv`](taxonomy-nb-en-families.csv) | the 10 families |
| [`crosswalk_activity_service_category.csv`](crosswalk_activity_service_category.csv) | every activity of the eleven NGOs (500) → a primary category, secondary categories, or not-a-service with a reason; each with `basis`, `confidence` and Atlas's current code for Røde Kors |
| [`crosswalk-review.md`](crosswalk-review.md) | **the review sheet** — coverage, what changes against Atlas's `CASE`, the LOW rows, the candidate categories that need a decision |
| [`categories-v2.csv`](categories-v2.csv) | the working file behind the taxonomy: draft nynorsk labels (`label_nn`, not yet checked by a native writer), the merge decisions, search volume per category |
| [`search-terms-validated.csv`](search-terms-validated.csv) | the evidence: 858 Norwegian search phrases with their Google Keyword Planner volume band, intent and category |
| `build_nb_en.py`, `build_crosswalk.py` | how the two CSVs are built (paths are the research repository's). `build_nb_en.py` fails if a volume quoted for a label does not match the Keyword Planner data; `build_crosswalk.py` fails if an activity is unmapped or a code inactive |

See also `../search-demand-report.md` for the search evidence in prose.

## The rules behind it

- **Codes are stable; labels change.** Atlas's 22 codes are all kept; v2 adds 16.
- **The Norwegian label is what people type into Google** — 25 of the first-draft labels had no
  searches and were replaced (*Familiestøtte og familiesenter* → *Åpen barnehage og familiesenter*).
  English follows Norwegian; English search volume is not measured (`en_measured = no`).
- **One row per (activity, category)** in the crosswalk: `is_primary = true` is where the activity is
  filed, extra rows are where it should also be found.
- **Every mapping says what it rests on** (`basis`: the activity's name, the NGO's description, its
  own grouping, its programme, Atlas's `CASE`) and how sure it is (`confidence`).
