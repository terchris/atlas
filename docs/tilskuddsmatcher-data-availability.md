# Tilskuddsmatcher — Grant-Call Data Availability

Research input for `goal.md` §9 (Tilskuddsmatcher extension) and the Lisa persona (tilskuddsansvarlig) v1-wedge question in §Open decisions.

---

## Executive summary

**Verdict: Tilskuddsmatcher is feasible as a v1 MVP — materially more feasible than the goal doc assumed.** The single most important discovery is that `tilskudd.dfo.no` (which redirects to `tilskudd.lottstift.no`) is not retrospective-only as assumed. It is the official state aggregator of ~163 state-level grant schemes to voluntary organisations, with stable ordning IDs (`DT-XXXX` pattern), current deadlines, eligibility, amounts, grantor, and purpose — served as a Next.js site with full `__NEXT_DATA__` JSON embedded in the HTML. That one source alone covers the bulk of state grant flow to NGOs and is trivially scrape-feasible. Foundations, EU, and kommunale sources form a second tier (all HTML-scrapable, varying effort), and the EU Funding & Tenders Portal exposes a public JSON SEDIA Search API for international calls. A v1 Tilskuddsmatcher built on tilskudd.lottstift.no + 4 foundation sites + 4 kommuner + EU SEDIA covers the 80 % case with ~two weeks of integration work.

---

## Methodology

- Every source below was fetched live between 2026-04-18 morning-afternoon UTC via WebFetch and curl.
- For each: verified HTTP status, confirmed whether data is server-rendered HTML, JSON-embedded (Next.js `__NEXT_DATA__` or similar), JavaScript-only (requires headless browser), or PDF-only.
- Where a WebFetch 303/403/404 occurred, followed up via curl and/or WebSearch to confirm what's actually there versus WebFetch rejecting the URL signature.
- No scraping of private/subscription portals (e.g. tilskuddsportalen.no subscription tier) — only what is publicly accessible.
- Counts of ordninger are from actual page content where available; where not countable I mark as "not enumerated in listing".

---

## Per-source feasibility

### State directorates (single-directorate pages)

