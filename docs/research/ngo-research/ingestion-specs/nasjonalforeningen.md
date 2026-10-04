# Ingestion spec — Nasjonalforeningen for folkehelsen

**Status · Atlas runs this.** One source: the WordPress REST API on `nasjonalforeningen.no`, custom
post type `local_branch`. About five API calls return all 431 branch pages, each with its rendered
HTML; no page-by-page crawl is needed. This NGO matters beyond its own size: 121 of the
LOW-confidence registry matches (88%) were its "<place> helselag / demensforening" units, and this
source is what confirms them. It is also the only source in the dataset with a membership figure.

## Sources and discovery

| | |
|---|---|
| Endpoint | `GET https://nasjonalforeningen.no/wp-json/wp/v2/local_branch?per_page=100&page=N&_fields=id,slug,link,title,content` |
| Paging | increase `N` until the API answers **400** (past the last page) — that is the stop signal, not an error |
| Volume | ~5 calls → 431 branches |
| County | second path segment of `link`: `/lokallag/<county>/<chapter>/` |
| Hierarchy | parents come from the URL path (county → branch), as `upgrade-hierarchy.ts` does |

## Politeness

- robots.txt allows `/wp-json/` and `/lokallag/` (measured 2026-10-03); no Crawl-delay for `*`.
- Rate that worked: the five calls in sequence, no added delay, 60 s timeout.
- User-Agent with contact, as Atlas `lib/scraping/ua.ts` builds it; robots.txt checked per URL.

## What to read → Atlas columns

**dim_chapter**

| Source (JSON field / selector in `content.rendered`) | Rule | Atlas column |
|---|---|---|
| `slug` | `nasjonalforeningen:<slug>` (id from source) | `chapter_id` |
| constant | Nasjonalforeningen's orgnr | `ngo_orgnr` |
| constant | `LOCAL`; county units `REGIONAL` | `chapter_level` |
| `link` path segment 2 | county chapter id | `parent_chapter_id` |
| Brreg match (dbt) | | `chapter_orgnr` |
| `title.rendered` | entity-decoded | `name` |
| Brreg match / county | dbt | `kommune_nr` |
| present in API | true | `is_active` |
| — | not published | `postal_address_line1`, `postal_code`, `post_office` |
| `tel:` link in contact block | private path only | `phone` |
| `mailto:` link | role addresses only; personal → private path | `email` |
| `link` | | `web` |

Proposed columns

| Source | Rule | Column |
|---|---|---|
| name ends in "demensforening" / "helselag" / else | `Demensforening` / `Helselag` / `Lokallag` | `chapter_type` |
| Brreg match | `legal_entity` or `unregistered` | `registration` |
| constant | `chapter` | `unit_kind` |
| — | not published | `latitude`, `longitude` |
| — | from geocoding (R9) only | `location_precision` |
| `link` | | `source_url` |
| `class="…branch-members-count__value…"` | strip tags, read digits | proposed `member_count` |

**Activities**

| Source | Rule | Atlas column |
|---|---|---|
| list items under `<h2>Med oss-aktiviteter</h2>` | text as written | `fact_chapter_activities.local_activity_name` |
| distinct resolved names | | `dim_activity.canonical_name` |
| `https://nasjonalforeningen.no/folkehelse/lokale-aktiviteter/`: the blocks after the `<h2>`/`<h3>` whose text is the activity's name, up to the next heading of the same or higher level | verbatim | `dim_activity.description` |
| used by many chapters | `NATIONAL`; else `LOCAL` | `dim_activity.origin` |
| spelling variants seen | | `dim_activity.aliases` |

## Rules and traps

1. **Stop on 400.** WordPress answers 400 past the last page; treat it as the end of the list
   (`nasjonalforeningen-chapters.ts`).
2. **Member count: capture the whole `<p>`, then strip.** An svg icon sits between the class
   attribute and the number, so a regex that expects digits right after the class finds nothing
   (`nasjonalforeningen-chapters.ts`).
3. **Reject activity entries that contain a year (19xx/20xx)** and log them. 32 chapters have
   labels like "MEDLEMMER RCS Sept 2026" pasted into the activity list
   (`nasjonalforeningen-chapters.ts`).
4. **County comes from the URL, not the title.** Path segment 2 of `/lokallag/<county>/<chapter>/`.
5. **Ids come from the source slug** (stable), not from a slugified name.
6. Shared text traps (`lib/text.ts`): decode entities in `title.rendered` (the original table was
   too thin); fold Ø/Æ/Å before NFD; `stripHtml` collapses newlines.
7. Change detection per block as in the other HTML sources; the API's `modified` field is not
   requested by the reference code — request it, and use it as `sourceUpdatedAt` only if it is
   present per post.
8. Batch guard: refuse to write if more than 30% of chapters changed.

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

Most branch pages publish a leader name (`leader-name` class), a phone number and an email.
These go to Atlas's private path only, never to `dim_chapter` or any public table. In tests and
docs use `<name>`, `9x xx xx xx`, `<name>@example.org`.

## Acceptance targets

From `acceptance-targets.csv` (measured run 2026-09-26/27):

| chapters | local / regional / related | both / registry-only / source-only | legal / unregistered | with kommune | coords | regional links | defs | links | contacts |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|
| 493 | 476 / 17 / 0 | 311 / 59 / 123 | 370 / 123 | 312 | 0 | 414 | 6 | 470 | 414 |

431 branches come from the API; the rest of the 493 comes from reconciliation with Brreg. All 6
activities have a description from the national page (median 46 words, 333 in all; 2026-10-04).
"Med oss" is the general programme of local activities: Gåfotball and Syng med oss are filed under
dementia, the others are for everyone. A fresh run will differ somewhat; a large gap is the signal.

## Reference implementation

`reference-code/src/sources/nasjonalforeningen-chapters.ts` with `reference-code/src/lib/`, plus
`upgrade-hierarchy.ts` for parents. It runs as-is (see the package README). In Atlas's
framework:

- `discover.ts`: page the REST endpoint until 400.
- Crawlee (or a plain JSON fetch through `lib/scraping`) with robots, ua and kv cache.
- pure `parse.ts`: one API object in, one record out; golden tests on saved objects, including
  one with a year-polluted activity list and one with the svg member count.
- `raw.nasjonalforeningen_local_branch`, the API object verbatim, with `record_hash`.
- dbt: county hierarchy, Brreg matching (confirms the LOW-confidence helselag matches),
  activity resolution.

## Open gaps

- No addresses and no coordinates: location only through Brreg or geocoding (R9).
- The national page also describes **Les med oss, Lek med oss and Aktivitetsvenn**, which no chapter
  lists in the API; they exist as national activities without chapter links.
- 123 branches have no Brreg match; 59 registry units have no branch page.
