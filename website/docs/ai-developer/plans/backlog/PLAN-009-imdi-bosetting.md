# Plan: Ingest IMDi's bosettingstall (refugee resettlement) kommune statistics

Ingests IMDi's kommune-level refugee resettlement figures — requested, decided, settled, and
settled-with-collective-protection counts, per kommune, per year — as a new Atlas source. The
investigation's "no clean open API" claim held up under live verification, but almost everything
else about this source still needed checking directly: licence, file shape, and a real alternative
API lead that turned out not to pan out within reasonable effort. All recorded below.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — unblocked, ready for Phase 2

**Goal**: Add `imdi-bosetting` as a served Atlas source, giving Report #8 (Integration Outcomes
Gradient) the inflow signal it is currently missing — how many refugees a kommune actually
received per year, not just who already lives there.

**Last Updated**: 2026-10-01

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](INVESTIGATE-new-norwegian-public-sources.md) §Tier 1 #5 ([Q14]–[Q16], [Q42]–[Q44])

**Prerequisites**: None — `imdi` is already a valid `publishers.yaml` provider (#486). **[Q1]
(licence) is resolved**: Terje, 2026-10-01 — *"IMDI is ok. we can use it."* That is an
authorization to proceed, not a citation of a specific licence IMDi itself states (this agent still
could not find one on IMDi's own site). `manifest.yml` uses `NLOD` — Atlas's documented default for
Norwegian public-sector sources with no stated licence (`manifest.schema.json`'s own field
description: *"NLOD for Norwegian public-sector sources by default"*) — labelled in the manifest as
an applied default under this authorization, not as something verified on IMDi's page. If IMDi ever
states a different licence, correct the manifest then; don't treat this as settled research.

---

## Problem Summary

Atlas has demographic snapshots of immigrant populations (`fhi-innvkat`, `fhi-innvandrere`) but no
*flow* signal — nothing says how many refugees a kommune received, or when. Report #8 (Integration
Outcomes Gradient) needs exactly that to distinguish a kommune's integration *outcomes* from its
integration *starting conditions*. IMDi's `bosettingstall` (settlement figures) is the authoritative
Norwegian source for this, published annually per kommune since at least 2022.

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-01)

### Tasks

- [x] 1.1 Find where IMDi actually publishes kommune-level bosettingstall, and in what format.
  **Confirmed**: `https://www.imdi.no/bosetting/bosettingstall/` is a hub page linking one page per
  year — `/bosetting/bosettingstall/nokkeltall-bosetting-<YYYY>/` — currently **2022 through 2026**,
  all five live and fetched directly (no guessing a URL pattern that might not hold; every year
  checked was actually a working link on the hub page). Each year's page is **static, server-rendered
  HTML** — no SPA framework, no client-side rendering (checked for `__NEXT_DATA__`/React markers;
  none found; kommune names like "Eigersund" appear directly in the raw HTML response). Simpler to
  scrape than either NAV source — no JS execution needed, no headless browser.

