# Samfunnspuls ingest plan — full coverage

Plan to ingest every one of the 24 upstream sources identified in the Samfunnspuls investigation. This is the execution tracker for *"Atlas reproduces everything Samfunnspuls shows — from the canonical upstream sources, with more granularity, organisation-neutral, and visually inspectable."*

Authoritative source inventory is `data-sources.md` in this folder; this plan sits on top of it. Update the **Progress tracker** at the bottom as work completes.

---

## Goal

Every source in `data-sources.md` either:

- lands in `raw.*` via an ingest module, a dbt model, and tests, **or**
- is deliberately deferred with an explicit reason recorded in its catalogue entry's `atlas_decision` field.

No source stays in limbo. Every source either ships or is ruled out on the record.

---

## Scope: 24 sources, current status

Breakdown as of the latest commit:

| Tier | Count | Examples | Status |
|---|---|---|---|
| **Ingested already** | 4 | ssb-08764, ssb-12944, ssb-07459, ssb-06913 | ✅ done |
| Tier 1 — Easy SSB statbank | 9 | ssb-06947, ssb-06083, ssb-09429, ssb-12292, ssb-12063, ssb-13995, ssb-13006, ssb-12131, ssb-12132 | 🔲 todo |
| Tier 2 — Bespoke SSB | 1 | ssb-spesialbestilt-bosted-husholdning | 🔶 needs investigation |
| Tier 3 — HTML scrape (Udir) | 4 | udir-elevundersokelsen, udir-fravar, udir-sluttet-vgs, udir-grunnskoler | 🔲 todo |
| Tier 3 — HTML + Excel (IMDi) | 3 | imdi-bosetting, imdi-innvandringsgrunn-kjonn, imdi-landbakgrunn | 🔲 todo |
| Tier 4 — Other JSON providers | 2 | nav-helt-ledige, brreg-frivillighetsregisteret | 🔲 todo |
| Tier 5 — Partner/internal access | 1 | rk-internal-medlemmer-frivillige | 🔶 needs access decision |

**Total new work**: 20 sources. Rough overall estimate: **15–18 hours** of focused development across 5 phases, plus follow-up polish.

---

## Execution phases

Ordered for maximum ROI per session: easy wins first (to broaden the map before proving framework), then the stretches.

### Phase 1 — 9 easy SSB sources (~4 hours, single or split session)

All Tier-1 sources use the existing `lib/pxweb.ts`. Each source module is ~95 % copy-paste from `ssb-08764/` or `ssb-06944/`; the variation is dimensions and content-code semantics.

**Deliverables per source**:

- `migrations/NNN_raw_<id>.sql`
- `ingest/src/sources/<id>/index.ts` + `README.md`
- `dbt/models/indicators/indicators__<id>.sql`
- `sources.yml` + `schema.yml` entries
- npm script + sources/README.md table entry
- Fact-layer inclusion (with appropriate filter if the source has extra dimensions like age or household type)
- Catalogue entry moved from `evaluate_later` → `adopt_v1_core` (or otherwise documented)

**Suggested execution order** (within the phase):

| Order | Source | Rationale |
|---|---|---|
| 1 | `ssb-13995` | Social-assistance recipients — strong welfare signal, cleanest shape |
| 2 | `ssb-06947` | Adult poverty (complements 08764 child poverty) |
| 3 | `ssb-06083` | Family types — enables single-parent share overlay |
| 4 | `ssb-12292` | Nursing home + home care — opens elder-care theme |
| 5 | `ssb-12063` | Municipal youth-leisure investment |
| 6 | `ssb-09429` | Education level — socioeconomic baseline |
| 7 | `ssb-13006` | Average duration on social assistance |
| 8 | `ssb-12131` | Social-assistance monthly rates |
| 9 | `ssb-12132` | Social-assistance benefit rules |

**Likely quirks**:

- Most tables have `elimination=false` on ContentsCode/Tid like `ssb-07459`. Our ingest supports explicit filters — each source picks its own.
- Some have extra dimensions (household type, age group) — filter to the "all" category in the fact model.
- Region codes may follow the XX99 aggregate pattern or include special codes (Svalbard 21xx, etc.). Same treatment as `ssb-06944`.

