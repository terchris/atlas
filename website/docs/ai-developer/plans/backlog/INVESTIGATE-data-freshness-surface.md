# Investigate: Data freshness surface

> **IMPLEMENTATION RULES:** Before implementing any plan from this investigation, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog

**Goal**: Define how Atlas surfaces data-freshness signals to personas (journalists, kommune case workers, policy analysts) so they can judge whether what they see is timely enough to act on — without overwhelming the page with per-source timestamps.

**Last Updated**: 2026-04-24

---

## Scope

**In scope:**
- Persona use cases for freshness (what decision does "how fresh is this?" support?)
- The contract every mart must expose for freshness (`updated_at`, and whether we also need `source_published_at`)
- The distinction between "load freshness" (when Atlas ingested the row) and "source publication freshness" (when the originating body released the underlying data)
- Aggregation strategy: per-view meta mart vs per-value lookup
- UI surface options (page-level footer, per-value tooltip, coverage-gap badges)
- Stale-tolerance policy — when does "updated 6 months ago" become a visible warning?
- Localization (Norwegian "Oppdatert" vs English "Updated")

**Out of scope:**
- Operator-facing observability — that's `mart_ingest_health` from [`INVESTIGATE-ngo-scraping-infrastructure.md`](../completed/INVESTIGATE-ngo-scraping-infrastructure.md). This investigation is about the *reader-facing* surface, not the ops dashboard.
- SLA guarantees or refresh-cadence decisions per source — cadence is set by the ingest plan for each source.
- Alerting when data goes stale — separate ops concern, now filed as [INVESTIGATE-ingest-freshness-visibility](./INVESTIGATE-ingest-freshness-visibility.md).
- Retroactively backfilling `updated_at` onto sources that don't yet expose it cleanly.

---

## Why this exists

