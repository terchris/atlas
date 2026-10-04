# Ingestion spec — Frelsesarmeen

**Status · Atlas runs this.** One HTML source: the `lokalavdeling` pages on `frelsesarmeen.no`,
discovered from the site's department sitemap. Frelsesarmeen is a **unitary** organisation
(orgnr 938498318): its korps, Fretex shops and services are Brreg **sub-units**, read by the
separate `brreg-underenheter.md` spec. This spec gives the published side; dbt reconciles the two
on organisation number first.

## Sources and discovery

| | |
|---|---|
| Sitemap | `https://frelsesarmeen.no/sitemaps-1-categorygroup-departments-1-sitemap.xml` |
| Pages | every `<loc>` containing `/lokalavdeling/` — 139 pages |
| Unit | **the contact card, not the page**: 139 pages → 316 cards → 307 distinct units |
| Hubs | place pages list many units: Oslo 49, Trondheim 16, Bergen 13 |
| Activities | links to `/korps/<slug>` in the "VÅRE TILBUD I …" list — 21 pages carry one |

## Politeness

- robots.txt allows `/lokalavdeling/` and the sitemap (measured 2026-10-03); no Crawl-delay for `*`.
- **Rate:** the site returns **429** from roughly 120 requests at ~2.5 req/s. **1 request per
  1.5 s works** (~6 min for 139 pages). The reference code's 700 ms default is too fast — use 1.5 s.
- 60 s timeout, 4 attempts with backoff.
- User-Agent with contact, as Atlas `lib/scraping/ua.ts` builds it; robots.txt checked per URL.

## What to read → Atlas columns

**dim_chapter** (one row per distinct card)

| Source (within a card `<li><div class="py-4…">…</li>` after "KONTAKTINFO") | Rule | Atlas column |
|---|---|---|
| orgnr, else slug of name | `frelsesarmeen:<orgnr or slug>` | `chapter_id` |
| constant | `938498318` | `ngo_orgnr` |
| name has "divisjon" or "region" | `REGIONAL`, else `LOCAL` | `chapter_level` |
| the national body | `938498318` | `parent_chapter_id` |
| `Organisasjonsnr:` line | exactly 9 digits, never `938498318` | `chapter_orgnr` |
| card heading | `Frelsesarmeens? <area>, <unit>` → full text | `name` |
| Brreg sub-unit address (dbt) | | `kommune_nr` |
| present in sitemap | true | `is_active` |
| first unlabelled `font-light text-xs` div without a link | street line | `postal_address_line1` |
| same div, `\d{4} <place>` | | `postal_code` / `post_office` |
| `Telefon:` line | unit's line; `Mobil:` → private path | `phone` |
| block's first email | the unit's shared address | `email` |
| website anchor | `href` of 8+ chars, not a `lokalavdeling` link | `web` |

Proposed columns

| Source | Rule | Column |
|---|---|---|
| part before the comma ("rusomsorg", "seksjon for oppvekst") | service area; else `Korps` / `Fretex` / `Virksomhet` | `chapter_type` |
| orgnr in Brreg | `sub_unit` / `legal_entity` / `unregistered` | `registration` |
| korps → `chapter`; Fretex, Gatehospitalet, Home-Start → `service` | | `unit_kind` |
| — | not published | `latitude`, `longitude` |
| — | from geocoding only | `location_precision` |
| page URL | | `source_url` |

**Activities**

| Source | Rule | Atlas column |
|---|---|---|
| "VÅRE TILBUD I …" heading up to the first `</ul>`, links to `/korps/<slug>` | link text | `fact_chapter_activities.local_activity_name` |
| `/korps/<slug>` | | `dim_activity.canonical_name` |
| the activity's own page `/korps/<slug>`, found by slug among the links on its unit page: `main .richText` | verbatim | `dim_activity.description` |
| the lead paragraph after `main h1` on that page (= the card teaser) | verbatim | `dim_activity.summary` (new) |
| used by many korps → `NATIONAL`; else `LOCAL` | | `dim_activity.origin` |
| spelling variants | | `dim_activity.aliases` |

## Rules and traps

All from `reference-code/src/sources/frelsesarmeen-chapters.ts` unless noted.

1. **The unit is the card.** Read cards with `/<li>\s*<div class="py-4[^"]*">([\s\S]*?)<\/li>/g`
   after the "KONTAKTINFO" marker; a page is not a unit.