**Commit strategy**: one commit per source, or batch of 3. Each commit stands on its own with `npm run typecheck` + dbt run/test green.

**Exit criteria for Phase 1**:

- 9 new indicator models, all in `fact_kommune_indicators` (or documented why not).
- `/data` explorer shows all 9 automatically.
- All dbt tests pass (warns on known Svalbard-style mismatches are OK).
- No `evaluate_later` entries among the Phase-1 sources remain.

---

### Phase 2 — Bespoke SSB investigation (~1 hour)

**Source**: `ssb-spesialbestilt-bosted-husholdning` — overcrowded housing for children.

This one Samfunnspuls got via a special SSB order. It's a headline Samfunnspuls indicator (children under 18 in overcrowded housing) but may not be directly available via a public statbank table.

**Action**:

1. Search SSB for an equivalent **public** statbank table that matches the content (search terms: "trangbodd", "boforhold barn", "husholdning barn"). Candidates: SSB tables 13143, 11527, 11598 or similar.
2. If a public table exists → treat as an additional Phase-1 item (copy-paste SSB pattern).
3. If no public table exists → document in the catalogue entry (`atlas_decision: reject`, `reject_reason: no public API equivalent`). Consider FHI's `Trangbodd_*` tables (794/795 observed earlier) as a substitute.

**Exit criteria**:

- Either one more source ingested, or a documented decision to use FHI as substitute.
- Catalogue entry updated.

---

### Phase 3a — Udir scraper (~4 hours)

Udir publishes kommune-level education data via Skoleporten (HTML-driven pages) rather than a public JSON API. Four sources in the catalogue all flow through the same backend.

**Strategy**:

1. **Investigate once**, build once. The first source takes the most time; subsequent sources reuse the client.
2. Discover whether Skoleporten has an undocumented internal API (they often do — Next.js / Angular apps usually have a `/api/` backend). Prefer it over HTML scraping.
3. If no usable API, use `cheerio` or an HTML table parser. Add `cheerio` to `ingest/package.json`.

**New shared code**:

- `ingest/src/lib/udir.ts` — client/scraper
- `ingest/src/lib/html-scrape.ts` — generic cheerio wrappers if not already there

**Sources** (after the first, each takes ~30–45 min):

| Order | Source | What it adds |
|---|---|---|
| 1 | `udir-elevundersokelsen` | Bullying (mobbing) + home-school support — new theme: youth welfare |
| 2 | `udir-fravar` | School absence in gsk 10 + vgs — dropout proxy |
| 3 | `udir-sluttet-vgs` | Upper-secondary dropout rate — top-tier youth-outcome signal |
| 4 | `udir-grunnskoler` | School count + pupil count — denominator for the three above |

**Exit criteria**:

- All 4 Udir sources ingested or documented as blocked (if Skoleporten changes during work).
- New `lib/udir.ts` library in place.
- Youth-welfare and education themes visible in `/data`.

---

### Phase 3b — IMDi scraper (~3 hours)

Three sources, all integration-related, all served as HTML + Excel downloads on `imdi.no`.

**Strategy**:

1. First source: build `lib/imdi.ts` + add Excel-parsing dep (`xlsx` from SheetJS, ~2 MB) to `ingest/package.json`.
2. Confirm each source's download URL pattern — IMDi publishes annual workbooks at stable URLs.
3. Normalise Excel cells into typed rows before writing.

**Sources**:

| Order | Source | Content |
|---|---|---|
| 1 | `imdi-bosetting` | Refugee settlement per kommune (request/decision/actual) |
| 2 | `imdi-landbakgrunn` | Immigrants by country of origin |
| 3 | `imdi-innvandringsgrunn-kjonn` | Immigrants by reason of immigration × sex |

**Exit criteria**:

- All 3 IMDi sources ingested.
- Integration theme covered in `/data`.
- `lib/imdi.ts` + `xlsx` dep documented.

---

### Phase 4 — Other JSON providers (~3 hours)

