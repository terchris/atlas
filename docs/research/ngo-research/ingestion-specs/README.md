# Ingestion specs — how Atlas ingests the NGOs' chapters and activities

**Atlas runs the ingestion itself; these specs tell it how** (owner decision, 2026-10-04). The
atlas-research project built and ran extractors for eleven NGOs and Brønnøysund in September 2026.
What it learned is written here as one spec per source, with the research's complete, runnable code
and its measured results as acceptance targets. No scraped data is delivered; Atlas produces its own.

## How to use them

1. **Read the spec, then the code.** The spec states the method and every trap as a rule.
   `reference-code/` is the research's complete ingest package — every extractor, the
   reconciliation, hierarchy and classification steps, and the shared `lib/` (robots.txt,
   Crawl-delay, lossless page cache). It runs as-is (`npm ci`, then `NGO_ROOT=<scratch dir>`
   and `ATLAS_SCRAPE_CONTACT_EMAIL`; see its `README.md`), so Atlas can reproduce the research's
   results before porting a source.
2. **Build in Atlas's scraping form** (`plans/completed/PLAN-001-scraping-infrastructure.md`):
   Crawlee `CheerioCrawler`, `lib/scraping` (robots per URL and run, User-Agent with contact,
   `record_hash`, `html_raw_hash`, page cache), `discover.ts` / pure `parse.ts` with golden-file
   tests, a verbatim `raw.<source>_*` table. Reconciliation, hierarchy and classification are
   derivations: dbt models, not ingest code.
3. **Check the run against the acceptance targets** (`acceptance-targets.csv`). A fresh run will
   differ somewhat because sites change; a large gap is the signal to look, not a number to force.
4. **Personal data goes to the private path.** Every spec lists the fields that can hold a person
   (names, mobile numbers, private e-mail addresses, `c/o` lines). Published contact persons are
   stored (owner decision, 2026-10-03), but only in `private_raw` / `private_marts`, never in public
   tables or the public repo.

## The specs

Cross-cutting — read these first:

| Spec | What it covers |
|---|---|
| [`brreg-chapter-matching.md`](brreg-chapter-matching.md) | Finding the chapters of the federated NGOs among the voluntary organisations Atlas already holds from Brreg, by name and activity signals — a dbt model, not a new ingest. Precision 93.6% / recall 95.4%, measured on Røde Kors |
| [`brreg-underenheter.md`](brreg-underenheter.md) | The unitary NGOs' local units (Frelsesarmeen 175, Kirkens Bymisjon 151) through `overordnetEnhet` — the one registry source Atlas does not ingest today |
| [`description-redaction.md`](description-redaction.md) | Showing an NGO's activity text publicly without the people in it: phone, e-mail and names replaced, a link to the original, uncertain texts held for review — measured on 188 descriptions |
| [`geocoding-input.md`](geocoding-input.md) | Every place we know for every chapter and activity in one file, with the most precise point each may get — the input for one general geocoder (R9) |
| [`reconciliation-hierarchy-classification.md`](reconciliation-hierarchy-classification.md) | Joining registry and website rows into one chapter, linking each unit to the tier above (URL path, sitemap path, county inference), classifying governance vs operational units and related entities |

Per NGO, in the suggested build order:

| Spec | Source | Status |
|---|---|---|
| [`sanitetskvinnene.md`](sanitetskvinnene.md) | sitemap crawl + national activity catalogue | proven; contact-name fix untested live |
| [`nasjonalforeningen.md`](nasjonalforeningen.md) | WordPress REST API | proven |
| [`kirkens-bymisjon.md`](kirkens-bymisjon.md) | WordPress REST API + taxonomies | proven; full descriptions still to add |
| [`frelsesarmeen.md`](frelsesarmeen.md) | sitemap crawl, card-level | proven; 1.5 s between requests |
| [`redcross.md`](redcross.md) | rodekors.no district and branch pages — scraped like every other NGO, not via its API; activities with the branch's own text | proven 2026-10-04 |
| [`folkehjelp.md`](folkehjelp.md) | section sitemap | proven |
| [`lhl.md`](lhl.md) | content sitemap | proven |
| [`diabetesforbundet.md`](diabetesforbundet.md) | content sitemap | proven |
| [`mental-helse.md`](mental-helse.md) | per-chapter WordPress subsites, listed in robots.txt | proven |
| [`fire-h.md`](fire-h.md) | sitemap; Crawl-delay 5 s | proven (verification only — pages carry little) |
| [`speiderforbundet.md`](speiderforbundet.md) | blispeider.no group finder (JSON index + group pages); krets from each group's page | proven 2026-10-04 |

## Acceptance targets

[`acceptance-targets.csv`](acceptance-targets.csv): per NGO, from the research's run of
2026-09-26/27 — chapters by level, how each was confirmed (both / registry only / source only),
registration, units with a kommune and with coordinates, regional parent links, activity
definitions, chapter–activity links, published contacts, and — added 2026-10-04 (R10) — activity
definitions with full description text and their median length. Totals: 4 021 chapters (4 032 rows
with the national bodies), 2 419 confirmed by both registry and website. Rows for Røde Kors, Speiderforbundet and the six NGOs
re-matched on 2026-10-04 are from that date.

## What the specs do not yet cover

Geocoding (the input is prepared: `geocoding-input.md`) is
still being worked out by the research (task R9 in its plan; R10, R8 and R3 were added on 4 Oct). Each will arrive as an
updated spec and new targets.