Atlas synthesizes ~24 public-sector sources (SSB, FHI, Brreg, Kartverket, Bufdir, IMDi, NAV, Lottstift, Innsamlingskontrollen, Red Cross, and eventually 9+ more NGOs). Each source refreshes on its own cadence — SSB indicators are monthly/quarterly/annual, FHI is annual, Red Cross is daily, scraped NGO sites are weekly. The kommune detail page at [`app/kommuner/[kommune_nr]/`](https://github.com/terchris/atlas/tree/main/atlas-frontend/src/app/kommuner/) shows all of them together.

A journalist writing about "homework help capacity in Bergen" needs to trust the numbers. A kommune case worker deciding whether to refer a family to a Red Cross chapter needs to know the chapter is actually still running that activity. A policy analyst comparing kommuner on youth mental-health indicators needs to know whether the indicator reflects 2024 or 2019 data.

**Current state:** the plumbing exists — every raw table has a mandatory `loaded_at timestamptz` ([CONTRIBUTING.md:47](https://github.com/terchris/atlas/tree/main/atlas-data/CONTRIBUTING.md)), dbt source freshness is configured via `loaded_at_field`, and the convention is to rename `loaded_at → updated_at` at the mart layer for consumer exposure (CONTRIBUTING.md:143). But **no `.tsx` file in the frontend reads any of it**. Grep confirms: zero UI surface today.

This investigation defines what to build on top of that plumbing.

---

## Section A — Persona use cases

Before designing the surface, what question does freshness answer for each persona?

### A.1 Kari (kommune case worker) — **[Q1]**

Looking at a kommune page to decide whether to refer a family to NGO X's activity Y in kommune Z. Relevant freshness question: **"is the chapter still offering this activity *today*?"** Implies: freshness-at-the-row level for the specific NGO chapter, not for the whole page.

### A.2 Journalist — **[Q2]**

Writing a story comparing two kommuner. Relevant question: **"can I quote this number and stand behind it?"** Implies: per-value provenance (source + publication date), not aggregate page age.

### A.3 Policy analyst — **[Q3]**

Comparing trends across 30 kommuner. Relevant question: **"are all these numbers from the same reference period?"** Implies: `source_published_at` (the statistical reference period), not `updated_at` (when Atlas ingested the row).

### A.4 Casual visitor — **[Q4]**

Browsing "is Atlas a credible source?" Relevant question: **"does this site look stale or actively maintained?"** Implies: a single aggregate number at the page or site level is enough.

### A.5 What this implies

Different personas want different surfaces. The cheap thing is the Q4 answer (site-wide "last updated"); the rich thing is the Q1+Q2+Q3 answers (per-value, source-linked, with publication vs load distinction). Ship the cheap thing first; decide during rollout whether the rich surface earns its complexity.

---

## Section B — Current state: freshness in the data layer

### B.1 Raw layer — **[Q5]**

Every raw table has `loaded_at timestamptz not null default now()` ([CONTRIBUTING.md:47](https://github.com/terchris/atlas/tree/main/atlas-data/CONTRIBUTING.md), mandatory per the checklist at line 220). Confirmed across all existing migrations (`002_raw_ssb_08764.sql` through `021_raw_fhi_vgs_gjennomforing.sql`).

Gap: `loaded_at` is only set at ingest time. It says nothing about when the *source* published the underlying data. For SSB tables, the ingest might run daily while the source only republishes annually — `loaded_at` is misleadingly recent in that case.

### B.2 Mart layer — **[Q6]**

Convention is "`loaded_at as updated_at` (never expose `loaded_at`)" (CONTRIBUTING.md:143). This means `updated_at` is available on marts by convention, but not enforced by schema tests yet.

Verification to do during the real investigation: walk `atlas-data/dbt/models/` and confirm every mart currently exposes `updated_at`. The marts to check are:
- `marts.fact_kommune_indicators`
- `marts.fact_chapter_activities`
- `marts.dim_kommune`, `marts.dim_chapter`, `marts.dim_activity`, `marts.dim_fylke`

### B.3 Ingest-runs layer (from scraping infra)

The scraping investigation ships `raw.ingest_runs (source_slug, started_at, finished_at, exit_code, rows_parsed, ...)`. This is ops-facing but also a natural source of truth for "when did source X last successfully refresh?" — useful for freshness if the row-level `updated_at` proves insufficient (e.g., for sources where nothing changed and thus no row's `updated_at` advanced).

### B.4 What's missing

1. No `source_published_at` column. Every source has one (SSB publishes on a specific date, FHI's folkehelseprofil has a year, Red Cross API returns a timestamp). Currently collapsed into `loaded_at`.
2. No aggregate "freshness for view X" mart. Each view would have to compute it ad-hoc.
3. No frontend component for rendering freshness.
4. No policy for "this is stale enough to warn the user."

---

## Section C — What "freshness" actually means

### C.1 Two different timestamps — **[Q7]**

| Column | Meaning | Example |
|---|---|---|
| `loaded_at` / `updated_at` (mart) | When Atlas ingested this row | 2026-04-23 02:14 UTC |
| `source_published_at` | When the originating body published the underlying data | 2025-11-30 (SSB reference period end) |

For a user asking "is this data current?", the answer is almost always `source_published_at`, not `updated_at`. Atlas can re-ingest the same stale SSB row every night without making the data meaningfully newer.

Proposed contract: every mart exposes **both** columns. `updated_at` for "when did we last touch the pipeline?" (ops signal); `source_published_at` for "when did the source make this data available?" (user signal).

### C.2 Per-source rules for `source_published_at` — **[Q8]**

Different sources have different notions of publication:

- **SSB API tables** — `Tid` column in JSON-Stat gives the reference period; publication date lives in the catalog metadata (`KlassPublication` or similar).
- **FHI folkehelseprofil** — annual publication with a cover year.
- **Red Cross API** — entity-level `updatedAt` or similar.
- **NGO scrapers** — sitemap `lastmod` (per [`INVESTIGATE-ngo-scraping-infrastructure.md`](../completed/INVESTIGATE-ngo-scraping-infrastructure.md) §A.2).
- **Brreg** — `siste_innsending` or event timestamp.

Each ingest adapter must extract this and persist it. Requires a convention (`source_published_at timestamptz nullable` — nullable because some sources genuinely don't say) and backfill for existing sources during rollout.

### C.3 Stale-tolerance varies per source — **[Q9]**

"Stale" is relative to the source's own refresh cadence:

| Source kind | Expected refresh | "Stale" threshold |
|---|---|---|
| SSB annual indicator | yearly | ~18 months since `source_published_at` |
| FHI folkehelseprofil | yearly | ~18 months |
| SSB quarterly/monthly | quarterly/monthly | ~3× cadence |
| NGO scrape (chapter/activity) | weekly | ~30 days since `updated_at` |
| Red Cross API | daily | ~7 days |

Encoding this needs a `ref_source_freshness_policy (source_slug, expected_cadence_days, stale_threshold_days)` table, or per-source metadata. Without it, the UI can only say "last updated 2024-01-01" without context for whether that's alarming.

---

## Section D — Aggregation and API strategy

### D.1 Two aggregation patterns — **[Q10]**

**D.1a Per-view meta mart.** A dbt model `meta_view_freshness` with one row per logical view:

```sql
view_id                   TEXT        -- 'kommune-detail', 'coverage-gap', ...
newest_source_updated_at  TIMESTAMPTZ
oldest_source_updated_at  TIMESTAMPTZ
newest_published_at       TIMESTAMPTZ
oldest_published_at       TIMESTAMPTZ
source_count              INT
stale_source_count        INT         -- per §C.3 policy
```

Pros: one cheap query per page. Works well for page-level footers. Cons: doesn't support per-value tooltips; coupling view_id to dbt feels leaky.

**D.1b Per-value lookup.** Every mart row already carries `updated_at` + `source_published_at`. The frontend just reads them alongside the data. No new mart needed.

Pros: maximum granularity; supports both Q1 (per-row freshness) and Q4 (aggregate over the page's rows). Cons: every Next.js component that renders a value must also render freshness; more UI surface.

**D.1c Hybrid.** Ship D.1b as the contract (every mart carries the columns), compute aggregate in the frontend on demand. Skip the meta mart entirely.

Leaning D.1c — meta marts introduce a coupling between dbt and the view layer that will rot when pages are added or reshaped.

### D.2 API layer — **[Q11]**

How does the Next.js frontend read freshness?

**D.2a PostgREST** — already in the platform stack ([`INVESTIGATE-postgrest.md`](https://github.com/helpers-no/urbalurba-infrastructure/tree/main/website/docs/ai-developer/plans/backlog/INVESTIGATE-postgrest.md) in UIS). The freshness columns come along with the row for free.

**D.2b Bespoke Next.js API route** — `/api/freshness/[view]` returns the aggregate. Extra plumbing, but lets us shape the response.

**D.2c Server Components reading dbt directly** — Next.js RSC with direct Postgres access. Same as D.2a but without the REST hop.

Leaning D.2a or D.2c depending on which the rest of Atlas uses; this is a "match whatever else does." Check [`docs/stack/suggested-stack.md`](https://github.com/terchris/atlas/tree/main/docs/stack/suggested-stack.md) during the actual investigation.

---

## Section E — UI surface

### E.1 Three candidate patterns — **[Q12]**

**E.1a Page footer** — a single line like *"Data oppdatert: 2026-04-23. Eldste kilde: 2024-11-30 (SSB 12063)."* Discreet, always there, answers Q4 trivially and partly answers Q3.

**E.1b Per-value tooltip** — a small ⓘ next to each number. On hover: source, `source_published_at`, `updated_at`, link to source. Answers Q1/Q2/Q3 richly but is invisible unless hovered.

**E.1c Stale badge** — when a value's freshness exceeds the §C.3 threshold, render a visible "⚠ updated 2022" marker inline. Rare, high-signal. Answers "is this specific number untrustworthy?"

Recommend: ship E.1a + E.1c in v1 (footer + stale warning when threshold exceeded), defer E.1b (per-value tooltip) until we see which values users actually drill into.

### E.2 Localization — **[Q13]**

Atlas is a Norwegian-first product. Strings:

- "Data oppdatert" (Updated)
- "Eldste kilde" (Oldest source)
- "Sist publisert av kilden" (Last published by source)
- "⚠ Utdatert: fra {year}" (Outdated: from {year})

Use the existing i18n approach (check `app/` and `src/` during investigation for whether next-intl or similar is in place).

### E.3 Coverage-gap view considerations

The [`app/coverage-gap/`](https://github.com/terchris/atlas/tree/main/atlas-frontend/src/app/coverage-gap/) view is specifically about *missing* supply — absent data. Freshness for an absent row is ambiguous: is the gap real, or is the NGO's scraper just broken? This view needs a different freshness signal: "when was this NGO's source last successfully refreshed, regardless of whether it produced data for this kommune?" That's the `raw.ingest_runs` last-success timestamp — which is the ops signal bleeding into the user surface.

Decide during investigation whether coverage-gap gets special treatment or uses the same footer as everything else.

---

## Section F — Policies and edge cases

### F.1 Sources that don't publish a date — **[Q14]**

Some sources (e.g., a custom NGO HTML page without `lastmod`) have no authoritative `source_published_at`. Options:
- Fall back to `updated_at` (load time) — misleading but honest.
- Leave `source_published_at` NULL and render "publiseringsdato ukjent" in the tooltip.
- Infer from HTTP `Last-Modified` header if present.

Recommend: NULL + explicit "ukjent" in the UI. Never silently substitute load time for publication time.

### F.2 Derived values (dbt transformations) — **[Q15]**

A mart row in `fact_kommune_indicators` might be derived from *multiple* raw sources (e.g., a ratio of two SSB tables). Its freshness is the **minimum** `source_published_at` across the inputs. dbt can compute this, but it requires propagating the column through every join — adds maintenance burden.

Recommend: mandate this propagation as part of the mart contract (the dbt `schema.yml` test catches it). Costly but necessary for honest numbers.

### F.3 Prognose / projected values — **[Q16]**

SSB publishes projections (e.g., SSB 12944 befolkningsfremskrivinger). The "data" is about 2030 but was *published* in 2024. Does "freshness" mean the 2030 reference period or the 2024 publication date? The useful one for the user is 2024 publication, because that says "these projections are based on 2024 assumptions." Encoded as: `source_published_at` = publication date, *not* the reference period the projection targets.

Clarify this in the mart contract so ingest adapters get it consistently.

### F.4 Ingest-failure state — **[Q17]**

If a source's scrape has been failing silently for 3 weeks, `updated_at` on its rows hasn't moved but the data isn't really fresh either — it's just old data nobody notices. This is where `raw.ingest_runs.finished_at WHERE exit_code = 0` becomes the honest freshness signal. Surface it when it diverges materially from `updated_at`.

---

## Open Questions

Numbered in document order above. To summarise the resolvable ones:

- **[Q1]–[Q4]** Which persona is the primary target of v1? Informs which surface (E.1a, E.1b, E.1c) we build first. Recommend: Q4 casual + Q2 journalist → E.1a footer.
- **[Q5]–[Q8]** Do we add `source_published_at` as a mandatory mart column? Recommend: yes, nullable, with per-source adapter rules. Major contract change.
- **[Q9]** Do we build `ref_source_freshness_policy` now or defer? Recommend: defer; ship with a hard-coded 18-month default; promote to table when the default starts misclassifying sources.
- **[Q10]** Meta mart or per-row columns? Recommend D.1c (per-row, aggregate in frontend).
- **[Q11]** Which API path? Depends on existing Atlas stack — verify during investigation.
- **[Q12]** Which UI pattern first? Recommend E.1a + E.1c.
- **[Q13]** Localization strings — defer to i18n convention.
- **[Q14]** NULL vs fallback for missing publication date. Recommend NULL + explicit UI.
- **[Q15]** Derived-value propagation. Recommend mandate via schema test.
- **[Q16]** Prognose semantics. Recommend publication date, not projected reference period.
- **[Q17]** Surface ingest-failure divergence. Open.

---

## Recommendation (preliminary)

Ship the minimum viable trust signal:

1. **Contract:** add `source_published_at timestamptz` to every mart (`updated_at` already there by convention). Enforce with a dbt schema test.
2. **UI:** page footer on every kommune and coverage-gap page: *"Data oppdatert: {max(updated_at)}. Eldste kilde: {min(source_published_at)} ({source_name})."*
3. **Stale warning:** inline "⚠" when any value's `source_published_at` exceeds a hard-coded 18-month threshold. Promote to per-source policy table when 18 months misclassifies a real source.
4. **Defer:** per-value tooltips, meta freshness mart, per-source policy table.

The implementation split is roughly:

- **PLAN-A** — `source_published_at` column contract + ingest-adapter rules + dbt schema test. Infra work, no UI.
- **PLAN-B** — frontend freshness component + footer wiring on kommune and coverage-gap pages.
- **PLAN-C** (deferred) — per-value tooltip + per-source policy table.

---

## Next Steps

- [ ] Verify during real investigation: which existing marts already expose `updated_at`, which don't.
- [ ] Inventory each active ingest adapter for how `source_published_at` would be derived.
- [ ] Decide Q10/Q11/Q12 with the frontend approach (verify stack against [`docs/stack/suggested-stack.md`](https://github.com/terchris/atlas/tree/main/docs/stack/suggested-stack.md)).
- [ ] Draft PLAN-A once the contract is agreed.

---

## Files this investigation will produce

**Schema change:**
- Every `marts.*` table gets `source_published_at timestamptz` (nullable).
- New dbt schema test enforcing presence of `updated_at` + `source_published_at`.

**New dbt (maybe):**
- `ref_source_freshness_policy` — deferred per Q9.

**New frontend code:**
- A shared `<FreshnessFooter />` component and/or a small lib for aggregating freshness across a page's data sources.
- Wiring in `app/kommuner/[kommune_nr]/` and `app/coverage-gap/`.

**Documentation:**
- Extend [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) with `source_published_at` alongside `updated_at`.
- Add a section to [`atlas-data/CONTRIBUTING.md`](https://github.com/terchris/atlas/tree/main/atlas-data/CONTRIBUTING.md) covering per-source rules for deriving `source_published_at`.

---

## Companion investigations

- [`INVESTIGATE-ngo-scraping-infrastructure.md`](../completed/INVESTIGATE-ngo-scraping-infrastructure.md) — produces `raw.ingest_runs`, which is the ops-facing counterpart to this user-facing work. `ingest_runs.finished_at` may surface here for Q17.
