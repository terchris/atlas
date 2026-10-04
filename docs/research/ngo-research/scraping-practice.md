# Collecting NGO data — the combined practice of Atlas and this research

3 October 2026. Atlas (`terchris/atlas@59e8bc3`) designed a scraping infrastructure carefully and
has not yet used it — no source imports `lib/scraping`. This research crawled eleven NGO sites
for real and paid for every mistake in debugging time. Each side has what the other lacks. This
document records what the research has **taken from Atlas**, what Atlas should **take from the
research**, and the merged checklist every NGO source should meet — in Atlas or here.

## Decision: contact persons published by the organisations

**Recorded 3 October 2026, by Terje Christensen, owner of both this research and Atlas.**

Names, roles, phone numbers and e-mail addresses that an NGO publishes on its own website as
the contact for a chapter or activity **are collected and stored**. The people listed there have
put their details out precisely so that they will be contacted, and Atlas exists to connect
people with them.

**The owner carries the responsibility for the legal basis** — GDPR, the NGOs' terms, and the
standard to be offered to the NGOs. Neither this research nor Atlas's agents assess it further;
they record the decision and implement it.

This supersedes, for published contact persons, Atlas's rule
*"nothing about named contact persons is stored"* (`INVESTIGATE-ngo-scraping-infrastructure.md`
§D.3) and the open "needs a personvern decision" notes in this research. What the implementation
still owes the decision:

- **Only what the organisation published, from where it published it.** No enrichment from
  other sources, no inference — a contact row exists because a page shows it, and carries that
  page's URL.
- **Flagged.** `provenance.containsPersonalData` on the record; `Contact.isMasked` available
  per person, so a consumer or the owner can suppress a person in one predicate.
- **Removed when the page removes it.** A person no longer on the page leaves the dataset on
  the next run — the source of truth is the page, not our copy.
- **Correct.** The 542 malformed N.K.S. names must be re-parsed before contacts are published
  (§2.1 makes that a re-parse, not a re-crawl, from now on).

---

## 1. Taken from Atlas — now in this research

| Atlas practice | Where in Atlas | Status here |
|---|---|---|
| **robots.txt checked for every URL**, Disallow is a hard failure | `lib/scraping/robots.ts`, §A.3, §D.4 | ✅ Adopted — `ingest/src/lib/robots.ts` is Atlas's parser, ported; `http.ts` refuses disallowed URLs and never retries them |
| **Crawl-delay honoured** | §D.2 | ✅ Adopted — enforced per host in `http.ts`, whatever delay the extractor asks for. Measured need: 4h.no asks 5 s; the 26 Sep crawl ran at 0.9 s |
| **No anonymous crawling** — contact address in the User-Agent, refuse to run without it | `lib/scraping/ua.ts`, §D.1 | ✅ Adopted — same variable, `ATLAS_SCRAPE_CONTACT_EMAIL` |
| **Cache every fetched body** | `lib/scraping/kv.ts`, §C.1 | ✅ Adopted — `ingest/.cache/pages/` (gitignored); `NGO_FROM_CACHE=1` re-parses offline. Would have turned the N.K.S. name defect into a five-minute fix. Since 4 Oct: gzip-compressed (~10× smaller), **verified lossless on every write** — decompressed and compared byte for byte, stored uncompressed if they ever differ — with the original's SHA-256 and size recorded so the cache can be re-verified. Proposed for Atlas's `kv.ts` |
| Parse with a **DOM parser** (Cheerio), not regular expressions | Crawlee `CheerioCrawler`, §B | ⏳ Not yet. The research parses HTML with regexes; the N.K.S. defect (a capture starting mid-tag) cannot happen with a DOM parser. Adopt when extractors move to Atlas |
| **Pure `parse.ts` + golden-file tests** from cached pages | scraper folder convention | ⏳ Not yet. Now possible: the page cache is the fixture source |
| **Incremental fetch** from sitemap `lastmod`; **orphan detection** when a URL disappears | `lib/scraping/sitemap_log.ts`, §C.2 | ⏳ Not yet. Every run here re-fetches everything |
| **Run log with a lock** — one run per source at a time, counters per run | `lib/scraping/ingest_runs.ts` | ⏳ Atlas-side; not needed for a research workstation |
| **Template-drift signal** — page hash changed while extracted record did not | `lib/scraping/html_raw_hash.ts` | ⏳ Complements the research's per-block hashes (§2.2) |
| NFC-normalise text at the parser boundary | §C.3 / Q21 | ⏳ Partly — `text.ts` folds Norwegian letters for matching, does not NFC-normalise stored values |

