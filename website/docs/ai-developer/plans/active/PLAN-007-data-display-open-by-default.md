# Plan: `/data` shows everything that isn't gated, organised by tags

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active (Phase 2 complete; Phase 3 next)

**Goal**: Execute [INVESTIGATE-customer-frontend-data-display.md](INVESTIGATE-customer-frontend-data-display.md). After this PLAN, the customer frontend's `/data` page shows every queryable endpoint across `api_v1`, `marts`, and `raw` schemas (everything that isn't `private_marts`), each tagged with `provider`, `topic`, `geo`, `cadence`, and `layer`. A filter sidebar lets users slice the catalogue by any combination of tags. A first-class sources list (`/data/sources` + `api_v1.meta_sources`) carries provider, upstream URL, last-ingested timestamp, and downstream-model count for each of Atlas's 21 ingest sources.

**Investigation**: [INVESTIGATE-customer-frontend-data-display.md](INVESTIGATE-customer-frontend-data-display.md) — settled the open-by-default principle, the per-source `manifest.yml` shape ([Q2]), the dbt-model-as-substrate path ([Q3]), and the multi-namespace tag UX ([Q4]).

**Last Updated**: 2026-05-01

**Prerequisites**:
- PostgREST live with `api_v1.*` (PLAN-004 + UIS PLAN-002 — verified 2026-04-30).
- Customer frontend with `/data`, `/data/[endpoint]`, `/data/[endpoint]/spec` (PLAN-005 — shipped at `2266f21`).
- `raw.ingest_runs` populated by every ingest module (already in place since the scraping-infrastructure PLAN).

**Blocks**:
- The customer frontend's tag-filter view of `marts.*` and `raw.*` endpoints depends on Phase 1 (UIS schema exposure) landing.

---

## The `manifest.yml` shape

Phase 2's deliverable. One file per source folder:

```yaml
# atlas-data/ingest/src/sources/ssb-08764/manifest.yml
source_id: ssb-08764
upstream_id: "08764"
upstream_url: https://www.ssb.no/statbank/table/08764
upstream_title: |
  Personer i husholdninger med en årlig inntekt etter skatt per forbruksenhet
  under 60 prosent av medianinntekten, etter region og kjennemerker, 2008-2024
description: |
  Persons under 18 in low-income households (EU/OECD scale), per kommune,
  annual. Default response = latest year only.
publisher: Statistisk sentralbyrå
license: NLOD
license_url: https://data.norge.no/nlod/no/2.0
periodicity: P1Y
tags:
  provider: ssb
  topic: income
  geo: kommune
  cadence: annual
```

Required top-level fields:

| Field | Purpose |
|---|---|
| `source_id` | Folder name; primary key; e.g. `ssb-08764`. |
| `upstream_id` | The upstream's own identifier (SSB table number, FHI dataset slug, etc.) so external developers can reconcile against upstream catalogues. |
| `upstream_url` | Canonical link to the source on the upstream's own site. |
| `upstream_title` | The source's authoritative title — usually Norwegian, sometimes bilingual. Better-worded than our internal description; gives developers something to search for in upstream tooling. |
| `description` | One paragraph framing the dataset for the customer-facing catalogue. |
| `publisher` | Institution that publishes the data (often = provider but sometimes different — e.g. an SSB table published on behalf of another body). |
| `license` + `license_url` | Critical for external developers building products. Default `NLOD` (Norwegian Licence for Open Government Data) for any Norwegian public-sector source if the upstream doesn't specify otherwise; declare explicitly anyway so consumers don't guess. |
| `periodicity` | ISO 8601 — `P1Y` annual, `P3M` quarterly, `P1M` monthly, `P1D` daily, `irregular` for ad-hoc / one-shot. More precise than the `cadence:` tag. |

The `tags:` map carries the four declared namespaces (`provider`, `topic`, `geo`, `cadence`) — exactly one value per namespace per source. The `cadence:` tag is the human-readable shorthand of `periodicity` (so users can filter by `cadence:annual` without writing ISO 8601); the dbt model can derive it from `periodicity` if you'd rather not duplicate.

The `layer:` namespace is not declared here; it's derived per-endpoint in Phase 3 from the schema + dbt model path.

Plus a sibling change to capture upstream freshness: a new column on `raw.ingest_runs` named `upstream_updated_at timestamptz` (nullable). Ingest modules that can read a "last modified" timestamp from upstream metadata populate it; those that can't leave it null. The lag between `MAX(finished_at)` (we ingested) and `MAX(upstream_updated_at)` (they published) is then a meaningful signal in `mart_meta_sources`.

### How a `manifest.yml` gets created — bootstrap once, human-authored after

Two-stage workflow:

**(1) First time, automatic** — a Python script fetches the upstream's own metadata and emits a starter `manifest.yml`. For SSB sources, that's the PxWebAPI table-metadata response (carries title, publisher, last-update, variables). For FHI, json-stat2 metadata. The contributor runs:

```bash
npm run sources:bootstrap-manifest -- ssb-08764
# → writes atlas-data/ingest/src/sources/ssb-08764/manifest.yml with:
#   - source_id, upstream_id, upstream_url filled
#   - upstream_title verbatim from upstream
#   - publisher, periodicity inferred from upstream metadata
#   - license = NLOD (default for SSB / FHI / KOSTRA)
#   - description, tags left as TODO placeholders for human review
```

Then reviews the file, fills in `description` and `tags`, commits.

