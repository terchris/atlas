# Plan 001: Code-label seed tables

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Build the five `dbt/seeds/ref_*.csv` reference tables that decode SSB and FHI domain enums into human-readable Norwegian and English labels, plus a refresh script that re-fetches them from upstream metadata on demand.

**Last Updated**: 2026-04-22
**Completed**: 2026-04-22

**Investigation**: [INVESTIGATE-code-label-mapping.md](INVESTIGATE-code-label-mapping.md)
**Blocks**: PLAN-002 (apply hybrid in indicator models) cannot start until seeds exist.
**Priority**: Medium

---

## Overview

The investigation chose a hybrid decoding strategy: inline CASE for tiny universal enums, structured parsing for `age`/`period`, and **dbt seeds for medium domain enums**. This plan delivers the seed half. After this plan, dbt has five reviewable CSVs holding canonical labels for every domain enum currently used by the 19 ingested sources, plus tooling to keep them in sync with upstream.

Decisions resolved during planning (2026-04-22):

- **Languages**: `label_no` + `label_en` from day 1. English left blank where unknown.
- **`ref_fhi_innvkat`**: committed for consistency even though only one code exists today.
- **Label provenance**: pinned in CSV, refreshed via an explicit `npm run refresh-seeds` script. Seeds stay declarative and reviewable.
- **Stale codes**: project is pre-production — refresh script overwrites the CSV with current upstream contents. No `deprecated_at`, no backward-compat preservation.

---

## Phase 1: Probe upstream metadata — DONE

Verify that each provider exposes the labels we need before writing any CSVs. Each probe runs once on the host and feeds the next phase.

### Tasks

- [x] 1.1 SSB metadata fetched for FamilieType (06083), HusholdType (06944), Nivaa (09429) in `no` and `en` via `https://data.ssb.no/api/pxwebapi/v2-beta/tables/{id}/metadata?lang={lang}`. All three dimensions expose `dimension.<NAME>.category.{index,label}` cleanly. ✓
- [x] 1.2 FHI metadata: the `/metadata` endpoint returns descriptive paragraphs only (no dimension catalog). Workaround: use `/query` to discover codes, then POST a 1-cell `/data` request with all codes selected — the json-stat2 response carries `dimension.<NAME>.category.label`. UTDANN confirmed in tables 794 and 360 (same 5 codes); INNVKAT confirmed in table 360 (1 code). FHI publishes Norwegian only. ✓
- [x] 1.3 Mappings recorded below. ✓

### Recorded mappings

#### SSB FamilieType (06083) — 9 codes

| code | label_no | label_en |
|---|---|---|
| 001 | Enpersonfamilie | One-person family |
| 002 | Par med små barn (yngste barn 0-5 år) | Couple with small children (youngest child 0-5 years) |
| 003 | Par med store barn (yngste barn 6-17 år) | Couple with older children (youngest child 6-17 years) |
| 004 | Mor/far med små barn (yngste barn 0-5 år) | Lone parent with small children (youngest child 0-5 years) |
| 005 | Mor/far med store barn (yngste barn 6-17 år) | Lone parent with older children (youngest child 6-17 years) |
| 006 | Par uten barn | Couple without children |
| 007 | Par med voksne barn (yngste barn 18 år og over) | Couple with adult children (youngest child 18 years and over) |
| 008 | Mor/far med voksne barn (yngste barn 18 år og over) | Lone parent with adult children (youngest child 18 years and over) |
| 009 | Andre familier | Other families |

#### SSB HusholdType (06944) — 5 codes

| code | label_no | label_en |
|---|---|---|
| 0000 | Alle husholdninger | All households |
| 0001 | Aleneboende | Living alone |
| 0002 | Par uten barn | Couple without resident children |
| 0003 | Par med barn 0-17 år | Couple with resident children 0-17 year |
| 0004 | Enslig mor/far med barn 0-17 år | Single mother/father with children 0-17 year |

#### SSB Nivaa (09429) — 7 codes

Upstream order places `11` (Fagskole) between `02a` and `03a` — pedagogically correct (vocational tertiary follows upper secondary, precedes university). The investigation file's listed order was `00, 01, 02a, 03a, 04a, 09a, 11`; preserve upstream order instead.

| code | label_no | label_en |
|---|---|---|
| 00 | Utdanningsnivå i alt | Total |
| 01 | Grunnskolenivå | Basic school level |
| 02a | Videregående skolenivå | Upper secondary education |
| 11 | Fagskolenivå | Tertiary vocational education |
| 03a | Universitets- og høgskolenivå, kort | Higher education, short |
| 04a | Universitets- og høgskolenivå, lang | Higher education, long |
| 09a | Uoppgitt eller ingen fullført utdanning | Unknown or no completed education |

#### FHI UTDANN (tables 794 + 360) — 5 codes

FHI uses lowercase house style. Norwegian only — `label_en` blank. Coarser than SSB Nivaa: FHI collapses Fagskole + university into "universitet/ høgskole".

| code | label_no | label_en |
|---|---|---|
| 0 | totalt | |
| 1 | grunnskole | |
| 2 | videregående | |
| 3 | universitet/ høgskole | |
| 4 | uoppgitt utdanningsnivå | |

#### FHI INNVKAT (table 360) — 1 code

| code | label_no | label_en |
|---|---|---|
| 0 | totalt | |

