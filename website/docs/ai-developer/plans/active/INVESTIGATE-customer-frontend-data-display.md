# Investigate: `/data` shows everything that isn't gated

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active (PLAN-007 phase 2 shipped; phase 3 in progress)

**Goal**: Reframe what the customer frontend's `/data` displays. Today it shows the 9 curated `api_v1.*` endpoints — a small slice of the data Atlas actually holds. Atlas is a *play-with-the-data* platform, so the rule is: **open by default; only data explicitly defined as gated is hidden**. Plus an explicit requirement: a per-source list with last-ingestion timestamps. Output is the implementation shape (PostgREST schema exposure, grants, frontend layout) — not the implementation itself (a follow-on PLAN handles that).

**Last Updated**: 2026-05-05 (status flip + count refresh + add `eu_theme` and `dimensions:` to namespace narrative now that PLAN-007 phase 2 has shipped)

**Origin**: After PLAN-005 shipped, terje observed that `/data` shows just the 9 `api_v1.*` endpoints, a small fraction of what Atlas has. He set the architectural rule: *"Atlas is a place everyone can play with data. Unless we specifically define the data to be behind login, it is open and should be visible for the user on the `/data` path."* Plus: *"we must list all data sources we ingest and when we ingested them."*

This INVESTIGATE settles how to deliver both.

---

## The principle: open by default

Atlas's data layer is **whitelist-private, not whitelist-public**. The default for every table and view is "public, queryable via the API"; only data explicitly tagged for auth-gated access (today: `private_marts.*` — Red Cross FRR resources covered by [INVESTIGATE-private-atlas-deployments.md](INVESTIGATE-private-atlas-deployments.md)) stays hidden.

The previous INVESTIGATE-frontend-data-access-architecture established `api_v1.*` as a curated stable contract surface. That doesn't go away — it remains the recommended endpoint set for production consumers who want versioned guarantees. But it's no longer the *only* thing visible on `/data`. The principle changes from "expose only the curated set" to "expose everything; mark some endpoints as the stable contract."

---

## What's in atlas_db today

Counts as of 2026-05-05 (catalogue is **38 sources, growing** — the FHI-onboarding wave between 2026-04-30 and 2026-05-04 added 17 sources; the cloud-agent pipeline opened 2026-05-04 will keep adding more). Treat the numbers below as a snapshot, not a fixed target — the architecture has to absorb growth without per-row UX changes.

| Schema | Contents | Currently exposed via PostgREST? | New posture |
|---|---|---|---|
| `api_v1` | 9 wrapper views (the stable contract) | yes | yes — keep, unchanged |
| `marts` | ~50 dbt models — 5 `dim_*`, 2 `fact_*`, ~38 `indicators__*` (one per ingest source), 7 `supply__*`, 9 `mart_*` (the underlying tables `api_v1` wraps), plus `_sources_manifest` / `_sources_dimensions` / `eu_data_theme` seeds (private, prefixed `_`). | no | **yes — expose** (`_*` prefixed seeds stay internal) |
| `raw` | 38 ingest tables — verbatim landings from SSB / FHI / Red Cross / Brreg, plus `raw.ingest_runs` (operational run log; tracks `upstream_updated_at`) and `raw.sitemap_log` (scraping-side discovery state). | no | **yes — expose** |
| `private_marts` | 4 FRR resource tables containing personal data | no | **stay private** — auth-gated, separate concern |

Net effect for external consumers: ~80 endpoints become queryable instead of 9, growing as new sources land. None of them contain personal data; everything is sourced from public providers. Pagination (already built into the customer frontend) handles the row-count growth.

---

## Sources list — explicit requirement

A first-class list of "what Atlas ingests, and when" is non-negotiable. One row per upstream ingest source with:

- **Source ID** (e.g. `ssb-08764`, `fhi-bor-alene`, `redcross-branches`)
- **Provider** (SSB / FHI / Røde Kors / Brreg)
- **Upstream URL** (the canonical link external developers should follow if they want the original data)
- **Latest successful ingest timestamp** (from `raw.ingest_runs` — already populated by every ingest module)
- **Row count** in the corresponding `raw.<source_id>` table
- **Downstream models** (the `marts.*` and `api_v1.*` derived from this source)

