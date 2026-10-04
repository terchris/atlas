# Ingestion spec — Norske Kvinners Sanitetsforening (Sanitetskvinnene)

**Status · Atlas runs this.** Two sources on `sanitetskvinnene.no`: the chapter pages (one page per
local association, ~552 pages) and the national activity catalogue (themes and programmes). The
site has no JSON API, so both are HTML scrapes. N.K.S. is the only NGO in the research whose
chapter pages carry coordinates and whose catalogue carries real activity descriptions. NGO orgnr
970168001. The research crawled it to prove the method and set the targets below; Atlas's own run
is the production data.

## Sources and discovery

| | |
|---|---|
| Chapter list | `https://sanitetskvinnene.no/sitemap.xml` — every `<loc>` matching `https://sanitetskvinnene.no/lokalforening/…`; strip a trailing `/`, de-duplicate |
| Excluded | any URL containing `/velg-forening` — the site's chapter picker, which carries a test leader (found by hand audit, 3 Oct 2026) |
| Chapter page | `https://sanitetskvinnene.no/lokalforening/<slug>` — HTML only; `?_format=json` returns **406** |
| Themes | `https://sanitetskvinnene.no/foreningsnett/aktiviteter/<slug>`: eldre, integrering, kvinnehelse, naeringsliv, omsorgsberedskap, ressursvenn |
| Programmes | `https://sanitetskvinnene.no/foreningsnett/aktiviteter-frivillige/<slug>`: asylmottak, kanskje-kommer-kongen, klovertur, motherhood, sprakvenn (each with its parent theme) |
| Catalogue discovery | the hard-coded list is lossy — a sitemap sweep found `sisterhood`. Discover from the sitemap (`/foreningsnett/aktiviteter*`) rather than a fixed list |
| Volume | ~552 chapter pages, ~17 min at 1 req/s |

## Politeness

- robots.txt allows our paths (measured 2026-10-03). Its `Crawl-delay: 10` applies to Scrapy
  only; there is no delay for `*`.
- Rate that worked: 1 request per second for chapters (`--delay 1000`), 800 ms for the catalogue.
  No rate-limit responses were recorded.
- User-Agent with contact, as Atlas `lib/scraping/ua.ts` builds it; refuse to run without a
  contact address (the research used `ATLAS_SCRAPE_CONTACT_EMAIL`, same variable as Atlas).
- robots.txt checked per URL; a Disallow is a hard failure, never a retry.

## What to read → Atlas columns

**dim_chapter** (one row per chapter page; plus the national row)

| Source | Rule | Atlas column |
|---|---|---|
| URL slug | `sanitetskvinnene:<slug>` | `chapter_id` |
| constant | `970168001` | `ngo_orgnr` |
| constant | `LOCAL` (national row `NATIONAL`) | `chapter_level` |
| reconciliation | the regional (fylke) association, from dbt hierarchy models | `parent_chapter_id` |
| Brreg match (dbt) | legal entity's orgnr when matched | `chapter_orgnr` |
| ld+json `BreadcrumbList` last `itemListElement.name`; fallback `<title>` split on `" - "`, first part | trimmed | `name` |
| Brreg match / postal code → kommune | dbt | `kommune_nr` |
| page present in sitemap | true | `is_active` |
| `.field--name-field-address` block, text after "Besøksadresse" | street line | `postal_address_line1` |
| same block, `(\d{4})\s+([A-ZÆØÅ][^\n]*)$` | group 1 / group 2 | `postal_code` / `post_office` |
| contact block `tel:` | private path only (see Personal data) | `phone` |
| contact block `mailto:` | role addresses only; personal → private path | `email` |
| page URL | | `web` |

Proposed columns

| Source | Rule | Column |
|---|---|---|
| name contains "Unge Sanitet" / "Sanitetslag" / else | `Unge Sanitet` / `Sanitetslag` / `Sanitetsforening` | `chapter_type` |
| Brreg match | `legal_entity` or `unregistered` | `registration` |
| constant | `chapter` | `unit_kind` |
| page JSON `"lat":<n>` then `"lon":<n>` | latitude first, longitude second | `latitude`, `longitude` |
| address kind | `meeting_venue` — the published venue, not the registered address | `location_precision` |
| page URL | | `source_url` |

**Activities**

| Source | Rule | Atlas column |
|---|---|---|
| theme/programme page `<h1>` | | `dim_activity.canonical_name` |
| first three `<p>` > 60 chars after removing script/style/nav/header/footer; skip Grasrotandelen and pdf paragraphs; cap 1 200 chars | verbatim | `dim_activity.description` |
| catalogue page → `NATIONAL`; chapter-only name → `LOCAL` | | `dim_activity.origin` |
| ALIAS_SEED + observed local spellings | e.g. `omsorgsber`, `omsorgsberedskapsgruppe` → omsorgsberedskap | `dim_activity.aliases` |
| chapter page: section after `<h2>Aktiviteter</h2>`, one activity per `<h3>` | text as written | `fact_chapter_activities.local_activity_name` |

