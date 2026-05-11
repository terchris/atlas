# Investigate: NGO scraping infrastructure

> **IMPLEMENTATION RULES:** Before implementing any plan from this investigation, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog

**Goal**: Define the shared toolkit for scraping public NGO websites where no API is available — tool choice, cache layout, change detection, ethical defaults, observability — so that each per-NGO scrape investigation can focus on the NGO-specific source surface (URLs, HTML structure, identity matching) instead of re-litigating infrastructure.

**Last Updated**: 2026-04-24

---

## Scope

**In scope:**
- The "ask before scrape" doctrine — what to check before committing to scraping (native APIs, sitemaps, robots.txt)
- Tool selection (Crawlee + CheerioCrawler)
- Two-stage pipeline pattern (scrape → cache → parse → DB)
- Per-source folder convention under `ingest/src/sources/`
- Cache layout and `.gitignore` policy
- Two-layer change detection (sitemap `lastmod` + `record_hash`), plus `html_raw_hash` as audit-only
- Ethical-scraping defaults (UA naming, rate limits, robots.txt verification)
- Failure-mode policy (per-page warn vs hard-fail)
- End-of-run observability (`raw.ingest_runs`)
- Generic raw schema column conventions

**Out of scope (per-NGO investigations own these):**
- Actual URLs, sitemap structure, HTML selectors, Brreg matching for any specific NGO
- Activity → service_category mapping (each NGO has its own taxonomy)
- Multi-NGO data-model extensions — see [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](../backlog/INVESTIGATE-multi-ngo-supply-model-extensions.md)
- Sub-activity / events / minisites — see [`INVESTIGATE-ngo-events-and-minisites.md`](../backlog/INVESTIGATE-ngo-events-and-minisites.md)

---

## Why this exists