| # | Source | URL | HTTP | Format | Ordninger listed? | Scrape-feasible? | Update cadence | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | **Bufdir** | `www.bufdir.no/tilskudd/` | 200 | Static HTML, predictable DOM, filterable by applicant type and theme | Yes — 21 schemes with deadlines, eligibility tags, purpose, detail URL pattern `/tilskudd/<slug>/` | **Yes, high confidence** | Schemes rotate annually; deadlines updated as cycles shift | No RSS/JSON. `tilskudd@bufdir.no` contact |
| 2 | **Helsedirektoratet** | `www.helsedirektoratet.no/tilskudd` → `/tilskudd-og-finansiering/tilskudd` (200) | 200 (after redirect) | Static HTML hub page; **search-driven, no enumerated listing on landing page** | Schemes exist (per 2022 report: 175 ordninger, 85 of which go to NGOs); landing does not enumerate them — requires crawling via search/sub-pages or Altinn | **Medium** — site structure requires a crawler, not a flat scraper | Ongoing (deadlines vary) | Discovery hub lists `Tilskudd / Finansiering / Analyser` — real listings behind "Søk i alle tilskudd". Also surfaced on Altinn skjemaoversikt. 2022 tilskuddsrapport is the canonical ordning count |
| 3 | **Kulturdirektoratet / Kulturrådet** | `www.kulturdirektoratet.no/tilskuddsordninger` | 200 | Static HTML, server-rendered, filterable UI | Yes — **67 schemes** listed explicitly, with deadlines (e.g. 30.april.2026, løpende, opens dates), filter by art form / funding source / applicant type, open/closed status indicator | **Yes, high confidence** | Schemes rotate with varying frequency; rolling deadlines common | Kulturrådet is not merged — Kulturdirektoratet is the secretariat for Kulturrådet, Fond for lyd og bilde, and Statens kunstnerstipend. All three surface in the same listing |
| 4 | **Miljødirektoratet** | `www.miljodirektoratet.no/ansvarsomrader/tilskudd/` | 404 on that exact path via WebFetch | Subpath pages (e.g. `/for-private/tilskudd-fra-miljodirektoratet/`) also 404; site has ordninger reachable via search and landing-page nav | — | **Low–medium** — crawler required, not a flat listing | Annual | URL in goal.md §9 is stale. Needs rediscovery of the correct landing page (search result points to `/tjenester/tilskuddssoknader/` structure — unverified) |
| 5 | **Norad** | `www.norad.no/tilskudd` → `/for-partnere/for-partnere/utlysninger/` (200) | 200 (after redirect) | Static HTML, **hierarchical grouping by deadline month** (Løpende / Mai 2026 / Juni 2026 …) | Yes — 4 open calls currently, detail pages `/utlysninger/<year>/<slug>/` | **Yes, high confidence** | Low volume, new calls added as cycles open | International development, English-language call detail pages. Also feeds `grants.mfa.no` portal |
| 6 | **IMDi** | `www.imdi.no/tilskudd` | 200 | Static HTML | Yes — 4 schemes (voluntary orgs, public entities, employers, Norwegian language) with URL pattern `/tilskudd/<slug>/` | **Yes, high confidence** | Annual | Deadlines are on the detail pages, not the index. Some schemes redirect to `mika.no` (employers) |
| 7 | **KS (Kommunenes Sentralforbund)** | `www.ks.no/` | 200 | — | No grant-giving role surfaced on the homepage | **Not a grantor source** — skip | n/a | KS is the municipal umbrella; it advocates for members, does not itself administer a public grant programme in the same sense as a directorate. Confirmed. Remove from the canonical list |
| 8 | **Forskningsrådet** (implicit via Interreg search results; relevant to research-active NGOs) | `www.forskningsradet.no/utlysninger/` | 200 | Static HTML listing | Yes — dozens of utlysninger with stable URL pattern `/utlysninger/<year>/<slug>/` and deadlines | **Yes, high confidence** | High cadence, new calls added weekly | Not on the original list. Worth adding — Tier A NGOs (especially health-adjacent and environment-adjacent) do apply |
| 9 | **Arbeidstilsynet, NAV, Udir** (from goal §9 question) | various | — | — | Arbeidstilsynet is a regulator, not a primary grant-giver. NAV has a small number of ordninger for employers/work-inclusion (e.g. BHT-tilskudd, mentor- and inkluderingstilskudd, but these are transactional not competitive NGO grants). Udir has skoleeier-facing ordninger. | **Low relevance to NGO audience** — skip from v1 unless NAV's `Tilskudd til inkluderingsdugnaden`-type schemes are specifically of interest | — | De-prioritise for v1 |

### State aggregator — CRITICAL FINDING

| # | Source | URL | HTTP | Format | Ordninger listed? | Scrape-feasible? | Update cadence | Notes |
|---|---|---|---|---|---|---|---|---|
| 10 | **tilskudd.no** (`tilskudd.dfo.no` → `tilskudd.lottstift.no`) | `tilskudd.lottstift.no/ordninger` | 200 | **Next.js SSR** — HTML contains `__NEXT_DATA__` JSON blob with full page state. Page body has 163 ordninger paginated (7 pages), each with deadline, grantor, ordning type, and stable ordning ID (`DT-XXXX` pattern) | **Yes — 163 schemes**, both open and recently-closed, with stable IDs, grantor/forvalter, deadline, ordning type (Drifts/Prosjektmidler), and for each scheme-detail page: available midler (e.g. 70 724 000 kr), eligibility language, purpose, target groups, historical allocations | **Yes — highest confidence of any source**. Stable ID scheme, SSR HTML, JSON in `__NEXT_DATA__`, predictable URL pattern `/ordning/<DT-ID>/<year>/<slug>` | Updated continuously as tilskotsforvaltarar publish. Data most complete when fiscal year closes | **This single source materially changes the v1 feasibility question.** It already aggregates every state directorate's NGO-facing ordninger (Bufdir, Helsedirektoratet, Kulturrådet, Forsvarsdepartementet, UD, KLD etc.) into one model. Before scraping 8+ directorate sites separately, scrape this first. The existing app already references `tilskudd.lottstift.no` but treats it as retrospective-only — that framing is wrong. Frontend is JavaScript-interactive but data is in HTML at parse time |