- [x] 1.2 **A real, promising-looking alternative was investigated and did not pan out — recorded so
  it isn't re-chased.** `data.norge.no` has exactly one dataset registered for IMDi (org
  `987879696`, found via the real search API —
  `search.api.fellesdatakatalog.digdir.no/search`, not a generic web search): *"Statistikk om
  innvandring og integrering"*, `isOpenData: true`, with a `text/csv` format hint and a description
  explicitly naming *"bosetting av flyktninger"* as one of its covered topics, plus a reference to a
  **"Statistikkbasen"** tool. That tool is real and live — **IMDikator**, at
  `arkiv.imdi.no/statistikk/`, backed by a dedicated API host
  (`app-simapi-prod.azurewebsites.net`, found via the page's `data-api-host` attribute) and
  currently updated (data as recent as January 2025 seen on the page). **But**: no Swagger/OpenAPI
  docs found at the usual paths, the actual API-calling code loads via a dynamically-injected bundle
  this agent could not locate through static analysis (would need a headless browser to observe the
  real network calls — out of proportion for this plan), and the tool's visible scope (population
  composition, immigration reasons, world regions, residence duration) reads as closer to the
  investigation's **[Q42]/[Q43]** extensions (`imdi-innvandringsgrunn-kjonn`,
  `imdi-landbakgrunn`) than to bosettingstall itself — not confirmed to carry resettlement counts at
  all. **Decision: do not block this plan on reverse-engineering IMDikator.** The
  `data.norge.no`-registered dataset's own catalogue record is also 6 years stale (`modified:
  2020-05-26`), the same kind of staleness that has been wrong before this session (NAV, Bufdir).
  IMDikator is a real, separate lead worth a future investigation for the [Q42]/[Q43] extensions —
  see Implementation Notes — but **this plan does not fold them in**, contradicting the
  investigation's own [Q42] recommendation to combine all three into one PLAN. Named explicitly as a
  deliberate deviation, not an oversight.

- [x] 1.3 Download and inspect the real table structure (sampled 2022, 2025, 2026).
  **Confirmed**: under an `<h2>` heading reading **`Oversikt over bosettingen i kommunene i
  <year>`** (the live 2026 page appends `(oppdatert <date>)` to this heading — match on the fixed
  prefix, not an exact string), one `<table>` per fylke, each with:
  ```
  <th>Kommune</th>
  <th>Antall personer kommunen har blitt anmodet om å bosette:</th>
  <th>Antall personer kommunen har vedtatt å bosette:</th>
  <th>Antall bosatte personer:</th>
  <th>Antall bosatte personer med kollektiv beskyttelse:</th>
  ```
  Four real metrics, not a count/share pair like the Bufdir or NAV sources — **requested, decided,
  settled, settled-under-collective-protection** are genuinely different quantities, not format
  variants of one indicator. See **[Q2]** in Implementation Notes for how this plan represents that.

- [x] 1.4 Confirm the suppression marker, and find its definition. **Confirmed and, unlike every
  prior source this session, IMDi states its own rule inline on the page**:
  *"Enkelte celler i tabellene nedenfor vil ha tegnet **:** Dette betyr at tallet er fjernet av
  personvernhensyn. Det betyr som regel at det er under fem personer i feltet eller at totalsum på
  bosatte minus bosatte fra Ukraina er under fem."* — the literal character `:` means the cell was
  removed for privacy, usually meaning under 5 people in that cell, or that total settled minus
  settled-from-Ukraine is under 5. Worth keeping that exact wording in the manifest's
  `methodology_notes` rather than paraphrasing it away.

- [x] 1.5 **IMDi publishes kommune names only — no kommune code at all, in any year sampled.**
  Genuinely different from every source ingested this session so far (SSB/FHI/Bufdir/NAV all
  publish a code). Atlas already has exactly the tool for this:
  [`crosswalk_kommune_name`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models/dimensions/crosswalk_kommune_name.sql)
  (derived from `dim_kommune`, built for *"resolving free-text municipality strings from upstream
  sources"* — this is precisely that). Its own docstring already warns names aren't globally unique
  pre-2020 (`"Os"` existed in two different fylker) and that ambiguous matches need "additional
  context (postal code, fylke)."

  ⚠️ **That disambiguating fylke context is not reliably available here.** IMDi's own fylke
  groupings are **not stable across the years this plan ingests**: 2022's page groups kommuner under
  the **pre-2024-reform** fylke names (`Troms og Finnmark`, `Vestfold og Telemark`, `Viken` — 11
  fylke sections); 2025/2026 use the **post-reform** 15-fylke scheme. A raw `fylke` column captured
  from the page would itself need a second, year-dependent crosswalk to even become useful as
  disambiguating context — not worth building for a problem that may not materialise. **[Q3]
  Recommendation**: store `kommune_name` only (not fylke) in `raw.imdi_bosetting`; resolve via
  `crosswalk_kommune_name` on name alone at the dbt layer; check empirically during Phase 3 whether
  any of IMDi's actual kommune names collide in the crosswalk (the known collision, `"Os"`, is a
  pre-2020 historical case — confirm whether it even appears in a bosettingstall table before
  building disambiguation logic for a risk that may be theoretical only).

### Validation

✅ Confirmed 2026-10-01. Phase 1 is DONE — five real pages downloaded and inspected directly
(2022/2023/2024/2025/2026 all confirmed live from the hub page), one genuine alternative lead
(IMDikator) chased far enough to make an informed decision not to depend on it.

---

## Phase 2: Ingest module + raw table

### Tasks

- [ ] 2.1 Create `atlas-data/ingest/src/sources/imdi-bosetting/`:
  - `parse.ts`:
    - `discoverYearPages(hubHtml)` — find every `/bosetting/bosettingstall/nokkeltall-bosetting-\d{4}/`
      link on the hub page, dedupe, return as a list of `{year, path}`. Discover, don't hardcode
      2022-2026 — a future year appearing on the hub should be picked up automatically, the same
      "discover, don't guess" philosophy as every prior source's URL discovery.
    - `parseKommuneTables(html, year)` — find the `<h2>` matching
      `/^Oversikt over bosettingen i kommunene i \d{4}/` (prefix match, not exact — see Phase 1.3),
      then every `<table>` between it and the next `<h2>`. For each row: kommune name (first `<td>`)
      + 4 metric cells in the fixed column order confirmed in Phase 1.3. Use `cheerio` (already a
      transitive dependency via `crawlee`; add as an explicit direct dependency rather than rely on
      an undeclared transitive one) — this page is simple, consistent static HTML, a proper parser
      is still safer than regex against markup.
    - `parseCell(raw)` — the literal string `:` → null (IMDi's own suppression marker, see Phase
      1.4); otherwise parse as integer.
  - `index.ts` — fetch hub page → `discoverYearPages` → fetch each year page → `parseKommuneTables`
    → upsert `raw.imdi_bosetting`. Full-table replace per run, same convention as every other source
    this session — v1 re-ingests every discovered year on every run (cheap: 5 pages, no reason to
    diff).
  - `fetch_retry.ts` — copy, adapted header comment.
  - `manifest.yml` — `source_id: imdi-bosetting`, `provider: imdi`, `periodicity: P1Y`,
    `eu_theme: SOCI`, `tags.topic: social`, `license: NLOD` (Atlas's documented default for an
    unstated Norwegian public-sector licence, applied under Terje's 2026-10-01 authorization — see
    **[Q1]** — not a citation of a licence IMDi itself states).
  - `README.md` and `__tests__/` — golden-file tests against real downloaded fixture pages (at least
    one page per fylke-naming era: one pre-2024-reform fylke page like 2022, one post-reform like
    2025/2026, so the fylke-instability finding from Phase 1.5 is actually exercised even though
    fylke itself isn't stored).

- [ ] 2.2 Migration `raw.imdi_bosetting` — columns `kommune_name` (text, verbatim from IMDi — not
  `region_code`, there isn't one), `year`, `metric` (text: `anmodet`/`vedtatt`/`bosatte`/
  `bosatte_kollektiv_beskyttelse` — see **[Q2]**), `value`, `loaded_at`. PK
  `(kommune_name, year, metric)`. No `values_json` — unlike the monthly/multi-year sources, each
  (kommune, year, metric) triple is already a single scalar with nothing to spine across; adding it
  would just wrap one number in JSON for no reason.

- [ ] 2.3 Dagster registration — `cadence.weekly_polled()`/`WEEKLY_FRESHNESS`, same as the Bufdir
  sources (annual data, polled weekly so a new year's page doesn't sit undiscovered for months).

### Validation

```bash
cd atlas-data/ingest && npm test -- imdi-bosetting
```
Golden-file tests pass; a manual run against the live hub page discovers all years currently linked
(5, as of this plan's drafting) and produces a plausible row count (~357 kommuner × up to 5 years ×
4 metrics, fewer for kommuner that didn't exist or weren't asked to resettle in a given year), with
zero rows silently dropped.

---

## Phase 3: dbt staging and marts

### Tasks

- [ ] 3.1 Add `raw.imdi_bosetting` to `sources.yml` — `ingest_cadence: weekly`, freshness matching
  the Bufdir sources' annual-data bounds (400/800 day), not the NAV monthly bounds.
- [ ] 3.2 `indicators__imdi_bosetting.sql` — `kommune_nr` via **`crosswalk_kommune_name`** (a join
  Atlas hasn't needed before — every prior source this session resolved `kommune_nr` from an
  upstream-published code via `classify_region_code`/`region_code_to_kommune_nr`; this is the first
  to resolve it from a bare name instead). **Check empirically (Phase 1.5's [Q3])** whether any
  actual kommune name in the ingested data produces more than one crosswalk match before deciding
  whether disambiguation logic is needed at all.
- [ ] 3.3 Document columns in `schema.yml`; validate against a local Postgres loaded with the real
  ingest, not an empty schema.
- [ ] 3.4 `mart_indicators__imdi_bosetting.sql` api passthrough + `marts/api/schema.yml` entry.
- [ ] 3.5 `dbt build` + `dbt test` — relationship test `kommune_nr` → `dim_kommune`, `not_null` on
  PK columns, `accepted_values` on `metric`.

### Validation

```bash
cd atlas-data/dbt && dbt build --select indicators__imdi_bosetting mart_indicators__imdi_bosetting
```
Against a local Postgres loaded via the real ingest. **Specifically check the `kommune_nr`
relationship test is not silently passing because every row has a null `kommune_nr`** — a
crosswalk join that fails to match anything would look identical to one that succeeds, on a
bare `not_null`-less relationship test; confirm a real, high match rate (expect close to 100% —
flag anything below ~95% as a real defect to investigate, not wave through).

---

## Phase 4: Deploy and verify arrival

Same shape as every prior source's Phase 4 this session: regenerate every drift-gated artifact up
front (budgeted, not discovered via failed CI this time); file the deploy/verification request to
**imac** with both image digests, the derived `LANDS WITH`, and a row-count prediction from the
local validation run; verify arrival independently against the live public API afterward, not the
deploy report alone.

---

## Acceptance Criteria

- [ ] `imdi-bosetting` ingests cleanly from all currently-linked hub-page years with zero rows
  silently dropped.
- [ ] `raw.imdi_bosetting` stores `kommune_name`, not a code — and not a `fylke` column, per
  Phase 1.5's finding that IMDi's own fylke groupings aren't stable across the years ingested.
- [ ] `kommune_nr` resolves via `crosswalk_kommune_name` with a measured, reported match rate — not
  assumed to be 100%.
- [ ] `indicators__imdi_bosetting` and `mart_indicators__imdi_bosetting` build and test clean
  against real loaded data.
- [ ] `imdi-bosetting` appears in `meta_sources.served_as` after a real deploy, independently
  verified via live `curl`.
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped, only once
  Phase 4 confirms rows actually arrived.
- [x] **[Q1] (licence) is resolved — Terje, 2026-10-01: "IMDI is ok. we can use it."** Recorded as
  an authorization, not a citation; see Implementation Notes.

---

## Implementation Notes

- **[Q1] Licence — resolved by authorization, 2026-10-01, not by finding IMDi's own statement.**
  Checked IMDi's bosettingstall page itself (nothing), the page footer (only privacy/accessibility
  links, no data-licence link), a broad web search, and the `data.norge.no` catalogue record for
  IMDi's one registered dataset (`isOpenData: true`, but no licence field present at all). Unlike
  NAV (CC BY 4.0, found on NAV's own stated-terms page) this agent could not find an equivalent
  statement for IMDi, and did not find one afterward either. **Terje: *"IMDI is ok. we can use
  it."*** That authorizes proceeding; it is not a citation of a specific licence IMDi states.
  `manifest.yml` records `license: NLOD` as Atlas's own documented default for an unstated
  Norwegian public-sector licence (per `manifest.schema.json`'s field description), applied under
  this authorization — keep that distinction visible in the manifest's own text (not just here),
  so a future reader doesn't mistake "NLOD" for something verified on IMDi's page. If IMDi
  publishes an explicit licence statement later, correct the manifest then.
- **[Q2] Four distinct metrics, not a count/share pair — modelled as a `metric` long-format
  dimension, matching Atlas's established per-source-indicator convention** (the Bufdir sources
  have 22-24 genuinely distinct indicators and are still modelled long, one row per
  indicator×region×year, not wide columns per indicator). Named `metric`, not `category_format`
  (which the Bufdir/NAV sources use) — these aren't format variants of one quantity, they're stages
  of the resettlement pipeline (requested → decided → settled → settled-with-collective-protection),
  and `category_format` would misdescribe that. Flagged as a resolved-but-debatable decision, not
  silently picked, since a wide 4-column table is the more obvious first instinct for 4 named
  figures and a future reader might reasonably ask why it wasn't done that way.
- **[Q3] Kommune-name collision risk in `crosswalk_kommune_name` is theoretical until checked
  against the real data** — see Phase 1.5 and Phase 3.2. Don't build disambiguation machinery
  speculatively.
- **IMDikator (`arkiv.imdi.no/statistikk/`, API host `app-simapi-prod.azurewebsites.net`) is a real,
  separate lead for the investigation's [Q42]/[Q43] extensions** (`imdi-innvandringsgrunn-kjonn`,
  `imdi-landbakgrunn`) — not chased further here. A future investigation reverse-engineering its
  actual API (likely needs a headless browser to observe real network calls, since the bundle is
  loaded dynamically and no Swagger docs were found) could plug both of those gaps at once, and
  possibly provide a cleaner, coded alternative to the bosettingstall HTML scrape too, if it turns
  out to carry the same resettlement figures — worth checking first before assuming it doesn't.
- **Do not fold `imdi-innvandringsgrunn-kjonn`/`imdi-landbakgrunn` into this plan**, despite the
  investigation's own [Q42] recommendation to do so. That recommendation assumed a shared,
  already-understood data source; Phase 1 found the actual mechanism for those two extensions is
  unconfirmed. Combining them now would mean drafting Phase 2/3 against an unverified foundation —
  exactly the mistake this session's corrections have been about catching, not repeating.

---

## Files to Modify

- `atlas-data/ingest/src/sources/imdi-bosetting/manifest.yml` (new)
- `atlas-data/ingest/src/sources/imdi-bosetting/index.ts` (new)
- `atlas-data/ingest/src/sources/imdi-bosetting/parse.ts` (new)
- `atlas-data/ingest/src/sources/imdi-bosetting/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/imdi-bosetting/README.md` (new)
- `atlas-data/ingest/src/sources/imdi-bosetting/__tests__/` (new)
- `atlas-data/ingest/package.json` (`cheerio` dependency, `ingest:imdi-bosetting` script)
- `atlas-data/migrations/<next>_raw_imdi_bosetting.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (asset registration)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__imdi_bosetting.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__imdi_bosetting.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `imdi` listing)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark shipped)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
