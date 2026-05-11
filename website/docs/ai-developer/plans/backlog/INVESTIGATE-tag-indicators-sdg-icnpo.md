# Investigate: Tag existing indicators with SDG and ICNPO codes

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide whether and how to enrich Atlas's existing demand-side indicators (`fact_kommune_indicators` and the 17 underlying `indicators__*` models) with **SDG goal numbers** and **ICNPO category codes**, so the same data can be browsed, filtered, and reported under the international/national taxonomies that funders, journalists, researchers, and the NGO sector itself use.

**Last Updated**: 2026-04-23

**Origin**: Once [PLAN-foundation-reference-tables.md](../completed/PLAN-foundation-reference-tables.md) lands `ref_un_sdg` and `ref_brreg_icnpo`, the demand-side data Atlas already has gains a natural rollup story: each indicator (FHI mobbing, SSB child poverty, FHI overcrowded housing, etc.) maps to one or more SDGs and to an ICNPO category. That mapping doesn't exist yet. This investigation decides what tagging to do, where the mappings live, and what queries become possible afterwards.

---

## Questions to Answer

1. Which indicators in the current 19 sources map to which SDGs (1–17)? How many SDGs typically apply per indicator — 1, 2, or many? Is the mapping subjective or principled?
2. Same for ICNPO — does it make sense to tag a *demand-side indicator* with an ICNPO code (which classifies *organisations*, not data)? Or is ICNPO only meaningful on the supply side (`dim_ngo`)?
3. Where do the tags live — denormalised columns on `indicators__*` (one `sdg_code` column? array?), a junction table (`crosswalk_indicator_to_sdg`), or attribute on a higher entity?
4. How many tags per indicator? SDGs are designed with overlap (e.g. child poverty touches SDG 1 No Poverty + SDG 10 Reduced Inequalities + SDG 4 Education). Do we pick a primary, allow multiple, or rank?
5. Who curates the mapping? It's a judgement call (a researcher would say "child poverty maps to SDG 1, 4, 10"; a funder might say "primarily SDG 1"). Is this Atlas-team curation, or pulled from an external source?
6. What new queries does this enable, and are they worth the curation cost?

---

## Current state

After PLAN-foundation-reference-tables (when it lands), Atlas has:
- `marts.ref_un_sdg` — 17 rows.
- `marts.ref_brreg_icnpo` — 42 rows.
- `marts.fact_kommune_indicators` — 135 698 rows from 19 sources, no SDG or ICNPO column.
- `marts.indicators__*` — 17 per-source models with their own dim columns; no SDG/ICNPO context.

The supply-side investigation [INVESTIGATE-ngo-supply-data-model.md](../completed/INVESTIGATE-ngo-supply-data-model.md) establishes that `dim_ngo` carries up to 3 ICNPO codes per NGO (from Brreg). But that's about organisations, not indicators. Whether *indicators* should also be tagged is the open question.

---

## Initial framing — what the mapping might look like

Speculative, to anchor discussion. Not a recommendation:

| Indicator (source / contents) | Plausible SDG goals | Plausible ICNPO subgroup |
|---|---|---|
| SSB child poverty (Bufdir Barnefattigdom — when ingested) | 1 No Poverty, 10 Reduced Inequalities | 4.1 Social Services |
| FHI mobbing (school bullying) | 4 Quality Education, 16 Peace, Justice and Strong Institutions | 2.4 Other Education (or 4.1) |
| FHI overcrowded housing (trangbodd) | 1 No Poverty, 11 Sustainable Cities | 4.4 Income Support |
| FHI VGS gjennomføring (school completion) | 4 Quality Education, 8 Decent Work | 2.x Education |
| SSB educational attainment (09429) | 4 Quality Education | 2.x Education |
| SSB family/household composition (06083, 06944) | (no clear primary; demographic context) | 7.x Civic, or none |
| SSB population (07459) | (none — pure demographic baseline) | (none) |

Two patterns visible:
- Some indicators have one or two **strong** SDG mappings.
- Some are demographic baselines with no meaningful tag.
- ICNPO mappings are even fuzzier — ICNPO classifies the *organisation* providing the service, not the *measurement of the need*. Tagging an indicator as "ICNPO 4.1 Social Services" reads as "the kind of NGO that addresses this need is in 4.1", which is a derivative claim.

---

## Options

### Option A — Tag indicators with SDGs only; skip ICNPO

Reasoning: SDGs are *outcome* framings, which fits indicators (which measure outcomes/states). ICNPO is an *organisation* classification, which doesn't fit indicators directly. Keep ICNPO on `dim_ngo` only.

**Storage**: junction table `crosswalk_indicator_to_sdg(source_id, contents_code, sdg_code, is_primary)` — keyed on the (source_id, contents_code) pair that identifies an indicator. Allows multiple SDGs per indicator with one marked primary.

**Curation**: Atlas-team manual mapping in a CSV seed; review per-indicator when adding new sources.

### Option B — Tag indicators with both SDG and ICNPO

ICNPO via "the kind of organisation that would address this need". Useful for the Coverage-gap explorer's reverse query: "which kommuner show high `barnefattigdom` and have no ICNPO 4.x organisation present?" — same query Option A enables via SDG, but more explicit.

**Storage**: two junction tables (or one wide one with both columns).

**Cost**: doubles the curation work; opens debate about which ICNPO subgroup applies (the boundaries are fuzzy).

### Option C — Tag at the source level, not per-indicator