Two more providers, each a single source, each with its own client.

**Source**: `nav-helt-ledige` (monthly unemployment)

- Investigate NAV's data API. Likely endpoints: `data.nav.no`, `api.nav.no`, or `arbeidsmarked.nav.no/statistikk-og-analyse`. Monthly granularity.
- Build `lib/nav.ts` if a clean JSON API exists; otherwise fall back to scraping their statistics page.
- Note: `ingest/src/sources/nav-helt-ledige/` will be our first monthly-cadence source. Row structure changes — consider `month` column instead of `year`.

**Source**: `brreg-frivillighetsregisteret`

- Clean public JSON API at `https://data.brreg.no/frivillighetsregisteret/`.
- Pagination required (tens of thousands of orgs). Pattern: `?page=N&size=100`.
- Different semantics: **registry records**, not indicator measurements. New `dim_orgnr` + `dim_frivillighet_orgtype` dimensions.
- Opens up future NGO chapter work.

**Exit criteria**:

- 2 new sources ingested.
- First monthly-cadence source working (NAV).
- `dim_orgnr` built or partially seeded.
- Brreg verified at scale (thousands of rows, pagination working).

---

### Phase 5 — Red Cross internal (~uncertain, probably a separate negotiation)

**Source**: `rk-internal-medlemmer-frivillige`

Samfunnspuls sources this from Red Cross's own annual-report data. Two paths:

1. **Partner feed**: ask Red Cross for a CSV drop / Google Sheet / simple API. Clean ingest after that.
2. **Public annual reports**: parse their annual-report PDFs. Fragile.

**Action**: before starting ingest, decide access model via a conversation with Red Cross. Park this phase until then.

**Exit criteria**:

- Either access secured + one source ingested, or decision documented as `atlas_decision: evaluate_later` (comparable data available from Brreg/Lottstift, wait for a direct feed).

---

## Supporting work that runs alongside

### Per-source
- Catalogue entry in `data-sources.md` updated (`atlas_decision`, `verified_on`, `latest_year`, any newly discovered quirks).
- README.md in the source folder with the 9 required sections per CONTRIBUTING.md.
- `sources/README.md` table row added.
- Canonical vocabulary extended in `naming-conventions.md` if a new concept appears (e.g. `innvandringsgrunn`, `unemployment_rate`).

### After each phase
- Re-read `/data` explorer for each new indicator — any that look visually wrong need investigation before marking "done".
- `dbt docs generate` to update the lineage graph.
- One commit per phase (or per source, depending on size) with its own clear message.

### End-of-project
- Update Samfunnspuls `research-plan.md` status to reflect full completion.
- Move Samfunnspuls `atlas-integration.md` deliverable from "pending" to "written".
- Consider migrating the top-level `docs/research/data-sources.md` to the new schema (promotion step noted in `data-source-schema.md`).

---

## Open questions

1. **Which Tier-1 sources don't belong in `fact_kommune_indicators`?** The social-assistance-rates table (`ssb-12131`) is more a kommune policy attribute than an indicator. Decide per source during Phase 1.
2. **Are HTML scrapes legally safe to run on a schedule?** Udir and IMDi both publish openly. Check for `robots.txt` restrictions and reasonable crawl rates. Unlikely to be a problem but worth a 10-minute check.
3. **Should `dim_orgnr` be its own phase?** If Brreg's Frivillighetsregisteret is large enough, we might want to dedicate a session to building the org dimension properly (with NACE, ICNPO classification, founding date, etc.) rather than just ingesting the list.
4. **Monthly data in `fact_kommune_indicators`**: NAV's monthly unemployment doesn't fit the current (region, year, contents, value) shape. Two options: (a) keep `year` column but use the latest month's value, or (b) add `period` text like we did for `ssb-12944`. Decide before Phase 4.
5. **When to back-fill history** for the 4 already-ingested sources? All our SSB sources currently pull latest-year only. Extending to full series is a separate project; probably after all 24 are at "latest only".

---

## Success criteria

