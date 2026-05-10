# PLAN: Generate `indicators__*` schema.yml from manifest dimensions

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Replace hand-edited `models/indicators/schema.yml` (currently 25 % column coverage) with a generated artefact derived from each source's `manifest.yml` dimensions + a shared conformed-columns dict + period-pattern templates. After this PLAN ships, adding a new ingest source means authoring `dimensions:` in `manifest.yml` once — every column description in marts/api_v1/PostgREST/dbt-docs/MCP is filled automatically.

**Investigation**: [INVESTIGATE-indicators-schema-coverage.md](INVESTIGATE-indicators-schema-coverage.md) — settles the (b)+(e) decision, resolves Q1-Q5, and captures the 2026-05-10 spike that refined the manifest schema to use `derives:` + `derived_via:` + `enriched_columns:` instead of the original simpler `column_map:` shape.

**Last Updated**: 2026-05-10

**Prerequisites**:
- ✅ `+persist_docs` enabled in `dbt_project.yml` ([PR #89](https://github.com/terchris/atlas/pull/89)) — what makes the descriptions actually reach `pg_description` once schema.yml has them.
- ✅ `npm run bootstrap` Phase 8 (docs) live ([PR #89](https://github.com/terchris/atlas/pull/89)) — refreshes `target/catalog.json` for the dbt docs UI after the schema.yml regenerates.
- ✅ `manifest.yml` `dimensions:` block convention shipped ([PLAN-007 Phase 2.11](../completed/PLAN-007-data-display-open-by-default.md)) for all 41 ingest sources.
- ✅ `apply-api-v1.sh` re-emits api_v1 wrapper COMMENTs on every cycle (PLAN-004) — unaffected by this work but sits in the same pipeline.

**Blocks**: None remaining.

---

## Problem summary

PR #89 made marts.* + raw.* PostgREST endpoints visible to AI/MCP agents (open-by-default), and `+persist_docs` made schema.yml descriptions flow into `pg_description` for those endpoints. But `indicators__*` schema.yml is only 25 % covered (72 of 288 columns documented), so most of the indicator surface still reads as naked column names to agents.

INVESTIGATE-indicators-schema-coverage chose option (b) — generate descriptions from `manifest.yml` dimensions + a shared conformed-columns dict + period-pattern templates. The 2026-05-10 spike verified this works for three indicator-shape examples (SSB / FHI rolling-period / bufdir join-enriched) and refined the manifest schema accordingly.

This PLAN executes that decision in six phases. Each phase has clear validation; the last phase wires the generator into the existing `dbt:rebuild` and `bootstrap` flows so future model edits stay consistent automatically.

---

## Phase 1: Author the conformed-columns + period-templates dict

The single hand-authored editorial input that gets reused for every source forever.

### Tasks

- [ ] 1.1 Create `atlas-data/dbt/conformed-column-descriptions.yml` with two top-level keys.
- [ ] 1.2 Author `conformed_columns:` — 7 entries, ~1 paragraph each:
    - `source_id` — the source's primary key in this row, always `'<provider>-<table-id>'` (e.g. `'ssb-08764'`). Useful when consuming `fact_kommune_indicators` to filter to a specific ingest source.
    - `kommune_nr` — 4-digit zero-padded kommune code. FK target on `dim_kommune.kommune_nr`. Filter `dim_kommune.is_active = true` when joining (per `project_dim-kommune-is-active-filter.md` memory rule).
    - `fylke_nr` — 2-digit zero-padded fylke code. FK target on `dim_fylke.fylke_nr`.
    - `contents_label` — human-readable label for `contents_code` (e.g. `'Personer'` for `Personer`). Sourced from upstream classification metadata where available, blank otherwise.
    - `value` — the indicator's numeric value (count, percentage, ratio, etc.). Unit conventions vary per source; cross-source aggregation requires reading each source's `dimensions:` notes.
    - `status` — upstream suppression marker (e.g. `'..'` for SSB-style suppressed cells, `null` for normal rows).
    - `updated_at` — Atlas-side timestamp of when the row was loaded (provenance), not the upstream's "data updated" timestamp.
- [ ] 1.3 Author `period_templates:` — 2 entries for v1 (`annual`, `rolling_period_3yr`); future `quarterly`, `monthly`, etc. added incrementally as sources of those shapes land.
    ```yaml
    period_templates:
      annual:
        year: "Calendar year, 4-digit integer."
        period: "Same as year (single-year sources). Pass-through for compatibility with rolling-period sources."
        period_start_year: "Equals year (single-year period)."
        period_end_year: "Equals year (single-year period)."

      rolling_period_3yr:
        period: "Raw 3-year period string from upstream (e.g. '2022_2024')."
        period_start_year: "First year of the rolling 3-year window."
        period_end_year: "Last year of the rolling 3-year window."
        year: "Midpoint year of the window. Use this for cross-source temporal joins; preserves the join-on-year invariant Atlas's fact tables rely on."
    ```

### Validation

```bash
# File parses as valid YAML
uv run python -c "import yaml; print(yaml.safe_load(open('atlas-data/dbt/conformed-column-descriptions.yml')).keys())"
# → dict_keys(['conformed_columns', 'period_templates'])

# Conformed columns present (7 entries)
uv run python -c "import yaml; print(len(yaml.safe_load(open('atlas-data/dbt/conformed-column-descriptions.yml'))['conformed_columns']))"
# → 7

# Period templates present (2 for v1)
uv run python -c "import yaml; print(list(yaml.safe_load(open('atlas-data/dbt/conformed-column-descriptions.yml'))['period_templates'].keys()))"
# → ['annual', 'rolling_period_3yr']
```

### Done when

- File exists, parses, contains both keys, has the 7 conformed entries + 2 period templates.

---

## Phase 2: Build the generator with model-family registry

The generator is the executable form of the decisions in INVESTIGATE-indicators-schema-coverage.

### Tasks

- [ ] 2.1 Create `atlas-data/dbt/scripts/generate-indicator-descriptions.py`. Single entry point: `python scripts/generate-indicator-descriptions.py [--check]`. The `--check` flag runs in dry-run-diff mode (used by the CI gate in Phase 5).
- [ ] 2.2 Implement the **model-family registry**. Initially registers `indicators__*` only, but the abstraction supports adding `supply__*` later as a one-line config change:
    ```python
    MODEL_FAMILIES = {
        "indicators": {
            "model_prefix": "indicators__",
            "schema_yml_path": "models/indicators/schema.yml",
            "conformed_dict_key": "conformed_columns",  # what to read from the dict
        },
        # Future: "supply": { ... }
    }
    ```
- [ ] 2.3 Read inputs:
    - Every `atlas-data/ingest/src/sources/*/manifest.yml` (parse `dimensions:` with `derives:` / `derived_via:` per dim, plus `enriched_columns:` at top level if present).
    - `atlas-data/dbt/conformed-column-descriptions.yml` (Phase 1 output).
- [ ] 2.4 For each source, expand each dim's column list:
    - **`derives: { col: ~ }`** → use the dim's `meaning. Value format: <value_format>. <notes>` as the column's description.
    - **`derives: { col: "..." }`** → use the explicit string.
    - **`derived_via: <template>`** → look up `period_templates[<template>]` and emit one entry per derived column with the template's description.
- [ ] 2.5 For each source, emit conformed-column descriptions from the shared dict (one entry per conformed-col that the indicator model actually has).
- [ ] 2.6 For each source, emit `enriched_columns:` descriptions verbatim.
- [ ] 2.7 Write the generated content to `models/indicators/schema.yml` as a single consolidated file (Atlas's dbt-osmosis convention). Include a comment header marking it generated:
    ```yaml
    # GENERATED FILE — do not edit by hand.
    # Source of truth: atlas-data/ingest/src/sources/<id>/manifest.yml
    # Generator: atlas-data/dbt/scripts/generate-indicator-descriptions.py
    # Run `npm run dbt:rebuild` (or bootstrap Phase schema-gen) to regenerate.
    ```
- [ ] 2.8 Implement `--check` mode: regenerate to a temp file, diff against the committed `models/indicators/schema.yml`, exit non-zero if they differ. This is the deterministic-output property the CI gate (Phase 5) relies on.
- [ ] 2.9 Preserve existing `data_tests:` and `data_type:` blocks per column. The generator only writes `description:` lines; tests and types stay in the committed schema.yml. (See [Q1] in the INVESTIGATE — descriptions are the only generator output.)

### Validation

```bash
cd atlas-data/dbt
uv run python scripts/generate-indicator-descriptions.py
# Should emit: models/indicators/schema.yml (regenerated)

uv run python scripts/generate-indicator-descriptions.py --check
# After fresh generation, --check should be a no-op (exit 0).

# Idempotent — re-running produces the same output
uv run python scripts/generate-indicator-descriptions.py
git diff models/indicators/schema.yml
# → no diff
```

### Done when

- Generator runs against the existing 23 manifests + the conformed dict; produces a valid schema.yml.
- `--check` mode is deterministic (re-running on unchanged inputs is a no-op).
- Generator preserves all `data_tests:` and `data_type:` blocks; only writes `description:` lines.

---

## Phase 3: Migrate all 23 manifests to the new schema

Bulk authorship. Most mechanical; per-source effort is low because manifests already have `dimensions:` blocks (Phase 2.11 of PLAN-007).

### Tasks

- [ ] 3.1 Author a per-source migration helper script if needed (or do by hand). For each source:
    - Inspect the indicator model's SQL (`models/indicators/indicators__<id>.sql`) to identify which schema columns derive from which manifest dim.
    - Add `derives:` to each dim that maps cleanly 1:1 (`derives: { <col>: ~ }`).
    - For period dims (`AAR`, `Tid`), use `derived_via: rolling_period_3yr` or `derived_via: annual` instead.
    - For dims that derive into multiple columns NOT covered by a template, use `derives: { col1: "...", col2: "..." }` inline.
- [ ] 3.2 Migration sweep — work through all 23 sources. Estimated time per source: 2-5 min for SSB pattern (clean 1:1), 5-10 min for FHI rolling-period sources, 15-20 min for bufdir-barnefattigdom (the bespoke shape).
- [ ] 3.3 For `bufdir-barnefattigdom` specifically — add `enriched_columns:` at top level for `indicator_slug`, `indicator_group_slug`, `indicator_name`, `indicator_title`, `link_text` (the join-derived columns from `bufdir_indicator_alias` seed).
- [ ] 3.4 Update `atlas-data/dbt/scripts/build_sources_seed.py` to validate `derives:` / `derived_via:` / `enriched_columns:` shape on read — refuse to emit the seed if a manifest references an undefined `derived_via:` template or has malformed `derives:`.

### Validation

```bash
# All 23 manifests parse + validate against the schema
cd atlas-data/dbt && uv run python scripts/build_sources_seed.py
# → no errors

# Spot-check: every source has either `derives:` or `derived_via:` on every dim
python3 -c "
import yaml, glob
for path in glob.glob('atlas-data/ingest/src/sources/*/manifest.yml'):
    m = yaml.safe_load(open(path))
    for dim in m.get('dimensions', []):
        if 'derives' not in dim and 'derived_via' not in dim:
            print(f'MISSING: {path} — dim {dim[\"code\"]}')
"
# → no MISSING output
```

### Done when

- All 23 manifests have `derives:` or `derived_via:` on every dim.
- `bufdir-barnefattigdom`'s manifest has `enriched_columns:` for the 5 join-derived columns.
- `build_sources_seed.py` validates the new fields and refuses malformed input.

---

## Phase 4: Regenerate `models/indicators/schema.yml` + verify

The payoff phase — schema.yml gets regenerated against the now-complete manifests, descriptions flow through to PostgREST/MCP.

### Tasks

- [ ] 4.1 Run `python scripts/generate-indicator-descriptions.py` to regenerate `models/indicators/schema.yml`. Commit the result.
- [ ] 4.2 Run `npm run dbt:rebuild` to materialise models with the new schema.yml content; `+persist_docs` issues `COMMENT ON COLUMN` for every newly-described column.
- [ ] 4.3 Verify pg_description coverage went up by curling marts.* spec:
    ```bash
    curl -sS -H 'Accept-Profile: marts' "http://api-atlas.localhost/" | jq '
      [.definitions[] | .properties // {} | to_entries[] |
       select(.value.description != null and .value.description != "")] | length
    '
    ```
    Expect: ~317 → ~530+ (the 216-column gap closes).
- [ ] 4.4 Spot-check three sources end-to-end:
    - `marts.indicators__ssb_08764` — every column has a description, derived columns from `Region`/`Tid`/`ContentsCode` show meaning + value_format.
    - `marts.indicators__fhi_mobbing` — `period_start_year`/`period_end_year`/`year` show the `rolling_period_3yr` template content.
    - `marts.indicators__bufdir_barnefattigdom` — `indicator_slug`, `indicator_name`, etc. show the enriched-column descriptions.

### Validation

```bash
# Coverage curl (target: ~530+ descriptions in marts.*)
curl -sS -H 'Accept-Profile: marts' "http://api-atlas.localhost/" | jq '[.definitions[] | .properties // {} | to_entries[] | select(.value.description != null and .value.description != "")] | length'

# Spot-check ssb-08764 column kommune_nr (was: blank)
curl -sS -H 'Accept-Profile: marts' "http://api-atlas.localhost/" | jq -r '.definitions.indicators__ssb_08764.properties.kommune_nr.description'
# → "4-digit zero-padded kommune code. FK target on dim_kommune.kommune_nr..."

# Spot-check fhi-mobbing year (was: blank, now: rolling-period midpoint)
curl -sS -H 'Accept-Profile: marts' "http://api-atlas.localhost/" | jq -r '.definitions.indicators__fhi_mobbing.properties.year.description'
# → "Midpoint year of the window. Use this for cross-source temporal joins..."

# Spot-check bufdir indicator_slug (was: missing entirely)
curl -sS -H 'Accept-Profile: marts' "http://api-atlas.localhost/" | jq -r '.definitions.indicators__bufdir_barnefattigdom.properties.indicator_slug.description'
# → "Stable slug from bufdir_indicator_alias seed..."
```

### Done when

- Marts.* description count rises from ~317 to ~530+ (the 216-column gap closes).
- Spot-checks across three source-shapes return the expected descriptions.
- No regression in api_v1.* coverage (still 104 columns documented).

---

## Phase 5: Extend `check-osmosis.sh` with the diff gate

Locks in the constraint that committed `schema.yml` must match the generator's output — prevents future drift.

### Tasks

- [ ] 5.1 Decide: extend `check-osmosis.sh` itself, or add a sibling `check-indicators-schema.sh`? Recommendation: sibling — keeps responsibilities separate. Osmosis checks "every column has a description"; the new gate checks "the indicator schema.yml matches what the generator would emit".
- [ ] 5.2 Implement the sibling. ~30 lines of bash. Runs `python scripts/generate-indicator-descriptions.py --check` and exits non-zero if there's a diff.
- [ ] 5.3 Wire it into the same CI / pre-commit path that runs `check-osmosis.sh` today.

### Validation

```bash
# After a clean Phase 4: check should pass
./check-indicators-schema.sh
# → ✓ models/indicators/schema.yml matches generator output

# Hand-edit a description in models/indicators/schema.yml to simulate drift
git apply <<EOF
@@ models/indicators/schema.yml
-        description: "Calendar year, 4-digit integer."
+        description: "tampered"
EOF

# Check should fail
./check-indicators-schema.sh
# → ✗ models/indicators/schema.yml is out of sync with the generator
# → diff: ...
```

### Done when

- `check-indicators-schema.sh` exists, exits 0 on a clean state and non-zero on drift.
- Wired into the same CI / pre-commit path as `check-osmosis.sh`.

---

## Phase 6: Wire `schema-gen` phase into bootstrap + `dbt:rebuild`

The "fully automatic" guarantee — every model rebuild regenerates the schema, no contributor checklist item.

### Tasks

- [ ] 6.1 Add a new `schema-gen` PhaseId to `atlas-data/ingest/scripts/bootstrap.ts`. Implement `phaseSchemaGen()` that spawns `python scripts/generate-indicator-descriptions.py` in `DBT_DIR`.
- [ ] 6.2 Insert `schema-gen` between `seed` and `run` in `ALL_PHASES` (since `dbt run` parses schema.yml as part of model compilation):
    ```typescript
    const ALL_PHASES: PhaseId[] = [
      "migrate", "refresh", "ingest", "seed", "schema-gen", "run", "api", "test", "docs",
    ];
    ```
    Bootstrap is now 9 phases.
- [ ] 6.3 Update `package.json` `dbt:rebuild` alias to include `schema-gen`:
    ```json
    "dbt:rebuild": "tsx --env-file=.env scripts/bootstrap.ts --only seed,schema-gen,run,api,test,docs"
    ```
- [ ] 6.4 Update `setup.md` phase table — 8 → 9 rows; row 6 is the new `schema-gen`.
- [ ] 6.5 Update `ingest-modules.md` trigger matrix — every "edited a manifest dim" / "edited a model SQL" row now includes `schema-gen` as part of `dbt:rebuild`. Brief description-flow paragraph extension: "After PLAN-indicators-schema-generator ships, the schema.yml regenerates as Phase schema-gen on every dbt:rebuild — contributors never edit it directly."

### Validation

```bash
# Dry-run shows 9 phases
npm run bootstrap -- --dry-run | grep "phases"
# → "9/9 phases (migrate → refresh → ingest → seed → schema-gen → run → api → test → docs)"

# --only schema-gen works in isolation
npm run bootstrap -- --only schema-gen
# → regenerates models/indicators/schema.yml; no other phase fires

# Full dbt:rebuild includes the schema-gen step
npm run dbt:rebuild
# → completes green; schema.yml regenerated; pg_description refreshed
```

### Done when

- `bootstrap` lists 9 phases including `schema-gen`.
- `dbt:rebuild` runs schema-gen between seed and run.
- `setup.md` + `ingest-modules.md` reflect the new flow.
- No regression — all existing tests + the new diff gate stay green.

---

## Acceptance criteria

- [ ] `atlas-data/dbt/conformed-column-descriptions.yml` exists, parses, has 7 conformed columns + 2 period templates.
- [ ] `atlas-data/dbt/scripts/generate-indicator-descriptions.py` runs deterministically, supports `--check`, has model-family registry.
- [ ] All 23 indicator manifests have `derives:` or `derived_via:` on every dim; `bufdir-barnefattigdom` has `enriched_columns:`.
- [ ] `models/indicators/schema.yml` regenerates from those inputs without manual edits.
- [ ] Marts.* PostgREST spec gains ~216 column descriptions (`marts.dim_kommune.kommune_nr.description` etc. become non-null).
- [ ] `check-indicators-schema.sh` runs in CI and gates against drift.
- [ ] `bootstrap` Phase 5 (`schema-gen`) wired in; `dbt:rebuild` updated.
- [ ] Contributor adding a new ingest source authors only the `manifest.yml` `dimensions:` block + (if needed) `derived_via:` / `enriched_columns:`. Never touches `models/indicators/schema.yml`.

---

## Out of scope

- **Generalising to `supply__*`, `dim_*`, `fact_*`, `mart_*`** — INVESTIGATE Q5 punted to v2; the model-family registry from Phase 2 keeps the door open.
- **Per-column overrides for already-documented sources** — INVESTIGATE Q4 chose merge-into-manifest over preserve-hand-edits. Hand-tuning a single column's wording happens by editing manifest.yml.
- **Documenting Atlas's period-merging policy outside the templates** — the period templates ARE the policy; if extra prose framing is needed later, it's a small contributor-doc PR, not a separate INVESTIGATE.
- **Making conformed-column descriptions queryable via PostgREST** (the v1 trade-off in Q2). If wanted later, generator emits a derived seed CSV as a side-effect.

---

## Files to modify

**New:**
- `atlas-data/dbt/conformed-column-descriptions.yml` — Phase 1.
- `atlas-data/dbt/scripts/generate-indicator-descriptions.py` — Phase 2.
- `atlas-data/dbt/check-indicators-schema.sh` — Phase 5.

**Updated (atlas-data):**
- `atlas-data/ingest/src/sources/<id>/manifest.yml` — 23 source files, Phase 3 manifest migration.
- `atlas-data/dbt/models/indicators/schema.yml` — Phase 4 regeneration. Becomes a generated artefact.
- `atlas-data/dbt/scripts/build_sources_seed.py` — Phase 3.4 validation update.
- `atlas-data/ingest/scripts/bootstrap.ts` — Phase 6.1/6.2 (new `schema-gen` phase).
- `atlas-data/ingest/package.json` — Phase 6.3 (`dbt:rebuild` alias updated).

**Updated docs:**
- `website/docs/contributors/setup.md` — Phase 6.4 (phase table 8 → 9 rows).
- `website/docs/contributors/ingest-modules.md` — Phase 6.5 (trigger matrix + description-flow paragraph).

---

## Cross-references

- [INVESTIGATE-indicators-schema-coverage.md](INVESTIGATE-indicators-schema-coverage.md) — the parent INVESTIGATE; this PLAN executes its (b)+(e) decision.
- [PR #89 — bootstrap Phase 8 + persist_docs](https://github.com/terchris/atlas/pull/89) — the prerequisite that makes pg_description the actual sink for these descriptions.
- [PLAN-007 Phase 2.11](../completed/PLAN-007-data-display-open-by-default.md) — introduced the `manifest.yml` `dimensions:` block; this PLAN consumes it.
- [PLAN-004 — postgrest api_v1 wrapper](../completed/PLAN-004-postgrest-api-v1-wrapper.md) — the api_v1 wrapper generator; pattern this PLAN's generator mirrors (deterministic regeneration, CI gate).
- [`atlas-data/dbt/check-osmosis.sh`](../../../../atlas-data/dbt/check-osmosis.sh) — the existing description-coverage gate; the new `check-indicators-schema.sh` sits alongside.
- [`atlas-data/dbt/dbt_project.yml`](../../../../atlas-data/dbt/dbt_project.yml) — `+persist_docs` config (PR #89) that completes the chain.

---

## Implementation notes

- **Phase order is hard.** Phase 1 must precede Phase 2 (generator reads the dict). Phase 2 + 3 can interleave but Phase 4's verification needs both done. Phase 5 needs Phase 4's clean state to baseline against. Phase 6 needs everything before to be stable.
- **Single PR vs split** — the natural shape is one PR for Phases 1+2+5 (the tooling), one PR for Phase 3+4 (the migration + verification), one PR for Phase 6 (the integration). Smaller PRs are reviewable; the tooling PR is the load-bearing one.
- **Phase 3's manifest migration is the bulk of the work**. Don't underestimate it. Plan for ~3-5 hours wall-time across 23 sources, more for bufdir-barnefattigdom.
- **Don't break api_v1 coverage.** apply-api-v1.sh emits its own COMMENT ON for api_v1.* views; this PLAN doesn't touch that. Sanity-check after Phase 4 that the 104 api_v1 column descriptions are still in place.
- **The CI gate (Phase 5) is what makes the system self-healing.** Without it, a contributor could hand-edit `models/indicators/schema.yml` and the file silently drifts. With it, the next CI run fails loudly with a diff.
- **Test the generator's idempotency early.** Phase 2's `--check` mode is the deterministic-output property the gate relies on. If two consecutive runs produce different output (e.g. dict iteration order, YAML emit order), the gate is unreliable.
- **Forkability**: `atlas-frontend/` is unaffected — this PLAN is entirely on the data side. No customer-frontend changes.
