# Case: building a chapter + activity dataset for Sanitetskvinnene

Worked example for the `cms_bins` pattern — Tier A NGOs that publish a chapter directory on
their own website, a second source alongside the registry (each federated chapter is also its
own Brreg `enhet`; see `ngo-chapters-findings.md` §4 for the unitary sub-unit correction). Investigated **21 September 2026**. Every number below was measured.

The question was: *does N.K.S. publish a dataset, and if not, can one be built?*
**Answer: no dataset exists, and yes — cleanly, in about 17 minutes of crawling.**

---

## 1. Verdict: there is no dataset

Checked and ruled out:

| Checked | Result |
|---|---|
| `/jsonapi`, `/jsonapi/node/lokalforening` | 404 — Drupal JSON:API not enabled |
| `/graphql` | 404 |
| `/api`, `/rest/lokalforeninger` | 404 |
| `?_format=json` on a content route | **406** — `{"message":"No route found for the specified format. Supported formats: html."}` |
| JSON-LD on chapter pages | `BreadcrumbList` only — no `Organization`, no `PostalAddress` |
| data.norge.no / open-data listing | none |

The 406 is the decisive one: the route exists and Drupal's serializer is explicitly HTML-only.
This is a website, not a data source. **It has to be built.**

The site is **Drupal 11** (Simple XML Sitemap module, Ramsalt agency). That is good news —
Drupal renders consistent, class-annotated markup, so parsing is stable rather than brittle.

---

## 2. Permission position

`robots.txt` is the Drupal stock file. What matters:

- **`/lokalforening/*` is not disallowed.** Disallow covers `/core/`, `/profiles/`, `/admin/`,
  `/user/*`, `/search*`, `/node/add/`, `/comment/reply/` — none of them ours.
- **No `Crawl-delay` for `User-agent: *`.** The only crawl-delay is a targeted
  `User-agent: Scrapy → Crawl-delay: 10`, i.e. they have been bothered by default-configured
  Scrapy jobs before.
- `/sitemap.xml` is served publicly and advertised.

**Read the Scrapy rule as intent, not just as a literal.** The site is asking automated clients
to be gentle. Honour the spirit: ~1 req/s, an identifying User-Agent with a contact, off-peak,
and never re-crawl what has not changed. At 552 pages this is a trivial load either way.

⚠️ N.K.S. is a **peer organisation, not a public register.** Unlike Brreg or tilskudd.no there
is no NLOD licence and no obligation to publish. Recommendation: **send a courtesy mail before
the first full crawl** — same pattern as the three mails in `../money/HOWTO-api-access.md` §E.
*The first full crawl ran 26 Sep 2026 without it; the mail is still outstanding before the
next one.* A peer NGO
asked in advance is a collaborator; one that discovers a crawl in its logs is a complaint.

---

## 3. The three things the site does give

### a. A complete chapter index — the sitemap

```
https://sanitetskvinnene.no/sitemap.xml      1 095 URLs total
  └── /lokalforening/<slug>                    552 distinct
```

**552 lokalforeninger, enumerated exactly, maintained by N.K.S. itself.**

Compare: name-matching Brreg found **464** (`ngo-chapters-findings.md`). The website has **88
more** than the register. The HTML listing at `/lokalforening` paginates 10 per page — 56
requests and fragile. **Use the sitemap, not the listing.**

### b. A per-chapter page with structured fields

Drupal field classes make extraction deterministic:

| Field class | Content |
|---|---|
| `field--name-field-address` | Visiting address — street, postnummer, poststed |
| `field--name-field-map` | Leaflet map; coordinates live in `drupal-settings-json` |
| `field--name-field-leader-full-name` | 🔴 leader's name — **excluded, see §5** |
| `field--name-field-leader-mobile` | 🔴 leader's mobile — **excluded, see §5** |

Plus an **`<h2>Aktiviteter</h2>`** section listing named activities as `<h3>` items, and a
Facebook link.

Verified on `alta-sanitetsforening`: address *Kjeldsbergveien 10, 9510 ALTA*, coordinates
*69.970129, 23.244519*, activities *Omsorgsber., Kløvertur, Språkvenn*.

**Coordinates are the real prize.** Brreg gives a registered postal address; this gives an exact
point for the meeting venue. It *would* resolve `kommune_nr` by point-in-polygon rather than by
name matching, sidestepping the `Os` collision problem entirely. **Designed, not implemented:**
548 of 575 chapters have coordinates, but no chapter has `municipalityMethod`
`POINT_IN_POLYGON` — 405 take the municipality from the registry and 170 have none.

### c. A canonical activity catalogue — 12 pages

