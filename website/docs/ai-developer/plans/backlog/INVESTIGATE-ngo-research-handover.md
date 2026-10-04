# Investigate: Ingesting the NGOs' chapters and activities, using the atlas-research method

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Fill `dim_chapter`, `dim_activity` and `fact_chapter_activities` for the eleven NGOs in
`dim_ngo` with Atlas's own ingestion, built from the method the atlas-research project worked out,
and change Atlas's NGO model where eleven NGOs' reality disagrees with it.

**Last Updated**: 2026-10-04

**Abstract**: The research collected and reconciled 4 021 chapters of the eleven NGOs from
Brønnøysund and their own websites — 2 419 confirmed by both — and 4 902 chapter–activity links
with the organisations' own descriptions, and measured what people search for. This PR carries the
method, not the data: one ingestion spec per source, the research's complete ingest code (runnable
as-is), the counts Atlas's own runs should reach, how to show an NGO's text without the people in
it, the input for one general geocoder, and thirteen proposed model changes. Everything is in
[`docs/research/ngo-research/`](https://github.com/terchris/atlas/tree/main/docs/research/ngo-research/README.md).
The activity taxonomy and the crosswalk follow in a second PR.

---

## Decisions already taken by the owner

- **[Q1]** *Atlas runs the ingestion itself; the research tells it how* (2026-10-04). No scraped
  data is delivered for Atlas to load. The research delivers specs, its code and acceptance
  targets, and checks Atlas's results against what it measured. Curated vocabulary — the activity
  taxonomy and the crosswalk from each NGO's activities to it — is delivered as files (PR 2).
- **[Q2]** *Published contact persons are collected* (2026-10-03). People an NGO lists as contacts on
  its own site published their details to be contacted. They are stored only in `private_raw` /
  `private_marts`, never in public tables or this public repo. The owner carries the responsibility
  for the legal basis. This supersedes, for published contact persons, §D.3 of
  `INVESTIGATE-ngo-scraping-infrastructure.md` ("nothing about named contact persons is stored").
- **[Q3]** *Røde Kors is scraped like every other NGO* (2026-10-04). Its API is not used at this
  stage, so no NGO gets an advantage through a privileged channel; the parked `redcross-branches`
  source stays parked. The method is proven: `ingestion-specs/redcross.md`.
- **[Q4]** *PostGIS is installed* in Atlas's Postgres (2026-10-04), so search can order by distance.
- **[Q5]** *No contact with the NGOs yet.* Scraping follows Atlas's existing politeness rules
  (robots.txt per URL and run, Crawl-delay, User-Agent with a contact address).
- **[Q6]** *Names in an NGO's text are not what Atlas is for* (2026-10-04). A public description shows
  the text with people replaced (`[navn]`, `[telefon]`, `[e-post]`) and links to the NGO's page for
  the original; uncertain texts are held for review. The name lists come from Atlas's own
  `raw.ssb_10501` and `raw.ssb_12891` (#550). Spec: `ingestion-specs/description-redaction.md`.

---

## What this PR contains

Documentation and reference code only — no models, seeds, migrations or published relations change.

| Path | What |
|---|---|
| `docs/research/ngo-research/ingestion-specs/` | 16 specs — 5 cross-cutting (registry matching, `underenheter`, reconciliation/hierarchy, **description redaction**, **geocoding input**) and 11 per NGO, every one proven on the live site; `acceptance-targets.csv`; `reference-code/` (the research's complete TypeScript ingest package — runs as-is) |
| `docs/research/ngo-research/atlas-model-proposals.md` | thirteen ranked changes to the NGO model, with evidence |
| `docs/research/ngo-research/search-demand-report.md` | what people in Norway search for — the taxonomy's evidence |
| `docs/research/ngo-research/*.md` | the research behind it |

What the specs now cover, per NGO (measured 2026-10-04): chapters from registry and site, the
regional tier, every activity the chapters publish with the organisation's own text, and where
each chapter or activity is. Røde Kors (rodekors.no branch pages, 1 535 activity links),
Speiderforbundet (blispeider.no's group finder, 332 groups linked to their krets) and the activities
of LHL, Folkehjelp, Diabetesforbundet, Mental Helse and 4H were added on 4 October.

A content check was run on every file of this PR against every contact name, phone number and
e-mail address in the research's data and every name the redaction step removed from the NGOs'
texts — 0 matches. The only numbers in it are national office switchboards, used as filters.

---

## Questions to Answer

- **[Q7]** *Build order.* Proposed: Brreg chapter matching (a dbt model over `dim_brreg_enhet` — no
  new ingest) and `brreg-underenheter` first; then the NGO sites in the order of
  `ingestion-specs/README.md`. Accept?
- **[Q8]** *Where reconciliation lives.* The specs put registry × website joining, hierarchy and
  classification in dbt (`int_` models), keeping `raw.*` verbatim. Accept the layering, and the
  `bridge_chapter_source` design of proposal P4?
- **[Q9]** *Acceptance tolerance.* Proposed rule: a source lands when its counts are within ±10% of
  `acceptance-targets.csv`, or the gap is explained in the source README.
- **[Q10]** *Amend §D.3* of `INVESTIGATE-ngo-scraping-infrastructure.md` per [Q2].
- **[Q11]** *Public text.* Accept the two-version design of `description-redaction.md` — verbatim text
  in `private_raw`, the public text in `dim_activity.description`, held texts not shown?
- **[Q12]** *Geocoding.* Accept `geocoding-input.md` as the one input for a general geocoder, with a
  stated `max_precision` per place (registry addresses never finer than the postal-code area)?
- **[Q13]**–**[Q25]** *The thirteen model proposals* (P1–P13 in `atlas-model-proposals.md`).

---

## Next Steps

- [ ] Settle [Q7]–[Q12] and choose which proposals to take into PLANs.
- [ ] PLAN: Brreg chapter matching + `brreg-underenheter` — first chapters, no scraping.
- [ ] PLAN per NGO site, from its spec; each checked against `acceptance-targets.csv`.
- [ ] PLAN: public text without people (`description-redaction.md`), on `raw.ssb_10501` / `raw.ssb_12891`.
- [ ] PLAN: geocoding from `geocoding-input.md` (PostGIS points with a precision).
- [ ] PLAN: contacts via the private path ([Q2], [Q10]).
- [ ] PR 2: activity taxonomy (Norwegian as people search it, English) and the crosswalk.
