# Ingestion spec — 4H Norge

**Status · Atlas runs this.** The site's klubb pages are almost empty, so the crawl enriches
little; its value is **verification**: a klubb listed in 4H's own directory confirms that a
registry row matched by name is really 4H's. Reconciled, it gave 593 chapters (359 in both
sources) and the URL path gives each klubb its county body. Activities: see "Activities (R3)" below.

## Sources and discovery

| | |
|---|---|
| Base | `https://4h.no` |
| Index | `https://4h.no/sitemap.xml` (one file) |
| Chapter URLs | `/^https:\/\/4h\.no\/[a-z0-9-]+\/klubber\/[a-z0-9-]+\/?$/` = `/<fylke>/klubber/<klubb>` |
| Registry side | Brreg `enheter` with `4H` in the name (strong when the name ends in `4H`) — `brreg-chapters.ts` |

## Politeness

- `robots.txt` (measured 2026-10-03): **`Crawl-delay: 5` for all agents** (`User-agent: *`).
  ⚠️ The research's crawl of 2026-09-26 ran at 0.9 s per request — five times the rate the site
  asks for. Honour the 5 s delay; a full run of ~460 pages takes about 40 minutes.
- Re-check `robots.txt` every run; User-Agent with a contact address (Atlas `lib/scraping/ua.ts`).

## What to read → Atlas columns

| On the page | Atlas column | Notes |
|---|---|---|
| `<h1>` | `name` | |
| URL segment `<fylke>` | `parent_chapter_id`, `parent_method = url_path`; (proposed) county | hyphens to spaces |
| `og:article:modified_time` | (proposed) `source_updated_at` | a real upstream date: freshness by the organisation's clock, not the fetch date |
| page URL | `web`, `source_url` | |
| — | `chapter_type` | `Klubb` |

Address, e-mail and telephone on these pages belong to the national office footer — do not read
them as the klubb's.

## Rules and traps

From `reference-code/src/sources/site-chapters.ts`:

- **The pages are almost empty** — about 355 characters of visible text; the only address, e-mail
  and phone are the national office's.
- **Two clubs can share a name.** Two different klubber are both called *Start 4H*, one in Møre og
  Romsdal and one in Oppland: `/more-og-romsdal/klubber/start-4h` and `/oppland/klubber/start-4h`.
  Keying on the last URL segment merged two real organisations under one id, and every schema check
  passed. Build ids from the **distinguishing path** (county + klubb).
- **The registry rows were matched by name pattern** at LOW/MEDIUM confidence; the crawl is the
  independent evidence that lifts them.
- Only `og:article:modified_time` is a source date. When a page has none, leave the assertion date
  empty; never fill it with the fetch date.

## Activities (R3, measured 2026-10-04)

**Where:** a klubb page carries nothing; county events are published per county, not per klubb.
What a klubb does is the national 4H programme, which
`https://4h.no/blimed/medlemskap/aktivitetene-i-de-ulike-aldersgruppene` describes per age group.

**Definitions** (each with 4H's own paragraph, verbatim): *Familieaktiviteter (0–9 år)*,
*4H-klubb (10–18 år)*, *4H for alumner (19 år +)*.

**Programme activity (proposal P3):** only *4H-klubb (10–18 år)* is linked to the klubber — the page
says that age group "deltar i vanlig klubbaktivitet". The link follows from the unit being a 4H
klubb, not from anything its page states, and is marked so (`matchMethod: programmeActivity`,
`originEvidence`). The other two are national definitions without klubb links.

**Targets:** 455 klubber linked to the club programme; 3 definitions.

## Personal data

- None found on the klubb pages (no contacts published).

## Acceptance targets

Research run of 2026-09-26/27 (chapters exclude the national body):

| chapters | local | regional | related_entity | both | registry_only | source_only | with kommune | regional parent links |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 593 | 574 | 17 | 2 | 359 | 135 | 99 | 433 | 455 |

## Reference implementation

`reference-code/src/sources/site-chapters.ts` (the `fire-h` entry) and
`reference-code/src/sources/upgrade-hierarchy.ts` (`PARENT_FROM_URL['fire-h']`).
In Atlas: Crawlee + `lib/scraping` with the per-host Crawl-delay honoured, pure `parse.ts` with
golden-file tests, verbatim `raw.fire_h_*`, reconciliation in dbt.

## Open gaps

- 160 units have no place at all.