```
/foreningsnett/aktiviteter                    (index)
/foreningsnett/aktiviteter/eldre | integrering | kvinnehelse | naeringsliv
                          | omsorgsberedskap | ressursvenn
/foreningsnett/aktiviteter-frivillige/klovertur | sprakvenn | motherhood
                          | asylmottak | kanskje-kommer-kongen
```

This is the taxonomy, published by N.K.S., and it splits exactly the way Atlas's model already
does: **thematic categories** (eldre, integrering, kvinnehelse, omsorgsberedskap) map to
`service_category_code`; **named programmes** (Kløvertur, Språkvenn, Ressursvenn, Motherhood)
map to `dim_activity.canonical_name`. No taxonomy has to be invented.

It also resolves the abbreviations on chapter pages — `Omsorgsber.` → *Omsorgsberedskap*.

---

## 4. Feasibility: measured, not estimated

A parser was written and run against **52 pages** (two samples, 12 and 40):

| | |
|---|---|
| Parse success | **52 / 52 (100%)** |
| HTTP failures | 0 |
| Pages listing ≥1 activity | 60% (sample) |
| Pages listing none | **40%** (sample) |

Activity vocabulary observed in 40 pages — a small controlled set, which is what makes this
tractable:

| Activity | Count |
|---|---|
| Omsorgsber. | 17 |
| Kløvertur | 16 |
| Lesevenn | 4 |
| Språkvenn | 4 |
| Ressursvenn | 1 |
| Sisterhood | 1 |
| Dig In | 1 |

**Full crawl cost: 552 pages, ~17 minutes at 1 req/s, ~56 MB.** Trivial. The work is in the
reconciliation (§7), not the fetching.

⚠️ **A third of chapters list no activities, and that is not the same as running none.** The
sample said 40%; the full crawl measures **190 of 551** crawled chapters (34%). It means
the local volunteer never filled the field in. Model it as "no activities listed" (the
`activities` key absent), never as "runs none". Publishing a map that shows those 190 chapters as inactive would be wrong
and locally visible as wrong — the fastest way to lose a peer NGO's goodwill.

---

## 5. 🔴 The personal-data problem, and it is not hypothetical

**Every chapter page publishes the local leader's full name, private mobile number and personal
email address.** From one real page:

> Leder: [name] · 91 23 45 67 · [firstname][lastname]@hotmail.com

A `@hotmail.com` address is unambiguously a private individual's, not an organisational one. At
552 pages, a naive scrape produces **a national directory of ~550 named volunteers' private
phone numbers and personal email addresses** — overwhelmingly women, since this is N.K.S.

That is squarely **bestemmelse 5 (personvern)**, and it is worse than the Brreg case in §7 of
`ngo-chapters-findings.md`, because here it is one identified person per chapter with three
identifiers each.

> **Superseded (21 Sep 2026).** The data owner instructed that published contacts be
> carried, so the rule below was reversed: `ingest/src/sources/nks-chapters.ts` **does**
> extract the leader's name, phone and e-mail into `contacts`, and flags the chapter
> `provenance.containsPersonalData`. `npm run nks -- --no-contacts` omits the block. The
> current file holds 542 Sanitetskvinnene contacts (530 phones, 412 e-mails, 379 on a private
> domain), `isMasked: false` on all. ⚠️ All 542 names are malformed (a parser bug, fixed in
> code 3 Oct 2026; the data needs a re-crawl). The original recommendation is kept below for
> the record.

**Design rule (original, not implemented): the parser must not extract these fields at all.** Not extract-then-drop —
never extract. The reference parser written for this case *omitted* `field-leader-full-name` and
`field-leader-mobile` by construction, with a comment saying why — the current TypeScript
parser does not; see the note above.

Keep: chapter name, address, coordinates, postnummer/poststed, activities, Facebook URL, source
URL, fetch timestamp. That is a complete and useful dataset with no person in it.

⚠️ **Ta kontakt med AI-ansvarlig.** The first full crawl ran 26 Sep 2026 without that
confirmation; it is still the decision worth taking before the next one, and before anything
leaves a local disk.

---

## 6. Extraction design

```
1. GET /sitemap.xml                      → 552 /lokalforening/ URLs
2. GET /foreningsnett/aktiviteter*       → 12 pages → canonical taxonomy
3. For each chapter URL (1 req/s):
     name        ← JSON-LD BreadcrumbList, last item
     address     ← .field--name-field-address
     postnr/sted ← regex \b(\d{4})\s+([A-ZÆØÅ][\w\s-]+) on the address block
     lat / lon   ← drupal-settings-json → leaflet.*.features
     activities  ← <h2>Aktiviteter</h2> → following <h3> items
     facebook    ← first facebook.com href
     contacts    ← leader name / mobile / email (extracted since 21 Sep; --no-contacts omits)
4. kommune_nr   ← point-in-polygon on (lat, lon), NOT name matching   (designed; not implemented)
5. Join to Brreg on normalised name → orgnr
```

