# Investigate: Norsk Folkehjelp supply ingest

> **IMPLEMENTATION RULES:** Before implementing any plan from this investigation, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog

**Goal**: Decide how to ingest Norsk Folkehjelp's lokallag and per-chapter activities into Atlas. Unlike Red Cross, NF exposes no public API — sources are server-rendered HTML at `folkehjelp.no/lokallag/{slug}` plus the Brreg open Enhetsregister. Settle the NF-specific source surface, chapter-identity model (web vs Brreg), and the activity → service_category mapping for NF's 6-bin taxonomy.

**Last Updated**: 2026-04-24

---

## Companion investigations

This investigation focuses **only on what's specific to Norsk Folkehjelp**. Generic concerns are addressed in:

- [`INVESTIGATE-ngo-scraping-infrastructure.md`](../completed/INVESTIGATE-ngo-scraping-infrastructure.md) — tool choice (Crawlee + CheerioCrawler), two-stage scrape→cache→parse pattern, KeyValueStore cache layout, sitemap+hash change detection, ethical-scraping defaults, failure-mode policy, `raw.ingest_runs` observability, per-source folder convention.
- [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](./INVESTIGATE-multi-ngo-supply-model-extensions.md) — `dim_chapter.source_url`, `dim_chapter.chapter_subtype`, `chapter_kommune_coverage` link table.
- [`INVESTIGATE-ngo-events-and-minisites.md`](./INVESTIGATE-ngo-events-and-minisites.md) — sub-activity granularity (deferred parking lot).

Both companion infrastructure PLANs are prerequisites for the Folkehjelp scrape PLAN.

---

## Scope

**In scope:**
- The Folkehjelp source surface (HTML structure, `robots.txt`, sitemap, ethics) — concretely, not the generic doctrine.
- NF-specific Craft GraphQL probe + outreach.
- Chapter identity: reconciling Brreg orgnr with web slug; non-geographic chapters.
- Activity extraction (CSS selectors) and 6 → 22 NF → Atlas category mapping.
- NF-specific `raw.folkehjelp_*` schemas. Brreg-side data uses the shared cross-NGO `raw.brreg_enheter` (see §B.2 + [PLAN-001-brreg-enheter](../completed/PLAN-001-brreg-enheter.md)), filtered by `navn ILIKE 'Norsk Folkehjelp%'`.

**Out of scope (covered elsewhere — see Companion investigations above):**
- Generic scraper toolkit, cache, change detection, ethical defaults, failure modes.
- The data-model extensions (`source_url`, `chapter_subtype`, `chapter_kommune_coverage`).
- Sub-activity granularity from NF's `minisites` / `localBranchEvents`.
- Coverage-gap mart consumption.
- Folkehjelp's national-only programmes (minerydding, utviklingssamarbeid).

---

## Existing research and live-data context

This investigation builds on three already-completed research notes — read these first:

- [`norskfolkehjelp-activities.md`](https://github.com/terchris/atlas/tree/main/docs/research/norskfolkehjelp-activities.md) — 6-bin activity catalogue, slug convention, Brreg-vs-web gap (108 web ↔ 121 Brreg), comparison to Red Cross. Sample of 46 chapter pages already parsed (42 with usable activity sections, 4 empty).
- [`norskfolkehjelp-activity-indicator-matrix.md`](https://github.com/terchris/atlas/tree/main/docs/research/norskfolkehjelp-activity-indicator-matrix.md) — already maps NF activities to demand-side indicators; reuse 100% from Red Cross.
- [`ngo-landscape.md`](https://github.com/terchris/atlas/tree/main/docs/research/ngo-landscape.md) — high-level org info: NORSK FOLKEHJELP, orgnr `871033552`, ~16 000 members, ~100 lokallag, NOK 1.8 bn income (2024).

Already in the live data (shipped by PLAN-001 + PLAN-002):

- `dim_ngo` row for `norskfolkehjelp` (orgnr `871033552`, slug `norskfolkehjelp`, `chapter_data_shape='cms_bins'`).
- `ref_atlas_service_category` — 22 cross-NGO categories.
- `dim_chapter`, `dim_activity`, `fact_chapter_activities` — built for Red Cross. Folkehjelp's staging (`supply__folkehjelp_*`) will UNION ALL into the same downstream marts.
- `dim_postnummer` + `crosswalk_kommune_name` — used by the slug → kommune resolution step.

---

## Section A — Folkehjelp source surface

### A.1 What `folkehjelp.no` exposes

**Confirmed Craft CMS** (verified 2026-04-23): `robots.txt` disallows `/cpresources/`, the canonical Craft asset directory — definitive evidence. See A.4 for the API consequences.

- **Index page**: `https://folkehjelp.no/lokallag` — server-rendered HTML. Lists ~108 lokallag grouped under fylke headings.
- **Per-chapter page**: `https://folkehjelp.no/lokallag/{slug}` — slug is kebab-cased kommune/region name with diacritic transliteration (`asker-og-baerum`, `loerenskog`, `soer-varanger`, `aalesund-og-omegn`). The "Aktivitetsområder" section is rendered from the Craft template; structure verified in Appendix B.
- **Sitemap index**: `https://folkehjelp.no/sitemaps-1-sitemap.xml` — root sitemap-index pointing at **29 sub-sitemaps**. Relevant ones for chapter discovery:
  - `localBranch` — chapter detail pages
  - `localBranches` — chapter index pages (likely fylke-level grouping)
  - `localBranchSites` — chapter sub-sites
  - `localBranchEvents` — per-chapter event listings (deferred to [`INVESTIGATE-ngo-events-and-minisites.md`](./INVESTIGATE-ngo-events-and-minisites.md))
  - `minisites` — programme-specific landing pages (deferred)
  - Other sections (`news`, `pages`, `countries`, `vacancies`, `donate`, `mainNavigation`, etc.) are out of scope.

  Each sub-sitemap is XML with `<loc>` + `<lastmod>` per URL.
- **No structured data**: chapter pages don't expose JSON-LD `Organization` / `Place` markup. Activity extraction is HTML selectors.

### A.2 `robots.txt` — verified content

~~**[Q1]**~~ **Verified 2026-04-23**: `https://folkehjelp.no/robots.txt` allows crawling under `/lokallag/*`. Actual contents:

```
User-agent: *
Disallow: /cpresources/
Disallow: /vendor/
Disallow: /.env
Disallow: /cache/
Disallow: /fagbevegelsen/1-mai
Disallow: /*?token*

User-agent: MJ12bot
Crawl-Delay: 15

User-agent: AhrefsBot
Crawl-Delay: 10

Sitemap: https://folkehjelp.no/sitemaps-1-sitemap.xml
Sitemap: https://www.npaid.org/sitemaps-1-sitemap.xml
```

Notes:
- `/lokallag/*` is not in any disallow rule — clear to crawl.
- `npaid.org` is Folkehjelp's English-language sister site (Norwegian People's Aid International). Out of scope for v1.
- No bot-specific rule for our `Atlas/0.1` UA — the wildcard rules apply, no `Crawl-Delay` enforced. The default 1 req/sec from the [scraping infrastructure](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#d2-rate-limit-policy--q9) is fine.

### A.3 What can break for NF specifically

- **Template change**: Craft CMS upgrades or content-team rework can change the Aktivitetsområder section structure. Mitigation per the [scraping infra failure-mode policy](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#section-e--failure-modes-and-observability): warn-and-continue per chapter; the index page failing is what hard-fails the run.
- **Sub-activity drift**: if NF adds a 7th activity bin to the CMS template, our staging mapping needs an update. Surface as a WARN: `unmapped activity_label "X" — add to supply__folkehjelp_chapter_activities CASE`.
- **NF-specific naming oddities**: `solidaritetsungdom-*`, `studentgruppe-*`, `sanitet-haukeland`, `sentralt`, `svalbard` — handled via the override file (Section B.5).

### A.4 Craft CMS GraphQL probe — **[Q2]** outreach worth pursuing

Per the [scraping infra "ask before scrape" doctrine](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#a1-check-for-a-native-data-api--q1), Craft CMS ships with a built-in GraphQL API at `/actions/graphql/api` (often aliased to `/api`). It's opt-in.

**Probe results 2026-04-23**:
- `https://folkehjelp.no/api` → 404
- `https://folkehjelp.no/actions/graphql/api` → 404

So NF has not enabled the public GraphQL endpoint (or has routed it to a non-default path we haven't discovered).

**Pre-PLAN action**: write to NF (likely `post@folkehjelp.no` or their digital team) asking whether they would expose a read-only Public Schema scoped to `localBranch` / `localBranchSites` / activity entry types. Cost to them: ~30 min config; benefit to Atlas: massively cleaner data pipeline (typed queries, no HTML parsing, native fields for orgnr / contact / postal code, native change detection per entry).

**Decision rule**: the scrape PLAN does **not** block on the NF response. We design around the sitemap + HTML structure (per Sections B and C) so we can ship regardless. If NF later enables GraphQL, it becomes a separate refactor PLAN — `raw.folkehjelp_*` schema is independent of the source mechanism.

---

## Section B — Chapter discovery and identity

### B.1 Two sources of truth — **[Q3]** scrape both

| Source | Authoritative for | API/access |
|---|---|---|
| **Brreg Enhetsregister** | `orgnr`, legal name, `organisasjonsform=FLI`, founding date, register flags (`i_frivillighetsreg`), employee count | Open API, no key. `data.brreg.no/enhetsregisteret/api/enheter?navn=norsk+folkehjelp&organisasjonsform=FLI` |
| **folkehjelp.no** | Public URL, display name, active activities, fylke grouping | Scrape. Sitemap + chapter pages. |

Both required. Brreg gives us the legal-entity backbone (121 lokallag, 88% in Frivillighetsregisteret per the research); web gives us the URL + activities + active/inactive signal. Match on normalised name.

### B.2 Brreg ingest — use the generic `brreg-enheter` source

**Superseded by PLAN-001-brreg-enheter (2026-04-24).** What this investigation originally proposed here — an NF-specific `brreg-folkehjelp-units` seed-source writing to an NF-specific `raw.brreg_folkehjelp_units` table — is *not* what shipped. During implementation the scope was pulled forward to cross-NGO from day one (see [Q4] below). For Folkehjelp, the concrete shape is:

- Use the existing generic ingest at [`atlas-data/ingest/src/seed-sources/brreg-enheter/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/seed-sources/brreg-enheter/README.md).
- Run `npm run refresh:brreg-enheter`.
- It reads [`landscape.json`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/seed-sources/atlas-ngo-landscape/landscape.json), iterates every NGO with a `brreg_query` block, fetches each via the shared typed Brreg client ([`src/lib/brreg/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/lib/brreg/README.md)), and upserts all matches into the shared `raw.brreg_enheter` table.
- Folkehjelp's `brreg_query` block (committed 2026-04-24) is `{ navn: "norsk folkehjelp", organisasjonsform: "FLI", nameStartsWith: "Norsk Folkehjelp" }`. Verified: 122 rows, 108 in Frivillighetsregisteret — matches this investigation's baseline.

Adding a new NGO's Brreg data is a `landscape.json` edit, not a new script/migration. No NF-specific code path anywhere.

~~**[Q4]**~~ ~~Should this be `brreg-folkehjelp-units` (NF-specific) or a more general parameterised script? Recommendation was NF-specific for v1.~~ **Resolved 2026-04-24: generic from day one.** The NF-specific recommendation in this investigation was reversed during PLAN-001 execution; the generic cross-NGO pattern shipped instead. See [PLAN-001-brreg-enheter](../completed/PLAN-001-brreg-enheter.md) for the landed shape.

### B.3 Sitemap-driven chapter discovery

Per the [scraping infra sitemap-first doctrine](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#a2-check-for-a-sitemap):

```ts
// Stage 1: fetch the sitemap index
const indexXml = await fetchText('https://folkehjelp.no/sitemaps-1-sitemap.xml');
const subSitemaps = parseSitemapIndex(indexXml);
const localBranchSitemapUrl = subSitemaps.find(u => u.includes('localBranch'));

// Stage 2: fetch the localBranch sub-sitemap → all chapter URLs + lastmod
const branchXml = await fetchText(localBranchSitemapUrl);
const entries = parseSitemap(branchXml);
// each entry: { loc: 'https://folkehjelp.no/lokallag/asker-og-baerum', lastmod: '2026-03-15' }

// Stage 3: filter to /lokallag/* slugs (the sitemap may also include redirects/legacy URLs)
const chapterUrls = entries
  .filter(e => e.loc.match(/^https:\/\/folkehjelp\.no\/lokallag\/[a-z0-9-]+$/))
  .map(e => ({ url: e.loc, slug: e.loc.split('/').pop()!, lastmod: e.lastmod }));
```

**Fylke grouping** is not in the sitemap. We still fetch the HTML index page (`/lokallag`) **once** per scrape run to capture fylke→slug grouping for the `chapter_kommune_coverage` 'inferred' source. If the HTML index breaks but the sitemap still works, we degrade gracefully — chapters get ingested, regional coverage falls back to the override file.

**Inherited from the [scraping infra §C.2](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#c2-sitemap-level-change-detection--q6--q19)**: `discover.ts` reads/writes the **shared** `raw.sitemap_log` table (one row per `(source_slug, url)` across all sources). This drives:

- **Skip-vs-fetch decision** per URL (skip when `lastmod_now <= stored_lastmod` and a `raw.folkehjelp_chapters` row exists; otherwise fetch).
- **Orphan detection**: any `raw.sitemap_log` row for `source_slug='folkehjelp-chapters'` whose `last_seen_at` is older than this run's `started_at` → mark the corresponding `raw.folkehjelp_chapters` row `is_active=false` (preserves history per [scraping infra §E.1](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#e1-per-page-failure-warn-and-continue--q10)).

Folkehjelp's source-specific code does not implement sitemap-log logic — it calls the shared helpers from `ingest/src/lib/scraping/`.

### B.4 Name normalisation and matching — **[Q5]** Brreg ↔ web

Normalisation function for both sides:

```ts
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/^norsk folkehjelp\s+/, '')   // strip prefix
    .replace(/[åä]/g, 'a').replace(/[øö]/g, 'o').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '-')
    .trim();
}
```

Match strategy (in order):

1. Exact normalised match.
2. Levenshtein distance ≤ 2 against unmatched candidates (handles minor typos; logs every fuzzy match for review).
3. Manual override file (see B.5).

Expected result: ~108 of 121 Brreg rows match a web slug. ~13 Brreg-only rows are dormant or recently registered (per [`norskfolkehjelp-activities.md`](https://github.com/terchris/atlas/tree/main/docs/research/norskfolkehjelp-activities.md), one was registered 2024-11-07).

### B.5 Manual override file — **[Q6]**

For names that don't match (Brreg uses formal long-form, web uses short display), a small JSON file in the source folder:

```jsonc
// atlas-data/ingest/src/sources/folkehjelp-chapters/overrides.json
{
  "brreg_to_slug": {
    "871234567": "asker-og-baerum",       // Brreg orgnr → web slug
    "871234568": null                     // explicitly Brreg-only (no web page)
  },
  "slug_to_kommune_nr": {
    "asker-og-baerum": null,              // multi-kommune; chapter_kommune_coverage holds the list
    "solidaritetsungdom-bergen": "4601",  // non-place slug; assigned manually
    "svalbard": "2100",                   // Svalbard kommune code (not a real fylke)
    "sentralt": null                      // umbrella entity, no kommune
  },
  "slug_to_chapter_subtype": {
    "solidaritetsungdom-bergen": "youth-political",
    "studentgruppe-blindern":   "student",
    "sanitet-haukeland":        "hospital",
    "sentralt":                 "umbrella"
  }
}
```

The override file is committed (small, hand-curated). It's the escape hatch when the algorithmic match is wrong, the slug isn't a kommune name, or the chapter has a non-default `chapter_subtype` (vocabulary defined in [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](./INVESTIGATE-multi-ngo-supply-model-extensions.md#b2-initial-vocabulary)).

### B.6 Brreg-only rows — **[Q7]** what to do with the ~13 unmatched

For each Brreg row with no matching web slug:

- Insert a `dim_chapter` row with `is_active=false`, `source_url=NULL`, `chapter_orgnr` set.
- Activity rows: none.
- These show up in coverage queries as "registered but dormant" — useful signal for funders, not a Coverage-gap supply contributor.

This matches the "is_active inheritance" pattern from PLAN-002 (Red Cross): chapters that exist in the source register but have no public activity page are inactive.

### B.7 Coverage population for NF

Per [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](./INVESTIGATE-multi-ngo-supply-model-extensions.md#section-c--chapter_kommune_coverage-link-table), `chapter_kommune_coverage` rows for NF's 14 regional chapters get populated as `source='inferred'` from membership: union the `kommune_nr`s of each region's child lokallag. Implemented in `supply__folkehjelp_chapter_kommune_coverage.sql` as part of the scrape PLAN.

---

## Section C — Activity extraction

### C.1 The "Aktivitetsområder" section — selector

**Verified 2026-04-23** by fetching `https://folkehjelp.no/lokallag/asker-og-baerum` — the section uses semantic HTML with **no CSS classes**:

```html
<h3>Aktivitetsområder</h3>
<h4>Førstehjelp og redningstjeneste</h4>
<p>Som frivillig innen førstehjelp...</p>
<h4>Sanitetsungdom</h4>
<p>Sanitetsungdomsgruppene er...</p>
<!-- … -->
```

Parser walks siblings rather than querying a class:

```ts
const labels: string[] = [];
const heading = $('h3').filter((_, el) =>
  $(el).text().trim() === 'Aktivitetsområder'
).first();

if (heading.length === 0) {
  warn(`No 'Aktivitetsområder' heading found for ${slug}`);
} else {
  heading.nextUntil('h2, h3').filter('h4').each((_, el) => {
    labels.push($(el).text().trim());
  });
}
// labels: ['Førstehjelp og redningstjeneste', 'Sanitetsungdom', ...]
```

Empty section = `heading` exists but `labels.length === 0` → write zero activity rows per [Q8]. Missing heading altogether = WARN (template change signal).

### C.2 The 6 NF activity bins — fixed vocabulary

NF uses a closed set of 6 areas across all chapter pages:

1. Førstehjelp og redningstjeneste
2. Sanitetsungdom
3. Samfunnsarbeid
4. Flyktning og inkludering
5. Internasjonale spørsmål
6. Solidaritetsungdom

The staging model maps these verbatim. New labels appearing in scraped HTML are a WARN (template / vocabulary change) — see [scraping infra E.1](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#e1-per-page-failure-warn-and-continue--q10).

### C.3 Empty Aktivitetsområder section — **[Q8] Resolved**

4 of 46 sample pages had an empty section. Decision: **chapter is `is_active=true`**, just write zero rows in `raw.folkehjelp_chapter_activities` for that slug. The chapter exists, has a public page, and is registered — the absence of listed activities means "we don't have activity data" not "this chapter does nothing". Coverage-gap queries that filter by `service_category_code` will simply skip these chapters; queries that count chapters per kommune still include them.

### C.4 Mapping NF bins → `ref_atlas_service_category` — **[Q9]** three options

NF's 6 bins are coarser than Red Cross's 50 named activities. Each NF bin covers 1–N Atlas service categories. Three approaches considered:

#### Option A — 1:1, lossy ✓ recommended

Each NF bin maps to **one** dominant Atlas category. Lose visibility into the secondary categories an NF bin implicitly covers.

| NF bin | → service_category_code | What we lose |
|---|---|---|
| Førstehjelp og redningstjeneste | `rescue_corps` | first_aid_standby, first_aid_training (NF chapters do these but we don't surface them per-chapter) |
| Sanitetsungdom | `youth_activity_groups` | (none — direct match) |
| Samfunnsarbeid | `youth_drop_in` (closest) | crisis_shelter, elderly_visiting (umbrella term collapses several specifics) |
| Flyktning og inkludering | `language_practice` | migrant_mentoring, homework_help (folded into one bin) |
| Internasjonale spørsmål | `international_solidarity` (NEW row in `ref_atlas_service_category`) | — |
| Solidaritetsungdom | `youth_political_action` (NEW row in `ref_atlas_service_category`) | — |

**Pros**: clean cross-NGO sums (one fact row per bin; no double-counting). Honest about what the NGO actually publishes. Cleanest implementation.

**Cons**: chapters listed in "Førstehjelp og redningstjeneste" can't be retrieved by a `service_category_code='first_aid_training'` filter. We're representing the NGO's published shape, not the operational reality.

**Note**: Adding `international_solidarity` and `youth_political_action` to `ref_atlas_service_category` is itself a decision — these are NF-unique. Two new rows is justified by the threshold rule "category exists if 2+ NGOs offer it" only if Amnesty / Natur og Ungdom / Redd Barna also count. Keep the rows; document the threshold concession in the seed CSV's comment.

#### Option B — 1:N fan-out (rejected)

Each NF chapter listing "Førstehjelp og redningstjeneste" generates 3 fact rows (rescue_corps + first_aid_standby + first_aid_training).

**Pros**: more accurate to the chapter's operational scope.

**Cons**: inflates row counts (a 6-bin chapter generates 12+ fact rows). Cross-NGO counts become misleading: NF chapters look like they have 2× the supply they actually do. The chapter doesn't actually run all three sub-activities equally — we'd be inventing data.

#### Option C — "umbrella" categories (rejected)

Add a parallel umbrella code (`first_aid_general`) that covers rescue + standby + training. NF maps to umbrella; Red Cross maps to specifics.

**Pros**: NF gets a single mapping; Red Cross keeps detail.

**Cons**: cross-NGO joins become "first_aid_general OR rescue_corps OR first_aid_standby OR first_aid_training" — ugly. Vocabulary bloat. No clean meaning.

### C.5 Decision — **[Q10]** Option A

Map 1:1, accept the loss, document it. Surface the verbatim NF bin label as `dim_activity.canonical_name` so users browsing per-NGO see "Førstehjelp og redningstjeneste"; cross-NGO filters use `service_category_code='rescue_corps'` and pick up the chapter via the strongest signal. Add `international_solidarity` and `youth_political_action` to `ref_atlas_service_category`.

The mapping table goes in Appendix A.

---

## Section D — NF-specific raw schema

Generic conventions (column patterns, hashes, `raw.ingest_runs`, `raw.sitemap_log`) are in the [scraping infra](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#section-c--cache-and-change-detection); below is the NF-specific shape.

**Convention recap.** [Scraping infra §C.5](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#c5-mandatory-columns-for-scraper-raw-tables--q20) requires every **scraper-sourced parent-entity** raw table to carry: `url`, `record_hash`, `html_raw_hash` (audit-only, nullable), `is_active`, `loaded_at`. Of the three tables below:

- **`raw.folkehjelp_chapters`** is scraper-sourced + parent → carries the §C.5 column set.
- **`raw.folkehjelp_chapter_activities`** is a scraper-sourced **child** → does *not* carry §C.5 columns; deletes-and-reinserts when the parent's `record_hash` changes.
- **`raw.brreg_enheter`** (shared, shipped by PLAN-001-brreg-enheter) is **API-sourced** (Brreg JSON API, not HTML scrape) → §C.5 explicitly does *not* apply; follows existing `raw.<source>` conventions. Not NF-specific — every NGO's Brreg data lands here.

### D.1 `raw.folkehjelp_chapters` — scraper parent

```sql
-- migration NNN_raw_folkehjelp_chapters.sql (NNN allocated after the shared
-- raw.sitemap_log + raw.ingest_runs migrations from the infra PLAN)
CREATE SCHEMA IF NOT EXISTS raw;

CREATE TABLE raw.folkehjelp_chapters (
  -- Source-specific identity
  slug              TEXT PRIMARY KEY,             -- NF's stable kebab-cased identifier
  display_name      TEXT NOT NULL,
  fylke_group_name  TEXT NOT NULL,                -- from index page grouping (NF-defined region)
  brreg_orgnr       TEXT,                         -- nullable until Brreg match found

  -- §C.5 mandatory scraper columns
  url               TEXT NOT NULL UNIQUE,         -- public URL, joins to raw.sitemap_log.url verbatim
  record_hash       TEXT NOT NULL,                -- sha256 of canonical JSON of extracted record (skip signal)
  html_raw_hash     TEXT,                         -- sha256 of canonical HTML body (audit-only, nullable)
  is_active         BOOLEAN NOT NULL DEFAULT true,
  loaded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX folkehjelp_chapters_brreg_orgnr_idx
  ON raw.folkehjelp_chapters(brreg_orgnr) WHERE brreg_orgnr IS NOT NULL;
```

For Folkehjelp specifically, `url` always equals `'https://folkehjelp.no/lokallag/' || slug` — but it lives as its own column per §C.5 (the join key against `raw.sitemap_log` must be verbatim what the sitemap published, not reconstructed).

### D.2 `raw.folkehjelp_chapter_activities` — scraper child

Child of `raw.folkehjelp_chapters`. Per [§C.5 child-table rule](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#c5-mandatory-columns-for-scraper-raw-tables--q20), no mandatory columns — children are owned by the parent and delete-and-reinserted when the parent's `record_hash` changes.

```sql
CREATE TABLE raw.folkehjelp_chapter_activities (
  slug             TEXT NOT NULL REFERENCES raw.folkehjelp_chapters(slug) ON DELETE CASCADE,
  activity_label   TEXT NOT NULL,                 -- one of the 6 NF bins, verbatim, NFC-normalised
  display_order    INT NOT NULL,
  loaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (slug, activity_label)
);
```

`activity_label` must be UTF-8 NFC-normalised at the parser boundary per [scraping infra §C.3](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#c3-record-level-change-detection--q7--q18--q21) — cheerio sometimes returns Norwegian characters in NFD form, which would silently flip the parent's `record_hash` between runs.

### D.3 `raw.brreg_enheter` — API-sourced, cross-NGO shared

**Superseded shape landed 2026-04-24 via [PLAN-001-brreg-enheter](../completed/PLAN-001-brreg-enheter.md).** What this investigation originally proposed — an NF-specific `raw.brreg_folkehjelp_units` table — shipped instead as a shared cross-NGO `raw.brreg_enheter` table. Same API source (Brreg Enhetsregister via `data.brreg.no`); same JSON-API-not-scrape classification (§C.5 scraper column conventions don't apply); but one table serves every NGO, discriminated by `navn` prefix (`navn ILIKE 'Norsk Folkehjelp%'` for NF's rows).

Final shipped shape in [`atlas-data/migrations/025_raw_brreg_enheter.sql`](https://github.com/terchris/atlas/tree/main/atlas-data/migrations/025_raw_brreg_enheter.sql):

```sql
CREATE TABLE raw.brreg_enheter (
  orgnr                  TEXT PRIMARY KEY,
  navn                   TEXT NOT NULL,
  organisasjonsform      TEXT NOT NULL,           -- 'FLI' for NGO foreninger
  registrert_dato        DATE,
  i_frivillighetsreg     BOOLEAN NOT NULL DEFAULT false,
  antall_ansatte         INTEGER,
  konkurs                BOOLEAN NOT NULL DEFAULT false,
  under_avvikling        BOOLEAN NOT NULL DEFAULT false,
  under_tvangsavvikling  BOOLEAN NOT NULL DEFAULT false,  -- underTvangsavviklingEllerTvangsopplosning
  raw_payload            JSONB NOT NULL,          -- full Brreg Enhet entity
  loaded_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Three additions vs this investigation's original D.3: `konkurs`, `under_avvikling`, `under_tvangsavvikling`. They come verbatim from the Brreg Enhet response and replace any synthetic "is_active" we'd have had to build — Brreg owns the concept, we just carry the flags.

For PLAN-002 (Folkehjelp scrape): when joining raw chapters to Brreg, filter via `where navn ilike 'Norsk Folkehjelp%'` (or whichever prefix matches the NGO's `brreg_query.nameStartsWith` in `landscape.json`).

### D.4 Source-specific scraper config

Per [scraping infra §E.2](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#e2-discovery-failure-hard-fail--q11--q24), every source declares an absolute floor for the discovery URL count. NF's index has ~108 chapters today; the floor is set at ~50 (roughly half), tuned upward when the source consistently exceeds 100.

```ts
// ingest/src/sources/folkehjelp-chapters/index.ts
const MIN_DISCOVERED_URLS = 50;
```

### D.5 Golden-file test fixtures

Per [scraping infra §G.3](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#g3-per-source-tests), `parse.ts` is tested via golden-file fixtures. Target 2–3 fixtures spanning the page variants seen in the wild:

```
ingest/src/sources/folkehjelp-chapters/__tests__/
├── parse.test.ts
└── fixtures/
    ├── asker-og-baerum.html             — typical chapter, all 6 activity bins listed
    ├── asker-og-baerum.expected.json
    ├── alta.html                         — empty Aktivitetsområder section (per [Q8])
    ├── alta.expected.json
    ├── solidaritetsungdom-bergen.html    — non-geographic chapter
    └── solidaritetsungdom-bergen.expected.json
```

Each test reads the fixture HTML, calls `parse(html, url)`, deep-equals against the expected JSON. Template changes that legitimately alter the record shape update the HTML and the JSON together in the same commit.

---

## Decisions resolved during planning

1. ~~**[Q1]**~~ `robots.txt` verification — **Resolved 2026-04-23**: allows `/lokallag/*`. Full disallow list documented in A.2.
2. ~~**[Q3]**~~ Scrape both Brreg + folkehjelp.no, match on normalised name. **Resolved 2026-04-23**.
3. ~~**[Q7]**~~ ~13 Brreg-only rows → `dim_chapter` with `is_active=false`. **Resolved 2026-04-23**.
4. ~~**[Q8]**~~ Empty Aktivitetsområder → `is_active=true`, zero activity rows. **Resolved 2026-04-23**.
5. ~~**[Q9]/[Q10]**~~ Activity mapping: Option A (1:1, lossy). Add `international_solidarity` + `youth_political_action` to `ref_atlas_service_category`. **Resolved 2026-04-23**.

---

## Open Questions

1. **[Q2]** Outreach to NF asking for a read-only Public GraphQL schema (see A.4). Email proposed; track response. Scrape PLAN ships regardless; positive response would replace the parser with a thinner GraphQL client.
2. ~~**[Q4]**~~ `brreg-folkehjelp-units` (NF-specific) vs parameterised. **Resolved 2026-04-24 during PLAN-001-brreg-enheter implementation: generic from day one.** See §B.2 above.
3. **[Q5]** Levenshtein threshold for fuzzy name match (proposed: ≤ 2). Tune against actual data during PLAN.
4. **[Q6]** Initial contents of the override file. Discoverable only by running the algorithmic match against real data.
5. **[Q11]** Scrape cadence — manual / weekly / monthly? Recommendation: **manual via npm script for v1**. NF chapter changes are slow (founding dates suggest ~1–2 new chapters/year); weekly is overkill. Add a CronCreate-based schedule when Atlas has a job-runner.

---

## Next Steps

**Pre-PLAN — outreach to NF (parallel, non-blocking)**:
- [ ] Send email to NF asking whether they would enable a read-only Public GraphQL schema for `localBranch` / `localBranchSites` / activity entry types. See A.4 for rationale. Track response; if positive, the scrape PLAN may be replaced by a thinner GraphQL-client PLAN.

**Prerequisites** (other investigations' PLANs that must ship first):
- [ ] PLAN-001 from [`INVESTIGATE-ngo-scraping-infrastructure.md`](../completed/INVESTIGATE-ngo-scraping-infrastructure.md) — Crawlee toolkit + `raw.ingest_runs` + per-source folder convention.
- [ ] PLAN-001 from [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](./INVESTIGATE-multi-ngo-supply-model-extensions.md) — `dim_chapter.source_url`, `dim_chapter.chapter_subtype`, `chapter_kommune_coverage` table, plus Red Cross retro backfill.

**Folkehjelp-specific PLANs**:

- [x] **[PLAN-001-brreg-enheter.md](../completed/PLAN-001-brreg-enheter.md)** — **shipped 2026-04-24**. Generic cross-NGO Brreg ingest (shared `raw.brreg_enheter` table, `refresh:brreg-enheter` script, per-NGO query config in `landscape.json`). Folkehjelp row: 122 enheter, 108 in Frivillighetsregisteret. Scope pulled forward from the originally-proposed NF-specific "brreg-folkehjelp-units" to cross-NGO from day one (see §B.2 + [Q4]).
- [ ] **PLAN-002-folkehjelp-scrape-and-ingest.md** (~7–10h)
  - Migration `NNN_raw_folkehjelp_chapters.sql` + `raw.folkehjelp_chapter_activities` carrying the §C.5 mandatory columns on the parent (D.1) and child shape from D.2.
  - Scraper at `ingest/src/sources/folkehjelp-chapters/` following the [per-source folder convention](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#b3-per-source-folder-convention): `index.ts`, `discover.ts`, `parse.ts`, `overrides.json`, `types.ts`, `README.md`, `__tests__/`.
  - `parse.ts` is a pure function `(html, url) → Record` with NFC normalisation on every string field ([scraping infra §C.3](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#c3-record-level-change-detection--q7--q18--q21)).
  - `discover.ts` calls the shared `sitemap_log` reader/writer; no per-source orphan logic.
  - `index.ts` calls the shared `ua`, `record_hash`, `ingest_runs` (with concurrent-run lock per [§E.3.1](../completed/INVESTIGATE-ngo-scraping-infrastructure.md#e31-concurrent-run-protection--q22)), and `upsertRecord()` helpers from `ingest/src/lib/scraping/`.
  - `MIN_DISCOVERED_URLS = 50` in `index.ts` (per D.4).
  - 2–3 golden-file test fixtures under `__tests__/fixtures/` covering: typical chapter, empty-activities chapter, non-geographic chapter (per D.5).
  - dbt staging: `supply__folkehjelp_chapters.sql`, `supply__folkehjelp_chapter_activities.sql`, `supply__folkehjelp_chapter_kommune_coverage.sql`.
  - UNION ALL into `dim_chapter`, `dim_activity`, `fact_chapter_activities`, `chapter_kommune_coverage`.
  - Two new `ref_atlas_service_category` seed rows (`international_solidarity`, `youth_political_action`).
  - End-of-run validation: `raw.ingest_runs` row written; `mart_ingest_health` shows the source as `ok`; row counts match expected chapter total; dbt test pass.

Each PLAN ends with `dbt run && dbt test` per the always-run-tests rule in [`project-atlas.md`](../../project-atlas.md).

---

## Files this investigation will produce

**Reused from earlier work:**
- `dim_ngo` — Folkehjelp row already seeded.
- `ref_atlas_service_category` — extended by 2 rows (`international_solidarity`, `youth_political_action`).
- `dim_chapter`, `dim_activity`, `fact_chapter_activities`, `chapter_kommune_coverage` — UNION ALL adds the Folkehjelp source.
- `dim_kommune`, `dim_postnummer`, `crosswalk_kommune_name` — used during slug → kommune resolution.

**Inherited from companion infrastructure (no new work in Folkehjelp PLANs):**
- `raw.sitemap_log` (shared, populated by Folkehjelp's `discover.ts` via shared lib)
- `raw.ingest_runs` (shared, populated by Folkehjelp's `index.ts` via shared lib)
- `mart_ingest_health` (shared)

**New scraper-sourced tables (carry §C.5 mandatory columns where applicable):**
- `raw.folkehjelp_chapters` — parent, full §C.5 column set (PLAN-002)
- `raw.folkehjelp_chapter_activities` — child, no §C.5 columns (PLAN-002)

**Shared cross-NGO API-sourced tables (§C.5 not applicable):**
- `raw.brreg_enheter` — shipped by [PLAN-001-brreg-enheter](../completed/PLAN-001-brreg-enheter.md); Folkehjelp rows filter via `navn ILIKE 'Norsk Folkehjelp%'`.

**New dbt models:**
- `marts.supply__folkehjelp_chapters`, `marts.supply__folkehjelp_chapter_activities`, `marts.supply__folkehjelp_chapter_kommune_coverage` (PLAN-002)

**New ingest folders:**
- `atlas-data/ingest/src/sources/folkehjelp-chapters/` — PLAN-002; new scraper with `__tests__/fixtures/`.
- ~~`atlas-data/ingest/src/seed-sources/brreg-folkehjelp-units/`~~ — **not created**; PLAN-001 shipped the generic `src/seed-sources/brreg-enheter/` instead, driven by `landscape.json`.

---

## Appendix A — NF activity → `ref_atlas_service_category` mapping (Option A, 1:1)

| NF bin (verbatim) | `service_category_code` | `dim_activity.canonical_name` | Notes |
|---|---|---|---|
| Førstehjelp og redningstjeneste | `rescue_corps` | `Førstehjelp og redningstjeneste` | Most distinctive of the 3 it covers (rescue + standby + training). |
| Sanitetsungdom | `youth_activity_groups` | `Sanitetsungdom` | Direct match with Red Cross RØFF. |
| Samfunnsarbeid | `youth_drop_in` | `Samfunnsarbeid` | Closest single match for the umbrella; lossy. |
| Flyktning og inkludering | `language_practice` | `Flyktning og inkludering` | Strongest signal (språkkafé is the most common sub-activity per research). |
| Internasjonale spørsmål | `international_solidarity` | `Internasjonale spørsmål` | NEW row in `ref_atlas_service_category` (PLAN-002). |
| Solidaritetsungdom | `youth_political_action` | `Solidaritetsungdom` | NEW row in `ref_atlas_service_category` (PLAN-002). |

Each chapter gets one `fact_chapter_activities` row per listed NF bin. `dim_activity` has 6 NF rows (one per bin), each with `ngo_orgnr=871033552`.

---

## Appendix B — Verified chapter-page HTML structure

Verified 2026-04-23 by fetching `https://folkehjelp.no/lokallag/asker-og-baerum`. The Aktivitetsområder section uses **semantic HTML with no CSS classes**:

```html
<h3>Aktivitetsområder</h3>

<h4>Førstehjelp og redningstjeneste</h4>
<p>Som frivillig innen førstehjelp og redningstjeneste...</p>

<h4>Sanitetsungdom</h4>
<p>Sanitetsungdomsgruppene er...</p>

<!-- repeats for each of the 0–6 activity bins listed -->
```

Implication: the parser cannot rely on a wrapping `<section class="…">` selector. Instead, find the `<h3>` whose text equals "Aktivitetsområder" and walk forward through siblings (`<h4>` items) until the next `<h2>` or `<h3>` or end-of-document. See C.1 for the cheerio implementation.

If a future Craft template change wraps the section in a class, the parser still works — but a follow-up should add a class-based selector path that's more robust to non-Aktivitetsområder `<h3>` insertions.
