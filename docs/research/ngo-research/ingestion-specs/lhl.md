# Ingestion spec — LHL (Landsforeningen for hjerte- og lungesyke)

**Status · Atlas runs this.** Yields one row per lokallag with name, phone, Facebook page and the
published board (names, roles, phones). Reconciled with the registry it gave 285 chapters (208 in
both sources), and the URL path gives every lokallag its fylkeslag. Activities: see "Activities (R3)" below.

## Sources and discovery

| | |
|---|---|
| Base | `https://www.lhl.no` |
| Index | `https://www.lhl.no/sitemaps/lhl/no/content.xml` (one file) |
| Chapter URLs | depth three under `/lokallag/`: `/\/lokallag\/[^/]+\/[^/]+\/?$/` = `/lokallag/<fylkeslag>/<lag>/` |
| Excluded | section pages at the same depth: `/(kalender|aktiviteter|kontakt|om-oss|nyheter|arrangementer|styret|bli-medlem|artikler|sider)/?$` |
| Regional tier | depth two, `/lokallag/<fylkeslag>/`, is the fylkeslag itself |
| Registry side | Brreg `enheter` with `LHL` in the name (strong when it starts with `LHL`) — `brreg-chapters.ts` |

## Politeness

- `robots.txt` (measured 2026-10-03): no disallow on the chapter paths, no Crawl-delay.
- Rate: 1 request per second or slower; re-check `robots.txt` every run.
- User-Agent with a contact address (Atlas `lib/scraping/ua.ts`).

## What to read → Atlas columns

| On the page | Atlas column | Notes |
|---|---|---|
| `<h1>` | `name` | |
| first `tel:` on the page, unless it starts `+47 2279` | `phone` | `22 79 90 xx` is LHL's head-office exchange, printed in every page header |
| first `facebook.com/...` that is not `facebook.com/LHLorg` | (proposed) `facebook_url` | |
| URL segment `<fylkeslag>` | `parent_chapter_id`, (proposed) `parent_method = url_path` | resolve to the registry's fylkeslag row; create an `unregistered` tier row when the registry has none |
| page URL | `web`, `source_url` | |
| board table rows `<tr>` with `local-union-committee__name`, `local-union-committee__position`, `tel:`, `mailto:` | private contact table only | see Personal data |
| — | `chapter_type` | `Lokallag` |

## Rules and traps

From `reference-code/src/sources/site-chapters.ts` and `upgrade-hierarchy.ts`:

- **Section pages look like chapters.** The depth-three pattern also matches a fylkeslag's own
  sub-pages: `/lokallag/lhl-telemark/kalender/` arrived as a chapter named *Aktiviteter*. Exclude
  the section words above.
- **National switchboard and Facebook.** `+47 2279…` and `facebook.com/LHLorg` are on every page
  and must never be read as the chapter's.
- **The registry holds 5 fylkeslag; the site publishes 16.** Create the missing tier rows from the
  URL segment, marked unregistered, rather than hanging eleven counties' chapters off the national
  body.
- **Not every URL segment is a county.** `/lokallag/interessegrupper/…` (diagnosis and interest
  groups, 12 units) and `/lokallag/lhl-hjerneslag-ung/…` are not geographic; give their tier rows
  no county type.
- **Prefer a REGIONAL row, then a name with a tier word,** when resolving a segment to a row; a
  first-match substring test makes a lokallag the child of another lokallag.
- Ids from the distinguishing path (`idFromUrl`).

## Activities (R3, measured 2026-10-04)

**Where:** every activity has its own page one level below its chapter in the sitemap
(`/lokallag/<county>/<chapter>/<activity>/`, `content.xml`). The chapter page's activity calendar
shows only the coming months (LHL Kongsberg: 2 of its 4), so the **sitemap is the list**. Each page's
`h1` is the activity's local name; its text — with structured *Tid*, *PRIS* and *STED* lines — is the
chapter's own description (`chapter-activities.ts`, `lhl`).

**Not activities:** pages under `/lokallag/interessegrupper/` (LHL Transplantert, Sepsis og
meningitt, Lungefibrose publish articles there — one is a memorial naming a person); one-off events
and chapter business by name (julebord, lagmøte, årsmøte, jubileum, basar, lotteri, messe, "åpent
kontor", news). 2 pages answered 404/410.

**Local names → LHL activity types** by ordered rule (`LHL_TYPES`): *Trimgruppe nivå 3 Grünerløkka
flerbrukshus mandager* → *Fysisk aktivitet nivå 3*; *Vanntrim CatoSenteret* → *Bassengtrening og
vanntrim*. 412 of 414 map to 15 types: Trim og trening 94, Bassengtrening og vanntrim 57, Turgruppe
og gåturer 50, Fysisk aktivitet nivå 1/2/3 40/24/29, Bowling og boccia 36, Pratekafé og sosiale treff
19, Bingo 18, Hobby og håndarbeid 16, Yoga 9, Dans 7, Temamøter 6, Ferieopphold 4, Sanggruppe 3.
LHL's own programme has the three *nivå* levels; the other types are the research's grouping.

**Targets:** 78 of 252 chapters publish activity pages; 414 links; 17 definitions. The pages give a
price for 327 activities and a place for 149 (`npm run facts`).

## Personal data

- The board table: 1 908 named people, 1 885 with a phone (measured); almost all are personal
  mobile numbers. Chapter phones: 244 of them are mobiles.
- **Owner decision:** published contact persons are kept, but only in Atlas's private path. The
  public chapter row carries no person; chapter mobiles are blanked and listed in
  `withheld_fields`.

## Acceptance targets

Research run of 2026-09-26/27 (chapters exclude the national body):

| chapters | local | regional | both | registry_only | source_only | with kommune | regional parent links | published contacts |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 285 | 267 | 18 | 208 | 20 | 57 | 189 | 250 | 1 908 |

## Reference implementation

`reference-code/src/sources/site-chapters.ts` (the `lhl` entry in `SITES`) and
`reference-code/src/sources/upgrade-hierarchy.ts` (`PARENT_FROM_URL.lhl`). In
Atlas: Crawlee + `lib/scraping`, pure `parse.ts` with golden-file tests, verbatim `raw.lhl_*`,
reconciliation and the tier resolution in dbt.

## Open gaps

- 29 LHL units look non-geographic by name (interest and diagnosis groups); some may be the same
  unit registered and published under two spellings.
