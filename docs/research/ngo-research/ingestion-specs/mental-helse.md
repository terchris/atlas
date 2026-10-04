# Ingestion spec — Mental Helse

**Status · Atlas runs this.** Every Mental Helse chapter is its own WordPress subsite. The crawl
yields the chapter's name, its tier (fylkeslag or lokallag, as the chapter states it), member
count where published, the chapter's own e-mail and Facebook page. Reconciled, it gave 199
chapters (88 in both sources; 100 registry-only). Activities: see "Activities (R3)" below.

## Sources and discovery

| | |
|---|---|
| Base | `https://mentalhelse.no` |
| Index | **`https://mentalhelse.no/robots.txt`** — the list of chapters is not in any sitemap; it is the `Sitemap:` lines in robots.txt, one per subsite: `Sitemap: https://mentalhelse.no/<subsite>/sitemap…` (99 subsites when measured) |
| Chapter URLs | `https://mentalhelse.no/<subsite>/` for each distinct `<subsite>` |
| Registry side | Brreg `enheter` with `MENTAL HELSE` in the name, excluding `MENTAL HELSE UNGDOM` (a separate organisation) — `brreg-chapters.ts` |

## Politeness

- `robots.txt` (measured 2026-10-03): no disallow on subsite roots, no Crawl-delay.
- Rate: 1 request per second or slower; re-check `robots.txt` every run.
- User-Agent with a contact address (Atlas `lib/scraping/ua.ts`).

## What to read → Atlas columns

| On the page | Atlas column | Notes |
|---|---|---|
| `meta property="og:title"` | `name` | prefix with "Mental Helse " |
| `meta name="description"`: "Vi er Mental Helses **fylkeslag** i …" vs "… **lokallag** i …" | `chapter_level` (`regional` / `local`), `chapter_type` (`Fylkeslag` / `Lokallag`) | nothing else on the page distinguishes the 12 county bodies from the local ones |
| same description: "Vi har over 1800 medlemmer" | (proposed) `member_count` | published by some chapters and by no registry |
| `mailto:` equal to `<subsite>@mentalhelse.no` or `<subsite>@lokallag.mentalhelse.no` | `email` | the chapter's own address |
| `mailto:` of the form `firstname.lastname@mentalhelse.no` | private contact table only | an individual |
| first `facebook.com/...` that is not `facebook.com/mentalhelse` | (proposed) `facebook_url` | |
| subsite URL | `web`, `source_url` | |

## Rules and traps

From `reference-code/src/sources/site-chapters.ts`:

- **The chapter list lives in robots.txt**, not in a sitemap. Parse the `Sitemap:` lines and keep
  the distinct subsite slugs.
- **`medlem@mentalhelse.no` is the national membership desk**, on every page — never the chapter's
  address.
- **The tier is stated only in the meta description.** Read it there; do not infer it from the name.
- **The registry and the site barely overlap** (100 registry-only, 11 source-only): many registered
  chapters have no subsite. Registry-only is not "inactive".
- The regional parent is not in the URL; the research inferred it from the chapter's kommune where
  Mental Helse's fylkeslag follow the 2024 counties (133 links, marked `municipality_county`,
  Vestland left out because three regional rows claim it). An inferred edge must say so.

## Activities (R3, measured 2026-10-04)

**Where:** each chapter is a WordPress site with an `event` post type in its REST API —
`https://mentalhelse.no/<chapter>/wp-json/wp/v2/event?per_page=100&_fields=title,link` returns every
event the chapter has published, past ones too (Ålesund: 44). One request per chapter. Titles are
classified by ordered rule (`MH_TYPES`, `chapter-activities.ts`).

**Not activities:** årsmøte, medlemsmøte, landsmøte, gatherings for volunteers and leaders
(*samling*), planning meetings, Funkis webinars (national training for volunteers).

**Types:** Utflukter og sosiale arrangementer (38 chapters), Sosialt treff og kafé (31), Markeringer
for psykisk helse (30 — torchlight march, world mental health day, Pride), Turgruppe og turer (25),
Foredrag og kurs (23), Fysisk aktivitet (15), Likepersoner og samtalegrupper (5). Recurring local
formats such as *Kom sitt med oss*, *Mandagsklubben*, *Kvinneklubben*, *Bare menn* are in the rules;
a long tail of one-off titles is reported, not guessed.

**Targets:** 56 of 99 chapters show activities; 167 links; 7 definitions.

## Personal data

- 4 named people found (individual `firstname.lastname@` addresses).
- **Owner decision:** contact persons go to Atlas's private path only.

## Acceptance targets

Research run of 2026-09-26/27 (chapters exclude the national body):

| chapters | local | regional | both | registry_only | source_only | with kommune | regional parent links | published contacts |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 199 | 184 | 15 | 88 | 100 | 11 | 155 | 133 | 4 |

Crawl side (both + source_only): 99 subsites — matching the robots.txt count.

## Reference implementation

`reference-code/src/sources/site-chapters.ts` (the `mental-helse` entry, including its `urls()`
function) and `reference-code/src/sources/upgrade-hierarchy.ts` (`PARENT_FROM_COUNTY['mental-helse']`).
In Atlas: Crawlee + `lib/scraping`, discovery from robots.txt, pure `parse.ts`
with golden-file tests, verbatim `raw.mental_helse_*`, reconciliation and county inference in dbt.

## Open gaps