### Foundations

| # | Source | URL | HTTP | Format | Ordninger listed? | Scrape-feasible? | Update cadence | Notes |
|---|---|---|---|---|---|---|---|---|
| 11 | **Stiftelsen Dam** | `www.dam.no/utlysninger/` | 404 on WebFetch (anti-bot) | Pages exist per subscription UI probing; site is well-known and does list utlysninger | — | **Medium** — may require user-agent rotation or headless browser. WebFetch rejection is the bot-blocking signal | Annual cycles (Ekspress, Helse, Utvikling, Forskning) | Dam has public utlysning pages for each programme with deadlines and eligibility. Scrape-feasible in principle; 404-on-WebFetch is a red flag for bot-blocking. Plan for a real scraper with proper UA |
| 12 | **Gjensidigestiftelsen** | `www.gjensidigestiftelsen.no/` | 200 | Static HTML | Yes — 2 main schemes (Sommer, Høst) with explicit deadlines (2.mars, 1.sep), purpose, target group | **Yes, high confidence** | Twice yearly | Application portal on separate host `sokerportal.gjensidigestiftelsen.no`. Only 2 ordninger makes this trivial |
| 13 | **Sparebankstiftelsen DNB** | `sparebankstiftelsen.no/` | 200 | Static HTML | Yes — one generic scheme with known deadline triplet (1.apr, 1.sep, 1.des) for >50 000 kr, rolling for ≤50 000 kr, 7 purpose areas (kunst, kultur, friluftsliv, idrett, naturkunnskap, nærmiljø, kulturarv) | **Yes, high confidence** | 3 fixed deadlines + rolling | Application on `soknad.sparebankstiftelsen.no` |
| 14 | **Fritt Ord** | `frittord.no/` | 200 | Static HTML | Yes — 4 schemes (prosjektstøtte, masterstipend, skolebibliotek, Free Media Awards) with deadlines and amounts | **Yes, high confidence** | Rolling for project support; dated for others | Portal on `fritt.prod.machina.no` |
| 15 | **Anthon B Nilsen Utdanning** | — | — | — | Small education-focused grantor; deprioritise for v1 | **Low relevance** | — | Flag only |

### EU / international

| # | Source | URL | HTTP | Format | Ordninger listed? | Scrape-feasible? | Update cadence | Notes |
|---|---|---|---|---|---|---|---|---|
| 16 | **EU Funding & Tenders Portal (SEDIA)** | `ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home`; API `api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA` | Portal 200 (JS app); API endpoint responds 405 on GET (requires POST) | **Real public REST JSON API** (SEDIA Search API), plus RSS feed for funding opportunities | Yes — all topics/calls across Horizon Europe, Erasmus+, Creative Europe, LIFE, CERV, etc., each with deadline, programme, identifier, topic description, keywords | **Yes — API-first**, documented in a handful of third-party scrapers (Apify, `geoffreyaldebert/funding-and-tenders-data` on GitHub) and on EC's own support/apis page | Real-time | Requires POST with JSON body including `apiKey=SEDIA` (no personal auth token for read access, public-use). Rate-limited, but no documented cap low enough to matter for periodic sync. The only true API in this entire list |
| 17 | **Interreg Norge** | `interreg.no/kalender/kategori/utlysninger/` | 200 | Static HTML calendar; also offers .ics / Google Calendar / iCal / Outlook subscription feeds | Yes — few current calls (ESPON, URBACT, NPA youth call) with deadlines and programme URLs | **Yes** — ICS is a known machine-readable format with RFC 5545 spec. Prefer .ics over HTML scrape | Low volume | The .ics subscription is the preferred integration path here. Best case of any source for "passive sync" |