**(2) From then on, human-authored** — the manifest is just a YAML file in the repo. Edits happen via PRs like any other code change. **Ingest runs never rewrite it.** That's the discipline: `npm run ingest:ssb-08764` reads upstream data, writes rows to `raw.ssb_08764`, captures `upstream_updated_at` to `raw.ingest_runs` — but does not touch `manifest.yml`. Avoids "PR diff has mystery edits from a CI run."

For the 21 existing sources (Phase 2.3): same bootstrap, in batch. SSB (14) + FHI (4) cover via the script — that's 18 sources auto-bootstrapped. The 3 outliers (`redcross-branches`, `frr`, `ssb-klass-*` if treated separately from SSB) are authored manually using a small template; they don't have provider APIs the bootstrap script understands. ~30 minutes total to bootstrap + review all 21.

---

## Phase 1: UIS-side schema exposure

Cross-repo coordination with the UIS contributor. Atlas's `atlas-postgrest` instance starts serving `marts.*` and `raw.*` alongside `api_v1.*`. UIS-side change is a one-time configure-postgrest patch; after it lands, every new table in those schemas is queryable automatically (the existing `ALTER DEFAULT PRIVILEGES` clause already auto-grants SELECT on new tables).

### Tasks

- [x] 1.1 Open a new round of cross-repo coordination via `talk.md` (currently the empty placeholder). Inaugural message from atlas to uis lays out the change asked for: extend `PGRST_DB_SCHEMAS` from `api_v1` to `api_v1,marts,raw`; add matching `GRANT USAGE ON SCHEMA marts, raw TO <app>_web_anon` and `GRANT SELECT ON ALL TABLES IN SCHEMA marts, raw TO <app>_web_anon` plus `ALTER DEFAULT PRIVILEGES IN SCHEMA marts, raw GRANT SELECT ON TABLES TO <app>_web_anon` to `configure-postgrest.sh`. `private_marts` stays excluded.
- [ ] 1.2 Wait for UIS contributor's response + PR. Review their patch.
- [ ] 1.3 Once UIS PR merges and the rebuilt image is published, run `./uis pull` + `./uis configure postgrest --app atlas --database atlas_db --url-prefix api-atlas --json` (re-runs the configure step against the new image, picks up the additional grants). Then `./uis deploy postgrest --app atlas` (no-op if already deployed) or restart the pod to pick up the updated `PGRST_DB_SCHEMAS` env var.

**Outcome (Phase 1, partial — 2026-05-01):** atlas Message 1 to uis is written into [`talk.md`](../talk/talk.md). 1.2 + 1.3 are blocked on UIS contributor response — Atlas-side Phase 2/3 work continues in parallel per the implementation note below.

### Validation

```bash
# Direct PostgREST query: a marts.* table is now reachable
curl -fsS "http://api-atlas.localhost/dim_kommune?limit=3" | jq 'length'      # → 3

# A raw.* table is reachable
curl -fsS "http://api-atlas.localhost/ssb_08764?limit=2" | jq 'length'        # → 2

# private_marts.* is NOT reachable
curl -sS -o /dev/null -w "%{http_code}\n" "http://api-atlas.localhost/frr_resources"  # → 404

# OpenAPI spec lists more endpoints than before
curl -sS http://api-atlas.localhost/ | jq '.paths | keys | length'            # → ~60+ (was 9)
```

### Done when

- `marts.*` and `raw.*` tables are queryable via `api-atlas.localhost`.
- `private_marts.*` returns 404 (still gated).
- Customer frontend's existing `/data` catalog auto-discovers the new endpoints on next page load (no code change needed; introspection-driven design from PLAN-005 handles it).

---

## Phase 2: Per-source `manifest.yml` registry

Promote the existing Markdown table at `atlas-data/ingest/src/sources/README.md` and the per-source READMEs into structured per-source `manifest.yml` files. First-pass tag curation across the 21 existing sources.

### Tasks

- [x] 2.1 Document the `manifest.yml` schema in `atlas-data/ingest/src/sources/README.md`'s "Conventions" section: the eight required top-level fields (`source_id`, `upstream_id`, `upstream_url`, `upstream_title`, `description`, `publisher`, `license`, `license_url`, `periodicity`), the required `tags:` map with the four declared namespaces, allowed values per namespace.
- [x] 2.2 Define the initial vocabulary for each tag namespace:
  - `provider`: `ssb` / `fhi` / `redcross` / `brreg` (extend as new providers land)
  - `topic`: `demographics` / `income` / `education` / `health` / `social` / `ngo-supply` / `reference` (initial coarse set; refine as needed)
  - `geo`: `kommune` / `fylke` / `national` / `bydel`
  - `cadence`: `annual` / `quarterly` / `monthly` / `irregular` / `one-shot`
  - License values: `NLOD` (Norwegian Licence for Open Government Data — the default for SSB / FHI / KOSTRA), or specific names for non-NLOD sources. Always declare the URL.
