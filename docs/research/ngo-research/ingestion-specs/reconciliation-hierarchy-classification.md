# Ingestion spec — reconciliation, hierarchy and classification

**Status · Atlas runs this.** This step fetches nothing new from the registry. It turns two
per-NGO inputs into one chapter table for all 11 Tier A NGOs. The first input is the registry
rows from `brreg-chapter-matching.md` or `brreg-underenheter.md`. The second is the rows Atlas's
own scrapers crawl from each NGO's site, as described in the per-NGO specs. The step:

- **joins** the two inputs into one row per chapter, with a field-level rule for which source
  owns which column;
- **links** each chapter to the tier directly above it, where a public source states that tier;
- **classifies** each unit as governance, operational or a related company.

In Atlas these are dbt models over `raw.*` and `dim_brreg_enhet`. None of it is an ingest.

## Sources and discovery

| Input | Where | Notes |
|---|---|---|
| Registry rows | dbt models from the two Brreg specs | They carry `chapter_orgnr`. |
| Crawled rows | `raw.<ngo>_*`, from Atlas's scrapers | These may carry an orgnr where the page prints one; Frelsesarmeen's contact cards do. |
| Røde Kors tier edges | `https://www.rodekors.no/sitemap.no.xml/` | 1 588 URLs; branches sit at depth three, `/lokalforeninger/<distrikt>/<lag>/`. |
| Tier edges in page URLs | LHL, Nasjonalforeningen `/lokallag/<fylkeslag>/<lag>`; Diabetesforbundet `/fylkes-og-lokallag/<fylkeslag>/<lag>`; 4H `4h.no/<fylke>/klubber/<klubb>` | Already present on the crawled rows' `source_url`. |
| NGO identity | a seed: `slug`, `orgnr`, `structure` (federated / unitary) | Stated, not derived. 9 are federated and 2 unitary (`build-organizations.ts`). |

The sitemap is the only network fetch, one request per run. Licence: Brreg data is under NLOD.
The sitemap is a public index of the site; the per-NGO spec covers terms of use.

## Politeness

The sitemap fetch goes through `lib/scraping`. That means robots.txt is checked first, the site's
Crawl-delay is honoured, and the request carries Atlas's User-Agent with a contact address
(`lib/scraping/ua.ts`; the research refused to run without `ATLAS_SCRAPE_CONTACT_EMAIL`,
`reference-code/src/lib/http.ts`). Cache the body so a re-derivation fetches nothing.

## What to read → Atlas columns

| Derived from | Atlas column | Values |
|---|---|---|
| which input matched | `reconciliation` | `both` / `registry_only` / `source_only` |
| match key used | (proposed) `match_method` | `+crawlOrganizationNumber` or `+crawlName` |
| two sources agree | `confidence` | `high` on every `both` row; other rows keep their input's confidence |
| orgnr present, plus how it was found | `registration` | `legal_entity`; `sub_unit` (found via `overordnetEnhet`); `unregistered` (crawl only, confirmed absent); `unknown` |
| tier edge | `parent_chapter_id` | the immediate tier above, not the national root |
| how the edge was found | `parent_method` | `url_path` / `sitemap_path` (stated) · `municipality_county` (inferred) |
| level + type + legal form | `unit_kind` | `governance` / `operational` / `unknown` |
| owned company | `chapter_level` = `related_entity` | |
| registry fields | `chapter_orgnr`, `kommune_nr`, `name` (legal), `is_active` | **The registry owns these.** |
| crawl fields | `latitude`, `longitude`, `postal_address_line1`, `postal_code`, `post_office`, `phone`, `email`, `web` | **The crawl owns these.** |

The registry also owns municipality, county, established and terminated dates, and chapter type.
The crawl also owns address kind, activities, Facebook URL and member count.

## Rules and traps

**Reconciliation** (`reference-code/src/sources/reconcile-chapters.ts`)

1. **Match in passes, strongest key first, and take a name match only when exactly one candidate
   is left.** Each pass uses only the rows still unmatched.
   1. Organisation number: exact, 9 digits.
   2. Normalised name (`matchKey`).
   3. The crawl name with its town removed.
   4. A token-set key that ignores word order, `I` and a genitive `-S` (`tokenSetKey`). Pass 4 was
      added after 7 duplicate pairs were found and is not yet verified on them.
2. **Do not fold Ø/Æ/Å in the match key**, unlike everywhere else. Folding them merges different
   municipalities, such as Hole and Høle, or Lardal and Lårdal.
3. **Strip every token of the NGO's own name, including short words and possessive forms**
   (`-ENS`, `-ENE`, `-EN`, `-S`). Leaving one stray `FOR` behind dropped the match rate from 72%
   to 45%.
4. **Drop bracketed abbreviations** (`Home-Start (HS) Alna`). Also strip unit words that only
   one side uses: LOKALFORENING, LOKALLAG, HJELPEKORPS, `OG OMEGN`, `OG OMLAND`, `I SOGN`, `OG`.
5. **Merge field by field, by ownership, never "last write wins".** Leaving member count off the
   crawl-owned list silently dropped 287 of 366 counts.
6. **Keep both identities on a `both` row.** The registry orgnr and the crawl's `source_url` are
   both kept.

**Hierarchy** (`reference-code/src/sources/upgrade-hierarchy.ts`)

7. **Brreg states no edge between two separately registered chapters.** A flat
   "every chapter → national" is an absence of data, not a fact. Record how every edge was
   found in `parent_method`.
8. **Røde Kors: match a branch by its name minus `RØDE KORS`, LOKALFORENING and HJELPEKORPS**
   against the sitemap slugs. Seven slugs appear under two districts (`nes`, `os`, …). Choose the
   district by the chapter's county code, using the code list in `RK_DISTRICT_COUNTY`. If the
   chapter has no municipality, leave the branch unlinked.