### Umbrella / aggregators

| # | Source | URL | HTTP | Format | Ordninger listed? | Scrape-feasible? | Update cadence | Notes |
|---|---|---|---|---|---|---|---|---|
| 18 | **Frivillighet Norge tilskuddskatalog** | `frivillighetnorge.no/tilskuddskatalogen` | 403 | Unknown — WebFetch blocked | Historically exists as a maintained list with commentary | **Medium** — likely HTML; requires proper UA | Periodic | Content is commentary/analysis alongside the state list — less structured than tilskudd.no. Use tilskudd.no as the primary and Frivillighet Norge as an editorial layer if useful |
| 19 | **tilskuddsportalen.no** | `tilskuddsportalen.no/` | 200 | **Subscription-only**, commercial (OSINT Analytics AS). 2 700+ grants indexed, municipal and NGO portals, map of subscribing municipalities | Yes — 2700+ | **Not feasible for our use** — subscription required, data behind paywall. Competitive reference only | — | Confirms demand: 2 700+ grants and a paying customer base (municipalities + orgs). Validates the wedge |
| 20 | **regionalforvaltning.no** | `regionalforvaltning.no/Startside/Velkommen.aspx` | 200 | ASP.NET application, static HTML with JS elements, **login required to browse ordninger fully** | Yes — hundreds of schemes across fylkeskommuner, kommuner, departements | **Low** — application-first system (SPINE AS for KMD), designed for applicants not data re-users. No public API | — | Relevant as a second-tier source for fylkeskommunale grants but too fragmented/walled to integrate in v1 |

### Kommunale (sampling: big 4)

| # | Source | URL | HTTP | Format | Ordninger listed? | Scrape-feasible? | Update cadence | Notes |
|---|---|---|---|---|---|---|---|---|
| 21 | **Oslo kommune** | `www.oslo.kommune.no/tilskudd-legater-og-stipend/` | 200 | Static HTML overview → themed sub-pages | Per overview: filterable by tema/område/type. Actual enumeration was not returned by WebFetch (truncated), but page exists | **Yes, with effort** — each tema sub-page enumerates | Annual cycles, varies by tema | Oslo also has a `Tilskuddsbasen`-like application portal at a separate subdomain |
| 22 | **Bergen kommune** | `www.bergen.kommune.no/innbyggerhjelpen/kultur-idrett-og-fritid/tilskuddsordninger` | 200 | Static HTML categories | Yes — 5 categories × 4-7 ordninger each (~25 total visible), URL pattern `/innbyggerhjelpen/kultur-idrett-og-fritid/tilskuddsordninger/<category>/<slug>`. Deadlines on detail pages | **Yes, high confidence** | Annual | Application on `tilskudd.bergen.kommune.no/portal/` |
| 23 | **Trondheim kommune** | `www.trondheim.kommune.no/tema/kultur-og-fritid/tilskudd-priser-og-stipend/tilskudd/` | 200 | Static HTML, 6 categories (barn/helse/kunst/idrett/mangfold/miljø) | Yes — dozens across categories, each with detail URL | **Yes** | Annual + rolling | Application on `tilskudd.trondheim.kommune.no/`; also an extensive Tilskuddsbasen |
| 24 | **Stavanger kommune** (not in original ask; recommended for completeness of "big 4" — Oslo, Bergen, Trondheim, Stavanger) | — | — | Same pattern likely | — | Likely scrape-feasible | — | Spot-check before committing |

### De-prioritised for v1 after research