- [x] 2.3 **Build the bootstrap script** at `atlas-data/ingest/scripts/bootstrap-manifest.ts` (TypeScript so it reuses Atlas's existing ingest-side fetch helpers). CLI: `npm run sources:bootstrap-manifest -- <source_id>`. Provider-specific extractors:
  - **SSB** (PxWebAPI): GET the table metadata endpoint, map `title`/`source`/`updated`/`variables[*].label` to `upstream_title`/`publisher`/(periodicity heuristic from variables — `Tid` value cardinality + spacing). Default `license: NLOD`.
  - **FHI** (Norgeshelsa json-stat2): same shape; metadata block has title + last-modified.
  - **Default fallback** (no provider extractor): writes a template manifest.yml with TODO placeholders + the `source_id` / `upstream_id` / `upstream_url` from CLI args. Used for `redcross-branches`, `frr`, anything without a structured upstream API.
  Output: writes `atlas-data/ingest/src/sources/<source_id>/manifest.yml` with as much pre-filled as possible; leaves `description` and `tags` as `# TODO` placeholders for human review. Refuses to overwrite an existing manifest unless `--force` is passed.
- [x] 2.4a **Bootstrap the 21 existing sources** — run `npm run sources:bootstrap-manifest` for each. SSB extractor handles 14 SSB tables + 2 ssb-klass sources. FHI extractor handles 4. Fallback template handles redcross-branches + frr (no provider API). Output: 21 skeleton YAMLs with upstream metadata pre-filled, `description` + `tags` left as `# TODO`.
- [x] 2.4b **Build the auto-fill helper** at `atlas-data/ingest/scripts/fill-manifest-todos.ts` (extension to original plan — replaces the manual ~1-hour editorial pass). CLI: `npm run sources:fill-manifest-todos` (no per-source arg; runs across all sources idempotently). Reads each source's `README.md` and applies:
  - **`description`** — first descriptive paragraph after the H1, with markdown emphasis/links/code stripped, ~400-char cap.
  - **`upstream_id`, `upstream_title`, `license`, `license_url`** — parsed out of the README's `## Upstream` markdown table when present.
  - **`tags.topic`** — first-match-wins regex over `title + description`. Order is significant: `ngo-supply` before `reference` before `income`/`education`/`health`/`social`/`demographics`. The `health` rule deliberately excludes the Norwegian word `helse` (because "Folkehelsestatistikk" — FHI's bureau name — would otherwise misclassify every FHI source). The `ngo-supply` rule requires explicit NGO vocabulary (Røde Kors, lokallag, frivillig) — generic "tjeneste" or "aktivitet" alone are too broad.
  - **`tags.geo`** — kommune > fylke > bydel priority. KOSTRA `(K)` markers count as kommune.
  - **`tags.cadence`** — derived from `periodicity` (P1Y → annual, P3M → quarterly, etc.).
  - **`MANUAL_OVERRIDES`** dict — hardcoded values for `redcross-branches` and `frr`, whose READMEs don't follow the SSB/FHI Upstream-table format.
  - Only fills TODO/empty fields; never overwrites human-authored content. After commit, the manifest is human-authored and ingest runs do NOT modify it (the discipline from Phase 2's preamble).
- [x] 2.4c **Run + verify** — `npm run sources:bootstrap-manifest` against each source folder, then `npm run sources:fill-manifest-todos` (no per-source arg; runs across all 21). Spot-check the outputs; fix the topic/geo regex when classifications drift (e.g. ssb-12292 omsorgstjenester → health not ngo-supply, fhi-bor-alene → demographics not health). Commit the 21 manifests + both scripts as a batch.
- [x] 2.5 Add the seed-build helper at `atlas-data/dbt/scripts/build_sources_seed.py` that:
  - Scans `atlas-data/ingest/src/sources/*/manifest.yml`
  - Validates each against the required-field list (fails loudly if any required field is missing or any tag namespace is absent — TODO placeholders also fail)
  - Emits a dbt seed CSV at `atlas-data/dbt/seeds/sources/_sources_manifest.csv` with columns `source_id, upstream_id, upstream_url, upstream_title, description, publisher, license, license_url, periodicity, tags`. The `tags` column is a comma-separated `namespace:value` string (e.g. `provider:ssb,topic:income,geo:kommune,cadence:annual`).

  **Deviation (2026-05-01):** Plan said `seeds/sources/manifest.csv` + alias to `_sources_manifest`. Implemented as `seeds/sources/_sources_manifest.csv` directly — no alias needed; the file's basename is the dbt resource name and the relation name (both `_sources_manifest`). Cleaner than the alias indirection.
- [x] 2.6 Update `atlas-data/dbt/dbt_project.yml`'s seeds config so `seeds/sources/_sources_manifest.csv` lands in `marts._sources_manifest` (private internal name; not user-facing).

  Implemented as: extend the `seeds.atlas.+column_types` map with the nine manifest columns + `tags`. `+schema: marts` already inherits from the parent. Added a separate `seeds/sources/schema.yml` documenting all ten columns + carrying `not_null` / `unique` data tests. `dbt seed --select _sources_manifest` loads 21 rows; `dbt test --select _sources_manifest` passes 11/11.
- [x] 2.7 **Migration**: add `atlas-data/migrations/NNN_raw_ingest_runs_upstream_updated.sql` adding `upstream_updated_at timestamptz` to `raw.ingest_runs` (nullable; idempotent via `ADD COLUMN IF NOT EXISTS`). Run `npm run migrate` to apply.

  Landed as `atlas-data/migrations/028_raw_ingest_runs_upstream_updated.sql`.
- [x] 2.8 **Update SSB + FHI ingest modules** (the easy wave) to populate `upstream_updated_at`. SSB's PxWebAPI metadata returns an `updated` field at the table level; FHI's json-stat2 has equivalent. The bootstrap script in 2.3 already extracts these — wire the same extraction into the runtime ingest path (one-place change in the run-record helper at `atlas-data/ingest/src/lib/ingest-runs.ts` or equivalent). Red Cross / Brreg can adopt the same convention later — leaving them null is fine; column is nullable.

  **Outcome (2026-05-01):** Scope was bigger than the plan implied — the existing SSB/FHI ingest modules didn't write to `raw.ingest_runs` at all; the start/finish helpers were only used by the NGO scraping infrastructure. Built a new shared wrapper at [`atlas-data/ingest/src/lib/ingest_run.ts`](../../../../atlas-data/ingest/src/lib/ingest_run.ts) (`recordIngestRun(sourceId, work)`) that owns the start/finish + sql lifecycle, then wired all 21 source modules through it. Per-source delta is ~10 lines: `return recordIngestRun(SOURCE_ID, async () => { ... return { output, record: { rowsParsed, upstreamUpdatedAt: new Date(resp.updated) } }; })`. SSB (14) + FHI (4) populate `upstreamUpdatedAt` from `resp.updated`; KLASS (2) + redcross/frr (2) pass null or a derived timestamp where the upstream concept exists. Live test: `npm run ingest:ssb-08764` returned `upstream_updated_at: "2026-01-16T07:00:00.000Z"` on `run_id 2`.
- [x] 2.9 Update `atlas-data/ingest/src/sources/README.md`: either (a) auto-generate from the YAMLs via `build_sources_seed.py` adding a markdown-table emission flag (one-way duplication, single source of truth in the YAMLs), or (b) replace the table with a pointer at `api_v1.meta_sources`. **Recommendation: (a)** — contributors browsing the repo without the API still see a readable index, and the table can never go stale.

  Implemented option (a): `build_sources_seed.py` now accepts `--readme [PATH]` (defaults to `atlas-data/ingest/src/sources/README.md`). Replaces content between `<!-- BEGIN auto-generated source table -->` / `<!-- END auto-generated source table -->` markers with a 7-column table (Source, Provider, What it is, Topic, EU theme, Geo, Cadence). Idempotent — re-running on an unchanged manifest set is a no-op. The legacy `Notes` column is dropped; per-source READMEs already capture editorial commentary.

- [x] 2.11 **Invert the manifest/README contract** (extension to original plan, prompted by user observation that the per-source README carried more structured info than `manifest.yml`). After this step, all *structured* catalogue metadata lives in `manifest.yml`; the README is reduced to *prose-only* contributor notes (what the script does, quirks, TODOs, references). Outcome:
  - `manifest.yml` schema gains two more required fields: `attribution` (citation string for academic/legal compliance, parsed from each README's `## Upstream` table or its `Attribution: *Kilde …*` prose fallback) and `dimensions:` (list of `{code, meaning, value_format, notes}` per upstream dimension — semantic interpretation that a computed `mart_meta_dimensions` from `raw.*` can't produce on its own).
  - `fill-manifest-todos.ts` extracts `attribution` automatically; `dimensions:` is hand-authored once per source (cost: ~30 min for the 21-source backfill).
  - `build_sources_seed.py` now validates `attribution` + the `dimensions:` shape and emits a second seed at `seeds/sources/_sources_dimensions.csv` (90 rows × 21 sources). Lands as `marts._sources_dimensions`. Phase 3's `mart_meta_dimensions` will join this editorial seed with computed cardinality + example values from `raw.*`.
  - `seeds/sources/schema.yml` gains `_sources_dimensions` with a `relationships` test on `source_id → _sources_manifest.source_id` and `not_null` on `code` / `meaning`. dbt test: 24/24 passing.
  - **Contributor guide** at `website/docs/contributors/ingest-modules.md` rewritten — README sections required to be prose-only (drop the Markdown `## Upstream`, `## Response shape`, `## Row shape emitted`, `## How to run locally` requirements). Adding-a-source workflow now points contributors at `npm run sources:bootstrap-manifest` + `npm run sources:fill-manifest-todos` + hand-authoring the `dimensions:` block. **Source for new entries: manifest.yml only — never duplicated in Markdown.**
  - **21 existing READMEs slimmed** by a one-off script: dropped the now-redundant structured sections, kept Title + What the script does + Known quirks + Known issues + References. Average: ~60% line reduction. fhi-bor-alene went 93 → 30 lines; ssb-08764 went 118 → 44 lines.

- [x] 2.10 **Add `eu_theme` field + `eu_data_theme` lookup seed** (extension to original plan, per [INVESTIGATE-felles-datakatalog-classification.md](../backlog/INVESTIGATE-felles-datakatalog-classification.md)). Aligns Atlas with Felles datakatalog's EU-tema facet (DCAT-AP `dcat:theme`) without giving up the domain-precise `topic` for our own UX.
  - `manifest.yml` schema gains `eu_theme:` top-level field — one of the 13 EU Publications Office Data Theme codes (AGRI / ECON / EDUC / ENER / ENVI / GOVE / HEAL / INTR / JUST / REGI / SOCI / TECH / TRAN). Required (validated by `build_sources_seed.py`); auto-derived from `tags.topic` by `fill-manifest-todos.ts` via a static `TOPIC_TO_EU_THEME` map.
  - New seed at `atlas-data/dbt/seeds/sources/eu_data_theme.csv` — 13 rows × 4 columns (`code`, `uri`, `label_en`, `label_no`). URIs are stable EU IRIs (`http://publications.europa.eu/resource/authority/data-theme/{CODE}`). Lands as `marts.eu_data_theme`.
  - `seeds/sources/schema.yml` gains the new seed's column tests + a `relationships` test on `_sources_manifest.eu_theme → eu_data_theme.code` (broken eu_theme values fail the gate).
  - Backfill: re-ran `npm run sources:fill-manifest-todos` to add `eu_theme:` to all 21 manifests. Distribution: 14 SOCI (income/social/demographics/ngo-supply collapse), 4 EDUC, 2 GOVE (reference data), 1 HEAL.
  - Customer frontend in Phase 4 can render an "EU theme" filter alongside Atlas's domain `topic`; later, a DCAT-AP-NO catalogue endpoint can re-emit these as `dcat:theme` URIs for federated discovery — see [INVESTIGATE-felles-datakatalog-classification.md](../backlog/INVESTIGATE-felles-datakatalog-classification.md) for the open question on DCAT-AP-NO publishing as a separate later PLAN.

### Validation

```bash
# All 21 sources have a manifest.yml
ls atlas-data/ingest/src/sources/*/manifest.yml | wc -l                       # → 21

# No remaining TODOs after the auto-fill pass
grep -l "TODO" atlas-data/ingest/src/sources/*/manifest.yml | wc -l           # → 0

# Topic distribution looks plausible (no "ngo-supply" misclassifications across SSB/FHI)
grep -h "  topic:" atlas-data/ingest/src/sources/*/manifest.yml | sort | uniq -c

# Re-running fill-manifest-todos is a no-op (idempotent — it only fills TODO/empty fields)
npm run sources:fill-manifest-todos                                           # → "filled 0 of 21"

# Build the seed CSV; validation fails loudly if any required field is missing
cd atlas-data/dbt && python scripts/build_sources_seed.py
ls -la seeds/sources/manifest.csv                                             # exists

# All four declared tag namespaces present per row
python -c "import csv; rows=list(csv.DictReader(open('seeds/sources/manifest.csv'))); print(all(set(t.split(':')[0] for t in r['tags'].split(',')) >= {'provider','topic','geo','cadence'} for r in rows))"  # → True

# Migration applied
psql "$DATABASE_URL" -c "\d raw.ingest_runs" | grep upstream_updated_at        # column visible

# SSB ingest modules write upstream_updated_at on next run
npm run ingest:ssb-08764
psql "$DATABASE_URL" -c "select source_slug, upstream_updated_at from raw.ingest_runs where source_slug='ssb-08764' order by run_id desc limit 1"  # non-null

# dbt seed loads the manifest
uv run --env-file ../ingest/.env dbt seed --select _sources_manifest          # success
```

### Done when

- All 21 source folders contain a valid `manifest.yml` with all eight required top-level fields and four tag namespaces.
- No `TODO` placeholders remain in any manifest.
- `bootstrap-manifest.ts` + `fill-manifest-todos.ts` are both idempotent (re-running them is a no-op against a fully-populated state).
- `build_sources_seed.py` produces a clean CSV; validation rejects missing fields.
- `raw.ingest_runs.upstream_updated_at` migration applied; nullable.
- SSB ingest modules populate `upstream_updated_at` on runs (14 sources).
- `dbt seed` loads the manifest into `marts._sources_manifest`.
- The legacy Markdown table at `atlas-data/ingest/src/sources/README.md` is either auto-generated from the YAMLs (preferred) or replaced with a pointer.

---

## Phase 3: `marts.meta_sources` + `marts.meta_endpoints` dbt models

The joins. After this phase, two new `mart_*` views exist (and via the PLAN-004 generator, two new `api_v1.meta_*` wrappers) that carry the full tagged catalogue.

### Tasks

- [ ] 3.1 Add `atlas-data/dbt/models/marts/api/mart_meta_sources.sql`:
  - From: `marts._sources_manifest` (Phase 2 seed)
  - Left-join to `raw.ingest_runs` aggregates per source:
    - `last_ingested_at`: `MAX(finished_at) WHERE exit_code = 0`
    - `last_upstream_update_at`: `MAX(upstream_updated_at) WHERE exit_code = 0` (nullable — only populated for sources whose ingest module captures it)
    - `latest_row_count`: `rows_parsed` from the most recent successful run
    - `total_runs`: `COUNT(*) FILTER (WHERE exit_code = 0)`
  - Add `downstream_model_count`: count of distinct downstream models from the lineage seed (Phase 3.3).
  - Output columns: `source_id`, `upstream_id`, `upstream_url`, `upstream_title`, `description`, `publisher`, `license`, `license_url`, `periodicity`, `tags` (text[]), `last_ingested_at`, `last_upstream_update_at`, `latest_row_count`, `total_runs`, `downstream_model_count`.
  - Add full `schema.yml` description per column (PLAN-001's gate enforces this).
- [ ] 3.2 Add `atlas-data/dbt/models/marts/api/mart_meta_endpoints.sql`:
  - From: `information_schema.tables` filtered to `table_schema in ('api_v1','marts','raw')` (and `not in ('private_marts')` defensively)
  - Output columns: `endpoint`, `schema`, `table`, `tags` (text[]), `row_count` (via dynamic SQL or a daily-refreshed snapshot — see 3.3 for lineage), `is_public_api` (boolean: schema='api_v1')
  - Tags: derive `layer:<schema>` from the schema; inherit `provider:` / `topic:` / `geo:` / `cadence:` from the source(s) the endpoint derives from (via the lineage extraction in 3.3).
  - Add full `schema.yml` description per column.
- [ ] 3.3 Add `atlas-data/dbt/scripts/extract_lineage.py` that reads `target/manifest.json` after `dbt parse`, walks the dependency graph from each `api_v1.*` and `marts.*` model up to its root `raw.*` ancestors, and emits a dbt seed CSV at `seeds/sources/lineage.csv` with rows `(model_name, source_id)` — one row per (model, source) edge. Multiple rows per model when it derives from multiple sources (e.g. `fact_kommune_indicators` → 17 indicator sources).
- [ ] 3.4 Run `./regenerate-api-v1.sh` + `./apply-api-v1.sh`. The PLAN-004 generator picks up `mart_meta_sources` and `mart_meta_endpoints`, emits `api_v1.meta_sources` and `api_v1.meta_endpoints` wrappers, all five validation gates pass.

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt seed --select sources
uv run --env-file ../ingest/.env dbt run --select mart_meta_sources mart_meta_endpoints
./regenerate-api-v1.sh && ./apply-api-v1.sh

# meta_sources has 21 rows
curl -sS "http://api-atlas.localhost/meta_sources" | jq 'length'              # → 21

# Every row has the new required fields
curl -sS "http://api-atlas.localhost/meta_sources" | jq '[.[] | select(.license == null or .publisher == null or .upstream_title == null or .periodicity == null)] | length'  # → 0

# Every row has all four tag namespaces
curl -sS "http://api-atlas.localhost/meta_sources" | jq '[.[] | select(.tags | length < 4)] | length'   # → 0

# Filter by tag
curl -sS "http://api-atlas.localhost/meta_sources?tags=cs.{provider:ssb}" | jq 'length'  # → 14 (the 14 SSB sources)

# SSB sources have last_upstream_update_at populated; non-SSB are null (acceptable for v1)
curl -sS "http://api-atlas.localhost/meta_sources?tags=cs.{provider:ssb}" | jq '[.[] | select(.last_upstream_update_at != null)] | length'  # → 14 (after one full SSB ingest cycle)

# meta_endpoints has ~60 rows
curl -sS "http://api-atlas.localhost/meta_endpoints" | jq 'length'            # → 60+

# Endpoints inherit tags from sources
curl -sS "http://api-atlas.localhost/meta_endpoints?tags=cs.{topic:income}" | jq 'length'  # > 0
```

### Done when

- `marts.meta_sources` exists with 21 rows; each has `provider`, `topic`, `geo`, `cadence` tags + `latest_run_at` from `raw.ingest_runs`.
- `marts.meta_endpoints` exists with one row per public endpoint; each has a `layer:` tag plus inherited source tags.
- `api_v1.meta_sources` and `api_v1.meta_endpoints` wrap them; all PLAN-004 validation gates pass.
- PostgREST's `Prefer: count=exact` returns 21 for `/meta_sources` and 60+ for `/meta_endpoints`.

---

## Phase 4: Customer frontend `/data` rewrite + per-source detail

Replace the existing flat catalogue with the tag-filter sidebar layout. Add a per-source detail page.

### Tasks

- [ ] 4.1 Rewrite `atlas-frontend/src/app/data/page.tsx`:
  - Fetch `api_v1.meta_endpoints` (server component).
  - Read `searchParams` for active tag filters (`?tag=topic:income&tag=layer:api-v1`).
  - Apply filters server-side via PostgREST `?tags=cs.{...}` query params.
  - Render a two-column layout: filter sidebar on the left (namespace-grouped checkboxes, count per option, derived from the unfiltered tag set), endpoint cards on the right.
  - Each card shows endpoint name, description, layer indicator, and tag pills (clickable to add to filter).
  - URL-driven; no client JS needed.
- [ ] 4.2 Update `npm run api:types` so the new `meta_sources` and `meta_endpoints` endpoint types appear in `api-types.ts`. (No work — `swagger2openapi → openapi-typescript` regenerates from the spec automatically.)
- [ ] 4.3 Add `atlas-frontend/src/app/data/sources/[source_id]/page.tsx` — per-source detail:
  - Fetch `api_v1.meta_sources` for the requested source_id; 404 if not found.
  - Render a card with provider, upstream URL (linked, target=_blank), description, last-ingested timestamp, total ingest invocations.
  - Below: list of derived endpoints (filter `meta_endpoints` by lineage to this source) with click-throughs to `/data/<endpoint>` (the table viewer) and `/data/<endpoint>/spec`.
- [ ] 4.4 Update homepage (`app/page.tsx`) to mention "Browse all data" not "Browse the data catalog" — the surface has grown beyond a single catalog. Minor copy update.
- [ ] 4.5 Update the customer-app `README.md` to describe the new tag-driven catalogue (one paragraph), with example URLs (`?tag=topic:income`, `?tag=topic:income&tag=geo:kommune`).

### Validation

```bash
cd atlas-frontend && npm run typecheck && npm run lint && npm run build       # all clean
npm run dev                                                                   # boots on :3001

# /data renders with the sidebar
curl -sS http://localhost:3001/data | grep -c "namespace-group\|filter-sidebar"  # > 0

# Tag filter URL works
curl -sS "http://localhost:3001/data?tag=provider:ssb" | grep -oE "ssb-[0-9]+" | sort -u  # 14 entries

# Per-source detail works
curl -sS -o /dev/null -w "%{http_code}\n" "http://localhost:3001/data/sources/ssb-08764"  # → 200
curl -sS -o /dev/null -w "%{http_code}\n" "http://localhost:3001/data/sources/notreal"    # → 404
```

### Done when

- `/data` renders the tag-filter sidebar + cards layout against the live API.
- All ~60 endpoints visible (when no filter active); filtering by any tag combination works via URL params.
- `/data/sources/[source_id]` renders for valid source IDs; 404 for invalid.
- All PLAN-005 routes (`/data/[endpoint]` table viewer + `/data/[endpoint]/spec` viewer) carry forward unchanged.

---

## Phase 5: Docs

### Tasks

- [ ] 5.1 Update [`website/docs/contributors/setup.md`](../../../contributors/setup.md): add a section on the per-source `manifest.yml` convention (where it lives, required fields, tag namespaces), placed near the existing "Set up the ingest layer" section.
- [ ] 5.2 Update [`website/docs/contributors/ingest-modules.md`](../../../contributors/ingest-modules.md): "Adding a new ingest source" section gets a step on the bootstrap-then-fill-then-review workflow:
  1. After scaffolding `index.ts` + `README.md`, run `npm run sources:bootstrap-manifest -- <source_id>` to produce the skeleton manifest with upstream metadata pre-filled.
  2. Run `npm run sources:fill-manifest-todos` to auto-fill `description` + `tags` from the README. Idempotent — re-running on a fully-filled manifest is a no-op.
  3. Review the generated `manifest.yml`. The auto-fill is heuristic; spot-check `tags.topic` (regex first-match-wins) and `tags.geo` (kommune > fylke > bydel priority). For sources without an `## Upstream` table in the README, add an entry to `MANUAL_OVERRIDES` in `fill-manifest-todos.ts`.
  4. Commit the manifest alongside the source code.
  5. Subsequent ingest runs do not modify the manifest; future field changes happen via PR like any other code change.
  Show the schema with example values for each declared namespace.
- [ ] 5.3 Update [`website/docs/developers/index.md`](../../../developers/index.md) (currently a stub from PLAN-005): add a section on the open-by-default principle + the tag-filter URL pattern (`?tag=topic:income&tag=geo:kommune`) external developers can use to fetch subsets via the API.
- [ ] 5.4 Update [`atlas-data/ingest/src/sources/README.md`](../../../../../atlas-data/ingest/src/sources/README.md): per the Phase 2.6 decision, either replace the hand-maintained table with auto-generation from YAMLs (preferred, via the Python helper) or replace it with a pointer at `api_v1.meta_sources`.

### Validation

User reads the updated docs and confirms a new contributor could (a) author a manifest.yml for a new source and (b) understand the tag-driven catalogue without consulting this PLAN.

### Done when

All four doc files reflect the new shape; no stale references to "the 9 endpoints" remain in contributor or developer surfaces.

---

## Acceptance criteria

- [ ] PostgREST serves `api_v1.* + marts.* + raw.*` (private_marts stays excluded). Verified via `curl api-atlas.localhost/dim_kommune` and `curl api-atlas.localhost/ssb_08764`.
- [ ] All 21 source folders have a valid `manifest.yml` with all eight required top-level fields (`source_id`, `upstream_id`, `upstream_url`, `upstream_title`, `description`, `publisher`, `license`, `license_url`, `periodicity`) + four declared tag namespaces.
- [ ] `raw.ingest_runs.upstream_updated_at` column exists; SSB ingest modules populate it.
- [ ] `marts.meta_sources` (and its `api_v1.meta_sources` wrapper) carries 21 rows, each with full tags + license + publisher + periodicity + `last_ingested_at` + `last_upstream_update_at` (where the source supports it).
- [ ] `marts.meta_endpoints` (and its `api_v1.meta_endpoints` wrapper) carries 60+ rows, each with `layer:` + inherited source tags.
- [ ] All five PLAN-004 validation gates still pass (drift, coverage, static description, runtime description, row-count parity).
- [ ] Customer frontend `/data` renders the tag-filter sidebar + cards layout; URL state is bookmarkable; ~60 endpoints visible.
- [ ] `/data/sources/[source_id]` per-source detail renders for all 21; 404 otherwise.
- [ ] Contributor docs (`setup.md`, `ingest-modules.md`) describe the manifest.yml convention + the tag namespaces.
- [ ] Developer docs (`developers/index.md`) describe the open-by-default principle + the tag-filter URL pattern.

---

## Files to modify

**New (atlas-data):**
- `atlas-data/ingest/src/sources/<id>/manifest.yml` — 21 new files, one per source (auto-bootstrapped + auto-filled)
- `atlas-data/ingest/scripts/bootstrap-manifest.ts` — provider-aware bootstrap (SSB PxWebAPI extractor + FHI extractor + fallback template); npm alias `sources:bootstrap-manifest`
- `atlas-data/ingest/scripts/fill-manifest-todos.ts` — README-parsing TODO-filler (description, upstream_id, upstream_title, license, tags) with topic/geo regex rules + `MANUAL_OVERRIDES` for redcross-branches/frr; npm alias `sources:fill-manifest-todos`
- `atlas-data/ingest/src/lib/ingest_run.ts` — shared `recordIngestRun(sourceId, work)` wrapper that owns start/finish + sql lifecycle; replaces the original "one-place change" plan
- `atlas-data/migrations/028_raw_ingest_runs_upstream_updated.sql` — adds `upstream_updated_at` column
- `atlas-data/dbt/scripts/build_sources_seed.py` — YAML scanner → dbt seed CSV (validates required fields, refuses TODO placeholders)
- `atlas-data/dbt/scripts/extract_lineage.py` — `manifest.json` → lineage seed CSV
- `atlas-data/dbt/seeds/sources/_sources_manifest.csv` — generated, committed
- `atlas-data/dbt/seeds/sources/_sources_dimensions.csv` — 90-row editorial dimension reference (one row per source × dimension)
- `atlas-data/dbt/seeds/sources/eu_data_theme.csv` — 13-row EU Data Theme lookup
- `atlas-data/dbt/seeds/sources/schema.yml` — column descriptions + tests for all three seeds (incl. eu_theme→eu_data_theme.code + dimensions.source_id→_sources_manifest.source_id relationships)
- `atlas-data/dbt/seeds/sources/lineage.csv` — generated, committed
- `atlas-data/dbt/models/marts/api/mart_meta_sources.sql`
- `atlas-data/dbt/models/marts/api/mart_meta_endpoints.sql`
- `atlas-data/dbt/models/marts/api/schema.yml` — descriptions for both new models

**Updated (atlas-data):**
- `atlas-data/dbt/dbt_project.yml` — seed config for `seeds/sources/`
- `atlas-data/ingest/src/sources/README.md` — auto-generated from YAMLs (or pointer)
- `atlas-data/ingest/src/sources/<id>/index.ts` — SSB modules updated to capture upstream `updated` field and pass to run-record helper (one shared code path)
- `atlas-data/ingest/src/lib/ingest-runs.ts` (or wherever the run-record write lives) — accepts `upstream_updated_at` from caller, writes to the new column
- Generated: `atlas-data/dbt/api_v1_generated.sql` + `api_v1_state.json` (PLAN-004 generator output)

**Updated (atlas-frontend):**
- `atlas-frontend/src/app/data/page.tsx` — rewritten as tag-filter sidebar
- `atlas-frontend/src/app/data/sources/[source_id]/page.tsx` — new per-source detail route
- `atlas-frontend/src/app/page.tsx` — minor copy update
- `atlas-frontend/README.md` — mention the tag-driven catalogue
- Regenerated: `atlas-frontend/src/lib/api-types.ts` (via `npm run api:types`)

**Updated docs:**
- `website/docs/contributors/setup.md`
- `website/docs/contributors/ingest-modules.md`
- `website/docs/developers/index.md`

**UIS-side (cross-repo):**
- `urbalurba-infrastructure/provision-host/uis/lib/configure-postgrest.sh` — extend `PGRST_DB_SCHEMAS` + grants
- `urbalurba-infrastructure/website/docs/services/integration/postgrest.md` — document the new schema-set defaults

---

## Out of scope

- The auth story for `private_marts.*` — covered by [INVESTIGATE-private-atlas-deployments.md](INVESTIGATE-private-atlas-deployments.md).
- Column-level descriptions on `raw.*` tables — they remain undocumented; external consumers see `meta_sources.upstream_url` for canonical docs.
- Lineage visualisation (mermaid graphs) — `meta_endpoints` carries the data; rendering a graph is a v2 polish.
- Tag governance / curation tooling — manual for v1 (a quarterly review by whoever's stewarding source ingests). Automate later if it gets messy.
- Search-relevance scoring across sources — keep the existing free-text search; tags are the structured navigation, search is the unstructured complement.

---

## Cross-references

- [INVESTIGATE-customer-frontend-data-display.md](INVESTIGATE-customer-frontend-data-display.md) — the architectural commitments this PLAN executes.
- [PLAN-004-postgrest-api-v1-wrapper.md](../completed/PLAN-004-postgrest-api-v1-wrapper.md) — the auto-generator wraps `mart_meta_*` into `api_v1.meta_*`. This PLAN reuses that pipeline unchanged.
- [PLAN-005-frontend-split-and-rebuild.md](../completed/PLAN-005-frontend-split-and-rebuild.md) — built the introspection-driven `/data` catalogue this PLAN extends. The existing `/data/[endpoint]` table viewer + `/data/[endpoint]/spec` viewer are unaffected.
- [INVESTIGATE-frontend-data-access-architecture.md](../completed/INVESTIGATE-frontend-data-access-architecture.md) — established forkability + no-DB-role for the customer frontend; this PLAN preserves both.
- [`atlas-data/ingest/src/sources/README.md`](../../../../../atlas-data/ingest/src/sources/README.md) — the legacy Markdown registry that becomes the structured `manifest.yml` set in Phase 2.
- [`raw.ingest_runs`](../../../../../atlas-data/migrations/023_raw_ingest_runs.sql) — the run-history substrate `meta_sources` joins to.
- [`talk.md`](../talk/talk.md) — empty placeholder; Phase 1 opens a new round here.

---

## Implementation notes

- **Phase 1 has cross-repo asynchrony.** Don't block all of Phase 2/3 on it — manifest.yml authorship and `meta_sources`/`meta_endpoints` model work doesn't need the schema exposure to be live (it can use the existing `api_v1.*` exposure for development; the new schemas appear when UIS lands the change). Sequence: kick off Phase 1 in parallel with Phase 2 + 3, then Phase 4 once both have landed.
- **Tag inheritance from sources to endpoints (Phase 3.2)** is the trickiest part. A `mart_*` derived from multiple sources (e.g. `fact_kommune_indicators` from 17 indicator sources) inherits the *intersection* of their tags — meaning if all 17 are `cadence: annual` it's annual; if they differ, no `cadence:` tag. Or take the union (every source's tag) — cleaner, more surface area exposed. **Recommendation: union.** Easier to filter; "this mart involves something annual" is more useful than "this mart is purely annual."
- **The `_sources_manifest` seed** is private dbt data, not a `mart_*`. Keep it under `marts._sources_manifest` (underscored = "internal") so the auto-generator skips it. Only `mart_meta_sources` (which reads from it) gets wrapped into `api_v1.meta_sources`.
- **Tagging the 21 existing sources (Phase 2.3)** is editorial work, not technical. Allocate ~1 hour: 3 minutes per source × 21. Consult each source's README + the upstream documentation. Not all tags will be obvious — `topic:` for `ssb-09429` (educational attainment) might be `education` or `demographics` depending on framing. Pick once, document choice in a comment in `manifest.yml` if non-obvious. Refining later is one-line edits.
- **Don't over-engineer the lineage extraction.** A flat `(model_name, source_id)` seed is enough — recursive walks of the dbt graph happen at extract time, not at query time. PostgREST consumers see `meta_endpoints.tags` as an already-flattened array.