---

## 2. Learned here — what Atlas should take

Each item is a defect this research actually shipped and then caught. None is caught by schema
validation; every one produced valid JSON.

### 2.1 Parser correctness

| Lesson | The defect behind it | Guard |
|---|---|---|
| **National boilerplate is not chapter data.** Every chapter page repeats the head office's address, phone, Facebook page and schema.org `LocalBusiness` block | Would have stamped Folkehjelp's Oslo address on all 113 chapters; 4H's and Diabetesforbundet's national Facebook on every chapter | Per-site `nationalPhone`/`nationalFacebook` filters; never read `ld+json` for chapter data (`site-chapters.ts`) |
| **A capture must start after the tag, not inside it** | 543 N.K.S. contacts with `givenName = "field--type-string"` | DOM parsing (Atlas's Cheerio) prevents it; a markup check on text fields catches it (`check-integrity.ts` #7) |
| **Zero results where a block exists is an error, not "none"** | A 139-page Frelsesarmeen crawl: 18 pages with a contact block, 0 contacts parsed, no error | Count blocks seen vs items parsed; fail loudly when the ratio collapses (`frelsesarmeen-chapters.ts`) |
| **Ids from the distinguishing path, not the last URL segment** | Two different 4H clubs both called *Start 4H* merged into one | `idFromUrl` keeps the region segment |
| **Norwegian letters do not decompose** | `RØDE KORS` folded to `RDE KORS`; a name pattern matched 0 of 383 units, silently | `foldNorwegian` maps Ø/Æ/Å before NFD |
| **Filter the site's own furniture out of the URL list** | N.K.S.'s chapter *picker* page, with a test leader, stored as a chapter; LHL's `/kalender` page stored as a chapter named *Aktiviteter* | URL exclusions with the reason written beside them |
| **Line structure is data** | `stripHtml` collapsed `<br>` lines; every per-line match failed; 0 results, no error | Strip tags locally when line breaks carry meaning |

### 2.2 Change detection

Atlas's `record_hash` says *whether* a record changed. The research hashes **each block**
(identity, location, contacts, activities) separately, and records `firstSeenAt`, `changedAt`,
`changeCount` per block (`change-detection.md`). That answers *what* changed — "the leader
changed" is a different event from "the address changed" — and gives a churn signal (unchanged
for years may mean abandoned).

And: **a block that changed and is now empty is a suspected parser failure, not a deletion**
(`isParseSuspect`). Blanking real data on a selector regression is the worst outcome; flag it and
keep the previous value.

### 2.3 Two sources, reconciled — never one alone

- Name matching against Brreg produces **confidently wrong** results; measured precision 93.6%.
  A chapter confirmed by both the registry and the organisation's own directory is the only
  HIGH-confidence chapter (`reconcile-chapters.ts`: organisation number → name → name minus town).
- **Unitary organisations hide in `underenheter`**, not `enheter`: Frelsesarmeen 175, Kirkens
  Bymisjon 151 sub-units reachable through `overordnetEnhet` with no name matching at all.
- Every derived value carries its method: `matchMethod`, `parentMethod`, `municipalityMethod`,
  `idOrigin`, `confidence`, `reconciliation`.

### 2.4 Three clocks, not one

