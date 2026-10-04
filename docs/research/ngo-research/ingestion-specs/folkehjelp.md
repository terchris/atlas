# Ingestion spec — Norsk Folkehjelp

**Status · Atlas runs this.** Yields one row per lokallag with name, chapter e-mail, phone,
postal address and Facebook page. Reconciled with the registry it gave 128 chapters (92 in both
sources). No named contacts are published in a parseable form, and activities: see "Activities (R3)" below.

## Sources and discovery

| | |
|---|---|
| Base | `https://folkehjelp.no` |
| Index | `https://folkehjelp.no/sitemaps-1-section-localBranch-1-sitemap.xml` (a Craft CMS section sitemap; one file, no pagination) |
| Chapter URLs | every `<loc>` matching `/lokallag/<slug>` with nothing after the slug: `/\/lokallag\/[^/]+$/` |
| Registry side | Brreg `enheter` whose name contains `NORSK FOLKEHJELP` (strong when it *starts* with it), excluding support bodies (`FORELDREFORENING`, `VENNEFORENING`, `STØTTEFORENING`, `BORETTSLAG`, `EIENDOM` …) — `reference-code/src/sources/brreg-chapters.ts` |

## Politeness

- `robots.txt` (measured 2026-10-03): disallows only `/cpresources/`, `/vendor/`, `/.env`,
  `/cache/`, `/fagbevegelsen/1-mai`, `/*?token*`. Crawl-delay is set **only** for `MJ12bot` (15 s)
  and `AhrefsBot` (10 s), not for a generic agent.
- Rate: 1 request per second or slower. Re-check `robots.txt` on every run.
- User-Agent with a contact address (Atlas `lib/scraping/ua.ts` refuses to run without one).

## What to read → Atlas columns

The aside of each chapter page holds titled info boxes. Read them **by title, not position** —
chapters publish different boxes.

| On the page | Atlas column | Notes |
|---|---|---|
| `<h1>` | `name` | |
| box `h4.c-info-box__title` = "Kontakt oss" → following `div.c-info-box__content`, first `mailto:` | `email` | drop `post@folkehjelp.no` and any `npaid.org` address (national) |
| same box, first `tel:` | `phone` | normalise to `+47 nnnnnnnn` |
| box "Adresse" → content lines | `postal_address_line1`, `postal_code`, `post_office` | the first line repeats the chapter name — drop it; the last line is `NNNN PLACE` |
| first `facebook.com/...` link that is not `facebook.com/folkehjelp` | (proposed) `facebook_url` | |
| page URL | `web`, `source_url` | |
| — | `chapter_type` | `Lokallag` |
| — | `chapter_level` | `local`; three regional units come from the registry |
| — | `chapter_id` | `folkehjelp-<distinguishing path>`; registry rows use `folkehjelp-<orgnr>` |

## Rules and traps

From `reference-code/src/sources/site-chapters.ts`:

- **The schema.org `LocalBusiness` block is the national office, not the chapter.** Every chapter
  page carries an `ld+json` block describing Norsk Folkehjelp at Stortorvet 10, Oslo. Reading
  structured data because it is structured would have stamped the head office's address on all 113
  chapters, consistently and invisibly. Read the visible info boxes only; never `ld+json`.
- **National Facebook in the footer.** `facebook.com/folkehjelp` is linked from every page; in a
  sample of 8 chapters, 6 had no page of their own and would have been given the national one.
- **National e-mail.** `post@folkehjelp.no` and `npaid.org` addresses appear in page furniture.
- **Line structure is data.** Split the address box on `<br>`, `</p>`, `</div>` before stripping
  tags; collapsing whitespace first turns the box into one line and every per-line match fails.
- **Ids from the distinguishing path, not the last segment** (generic rule across sites; see
  `idFromUrl`).
- A page that parses without an `<h1>` name is dropped and counted; a run where many pages have no
  name means the selector broke, not that chapters vanished.

## Activities (R3, measured 2026-10-04)

**Where:** each chapter page, the rich-text section headed `<h3>Aktivitetsområder</h3>`: one
`<h4>` per activity area, followed by its `<p>` text (`reference-code/src/sources/chapter-activities.ts`,
`folkehjelp`). A chapter with no areas has the heading and nothing under it (Alta) — it publishes none.

**What:** six fixed areas, with the same national text on every chapter: *Førstehjelp og
redningstjeneste* (74 chapters), *Samfunnsarbeid* (50), *Flyktning og inkludering* (42),
*Internasjonale spørsmål* (36), *Sanitetsungdom* (35), *Solidaritetsungdom* (20). The text becomes
the definition's description; the chapters' identical copies are dropped.

**Targets:** 105 of 113 chapter pages publish areas; 257 chapter–activity links; 6 definitions.

## Personal data

- Chapter e-mail: 12 of the chapter addresses are a volunteer's own address on a consumer domain
  (gmail.com and similar). Chapter phone: 77 are Norwegian mobile numbers — in practice a person's
  own phone.
- **Owner decision:** these go to Atlas's private path only; the public row keeps the field blank
  and lists it in `withheld_fields`. Landlines and organisation-domain addresses stay public.

## Acceptance targets

Research run of 2026-09-26/27 (chapters exclude the national body). A fresh run will differ; large
gaps are the signal.

| chapters | local | regional | both | registry_only | source_only | with kommune | regional parent links | published contacts |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 128 | 125 | 3 | 92 | 15 | 21 | 93 | 0 | 0 |

Crawl side (both + source_only): 113 pages parsed.

## Reference implementation

`reference-code/src/sources/site-chapters.ts` (the `folkehjelp` entry in `SITES`). It runs as-is
(see the package README); in Atlas: Crawlee + `lib/scraping` (robots, User-Agent, cache,
`record_hash`, `html_raw_hash`), `discover.ts` from the sitemap, pure `parse.ts` with golden-file
tests, verbatim `raw.folkehjelp_*` tables, reconciliation with Brreg in dbt.

## Open gaps

- The 3 regional units have no chapters linked to them (no parent in the URL).