Two parser notes from the sample run:

- The address block regex currently over-captures trailing text (`ÅLESUND Norge Bli medlem`).
  Terminate at `Norge` or at the next `<h2>`.
- Remember the **`Ø`/`Æ`/`Å` NFKD trap** from `ngo-chapters-findings.md` §2 when normalising
  names for the Brreg join. It fails silently, returning zero matches.

---

## 6b. The output contract: reuse the NRX Organizations API

> **Superseded.** The NRX shape was later adapted rather than kept verbatim: data now uses the
> Atlas camelCase `Chapter` shape defined in `api/` YAML and generated to
> `dist/schema/ChapterDataset.schema.json`, with no `branch*` or `x_*` fields. Mapping
> (approx.): `branchName`→`name`, `branchContacts`→`contacts`, `branchActivities`→`activities`,
> `x_source`/`x_extract`→`provenance`/`freshness`, `chapter_level`→`level`,
> `id_origin`→`provenance.idOrigin`. The section below records the original decision.

**Decision (21 Sep 2026): do not invent a schema.** The Norwegian Red Cross NRX Organizations
API v1 (`developer.redcross.no`, `getOrganizations`) already models exactly this problem, and it
is adopted verbatim as the extraction target for every NGO. A Røde Kors extract is then raw API
output; a Sanitetskvinnene extract is a crawl shaped into the same envelope; one loader reads
both.

Files (at the time): `schema/` — one file per entity, entry point `schema/extract.schema.json`, since
replaced by `api/` + `schemas/` → `dist/schema/` — and
`data/sanitetskvinnene/extract.example.json` (Alta
Sanitetsforening, real data). **Verified: both the unmodified NRX sample payload and the
Sanitetskvinnene crawl validate against the single schema with zero errors.**

Three parts of NRX generalise better than anything I would have designed:

- **`branchActivities` = `globalActivityName` + `localActivityName`.** This is precisely the
  abbreviation problem on crawled sites: the chapter page says `Omsorgsber.`, the national
  catalogue says *Omsorgsberedskap*. NRX already separates canonical from local. Used unchanged.
- **`geoLocation` as a GeoJSON Feature.** Standard, and it carries the N.K.S. coordinates
  directly. ⚠️ Axis order is `[lon, lat]` — the reverse of how Norwegian sources print it.
  N.K.S.'s Leaflet config gives lat first; swapping them puts every chapter in the Atlantic.
- **Role-based contact masking.** NRX's own note says some functions are *"masked with function
  descriptions instead of actual names"*. That is Røde Kors's established precedent, so non-RK
  extracts follow it rather than inventing a different rule.

### N.K.S. website → NRX field mapping

| NRX field | Source on sanitetskvinnene.no | Notes |
|---|---|---|
| `branchName` | JSON-LD `BreadcrumbList`, last item | *Alta Sanitetsforening* |
| `branchType` | constant per NGO | NRX's enum is RK-specific; N.K.S. uses *Sanitetsforening* / *Unge Sanitet* / *Sanitetslag* |
| `organizationNumber` | **not published** | Resolved by Brreg join; null until then |
| `streetAddress.*` | `.field--name-field-address` | *Kjeldsbergveien 10, 9510 ALTA* |
| `geoLocation` | `drupal-settings-json` → `leaflet` | `[23.244519, 69.970129]` — reorder to lon,lat |
| `branchLocation.municipality` | **derived** | Point-in-polygon, not name matching |
| `branchContacts[]` | `field-leader-full-name` / `-mobile` / email | Published by N.K.S.; see §5 |
| `branchActivities[].localActivityName` | `<h2>Aktiviteter</h2>` → `<h3>` | Verbatim, abbreviations kept |
| `branchActivities[].globalActivityName` | `/foreningsnett/aktiviteter*` | The national catalogue, 12 pages |
| `communicationChannels.x_facebook` | first `facebook.com` href | Often the only live channel |

### Where NRX assumes Røde Kors, and what the extension does

NRX is a single-organisation API, so five things are required that cannot hold generally. The
extensions are additive and namespaced (`x_source`, `x_extract`, `x_*`), which is why an NRX
payload still validates unchanged:

| NRX assumption | Why it breaks | Handling |
|---|---|---|
| `branchNumber` required | RK-internal id; no equivalent elsewhere | Empty string + `x_source.id_origin = "derived"` — never a fabricated number |
| `organizationNumber` required | Many crawled units carry no orgnr of their own (unitary NGOs' units are often Brreg *sub-units* — see `ngo-chapters-findings.md` §4) | Nullable + `reconciliation = "source_only"` |
| `branchParent` required | A crawled site rarely states the parent | Nullable + `parent_origin = "unstated"`, rather than a guessed hierarchy |
| `branchType` is a 3-value RK enum | Other NGOs use their own vocabulary | Keep the NGO's own term; portable level goes in `x_source.chapter_level` |
| No provenance fields | The API *is* the system of record; a crawl is not | `x_extract` — source, method, timestamp, parser version, parse rate, robots status, licence |
| `isVolunteer` / `isMember` / `memberNumber` | RK membership-system fields | Null for other NGOs. **`memberNumber` must never appear in a public view** — it is a direct identifier into a membership system |

One genuine gap worth raising with the Integration Team: **NRX has no field for "this activity
is offered but we don't know if it is running"**, and no `lastVerifiedAt` per branch. For
crawled sources that matters, because an empty `branchActivities` means *nothing published*,
not *nothing running* — see §4.

## 7. Validation — the part that is actually work

Three independent checks, all available:

1. **Website ↔ Brreg.** 552 vs 464. Every chapter gets a status: *both* · *website only* ·
   *Brreg only*. Website-only means a chapter with no separate legal entity; Brreg-only means a
   dormant registration or a site gap. This is what turns the single Røde Kors precision figure
   into a measurement for a second NGO.
2. **Coordinates ↔ Atlas kommune.** Point-in-polygon against `dim_kommune`, then compare with
   the `kommune_nr` on the matched Brreg record. Disagreements are informative, not errors: they
   are chapters whose meeting venue is in a different kommune from their registered address —
   precisely the *"registered, not where it works"* caveat Atlas already carries.
3. **Activity names ↔ the canonical catalogue.** Anything on a chapter page that is not in the
   12-page taxonomy is either a local invention or a parse error. Both are worth seeing.

**Expected output:** `sanitetskvinnene/chapters.json` (~552 records) and
`sanitetskvinnene-activities.csv` (chapter × activity), plus a reconciliation report.
*Actual (3 Oct 2026): `chapters.json` with 575 chapters (BOTH 439, SOURCE_ONLY 112,
REGISTRY_ONLY 24 — after removing the `velg-forening-meg` chapter-picker page), activities nested per chapter and the catalogue in `activities.json`;
the activities CSV was never produced.*

---

## 8. Generalising: the reusable pattern

This case establishes the recipe for the other eight `cms_bins` NGOs:

```
1. Is there an API?        /jsonapi · /graphql · /api · ?_format=json · JSON-LD
2. Is there an index?      robots.txt → sitemap.xml → chapter URL pattern
3. What does a page yield? one page, by hand, listing every field
4. What is personal?       decide exclusions BEFORE writing the parser
5. Is there a taxonomy?    a national activity catalogue to map onto
6. Sample 40, then crawl.  measure parse rate before committing
```

Step 4 comes before step 6 deliberately. On this site it changed the parser design.

Early signals for the others, from the Phase 1b survey:

- **Kirkens Bymisjon** — `robots.txt` enumerates ≥99 `tilbud-*` subsites. Each *tilbud* is a
  named service, so for a unitary NGO the activity layer may be easier than the chapter layer.
- **Mental Helse** — WordPress multisite, one subsite per lokallag, each with its own
  `sitemap_index.xml`. Likely also exposes the **WordPress REST API** at `/wp-json/wp/v2/` —
  check that first, it would be a genuine dataset.
- **Frelsesarmeen** — *resolved.* The earlier probe read the sitemap **index** rather than the
  sub-sitemap it points to. `sitemaps-1-categorygroup-departments-1-sitemap.xml` lists **139**
  `/lokalavdeling/` pages. Those pages are not one-unit-per-page: 83 describe a single unit and
  the rest are place hubs listing every unit in a town (Oslo carries 49 contact cards). The
  unit of extraction is the **card**, giving 316 cards and 307 distinct units at the 21 Sep
survey (261 crawl-side units after reconciliation: BOTH 134 + SOURCE_ONLY 127). The cards also
  print organisation numbers, which makes reconciliation exact. See
  `ingest/src/sources/frelsesarmeen-chapters.ts`.

---

## 9. Open questions

- Send the courtesy mail to N.K.S. before the next crawl — who owns that contact? (§2)
- Decide the personal-data question with AI-ansvarlig before the next crawl (§5) — which is
  also the crawl that would repair the 542 malformed names
- Are the website-only chapters unregistered sub-groups, or Brreg units my name matching
  missed? *Reconciliation has since run: 112 remain SOURCE_ONLY* (88 at the 21 Sep sample);
  which of the two each one is still needs a look.
- Does N.K.S. hold this as a real database internally? If so, asking for an export beats
  crawling — and this document becomes the specification for what to ask for.
