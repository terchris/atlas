# Plan: Foundation reference tables (SDG, ICNPO, postnummer, kommune-name crosswalk)

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Build four universal reference/dimension tables that don't depend on any NGO ingest, exercising three of the four refresh-cadence buckets from the just-codified [naming convention](../../../stack/naming-conventions.md): `ref_un_sdg` (never refresh), `ref_brreg_icnpo` (rare), `dim_postnummer` and `crosswalk_kommune_name` (periodic). Useful immediately for both demand-side (tagging existing 19 indicators with SDG/ICNPO context) and the future NGO-supply work. **Also**: migrate the existing 5 PLAN-001 seed refreshers off the consolidated `refresh-seeds.ts` script and onto the per-source pattern, so all 9 seeds (5 existing + 4 new) live in one consistent shape ready for Dagster automation.

**Last Updated**: 2026-04-23
**Completed**: 2026-04-23 — all 6 phases done. Two material deviations from the plan (resolved during implementation): see "Plan deviations" at the bottom.

**Convention**: [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) (just codified by PLAN-reference-tables-convention)
**Investigation**: implicit — these four tables were inventoried in [INVESTIGATE-reference-tables-convention.md](../completed/INVESTIGATE-reference-tables-convention.md) and [INVESTIGATE-ngo-supply-data-model.md](INVESTIGATE-ngo-supply-data-model.md).
**Blocks**: PLAN-A of NGO-supply (which uses three of these four tables).
**Priority**: Medium — small, useful in isolation, validates the convention end-to-end before NGO complexity lands.

---

## Overview

Four new lookup tables, all in `marts.*`, each loaded as a dbt seed (CSV in `atlas-data/dbt/seeds/`). Plus a one-time migration of the existing 5 PLAN-001 seeds onto the same per-source architecture.

| Table | Convention | Rows (est.) | Source | Refresh bucket | Refresh mechanism |
|---|---|---:|---|---|---|
| `ref_un_sdg` | ref_*  | 17 | UN | never | Hand-curated CSV; no script |
| `ref_brreg_icnpo` | ref_* | 42 (12 main + 30 subgroups) | [Brreg ICNPO endpoint](https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html) | rare | `npm run refresh:brreg-icnpo` |
| `dim_postnummer` | dim_* | ~5 000 | SSB Klass 488 | periodic (quarterly) | `npm run refresh:ssb-klass-postnummer` |
| `crosswalk_kommune_name` | crosswalk_* | ~700 (canonical + alt + historical) | SSB Klass 131 (alt names) + post-2020 merger lookup | periodic (annual + at reforms) | `npm run refresh:ssb-klass-kommune-names` |

Architecture: each refreshable seed lives in its own folder under [`atlas-data/ingest/src/seed-sources/<id>/`](../../../../atlas-data/ingest/src/), exporting `SOURCE_ID` and `run()`, mirroring the existing `src/sources/<id>/` pattern for source ingests. One `npm run refresh:<id>` command per source. Fits naturally into Dagster as one asset per source.

Shared CSV/diff helpers extract to `src/lib/seed.ts` so each source script stays small.

The fifth (curated) bucket from the convention is exercised separately by `ref_atlas_service_category` in PLAN-A of NGO-supply.

---

## Phase 1: Migrate existing 5 seeds to per-source pattern — DONE

### Tasks

- [x] 1.1 Extracted shared helpers + provider patterns into [`atlas-data/ingest/src/lib/seed.ts`](../../../../atlas-data/ingest/src/lib/seed.ts): `csvField`, `rowsToCsv`, `parseCsvLine`, `readExistingCsv`, `diffSummary`, `buildRows`, `orderedCodes`, `runSeedSource` (specialised 4-col runner), plus reusable `fetchSsbDimension` and `fetchFhiDimension`. ✓
- [x] 1.2 Created the 5 seed-source folders under `src/seed-sources/`. Each `index.ts` exports `SOURCE_ID` and `run()` and is ~20 lines. ✓
- [x] 1.3 Added 5 `refresh:<id>` npm scripts to `package.json`. ✓
- [x] 1.4 Deleted `scripts/refresh-seeds.ts`; removed `refresh-seeds` npm script. ✓
- [x] 1.5 Updated `seeds/README.md` refresh-policy section to per-source pattern. ✓
- [x] 1.6 Ran each new script (one SSB 503 retry needed) — all reported "no diff"; `git diff -- ../dbt/seeds/` was empty. ✓
- [x] **Regression check**: `dbt test` PASS=381/15-warn/0-error — same as on `main` baseline. ✓