Target groups and delivery modes were derived from transparent keyword lists in the description;
keep the list in dbt, not in the parser.

## Rules and traps

1. **Capture the address after the opening tag closes.** Use
   `/field--name-field-address[^>]*>([\s\S]*?)(?:<\/section>|field--name-field-social|<h2)/`, strip
   "Besøksadresse" and a trailing " Norge" (`nks-chapters.ts`).
2. **Contacts: start after the tag, not inside it.** The earlier regex began mid-attribute and gave
   all 543 contacts the given name `field--type-string` — every record passed schema validation.
   Use `/field--name-field-leader-full-name[^>]*>([\s\S]{0,600})/`; take email first, then phone,
   then the name is the text before `Adresse|Sosiale medier|Bli medlem|Nyhetsbrev`
   (`nks-chapters.ts`). This fix is not yet proven on the live site (plan item R4) — golden-test it.
3. **Coordinates: lat before lon.** Read `"lat"` then `"lon"` by name; never by position.
4. **Exclude `/velg-forening`** from discovery.
5. **Resolve activities** catalogue id → alias → ALIAS_SEED; an unresolved name becomes a `LOCAL`
   stub, a promotion candidate once used by at least max(3, 5% of chapters)
   (`nks-chapters.ts`).
6. **Catalogue descriptions:** warn on fewer than 25 words; do not copy Grasrotandelen boilerplate
   (`nks-activities.ts`).
7. **Change detection per block,** hashed over extracted, normalised values: identity
   [name, chapterType] (structural), location (slow), communication (slow), contacts sorted
   (annual), activity names sorted (volatile). Pages carry **no modified date**: freshness is
   unknown and `assertedAt` must stay empty.
8. **A block that was filled and is now empty is a parse suspect, never a removal.**
9. **Batch guard:** refuse to write if more than 30% of chapters changed (override deliberately);
   warn if the parse rate drops under 95%.
10. Shared text traps (`lib/text.ts`): Ø/Æ/Å do not decompose under NFD — fold them before any
    normalisation; `stripHtml` collapses newlines, so do not use it where lines carry meaning.

## Personal data

Each chapter page publishes a leader's name, often a mobile number and sometimes a private email.
These go to Atlas's private path (`private_raw` / `private_marts`) only, never to `dim_chapter`
or any public table. Public `phone`/`email` hold only role or organisation addresses. In tests
and docs use `<name>`, `9x xx xx xx`, `<name>@example.org`. Chapter mobile
numbers were withheld from every public file in the research.

## Acceptance targets

From `acceptance-targets.csv` (measured run 2026-09-26/27):

| chapters | local / regional / related | both / registry-only / source-only | legal / unregistered | with kommune | coords | regional links | defs | links | contacts |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|
| 575 | 570 / 4 / 1 | 439 / 24 / 112 | 463 / 112 | 405 | 548 | 33 | 14 | 649 | 542 |

14 activity definitions = 12 national + 2 local; description median ~94.5 words. A fresh run
will differ somewhat; a large gap is the signal.

## Reference implementation

`reference-code/src/sources/nks-chapters.ts` and `reference-code/src/sources/nks-activities.ts`, with
`reference-code/src/lib/`. It runs as-is (see the package README). In Atlas's framework:

- `discover.ts`: sitemap → chapter URLs (minus `/velg-forening`) and catalogue URLs; logged via
  `sitemap_log`.
- Crawlee CheerioCrawler with `lib/scraping` (robots, ua, kv cache, `html_raw_hash`).
- pure `parse.ts`: HTML in, record out — no I/O; golden tests on saved pages, including one with
  a leader block and one without coordinates.
- `raw.sanitetskvinnene_chapter_page` and `raw.sanitetskvinnene_activity_page`, verbatim, with
  `record_hash`; an `ingest_runs` row per run.
- dbt: Brreg matching, regional parents, activity resolution and the block hashes.

## Open gaps

- R4: the contact-parser fix is untested on the live site.
- Three activities have no public description of their own (2026-10-04): **Dig In** and **Lesevenn**
  have no national page, only chapter pages; **Sisterhood**'s pages (`/sisterhood` and the catalogue)
  are training material for chapters — the only text for the girls themselves is a news article.
- 112 chapters have no Brreg match (unregistered); kommune is known for only 405 of 575.
- No modified date on any page; change can only be detected, not dated.