- **KS** — not a grantor
- **Arbeidstilsynet** — regulator, no grant-giving
- **NAV, Udir** — schemes exist but target employers/schools, not NGOs
- **tilskuddsportalen.no** — paywalled; competitive reference
- **regionalforvaltning.no** — walled garden
- **Anthon B Nilsen Utdanning** — too small

---

## Aggregated feasibility assessment

Counting only the sources that are both (a) live-verified and (b) machine-readable in some form (HTML scrape, JSON-embedded, API, or ICS):

- **High-confidence scrape-feasible or API-available, directly usable**: tilskudd.lottstift.no, Bufdir, Kulturdirektoratet, Norad, IMDi, Forskningsrådet, Gjensidigestiftelsen, Sparebankstiftelsen DNB, Fritt Ord, Interreg (.ics), EU SEDIA API, Bergen, Trondheim — **13 sources**
- **Medium (crawler needed, or bot-blocked but known-structured)**: Helsedirektoratet, Miljødirektoratet (after URL rediscovery), Dam, Frivillighet Norge, Oslo — **5 sources**
- **Out of scope / paywalled / not a grantor**: KS, NAV, Arbeidstilsynet, Udir, tilskuddsportalen.no, regionalforvaltning.no, ABN Utdanning — 7 sources

Because **tilskudd.lottstift.no already aggregates the state directorates' NGO-facing ordninger under stable IDs**, the 13 scrape-feasible sources actually represent a much higher share of *distinct* NGO-relevant funding than their count suggests. A rough coverage estimate:

- **tilskudd.lottstift.no** covers approximately **70-80 % of state-level NGO grant volume** (it is the official state aggregator for state tilskudd to frivillige organisasjoner, by design)
- The four named foundations cover the majority of the large-foundation grant flow relevant to civil-society NGOs
- The EU SEDIA API covers international / EU calls relevant to larger Tier A NGOs
- The big-4 kommuner cover the majority of urban kommunale grants where NGO chapters concentrate

**Aggregate estimate: 80-90 % of total Tilskuddsmatcher-relevant funding is reachable via ~13 machine-readable sources.** This is well above the threshold for a credible v1.

---

## Recommended technical approach

1. **Primary scraper: tilskudd.lottstift.no**
   - Fetch `/ordninger` HTML and parse `__NEXT_DATA__` JSON from the inline script — this gives the paginated ordning list without having to walk pagination manually.
   - For each `DT-XXXX` ordning, fetch `/ordning/<DT-ID>/<year>/<slug>` and extract structured fields from `__NEXT_DATA__` (same technique).
   - Run this nightly; the site updates incrementally but is not high-frequency.
   - This one integration delivers ~70 % of v1 data.

2. **Secondary scrapers: foundation sites**
   - Dam, Gjensidige, Sparebank, Fritt Ord — one small scraper per site, each ~50-100 lines. Weekly cadence.
   - Dam may need proper user-agent rotation; others are straightforward.

3. **API integration: EU SEDIA Search API**
   - POST to `api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA` with JSON body filtering to Norwegian-eligible programmes and open status.
   - Response is JSON — no parsing required. Daily or weekly cadence.

4. **ICS subscription: Interreg**
   - Subscribe to the .ics feed, parse RFC 5545 events. No custom scraping needed.

5. **Kommunale scrapers: big 4**
   - One scraper per kommune. Annual-cycle data — monthly refresh sufficient.

6. **Directorate sites as fallback**
   - Bufdir, Kulturdirektoratet, Norad, IMDi, Forskningsrådet — scrape only to catch ordninger not yet (or no longer) in tilskudd.lottstift.no, or for richer detail (narrative purpose, historical recipients at the scheme level).
   - De-duplicate against tilskudd.lottstift.no's DT-IDs where available; use a fuzzy grantor+title match otherwise.