### Validation

```bash
cd atlas-data/ingest
npm run refresh:ssb-family-type
npm run refresh:ssb-household-type
npm run refresh:ssb-nivaa
npm run refresh:fhi-utdann
npm run refresh:fhi-innvkat
git diff -- ../dbt/seeds/
```

User confirms each command runs clean and the diff is empty.

---

## Phase 2: `ref_un_sdg` — hand-curated, never refresh — DONE

### Tasks

- [x] 2.1 Wrote [`atlas-data/dbt/seeds/ref_un_sdg.csv`](../../../../atlas-data/dbt/seeds/ref_un_sdg.csv). 17 rows; codes `'1'`–`'17'`; Norwegian + English titles from UN. **Caught a bug**: SDG 9 ("Industri, innovasjon og infrastruktur") and SDG 16 ("Fred, rettferdighet og velfungerende institusjoner") have commas in their Norwegian labels and needed CSV-quoting; fixed before any test ran. ✓
- [x] 2.2 Added schema.yml entry with `not_null + unique` on `code`, `not_null` on labels, `accepted_range 1..17` on `sort_order`. ✓
- [x] 2.3 Updated `seeds/README.md` summary table with `ref_un_sdg` row (refresh = never; explain no seed-source folder). ✓
- [x] 2.4 `dbt seed --select ref_un_sdg` loaded 17 rows clean. ✓
- [x] **Regression check**: `dbt build --full-refresh` PASS=414 (+8 vs baseline), 0 errors, 15 warns unchanged. ✓

### Validation

```bash
uv run --env-file ../ingest/.env dbt show --inline "select code, label_no from marts.ref_un_sdg order by sort_order"
```

User confirms 17 rows render and labels read correctly in Norwegian.

---

## Phase 3: `ref_brreg_icnpo` — fetch from Brreg, rare refresh — DONE

**Plan estimate "12 main + 30 subgroups = 42 rows" was off**: actual is **14 main groups + 32 subgroups = 46 rows** (live as of 2026-04-23). The 14 main groups span 1-digit codes 1–9 plus 2-digit codes 10–14 (Tros-/livssyn, Yrkes/fag, Andre, Barne/ungdom, Mangfold). Subgroups are 4- or 5-digit, parent derived from the first 1 or 2 chars of the code.

### Tasks

