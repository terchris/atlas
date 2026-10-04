# Ingestion spec — Kirkens Bymisjon

**Status · Atlas runs this.** One source: the WordPress REST API on `kirkensbymisjon.no`, custom
post type `tilbud` (services) with two taxonomies, plus one HTML fetch per service for its
description. Kirkens Bymisjon is a **unitary** organisation (Stiftelsen Kirkens Bymisjon, orgnr
944384448); its registered sites are Brreg sub-units, read by `brreg-underenheter.md`. Here the
local unit is a **service at a place**: 144 services become 349 local units.

## Sources and discovery

| | |
|---|---|
| Base | `https://kirkensbymisjon.no/wp-json/wp/v2` |
| Places | `GET /tilbud-location?per_page=100` — 59 places |
| Categories | `GET /tilbud-type?per_page=100` — 9 categories |
| Services | `GET /tilbud?per_page=100&page=N&_fields=id,slug,link,title,modified,tilbud-location,tilbud-type` — page until **400** |
| Description | each service's `link` (HTML) — 144 pages |
| Local unit | (service × location): 144 services → 349 units |

## Politeness

- robots.txt allows `/wp-json/` and the service pages (measured 2026-10-03); no Crawl-delay for `*`.
- Rate that worked: 700 ms between page fetches, 60 s timeout, 3 attempts.
- User-Agent with contact, as Atlas `lib/scraping/ua.ts` builds it; robots.txt checked per URL.

## What to read → Atlas columns

**dim_chapter** (one row per service × location; plus the national row)

| Source | Rule | Atlas column |
|---|---|---|
| `slug` + location `slug` | `kirkens-bymisjon:<slug>-<locslug>` | `chapter_id` |
| constant | `944384448` | `ngo_orgnr` |
| constant | `LOCAL` | `chapter_level` |
| the national body | `944384448` | `parent_chapter_id` |
| Brreg sub-unit match (dbt) | | `chapter_orgnr` |
| `title.rendered` + place | `localName`: append ", <place>" unless every token of the place slug is already in the name | `name` |
| sub-unit address / place → kommune (dbt) | | `kommune_nr` |
| present in API | true | `is_active` |
| — | not in the API | `postal_address_line1`, `postal_code`, `post_office` |
| — | not read | `phone`, `email` |
| `link` | | `web` |

Proposed columns

| Source | Rule | Column |
|---|---|---|
| `tilbud-type` term name | first term; assignment method `SOURCE_TAXONOMY` | `chapter_type` |
| Brreg match | `sub_unit` or `unregistered` | `registration` |
| constant | `service` | `unit_kind` |
| — | not published | `latitude`, `longitude` |
| place only | `kommune` until geocoded (R9) | `location_precision` |
| `link` | | `source_url` |
| `modified` | real upstream timestamp | proposed `source_updated_at` |

**Activities** (the service itself is the activity)

| Source | Rule | Atlas column |
|---|---|---|
| `title.rendered` | entity-decoded | `dim_activity.canonical_name` |
| the post body `.wp-block-post-content`, minus `.wp-block-kbm-link-list` | verbatim, see rule 5 | `dim_activity.description` |
| `og:description`, cut back to whole sentences | verbatim | `dim_activity.summary` (new) |
| number of locations | >1 → `NATIONAL`, else `LOCAL` (inferred; store the evidence) | `dim_activity.origin` |
| — | none observed | `dim_activity.aliases` |
| name per location | as published | `fact_chapter_activities.local_activity_name` |

## Rules and traps

All from `reference-code/src/sources/kirkens-bymisjon-tilbud.ts` unless noted.

1. **The unit is service × location,** not the service and not the page.
2. **Local names by token, not substring.** Append ", <place>" unless all tokens of the place's
   slug are already in the name; a substring test gives false matches.
3. **Stop paging on 400.**
4. **Descriptions are not in the API.** `content.rendered` and `excerpt.rendered` are empty because
   the pages are built from Gutenberg blocks. Fetch the page.
5. **The description is the post body, not the link list.** `<p class="kbm-link-list-item__description">`
   is the summary of a *sub-page* listed on the page — A-senteret's first one is its residential
   unit's. The research's first extractor took it as the service's description, for 139 services;
   the service's own text is the body of `.wp-block-post-content` with the
   `.wp-block-kbm-link-list` removed. Its one-line summary is `og:description`, which WordPress
   truncates with an ellipsis — cut back to whole sentences.