This becomes a dedicated `/data/sources` view *and* a queryable endpoint (`api_v1.meta_sources` so external consumers can also fetch it programmatically — same dogfood discipline as the rest of the API).

### What we're starting from — not zero

Atlas already has the substrate. Three artefacts exist; the gap is the join.

| Artefact | Where it lives today | What it gives us |
|---|---|---|
| **Hand-maintained Markdown registry** of all 20 implemented sources | [`atlas-data/ingest/src/sources/README.md`](../../../../../atlas-data/ingest/src/sources/README.md) | Source ID + provider + one-line description + npm-run command + notes. Source of truth for the static metadata today, just unstructured. |
| **Per-source READMEs** (20 of 21 sources have one) | `atlas-data/ingest/src/sources/<id>/README.md` | Richer per-source notes: implementation, schema quirks, observed issues. Free-form prose — not a registry, but useful provenance for the upstream URL + description fields. |
| **`raw.ingest_runs` table** (already populated, queryable) | atlas_db | One row per ingest invocation: `source_slug`, `started_at`, `finished_at`, `exit_code`, `rows_scraped`, `rows_parsed`, `warnings_count`, `errors_count`, `notes`. Both timestamp and row-count fields the sources list needs are already here, just not joined to source-level metadata or exposed via PostgREST. |
| **`atlas-data/dbt/models/indicators/sources.yml`** | dbt project | 17 declarations of `raw.*` indicator tables as dbt sources, with column-level descriptions. Subset only — doesn't include redcross-branches, ssb-klass-*, frr. |

What's missing is a **single queryable shape** that joins the static metadata (provider / upstream URL / description, today as Markdown) with `raw.ingest_runs` aggregates (already in the DB) and dbt lineage (in `target/manifest.json`). Building that join is the work.

---

## Decisions to resolve

### [Q1] What gets exposed via PostgREST in addition to `api_v1`

- **`marts`** — yes. Every dbt-built model becomes queryable: `dim_kommune`, `fact_kommune_indicators`, `indicators__ssb_08764`, `supply__redcross_branches`, etc. ~31 endpoints.
- **`raw`** — yes. The 21 verbatim ingest tables plus `raw.ingest_runs` and `raw.sitemap_log`. ~23 endpoints.
- **`private_marts`** — **no.** Stays gated. When auth lands (separate plan), this gets a different role-pair.
- **Implementation**: change PostgREST's `PGRST_DB_SCHEMAS` env var from `api_v1` to `api_v1,marts,raw`. Plus `GRANT USAGE ON SCHEMA marts, raw TO atlas_web_anon` and `GRANT SELECT ON ALL TABLES IN SCHEMA marts, raw TO atlas_web_anon` (matching the existing `ALTER DEFAULT PRIVILEGES` clause UIS already wires up for `api_v1`).
- **Owner**: change is in UIS's configure-postgrest handler — needs cross-repo coordination via talk.md.

### [Q2] Promote the static metadata from Markdown into structured data — where?

The Markdown table at `atlas-data/ingest/src/sources/README.md` is the today-source-of-truth for static metadata. To join it with `raw.ingest_runs` and lineage, it has to become structured data dbt can read.

Two layouts:

- **(a) Per-source `manifest.yml`** in each `atlas-data/ingest/src/sources/<id>/` folder. Co-located with the ingest module's `index.ts`, README, and migration. One file per source; each file owns its own provider / upstream URL / description / category. Discoverable next to the code; deletable in lockstep with the code if a source is retired.
- **(b) Single central `atlas-data/ingest/src/sources/registry.yml`** — every source listed in one file. Easier to read top-down but loses the co-location property.

- **Recommendation**: **(a) per-source `manifest.yml`**. Matches Atlas's existing convention of putting code, README, and migrations alongside the source folder. Adding a 22nd source means adding a new folder with `index.ts` + `README.md` + `manifest.yml` — one place, all related artefacts. Retiring a source is a single `git rm -r`.

### [Q3] How does the frontend get the joined data?

