# Ingest

Extractors that produce the datasets in `../data/`. TypeScript, Node 22.

Output conforms to the **generated** JSON Schema in `../dist/schema/`, so a change to the
authored YAML propagates here as a validation failure rather than silent drift.

**Running it outside the research repo** (e.g. the copy in Atlas's
`docs/research/ngo-research/ingestion-specs/reference-code/`): set `NGO_ROOT` to a scratch
directory — the extractors write `$NGO_ROOT/data/<org>/…` — and `ATLAS_SCRAPE_CONTACT_EMAIL`
to a real address. `npm run validate` needs the research's schema build and does not work there.
Fetched pages are cached in `.cache/pages/`; `NGO_FROM_CACHE=1` re-parses without fetching.

```bash
npm install
npm run chapters -- --fetch     # pull the voluntary register (~72,800 rows, cached)
npm run chapters -- --coverage  # match + write per-org chapters.json + coverage matrix
npm run nks:activities          # the national activity catalogue, with description text
npm run nks                     # crawl 552 chapter pages, ~17 min at 1 req/s
npm run nasjonalforeningen      # 431 chapters via the site's WordPress REST API
npm run subunits                # Brreg sub-units for the UNITARY organisations
npm run frelsesarmeen           # crawl 139 unit pages, ~6 min at 1 req/1.5s
npm run kirkens-bymisjon        # 144 services + 349 local units via the WordPress API
npm run site -- <org>           # folkehjelp | lhl | diabetesforbundet | fire-h | mental-helse
npm run reconcile -- <org>      # join chapters.registry.json + chapters.crawl.json
npm run icnpo                   # the complete classification, ~730 requests
npm run hierarchy               # fill `registration`, make `parent` the immediate tier (fetches rodekors.no sitemap)
npm run classify                # set `unitKind`, move owned companies to RELATED_ENTITY
npm run catalogue               # derive activities.json from activities on chapters
npm run organizations           # write data/_organizations/organizations.json
npm run derive                  # self links (`href`) and activity `aliases`, from data on disk
npm run reconciliation-csv      # rewrite every reconciliation.csv from its chapters.json
npm run redcross                # rodekors.no: 18 districts, 339 branches, their activities (~7 min); then reconcile -- redcross
npm run chapter-activities -- <org>  # R3 activities for folkehjelp | lhl | diabetesforbundet | mental-helse | fire-h
npm run speiderforbundet        # blispeider.no groups and kretser (~6 min); then reconcile -- speiderforbundet, hierarchy
npm run geocode-input           # data/_geocoding/locations.csv (nothing is geocoded)
npm run descriptions            # R10: each activity's FULL text from its own page (run after the activity extractors)
npm run redact                  # public text: phone/e-mail/names -> [telefon]/[e-post]/[navn]; log -> data/_private/ (never publish)
npm run facts                   # R10: cost / age / schedule / how to join … as quoted sentences -> data/_activity-facts/
npm run validate                # every data file against ../dist/schema/
```

| Source | Produces | Method |
|---|---|---|
| `brreg-chapters.ts` | `data/<org>/chapters.json` for 11 organisations | registry match, two independent signals |
| `nks-chapters.ts` | `data/sanitetskvinnene/chapters.json` + `change-log.csv` | sitemap crawl |
| `nks-activities.ts` | `data/sanitetskvinnene/activities.json` | national catalogue crawl |
| `nasjonalforeningen-chapters.ts` | `data/nasjonalforeningen/chapters.crawl.json` | WordPress REST API |
| `brreg-subunits.ts` | `data/<org>/chapters.registry.json` for the unitary organisations | `overordnetEnhet` link, no name matching |
| `frelsesarmeen-chapters.ts` | `data/frelsesarmeen/chapters.crawl.json` | sitemap crawl, card-level |
| `kirkens-bymisjon-tilbud.ts` | `data/kirkens-bymisjon/activities.json` + `chapters.crawl.json` | WordPress REST API + taxonomies |
| `site-chapters.ts` | `data/<org>/chapters.crawl.json` for five organisations | sitemap crawl, per-site selectors |
| `reconcile-chapters.ts` | `data/<org>/chapters.json` + `reconciliation.csv` | organisation number, then name, then name minus town |
| `brreg-icnpo.ts` | `data/_icnpo/*.csv` | cursor-paged register walk |
| `upgrade-hierarchy.ts` | rewrites `data/<org>/chapters.json` | fills `registration`; `parent` becomes the immediate tier above, from the site's URL path (4 orgs), Røde Kors's sitemap, or - inferred - the chapter's county (Mental Helse, N.K.S. Rogaland). Records how in `provenance.parentMethod` |
| `classify-units.ts` | rewrites `data/<org>/chapters.json` | sets `unitKind`; owned companies move to level `RELATED_ENTITY` |
| `build-activity-catalogue.ts` | `data/<org>/activities.json` | derived from the activities already on chapters |
| `build-organizations.ts` | `data/_organizations/organizations.json` | the eleven NGOs as `Organization` resources |
| `derive-fields.ts` | rewrites chapters, activities and organisations in place | `href` from id + route; `aliases` from the names chapters actually use |
| `reconciliation-csv.ts` | `data/<org>/reconciliation.csv` | derived from `chapters.json`, which is canonical |
| `redcross-branches.ts` | `data/redcross/chapters.crawl.json` | rodekors.no districts and branches from the sitemap (de-duplicated); activities from each branch's expanders, local names mapped to national activities by rule |
| `chapter-activities.ts` | `activities` on `data/<org>/chapters.json` (+ `fire-h/activities.json`) | R3: Folkehjelp chapter pages, LHL activity pages (sitemap), Diabetesforbundet event slugs, Mental Helse event API, 4H programme |
| `speiderforbundet-groups.ts` | `data/speiderforbundet/chapters.crawl.json` + `parents.page.json` | blispeider.no: groups from the JSON index (coordinates), group pages (address, age branches, krets) |
| `geocode-input.ts` | `data/_geocoding/locations.csv` | every place per chapter and activity, with `max_precision` - the input for one general geocoder |
| `activity-descriptions.ts` | rewrites `description`, `summary` in `data/<org>/activities.json` | each activity's own page, parsed with Cheerio (`lib/description.ts`); blocks repeated on 4+ pages are site furniture and dropped |
| `activity-facts.ts` | `data/_activity-facts/activity-facts.csv` | keyword rules find the sentence; the sentence is the evidence |

