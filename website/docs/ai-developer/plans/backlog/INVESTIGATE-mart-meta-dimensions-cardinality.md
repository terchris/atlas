# Investigate: `mart_meta_dimensions` cardinality + example-values enrichment

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog

**Goal**: Add the `cardinality`, `example_values`, and `null_count` columns to `mart_meta_dimensions` so the customer frontend's per-source detail page can show "what each upstream dimension *actually contains* in our raw landings", not just the editorial `meaning` text. Decide the column-name resolution strategy + the introspection mechanism. Output: a recommendation + a sequenced PLAN, **not** the implementation itself.

**Last Updated**: 2026-05-06

**Origin**: PLAN-007 phase 3.4 specified these three computed columns alongside the editorial pass-through. PR #73 shipped only the editorial half (`source_id`, `code`, `meaning`, `value_format`, `notes`) because the column-name-from-dim-code mapping needed its own design pass. This investigation closes that gap.

---

## What "cardinality + example_values" gives the consumer

Per the PLAN-007 design intent: the customer frontend renders one card per (source × upstream-dim) showing both **what the dim means** (editorial — already in the seed) and **what values it actually contains** (computed). Combining the two lets a shopper answer:

> *"This source has a `KJONN` dimension; it means 'Sex'; it has 3 distinct values which are `0` ('both'), `1` ('men'), `2` ('women') across 1,790 rows with zero nulls. So I can filter by sex if I want."*

Without cardinality, the catalogue tells consumers what a column represents but not what to expect when querying it. With cardinality, the catalogue is genuinely self-describing — shoppers don't need to issue probe queries before committing to a filter.

Three computed columns:

- `cardinality` — `COUNT(DISTINCT <column>)` from the source's raw table.
- `example_values` — `array_agg` of up to 10 distinct values, sorted by frequency desc then alpha. Lets consumers see the actual code list inline.
- `null_count` — count of rows where the dim column is NULL. Should be 0 for non-degenerate dims (the upstream's own constraints typically enforce this); a non-zero count is a quality signal.

---

## The column-name resolution problem

The `_sources_dimensions` seed has rows like:

| source_id | code | meaning |
|---|---|---|
| `ssb-08764` | `Region` | Region (national / fylke / kommune / bydel / historical) |
| `ssb-08764` | `Tid` | Year |
| `ssb-08764` | `ContentsCode` | Statistic measure |
| `fhi-mediebruk-some` | `GEO` | Region |
| `fhi-mediebruk-some` | `MEASURE_TYPE` | Which number |
| `bufdir-barnefattigdom` | `region_code` | Geographic code from workbook column Region |

The `code` is the upstream's own dimension name (often capitalised) — but the **column name in `raw.<source>` is different**. Empirically across the 41 sources:

- **SSB sources**: `Region` → `region_code`, `Tid` → `year` (integer, not text), `ContentsCode` → `contents_code` (+ `contents_label`)
- **FHI sources**: `GEO` → `geo_code`, `AAR` → `aar_code`, `KJONN` → `kjonn_code`, `ALDER` → `alder_code`, `MEASURE_TYPE` → `measure_type` (no `_code` suffix), `MEDIEBRUK` → `mediebruk_code`, `SOES` → `soes_code`
- **bufdir-barnefattigdom**: dimensions are *already in raw-column form* (`region_code`, `category_unit`, `category_format`, etc.) — no translation needed
- **redcross-branches**: dimensions are organisational (chapter_id, activity_id) — already-named raw columns

Pattern: roughly `<lowercase code>_code` *except* SSB `Tid` → `year` and FHI `MEASURE_TYPE` → `measure_type` and any source whose dims are already raw-column names.

---

## The multi-table source complication

Some source folders own multiple raw tables (`ssb-crime-tables` owns 4; `redcross-branches` owns 2 — see PR #77 for the `raw_tables:` field). Each manifest's `dimensions:` block describes the dims *common to those raw tables*, but a per-(source × dim) cardinality reading would need to choose:

1. **Pick the first raw table** in `raw_tables:` and use its column. Simple but masks differences.
2. **Sum or union across all raw tables** the source owns. Correct but more SQL.
3. **Compute one cardinality per (source × dim × raw_table)**, change the seed PK to `(source_id, code, raw_table)`. Most accurate; biggest schema change.

For the customer frontend's "what does this dim contain" use case, **(1) is fine** — the dimensions a multi-table source declares are already the *common* dims; differences across tables are typically just which content codes apply (which is `ContentsCode`-level, not `LovbruddKrim`-level).

---

## Options surveyed

### (a) Jinja loop in dbt with hardcoded per-source rules

`mart_meta_dimensions.sql` becomes a Jinja loop that reads `_sources_dimensions` at parse time via `run_query()`, generates one SELECT per (source × dim), and UNIONs them. Per-source column-name rules hardcoded in the SQL.

- **Pro**: keeps everything in dbt; no new tooling.
- **Con**: parse-time `run_query` requires the seed to be loaded first (chicken-and-egg ordering: dbt parse needs seed, seed needs dbt seed which needs parse). Workable but clumsy.
- **Con**: Hardcoded SSB / FHI / bufdir column-name rules in SQL — three different sets of `case when source_id = 'X' then ...` clauses. Bad code smell.
- **Con**: Each dbt run materialises a query that touches every raw.* table. At ~41 sources × ~5 dims average × hundreds of thousands of rows, this is O(rows × dims × sources). Will slow dbt run noticeably.
- **Verdict**: works, but ugly. Not recommended.

### (b) Python extract script (analogous to `extract_lineage.py`) that emits a `dimension_stats` seed

`scripts/extract_dimension_stats.py` connects to the live Postgres, iterates each (source × dim), runs three queries per pair, emits `seeds/sources/dimension_stats.csv`. `mart_meta_dimensions` LEFT JOINs the seed.

- **Pro**: clean separation — dbt stays declarative, Python handles the introspection.
- **Pro**: refresh ritual lines up with `extract_lineage.py` — `python scripts/extract_X.py && dbt seed && dbt run`.
- **Pro**: introspection runs once per refresh, not on every dbt run.
- **Con**: requires live-DB connection (so contributors with no DB miss the cardinality columns until they ingest).
- **Con**: stats can drift between the last extract and the next. For a stable catalogue this is fine; Atlas refreshes are weekly at most.
- **Verdict**: this is the clean approach. Recommended.

### (c) `column_name:` field on each `dimensions:` entry in `manifest.yml`

Each dim entry in manifest.yml gains an optional `column_name:` field that explicitly names the raw-table column. Default fallback rule: `<lowercase code>_code`.

```yaml
dimensions:
  - code: Tid
    meaning: Year
    column_name: year     # explicit override; default would be "tid_code" which is wrong
  - code: MEASURE_TYPE
    meaning: Which number
    column_name: measure_type   # default would be "measure_type_code"
  - code: GEO
    meaning: Region
    # column_name absent → defaults to "geo_code" ✓
```

- **Pro**: per-source-author authoritative declaration, no heuristic guessing.
- **Pro**: aligns with the `raw_tables:` pattern PR #77 just shipped — same "explicit override, sane default" ergonomic.
- **Pro**: composes cleanly with **either** (a) or (b) — they consume the column name; declaration lives in the manifest.
- **Con**: needs touching ~3 manifests to add overrides for the known exceptions (SSB Tid + FHI MEASURE_TYPE; bufdir/redcross dims are already raw-column-named).
- **Verdict**: companion to (b), not an alternative. Recommended together.

### (d) Heuristic-only column resolution at query time

`extract_dimension_stats.py` tries `<lowercase code>_code` first; if the column doesn't exist (via `information_schema.columns`), falls back to `<lowercase code>`; logs + skips on miss.

- **Pro**: zero manifest changes; introspection figures out the column name itself.
- **Pro**: handles MEASURE_TYPE → measure_type via the fallback.
- **Con**: SSB `Tid` → `year` doesn't fit the heuristic (would need a third special case in code).
- **Con**: silent skip on miss is the wrong default — operator error or genuine missing dim should fail loud.
- **Verdict**: the heuristic part is fine as a default rule, but pair with (c) so explicit overrides work for the special cases.

---

## Recommended outcome

**(b) + (c) combined**: a Python extract script that reads each manifest's `dimensions:` entries (with optional `column_name:` overrides), computes cardinality / example_values / null_count per (source × first-raw-table × dim), and emits a `dimension_stats` seed. `mart_meta_dimensions.sql` LEFT JOINs the seed to add the three columns. No manifest changes required for the 38 sources where `<lowercase code>_code` works; explicit overrides for the ~3 sources that need them.

### What changes

| File | Change |
|---|---|
| **New**: `atlas-data/dbt/scripts/extract_dimension_stats.py` | Reads each `manifest.yml`'s `dimensions:` block, resolves column name (explicit `column_name:` → fallback `<lowercase code>_code` → fallback `<lowercase code>`), connects to Postgres via `DATABASE_URL`, runs the three introspection queries per (source × dim), emits CSV. ~150 LOC. |
| **New**: `atlas-data/dbt/seeds/sources/dimension_stats.csv` | Generated. ~216 rows (one per editorial dim). |
| **Updated**: `atlas-data/ingest/src/sources/<id>/manifest.yml` (~3 sources) | Add `column_name:` to dimensions where the default rule doesn't match. Initial set: every SSB source's `Tid` → `year`; every FHI source's `MEASURE_TYPE` → `measure_type`. |
| **Updated**: `atlas-data/dbt/models/marts/api/mart_meta_dimensions.sql` | LEFT JOIN `{{ ref('dimension_stats') }}` on `(source_id, code)`. Add 3 new columns; keep existing 5. |
| **Updated**: `atlas-data/dbt/seeds/sources/schema.yml` | New entry for `dimension_stats` seed: `source_id` + `code` not_null + `relationships` to `_sources_dimensions`; `cardinality`, `example_values`, `null_count` types + descriptions. |
| **Updated**: `atlas-data/dbt/models/marts/api/schema.yml` | Three new column entries on `mart_meta_dimensions`. |
| **Updated**: `tests/api_v1_rowcount_matches_marts.sql` | No change — `meta_dimensions` row count unaffected; still ~216. |
| **Updated**: `atlas-data/ingest/src/sources/README.md` | Document the optional `column_name:` field per dim entry. |

### Refresh ritual

After ingest runs that change row counts:

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt parse
uv run python scripts/extract_dimension_stats.py
uv run --env-file ../ingest/.env dbt seed --select dimension_stats
uv run --env-file ../ingest/.env dbt run --select mart_meta_dimensions
./apply-api-v1.sh   # refresh the api_v1.meta_dimensions wrapper view
```

Same shape as the `extract_lineage.py` flow. Lives behind a `--check` drift gate for CI.

### Multi-table source policy

Pick **the first raw table in `raw_tables:`** (or the default-derived one) for cardinality reads. Document the decision inline in `mart_meta_dimensions`'s description so consumers know the cardinality reflects one raw table when a source owns several.

---

## Out of scope

- **Per-(source × dim × raw_table) cardinality** for multi-table sources. The simpler "first raw table" rule covers the documented use case (cards in the customer frontend); multi-table differential cardinality would warrant its own follow-up.
- **Cardinality refresh inside the ingest pipeline.** The Python script runs ad-hoc; integrating it into the per-source `recordIngestRun()` lifecycle is a future improvement.
- **Cardinality at the api_v1 layer with versioned drift detection.** Today's `api_v1.meta_dimensions` reads from the seed; if cardinality changes, downstream consumers see new numbers. That's correct for a live catalogue and out of scope for any "freeze the contract" semantics.

---

## Cross-references

- [PLAN-007-data-display-open-by-default.md § Phase 3.4](../active/PLAN-007-data-display-open-by-default.md#phase-3-marts.meta_sources--marts.meta_endpoints--marts.meta_dimensions-dbt-models) — the original spec that deferred this work.
- [PR #73](https://github.com/terchris/atlas/pull/73) — Phase 3 v1 that shipped the editorial pass-through; outcome notes flagged this as the open follow-up.
- [PR #77](https://github.com/terchris/atlas/pull/77) — `raw_tables:` field in manifest.yml; the same pattern this INVESTIGATE recommends for `column_name:`.
- [`extract_lineage.py`](../../../../atlas-data/dbt/scripts/extract_lineage.py) — the analogous Python extract script (option (b) follows its shape).

---

## Next steps

- [ ] User reviews + accepts (or refines) the recommended outcome.
- [ ] On acceptance, draft `PLAN-mart-meta-dimensions-cardinality.md` with the implementation steps + verification.
- [ ] Move this INVESTIGATE backlog/ → active/ when the PLAN starts; active/ → completed/ when it ships.

— signed, the Atlas implementation team (via Claude Code agent), 2026-05-06
