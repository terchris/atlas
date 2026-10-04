# Ingestion spec — Diabetesforbundet

**Status · Atlas runs this.** Yields one row per fylkes- or lokallag with name, lifecycle status,
phone, Facebook page and the published board. Reconciled with the registry it gave 161 chapters
(86 in both sources); the URL path gives each lokallag its fylkeslag. Activities: see "Activities (R3)" below.

## Sources and discovery

| | |
|---|---|
| Base | `https://www.diabetes.no` |
| Index | `https://www.diabetes.no/sitemaps/diabetesforbundet/no/content.xml` (one file) |
| Chapter URLs | `/\/fylkes-og-lokallag\/[^/]+\/[^/]+\/?$/` = `/fylkes-og-lokallag/<fylke>/<lag>/` |
| Excluded | section pages at chapter depth, same list as LHL (seven county sections publish an `artikler` index there) |
| Registry side | Brreg `enheter` with `DIABETESFORBUNDET` in the name (strong when it starts with it) — `brreg-chapters.ts` |

## Politeness

- `robots.txt` (measured 2026-10-03): no disallow on these paths, no Crawl-delay.
- Rate: 1 request per second or slower; re-check `robots.txt` every run.
- User-Agent with a contact address (Atlas `lib/scraping/ua.ts`).

## What to read → Atlas columns

| On the page | Atlas column | Notes |
|---|---|---|
| `<h1>` "Styret i *X*" → *X*; else the last URL segment, hyphens to spaces | `name` | the h1 is the board's heading, not the chapter's name |
| status word at the end of the name: `NEDLAGT`, `HVILENDE`, `OPPLØST`, `SOVENDE` | `is_active = false`; (proposed) `status` | strip it from `name`; `chapter_type` becomes e.g. `Lokallag (hvilende)` |
| first `tel:` unless `+47 23051800` | `phone` | `23 05 18 00` is the national office |
| first `facebook.com/...` that is not `facebook.com/diabetesforbundet` | (proposed) `facebook_url` | |
| URL segment `<fylke>` | `parent_chapter_id`, `parent_method = url_path` | |
| `<li>` items with `person-list__name`, `person-list__profession`, `tel:`, `mailto:` | private contact table only | role text is upper case; normalise its casing only |
| page URL | `web`, `source_url` | |

## Rules and traps

From `reference-code/src/sources/site-chapters.ts`:

- **The name carries the lifecycle.** *Flekkefjord og omegn NEDLAGT*, *Iveland, Evje og Hornnes
  HVILENDE*. That is real status data and appears nowhere else. Keep it as status, not in the name:
  left in the name it also defeats matching against the registry. Measured: 21 dormant
  (*hvilende*), 4 dissolved (*nedlagt*).
- **The h1 is "Styret i …"**, the board's page title.
- **National switchboard and Facebook** on every page.
- **Section pages at chapter depth** (`artikler`).
- Ids from the distinguishing path (`idFromUrl`).

## Activities (R3, measured 2026-10-04)

**Where:** a chapter page lists its board, not its activities. What a chapter **runs** shows in its
events: 1 301 event pages under `/fylkes-og-lokallag/<county>/<chapter>/arrangement/<slug>/` in the
sitemap. The slug names the event; an ordered rule (`DIA_TYPES`, `chapter-activities.ts`) names the
activity type it belongs to. Nothing is fetched beyond the sitemap; the activity's `sourceUrl` is
an event page of that type.

**Not activities:** årsmøte, styremøte, medlemsmøte, julebord, julelunsj, sommeravslutning, office
hours, stands, raffles, test pages — 129 årsmøter alone.

**Types:** Temamøter og kurs (43 chapters), Diakafé og treff (27), Treff for barn, unge og familier
(27), Gågruppe og turer (26), Trening og fysisk aktivitet (21), Likepersoner og motivasjonsgrupper (6),
Strikkekafé (2). A long tail of one-off events matches no rule and is reported, not guessed.

**National offers** (not tied to chapters, on `/tilbud-til-deg/`): Diabeteslinjen, likepersoner,
motivasjonsgrupper, sommerleir, kurs på nett, webinarer, Finn formen — to add as national definitions.

**Targets:** 58 of 129 chapters show activities; 152 links; 7 definitions. Event dates are not read
(slugs only), so "has held" is the evidence, not "runs now".

## Personal data

- The board list: 663 named people, 662 with a phone, 650 with an e-mail — and **560 of those
  e-mails are on consumer domains** (gmail.com, hotmail.com, online.no, outlook.com, icloud.com …):
  volunteers' private addresses. Only a handful are on `diabetes.no`.
- **Owner decision:** contact persons go to Atlas's private path only; nothing personal in the
  public row.

## Acceptance targets

Research run of 2026-09-26/27 (chapters exclude the national body):

| chapters | local | regional | both | registry_only | source_only | with kommune | regional parent links | published contacts |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 161 | 139 | 22 | 86 | 31 | 44 | 88 | 127 | 663 |

`organizations.json` counts 136 active chapters: 25 are dormant or dissolved.

## Reference implementation

`reference-code/src/sources/site-chapters.ts` (the `diabetesforbundet` entry) and
`reference-code/src/sources/upgrade-hierarchy.ts` (`PARENT_FROM_URL.diabetesforbundet`).
In Atlas: Crawlee + `lib/scraping`, pure `parse.ts` with golden-file tests,
verbatim `raw.diabetesforbundet_*`, reconciliation in dbt.

## Open gaps

- 73 units have no place at all; only 88 carry a kommune.