**What is on disk.** `chapters.crawl.json` and `chapters.registry.json` are intermediate
files: `reconcile` reads them and writes `chapters.json`, and they are not kept in `data/`.
`nks-chapters.ts` appends to `change-log.csv`, but no change log is on disk at the moment.

⚠️ **Run order matters.** `hierarchy` and `classify` rewrite `chapters.json` in place
*after* `reconcile` has written `reconciliation.csv`. Finish every run with
`hierarchy` → `derive` → `reconciliation-csv`. `npm run check:integrity` (run it from
`schemas/build/`, not here) fails if the CSV and the JSON disagree, or if a chapter's `href`
does not match its id.

⚠️ **`assertedAt` comes only from a date the source states** - Kirkens Bymisjon's page
`modified`, 4H's `og:article:modified_time`. Every other extractor omits it. Stamping the fetch
date there once turned 6 936 known unknowns into confident claims; `check:integrity` now fails
on any `assertedAt` equal to the fetch date without a matching `sourceUpdatedAt`.

## `src/lib/` — where the traps live

Each of these cost real debugging time and is now in one place:

- **`text.ts`** — `Ø`, `Æ` and `Å` do **not** decompose under Unicode NFD. Folding
  `'RØDE KORS'` without mapping them first yields `'RDE KORS'`, so a pattern for
  `RODE KORS` matches **zero** of 383 real units, silently and with no error.
- **`url.ts`** — registry data carries IRIs (`.../sør-trøndelag`) that fail `format: uri`,
  and structurally broken hosts (`https://facebook/...`). Normalised at ingest, because
  the generated schema found these only *after* the data had shipped.
- **`io.ts`** — `omitEmpty` enforces the standard's omit-don't-null rule at the producer,
  so a `"county": null` can never reach a data file.
- **`text.ts` — `decodeEntities` and `detectLanguage` were both too thin.** The entity table
  had no `&ndash;`, `&hellip;` or `&laquo;`, so undecoded entities reached published
  descriptions. `detectLanguage` tested five rare markers and returned `UNKNOWN` for plain
  bokmål; it now tests the indefinite articles `en`/`et` against `ein`/`eit`, which appear
  in every other sentence. ⚠️ English markers must be words Norwegian does *not* use — an
  intermediate version added `for` and read `Vi sørger for en pute å hvile hodet på` (four
  Norwegian `for`s) as English.
- **`text.ts` again — `stripHtml` collapses `/\s+/` to one space.** That is right for a
  single value and wrong for any block whose *lines* carry meaning. Substituting `<br>` with
  `\n` and then calling `stripHtml` flattens the block back into one line, so every
  per-line match fails and the extractor reports **zero** results with no error. It cost a
  full 139-page crawl: 18 pages carried a contact block and 0 contacts came out. Strip tags
  locally when line structure matters.
- **`http.ts`** — one User-Agent, retry with backoff, and `paced()` for politeness rather
  than throughput. frelsesarmeen.no returns **429** from roughly 120 requests at 2.5/s, so
  that crawl runs at 1 request per 1.5 s.

## Two registry endpoints, not one