9. **Resolve a district by exact name prefix (`<DISTRICT>RODEKORS`), never by substring.** The
   register still holds `NORD-` and `SØR-TRØNDELAG RØDE KORS`, but the site has one Trøndelag
   district. Create that district as a row (`registration = unregistered`, origin derived),
   rather than pointing at either old county.
10. **Create a tier row only where a source states the tier and the register lacks it.** Mark it
    `unregistered`.
11. **Promote by evidence.** A row that local chapters name as their parent is `regional`,
    whatever its name says. For example, 45 lokallag point at a Nasjonalforeningen
    "FYLKESSTYRET" row that the region-word list missed. Rogaland Røde Kors is registered with
    "MED FLEKKEFJORD BY" in its name and is promoted the same way.
12. **Infer by county only where regions follow county lines.** That holds for Mental Helse
    (excluding county 46, which three regional rows claim) and for N.K.S. county 11. Never infer
    for Speiderforbundet's kretser or Frelsesarmeen's divisjoner, which do not follow counties.
    An inferred edge has origin `inferred`; a stated one has origin `source`.

**Classification** (`reference-code/src/sources/classify-units.ts`)

13. **Apply the rules in this order:**
    1. National or regional → `governance`.
    2. An owned company (`\bAS\b`, Fretex) → `related_entity` + `operational`.
    3. Governance words in the type → `governance`.
    4. Registered → `operational`.
    5. Anything else → `unknown`. This is an activity-like unit, so it is never counted as a
       chapter.

    Before this step Frelsesarmeen counted 303 units against about 100 korps, and Kirkens Bymisjon
    434 against about 45 sites. FRETEX MILJØ AS, with 449 employees, had 68 outlets typed as
    chapters.
14. **The chapter count on an NGO** leaves out national, `related_entity` and inactive rows
    (`build-organizations.ts`).

**Derived views** (`reconciliation-csv.ts`, `derive-fields.ts`)

15. **The audit view is derived from the canonical table, never written separately.** In the
    research, steps after reconciliation rewrote the chapters but not the CSV. LHL's audit trail
    then held 274 rows against 285 chapters. In Atlas the audit view is a dbt model or a test on
    the same table.
16. **Derive fields that are a function of stored data on every run, never by scraping them.**
    Examples are self links, and activity aliases observed on chapter pages
    (`Omsorgsber.` on 300 N.K.S. chapters).

## Personal data

The reconciliation itself creates no personal data. However, the crawl-owned fields it merges
(contacts, `phone`, `email`) can hold a named person, a mobile number in the form `9x xx xx xx`
or a private e-mail address. Keep those on the private path only (owner decision 2026-10-04); the
public row keeps the organisation's own contact fields. A point taken from a registry address is
never more precise than `postal_code`.

## Acceptance targets

These come from the research run of 26–27 Sep 2026 (`acceptance-targets.csv`). A fresh run will
differ somewhat; a large gap is the signal.

| NGO | chapters | both | registry_only | source_only | regional | related | parent links |
|---|---:|---:|---:|---:|---:|---:|---:|
| Røde Kors | 382 | 0 | 381 | 1 | 20 | 8 | 317 (sitemap) |
| Sanitetskvinnene | 575 | 439 | 24 | 112 | 4 | 1 | 33 |
| Nasjonalforeningen | 493 | 311 | 59 | 123 | 17 | 0 | 414 |
| 4H Norge | 593 | 359 | 135 | 99 | 17 | 2 | 455 |
| Speiderforbundet | 393 | 0 | 393 | 0 | 20 | 6 | 0 |
| LHL | 285 | 208 | 20 | 57 | 18 | 0 | 250 |
| Mental Helse | 199 | 88 | 100 | 11 | 15 | 0 | 133 |
| Diabetesforbundet | 161 | 86 | 31 | 44 | 22 | 0 | 127 |
| Norsk Folkehjelp | 128 | 92 | 15 | 21 | 3 | 0 | 0 |
| Frelsesarmeen | 302 | 134 | 41 | 127 | 9 | 30 | 0 |
| Kirkens Bymisjon | 433 | 67 | 84 | 282 | 0 | 2 | 0 |

Røde Kors and Speiderforbundet show `both` = 0 because their sites were not crawled in that run;
once Atlas crawls rodekors.no, most of the 381 should become `both`. On the Røde Kors sitemap
check, 284 branches had a link consistent with their own municipality, and 6 more had an
explanation.

## Reference implementation

The research's code is copied under `reference-code/src/sources/` for reference; it is not
meant to run as-is. The files are `reconcile-chapters.ts`, `upgrade-hierarchy.ts`,
`classify-units.ts`, `build-organizations.ts`, `reconciliation-csv.ts` and `derive-fields.ts`.

In Atlas each step becomes a dbt model:

- `int_ngo_chapter_reconciled`, with the passes as successive anti-joins;
- `int_ngo_chapter_hierarchy`;
- `dim_chapter`, with the classification as a `CASE` in rule order.

The Røde Kors sitemap is stored verbatim in `raw.redcross_sitemap`. The lookup lists
(`RK_DISTRICT_COUNTY`, the county rules and the NGO `structure`) become seeds.

## Open gaps

- Pass 4 has not been measured on the 7 known duplicate pairs (plan task R5).
- No public source states the tier edges for Speiderforbundet, Frelsesarmeen or Folkehjelp; they
  must come from the NGOs.
- `structure` and `unit_kind` are proposed columns; they are not yet in Atlas.