`fetchedAt` (when we looked), `sourceUpdatedAt` (when the page says it changed), `assertedAt`
(when the owner confirmed the fact). **Never fill `assertedAt` from the fetch date**: the
research did, 6 936 times, turning "unknown" into a confident claim; it is now removed and an
integrity check fails if it returns (`data-freshness.md`).

### 2.5 Gates that schema validation cannot be

The research's `check-integrity.ts` checks, after schema validation passes: references resolve,
one root per organisation, no cycles, no duplicate ids, derived files agree with their source,
no markup in names, no fetch-date assertions, every record self-linked. Each one exists because
the failure it catches passed every schema check first.

### 2.6 Hierarchy is stated, or it is labelled inferred

The regional tier comes from the organisation's own URL structure or sitemap where it says so
(Røde Kors's `/lokalforeninger/<distrikt>/<lag>`, LHL's `/lokallag/<fylkeslag>/<lag>`), and
from county lines only where the regional bodies follow them — and then marked `INFERRED`.
Speiderforbundet's kretser do not follow county lines; geography would invent edges there.

---

## 3. The combined checklist — every NGO source, in Atlas or here

**Before the first fetch**
- [ ] CMS API → sitemap → crawl, in that order (Atlas §A).
- [ ] robots.txt allows the paths; Crawl-delay noted; courtesy mail sent or decided against.
- [ ] Identify the national boilerplate on a chapter page (address, phone, social links, ld+json) and write the filters first.

**Fetching**
- [ ] robots.txt checked per URL, every run; Crawl-delay enforced per host.
- [ ] User-Agent with a resolving URL and a contact address; refuse to run without.
- [ ] Every body cached; parsing runs from the cache.
- [ ] Incremental by sitemap `lastmod`; vanished URLs mark the record inactive, never delete silently.

**Parsing**
- [ ] DOM parser, pure `parse.ts`, golden-file tests from cached pages.
- [ ] NFC-normalised text; Norwegian letters folded only for matching keys, never in stored values.
- [ ] Ids from the distinguishing path; site furniture excluded with a written reason.
- [ ] Blocks-seen vs items-parsed counted; a collapse fails the run.

**Recording**
- [ ] Per-block hash, `firstSeenAt`, `changedAt`, `changeCount`, `isParseSuspect`.
- [ ] `fetchedAt` always; `sourceUpdatedAt` when the page states it; `assertedAt` only from a source-stated date.
- [ ] Every derived value carries its method and confidence; inferred edges say so.
- [ ] Contacts: only as published, with the page URL, flagged `containsPersonalData`, dropped when the page drops them.

**Before publishing**
- [ ] Reconciled against the registry (enheter **and** underenheter); registry-only and source-only both kept and labelled.
- [ ] Integrity gates green (references, hierarchy, derived-file agreement, markup, clocks, links).
- [ ] The NGO's own publication decision recorded by the owner.

---

## 4. Toward the standard the NGOs will be invited to follow

The owner intends to publish this data model as a standard and invite the NGOs to publish their
own data in it. When an NGO does, it becomes that NGO's **authoritative source** and the crawl
becomes a fallback — the best outcome for everyone, and the end of scraping that NGO.

One design consequence to settle before the standard is offered: the current contract mixes two
kinds of field.

| Profile | Who fills it | Examples |
|---|---|---|
| **Publisher profile** — what an NGO publishes about itself | the NGO | name, level, parent, address, coordinates, activities and their descriptions, contacts, meeting times |
| **Aggregator profile** — what a collector adds | Atlas / this research | `reconciliation`, `confidence`, `matchMethod`, `parentMethod`, `fetchedAt`, `contentHash`, `isParseSuspect`, `href` |

An NGO should be asked for the first and never for the second. Splitting them — the publisher
profile as the standard, the aggregator profile as Atlas's extension of it — is the step that
turns this research's schema into something an NGO can adopt. `api-standard-alignment.md`
already aligns the contract with the Red Cross API Standard, which is a good starting point for
a cross-NGO one.