`brreg-chapters.ts` searches **`enheter`** and matches by name. That is right for a
*federated* organisation, whose chapters are separate legal entities. It returns almost
nothing for a *unitary* one: Frelsesarmeen came back as 1 row, Kirkens Bymisjon as 3.

They are not missing. They are registered as **`underenheter`** (sub-units, form `BEDR`)
under the parent entity — 175 and 151 of them — which `brreg-subunits.ts` reads through the
declared `overordnetEnhet` link. No name matching is involved, so precision is 100% by
construction rather than the 93.6% measured for the name-matched route.

Run it only for unitary organisations: a federated one's sub-units are back offices and
depots, not chapters.

## The national-boilerplate trap

Every organisation repeats its own head-office details on every chapter page, and each
repetition is a value that is present, plausible and wrong for the chapter:

| what | where it was found | chapters it would have corrupted |
|---|---|---|
| schema.org `LocalBusiness` with the head-office address | Norsk Folkehjelp, every page | 113 |
| `facebook.com/<organisation>` in the footer | Diabetesforbundet | **all** |
| | Norsk Folkehjelp | 6 of 8 sampled |
| the `22 79 90 xx` switchboard | LHL header | several |
| `4hnorge@4h.no`, `+47 64 83 21 00` | 4H, every klubb page | all 457 |

⚠️ The structured-data case is the dangerous one, because ld+json *looks* authoritative.
Reading it because it is machine-readable would have stamped Stortorvet 10, Oslo onto every
Folkehjelp chapter — uniformly, with no parse error and nothing to notice. None of these
parsers read ld+json; they read the visible contact block, which is the part that is
actually about the chapter.

The general rule this yields: **before trusting a field, count its distinct values across
the crawl.** One value repeated on every chapter is the organisation's, not the chapter's.

## Safety rails

- **Partial runs cannot overwrite.** `--limit` writes `chapters.partial.json`; the
  canonical file is untouched unless `--write-partial` is given. Found the hard way: a
  10-page smoke test replaced a 464-chapter dataset.
- **Batch guard.** If more than 30% of chapters change in one run, the crawler refuses to
  write (exit 2) and preserves the previous file. That is a source redesign or a broken
  selector, not real churn.
- **Parse-suspect flag.** A block that changes *and* is now empty is flagged, never
  recorded as a removal — a broken selector is indistinguishable from an organisation
  deleting everything, and blanking real data is the worse outcome.
- **Alias resolution.** Chapter pages abbreviate (`Omsorgsber.`), so activity references
  resolve against the catalogue and its aliases before a new definition is minted.
- **An organisation number is nine digits, or it is not a join key.** Frelsesarmeen's pages
  print one per contact card — but two cards print the *national* number instead of their
  own. Accepting it would collapse those units onto the national entity. Both
  `frelsesarmeen-chapters.ts` and `reconcile-chapters.ts` reject any value that is not
  exactly nine digits, and the crawler additionally rejects the national number itself.
- **A block found but nothing parsed is an error, not an absence.** `frelsesarmeen-chapters.ts`
  counts contact blocks seen against people extracted and fails loudly when the first is
  non-zero and the second is zero. Without that check a dead selector is indistinguishable
  from an organisation that names nobody — and the quiet reading is the one you believe.
- **The two sources disagree about whether the town belongs in the name, inconsistently.**
  Brreg holds `AKTIVITETSHUSET BJERKE` (no town) beside `AKTIVITETSHUSET HAUGESUND` (town),
  for units the site calls `Aktivitetshuset Bjerke, Oslo` and `Aktivitetshuset, Haugesund`.
  One key cannot satisfy both, so crawl items are indexed under their full name *and* under
  the name with the town removed — the latter used only when it leaves exactly one
  candidate, because `Aktivitetshuset` alone is four different units in four towns. Worth
  20 of Kirkens Bymisjon's 67 matches.
- **Appending a place to a name that already contains it.** `Bybo, Oslo` became
  `Bybo, Oslo, Oslo` and matched nothing. Fixed by comparing whole slug *tokens*: an
  `endsWith` test misses `Moss Frivilligsentral` where the place leads, and a substring test
  would fire on any name merely containing the letters, merging unrelated units whenever a
  short place name like `Sem` or `Voss` sits inside a word.
- **One page is not one chapter.** 83 of Frelsesarmeen's 139 unit pages describe a single
  unit; the rest are place hubs listing every unit in a town (Oslo: 49 contact cards).
  Taking the page as the unit would have reported 139 units instead of 307 contact cards.
  307 is the crawl's own count. The reconciled data holds 261 crawl-side units (BOTH 134 +
  SOURCE_ONLY 127) - the crawl output is not kept, so the 46 in between cannot be re-traced -
  plus 41 REGISTRY_ONLY, giving Frelsesarmeen's 302.

## Cache

`.cache/frivillige.json` holds the register pull (~34 MB) so a match run needs no network.
Refresh with `--fetch`. Gitignored.
