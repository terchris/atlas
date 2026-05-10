# Investigate: closing the schema.yml description gap on `indicators__*` models

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide a sustainable shape for column-level descriptions across the 23 `models/indicators/indicators__<source>.sql` per-source pass-through models — currently 25 % covered (72 of 288 columns documented), hard to fill by hand, repetitive across sources, but increasingly load-bearing now that `+persist_docs` (PR #89) pushes schema.yml descriptions into `pg_description` and PostgREST → MCP agents see them.

**Last Updated**: 2026-05-10 (spike findings + manifest schema refined to `derives:` + period-pattern templates; original 2026-05-09 framing preserved)

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

Generator inputs (refined post-spike, see "Spike findings" below):

- Every `atlas-data/ingest/src/sources/<id>/manifest.yml` — three sections feed the generator:
  - `dimensions:` blocks with **`derives:`** per dim (the dim's editorial content fanned out across the schema columns it produces — handles 1:1 *and* 1:N derivations cleanly), optionally replaced by `derived_via: <template_name>` to reference a shared period-pattern template
  - **`enriched_columns:`** at the top level — for join-derived columns that don't trace back to an upstream dim (e.g. bufdir's `indicator_slug` from the `bufdir_indicator_alias` seed)
- One shared `atlas-data/dbt/conformed-column-descriptions.yml` carrying:
  - `conformed_columns:` (~7 entries — `source_id`, `kommune_nr`, `fylke_nr`, `contents_label`, `value`, `status`, `updated_at`)
  - `period_templates:` — reusable definitions for common period shapes (`annual`, `rolling_period_3yr`, future `quarterly`, `monthly`). Each template defines the description for every derived column it produces. Multiple sources reference the same template via `derived_via:`.

Generator output: `models/indicators/schema.yml`, regenerated deterministically.

**Editorial work that stays human, vs work that disappears**:

| Surface | Editorial input today | Editorial input after this PLAN |
|---|---|---|
| `/data/sources/<id>` catalog card (description + dimensions) | `manifest.yml` (description + dimensions:) | Same — one place |
| `mart_meta_dimensions` editorial pass-through | `manifest.yml` `dimensions:` (via Phase 2.11 `_sources_dimensions` seed) | Same — one place |
| `models/indicators/schema.yml` column descriptions | **Hand-edited per source** (skipped 75 % of the time) | **Generated** from manifest + conformed dict |
| pg_description (Postgres COMMENT ON) | Already auto via `+persist_docs` (PR #89), but only for descriptions that exist in schema.yml | Now actually populated — generated schema.yml feeds it |
| PostgREST OpenAPI spec | Auto from pg_description | Auto from pg_description |
| atlas-frontend `/data/[schema]/[table]` column descriptions | Auto from PostgREST spec | Auto from PostgREST spec |
| dbt docs catalog.json | Auto from `dbt docs generate` (Phase 8 of bootstrap) | Auto from `dbt docs generate` |
| MCP tool definitions for AI agents | Auto from pg_description / dbt manifest | Auto from pg_description / dbt manifest |
| Future `developer-atlas.helpers.no` API reference | Auto from PostgREST spec via Scalar (PLAN-008 Phase 1) | Auto from PostgREST spec via Scalar |

Net editorial input per new dataset: **one `dimensions:` block in `manifest.yml`** (3-5 entries, written from upstream API knowledge — the contributor needs to know the data anyway). That single input feeds eight downstream surfaces. The generator + persist_docs + apply-api-v1.sh + dbt docs generate are the plumbing that fans it out.

**Runtime fan-out** (post-generator, post-PR-#89):

```
manifest.yml dimensions  ─┐
conformed-cols dict       ┤
                          ▼
       generator (runs in dbt:rebuild Phase "schema-gen")
                          ▼
       models/indicators/schema.yml (regenerated, committed)
                          │
                          ▼
                    dbt run (+persist_docs)
                          ▼
               pg_description (Postgres COMMENT ON)
                          │
        ┌──────┬──────────┼──────────┬──────────┐
        ▼      ▼          ▼          ▼          ▼
   PostgREST  /data    dbt docs    MCP       api-types.ts
   OpenAPI    catalog  catalog     tools     (codegen)
   spec       UI       JSON        for AI
                                   agents
```

Five real-world surfaces, one editorial input, one generator run.

**What this still doesn't auto-fix** (worth being explicit so the "fully automatic" claim doesn't oversell):

- The `dimensions:` block still needs human authorship. A generator can't invent what `EUskala60` means or what region-code prefixes signify. But it's once, in one file, in the contributor's natural catalog-authorship workflow.
- The conformed-columns dict needs first-time authorship (~7 entries × 1 paragraph each = ~30 min, one time).
- New atlas-conformed columns added in the future (rare — Atlas's mart shape has been stable since PLAN-001) need an entry in the dict.
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

Per-model breakdown for the SSB indicator models (23 indicators models total across SSB / FHI / Bufdir; 9 SSB ones shown):

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
```

FHI / Bufdir / SSB-crime indicators — same pattern, mostly zero.

The 3 columns that ARE documented on `indicators__ssb_08764` are `region_code`, `year`, `contents_code` — the **source-specific** ones (mapped from upstream `Region`, `Tid`, `ContentsCode` dimensions). The 7 atlas-conformed columns (`source_id`, `kommune_nr`, `fylke_nr`, `contents_label`, `value`, `status`, `updated_at`) are undocumented even there. Why this matters: it confirms the manifest-dimensions → indicator-columns mapping is the right shape — every existing description ALREADY corresponds 1:1 to a manifest dimension entry. Migration concern in [Q4] is therefore well-bounded.

---

## Spike findings (2026-05-10) — manifest schema needs `derives:` + `enriched_columns:`

Did a 30-min thought-experiment spike against three indicator-shape examples to verify the original Q1 `column_map:` design held up. **It didn't fully** — three real issues surfaced. Findings below; the resolved Q1 was updated to absorb them.

| Source | Manifest dims | Schema columns | 1:1 mapping works? |
|---|---|---|---|
| `indicators__ssb_08764` | 3 (Region, ContentsCode, Tid) | 10 (3 src-specific + 7 conformed) | ✅ Clean — every src-specific column maps to one dim |
| `indicators__fhi_mobbing` | 6 (GEO, AAR, KJONN, TRINN, SPM_ID, MEASURE_TYPE) | 16 columns | ❌ **AAR derives 4 columns** (`period`, `period_start_year`, `period_end_year`, `year`) — simple `column_map:` covers only 1 |
| `indicators__bufdir_barnefattigdom` | 6 (`indicator_api_id`, `region_code`, `category_unit`, `category_format`, `year`, `values_json`) | 8+ columns including `indicator_slug`, `indicator_group_slug`, `indicator_name`, `indicator_title`, `link_text` | ❌ **Schema has join-enriched columns** (from `bufdir_indicator_alias` seed) that don't exist as upstream dims at all |

### Three issues

1. **Multi-column derivation from one dim** (fhi-mobbing). Atlas's data model deliberately *explodes* a 3-year period like `AAR='2022_2024'` into four schema columns: `period` (raw string), `period_start_year` (2022), `period_end_year` (2024), `year` (midpoint = 2023). One upstream dim → four schema columns. The simple `column_map: { AAR: period }` only covers one. **This is intentional architecture** — Atlas's "midpoint-year + period evidence" pattern is what makes cross-source temporal joins possible (mobbing's 3-year rolling × ssb's annual income data, both align on `year`); it can't be removed without crippling the join story.

2. **Join-enriched columns** (bufdir). `indicators__bufdir_barnefattigdom` joins with the `bufdir_indicator_alias` seed to add `indicator_slug`, `indicator_name`, `link_text`, etc. These columns aren't upstream — they're Atlas-side enrichments produced by the indicator model's SQL JOIN. The manifest's `dimensions:` block can't represent them because they have no upstream-dim source.

3. **Conformed/source-specific gray zone**. `region_code` looks conformed (atlas-side standardisation, FK target shape) but actually carries the upstream raw region code with semantics that differ per source (SSB's 6-digit bydel codes vs FHI's mixed-length codes). The simple two-dict (manifest + conformed) doesn't capture this. Resolution: treat `region_code` as derived-from-dim per source rather than conformed; the conformed-cols dict no longer claims it.

### How the schema extension absorbs all three

Manifest schema gains two optional fields. Worked example for fhi-mobbing:

```yaml
dimensions:
  - code: AAR
    meaning: 3-year rolling period
    value_format: '"YYYY_YYYY" range string'
    notes: "7 periods, e.g. 2016_2018 through 2022_2024"
    derived_via: rolling_period_3yr   # ← references shared template (covers issue 1)

  - code: KJONN
    meaning: Sex
    derives:
      sex: ~                          # ← `~` = "use the dim's meaning + value_format + notes"

  - code: SPM_ID
    meaning: Question id (bullying composite)
    derives:
      question_id: ~

# (other dims similar)
```

For bufdir's join-enriched columns:

```yaml
enriched_columns:                     # ← top-level (covers issue 2)
  - name: indicator_slug
    description: "Stable slug from bufdir_indicator_alias seed; renumbering events bridge through the alias historical_id → canonical_id mapping."
  - name: indicator_name
    description: "Display name from bufdir_indicator_alias seed."
  - name: link_text
    description: "Anchor text for the upstream-page deep link, from bufdir_indicator_alias."
```

Period-pattern templates living in `conformed-column-descriptions.yml`:

```yaml
period_templates:
  annual:
    year: "Calendar year, 4-digit integer."
    period: "Same as year (single-year sources)."
    period_start_year: "Equals year (single-year period)."
    period_end_year: "Equals year (single-year period)."

  rolling_period_3yr:
    period: "Raw 3-year period string passed through (e.g. '2022_2024')."
    period_start_year: "First year of the rolling 3-year window."
    period_end_year: "Last year of the rolling 3-year window."
    year: "Midpoint year of the window. Use this for cross-source temporal joins; preserves the join-on-year invariant Atlas's fact tables rely on."
```

Future quarterly / monthly sources add `quarterly`, `monthly` templates the same way. Each template is the period-merging policy in template form — the shared library where Atlas's "midpoint year + period evidence" pattern is documented as code. **No separate "Atlas period-merging policy" INVESTIGATE needed — the templates are the policy.**

### Coverage after the refinement

For the three spike-tested sources:

- **ssb-08764**: 10/10 documented — 3 src-specific dims with `derives: { col: ~ }` + 7 conformed.
- **fhi-mobbing**: 16/16 documented — AAR uses `derived_via: rolling_period_3yr` (4 cols), 5 other dims with `derives:`, 7 conformed.
- **bufdir-barnefattigdom**: 8+/8+ documented — 6 dims with `derives:` (some 1:1, some 1:N), 5 enriched columns at top level.

Net: every column gets a description after one editorial pass per source.

---

## Why hand-filling is the wrong shape

`indicators__*` models follow a near-identical column shape across sources. Verified against `indicators__ssb_08764` and `indicators__ssb_06913`:

| Atlas-conformed columns (consistent across indicators models) | Source-specific columns (from upstream dimensions) |
|---|---|
| `source_id` (always `'<provider>-<table-id>'`) | `region_code` (mapped from upstream `Region`-like dim) |
| `kommune_nr` (FK to `dim_kommune`) | `year` (mapped from upstream `Tid`/year dim) |
| `fylke_nr` (FK to `dim_fylke`) | `contents_code` (mapped from upstream `ContentsCode`-like dim) |
| `contents_label` (decoded label) | (some sources have additional source-specific dims) |
| `value` (numeric) | |
| `status` (e.g. `'..'` for suppressed) | |
| `updated_at` (loaded timestamp) | |

That's ~7 atlas-conformed columns × 23 sources ≈ 161 conformed-column descriptions, plus ~3 source-specific × 23 ≈ 69 source-specific = ~230 total schema.yml descriptions in the load-bearing fully-documented state. Today only 72 are written. Hand-filling the remaining ~160 is real labor and creates the wrong incentive — the conformed-column descriptions become the primary place to update if `kommune_nr` semantics change across all 23 sources at once, instead of the canonical dim/fact models that own those concepts.

Equally, `dbt-osmosis` (already in use) propagates descriptions across the dbt graph but **only when there's a parent description to propagate**. Today most `indicators__*` parents (`raw.*` sources via `models/sources/sources.yml`) have *table*-level descriptions but few *column*-level ones. So osmosis has nothing to lift.

The interesting observation: **Atlas already captures the source-specific semantic content in `manifest.yml`'s `dimensions:` block** (PLAN-007 Phase 2.11). Each upstream dimension gets `code`, `meaning`, `value_format`, `notes`. That's exactly the editorial content that would belong on the corresponding `indicators__*` column.

So the question this INVESTIGATE settles is: **how do we close this gap without writing 250 redundant descriptions by hand, and without losing the ability to refine them per-source where it matters?**

---

## Options

### (a) Hand-fill all 216 missing indicator-column descriptions

Just write them. 23 sources × ~7 conformed + ~3 source-specific = ~230 descriptions, of which 72 are already written, leaving ~158-216 (counting depends on which models have which columns). ~1-2 days of mechanical work.

- **Pro**: simple, no new tooling, every column gets a tailored description.
- **Pro**: easy to refine post-hoc — no generator to re-run.
- **Con**: ~160 conformed-column descriptions are near-copies of each other. Drift risk: ssb-12063's `kommune_nr` description vs ssb-12131's `kommune_nr` description will differ over time if no canonical source exists.
- **Con**: every new ingest source repeats the work. As the cloud-agent pipeline (opened 2026-05-04) onboards more sources, this becomes a recurring tax.
- **Verdict**: works in the short term; fragile as the source count grows. Skip if a generator path is viable.

### (b) Generate `indicators__*` descriptions from manifest.yml dimensions + a shared atlas-conformed-columns dictionary

A small generator (TypeScript, lives at `atlas-data/dbt/scripts/generate-indicator-descriptions.py` or .ts) does this on every run:

1. Read every `atlas-data/ingest/src/sources/<source_id>/manifest.yml`.
2. For each source, walk its `dimensions:` block — map upstream dimension `code` to the corresponding indicator column name (e.g. `Region` → `region_code`; `Tid` → `year`; `ContentsCode` → `contents_code`). Per-source override map handles nonstandard mappings.
3. Combine with a single shared `atlas-data/dbt/conformed-column-descriptions.yml` (~7 entries) that documents the atlas-conformed columns once: `source_id`, `kommune_nr`, `fylke_nr`, `contents_label`, `value`, `status`, `updated_at`. Hand-authored once; reused 23 times.
4. Rewrite the consolidated `models/indicators/schema.yml` (Atlas's dbt-osmosis convention is one schema.yml per directory; the generator preserves that shape).
5. Wire as a pre-commit hook or CI step that fails if the generated output doesn't match the committed schema.yml — analogous to `check-osmosis.sh`'s existing gate.

- **Pro**: ~230 descriptions become 1 conformed-columns file (7 entries) + 23 manifest `dimensions:` blocks (which Atlas already maintains for the catalogue per Phase 2.11).
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

- The ~7 atlas-conformed columns generated from a single shared dictionary (covers ~70 % of the missing volume — 161 of ~230 total).
- The ~3 source-specific columns hand-written in each `indicators__<source>` schema.yml (covers the remaining ~30 %).

- **Pro**: smaller initial generator (no manifest.yml integration; just a shared dict and a list of sources).
- **Pro**: source-specific columns get hand-tailored descriptions where the editorial work has high payoff.
- **Con**: contributor still has to write something per new source — a regression vs (b) where dimensions:-block authoring covers source-specific automatically.
- **Verdict**: plausible if (b)'s manifest-dimension mapping turns out to be too brittle. Keep as Plan B.

### (e) Enforce going forward via `check-osmosis.sh`, accept the 216-column debt

Bump `check-osmosis.sh` (or add a sister gate) to fail when an `indicators__*` model has a column without a `description:` line. Don't fix the 216 today; require all NEW columns to be documented; over time the debt clears as sources are touched.

- **Pro**: stops the bleeding. Zero immediate fixing required.
- **Pro**: the gate is cheap (one grep).
- **Con**: doesn't help today's AI / MCP consumers. The 216 stay missing for months/years.
- **Con**: makes adding a new ingest source slightly more painful (the contributor now has to author column descriptions hand-by-hand, which is the labor (b) explicitly avoids).
- **Verdict**: a reasonable *complement* to (b) — generator fills today's gap, the gate prevents tomorrow's. Not a standalone answer.

---

## Decision

**(b) + (e)** — generator + CI gate. This is the only option that delivers the "single editorial input → every consumer fed" end-state described above; the others either keep contributor labor proportional to source count (a, d) or punt on the open-by-default gap (c) or stop the bleeding without healing it (e alone).

Specifically:

1. Author `atlas-data/dbt/conformed-column-descriptions.yml` — one entry per atlas-conformed column (~7 columns × ~1 paragraph each). One-time editorial pass; ~30 min.
2. Build `atlas-data/dbt/scripts/generate-indicator-descriptions.py` — reads manifest.yml dimensions + the conformed dict, emits a regenerated `models/indicators/schema.yml`. ~150 lines.
3. Add per-source override map in the script for column-name mismatches (`Region` → `region_code` etc). ~15 entries to start (Q1 settles the shape).
4. Run the generator; commit the regenerated schema.yml; verify with `npm run dbt:rebuild` that pg_description gains the missing descriptions.
5. Extend `check-osmosis.sh` (or add a sibling check) to fail if `models/indicators/schema.yml` doesn't match the regenerated output (deterministic — like `dbt parse` checks).

**Why not (c)**: the open-by-default posture is recently load-bearing; lifting `marts.*` to a first-class API surface and then declining to document it is incoherent.

**Why not (a)**: the conformed-column tax compounds with each new ingest source. As the cloud-agent pipeline (opened 2026-05-04) onboards more sources, (a) keeps contributor labor proportional to source count forever — exactly the lock-in this INVESTIGATE is set up to avoid.

**Why not (d) only**: misses the auto-population of source-specific columns. Contributor still has to author per-column descriptions every time, which is the cost (b) eliminates.

---

## Resolved sub-decisions (Q1-Q5)

All five settled 2026-05-10. Original options + analysis preserved for historical record; the **Resolved →** line at the top of each is the firm answer.

- **[Q1] Column-name → manifest-dimension mapping shape.**
  - **Resolved (initial 2026-05-10) →** (ii) explicit `column_map:` field on manifest.yml.
  - **Refined post-spike (2026-05-10) →** **`derives:` field per dim + `enriched_columns:` top-level + period-pattern templates in the conformed-cols dict.** The original `column_map:` design assumed a 1:1 dim→column relationship that doesn't hold across all sources (fhi-mobbing's `AAR` derives 4 columns; bufdir has join-enriched columns with no upstream dim). The refined shape:
    - Each dim's `derives:` block maps the dim to one or more schema columns; `derives: { col: ~ }` inherits the dim's meaning+value_format+notes (the 1:1 case); `derives: { col: "..." }` overrides with a column-specific description.
    - `derived_via: <template>` references a shared period-pattern template (e.g. `rolling_period_3yr`, `annual`) that defines descriptions for all derived columns the pattern produces. Avoids re-authoring identical period descriptions across 3-year-rolling FHI sources.
    - Top-level `enriched_columns:` declares descriptions for join-derived columns that don't trace back to an upstream dim.
  - Decided over (i) auto-derive (fragile against CTEs/macros) and (iii) central override file (drift across files). The `derives:` shape keeps the dim's editorial content next to its column-list; templates absorb the cross-source repetition without forcing a centralised override file.
  - **Loss accepted**: contributors author `derives:` per dim + `derived_via:` references + occasionally `enriched_columns:`. ~5-8 manifest fields per source on average vs the original "zero-touch" promise. Reliability + full coverage win.

- **[Q2] Conformed-columns dictionary location.**
  - **Resolved →** **(i) standalone YAML** at `atlas-data/dbt/conformed-column-descriptions.yml`. Decided over (ii) seed CSV (multi-line prose descriptions are awful in CSV) and (iii) inline-with-marker (generator-preserved fragments tend to drift).
  - **Loss accepted**: the conformed columns aren't queryable via PostgREST in v1 (which a seed-CSV would have given for free, useful for MCP agents discovering Atlas's standard column semantics). Recoverable later: the generator can emit a derived seed CSV as a side-effect of the YAML; not blocking; not v1.

- **[Q3] Cover `supply__*` per-NGO models?**
  - **Resolved →** **No, scope to `indicators__*` for v1, but build the generator with a model-family registry** so adding `supply__*` later is a config change, not a refactor. The generator has an enum of registered model families (initially: `indicators`); each family points at its own conformed-cols dict path. v1 ships with only `indicators` registered. When folkehjelp ships and supply has 2+ models, registering `supply__*` is one PR away. Estimated extra cost: ~30 LOC vs hard-coding `indicators__*` everywhere.
  - **Loss accepted**: `supply__redcross_branches` (today) + `supply__folkehjelp_chapters` (incoming) keep the description gap until v2 of this generator. Real, but bounded — the architectural cost of supply registration is small thanks to the registry shape, so v2 is fast.

- **[Q4] Migration of `indicators__ssb_08764`'s 3 hand-written descriptions.**
  - **Resolved →** **(iii) merge into manifest, regenerate**. Verified 2026-05-10 that the 3 hand-written descriptions (`region_code`, `year`, `contents_code`) are functionally equivalent to ssb-08764's manifest dimensions (`Region`, `Tid`, `ContentsCode`) — which actually have richer content (`value_format` + `notes` fields the hand-written versions lack). Generator output format: `<meaning>. Value format: <value_format>. <notes>` → strictly richer than today's hand-written. No information loss; net gain.
  - **Loss accepted**: hand-tuning a single column's description is no longer possible — any future "this phrasing is better" change goes in `manifest.yml`. Tiny loss; usually a feature (manifest descriptions flow to `meta_dimensions`, sources detail page, and the catalog all at once).

- **[Q5] Generalise beyond `indicators__*` to `dim_*`, `fact_*`, `mart_*`?**
  - **Resolved →** **No, scope to `indicators__*` for v1**. `dim_*` / `fact_*` / `mart_*` are already well-documented because `check-osmosis.sh` enforces hygiene there. The gap was specifically the auto-generated-style `indicators__*` pass-throughs that escaped the gate. Generalising would either replace hand-written content (lossy) or duplicate it (drift). The model-family registry from [Q3] does keep the door open if the calculus changes.
  - **Loss accepted**: smallest loss of the five — universal coverage isn't valuable when the universal already exists.

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

- [x] **(b) + (e)** decision settled (2026-05-10).
- [x] Q1-Q5 resolved (2026-05-10) — see "Resolved sub-decisions" above.
- [x] Spike done (2026-05-10) — three real issues found; manifest schema refined to `derives:` + `enriched_columns:` + period-pattern templates. See "Spike findings" section above. Q1's resolution updated to absorb the changes.
- [ ] Draft `PLAN-indicators-schema-generator.md` against the refined design. Phases:
    1. Author `atlas-data/dbt/conformed-column-descriptions.yml` — `conformed_columns:` (~7 entries) + `period_templates:` (`annual` + `rolling_period_3yr` for v1; future `quarterly` / `monthly` added incrementally).
    2. Build generator with model-family registry — `indicators__*` registered; reads dims (with `derives:`/`derived_via:`), enriched_columns, and the conformed-cols + templates dict.
    3. Migrate all 23 manifests — add `derives:` per dim (often `~` for 1:1) and `derived_via:` for period-rolling sources; add `enriched_columns:` to bufdir-barnefattigdom.
    4. Regenerate `models/indicators/schema.yml`; verify via `npm run dbt:rebuild` that pg_description gains the missing descriptions.
    5. Extend `check-osmosis.sh` with a generator-diff gate (committed schema.yml must match regenerated output).
    6. Wire `schema-gen` phase into bootstrap + `dbt:rebuild` (between `seed` and `run`).
- [ ] On PLAN ship, this INVESTIGATE moves backlog/ → completed/.

— signed, the Atlas implementation team (via Claude Code agent), 2026-05-09
