# Handing the NGO research to Atlas — what is still missing, what Atlas should change, how to deliver

3 October 2026. Follows `atlas-storage-design.md` (how Atlas should store and search the data).
This document answers the next two questions: **is the research complete enough for what Atlas
needs**, and **how does it get into Atlas** given how Atlas actually takes in a source.

Atlas was read at `terchris/atlas@59e8bc3`, read-only. Atlas file paths are relative to that repo.

## Summary

- **The research is not yet complete for Atlas's purpose.** Chapters are in good shape (4 032
  units, 11 NGOs). What Atlas's users search for — *activities* — exists for only **4 of 11 NGOs**,
  and none of the 200 activity definitions is mapped to Atlas's cross-NGO categories. Five
  research items close that (§1).
- **Contacts are handed over.** Atlas's scraping rule stores *"nothing about named contact
  persons"* (`INVESTIGATE-ngo-scraping-infrastructure.md` §D.3), but the owner decided on
  3 Oct 2026 that people an NGO publishes as contacts want to be contacted, and took the
  responsibility for the legal basis (`scraping-practice.md`). Atlas's §D.3 needs the matching
  amendment (A9).
- **Atlas runs the ingestion; the research tells it how** (§3, owner decision 2026-10-04): one
  ingestion spec per source, reference code and acceptance targets — never a data package.
- **Atlas needs nine changes** to receive it (§2), most of them seeds and columns, two of them
  decisions only a human can take.

---

## 1. Research gaps, measured against what Atlas needs

Atlas's v1 consumers filter chapters on `kommune_nr`, `fylke_nr`, `chapter_level`,
`service_category_code`, `is_active` and free text (`INVESTIGATE-supply-frontend-display.md`
[Q31]). Field coverage today, local and regional units only (`data/*/chapters.json`):

| NGO | units | kommune | coordinates | address | activities |
|---|---:|---:|---:|---:|---:|
| Sanitetskvinnene | 574 | 71% | 95% | 95% | 63% |
| Nasjonalforeningen | 493 | 63% | — | — | 50% |
| Kirkens Bymisjon | 431 | 35% | — | 35% | 81% |
| Frelsesarmeen | 272 | 64% | — | 100% | 6% |
| 4H | 591 | 73% | — | — | — |
| Røde Kors | 374 | 90% | — | — | — |
| Speiderforbundet | 387 | 91% | — | — | — |
| LHL | 285 | 66% | — | — | — |
| Mental Helse | 199 | 78% | — | — | — |
| Diabetesforbundet | 161 | 55% | — | — | — |
| Folkehjelp | 128 | 73% | — | 88% | — |

### G1 — The cross-NGO taxonomy · **blocking · research can draft it**

0 of 200 definitions map to `ref_atlas_service_category` (see `atlas-storage-design.md` §2).
Without this, a search for *språkkafé* finds one NGO's word, not everyone's activity.

Deliverable, as Atlas seed files:

- `ref_atlas_service_category.csv` extended to ≈30 codes, plus a `family` level. The evidence
  for which codes is already measured (walking groups, meeting-place cafés, dementia,
  addiction, work inclusion, emergency shelter, reading friend, crisis preparedness).
- `ref_atlas_service_category_term.csv` — synonyms and lay terms, bokmål **and nynorsk**.
- `crosswalk_activity_service_category.csv` — our 200 definitions **plus** the ~50 Red Cross
  activities currently hard-coded in a `CASE` in `supply__redcross_branch_activities.sql`, each
  with `method`, `confidence`, and a `reviewed_by` left for a human.

### G2 — Activities for the seven NGOs that have none · **high · mostly research**

Atlas's own model already has the shape for this: `chapter_data_shape = programme_only` — the
activity is defined once nationally and applies to every chapter of a type
(`docs/research/common-schema.md`). That fits most of the gap better than scraping each chapter:

| NGO | What the activity is | Research needed |
|---|---|---|
| 4H | every klubb runs 4H club activity for children and youth | one national definition; trivial |
| Speiderforbundet | every speidergruppe runs scouting, by age branch | national definitions per age branch (småspeidere, speidere, rovere) |
| LHL, Diabetesforbundet, Mental Helse | lokallag run peer support, meeting places, exercise groups | harvest each national activity catalogue, as was done for Nasjonalforeningen |
| Folkehjelp | 6 fixed CMS activity bins per lokallag | harvest the bins; Atlas has already investigated this (`INVESTIGATE-folkehjelp-supply.md`) |
| **Røde Kors** | 48 canonical activities, ~2 400 local | **Scraped like the others** — owner's decision 2026-10-04: no NGO gets an advantage through a privileged channel, so the Røde Kors API is not used at this stage. Its site lists branches under `/lokalforeninger/<distrikt>/<lag>/` (1 588 sitemap URLs); activity pages exist for a minority of branches, in free-form paths, so expect partial coverage, as for any NGO whose site publishes little |