6. **`modified` is real** — use it for source-updated and asserted time here, unlike the HTML
   sources. A retrieval timestamp must be a full date-time, not a date.
7. **Origin is inferred** from the number of locations; record that it was inferred.
8. Known slug quirk: `sitename-sep-title-page` is the site's own slug for *Unikum* — keep it as
   the id, use the title for the name.
9. Shared text traps (`lib/text.ts`): decode entities (the original table was thin); fold Ø/Æ/Å
   before NFD; the language detector must not read Norwegian `for` as English.
10. Batch guard at 30% changed; a description that empties is a parse suspect.

### Full description text (R10, measured 2026-10-04)

Run after the activity extractor: `reference-code/src/sources/activity-descriptions.ts` with the
shared `reference-code/src/lib/description.ts` (Cheerio). Rules that hold for every NGO:

- **Verbatim, block by block.** One block per heading, paragraph or list item, blank line between;
  `<br>` stays a line break; list items start with `- `. Nothing summarised or translated.
- **Navigation is not text.** A paragraph that is only one link ("Les mer om …") is dropped.
- **Site furniture is counted, not guessed.** A block that appears verbatim on 4 or more of one
  NGO's activity pages is the site's, not the activity's, and is dropped (Kirkens Bymisjon: 11
  blocks — "Bli frivillig!" and its recruitment paragraph on 17 pages, section mission statements,
  webshop promotions, the privacy link).
- **The text names people.** Descriptions end "contact our conductor <name> on <number>"; a rota
  lists priests by first name. A phone number or e-mail sets `containsPersonalData`; a name alone
  cannot be detected reliably. Treat description text as possibly personal: store it as published,
  and keep quotes out of public examples.
- **What the text states** about cost, age, schedule, how to join, target group, language and place
  is found by keyword rules and kept as the sentence that says it
  (`reference-code/src/sources/activity-facts.ts`).

## Personal data

This source reads no personal data: no names, phones or emails are taken. If Atlas extends the
parser to contact blocks, those go to the private path only; use `<name>`, `9x xx xx xx`,
`<name>@example.org` in tests and docs.

## Acceptance targets

From `acceptance-targets.csv` (measured run 2026-09-26/27), after reconciliation with Brreg:

| chapters | local / regional / related | both / registry-only / source-only | sub-unit / unregistered | with kommune | coords | regional links | defs | links | contacts |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|
| 433 | 431 / 0 / 2 | 67 / 84 / 282 | 151 / 282 | 151 | 0 | 0 | 144 | 349 | 0 |

144 activity definitions; 135 with full body text (median 120 words, 22 298 in all, after 11 furniture
blocks are removed), 140 with a summary, 7 whose text carries a phone or e-mail. Two pages have no
body text (Camp Hudøy, Verdensrommet). A fresh run will differ somewhat; a large gap is the signal.

## Reference implementation

`reference-code/src/sources/kirkens-bymisjon-tilbud.ts` with `reference-code/src/lib/`; the registry
side is `brreg-subunits.ts`. It runs as-is (see the package README). In Atlas's framework:

- `discover.ts`: the two taxonomies, then page `tilbud` until 400.
- Crawlee for the 144 description pages via `lib/scraping` (robots, ua, kv cache).
- pure `parse.ts`: API object → service; page HTML → description; golden tests on a
  multi-location service, the Unikum slug, a page whose first description is opening hours, and
  an `og:description` fallback.
- `raw.kirkens_bymisjon_tilbud`, `raw.kirkens_bymisjon_tilbud_location`,
  `raw.kirkens_bymisjon_tilbud_type`, `raw.kirkens_bymisjon_tilbud_page`, verbatim.
- dbt: service × location expansion, local names, sub-unit match.

## Open gaps

- Only 67 units match a Brreg sub-unit; 84 sub-units have no published service.
- Some pages are hubs: a frivilligsentral page describes eight or more offers (Sør-Varanger: a BUA
  equipment point, a baby group, a seniors' choir, patient hosts). Splitting hubs into activities is R3.
- No addresses or coordinates; place only.