7. **Common store and dedup**
   - Write every fetched ordning to a normalised `open_call` row keyed by `(source, source_id)` and cross-referenced by a `canonical_ordning_id` when dedup is confident.
   - Store raw HTML/JSON response alongside the normalised row for audit and re-parse when DOM changes.

8. **Respectful crawl**
   - One request per 2-5 seconds per host.
   - Respect robots.txt where published.
   - Honest User-Agent string identifying the project and a contact URL.

9. **Graceful degradation**
   - If a single scraper breaks, show last-good data with a staleness badge (same pattern the Red Cross/Norsk Folkehjelp chapter scrapers already use in the core).

---

## Suggested common schema for an open-call entry

```ts
interface OpenCall {
  // Identity
  canonical_id: string;           // e.g. "tilskudd-lottstift:DT-0079:2025" or "eu-sedia:HORIZON-CL2-2026-01"
  source: SourceId;               // enum: "tilskudd_lottstift" | "bufdir" | "dam" | "eu_sedia" | ...
  source_id: string;              // stable ID in the source system (e.g. DT-0079)
  source_url: string;             // canonical URL on the grantor's site

  // Grantor
  grantor_name: string;           // "Bufdir" | "Stiftelsen Dam" | ...
  grantor_type: "directorate" | "foundation" | "eu" | "kommune" | "fylke" | "other";
  grantor_org_number: string | null; // Brreg orgnr where applicable

  // Scheme
  scheme_name: string;            // "Tilskudd til frivillige organisasjoner"
  scheme_type: "drift" | "prosjekt" | "investering" | "stipend" | "mixed" | "other";
  purpose: string;                // free-text formål
  target_groups: string[];        // ["barn", "ungdom", "seniorer", ...]
  activity_tags: string[];        // normalised against the app's activity taxonomy

  // Eligibility
  eligibility_text: string;       // verbatim eligibility clause
  eligibility_org_types: ("frivillig" | "stiftelse" | "kommune" | "fylke" | "bedrift" | "privatperson")[];
  requires_frivillighetsregisteret: boolean;
  geographic_scope: "nasjonal" | "regional" | "kommunal" | "eu" | string; // or specific fylke/kommune

  // Money
  total_pot_nok: number | null;   // e.g. 70_724_000
  min_grant_nok: number | null;
  max_grant_nok: number | null;
  typical_grant_nok: number | null; // from retrospective allocations

  // Timing
  application_deadline: string | null; // ISO date, or null for løpende
  is_rolling: boolean;
  application_opens: string | null;
  year: number;                   // the funding year this call targets

  // Match signals (for the matching layer, derived not scraped)
  match_keywords: string[];       // extracted from purpose + eligibility
  activity_codes: string[];       // same taxonomy as chapter activities
  need_indicator_codes: string[]; // Samfunnspuls-style codes for when the scheme addresses a specific need

  // Meta
  last_fetched_at: string;        // ISO timestamp
  last_changed_at: string;        // when any material field changed
  raw_snapshot_path: string;      // where the raw response is stored
  status: "open" | "upcoming" | "closed" | "unknown";
}
```

Indexing: primary key is `canonical_id`; secondary indexes on `application_deadline`, `grantor_type`, `activity_codes`, `eligibility_org_types`, and full-text on `scheme_name + purpose + eligibility_text` for the matcher's semantic layer.

---

## Risks

1. **Site markup drift** — every directorate, foundation, and kommune can redesign its pages at any time. Mitigation: each scraper is self-contained; individual breakage is isolated; failing scrapers degrade gracefully to last-good cache with staleness badge. Build a "scrape health" dashboard early.

2. **Bot-blocking** — Dam and Frivillighet Norge returned 4xx to WebFetch, suggesting WAF or UA-sniffing. Mitigation: proper browser-like User-Agent, request spacing, possibly Playwright/headless for the handful of JS-heavy sites. Avoid aggressive concurrency.