### Validation

User confirms the recorded mappings look right (no surprises in code count, labels read sensibly in Norwegian).

---

## Phase 2: Write seed CSVs and dbt config — DONE

### Tasks

- [x] 2.1 Created [`atlas-data/dbt/seeds/`](../../../../atlas-data/dbt/seeds/). ✓
- [x] 2.2 Wrote five CSVs with columns `code,label_no,label_en,sort_order`. Row counts match (9, 5, 7, 5, 1). SSB Nivaa preserves upstream order (`00, 01, 02a, 11, 03a, 04a, 09a`). FHI seeds have `label_en` columns present but blank. Labels containing commas (Nivaa `03a`, `04a`) are CSV-quoted. ✓
- [x] 2.3 Added `seeds:` block to [`atlas-data/dbt/dbt_project.yml`](../../../../atlas-data/dbt/dbt_project.yml) with `+schema: marts` and `+column_types` pinning `code/label_no/label_en` to `text` and `sort_order` to `integer`. ✓
- [x] 2.4 Wrote [`atlas-data/dbt/seeds/README.md`](../../../../atlas-data/dbt/seeds/README.md) covering schema, per-seed metadata, refresh policy, and load command. ✓

### Validation

```bash
cd atlas-data/dbt
dbt seed --full-refresh
dbt run-operation list_seeds  # or: psql -c "select count(*) from marts.ref_ssb_family_type"
```

User confirms `dbt seed` runs clean and each `marts.ref_*` table has the expected row count.

---

## Phase 3: Refresh script — DONE

Make label drift detectable. The script re-fetches all five enums from SSB/FHI metadata and rewrites the CSVs in place; the user reviews `git diff` before committing.

### Tasks

- [x] 3.1 Created [`atlas-data/ingest/scripts/refresh-seeds.ts`](../../../../atlas-data/ingest/scripts/refresh-seeds.ts). Uses `fetchPxTableMetadata` for SSB. For FHI, uses the workaround from Phase 1 (GET `/query` for codes → POST `/data` with all target codes + first code per other dimension → harvest labels from json-stat2 response) since `/metadata` returns prose only. Writes CSV with stable header, LF endings, minimal-quoting (only when value contains `,`/`"`/CR/LF). Logs structured + console summary per seed. ✓
- [x] 3.2 Added `"refresh-seeds": "tsx scripts/refresh-seeds.ts"` to [`atlas-data/ingest/package.json`](../../../../atlas-data/ingest/package.json). ✓
- [x] 3.3 Ran `npm run refresh-seeds` — all five seeds report `no diff`. Script output bytes-equal the hand-written CSVs from Phase 2. ✓

### Validation

```bash
cd atlas-data/ingest
npm run refresh-seeds
git diff -- ../dbt/seeds/
```

User confirms the diff is empty (or the differences are explained drift the user accepts).

---

## Acceptance Criteria

- [ ] Five `marts.ref_*` tables exist after `dbt seed`, with the expected row counts (9, 5, 7, 5, 1).
- [ ] All seeds have `label_no` populated. SSB seeds also have `label_en` populated. FHI seeds have `label_en` columns present but blank.
- [ ] Codes preserve leading zeros (e.g. `001`, `0000`) — column type is `text`, not `integer`.
- [ ] `npm run refresh-seeds` runs in under 30 seconds and produces no diff against the committed CSVs.
- [ ] [`atlas-data/dbt/seeds/README.md`](../../../../atlas-data/dbt/) explains each seed and how to refresh.

---

## Implementation Notes

- **Why text, not integer, for `code`**: SSB FamilieType uses `001`–`009` and HusholdType uses `0000`–`0004`. dbt's default CSV loader will strip leading zeros if the column sniffs as numeric, breaking joins against `raw.*` where codes are stored as text.
- **Why land seeds in `marts`**: keeps the cross-schema join out of indicator models in PLAN-002. The `marts.*` contract already covers the frontend's read-only access — `marts.ref_*` slots in cleanly.
- **Why a refresh script, not `dbt seed` re-fetch**: keeps `dbt seed` deterministic and offline-runnable. Refresh is an explicit, reviewable operation.
- **English labels for FHI**: FHI's metadata endpoint does not publish English category labels. Leaving `label_en` blank is the honest representation; future work can backfill if Atlas needs an English UI.
- **Naming-convention vocabulary** (e.g. adding `family_type_label`, `education_level_label`) is deferred to PLAN-003 — this plan only ships the data.

---

## Files to Modify

New:
- `atlas-data/dbt/seeds/ref_ssb_family_type.csv`
- `atlas-data/dbt/seeds/ref_ssb_household_type.csv`
- `atlas-data/dbt/seeds/ref_ssb_nivaa.csv`
- `atlas-data/dbt/seeds/ref_fhi_utdann.csv`
- `atlas-data/dbt/seeds/ref_fhi_innvkat.csv`
- `atlas-data/dbt/seeds/README.md`
- `atlas-data/ingest/scripts/refresh-seeds.ts`

Edit:
- `atlas-data/dbt/dbt_project.yml` — add `seeds:` config
- `atlas-data/ingest/package.json` — add `refresh-seeds` script
- `atlas-data/ingest/src/lib/fhi.ts` — add `fetchFhiTableMetadata` (if not already present)