Many sources have a clear "what is this about" framing (FHI mobbing = bullying = SDG 4 + 16). Skip the per-`contents_code` granularity; tag the whole `indicators__fhi_mobbing` model with its SDGs.

**Storage**: a column on a hand-curated `dim_atlas_source` (which we'd also need to introduce) or on `dim_ngo` if we conflate "data source" with "publisher organisation".

**Cost**: less curation; less granular. Coverage gaps look at "every source about education" rather than "specifically the dropout indicator".

### Option D — Don't tag; surface the rollup via the UI

Keep the data model unchanged; let the UI overlay SDG/ICNPO context manually (e.g. a hand-curated mapping in the Next.js code). Pro: zero database churn. Con: data is not queryable; doesn't help analysts or other consumers.

### Option E — Tag but call it "topic" instead of "SDG/ICNPO"

Recognise that what we actually want is a topical taxonomy ("child welfare", "education", "housing", "rescue") that *maps to* SDGs and ICNPO downstream. Build `ref_atlas_topic` (~15 rows) + `crosswalk_indicator_to_topic`; each topic carries SDG and ICNPO references.

**Pro**: separates the "what's this indicator about" question from the standards mapping. If we add a third standard later (NUTS, Helsedirektoratet's outcome framework, etc.) it's another column on `ref_atlas_topic`, not new junction tables everywhere.
**Con**: introduces an Atlas-curated abstraction layer; one more thing to maintain.

---

## Recommendation candidates (to discuss, not yet chosen)

The honest answer depends on the use case:

- If the goal is **journalist/researcher-facing rollup** ("show me SDG 4 indicators for Norway"), Option A is enough.
- If the goal is **coverage-gap matching** ("high need + no NGO of the right kind"), Option B is needed because the supply side speaks ICNPO.
- If we expect to add more standards over time, Option E pays back.

A hybrid is plausible: build the topic layer (Option E) **now** with SDG + ICNPO references on each topic; tag indicators against topic only. Future standards become topic columns, not new junction tables.

---

## Open Questions

1. **Is ICNPO meaningful on indicators?** ICNPO classifies organisations. Tagging an indicator with ICNPO is a derivative claim ("the kind of NGO that addresses this"). Maybe the right answer is: don't tag indicators with ICNPO; only tag NGOs. The coverage-gap query can then go indicator → SDG → topic → ICNPO via NGO (longer chain, but each step is justified).
2. **Granularity** — per-indicator or per-source? Many sources have many `contents_code` values; per-`contents_code` may be over-fine. Recommend per-source for v1, refine if needed.
3. **Curation source** — purely Atlas-team judgement, or is there an external mapping (e.g. SSB's [satellittregnskap](https://www.ssb.no/nasjonalregnskap-og-konjunkturer/nasjonalregnskap/statistikk/satellittregnskap-for-ideelle-og-frivillige-organisasjoner) tags its data buckets to ICNPO; Helsedirektoratet maps health indicators to outcome categories)? Worth a brief external scan before committing to manual curation.
4. **Primary vs. secondary tags** — should one SDG be marked primary? If yes, how is "primary" defined and by whom?
5. **What does the UI actually want?** Before designing the data, sanity-check with a sketch: "if a user filters to SDG 4, what should they see?" Is it a list of indicators, a map, a chart, a kommune-by-kommune comparison?

---

## Next Steps

- [ ] Resolve open questions, especially Q1 (is ICNPO meaningful on indicators?) and Q5 (what UI actually wants).
- [ ] Choose option A, B, C, D, or E.
- [ ] Write PLAN with the chosen scope.

### Not in scope for this investigation

- Building any of the tagging tables — that's the PLAN that follows.
- Tagging NGO supply data with SDG/ICNPO — that's already covered by `dim_ngo.icnpo_code_*` (PLAN-A of [INVESTIGATE-ngo-supply-data-model.md](../completed/INVESTIGATE-ngo-supply-data-model.md)).
- Tagging indicators with non-standard frameworks (Helsedirektoratet outcome categories, EU social-inclusion indicators) — separate work if it ever comes up.

### Prerequisites

- [PLAN-foundation-reference-tables.md](../completed/PLAN-foundation-reference-tables.md) must land first — `ref_un_sdg` and `ref_brreg_icnpo` are required for any tagging work.

---

## Cross-references

- [`docs/ai-developer/plans/backlog/PLAN-foundation-reference-tables.md`](../completed/PLAN-foundation-reference-tables.md) — the prerequisite that creates `ref_un_sdg` and `ref_brreg_icnpo`.
- [`docs/ai-developer/plans/backlog/INVESTIGATE-ngo-supply-data-model.md`](../completed/INVESTIGATE-ngo-supply-data-model.md) — the supply-side counterpart; ICNPO tagging there is well-grounded (NGOs have ICNPO codes natively at Brreg).
- [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) — naming convention for any new `crosswalk_*` or `ref_atlas_*` table this work introduces.
- [UN SDGs](https://sdgs.un.org/goals).
- [Brreg ICNPO categories](https://www.brreg.no/en/associations-2/register-a-club-or-an-association/registration-in-the-register-of-non-profit-organisations/available-categories-of-the-activity/).
- [SSB satellittregnskap for ideelle og frivillige organisasjoner](https://www.ssb.no/nasjonalregnskap-og-konjunkturer/nasjonalregnskap/statistikk/satellittregnskap-for-ideelle-og-frivillige-organisasjoner) — example of a third-party that already tags Norwegian data with ICNPO; worth checking whether their methodology is published.