2. **47 pointer cards** only link to another unit's own page — keep them for de-duplication, do not
   count them as new units.
3. **De-duplicate** on orgnr, else on the slug of the name; keep the richer record. Then a second
   pass folds name-keyed entries into the matching numbered entry (the "Bergen sentrum korps" case).
4. **Reject the national orgnr 938498318** on a card — two cards print it (e.g. Bodø korps). An
   orgnr must be exactly nine digits.
5. **Address:** the first unlabelled `font-light text-xs` div without a link; skip the labels
   Mobil, Telefon, Organisasjonsnr, Bankkonto, Vippsnr, Faks.
6. **Website:** the template emits `href="http://"` when the field is empty — require 8+ characters
   and exclude `lokalavdeling` links.
7. **Activities: anchor on the "VÅRE TILBUD I …" heading,** never on `id="tilbud"` — that id also
   wraps editorial articles.
8. **Attribute activities and contacts only on single-unit pages** (exactly one self-describing
   card). On hubs, count them as ambiguous and do not attach.
9. **Do not `stripHtml` the contact block** — it collapses newlines, and per-line matching then
   finds nothing. The first full crawl got **0 contacts from 18 blocks, with no error**. Strip tags
   locally, keep line breaks, and fail the run on "blocks found but zero contacts parsed".
10. **Contact lines are "Rank Name, role";** the person's email is on the next `Epost:` line; the
    block's first address is the unit's shared one. The rank goes to job title.
11. Shared text traps (`lib/text.ts`): fold Ø/Æ/Å before NFD; decode entities.
12. Pages carry no modified date: change detection per block, `assertedAt` empty, a filled block
    that empties is a parse suspect; batch guard at 30%.

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
- **Pace:** at least 1.5 s between requests; frelsesarmeen.no answers 429 at ~2.5/s.

## Personal data

Contact blocks publish officers' ranks, names, mobile numbers and personal emails. These go to
Atlas's private path only, never to public tables. Public `email`/`phone` hold the unit's shared
address and line only. In tests and docs use `<name>`, `9x xx xx xx`, `<name>@example.org`.

⚠️ The reference code `frelsesarmeen-chapters.ts` contains a real person's name in a code comment.
Redact it before the file goes into any public repository.

## Acceptance targets

From `acceptance-targets.csv` (measured run 2026-09-26/27), after reconciliation with Brreg:

| chapters | local / regional / related | both / registry-only / source-only | legal / sub-unit / unregistered | with kommune | coords | regional links | defs | links | contacts |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|
| 302 | 263 / 9 / 30 | 134 / 41 / 127 | 11 / 175 / 116 | 174 | 0 | 0 | 36 | 38 | 19 |

Reconciliation: 104 of 116 published orgnrs are Frelsesarmeen sub-units; 134 of 175 sub-units
(77%) are matched. The 127 source-only units are mostly Fretex shops, Gatehospitalet and
Home-Start. Descriptions (2026-10-04): 34 of 36 activities have their page's full text (median 67
words, 3 618 in all), 14 of them with a phone or e-mail; one page has only a lead, and one activity
(Åpen kafé, Nedre Eiker) has no link from its unit page. A fresh run will differ somewhat; a large
gap is the signal.

## Reference implementation

`reference-code/src/sources/frelsesarmeen-chapters.ts` with `reference-code/src/lib/`; the registry side
is `brreg-subunits.ts`. It runs as-is (see the package README). In Atlas's framework:

- `discover.ts`: department sitemap → `/lokalavdeling/` URLs (`sitemap_log`).
- Crawlee CheerioCrawler, `maxRequestsPerMinute` 40, via `lib/scraping`.
- pure `parse.ts`: page in, cards out; golden tests on a hub (Oslo), a single-unit page with a
  contact block, a card with the national orgnr, and a card with `href="http://"`.
- `raw.frelsesarmeen_lokalavdeling_page` verbatim with `record_hash`.
- dbt: card de-duplication, orgnr match to `raw.brreg_underenheter_*`, name match as fallback.

## Open gaps

- Activities on only 21 pages; hub activities cannot be attributed.
- 41 sub-units have no published page; 116 published units have no orgnr.
- No coordinates; location through Brreg sub-unit addresses or geocoding (R9).