### G3 — Geography · **medium · research**

- 1 207 local/regional units have no `kommune_nr`. **288** of them can get one mechanically: 286
  carry a postal code (Atlas has `dim_postnummer`) and 160 carry coordinates (a reverse lookup
  against Kartverket) — mostly the same units. The other ~920 need a source that states a place.
- Coordinates exist only for Sanitetskvinnene. Geocoding the addresses the organisations
  publish (Kartverket's open address API) would lift Frelsesarmeen, Folkehjelp and Kirkens
  Bymisjon.
- ⚠️ **Do not geocode registry addresses.** A small chapter's registered business address is
  often a board member's home — 21 address lines already say *c/o*. On a map that is a private
  home labelled with an NGO's name. Only addresses the organisation publishes as the chapter's
  place should become coordinates.

### G4 — Permission and politeness, per NGO · **blocking for publication · research + human**

Atlas's rules: robots.txt is mandatory and re-checked every run, the stricter `Crawl-delay` is
honoured, the User-Agent carries a contact address, and a courtesy mail is recommended
(`INVESTIGATE-ngo-scraping-infrastructure.md` §A, §D). There is **no written policy on
republishing NGO website content** — each NGO is a human decision.

Measured 3 Oct 2026 (`curl https://<site>/robots.txt`):

| Site | Disallows our paths | Crawl-delay for `*` |
|---|---|---|
| 4h.no | no | **5 s** — ⚠️ the 26 Sep crawl ran at 0.9 s. Fixed in `site-chapters.ts` (`crawlDelayMs`); the 4H data itself is fine, the rate was not |
| sanitetskvinnene.no | no | 10 s for Scrapy only |
| folkehjelp.no | no | 10–15 s for MJ12bot/AhrefsBot only |
| the other eight | no | none |

Remaining: a terms-of-use read per site, and the courtesy mails (N.K.S. and Folkehjelp are
already flagged as pending in both projects).

### G5 — Fields Atlas marks FUTURE · **defer**

Meeting times, age range, language, drop-in, cost, accessibility, join/volunteer links
(`INVESTIGATE-supply-frontend-display.md`, `INVESTIGATE-ngo-events-and-minisites.md`). The
research holds almost none of them structured (`targetGroups` on 8 of 200 definitions). They
live in free text and per-event pages. Worth a separate investigation after v1; not a reason to
delay the handover.

### Not gaps

- **Chapters, hierarchy, registration, provenance, freshness** — done and validated.
- **"Sist oppdatert"**, which Atlas marks REQUIRED v1 — every record carries `freshness.fetchedAt`.
- **ICNPO for every voluntary organisation** — `data/_icnpo/`, 95 008 rows.

---

## 2. What Atlas should change to receive it

| # | Change | Kind | Who decides |
|---|---|---|---|
| A1 | Extend `ref_atlas_service_category` (≈30 + families); add `ref_atlas_service_category_term`; replace the `CASE` with `crosswalk_activity_service_category` | seeds | Atlas Q4 — human |
| A2 | `dim_chapter` columns: `unit_kind`, `registration`, `parent_method`, `reconciliation`, `confidence`, `latitude`, `longitude`, `source_url`; `chapter_level` gains `related_entity` | model | agent, documented |
| A3 | `dim_activity` columns: `description`, `description_language`, `origin`, `aliases` | model | agent |
| A4 | Programme-level activities applied to all chapters of a type (the `programme_only` shape exists in the design, not in the models) | model | agent |
| A5 | `mart_activity_search` with a `norwegian` tsvector → `api_v1.activity_search` | new published relation | **human** |
| A6 | A documented **"derived research source"** class: raw tables of `(key, doc jsonb)` holding a dataset that is itself derived, with its derivation fields carried per row. Atlas's raw rule is "verbatim upstream" — this makes the exception explicit instead of quiet | contract | **human** |
| A7 | A written policy for republishing NGO website content (licence, courtesy, takedown), since §C of the scraping investigation covers politeness but not rights | policy | **human** |
| A9 | Amend `INVESTIGATE-ngo-scraping-infrastructure.md` §D.3: published contact persons are stored, as published, with source URL and `is_masked`; removed when the page removes them. Contacts in a public `dim_chapter_contact`, not `private_marts` | contract | **owner — decided 3 Oct 2026** |
| A8 | Chapter id crosswalk: research `<slug>:<orgnr>` → Atlas `<slug>-<orgnr>`; Red Cross `branch_id` joins on organisation number when NRX lands | seed | agent |

---

## 3. How to hand over

Atlas takes in data three ways (`AGENT-onboard-source.md`, `src/seed-sources/`):
a **source** (ingest code + migration + manifest, scheduled by Dagster), a **seed source**
(committed JSON/CSV, refreshed by hand, versioned by git), or a **private data repo**
(`atlas-private-data-repo/<ngo>/`, for data that must not be public).

**Decision 2026-10-04 (owner): Atlas runs the ingestion itself; the research tells it how.** The
research never delivers scraped data for Atlas to load. It delivers the method, and checks Atlas's
results against what it measured. (An earlier draft of this section proposed a seed-source data
package; it is withdrawn.)

### What the research delivers

```
docs/research/ngo-research/
  ingestion-specs/
    README.md                  how to use the specs; order; mapping onto Atlas's framework
    <source>.md                one per source: discovery, politeness, selectors → Atlas columns,
                               traps as rules, personal data, acceptance targets, open gaps
    acceptance-targets.csv     per NGO: chapters, levels, both/registry_only/source_only,
                               registration, kommune, coordinates, hierarchy links, activities,
                               published contacts — measured 2026-09-26/27
    reference-code/            the research's TypeScript extractors, for reading, not running
  taxonomy files (PR 2)        curated vocabulary: categories, families, search terms, crosswalk
```

- **Specs, not data.** Each spec says where to fetch, how to parse, which traps the research hit
  and the rule that avoids each, how to reconcile with Brreg, and what is personal.
- **Reference code** shows a working parser for every rule. Atlas rewrites it in its own form
  (`PLAN-001-scraping-infrastructure.md`): Crawlee `CheerioCrawler`, `lib/scraping` (robots,
  User-Agent with contact, `record_hash`, `html_raw_hash`, page cache), `discover.ts` / pure
  `parse.ts` with golden-file tests, verbatim `raw.<source>_*`, reconciliation and hierarchy as
  dbt models — so the raw-is-verbatim rule holds and every derivation is visible in dbt.
- **Acceptance targets.** Atlas's run of a source is compared with the research's counts. A
  fresh run will differ somewhat (sites change); a large gap is the signal to look, not a number
  to force.
- **Curated vocabulary is delivered as files** — the taxonomy and the crosswalk are reference data,
  like Atlas's own `ref_atlas_service_category`.
- **Personal data:** Atlas's own scrapers write published contact persons to `private_raw` /
  `private_marts` (owner decision 2026-10-03); nothing personal goes into public tables or the
  public repo.

Order by value: Brreg chapter matching and `underenheter` (registry, NLOD) → N.K.S. →
Nasjonalforeningen → Kirkens Bymisjon → Frelsesarmeen → Røde Kors (rodekors.no, like the others)
→ Folkehjelp, LHL, Diabetesforbundet, Mental Helse, 4H → Speiderforbundet (method still open).

### Mechanics

Atlas works through plan files and PRs, and takes fleet requests through
`terchris/urb-agents` `mailboxes/atlas/inbox/` (`project-atlas.md`). Proposed:

1. The research writes **`INVESTIGATE-ngo-research-handover.md`** in Atlas's plan format
   (`PLANS.md`: abstract, status, `[Q]` decision ids) carrying §1–§3 of this document, and the
   Phase 1 package.
2. Delivered as **one PR to `terchris/atlas`** from a feature branch: the INVESTIGATE file in
   `plans/backlog/` and the package — or, if Atlas prefers, a request in the Atlas mailbox
   pointing at a tagged release of the package. Either way a human merges; nothing is pushed to
   `main`.
3. The Atlas agent turns the accepted INVESTIGATE into PLANs (A1–A8) and runs its own gates.

---

## Next steps — in order

| Step | Owner | Blocks |
|---|---|---|
| G1 draft taxonomy + crosswalk + synonyms | research | cross-NGO search |
| G2 national activity catalogues for 4H, Speiderforbundet, LHL, Diabetesforbundet, Mental Helse, Folkehjelp | research | activities for 7 NGOs |
| G3 kommune from postal code / coordinates (288 units) | research | coverage |
| G4 terms-of-use read per site | research | publication |
| Export script + Phase 1 package | research | handover |
| Courtesy mails; per-NGO publication decisions (A7) | **human** | publication |
| A5, A6 decisions | **human** | serving |