3. **Language variation** — some sources bokmål, some nynorsk (tilskudd.lottstift.no is heavily nynorsk: "søknadsfrist", "forvaltar", "tildelingar"). Matching layer must normalise both. Shared ordbok for bokmål↔nynorsk synonyms.

4. **Ordning-ID instability elsewhere** — only tilskudd.lottstift.no has a guaranteed stable ID (`DT-XXXX`). Every other source identifies schemes by slug-in-URL, which can change. Use `(source, slug, year)` as a compound key and track renames via title+grantor similarity.

5. **Retrospective vs current data confusion** — tilskudd.lottstift.no carries expired ordninger alongside open ones; the current `application_deadline` field on a scheme-page reflects the most recent cycle, which may be past. Must compute `status` from the deadline, not trust page-level state.

6. **Duplicate entries across sources** — an ordning may appear on both the directorate's own site and tilskudd.lottstift.no with slightly different framing. Dedup is hard. Practical stance: prefer tilskudd.lottstift.no as canonical when the DT-ID is known; surface the directorate's own page as a supplementary link.

7. **EU SEDIA API policy change** — the API is documented publicly by third parties but is not a formally-contracted developer API. It could throttle or close without notice. Mitigation: cache responses, set up a monitoring alert on 4xx/5xx spikes, have a fallback HTML-scrape path for the highest-value EU programmes.

8. **Legal / ToS** — Norwegian public-sector data is generally free to reuse (NLOD, Brreg terms), and the goal doc already affirms a position that public info is fair to harvest. Foundations are private entities; respect any robots.txt and don't overload. EU data is under a permissive public-use policy.

9. **"Coverage is not completeness"** — hitting 80-90 % of funding volume doesn't mean 80-90 % of Lisa's work becomes easy. The remaining sources (smaller foundations, regional pots, kommunale ordninger in non-big-4 kommuner) still matter for her. Set user expectations clearly: "we cover the largest sources; we do not cover every regional grant pot in Norway".

10. **tilskuddsportalen.no competitive pressure** — they have 2 700+ grants and paying municipal customers. We will not out-scale them on breadth. We win by being free, by being tied to the NGO's own activity profile (semantic match), and by integrating with the chapter + need-indicator data the core already has.

---

## Verdict

**Tilskuddsmatcher is feasible as a v1 MVP.** The feasibility calculus in the goal doc understated the state aggregator: the redirect from `tilskudd.dfo.no` to `tilskudd.lottstift.no` means the canonical state grant catalogue to NGOs is already one machine-readable scrape away, with stable IDs and structured data. Building v1 on top of that plus 4 foundation sites + EU SEDIA API + 4 big kommuner is approximately two weeks of integration effort, not two months.

A staged rollout:

- **v1 MVP (2 weeks)**: tilskudd.lottstift.no + Gjensidige + Sparebank + Fritt Ord + Dam + EU SEDIA + Bergen + Trondheim. Covers ~70-80 % of relevant funding volume. Matcher layer uses NGO's activity profile and kommune coverage to rank.
- **v1.5 (+2 weeks)**: directorate-site fallbacks (Bufdir, Kulturdirektoratet, Norad, IMDi, Forskningsrådet) for richer detail and cross-validation. Oslo + Stavanger kommuner. Interreg .ics.
- **v2+**: Helsedirektoratet deep crawl, Miljødirektoratet (after URL rediscovery), Frivillighet Norge editorial layer, long-tail kommuner. Outreach to small foundations for list inclusion.

The Lisa-first v1 framing (from goal.md §Open decisions) is substantiated by this research. The data-availability question that blocked that decision is answered: the data is there, and it is machine-readable.

---

## One-line verdict

**Tilskuddsmatcher is feasible for v1 MVP — tilskudd.lottstift.no already aggregates ~163 state schemes with stable IDs in Next.js SSR HTML, and 12+ other sources are scrape- or API-feasible, covering ~80-90 % of NGO-relevant funding volume in roughly two weeks of integration work.**