Atlas needs supply data for ~10 Tier A NGOs (Red Cross, Folkehjelp, N.K.S., Frelsesarmeen, Kirkens Bymisjon, Mental Helse, Diabetesforbundet, Nasjonalforeningen, Blindeforbundet, LHL — see [`ngo-landscape.md`](https://github.com/terchris/atlas/tree/main/docs/research/ngo-landscape.md)). Of these, **only Red Cross has a usable API** (`api.redcross.no`, key required). The other nine all require some combination of HTML scraping, Brreg lookup, and possibly per-NGO outreach for direct data access.

### Target scale: ~15 NGOs maximum

Atlas caps scraped supply at **10 Tier A NGOs + up to 5 additional**, not 50+, not comprehensive coverage of every registered NGO in Norway. This is a deliberate scope decision (see [Q16]).

At N≈15, per-site scrapers are the right unit of work: ~15 engineer-days of authoring, ~1 template break per site per quarter, ~200 unique activity labels total across the fleet. All of that is tractable with the Crawlee + CheerioCrawler + per-source folder architecture this investigation proposes.

The architecture this investigation produces is therefore **intentionally not designed to scale past ~15 sources**. The following approaches are explicitly ruled out at this N and should be revisited only if scope expands materially:

- **LLM-based extraction at runtime** (Firecrawl `extract`, ScrapeGraphAI, LLM Scraper, etc.) — cost and non-determinism aren't justified when 15 stable CheerioCrawlers do the job.
- **LLM fallback on parse-failure** — at ~5 breakage interrupts/year across the fleet, manual selector fixes are cheaper than the infrastructure to auto-recover.
- **CMS-cluster scrapers** (one WordPress scraper covering N NGO WordPress sites) — a valid N≥50 optimization, premature at 15.
- **Brreg-only fallback for a "long tail"** — there is no long tail to cover.
- **Central `ref_activity_label_mapping` table** — per-NGO CASE statements in dbt staging (as this plan specifies) are sufficient for ~200 labels; promote to a shared table only if cross-NGO reconciliation pain emerges.

LLM involvement at this scale, if any, stays at **authoring time** (drafting selectors from sample pages when bootstrapping a new source), not in the runtime path. No shared tooling is needed for this — it's a paste-HTML-into-a-conversation technique, not a product feature.

If Atlas scope later expands to 50+ NGOs, this investigation's conclusions do not carry forward and a new infrastructure investigation is required.

Without a shared infrastructure investigation:

- Every per-NGO investigation re-debates Crawlee vs Playwright, cache layout, hash-based change detection, etc.
- Per-NGO scrapers diverge on UA strings, rate limits, error handling — no consistency for ops.
- We lose the ability to reason about scraping load across all sources at once (e.g., "are we hitting any single domain too hard?").

This investigation produces one PLAN that ships the shared toolkit. After that, per-NGO investigations cite the convention and only document their NGO-specific source surface.

---

## Section A — Source-discovery doctrine: ask before scrape

Before writing any scraper, walk this checklist for the NGO's website.

### A.1 Check for a native data API — **[Q1]**

NGO websites are usually built on one of a small set of CMSes; many of these have built-in APIs that the operator may have enabled.

| CMS / framework | Telltale | Default API endpoint |
|---|---|---|
| **Craft CMS** | `Disallow: /cpresources/` in robots.txt; `?p=admin` admin URL | GraphQL at `/actions/graphql/api` (and often aliased to `/api`) |
| **WordPress** | `/wp-content/`, `/wp-json/` paths | REST API at `/wp-json/wp/v2/{posts,pages,...}` |
| **Drupal** | `Disallow: /core/`, `/sites/default/files/` | JSON:API at `/jsonapi/` (Drupal 8+) |
| **Next.js** | `_next/` asset paths | None standard, but check for `/api/*` route handlers |
| **Statamic** | `/cp/` admin | GraphQL at `/graphql` (when enabled) |
| **Custom / static** | None of the above | None |

For each candidate, **probe**: `curl -i <endpoint>`. A 404 means not enabled (or routed elsewhere); a 200 with JSON / HTML playground UI means the API exists. If exposed, **always** prefer querying the API to scraping HTML — typed, change-resistant, often ships per-field metadata we'd otherwise have to infer.

### A.2 Check for a sitemap

Even when the CMS doesn't expose a query API, it usually exposes a sitemap. `robots.txt` declares them:

```
Sitemap: https://example.no/sitemap.xml
```

A sitemap is a much better discovery surface than scraping the navigation HTML:

- Structured XML, stable schema across CMSes
- `<lastmod>` per URL → free change detection at the discovery layer
- Doesn't break when the CMS template changes
- Often segmented by entry type (`localBranch`, `news`, `events`) so you can target what you need

**Convention**: prefer sitemap-driven discovery over HTML-index parsing whenever a sitemap exists.

### A.3 `robots.txt` verification — mandatory pre-scrape step

Every per-NGO scraper's first phase is to fetch and inspect `robots.txt`:

```bash
curl https://<host>/robots.txt
```

Document in the per-NGO investigation:
- Disallow rules that affect the URLs we want to scrape
- Bot-specific `Crawl-Delay` rules (we set our default rate; if a stricter rule applies to our UA, honour it)
- `Sitemap:` declarations (feeds A.2)

If `robots.txt` disallows the URLs we need, the scrape **does not run**. We escalate to outreach (A.4) instead.

### A.4 Outreach: when to ask the NGO directly — **[Q2]**

If the NGO's CMS has a query API (A.1) but it's not publicly exposed, **send an email** before committing to scraping:

> Hi, we're building Atlas — a public-good explorer for NGO supply across Norwegian kommuner. Your website runs on {CMS}, which has a built-in {GraphQL/REST} API. Would you consider enabling a read-only Public Schema scoped to your `{localBranch / activity / contact}` entry types? It's ~30 minutes of config on your side and would let us avoid scraping HTML, which is fragile both for us (template changes break us) and for you (any extra load).

Cost to ask: an email. Cost to scrape: 8–10h of engineering + ongoing template-drift maintenance. The email is always worth sending first.

**Decision rule**: outreach is **non-blocking**. The per-NGO scrape PLAN ships regardless of response. If the NGO later enables the API, it becomes a separate refactor PLAN — `raw.<source>_*` schema is independent of the source mechanism.

---

## Section B — Tool selection

### B.1 Crawlee + CheerioCrawler — **[Q3]**

| Tool | Fit | Notes |
|---|---|---|
| **Cheerio alone** | works | Manual fetch + manual queue/retry/dedup. Reinventing wheels. |
| **Crawlee + CheerioCrawler** ✓ | **chosen** | TS-first orchestration framework. Built-in: request queue, dedup, rate-limit, retry, sitemap parser, persistent storage. Open-source (Apify), actively maintained. Falls back to `PlaywrightCrawler` per-source if a future NGO needs JS rendering. |
| **Playwright alone** | overkill | Full browser. Heavy. Slow. Use only when JS is required to render content. |
| **Firecrawl / jina.ai Reader** | unnecessary | AI-flavoured services that return clean markdown. Adds external dependency / cost; no benefit for fixed CMS templates. |

Adds one dependency to `atlas-data/ingest/package.json` (`crawlee`). Used by every NGO scrape from Folkehjelp onward.

### B.2 Two-stage pipeline — **[Q4]** scrape (cache) → ingest (parse + DB)

Separate the fetch from the parse so re-parses don't refetch:

```
Stage 1 — scrape:
  - Reads sitemap (or HTML index) → enqueues URLs
  - Fetches each URL → writes HTML body to Crawlee KeyValueStore
  - Idempotent: re-runs hit cache unless --force-refresh
  - Output: ${CRAWLEE_STORAGE_DIR}/key_value_stores/<source>/<key>.html (path resolution per §C.1)

Stage 2 — ingest:
  - Reads cached HTML files
  - Parses with cheerio into typed records
  - Computes record_hash (skip signal, §C.3) and html_raw_hash (audit-only, §C.3.1)
  - Upserts to raw.<source>_* when record_hash differs from stored
```

For most v1 sources, Stage 1 + Stage 2 run as a single npm script (`npm run ingest:<source>`). The on-disk cache means subsequent runs skip unchanged pages and we can re-parse without refetching during development.

### B.3 Per-source folder convention

Every scrape source follows the same structure under `atlas-data/ingest/src/sources/<source-slug>/`:

```
sources/<slug>/
├── README.md          — what this source is, refresh cadence, owner contact
├── index.ts           — entrypoint: orchestrates discover → scrape → parse → upsert
├── discover.ts        — sitemap fetch + URL enumeration
├── parse.ts           — HTML → typed records (cheerio)
├── overrides.json     — manual overrides (slug → kommune, name → orgnr, etc.)
├── types.ts           — TS types for the source's records
└── __tests__/         — golden-file tests (§G.3)
```

**File responsibilities — [Q25].** Consistency across sources matters for ops, so this split is a convention, not a suggestion:

- **`parse.ts`** is a **pure function**: `(html: string, url: string) → Record`. No I/O, no DB, no HTTP. Owns NFC normalization (§C.3) and the shape of the record object. Trivially testable via golden-file fixtures (§G.3).
- **`discover.ts`** reads sitemap(s) or HTML index; reads prior `raw.sitemap_log` state for this `source_slug`; produces the skip-vs-fetch decision list; upserts new sitemap_log state and flags orphans (§C.2). HTTP + DB I/O lives here.
- **`index.ts`** is the top-level orchestrator. Writes the `raw.ingest_runs` start row with `finished_at = NULL` (and aborts if another in-progress row exists — §E.3.1). Creates the Crawlee crawler. Drives discover → Crawlee fetch loop → `parse.ts` → upsert. Calls a shared `upsertRecord()` helper from `ingest/src/lib/scraping/` (generic across sources per §C.5). Writes the `raw.ingest_runs` completion row at end.
- **`overrides.json`** holds source-specific name-to-orgnr or slug-to-kommune overrides; loaded by `parse.ts` or by the upsert stage depending on where the override applies.
- **`types.ts`** holds TypeScript type definitions for the source's record shape. Imported by `parse.ts`, `index.ts`, and `__tests__/`.

The npm script naming follows the existing convention: `npm run ingest:<slug>`. Migrations live under `atlas-data/migrations/` with a three-digit sequence prefix:

- **Per-source tables** use the source slug: `NNN_raw_<source_slug>.sql` (e.g., `NNN_raw_folkehjelp_chapters.sql`).
- **Shared infrastructure tables** use the table name: `NNN_raw_ingest_runs.sql`, `NNN_raw_sitemap_log.sql`.

The numbering is repository-wide sequential (see existing `002_raw_ssb_08764.sql` through `021_raw_fhi_vgs_gjennomforing.sql` for the pattern).

---

## Section C — Cache and change detection

### C.1 Cache storage: `CRAWLEE_STORAGE_DIR` — **[Q5] / [Q17]**

Crawlee's `KeyValueStore` writes under the path in `CRAWLEE_STORAGE_DIR`. That one env var is the only knob the ingest code needs; dev and prod just point it at different locations.

**Dev (laptop / devcontainer):**
- `CRAWLEE_STORAGE_DIR=atlas-data/ingest/.crawlee-cache/` — repo-local, gitignored.
- Survives across runs, so re-parses don't refetch while iterating on selectors.
- `.gitignore` entry (added once in `atlas-data/ingest/.gitignore`):
  ```
  .crawlee-cache/
  ```

**Prod (Kubernetes pod on UIS):**
- `CRAWLEE_STORAGE_DIR=/tmp/crawlee-cache/` — ephemeral, scoped to the pod's lifetime.
- Alternatively, an explicit `emptyDir` volume mounted at `/cache`.
- Cache vanishes when the pod exits. Next scheduled run refetches from origin. At ~100 pages × 1 req/sec × ~15 sources = ~25 min of total network time per weekly refresh across the fleet, which is acceptable.

**Both environments** use the same per-source layout:
- `${CRAWLEE_STORAGE_DIR}/key_value_stores/<source>/`
- One file per URL: `<key>.html` (body) + `<key>.metadata.json` (URL, fetched-at, status, etag, content-type)

### C.1.1 Why ephemeral is safe in production

Change detection does not read the cached HTML body. It reads two values that already live in Postgres:

- **Sitemap `lastmod`** per URL, stored in the shared `raw.sitemap_log` table (§C.2).
- **`record_hash`** column on each `raw.<source>_*` row (§C.3).

The cache is strictly a **within-run** optimization — resume after a mid-run crash; re-parse without refetch during dev iteration. Nothing in production skip-logic depends on a cached body surviving across pod restarts.

### C.1.2 Upgrade path if cross-run body persistence becomes required

Triggers that would justify persistent storage for the HTML body itself:

- **Audit / template-drift forensics** — "what did this page look like on 2026-03-01?"
- **Stage-split** — running discover/scrape and parse as separate containers (e.g. Dagster ops) so the handoff between them needs durable storage.

The upgrade is a **Postgres table** (`raw.html_archive` keyed by `source_slug + url + fetched_at`, storing `html_body BYTEA` + `html_raw_hash`), not a PVC and not a new object-storage service:

- UIS already provides Postgres; it does not currently provide object storage.
- PVCs add ReadWriteOnce scheduling constraints that make parallelizing sources across pods awkward, without buying anything Postgres wouldn't give us.
- Volume is small — with hash-dedup inserts (only write when the hash actually changes), realistically sub-GB/year across the fleet.

Out of scope for v1.

### C.2 Sitemap-level change detection — **[Q6] / [Q19]**

The sitemap's `<lastmod>` per URL is the cheapest change signal. State is persisted in a **shared** `raw.sitemap_log` table (one table across all sources, not per-source):

```sql
-- migration NNN_raw_sitemap_log.sql
CREATE TABLE raw.sitemap_log (
  source_slug    TEXT        NOT NULL,
  url            TEXT        NOT NULL,
  lastmod        TIMESTAMPTZ,                       -- sitemap's <lastmod>; NULL if absent
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_slug, url)
);
```

On each discover run:

1. Read the current sitemap → `{url → lastmod_now}`. `lastmod_now` may be NULL if the sitemap entry omits `<lastmod>`.
2. **Read prior state** from `raw.sitemap_log` into a local map `{url → (stored_lastmod, last_seen_at)}` for this `source_slug`. This read must happen before any writes in this run — otherwise step 3 would compare against values we just overwrote.
3. **Fetch-skip decision** per URL. Skip only when **all** of these hold:
   - URL was seen before (has a row in `raw.sitemap_log` with a non-NULL `stored_lastmod`).
   - `lastmod_now` is non-NULL (NULL is never a trustworthy skip signal — sitemap entry stopped advertising its freshness).
   - `lastmod_now <= stored_lastmod` (unchanged or older).
   - A corresponding `raw.<source>_*` row exists for this URL (previous attempt succeeded).

   Otherwise fetch. First-run URLs have no prior log row → always fetch. URLs with NULL `lastmod` on either side → always fetch. URLs where the previous parse attempt failed (no raw row) → always fetch.

4. **Upsert into `raw.sitemap_log`** — now that step 3's decisions are locked in, write the current `lastmod` and `last_seen_at = now()` for each discovered URL; insert new URLs.
5. **Orphan detection**: any row in `raw.sitemap_log` for this `source_slug` whose `last_seen_at` is older than this run's `started_at` is an orphaned URL — the page was removed from the sitemap. See §E.1 for how orphans propagate to `is_active=false`.

Why one shared table, not per-source:

- Matches the pattern of `raw.ingest_runs` (one table, `source_slug` column).
- Enables cross-source queries ("how many URLs orphaned this week across the fleet?").
- One fewer migration per new source.

**Raw-table join convention.** Orphan detection and fetch-skip both assume every `raw.<source>_*` table has a `url TEXT NOT NULL` column matching the sitemap URL verbatim (no normalization). That is the join key against `raw.sitemap_log.url`. Per-source migrations must include this column and declare it in their schema. URL normalization (http→https, trailing slashes, query-string stripping) is explicitly *not* applied — if the sitemap changes the URL, the old row orphans and the new URL is treated as a new entry, which is the correct audit behavior.

**First-run behavior.** On first ingest of a new source, `raw.sitemap_log` has no prior rows for that `source_slug`, so orphan detection yields zero orphans and fetch-skip yields zero skips — every discovered URL is fetched. This is correct; no special-casing needed.

**Multi-sitemap sources.** A source with multiple sitemaps (e.g., `sitemap-news.xml` + `sitemap-events.xml` feeding the same scraper) unions them in `discover.ts` before upserting to `raw.sitemap_log`. `source_slug` is the scraper identity, not the sitemap identity.

**Sources without a sitemap.** §A.2 permits HTML-index discovery as a fallback when no sitemap exists. In that case `discover.ts` still writes one `raw.sitemap_log` row per discovered URL, just with `lastmod = NULL`. The NULL handling in step 3 ensures these URLs always fetch (no freshness signal = no trustworthy skip), and orphan detection still works (URLs that drop off the HTML-index discovery become orphans on the next run). Semantically `raw.sitemap_log` is a per-source URL discovery log regardless of the discovery mechanism; the table name reflects the dominant case, not a restriction.

### C.3 Record-level change detection — **[Q7] / [Q18] / [Q21]**

After the parser has produced the typed record (chapter + its activities, or whatever the source's unit of work is), compute:

```
record_hash = sha256( canonical_json( extracted_record ) )
```

Store `record_hash` as a column on the `raw.<source>_*` row (TEXT, 64 hex chars). `parse.ts` owns building the record; `ingest/src/lib/scraping/record_hash.ts` does the serialization and hashing.

**Canonical JSON via [`fast-json-stable-stringify`](https://www.npmjs.com/package/fast-json-stable-stringify).** Sorts object keys deterministically, emits no whitespace, stable number/bool/null formatting. Hand-rolling a sort-keys serializer would be ~15 lines but we'd own the edge cases (nested objects, arrays, mixed types) forever; the package has ~2M weekly downloads and does exactly one thing.

**UTF-8 NFC normalization on all string values** before they enter the record object: `str.normalize('NFC')`. cheerio can return Norwegian characters in NFD composition form (e.g., `å` as `a + combining ring above`) depending on the source HTML; two visually-identical strings in different Unicode forms produce different bytes and thus different hashes. Normalize at the parser boundary, not at hash time, so the record is clean downstream as well.

**Skip logic.** If the new `record_hash` matches the stored one, skip the upsert entirely (including the delete-and-reinsert of child rows). If it differs, upsert — deleting and reinserting child rows like activities so removals propagate cleanly.

**Why hash the extracted record, not the HTML body.** Hashing the raw HTML misfires on cosmetic drift that is invisible to the data we actually care about — rendered "today's date" text, relative timestamps ("Oppdatert for 2 dager siden"), asset cache-busting query strings (`?v=20260424`), page-view counters, A/B-test variant markup. All of those flip `sha256(body)` every run while the chapter's real fields stay identical; the hash becomes useless as a skip signal and we pay a no-op upsert every run. Hashing after extraction avoids this by construction: the parser has already decided which fields are semantic, so the hash only changes when a semantic field changes.

### C.3.1 `html_raw_hash` as an audit-only column

We *also* store `html_raw_hash = sha256(html_body_canonical)` on the same `raw.<source>_*` row, but it plays **no role in skip logic**. It exists for template-drift forensics:

| Observed | Meaning | Action |
|---|---|---|
| `html_raw_hash` unchanged, `record_hash` unchanged | Nothing happened | Skip upsert (gated by `record_hash`) |
| `html_raw_hash` changed, `record_hash` changed | Real data change | Upsert |
| `html_raw_hash` changed, `record_hash` unchanged | Template reshuffled; selectors still extracted the same fields | INFO log; skip upsert. Surface in `mart_ingest_health` as a drift-warning signal — template churn often precedes a selector-breaking change |
| `html_raw_hash` unchanged, `record_hash` changed | Should be impossible — indicates parser nondeterminism | WARN; investigate |

Canonical body for `html_raw_hash` = strip `<head>`, strip per-render nonces and CSRF tokens, normalise whitespace. Exact normalisation rules go in the per-source `parse.ts`. Perfect canonicalization is not required here — this is an audit signal, not a skip signal, so occasional false positives just produce a few extra drift-warning log lines.

### C.4 Why two layers

`lastmod` is sometimes lazy in CMSes — Craft updates `lastmod` only when the entry's primary fields change, not when an asset reference inside a richtext field changes. So we keep both:

- **Sitemap layer** (`lastmod`) is cheap and skips the GET request entirely.
- **Record-hash layer** (`record_hash`) catches changes the sitemap missed and gates the DB upsert.

`html_raw_hash` is deliberately **not** a skip layer (see §C.3.1) — it lives on the row only as an audit artifact.

### C.5 Mandatory columns for scraper raw tables — **[Q20]**

**Scope.** This applies to raw tables produced by the scraping infrastructure defined in this investigation. Non-scraper raw tables — SSB API, FHI, Brreg, and other file- or API-sourced ingests — follow their own conventions per [`atlas-data/CONTRIBUTING.md`](https://github.com/terchris/atlas/tree/main/atlas-data/CONTRIBUTING.md) and are **not** subject to this column set.

Every scraper `raw.<source>_*` table representing a top-level scraped entity (chapter, branch, standalone activity record, etc.) must include the following columns. This consolidates the conventions introduced across §C and §E.1:

| Column | Type | Purpose |
|---|---|---|
| `url` | `TEXT NOT NULL` | Join key against `raw.sitemap_log.url` (§C.2). Stored verbatim, no normalization. |
| `record_hash` | `TEXT NOT NULL` | Skip signal — sha256 of canonical JSON of the extracted record (§C.3). 64 hex chars. |
| `html_raw_hash` | `TEXT` (nullable) | Audit-only hash for template-drift forensics (§C.3.1). Nullable because audit signals aren't load-bearing. |
| `is_active` | `BOOLEAN NOT NULL DEFAULT true` | Set `false` on fetch-time 404 or sitemap orphan (§E.1). Preserves history instead of deleting. |
| `loaded_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Ingest timestamp per project convention — see [`atlas-data/CONTRIBUTING.md`](https://github.com/terchris/atlas/tree/main/atlas-data/CONTRIBUTING.md). |

`url` must be **unique** within each scraper raw table — either declare `UNIQUE(url)` or use `url` as the primary key. The orphan-detection and fetch-skip joins against `raw.sitemap_log` (§C.2) require one-to-one URL correspondence; duplicate `url` values would make these queries ambiguous.

Per-source migrations add these alongside source-specific columns (chapter name, address, orgnr, activity labels, etc.). A dbt schema test on every scraper raw source should assert their presence.

Child tables (activities under a chapter, sub-locations under a branch) do **not** carry these columns — they're owned by the parent row, and children are delete-and-reinserted when the parent's `record_hash` changes (§C.3). Children carry only a FK to the parent's primary key plus their own data columns.

---

## Section D — Ethical-scraping defaults

### D.1 User-Agent string — **[Q8] / [Q13]**

Every Atlas scrape sets a custom UA of the form:

```
Atlas/0.1 (https://github.com/terchris/atlas; <contact-email>)
```

- Identifiable: site operators can grep their logs and find us.
- Contactable: they can reach out if our scrape causes problems.
- Versioned: bumps when scraping behaviour changes meaningfully.

**Assembled in `ingest/src/lib/scraping/ua.ts`.** The version string and repo URL are hard-coded constants in that module. The contact email is read from the environment variable:

```
ATLAS_SCRAPE_CONTACT_EMAIL=terje@helpers.no
```

Default project value: `terje@helpers.no`. Not hard-coded — operators running Atlas from a fork, in a staging environment, or under a team alias must be able to override it without editing source. Missing the env var at startup is a **hard failure**: the UA module throws before any network activity, since anonymous scraping breaches §D.1's ethical contract.

The env var goes alongside `CRAWLEE_STORAGE_DIR` (§C.1) and `CRAWLEE_LOG_LEVEL` in the ingest env — all three are consolidated in **§F Environment variables**.

### D.2 Rate limit policy — **[Q9]**

Default: **1 request per second**, serialised, per host.

For ~hundred-page sources (typical NGO size) this means 2–3 minutes per full crawl — fast enough to be done before a coffee, slow enough not to load the origin. Override per-source only when:

- The host's `robots.txt` declares a stricter `Crawl-Delay` for our UA → honour it.
- The host actively asks us to slow down (operator email, 429 patterns) → halve the rate, document in the source README.

### D.3 No PII / contact information

NGO chapter pages frequently list a kontaktperson with name, email, and phone. **We do not store this.** Atlas's marts contain organisations, not individuals. The parser extracts only:

- Chapter name, slug, URL, postal address, public phone (if attached to the org, not a person)
- Activity labels and counts
- Brreg-derived org metadata

If a future feature needs per-chapter contact info, it's a separate investigation with privacy review.

### D.4 Re-check `robots.txt` on every run

`robots.txt` can change. The discover stage of every scrape fetches `robots.txt` first and validates the URLs we're about to crawl against it. If a previously-allowed pattern is now disallowed, **hard fail** and require human review.

---

## Section E — Failure modes and observability

### E.1 Per-page failure: warn-and-continue — **[Q10]**

| Failure | Behaviour |
|---|---|
| Page URL returns 404 at fetch time | WARN with URL; mark the corresponding `raw.<source>_*` row `is_active=false`; preserve previous child rows |
| URL present in previous discovery but absent from current sitemap (orphan, §C.2) | INFO "orphan: URL X removed from sitemap"; mark corresponding `raw.<source>_*` row `is_active=false`; preserve previous child rows |
| Page URL returns 403 / 429 | Crawlee retries with backoff; final fail → WARN, skip page; previous raw row untouched |
| Required selector returns 0 elements | WARN "selector returned no matches for URL X — possible template change"; insert parent row with 0 child rows |
| Vocabulary drift (parsed label not in known set) | WARN "unmapped label `Y` for URL X — extend supply__<source>_*.sql CASE"; insert raw row anyway, dbt staging filters to known labels |
| `record_hash` unchanged from last run | INFO "skipping unchanged: URL X"; no DB write (see §C.3) |
| `html_raw_hash` changed but `record_hash` unchanged | INFO "template drift: URL X"; no DB write; drift surfaces in `mart_ingest_health` (see §C.3.1) |

### E.2 Discovery failure: hard fail — **[Q11] / [Q24]**

| Failure | Behaviour |
|---|---|
| Sitemap (or index page) returns non-200 | HARD FAIL; exit non-zero; no DB writes |
| Discovery returns fewer than `MIN_DISCOVERED_URLS` (absolute per-source floor) | HARD FAIL; error message includes the actual count and the configured floor |
| `robots.txt` disallows the URL pattern we need | HARD FAIL; include the disallow line in the error |

`MIN_DISCOVERED_URLS` is an **absolute integer floor** configured per source in `index.ts` — set it to roughly half the typical discovery count for that source. Relative thresholds ("<50% of last run") were considered and rejected ([Q24]): they require persisting state, they false-alarm on legitimate shrinkage (NGO closes chapters, mergers), and they don't catch any failure mode absolute floors miss. Absolute floors may need occasional re-tuning when a source grows significantly past 2× the floor — that's a boring, obvious maintenance task.

### E.3 End-of-run summary: `raw.ingest_runs` — **[Q12]**

Generic table populated by every per-source ingest at end-of-run:

```sql
-- migration NNN_raw_ingest_runs.sql
CREATE TABLE raw.ingest_runs (
  run_id          BIGSERIAL PRIMARY KEY,
  source_slug     TEXT NOT NULL,         -- 'folkehjelp-chapters', 'redcross-branches', etc.
  started_at      TIMESTAMPTZ NOT NULL,
  finished_at     TIMESTAMPTZ NOT NULL,
  exit_code       INT NOT NULL,          -- 0 on success
  rows_scraped    INT,                   -- pages actually fetched over the network (excludes sitemap-lastmod skips)
  rows_parsed     INT,                   -- pages successfully parsed (subset of rows_scraped)
  rows_skipped    INT,                   -- pages skipped by sitemap-lastmod (§C.2); record_hash skips are upsert-level and not counted here in v1
  warnings_count  INT NOT NULL DEFAULT 0,
  errors_count    INT NOT NULL DEFAULT 0,
  notes           TEXT                   -- free-form summary
);
```

Each ingest writes one row at end of run. dbt has a small `mart_ingest_health` view on top of `raw.ingest_runs`. Per [Q14], v1 is deliberately minimal — three columns only:

```sql
-- mart_ingest_health.sql
select distinct on (source_slug)
  source_slug,
  finished_at  as last_run_at,
  case when exit_code = 0 then 'ok' else 'fail' end as last_status
from raw.ingest_runs
order by source_slug, finished_at desc;
```

Additional columns (failure counts, template-drift counters from §C.3.1, 30-day trend, warning totals) are added on demand when a real operational consumer — dashboard, alert, CI gate — asks for them.

Final stdout line mirrors the row:

```
Ingest complete: source=folkehjelp-chapters, scraped=121, parsed=121, skipped=0, warnings=2, errors=0, duration=124s
```

### E.3.1 Concurrent-run protection — **[Q22]**

`raw.ingest_runs` doubles as an application-layer lock. The writer's contract:

1. **At run start:** `INSERT` a row with `started_at = now()`, `finished_at = NULL`, `exit_code = NULL`.
2. **Before inserting**, check for conflicts: `SELECT run_id, started_at FROM raw.ingest_runs WHERE source_slug = ? AND finished_at IS NULL`. If any row matches, abort with a clear error (`"Source <slug> is already being ingested by run_id=<n> (started <ts>); aborting."`) — the new run exits non-zero and never touches any other table.
3. **At run end (success or failure):** `UPDATE` the row with `finished_at = now()` and `exit_code`.

This handles cron-triggered runs colliding with manual `npm run ingest:<slug>` invocations, and long-running scheduled runs overrunning their next slot. Crawlee's KeyValueStore isn't multi-writer safe and raw upserts would race without this guard.

**Orchestrator-layer upgrade path.** When Dagster comes online as the orchestrator, its `QueuedRunCoordinator` with `tag_concurrency_limits` (tagging each run with `{source: <slug>}`) becomes the primary guard for Dagster-triggered runs — rejection happens before a pod is even scheduled. The app-layer lock above does **not** retire; it remains the backstop for manual CLI invocations (dev iteration, ad-hoc debugging) that don't flow through Dagster.

**Stale-lock recovery.** If a pod is killed mid-run (OOM, node eviction, `kubectl delete`), its `ingest_runs` row stays with `finished_at = NULL` forever, blocking every subsequent run for that source. Recovery is manual:

```sql
UPDATE raw.ingest_runs
   SET finished_at = now(),
       exit_code   = -1,
       notes       = 'manual recovery: pod killed'
 WHERE run_id = <id>;
```

If stale locks turn out to happen often, add a background sweeper ("any in-progress row older than 2h is stale, mark it exit_code=-1"). Defer until observed.

### E.4 No silent failures

Any condition that would otherwise be silent is upgraded to a log line with structured context — WARN when something is wrong or suspicious, INFO when it's expected-but-worth-seeing (orphans, template drift, cache skips). Examples: "sitemap entry X has no lastmod" (WARN); "raw row insert returned 0 rows changed" (WARN); "fuzzy name match used distance 2 for X→Y" (WARN); "template drift detected on URL X" (INFO, §C.3.1); "orphan URL removed from sitemap" (INFO, §E.1).

---

## Section F — Environment variables

The ingest job reads three environment variables. All three are documented here, in the K8s manifest for the ingest job, and in `atlas-data/ingest/README.md`.

| Variable | Purpose | Dev default | Prod default | Required? |
|---|---|---|---|---|
| `ATLAS_SCRAPE_CONTACT_EMAIL` | Contact email embedded in UA string (§D.1). | `terje@helpers.no` | `terje@helpers.no` | **Yes — hard failure at startup if unset.** Anonymous scrapes breach §D.1. |
| `CRAWLEE_STORAGE_DIR` | Crawlee KeyValueStore path (§C.1). | `atlas-data/ingest/.crawlee-cache/` | `/tmp/crawlee-cache/` (or `emptyDir` mount) | No — Crawlee default (`./storage`) works; explicit value preferred. |
| `CRAWLEE_LOG_LEVEL` | Crawlee logger verbosity ([Q15]). | `INFO` | `WARNING` | No — Crawlee default (`INFO`) works. |

Notes:

- `ATLAS_SCRAPE_CONTACT_EMAIL` is the only required variable. It's read once at startup by `ingest/src/lib/scraping/ua.ts`, which throws if the variable is unset or empty.
- `CRAWLEE_STORAGE_DIR` is Crawlee-native — Crawlee reads it directly, no Atlas code involved.
- `CRAWLEE_LOG_LEVEL` is also Crawlee-native. Set `DEBUG` ad-hoc when investigating a specific scraper; not a normal-operation value.

If the list grows past ~5 variables (e.g., per-source rate-limit overrides become env-driven), split out a dedicated `ingest/src/lib/config.ts` with a typed loader and schema validation.

---

## Section G — Testing convention — **[Q23]**

### G.1 Runner and approach

**Vitest** is the test runner for `atlas-data/ingest/` — matches the `software-scrape` precedent, fast TS-native, Jest-compatible API. Two test surfaces: pure unit tests for the shared scraping lib, golden-file tests per source.

### G.2 Shared lib tests

Under `ingest/src/lib/scraping/__tests__/`:

| File under test | Test type | What it asserts |
|---|---|---|
| `ua.ts` | unit | Missing `ATLAS_SCRAPE_CONTACT_EMAIL` throws; valid env produces the exact UA string. |
| `record_hash.ts` | unit | Same input → same hash; key reordering in the input object → same hash (canonicalization); NFC and NFD variants of the same string → same hash (normalization). |
| `robots.ts` | unit | Given `robots.txt` fixtures + a URL list, returns the correct allow/deny verdict. |
| `sitemap_log.ts` (pure) | unit | `decideFetch` reason codes: first-seen, prior-lastmod-null, current-lastmod-null, no-prior-raw-row, lastmod-advanced, unchanged. |
| `sitemap_log.ts` (DB funcs) / `ingest_runs.ts` / `upsert_record.ts` DB path | end-to-end | Verified via Phase 2's `npm run migrate` + Phase 5's `dbt build` + the first per-source PLAN's (Folkehjelp) smoke test, not via a mocked DB. A dedicated DB test harness (likely testcontainers-postgres) becomes its own PLAN if regressions motivate it. |

### G.3 Per-source tests

Each `sources/<slug>/` folder gets a `__tests__/` directory:

```
sources/<slug>/
└── __tests__/
    ├── parse.test.ts           — runs parse(fixture.html) and deep-equals against fixture.expected.json
    └── fixtures/
        ├── chapter-oslo.html
        ├── chapter-oslo.expected.json
        ├── chapter-bergen.html
        └── chapter-bergen.expected.json
```

The test body is ~5 lines: read HTML, call `parse()`, deep-equal against the expected JSON. **Two to three fixtures per source is the target** — enough to catch common regressions, not so many that maintenance becomes a drag.

When a template change legitimately alters the record shape, the HTML fixture and the expected JSON update together in the same commit; the diff tells the reviewer exactly what changed in the extraction.

### G.4 What is deliberately not tested

- **Crawlee itself** — trust the library.
- **Live HTTP against real NGO sites** — flaky, ethically questionable (each test run = extra load on the origin), and covered indirectly when per-source parse tests exercise real-world fixture HTML.
- **dbt staging logic for a source** — belongs to the per-source investigation / PLAN, not to this scraping infrastructure.

### G.5 CI

Tests run on every PR via the repo's existing CI. Failing tests block merge. No separate CI pipeline for ingest — it shares the frontend's.

---

## Decisions resolved during planning

1. ~~**[Q1]**~~ Source-discovery checklist (CMS API → sitemap → robots → outreach). Codified.
2. ~~**[Q2]**~~ Outreach is non-blocking; scrape ships regardless. Codified.
3. ~~**[Q3]**~~ Crawlee + CheerioCrawler (Playwright fallback per-source).
4. ~~**[Q4]**~~ Two-stage pipeline (scrape → cache → parse → DB).
5. ~~**[Q5]**~~ Crawlee `KeyValueStore` on local FS, `atlas-data/ingest/.crawlee-cache/`, gitignored.
6. ~~**[Q6]**~~ Sitemap `lastmod` skip at the discover layer.
7. ~~**[Q7]**~~ `html_raw_hash` (sha256 of canonical body) skip at the parse layer. **Partially superseded by [Q18]** — body hash demoted to audit-only; `record_hash` is now the skip signal.
8. ~~**[Q8]**~~ User-Agent: `Atlas/0.1 (https://github.com/terchris/atlas; <contact>)`. **See [Q13]** — `<contact>` is read from `ATLAS_SCRAPE_CONTACT_EMAIL` at startup, not hard-coded.
9. ~~**[Q9]**~~ Default rate: 1 req/sec per host.
10. ~~**[Q10]**~~ Per-page failure: warn-and-continue.
11. ~~**[Q11]**~~ Discovery failure: hard fail.
12. ~~**[Q12]**~~ `raw.ingest_runs` ships as part of the infra PLAN.
13. ~~**[Q16]**~~ Target scale capped at ~15 NGOs (10 Tier A + up to 5). Rules out LLM runtime extraction, LLM fallback, CMS-cluster scrapers, Brreg-only tail, and a central activity-label mapping table. Decided 2026-04-24.
14. ~~**[Q17]**~~ Scrape cache location is controlled by `CRAWLEE_STORAGE_DIR`. Dev points it at `atlas-data/ingest/.crawlee-cache/` (repo-local, gitignored). Prod points it at an ephemeral in-pod path (`/tmp/crawlee-cache/` or an `emptyDir` volume). Change detection survives via DB columns (`record_hash`, sitemap-log), not the cache. Postgres-backed `raw.html_archive` is the documented upgrade path if audit/stage-split needs emerge. No PVC, no object storage added for v1. Decided 2026-04-24.
15. ~~**[Q18]**~~ Skip signal is `record_hash` (sha256 of canonical JSON of the extracted record), computed post-parse, gating DB upsert. `html_raw_hash` (sha256 of canonical HTML body) is kept on the raw row as an audit-only artifact for template-drift forensics (see §C.3.1). Hashing the HTML alone produced false positives from cosmetic drift (rendered dates, cache-busters, counters). Decided 2026-04-24.
16. ~~**[Q13]**~~ UA contact email is read from env var `ATLAS_SCRAPE_CONTACT_EMAIL`. Default project value is `terje@helpers.no`. Missing env var is a hard failure at startup — no anonymous scrapes. Decided 2026-04-24.
17. ~~**[Q14]**~~ `mart_ingest_health` ships with PLAN-001 as a minimal 3-column view (`source_slug, last_run_at, last_status`). Gives `raw.ingest_runs` a first consumer from day one; operator (Terje) reads it directly when something breaks. Additional columns (failure counts, drift counters, 30-day trend) added on demand when a real dashboard or alerting consumer emerges. Decided 2026-04-24.
18. ~~**[Q15]**~~ Crawlee log level is controlled by the native `CRAWLEE_LOG_LEVEL` env var. Dev default: `INFO` (high-level progress per page, no request/response dumping). Prod default: `WARNING` (only unexpected events). Override to `DEBUG` ad-hoc when investigating a specific scraper — documented as a troubleshooting knob in `atlas-data/ingest/README.md`, not a normal-operation setting. Decided 2026-04-24.
19. ~~**[Q19]**~~ Sitemap state lives in a **shared** `raw.sitemap_log` table (one row per `(source_slug, url)` across all sources), not per-source. Enables cross-source orphan reporting and avoids per-source migrations. See §C.2 for schema and §E.1 for orphan-propagation rules. Decided 2026-04-24.
20. ~~**[Q20]**~~ Mandatory columns on every scraper parent-entity `raw.<source>_*` table: `url`, `record_hash`, `html_raw_hash` (nullable), `is_active`, `loaded_at`. Consolidated from §C.2/§C.3/§C.3.1/§E.1 into §C.5. Child tables (activities, sub-locations) do not carry these columns — they're owned by the parent and delete-and-reinserted when the parent's `record_hash` changes. A dbt schema test asserts presence on every scraper raw source. Decided 2026-04-24.
21. ~~**[Q21]**~~ Canonical JSON serialization for `record_hash` uses [`fast-json-stable-stringify`](https://www.npmjs.com/package/fast-json-stable-stringify) (npm dep). All string values entering the record object must be UTF-8 NFC-normalized (`str.normalize('NFC')`) at the parser boundary — cheerio may return NFD composition forms for Norwegian characters, which would silently flip the hash. Decided 2026-04-24.
22. ~~**[Q22]**~~ Concurrent-run protection is an app-layer lock on `raw.ingest_runs` (an in-progress row with `finished_at IS NULL` blocks new runs for the same `source_slug`). Dagster's `QueuedRunCoordinator` with `tag_concurrency_limits` becomes the orchestrator-layer primary guard when Dagster comes online; the app-layer lock remains as backstop for manual CLI invocations. Stale-lock recovery is manual via a simple `UPDATE`; a sweeper is deferred until stale locks are observed in practice. See §E.3.1. Decided 2026-04-24.
23. ~~**[Q23]**~~ Testing uses **Vitest** (matches `software-scrape` precedent). Shared lib gets pure-function unit tests (hashers, UA, robots, `decideFetch`, input validation). DB-touching code in the shared lib is verified end-to-end via Phase 2 migrate + Phase 5 dbt build + the first per-source PLAN's (Folkehjelp) smoke test — not via a mocked DB. Per-source scrapers get **golden-file tests**: `sources/<slug>/__tests__/fixtures/*.html` and `*.expected.json`, 2–3 fixtures per source. Crawlee itself, live HTTP, and dbt logic are deliberately out of scope. See §G. A dedicated DB integration test harness (likely testcontainers-postgres) becomes its own PLAN if real regressions escape the end-to-end coverage. Decided 2026-04-24.
24. ~~**[Q24]**~~ Discovery threshold is an **absolute integer floor** (`MIN_DISCOVERED_URLS`) configured per source in `index.ts`. Relative thresholds (<50% of last run) were rejected — they require persistent state, false-alarm on legitimate NGO shrinkage (closures, mergers), and catch nothing that a correctly-sized absolute floor doesn't. See §E.2. Decided 2026-04-24.
25. ~~**[Q25]**~~ Per-source file responsibilities are specified as a convention: `parse.ts` is a pure function (no I/O), `discover.ts` owns sitemap-log reads and writes, `index.ts` orchestrates (including `ingest_runs` lock, Crawlee, upsert). The shared `upsertRecord()` helper in `ingest/src/lib/scraping/` does the generic mandatory-column upsert (§C.5). See §B.3. Decided 2026-04-24.

---

## Open Questions

None remaining — all resolved as of 2026-04-24. Open Questions may reappear here if PLAN-001 implementation surfaces new decisions.

---

## Next Steps

- [ ] **PLAN-001-scraping-infrastructure.md** (~6–8h)
  - Add dependencies to `ingest/package.json` (pin major versions): `crawlee`, `fast-json-stable-stringify`. Dev deps: `vitest`.
  - Migrations: `raw.ingest_runs` and `raw.sitemap_log`.
  - Shared module `ingest/src/lib/scraping/` with: env-driven UA builder (hard-fails on missing `ATLAS_SCRAPE_CONTACT_EMAIL`), rate-limit config, `robots.txt` verifier (re-checked every run per §D.4), KeyValueStore wrapper, `record_hash` helper, `html_raw_hash` helper, `sitemap_log` reader/writer (discover + orphan detection), `ingest_runs` writer.
  - Add `.crawlee-cache/` to `ingest/.gitignore`.
  - Add the 3-column `mart_ingest_health` view to dbt (§E.3).
  - Documentation: `atlas-data/ingest/src/sources/README.md` documents the per-source folder convention; `atlas-data/ingest/README.md` lists the three env vars from §F.

This PLAN is a prerequisite for [`INVESTIGATE-folkehjelp-supply.md`](../backlog/INVESTIGATE-folkehjelp-supply.md)'s scrape PLAN.

---

## Files this investigation will produce

**New shared code:**
- `atlas-data/ingest/src/lib/scraping/` — env-driven UA builder, rate-limit config, `robots.txt` verifier, KeyValueStore wrapper, `record_hash` + `html_raw_hash` helpers (using `fast-json-stable-stringify`), `sitemap_log` reader/writer (discover + orphan detection), `ingest_runs` writer (with concurrent-run lock per §E.3.1), generic `upsertRecord()` helper.
- `atlas-data/ingest/src/lib/scraping/__tests__/` — unit and integration tests per §G.2.

**New tables:**
- `raw.ingest_runs` (§E.3)
- `raw.sitemap_log` (§C.2, shared across all sources)

**New dbt model:**
- `mart_ingest_health` (small view; surfaces in `docs/stack/erd.md` once built)

**New cache location (gitignored):**
- `atlas-data/ingest/.crawlee-cache/`

**Documentation:**
- `atlas-data/ingest/src/sources/README.md` — per-source folder convention.
- Extend [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) with: `source_slug`, `record_hash`, `html_raw_hash`, `url` (raw-table convention per §C.2), `raw.ingest_runs`, `raw.sitemap_log`.

---

## Companion investigations

- [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](../backlog/INVESTIGATE-multi-ngo-supply-model-extensions.md) — `dim_chapter.source_url`, `dim_chapter.chapter_subtype`, `chapter_kommune_coverage` link table.
- [`INVESTIGATE-folkehjelp-supply.md`](../backlog/INVESTIGATE-folkehjelp-supply.md) — first concrete consumer of this infrastructure.
- [`INVESTIGATE-ngo-events-and-minisites.md`](../backlog/INVESTIGATE-ngo-events-and-minisites.md) — sub-activity granularity (deferred parking lot).
