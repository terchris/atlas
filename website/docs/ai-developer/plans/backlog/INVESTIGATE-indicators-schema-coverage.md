# Investigate: closing the schema.yml description gap on `indicators__*` models

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide a sustainable shape for column-level descriptions across the ~30 `models/indicators/indicators__<source>.sql` per-source pass-through models — currently 25 % covered, hard to fill by hand, repetitive across sources, but increasingly load-bearing now that `+persist_docs` (PR #89) pushes schema.yml descriptions into `pg_description` and PostgREST → MCP agents see them.

**Last Updated**: 2026-05-09

**Origin**: PR #89 enabled `+persist_docs: { relation: true, columns: true }` on dbt models + seeds. Live verification surfaced that only 267 of ~566 `marts.*` columns gained descriptions — the missing 249 are mostly `indicators__*` per-source pass-throughs. Hand-counted: of 288 total column entries in `models/indicators/schema.yml`, only 72 have a `description:` line (25 %). The `marts.*` API surface is now visible to AI agents but most of the indicators layer reads as naked column names.

---

## The desired end-state — single editorial input, every consumer fed automatically

The intent of this work, plain: **adding a new dataset should mean adding the source's editorial content in exactly one place — `manifest.yml` — and having that flow automatically into every system that needs it.** No per-surface re-authorship. No "did you remember to update `models/indicators/schema.yml` too?" checklist item.

**The contributor's workflow before vs after**:

```
BEFORE (today)                              AFTER (this INVESTIGATE's outcome)
──────────────                              ─────────────────────────────────
1. Scaffold folder + index.ts               1. Scaffold folder + index.ts
2. Write prose README.md                    2. Write prose README.md
3. sources:bootstrap-manifest               3. sources:bootstrap-manifest
4. sources:fill-manifest-todos              4. sources:fill-manifest-todos
5. Hand-author dimensions: in manifest.yml  5. Hand-author dimensions: in manifest.yml  ← SAME (still editorial)
6. Add ingest:<id> to package.json          6. Add ingest:<id> to package.json
7. Hand-edit schema.yml column descriptions ← (skipped 75 % of the time today)
8. ingest:<id> + dbt:rebuild                7. ingest:<id> + dbt:rebuild  ← schema.yml regenerates
                                                                           inside dbt:rebuild
```

**The integration point**: a new `schema-gen` phase inside `npm run dbt:rebuild` (and `npm run bootstrap`), running after `seed` and before `run` (since `dbt run` parses schema.yml as part of model compilation):

```
seed → schema-gen → run → api → test → docs
        ↑ NEW
```

Generator inputs:
- Every `atlas-data/ingest/src/sources/<id>/manifest.yml` `dimensions:` block (per-source editorial content)
- One shared `atlas-data/dbt/conformed-column-descriptions.yml` (~10 entries — `source_id`, `kommune_nr`, `period_start`, etc.) — hand-authored once, reused for every source forever
- A column-name mapping (manifest dimension `Region` → schema column `region_code`) — auto-derived from each indicator model's SQL, with explicit overrides where heuristics fail

Generator output: `models/indicators/schema.yml`, regenerated deterministically.

**Editorial work that stays human, vs work that disappears**:

| Surface | Editorial input today | Editorial input after this PLAN |
|---|---|---|
| `/data/sources/<id>` catalog card (description + dimensions) | `manifest.yml` (description + dimensions:) | Same — one place |
| `mart_meta_dimensions` editorial pass-through | `manifest.yml` `dimensions:` (via Phase 2.11 `_sources_dimensions` seed) | Same — one place |
| `models/indicators/schema.yml` column descriptions | **Hand-edited per source** (skipped 75 % of the time) | **Generated** from manifest + conformed dict |
| pg_description (Postgres COMMENT ON) | Already auto via `+persist_docs` (PR #89), but only for descriptions that exist in schema.yml | Now actually populated — generated schema.yml feeds it |
| PostgREST OpenAPI spec | Auto from pg_description | Auto from pg_description |
| atlas-frontend `/data/[schema]/[table]` column tooltips | Auto from PostgREST spec | Auto from PostgREST spec |
| dbt docs catalog.json | Auto from `dbt docs generate` (Phase 8 of bootstrap) | Auto from `dbt docs generate` |
| MCP tool definitions for AI agents | Auto from pg_description / dbt manifest | Auto from pg_description / dbt manifest |
| Future `developer-atlas.helpers.no` API reference | Auto from PostgREST spec via Scalar (PLAN-008 Phase 1) | Auto from PostgREST spec via Scalar |

Net editorial input per new dataset: **one `dimensions:` block in `manifest.yml`** (3-5 entries, written from upstream API knowledge — the contributor needs to know the data anyway). That single input feeds eight downstream surfaces. The generator + persist_docs + apply-api-v1.sh + dbt docs generate are the plumbing that fans it out.

**What this still doesn't auto-fix** (worth being explicit so the "fully automatic" claim doesn't oversell):

- The `dimensions:` block still needs human authorship. A generator can't invent what `EUskala60` means or what region-code prefixes signify. But it's once, in one file, in the contributor's natural catalog-authorship workflow.
- The conformed-columns dict needs first-time authorship (~10 entries × 1 paragraph each = ~1 hour, one time).
- New atlas-conformed columns added in the future (rare; `period_start` doesn't change shape often) need an entry in the dict.
- Models OUTSIDE indicators (`dim_*`, `fact_*`, `mart_*`, `supply__*` for now — see [Q3]) still have hand-written schema.yml. Generator scope is `indicators__*` for v1.

---

## The actual gap

Numbers as of 2026-05-09:

```
$ wc -l atlas-data/dbt/models/indicators/schema.yml
    1535 lines

$ grep -c "^      - name:" indicators/schema.yml          # column entries
288

$ grep -c "        description:" indicators/schema.yml    # column-level descriptions
72

→ 25 % column coverage
```

Per-model breakdown for the SSB indicator models:

```
indicators__ssb_08764    3/10 documented  ← the only one with any coverage
indicators__ssb_06083    0/13
indicators__ssb_06913    0/10
indicators__ssb_06944    0/13
indicators__ssb_09429    0/14
indicators__ssb_12063    0/10
indicators__ssb_12131    0/10
indicators__ssb_12132    0/10
indicators__ssb_13995    0/10
… (all 14+ SSB pass-throughs sit at 0)
```

FHI / Bufdir / SSB-crime indicators — same pattern, mostly zero.

`indicators__ssb_08764` is the lone documented one because it was the worked example for the original PLAN-001 schema.yml hygiene push; the rest predate `+persist_docs` and there was no incentive to write column-level descriptions for them (the api_v1 wrappers — which DO have full descriptions — were the only consumer-facing surface).

---

## Why hand-filling is the wrong shape

`indicators__*` models follow a near-identical column shape across sources:

| Atlas-conformed columns (consistent across all indicators models) | Source-specific columns |
|---|---|
| `source_id` | `region_code` (sometimes) |
| `kommune_nr`, `fylke_nr` | `contents_code`, `contents_label` |
| `period_start`, `period_end` | upstream-specific encoding columns |
| `value`, `value_unit` | (varies per source) |
| `loaded_at` (provenance) | |

That's ~7-9 atlas-conformed columns repeated across 30 sources = ~250 hand-written-but-identical descriptions if we hand-fill. The remaining ~30 source-specific columns ARE per-source content. Hand-filling all 250 is real labor and creates the wrong incentive — the indicator descriptions become the primary place to update if conformed-column semantics change, instead of the dim/fact models that own those concepts.

Equally, `dbt-osmosis` (already in use) propagates descriptions across the dbt graph but **only when there's a parent description to propagate**. Today most `indicators__*` parents (`raw.*` sources via `models/sources/sources.yml`) have *table*-level descriptions but few *column*-level ones. So osmosis has nothing to lift.

The interesting observation: **Atlas already captures the source-specific semantic content in `manifest.yml`'s `dimensions:` block** (PLAN-007 Phase 2.11). Each upstream dimension gets `code`, `meaning`, `value_format`, `notes`. That's exactly the editorial content that would belong on the corresponding `indicators__*` column.

So the question this INVESTIGATE settles is: **how do we close this gap without writing 250 redundant descriptions by hand, and without losing the ability to refine them per-source where it matters?**

---

## Options

### (a) Hand-fill all ~216 missing descriptions

Just write them. ~30 sources × ~7-9 columns each. ~1-2 days of mechanical work.

- **Pro**: simple, no new tooling, every column gets a tailored description.
- **Pro**: easy to refine post-hoc — no generator to re-run.
- **Con**: ~250 descriptions for repeated columns are near-copies. Drift risk: ssb-12063's `kommune_nr` description vs ssb-12131's `kommune_nr` description will differ over time if no canonical source exists.
- **Con**: every new ingest source repeats the work. With Cursor BG / cloud-agent landing more sources, this becomes a recurring tax.
- **Verdict**: works in the short term; fragile as the source count grows. Skip if a generator path is viable.

### (b) Generate `indicators__*` descriptions from manifest.yml dimensions + a shared atlas-conformed-columns dictionary

A small generator (TypeScript, lives at `atlas-data/dbt/scripts/generate-indicator-descriptions.py` or .ts) does this on every run:

1. Read every `atlas-data/ingest/src/sources/<source_id>/manifest.yml`.
2. For each source, walk its `dimensions:` block — map upstream dimension `code` to the corresponding indicator column name (e.g. `Region` → `region_code`; `Tid` → `year`; `ContentsCode` → `contents_code`). Per-source override map handles nonstandard mappings.
3. Combine with a single shared `atlas-data/dbt/conformed-column-descriptions.yml` (~10 entries) that documents the atlas-conformed columns once: `source_id`, `kommune_nr`, `fylke_nr`, `period_start`, `period_end`, `value`, `value_unit`, `loaded_at`. Hand-authored once; reused 30 times.
4. Emit per-source schema.yml fragments (or rewrite the consolidated `indicators/schema.yml`) with column descriptions populated from those two sources.
5. Wire as a pre-commit hook or CI step that fails if the generated output doesn't match the committed schema.yml — analogous to `check-osmosis.sh`'s existing gate.

- **Pro**: 250 descriptions become 1 conformed-columns file + 30 manifest dimensions blocks (which Atlas already maintains for the catalogue).
- **Pro**: New ingest sources auto-document themselves once the contributor authors `dimensions:` (a Phase 2.11 step they already do).
- **Pro**: dbt-osmosis stays compatible — the generator emits standard schema.yml; osmosis still propagates descriptions downstream from indicators to facts/marts.
- **Con**: new tooling — one generator script + one conformed-columns YAML + one CI gate. ~150 lines of code.
- **Con**: per-source overrides for column-name mismatches need a small mapping table (e.g. some sources call it `region_code`, others call it `region`, others `geo_code`). Mapping lives in the generator config.
- **Verdict**: the investment pays back quickly. Write once, every new source benefits. Strongest option.

### (c) Don't fill `indicators__*` — defer to api_v1.* wrappers as the documented surface

Lean on the fact that api_v1.* views (Atlas's "stable contract" surface) are 100 % documented. External developers and AI agents are pointed at api_v1; `marts.*` and especially `indicators__*` are presented as "internal — descriptions optional."

- **Pro**: zero work today. The 25 % coverage stays as-is.
- **Pro**: consistent with the "api_v1 is the contract" framing in the developer docs.
- **Con**: contradicts the recent open-by-default posture (PLAN-007). Atlas's `/data` catalog now exposes marts.* as a first-class surface; AI agents reaching `marts.*` see the gap.
- **Con**: future-Atlas pressure: as more consumers (innovators, LLMs, journalists) hit `marts.*` directly, the cost of "no description" rises. Deferring just postpones a larger fix.
- **Verdict**: short-term escape valve, not a real answer. Don't choose unless the team explicitly accepts that `marts.*` is a tier-2 surface for documentation purposes.

### (d) Hybrid — generate the conformed columns, hand-write the source-specific ones

Splits (b)'s scope:

- The ~7-9 atlas-conformed columns generated from a single shared dictionary (covers 80 % of the missing volume).
- The ~3-5 source-specific columns hand-written in each `indicators__<source>` schema.yml (covers the remaining 20 %).

- **Pro**: smaller initial generator (no manifest.yml integration; just a shared dict and a list of sources).
- **Pro**: source-specific columns get hand-tailored descriptions where the editorial work has high payoff.
- **Con**: contributor still has to write something per new source — a regression vs (b) where dimensions:-block authoring covers source-specific automatically.
- **Verdict**: plausible if (b)'s manifest-dimension mapping turns out to be too brittle. Keep as Plan B.

### (e) Enforce going forward via `check-osmosis.sh`, accept the 249-column debt

Bump `check-osmosis.sh` (or add a sister gate) to fail when an `indicators__*` model has a column without a `description:` line. Don't fix the 249 today; require all NEW columns to be documented; over time the debt clears as sources are touched.

- **Pro**: stops the bleeding. Zero immediate fixing required.
- **Pro**: the gate is cheap (one grep).
- **Con**: doesn't help today's AI / MCP consumers. The 249 stay missing for months/years.
- **Con**: makes adding a new ingest source slightly more painful (the contributor now has to author column descriptions hand-by-hand, which is the labor (b) explicitly avoids).
- **Verdict**: a reasonable *complement* to (b) — generator fills today's gap, the gate prevents tomorrow's. Not a standalone answer.

---

## Recommendation

**(b) + (e)** — generator + CI gate. This is the only option that delivers the "single editorial input → every consumer fed" end-state described above; the others either keep contributor labor proportional to source count (a, d) or punt on the open-by-default gap (c) or stop the bleeding without healing it (e alone).

Specifically:

1. Author `atlas-data/dbt/conformed-column-descriptions.yml` — one entry per atlas-conformed column (~10 columns × ~1 paragraph each). One-time editorial pass; ~1 hour.
2. Build `atlas-data/dbt/scripts/generate-indicator-descriptions.py` — reads manifest.yml dimensions + the conformed dict, emits a regenerated `models/indicators/schema.yml`. ~150 lines.
3. Add per-source override map in the script for column-name mismatches (`Region` → `region_code` etc). ~15 entries to start.
4. Run the generator; commit the regenerated schema.yml; verify with `npm run dbt:rebuild` that pg_description gains the missing descriptions.
5. Extend `check-osmosis.sh` (or add a sibling check) to fail if `models/indicators/schema.yml` doesn't match the regenerated output (deterministic — like `dbt parse` checks).

**Why not (c)**: the open-by-default posture is recently load-bearing; lifting `marts.*` to a first-class API surface and then declining to document it is incoherent.

**Why not (a)**: short-term tax compounds with each new ingest source. Atlas adds ~1 source/week via the cloud-agent pipeline; (a) makes that more expensive forever.

**Why not (d) only**: misses the auto-population of source-specific columns. Contributor still has to author per-column descriptions every time, which is the cost (b) eliminates.

---

## Open questions

- **[Q1] What's the canonical column-name → manifest-dimension mapping?** The generator needs to know that SSB sources call it `region_code` while some FHI sources might use `geo` or `kommune_id`. A first pass is to read each indicator model's SQL and discover the column-rename mapping (`SELECT region as region_code` etc.). Could also live as an explicit `column_map:` field per manifest. Decide before building.
- **[Q2] Where does the conformed-columns dictionary live?** Options: (i) `atlas-data/dbt/conformed-column-descriptions.yml`, (ii) `seeds/sources/conformed_columns.csv` so it's queryable, (iii) inline as a fragment in `models/indicators/schema.yml` that the generator preserves. Tentatively (i) — keeps dbt project unchanged; generator reads YAML and emits YAML.
- **[Q3] Should this also cover the `supply__*` per-NGO models?** Same shape — per-NGO pass-throughs from raw to a normalized indicator-style mart. If yes, the generator scope grows. If no, supply gets its own follow-up. Tentatively yes for v1; it's the same generator with a different model-prefix filter.
- **[Q4] Migration strategy for the lone `indicators__ssb_08764` already-documented case.** The 3 hand-written column descriptions might be richer than what the generator produces from manifest.yml dimensions. Options: (i) regenerator overwrites them (loses content), (ii) generator preserves hand-edits via a marker comment (`# hand-authored — do not regenerate`), (iii) merge what's hand-written into manifest.yml dimensions, then regenerate everything. Tentatively (iii) — single source of truth.
- **[Q5] Does this generator pattern generalize beyond indicators?** Atlas has other model families (`dim_*`, `fact_*`, `mart_*`, `supply__*`) where similar repetition exists. Should this PLAN's deliverable be a *generic* description-generator with model-family filters, or specifically `indicators__*` only? Tentatively scope to indicators for v1; revisit when supply ships.

---

## Out of scope

- **Editing `manifest.yml` dimensions to fill gaps**. If a source's `dimensions:` block is incomplete, that's a separate authorship gap covered by `ingest-modules.md`'s contributor checklist. This INVESTIGATE assumes manifest dimensions are reasonably complete (they are for the 38+ sources currently shipped).
- **dbt-osmosis itself.** The propagation pipeline is fine; the input upstream of it (column descriptions on `indicators__*`) is what's missing. This INVESTIGATE doesn't touch osmosis config.
- **Raw schema descriptions.** Raw.* descriptions come from migration SQL `COMMENT ON COLUMN` statements, not from dbt sources YAML. Out of scope here — separate concern.
- **api_v1.* descriptions.** Already 100 % covered by the `apply-api-v1.sh` generator; no work needed.
- **Documenting `marts._*` private seeds** (`_sources_manifest`, `_sources_dimensions`, `lineage`, `eu_data_theme`). Already covered by `seeds/sources/schema.yml`; the persist_docs change in PR #89 already pushes those to pg_description after `dbt seed`.

---

## Cross-references

- [PLAN-007 Phase 2.11](../completed/PLAN-007-data-display-open-by-default.md) — introduced the `dimensions:` block on `manifest.yml` that this generator would consume.
- [PLAN-008 — Atlas-native developer discovery](PLAN-008-developer-discovery-surface.md) — Phase 2's lineage panel reads `meta_endpoints`; the descriptions surfaced via persist_docs feed every endpoint card.
- [`atlas-data/dbt/check-osmosis.sh`](../../../../atlas-data/dbt/check-osmosis.sh) — the existing description-coverage gate this generator would extend.
- [`atlas-data/dbt/dbt_project.yml`](../../../../atlas-data/dbt/dbt_project.yml) — `+persist_docs` config (PR #89) that makes column descriptions show up in pg_description.
- [PR #89](https://github.com/terchris/atlas/pull/89) — landed `+persist_docs`; the live verification of that PR is what surfaced the 249-column gap.
- [`atlas-data/dbt/models/indicators/schema.yml`](../../../../atlas-data/dbt/models/indicators/schema.yml) — the file this generator would regenerate.

---

## Next steps

- [ ] User reviews + accepts (or refines) the **(b) + (e)** recommendation.
- [ ] Resolve **[Q1]** — column-name mapping shape (per-source override file vs auto-discovery from SQL vs a `column_map:` field on manifest.yml).
- [ ] Spike the generator (~half day) on a single source (ssb-08764) to prove the manifest-dimensions → column-descriptions mapping works.
- [ ] On acceptance, draft `PLAN-indicators-schema-generator.md` with the generator design, conformed-columns dict authorship, CI gate extension, and the migration path for the existing hand-authored ssb-08764 case **[Q4]**.
- [ ] On PLAN completion, this INVESTIGATE moves backlog/ → completed/.

— signed, the Atlas implementation team (via Claude Code agent), 2026-05-09
