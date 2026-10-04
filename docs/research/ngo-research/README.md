# NGO research — delivered from the atlas-research project

The **atlas-research** project spent September–October 2026 working out how to collect the
chapters and activities of the eleven NGOs in `dim_ngo`, testing every method against
Brønnøysund and the NGOs' own websites — 4 021 chapters, 2 419 confirmed by both, 4 902
chapter–activity links (measured 2026-10-04). **Atlas runs the ingestion itself; this folder tells it
how** (owner decision, 2026-10-04). It holds the method, the evidence and the proposals. It holds
no scraped data.

The plan that turns this into Atlas work:
[`website/docs/ai-developer/plans/backlog/INVESTIGATE-ngo-research-handover.md`](../../../website/docs/ai-developer/plans/backlog/INVESTIGATE-ngo-research-handover.md).

⚠️ **Paths in the research documents are the research repository's**, not Atlas's: `data/<org>/…`,
`ingest/src/sources/…`, `taxonomy/…`, `schemas/…` refer to the atlas-research tree, which is not
public. Figures are dated where they appear. The research's complete ingest code is in
`ingestion-specs/reference-code/` and runs as-is (see its README).

## Start here

| Document | Why |
|---|---|
| [`ingestion-specs/README.md`](ingestion-specs/README.md) | **How to ingest each source** — one spec per NGO and per registry method, all proven on the live sites; reference code; acceptance targets |
| [`ingestion-specs/description-redaction.md`](ingestion-specs/description-redaction.md) | **How to show an NGO's text without the people in it** — measured on 2 176 texts |
| [`ingestion-specs/geocoding-input.md`](ingestion-specs/geocoding-input.md) | **Every place we know, one file** — the input for one general geocoder |
| [`atlas-model-proposals.md`](atlas-model-proposals.md) | **What Atlas should change** — thirteen ranked proposals from measuring eleven NGOs, each with its evidence |
| [`taxonomy/README.md`](taxonomy/README.md) | **The activity taxonomy and the crosswalk** — 38 categories, Norwegian as people search it and English; all 500 NGO activities mapped (proposed, not yet reviewed) |
| [`search-demand-report.md`](search-demand-report.md) | **What people in Norway search for** — the evidence for the cross-NGO activity taxonomy (Google Keyword Planner, 1 418 phrases) |
| [`atlas-storage-design.md`](atlas-storage-design.md) | How the tables should look so people can search activities across all NGOs |
| [`atlas-handover.md`](atlas-handover.md) | What the research still has to work out, and how the handover is divided |
| [`scraping-practice.md`](scraping-practice.md) | What the research took from Atlas's scraping infrastructure, what Atlas should take from the research — every lesson tied to a defect that shipped — and the merged checklist |

## Evidence base

| Document | What it is |
|---|---|
| [`schema-variants.md`](schema-variants.md) | Every variant observed across the 11 NGOs, measured, and what a shared schema must do about it |
| [`ngo-chapters-findings.md`](ngo-chapters-findings.md) | Registry matching, measured precision (93.6% / 95.4% on Røde Kors), the federated/unitary split |
| [`case-sanitetskvinnene-scrape.md`](case-sanitetskvinnene-scrape.md) | One NGO end to end |
| [`change-detection.md`](change-detection.md) | Per-block hashing: what changed on a chapter page; parser failures flagged, never recorded as deletions |
| [`data-freshness.md`](data-freshness.md) | Three clocks — `fetched_at`, `source_updated_at`, `asserted_at` |
| [`activity-taxonomy.md`](activity-taxonomy.md) | From each NGO's own activity names to common categories |
| [`classification-systems.md`](classification-systems.md) | Every taxonomy in play — ICNPO variants, NACE, frivillig.no — and what each classifies |
| [`volunteer-demand.md`](volunteer-demand.md) | Showing where volunteers are needed |
| [`source-frivillig-no.md`](source-frivillig-no.md) | frivillig.no as a source |
| [`api-standard-alignment.md`](api-standard-alignment.md) | The research contract against the Red Cross API Standard |
| [`ngo-activity-map-strategy.md`](ngo-activity-map-strategy.md) | The original plan and source inventory |
