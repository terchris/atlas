# Investigate: Ingesting the NGOs' chapters and activities, using the atlas-research method

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — validated and accepted 2026-10-04 (atlas, urb-agents #1844); PR 2
(taxonomy) merged as #555. Q7–Q12 and P1–P13 answered below. No child PLAN drafted yet —
see Next Steps.

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

## Validation (atlas, 2026-10-04, urb-agents #1844)

Checked directly against this repo, not taken on the research's word — every quantitative claim
below was independently re-derived, not re-read:

- `dim_ngo.csv` has exactly 11 rows, matching the 11 NGOs named throughout. Its `chapter_data_shape`
  column is wrong exactly as P8 describes: `nasjonalforeningen` = `programme_only` despite its
  WordPress API yielding per-chapter activities; `fire-h`, `lhl`, `diabetesforbundet`,
  `mental-helse` = `cms_bins` despite carrying no activity bins; `kirkens-bymisjon` = `cms_bins`
  despite being a WordPress taxonomy API. **One gap P8 doesn't name**: `redcross` is seeded as
  `api_canonical`, which [Q3] (scraping, not the API) makes wrong too — flagging for whoever writes
  P8's PLAN.
- `dim_chapter.sql` and `dim_activity.sql` are thin wrappers over `supply__redcross_branches` /
  `supply__redcross_branch_activities` only (PLAN-002/003-era scaffolding) — confirms "has never
  held a row": their only upstream source, `redcross-branches`, is the one source CLAUDE.md
  documents as permanently excluded ("no data to arrive").
- `supply__redcross_branch_activities.sql`'s CASE matches every one of the taxonomy PR's 7 named
  Red Cross examples exactly, including both "today" and "not a service" values (`Visitor` →
  `elderly_visiting`, `Habil` → `family_support`, `Turgruppe` → `youth_activity_groups`,
  `Møteplasser` → `family_support`, `Akuttovernatting for bostedsløse tilreisende` →
  `housing_outreach`, `Døråpner` and `EVA` both `is_service = false`).
- `ref_atlas_service_category.csv` has exactly the 22 codes P2 describes, all present unchanged in
  the taxonomy PR's 38; `chapter_kommune_coverage.sql`'s own header comment says "no sources produce
  this yet" (P6); only `brreg-enheter-alle`/`brreg-frivillige`/`brreg-oppdateringer` exist, zero
  mention of `underenheter` anywhere (P1); `lib/scraping/` exists in full (`robots.ts`, `ua.ts`,
  `kv.ts`, `sitemap_log.ts`, `ingest_runs.ts`, `html_raw_hash.ts`) and is imported by zero sources
  (`scraping-practice.md`'s claim). PostGIS's installation ([Q4]) is independently corroborated —
  unrelated to this task, urb-agents #1830–#1841 this same week turned entirely on PostGIS catalog
  views existing in this cluster's Postgres.
- `api_v1`'s only language columns anywhere today are `label_no`/`label_en` — informs [Q2] of the
  taxonomy PR below: nynorsk has no existing column to land in.
- The reference ingest code: `npm ci` clean (0 vulnerabilities), `tsc --noEmit` zero errors. All
  four politeness claims verified by reading the code, not the docs: robots.txt checked before
  every fetch (`lib/http.ts:146-147`), Crawl-delay is a real `sleep()`, not just parsed
  (`lib/http.ts:90-95`, called at `:152`), User-Agent carries `ATLAS_SCRAPE_CONTACT_EMAIL`
  (`lib/http.ts:48`), and the code refuses to run without that var set (`lib/http.ts:43-47`). A live
  smoke test (`npm run site -- folkehjelp --limit 10`, real HTTP to folkehjelp.no) parsed 10/10
  chapters correctly, including correctly flagging a `c/o` address as `containsPersonalData: true`.
  Not run at full scale against any site — 10 of folkehjelp's 114 isn't a meaningful comparison
  against `acceptance-targets.csv`'s 128; that's for the per-NGO PLAN to do.

**Could not verify**: the taxonomy crosswalk's own content (deliberately — [Q5] of PR 2 below is
the owner's); the geocoder (R9, not built yet, nothing to run); a full-scale run of any single
source against its real `acceptance-targets.csv` row (only a 10-chapter smoke test was run, by
design — see above).

## Questions to Answer

- **[Q7]** *Build order.* **Accept.** Matches the real dependency order (reconciliation needs
  registry rows first) and Atlas's own "derive, don't edit" discipline — brreg-underenheter is new
  NLOD data, nothing scraped yet.
- **[Q8]** *Where reconciliation lives.* **Accept** the dbt layering and `bridge_chapter_source`.
  This is the one proposal (P4) that has to land before any second source of any NGO, including
  Røde Kors's own site crawl replacing its current thin `dim_chapter` wrapper — sequence the first
  PLAN to build this, not a per-NGO staging model straight into `dim_chapter`.
- **[Q9]** *Acceptance tolerance.* **Accept** ±10% or an explained gap, with the same discipline
  this repo already runs deploys under: a gap not explained in the source's own README is a defect,
  not a rounding error.
- **[Q10]** *Amend §D.3.* **Done** — `INVESTIGATE-ngo-scraping-infrastructure.md` §D.3 now points
  here instead of restating the old rule; see that file's diff in this same change.
- **[Q11]** *Public text.* **Accept.** Measured on 1 676 texts with a stated false-negative class
  (an unlisted first name standing alone) rather than a claimed zero — the honest kind of "0 found".
- **[Q12]** *Geocoding.* **Accept** the input file and the `max_precision` rule. The general
  geocoder itself (R9) is correctly scoped as not-yet-built; nothing here commits Atlas to Kartverket
  specifically, only to the input shape.
- **[Q13]** P1 (Brreg underenheter). **Accept.** Verified no existing source overlaps it.
- **[Q14]** P2 (Taxonomy). **Accept the framework; defer the crosswalk** — see PR 2's own [Q5], the
  owner's review, not this one.
- **[Q15]** P3 (Programme activities). **Accept.** `dim_activity.scope` + a programme table; confirmed
  the gap is real (7 NGOs' `chapter_data_shape` already mismeasures this, per P8 above).
- **[Q16]** P4 (Identity resolution). **Accept** — see [Q8].
- **[Q17]** P5 (Lifecycle status). **Accept.** Backward compatible (`is_active` stays derived).
- **[Q18]** P6 (Several kommuner per chapter). **Accept.** `chapter_kommune_coverage` already has the
  `source` column designed for this value; only the local-row restriction lifts.
- **[Q19]** P7 (Non-geographic units). **Accept.** `chapter_subtype` promotion to tested vocabulary.
- **[Q20]** P8 (`chapter_data_shape`). **Accept**, plus the `redcross` gap noted above.
- **[Q21]** P9 (Three clocks). **Accept.** Directly consistent with this repo's own existing
  three-clock discipline elsewhere (`fetched_at`/`source_updated_at`/`asserted_at` is not a new
  pattern here).
- **[Q22]** P10 (Published contact persons). **Accept the shape** — already decided in substance by
  [Q2]; this is its implementation (`private_marts`, never public).
- **[Q23]** P11 (Deeper hierarchy). **Accept.** No new `chapter_level` values, `parent_chapter_id`
  carries depth.
- **[Q24]** P12 (Separate NGO-facing standard). **Accept the principle, defer the work** — this is
  "before the standard [is offered]" by the proposal's own timing; does not block any PLAN below.
- **[Q25]** P13 (Location with precision). **Accept.** PostGIS confirmed installed independently
  (see Validation above); `location_precision` mirrors the `max_precision` design in [Q12].

---

## Next Steps

- [x] Settle [Q7]–[Q12] and choose which proposals to take into PLANs — done above.
- [ ] PLAN: Brreg chapter matching + `brreg-underenheter` + `int_ngo_chapter_reconciled` /
      `bridge_chapter_source` (P1, P4, P8's `redcross` correction) — first chapters, no scraping.
- [ ] PLAN per NGO site, from its spec; each checked against `acceptance-targets.csv` at full scale
      (not the 10-chapter smoke test this validation ran).
- [ ] PLAN: public text without people (`description-redaction.md`), on `raw.ssb_10501` / `raw.ssb_12891`.
- [ ] PLAN: geocoding from `geocoding-input.md` (PostGIS points with a precision).
- [ ] PLAN: contacts via the private path ([Q2], [Q10] — done).
- [x] PR 2: activity taxonomy and the crosswalk — merged as #555 (#554 had to be replaced after a
      squash-merge ancestry conflict; same content, sha256-verified). Crosswalk still
      **proposed, not adopted** — see that file's own Next Steps for the owner's review.