Once metadata is structured, the join lives in dbt:

- A small dbt model `marts.meta_sources` reads the per-source `manifest.yml` files (loaded as a dbt seed via a tiny Python script that scans `atlas-data/ingest/src/sources/*/manifest.yml`), joins them to `raw.ingest_runs` aggregates (latest successful timestamp, total invocations, last row count), and adds dbt lineage (`select count(*) from manifest.json.parents WHERE source = X`).
- Wrap as `api_v1.meta_sources` via the existing PLAN-004 generator.
- Customer frontend fetches `api_v1.meta_sources` for the Sources tab — same introspection-driven shape as every other endpoint. No new dependency; the existing OpenAPI codegen picks up the new endpoint.

This satisfies the dogfood discipline (the metadata is itself queryable via the same API external consumers use) and the forkability constraint (no `atlas-data/` import in `atlas-frontend/`).

### [Q4] How is `/data` grouped — multi-namespace tags

With ~80 endpoints today and continuous growth (each new ingest source lands ≥ 1 raw + 1 indicators mart + 1 api_v1 wrapper), hard-coded tabs (Sources / API / All) won't scale. They also force a hierarchy where the data is genuinely multi-dimensional: a source like `ssb-08764` is at once an SSB pull, an income topic, a kommune-level dataset, and a stable annual cadence — pinning it under one tab loses the other dimensions.

**The shape**: each source / endpoint carries an array of tags from multiple namespaces. The customer frontend renders them as pills, lets users filter by any combination via URL-encoded selections, and derives the filter sidebar from observed tags. Adding a new namespace anywhere makes it appear automatically.

**Six tag namespaces**:

| Namespace | Examples | Where it comes from |
|---|---|---|
| `provider:` | `ssb`, `fhi`, `redcross`, `brreg`, `folkehjelp` | per-source `manifest.yml` (declared) |
| `topic:` | `income`, `education`, `health`, `demographics`, `ngo-supply`, `reference` | per-source `manifest.yml` (declared, curated) |
| `geo:` | `kommune`, `fylke`, `national`, `bydel` | per-source `manifest.yml` (declared) |
| `cadence:` | `annual`, `quarterly`, `irregular`, `one-shot` | per-source `manifest.yml` (declared) |
| `eu_theme:` | `AGRI`, `ECON`, `EDUC`, `ENER`, `ENVI`, `GOVE`, `HEAL`, `INTR`, `JUST`, `REGI`, `SOCI`, `TECH`, `TRAN` | per-source `manifest.yml` top-level field (added in PLAN-007 phase 2.10); aligns Atlas with Felles datakatalog / DCAT-AP-NO. Auto-derived from `topic:` by `fill-manifest-todos.ts`. Lookup table at `seeds/sources/eu_data_theme.csv`. |
| `layer:` | `raw`, `indicator`, `dim`, `fact`, `supply`, `mart`, `api-v1` | derived from the schema + dbt model path; not declared |

A source has 1 tag per namespace except `layer:`. Derived endpoints (in `marts.*`, `api_v1.*`) inherit the source's tags via dbt lineage and add their own `layer:` tag.

**Plus a `dimensions:` block** (added in PLAN-007 phase 2.11) — a hand-authored list of `{code, meaning, value_format, notes}` per upstream dimension on each source. This is editorial semantic content the catalogue can't compute (e.g. *"FHI's `ALDER='1_6'` is the Ungdata cohort identifier — verify against Ungdata methodology"*). Phase 3's `mart_meta_dimensions` joins this seed with computed cardinality + example values from `raw.*` introspection so the customer frontend can render "what each column means × what values it actually contains" in one place.

**UX shape on `/data`** (single page, no tabs):

- Filter sidebar on the left: namespace-grouped checkboxes. Each checkbox shows the count of matching endpoints (e.g. `topic: income (8)`).
- Endpoint cards on the right: each card shows tag pills below the description. Clicking a pill adds it to the active filter set.
- URL-driven: `/data?tag=topic:income&tag=geo:kommune` is bookmarkable and shareable. No filters = show everything.
- Free-text search input above the cards (already in the current `/data` design — keep it; searches title + description).
- No fixed defaults. A first-visit user sees every public endpoint; the sidebar tells them how to slice. Users with link bookmarks land on their preset.