- All 20 remaining sources either ingested (catalogue `atlas_decision ≠ evaluate_later`) or formally rejected with reason.
- `/data` explorer lists every viable source.
- `fact_kommune_indicators` contains all sources that fit kommune-level indicator shape.
- No dbt test **errors**. Warns are acceptable for documented quirks (historical codes, Svalbard etc.).
- Each source has a README with the 9 CONTRIBUTING.md sections.
- Samfunnspuls-equivalent coverage reached: whatever the reference site shows, Atlas shows — plus extras (multiple providers, data-quality explorer, explicit attributions).

---

## Progress tracker

Update this table as sources complete. Shape:

- ✅ Ingested + visible in `/data`
- 🟡 Ingested, quality issue or mart-exclusion documented
- ❌ Rejected, reason in catalogue
- 🔲 Not started
- 🟠 In progress

### Pre-existing (before this plan)

| Source | Status | Phase | Notes |
|---|---|---|---|
| `ssb-08764` | ✅ | pre | Child poverty (EU-60) |
| `ssb-12944` | ✅ | pre | Persistent low income |
| `ssb-07459` | 🟡 | pre | In raw, not yet in `fact_kommune_indicators` (needs sex+age aggregate) |
| `ssb-06913` | ✅ | pre | Population change |

### Phase 1 — Easy SSB

| Source | Status | Notes |
|---|---|---|
| `ssb-13995` | 🔲 | Social-assistance recipients |
| `ssb-06947` | 🔲 | Adult poverty (EU-60) |
| `ssb-06083` | 🔲 | Family types |
| `ssb-12292` | 🔲 | Nursing home + home care |
| `ssb-12063` | 🔲 | Municipal youth leisure |
| `ssb-09429` | 🔲 | Education level |
| `ssb-13006` | 🔲 | Avg duration on social assistance |
| `ssb-12131` | 🔲 | Social-assistance rates |
| `ssb-12132` | 🔲 | Social-assistance benefit rules |

### Phase 2 — Bespoke SSB

| Source | Status | Notes |
|---|---|---|
| `ssb-spesialbestilt-bosted-husholdning` | 🔶 | Needs investigation; may substitute with FHI `Trangbodd_*` |

### Phase 3a — Udir

| Source | Status | Notes |
|---|---|---|
| `udir-elevundersokelsen` | 🔲 | First Udir — builds `lib/udir.ts` |
| `udir-fravar` | 🔲 | |
| `udir-sluttet-vgs` | 🔲 | |
| `udir-grunnskoler` | 🔲 | |

### Phase 3b — IMDi

| Source | Status | Notes |
|---|---|---|
| `imdi-bosetting` | 🔲 | First IMDi — adds `xlsx` dep |
| `imdi-landbakgrunn` | 🔲 | |
| `imdi-innvandringsgrunn-kjonn` | 🔲 | |

### Phase 4 — Other JSON providers

| Source | Status | Notes |
|---|---|---|
| `nav-helt-ledige` | 🔲 | First monthly-cadence source |
| `brreg-frivillighetsregisteret` | 🔲 | Builds `dim_orgnr` |

### Phase 5 — RK internal

| Source | Status | Notes |
|---|---|---|
| `rk-internal-medlemmer-frivillige` | 🔶 | Awaiting Red Cross access decision |

---

## How to execute a single source (quick reference)

Per [`../../../atlas-data-repo/CONTRIBUTING.md`](../../../atlas-data-repo/CONTRIBUTING.md), 11 steps in order:

1. Catalogue entry fields filled (`data-sources.md`).
2. Upstream probe (dimensions, row count, filter requirements).
3. Raw migration.
4. Ingest module (`index.ts` + `README.md`) under `ingest/src/sources/<id>/`.
5. npm script added.
6. `ingest/src/sources/README.md` row added.
7. dbt `sources.yml` entry.
8. dbt `indicators__<id>.sql` model.
9. dbt `schema.yml` with column descriptions + tests.
10. Run: `npm run typecheck && npm run migrate && npm run ingest:<id> && dbt run && dbt test`.
11. Commit with `Add <source-id> (<summary>)`.

Then (for this plan): update this file's progress table.