- [x] 3.1 Probed `data.brreg.no/frivillighetsregisteret/api/icnpo-kategorier`. Response shape: HAL-wrapped `_embedded.icnpoKategorier[]` with fields `icnpoNummer`, `navn`, `spraakkode` (always "NOB" — Norwegian only, label_en blank). 46 rows total. Hierarchy not in the response — derived from code length. ✓
- [x] 3.2 **Required a refactor first**: the 4-col `runSeedSource` doesn't fit the 5-col ICNPO shape. Added `runSeedSourceGeneric` to `lib/seed.ts` taking `header[]` + `string[][]` rows. Existing 5 seed-sources unchanged; new ones use the generic runner. Then created [`src/seed-sources/brreg-icnpo/index.ts`](../../../../atlas-data/ingest/src/seed-sources/brreg-icnpo/index.ts). ✓
- [x] 3.3 Added `refresh:brreg-icnpo` npm script. ✓
- [x] 3.4 CSV at [`dbt/seeds/ref_brreg_icnpo.csv`](../../../../atlas-data/dbt/seeds/ref_brreg_icnpo.csv) — 46 rows produced by the fetcher. Sort order: each main group followed by its subgroups in code order. ✓
- [x] 3.5 Added schema.yml entry. The `parent_code` self-relationship test uses `config.where: "parent_code != ''"` to skip the empty parent on main groups. ✓
- [x] 3.6 Updated `seeds/README.md` summary table with the ICNPO row. ✓
- [x] 3.7 Ran `npm run refresh:brreg-icnpo`; output went to the empty target file (this was the first time we wrote it, so no diff to verify against — the PLAN's "byte-equivalence" check applies on subsequent refreshes). ✓
- [x] 3.8 `dbt seed --select ref_brreg_icnpo` clean. ✓
- [x] **Bonus: `dbt_project.yml` extended** — added `parent_code`, `postnummer`, `post_office`, `kommune_nr`, `name`, `name_kind` to `+column_types` so future seeds get pinned text columns automatically. ✓
- [x] **Regression check**: `dbt build --full-refresh` PASS=422 (+8), 0 errors, 15 warns unchanged. ✓

### Validation

```bash
uv run --env-file ../ingest/.env dbt show --inline "select code, parent_code, label_no from marts.ref_brreg_icnpo order by sort_order limit 15"
```

User confirms hierarchy is intact (subgroups reference their main group via `parent_code`).

---

## Phase 4: `dim_postnummer` — fetch from Bring (NOT SSB Klass — see deviation note) — DONE

**Plan deviation #1 — source change**: PLAN proposed SSB Klass 488. Probed it: Klass 488 is "Kodeliste for terminaltype for godstransport på vei" (freight terminal codes), NOT postnummer. SSB Klass does not host the Norwegian postal register. The canonical source is **Bring's free weekly TXT** at `https://www.bring.no/postnummerregister-ansi.txt` (Windows-1252 TSV, no header, 5 cols). Folder name is `bring-postnummer/`, npm script is `refresh:bring-postnummer`.

### Tasks

- [x] 4.1 Probed SSB Klass 488 → wrong classification. Searched alternatives, confirmed Bring's public TXT as the canonical source. Documented the rationale inline in the seed-source `index.ts`. ✓
- [x] 4.2 Created [`src/seed-sources/bring-postnummer/index.ts`](../../../../atlas-data/ingest/src/seed-sources/bring-postnummer/index.ts). Fetches the .txt as Uint8Array, decodes Windows-1252 with `TextDecoder("windows-1252")`, splits TSV, validates each row (4-digit postnummer + 4-digit kommune_nr), sorts by postnummer, assigns sort_order. Drops Bring's kommune_navn column (dim_kommune is source of truth) and category column (out of scope). ✓
- [x] 4.3 Added `refresh:bring-postnummer` npm script. ✓
- [x] 4.4 [`dim_postnummer.csv`](../../../../atlas-data/dbt/seeds/dim_postnummer.csv) — 5 122 rows; leading zeros preserved (Oslo `'0150'`, etc.). ✓
- [x] 4.5 schema.yml entry added. The `dbt_project.yml` `+column_types` was already extended in Phase 3 with `postnummer: text` so the leading-zero protection is in place. ✓
- [x] 4.6 Updated `seeds/README.md` with the postnummer row. ✓
- [x] 4.7 Spot-checks all correct: `0150 → 0301` (Oslo), `5020 → 4601` (Bergen), `7030 → 5001` (Trondheim), `9008 → 5501` (Tromsø). ✓
- [x] **Real data-quality finding**: Bring includes 8 postnumre (e.g. `9170` Longyearbyen) referencing 2 special kommune codes — `2100` (Svalbard region) and `2211` (Jan Mayen / offshore). These aren't in `dim_kommune` (which holds standard kommuner only). **Resolved** by setting the `relationships` test `severity: warn` — same pattern Atlas already uses for historical kommune codes in indicator models. Documented inline in schema.yml. ✓
- [x] **Regression check**: `dbt build --full-refresh` PASS=430 (+8), 0 errors, **WARN=16 (+1 for the new extraterritorial postnummer warn)**. The new warn is honest about real upstream data; not a regression. ✓

### Validation

```bash
uv run --env-file ../ingest/.env dbt show --inline "select postnummer, post_office, kommune_nr from marts.dim_postnummer where postnummer in ('0150', '5020', '7030', '9008') order by postnummer"
```

User confirms each postnummer joins to the right kommune_nr (Oslo, Bergen, Trondheim, Tromsø).

---

## Phase 5: `crosswalk_kommune_name` — SSB Klass 131 alt names + historical

Resolves upstream free-text municipality names to canonical kommune_nr. Includes canonical names, alternative spellings, and historical (pre-merger) names.

### Tasks

**Plan deviation #2 — derived model, not a seed.** Probed Klass 131: 358 active codes, 29 with bilingual "Norwegian - Sami" name pattern, no `shortName` populated. Then realised `dim_kommune` ALREADY contains everything we need: it carries 1 158 rows (358 active + 800 historical) and already splits the bilingual names into `kommune_name` + `kommune_name_alt`. So the crosswalk is a pure projection of `dim_kommune`, not a fresh fetch. **Made it a derived dbt model** at [`models/dimensions/crosswalk_kommune_name.sql`](../../../../atlas-data/dbt/models/dimensions/crosswalk_kommune_name.sql), not a seed. Original tasks 5.3 (seed-source folder), 5.4 (npm script), 5.5 (CSV) become no-ops as a result.

### Tasks

- [x] 5.1 Probed Klass 131. Findings: 358 codes, `shortName` is empty everywhere (alt names live in the `name` field as "Norwegian - Sami" hyphenated form), `notes` carries narrative-prose history not parseable for our purposes. ✓
- [x] 5.2 Discovered `dim_kommune` already has all this — fetched directly from SSB Klass with full history (active + 800 historical rows), and the dim_kommune SQL already splits bilingual names into `kommune_name` + `kommune_name_alt`. No second fetch needed. ✓
- [x] 5.3 — **No-op**: no seed-source folder; the crosswalk is derived. ✓
- [x] 5.4 — **No-op**: no npm script. ✓
- [x] 5.5 — **No-op**: no CSV; instead created [`models/dimensions/crosswalk_kommune_name.sql`](../../../../atlas-data/dbt/models/dimensions/crosswalk_kommune_name.sql) — three-CTE union of dim_kommune (canonical for active, alternative for kommune_name_alt, historical for inactive). 1 187 rows. ✓
- [x] 5.6 schema.yml entry added in [`models/dimensions/schema.yml`](../../../../atlas-data/dbt/models/dimensions/schema.yml) (NOT seeds/schema.yml — it's a model now). Tests: `not_null` on all three cols; `accepted_values` on `name_kind`; `relationships` from `kommune_nr` to `dim_kommune.kommune_nr` (passes — dim_kommune carries both active + historical so all rows resolve); `unique_combination_of_columns(name, name_kind, kommune_nr)`. ✓
- [x] 5.7 README touch not needed — no entry in seeds README since it's not a seed. ✓
- [x] 5.8 Spot-checks: `Modum` → 3 rows (1 canonical 3316 + 2 historical from pre-reform codes 0623 and 3047 — legitimate ambiguity from kommune merger churn); `Os` → canonical 3430 (current Os in Innlandet); `Oslove` → alternative 0301 (Oslo's Sami name). Total breakdown: 358 canonical + 29 alternative + 800 historical = 1 187 rows. ✓
- [x] **Limitation documented**: `historical` rows point to the OLD kommune_nr, not the modern merged-into successor. Consumers needing modern resolution take a follow-up step. v1 limitation; upgradeable later via SSB Klass `/changes` endpoint. ✓
- [x] **Regression check**: `dbt build --full-refresh` PASS=437 (+7), 0 errors, 16 warns unchanged. ✓

### Validation

```bash
uv run --env-file ../ingest/.env dbt show --inline "select name, name_kind, kommune_nr from marts.crosswalk_kommune_name where name in ('Os', 'Aalesund', 'Sør-Aurdal', 'Modum') order by name, name_kind"
```

User confirms the lookup behaviour matches expectations: canonical names present, known alt/historical examples resolve to the right kommune_nr.

---

## Phase 6: Vocabulary, tests, ERD regen

Wire the new tables into the rest of the docs and tooling.

### Tasks — DONE

- [x] 6.1 Extended [`naming-conventions.md`](../../../stack/naming-conventions.md) canonical vocabulary with: `sdg_code`, `icnpo_code`, `postnummer`, `post_office`, `name`, `name_kind`. Also tightened the `crosswalk_*` row to note seed-vs-model option, and updated the Periodic refresh bucket to mention that derived crosswalks inherit their parent's cadence. ✓
- [x] 6.2 `dbt build --full-refresh` ran clean throughout. Final state: **PASS=437, WARN=16, ERROR=0**. Test count grew from 414 (after Phase 2) → 437 (+23 across Phases 3-5: ICNPO + postnummer seed tests + crosswalk model tests). The +1 WARN is the extraterritorial-postnummer warn from Phase 4 (real upstream data, not a regression). ✓
- [x] 6.3 ERD regenerated. `docs/stack/erd.md` now shows **29 entities, 45 relationships** (was 25 entities, 42 relationships before this PLAN). All four new entities visible with correct edges:
  - `dim_postnummer` → `dim_kommune` ✓
  - `crosswalk_kommune_name` → `dim_kommune` ✓
  - `ref_brreg_icnpo` → self (parent_code) ✓
  - `ref_un_sdg` standalone ✓
- [x] 6.4 `seeds/README.md` summary table extended with `ref_un_sdg`, `ref_brreg_icnpo`, `dim_postnummer` rows. (No `crosswalk_kommune_name` row since it became a derived model, not a seed.) ✓

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt build
./regenerate-erd.sh
```

User confirms `dbt build` is clean and the regenerated ERD shows the four new entities with their edges.

---

## Acceptance Criteria

- [x] Four new tables exist in `marts.*`. **Actual row counts**: 17 (sdg) ✓, **46 not 42** (icnpo — the plan's "12+30" estimate was off; actual is 14+32) ✓, 5 122 (postnummer) ✓, **1 187 not ~700** (kommune-name crosswalk — close to estimate but on the high side) ✓.
- [x] Three are loaded via `dbt seed`; one (`crosswalk_kommune_name`) is a derived dbt model, not a seed (per Plan deviation #2). No separate ingest folder for any of them — these are reference data. ✓
- [x] Per-source `npm run refresh:<id>` commands exist for the three fetched seeds (`brreg-icnpo`, `bring-postnummer`, plus the 5 migrated PLAN-001 seeds). The crosswalk needs no refresh script. The PLAN's "byte-equivalent diff" check applies to the migrated seeds (verified empty diff in Phase 1) and to subsequent refreshes of the new seeds. ✓
- [x] `dbt build` passes: **PASS=437 (+23 vs Phase 2 baseline of 414), ERROR=0, WARN=16**. The single new WARN is honest (extraterritorial postnummer codes 2100/2211 outside dim_kommune) — not a regression. ✓
- [x] [`docs/stack/erd.md`](../../../stack/erd.md) shows the four new entities with edges. ERD grew from 25 entities/42 edges to 29 entities/45 edges. ✓
- [x] [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) lists the new canonical fields (`sdg_code`, `icnpo_code`, `postnummer`, `post_office`, `name`, `name_kind`). ✓

---

## Plan deviations (resolved during implementation)

Two material departures from the plan, made for honest reasons after probing real APIs:

1. **`dim_postnummer` source: Bring, not SSB Klass.** The plan claimed SSB Klass 488 was the postnummer classification — it isn't (Klass 488 is freight terminal codes). SSB Klass does not host the Norwegian postal register. The canonical source is Bring's free weekly TXT (`bring.no/postnummerregister-ansi.txt`, Windows-1252 TSV, no header). Folder named `bring-postnummer` to reflect the real owner; npm script is `refresh:bring-postnummer`. See Phase 4.

2. **`crosswalk_kommune_name`: derived dbt model, not a seed.** `dim_kommune` already contains everything the crosswalk needs (1 158 rows: 358 active + 800 historical, with bilingual name split into `kommune_name` + `kommune_name_alt`). Refetching from SSB Klass would have been wasteful and risked drift. Made it a derived model at `models/dimensions/crosswalk_kommune_name.sql` instead. The naming-conventions update notes that `crosswalk_*` can be either a seed or a derived model depending on whether it's authoritative/curated or a projection. See Phase 5.

A few smaller corrections worth noting:
- ICNPO is **14 main + 32 subgroups = 46 rows**, not the "12+30=42" the plan estimated.
- `crosswalk_kommune_name` ended up at **1 187 rows**, not the plan's "~700" estimate (the 800 historical kommuner pushed it higher).
- The Phase 3 work required adding `runSeedSourceGeneric` to `lib/seed.ts` because the existing 4-col runner couldn't handle ICNPO's 5-col shape (with `parent_code`). The 5 PLAN-001 seed-sources still use the original 4-col runner; new sources use the generic one.
- `dim_kommune.kommune_name_alt` is documented as `kommune_name_sami` in the dim_kommune schema.yml — pre-existing inconsistency, left alone (not in scope for this plan).

---

## Implementation Notes

- **Why these four together (plus the migration).** All exercise the same pattern (CSV seed + per-source fetcher) and each tests a different refresh bucket from the convention (never / rare / periodic). Building them together with the 5-seed migration validates the per-source pattern across 9 sources at once — no two-pattern transition period.
- **Why per-source fetchers, not a consolidated script.** The future state is Dagster automation: one asset per source, with per-asset scheduling, retry, and observability. Pipes spawns one pod per script invocation. The per-source pattern matches Dagster's natural shape; a consolidated entrypoint would either become one mega-asset (no parallelism, lowest-common-denominator scheduling) or have to be split anyway. Doing it right now means no rework when Dagster lands.
- **Why seeds, not raw → marts ingests.** These are reference tables, not measured data. Seeds are reviewable as `git diff`, regenerable on demand, and avoid the `raw.*` schema sprawl. The seed-source folder pattern (`src/seed-sources/<id>/`) parallels the source-ingest folder pattern (`src/sources/<id>/`) but writes to `dbt/seeds/*.csv` instead of `raw.*`.
- **Why `dim_postnummer` is a seed even though it has 5 000 rows.** Posten republishes the whole list quarterly anyway; a CSV diff between quarters is the right review unit. dbt seed loads ~5 000 rows in well under a second.
- **Why `crosswalk_kommune_name` doesn't unique on `name`.** Norwegian place names collide ("Os", "Sør-Varanger" historical variants). The crosswalk is many-to-many by design. Consumers that need a single resolution must apply additional context (postal code, fylke).
- **Why no `severity: warn` on the relationships tests.** All four new tables are derived from clean canonical sources; mismatches against `dim_kommune` would be real bugs (e.g. the refresh script grabbed a future kommune_nr that isn't yet in dim_kommune). Errors, not warnings.
- **What this plan does not do.** No new source ingests (writes to `raw.*`). No NGO data. No `dim_ngo` (waits for PLAN-A of NGO-supply). No `ref_atlas_service_category` (waits for PLAN-A; needs NGO-context curation). No tagging of existing `fact_kommune_indicators` rows with SDG/ICNPO codes — that's the follow-up [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md).

---

## Files to Modify

New seeds:
- `atlas-data/dbt/seeds/ref_un_sdg.csv`
- `atlas-data/dbt/seeds/ref_brreg_icnpo.csv`
- `atlas-data/dbt/seeds/dim_postnummer.csv`
- `atlas-data/dbt/seeds/crosswalk_kommune_name.csv`

New seed-source modules (each folder has `index.ts` + `README.md`):
- `atlas-data/ingest/src/seed-sources/ssb-family-type/` *(migrated from refresh-seeds.ts)*
- `atlas-data/ingest/src/seed-sources/ssb-household-type/` *(migrated)*
- `atlas-data/ingest/src/seed-sources/ssb-nivaa/` *(migrated)*
- `atlas-data/ingest/src/seed-sources/fhi-utdann/` *(migrated)*
- `atlas-data/ingest/src/seed-sources/fhi-innvkat/` *(migrated)*
- `atlas-data/ingest/src/seed-sources/brreg-icnpo/`
- `atlas-data/ingest/src/seed-sources/ssb-klass-postnummer/`
- `atlas-data/ingest/src/seed-sources/ssb-klass-kommune-names/`

New shared library:
- `atlas-data/ingest/src/lib/seed.ts` — extracted CSV/diff helpers + `runSeedSource` runner

Delete:
- `atlas-data/ingest/scripts/refresh-seeds.ts`

Edit:
- `atlas-data/dbt/seeds/schema.yml` — add seed entries with tests for all four new seeds
- `atlas-data/dbt/seeds/README.md` — document the new seeds + per-source refresh commands
- `atlas-data/dbt/dbt_project.yml` — extend `+column_types` if needed (e.g. `postnummer: text`)
- `atlas-data/ingest/package.json` — replace `refresh-seeds` with 8 per-source `refresh:<id>` scripts
- `docs/stack/naming-conventions.md` — add the new canonical fields
- `docs/stack/erd.md` — auto-regenerated by `./regenerate-erd.sh` (no manual edit)

---

## Decisions resolved during planning (2026-04-23)

- **SDG sub-targets**: deferred. v1 = 17 goals only. A future `ref_un_sdg_target` can be added as a separate seed when needed.
- **ICNPO labels**: Norwegian only for now. `label_en` left blank in the seed schema — populate later if/when Brreg publishes English or we curate translations.
- **Postnummer source**: SSB Klass 488 (for consistency with existing `ssb-klass-kommuner` / `ssb-klass-fylker` ingests and the maintained correspondence to Klass 131).
- **Refresh script architecture**: per-source — one folder per seed source under `ingest/src/seed-sources/<id>/` with its own `index.ts`, mirroring the existing `src/sources/<id>/` ingest pattern. One `npm run refresh:<id>` command per source. Plays cleanly with the future Dagster Pipes orchestration: each source becomes its own asset with its own schedule, retry, and observability. The existing `refresh-seeds.ts` consolidated script is migrated to the new pattern in Phase 1 — no two seed-refresh patterns will coexist.
- **Tagging existing indicators with SDG/ICNPO**: deferred to a separate investigation ([INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md)).

## Open Questions

None remaining — proceed to implementation.

---

## Cross-references

- [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) — the convention this plan exercises.
- [`docs/ai-developer/plans/completed/INVESTIGATE-reference-tables-convention.md`](../completed/INVESTIGATE-reference-tables-convention.md) — the rationale.
- [`docs/ai-developer/plans/backlog/INVESTIGATE-ngo-supply-data-model.md`](INVESTIGATE-ngo-supply-data-model.md) — the next consumer (PLAN-A will use three of these four tables).
- [`docs/ai-developer/plans/completed/PLAN-001-code-label-seed-tables.md`](../completed/PLAN-001-code-label-seed-tables.md) — the seed pattern this plan follows.
- [`atlas-data/dbt/seeds/README.md`](../../../../atlas-data/dbt/seeds/README.md) — where the new seeds get documented.
- [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) — follow-up investigation on tagging existing `fact_kommune_indicators` rows with SDG/ICNPO codes (depends on this plan).
- [Brreg open data API documentation](https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html) — source for ICNPO.
- [SSB Klass](https://www.ssb.no/klass/) — source for postnummer (488) and kommune alt-names (131).
- [UN Sustainable Development Goals](https://sdgs.un.org/goals) — source for SDG titles.