**Why this beats the previous three-tab proposal**:

- The "Sources" view is just `?tag=layer:raw` (or no `layer:` filter — sources are the entries that produce raw data).
- The "API" view is just `?tag=layer:api-v1`.
- The "All endpoints" view is the no-filter default.
- Plus everything in between (e.g. `?tag=topic:education&tag=layer:mart` — mart-level education data) which tabs can't express.
- Adding a new namespace (say `quality:` or `freshness:`) is one column in `manifest.yml` and one new sidebar group — no UX redesign.

Tag taxonomy maintenance: keep it lightweight. A new tag value is just a new string in a `manifest.yml`. Periodic curation (consolidating near-duplicates, retiring unused tags) happens once a quarter or whenever someone bumps into messiness — not a structured governance process.

**Recommendation**: tag-driven single page as described. Tabs were the previous draft's answer; tags are the smarter shape the user asked for.

---

## What this INVESTIGATE explicitly does NOT decide

- The auth story for `private_marts.*` — covered by [INVESTIGATE-private-atlas-deployments.md](INVESTIGATE-private-atlas-deployments.md); when that lands, this catalog will gain a fourth (gated) tab automatically.
- Detailed UX (column ordering, filtering, mini-charts on the source cards) — left for the follow-on PLAN.
- Whether to add column-level descriptions to `raw.*` tables — they currently aren't documented since dbt-osmosis only runs on `marts.*`. Open question; lean toward "no, raw is verbatim upstream — see the upstream's docs via `meta_sources.upstream_url`."
- Lineage visualisation (mermaid graph of source → marts → api_v1) — out of scope for v1; the meta_sources `derived_from` field can list model names without rendering a graph.

---

## Recommended outcome

1. **Expose more schemas via PostgREST**: extend `PGRST_DB_SCHEMAS` to `api_v1,marts,raw` (cross-repo coordination with UIS contributor). `private_marts` stays excluded. UIS's existing `ALTER DEFAULT PRIVILEGES` clause auto-grants SELECT on new tables added to those schemas, so future ingest sources / dbt models flow through automatically — no further UIS touch.
2. **Promote the existing Markdown registry to per-source `manifest.yml`**: one YAML file per source folder (`atlas-data/ingest/src/sources/<id>/manifest.yml`) carrying the static metadata (provider, upstream URL, upstream identifier, description) **plus four declared tag namespaces** (`provider:`, `topic:`, `geo:`, `cadence:`). The current Markdown table at `atlas-data/ingest/src/sources/README.md` becomes auto-generated from the YAMLs.
3. **Add `marts.meta_sources` dbt model**: joins the per-source YAMLs (loaded as a dbt seed via a tiny scan-and-emit Python script) with `raw.ingest_runs` aggregates (latest successful timestamp, total invocations, last row count), declared tags, and dbt lineage (count of downstream models per source). Wrap as `api_v1.meta_sources` via the PLAN-004 generator.
4. **Add `marts.meta_endpoints` dbt model**: one row per queryable endpoint across `api_v1` + `marts` + `raw`, with tags derived two ways — inherited from the source(s) it derives from (via dbt lineage) plus a `layer:` tag derived from schema + folder. Wrap as `api_v1.meta_endpoints`.
5. **Single tag-driven page at `/data`**: filter sidebar (namespace-grouped checkboxes; auto-discovered from `meta_endpoints.tags`), endpoint cards on the right, URL-encoded filter state. No fixed tabs. Free-text search retained from the current design.
6. **Per-source detail page** at `/data/sources/[source_id]`: card listing source metadata + the chain of derived models with click-throughs to each.

The follow-on PLAN-007 ships in roughly five phases:

1. **UIS-side schema exposure**: cross-repo coordination + UIS PR. Atlas's `atlas-postgrest` instance starts serving `marts.*` and `raw.*` alongside `api_v1.*`. Verify with `curl api-atlas.localhost/dim_kommune?limit=3` and similar.
2. **Sources registry promotion + tagging**: write a `manifest.yml` for every source folder, lifting fields from `atlas-data/ingest/src/sources/README.md` and the per-source READMEs, plus a first pass at `provider/topic/geo/cadence/eu_theme` tags + a hand-authored `dimensions:` block. Add a small Python helper in `atlas-data/dbt/scripts/` (`build_sources_seed.py`) that emits dbt seed CSVs from the YAMLs (one row per source for `_sources_manifest`, one row per source × dimension for `_sources_dimensions`). Convention for new sources documented in `ingest-modules.md` + `AGENT-onboard-source.md` runbook for the cloud-agent pipeline. **Phase 2 shipped 2026-05-04 covering 38 sources (21 initial + 17 from the FHI onboarding wave); the `eu_theme` field and `dimensions:` block were added during Phase 2 as schema extensions.**
3. **`marts.meta_sources` + `marts.meta_endpoints` + `marts.meta_dimensions` models**: the joins. `meta_sources` joins manifest seed + `raw.ingest_runs` aggregates + downstream-model count. `meta_endpoints` joins schema/table inventory (via Postgres `information_schema`) + dbt lineage to inherit source tags via the **union** rule. `meta_dimensions` joins the editorial `_sources_dimensions` seed with computed cardinality + example values from `raw.*` introspection. Wrap all three as `api_v1.meta_*` via the PLAN-004 generator.
4. **Customer-frontend rewrite of `/data`**: replace the existing flat catalog with the tag-filter sidebar + cards layout. Filter state in URL. New `/data/sources/[source_id]` detail route. The existing `/data/[endpoint]` table viewer + `/data/[endpoint]/spec` viewer carry forward unchanged.
5. **Docs**: extend the contributor `setup.md` + `ingest-modules.md` to describe the per-source `manifest.yml` and the four declared tag namespaces. Extend `developers/index.md` to describe the tag-filter URL pattern (`?tag=topic:income`) — useful for external developers pulling subsets via the API. Decide on `atlas-data/ingest/src/sources/README.md`: auto-generate from YAMLs (one-way), or replace with a pointer at `api_v1.meta_sources`.

---

## Cross-references

- [INVESTIGATE-frontend-data-access-architecture.md](../completed/INVESTIGATE-frontend-data-access-architecture.md) — established the customer app shape; the open-by-default principle here softens the "only `api_v1.*` is visible" reading of that doc without breaking its forkability rules.
- [PLAN-004-postgrest-api-v1-wrapper.md](../completed/PLAN-004-postgrest-api-v1-wrapper.md) — the auto-generator that wraps `marts.*` into `api_v1.*`. Adding `meta_sources` is a small extension of that pattern.
- [PLAN-005-frontend-split-and-rebuild.md](../completed/PLAN-005-frontend-split-and-rebuild.md) — built the introspection-driven `/data` catalog this INVESTIGATE extends.
- [INVESTIGATE-private-atlas-deployments.md](INVESTIGATE-private-atlas-deployments.md) — sibling concern; auth-gated `private_marts.*` access pattern. When that ships, the open-everything rule here gains its complement.
- [INVESTIGATE-data-freshness-surface.md](INVESTIGATE-data-freshness-surface.md) — sibling; how to surface freshness signals to non-technical personas. The `meta_sources.latest_run_at` field this INVESTIGATE introduces is the queryable substrate that one will visualise.
- [`atlas-data/ingest/src/sources/`](../../../../../atlas-data/ingest/src/sources/) — where the per-source metadata YAML/JSON registry will live.

---

## Next steps

- [ ] User reviews + accepts (or refines) the recommended outcome.
- [ ] Coordinate with UIS contributor on the `PGRST_DB_SCHEMAS` change (talk.md round). UIS-side change is small but cross-repo.
- [ ] On acceptance, draft `PLAN-007-data-display-open-by-default.md` with the four-phase outline.
- [ ] Move this INVESTIGATE backlog/ → active/ when starting; active/ → completed/ when done.

— signed, the Atlas implementation team (via Claude Code agent), 2026-04-30
