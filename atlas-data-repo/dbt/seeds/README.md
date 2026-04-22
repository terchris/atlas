# dbt Seeds — `ref_*` reference tables

These CSVs decode coded fields from upstream sources (SSB, FHI) into
human-readable labels. They are loaded as `marts.ref_*` tables by `dbt seed`
and joined into indicator models to expose `<field>_label_no` /
`<field>_label_en` alongside the raw code.

Investigation: [`docs/ai-developer/plans/backlog/INVESTIGATE-code-label-mapping.md`](../../../docs/ai-developer/plans/backlog/INVESTIGATE-code-label-mapping.md)

## Schema

Every `ref_*` seed has the same four columns:

| column | type | notes |
|---|---|---|
| `code` | text | The upstream code, exactly as it appears in `raw.*`. Leading zeros preserved (e.g. `001`, `0000`). |
| `label_no` | text | Norwegian (bokmål) label, taken verbatim from upstream. |
| `label_en` | text | English label. Populated for SSB; blank for FHI (FHI publishes Norwegian only). |
| `sort_order` | integer | 1-based, matches upstream publish order. |

Column types are pinned in [`../dbt_project.yml`](../dbt_project.yml) so
dbt's CSV type sniffing doesn't strip leading zeros from numeric-looking
codes.

## Seeds

| File | Provider | Dimension | Source table(s) | Rows | label_en? |
|---|---|---|---|---|---|
| `ref_ssb_family_type.csv` | SSB | FamilieType | 06083 | 9 | yes |
| `ref_ssb_household_type.csv` | SSB | HusholdType | 06944 | 5 | yes |
| `ref_ssb_nivaa.csv` | SSB | Nivaa (NUS2000) | 09429 | 7 | yes |
| `ref_fhi_utdann.csv` | FHI | UTDANN (parents' education) | 794, 360 | 5 | no |
| `ref_fhi_innvkat.csv` | FHI | INNVKAT (immigration category) | 360 | 1 | no |

FHI UTDANN is a coarser scheme than SSB Nivaa — FHI collapses
fagskole + university into a single "universitet/ høgskole" code. The
two are not interchangeable.

SSB Nivaa preserves upstream order: `00, 01, 02a, 11, 03a, 04a, 09a`.
`11` (Fagskolenivå) sits between upper secondary and university,
matching its place in the Norwegian education hierarchy.

## Refresh policy

Labels are pinned in CSV. Atlas is pre-production: when upstream changes
labels or codes, we overwrite the CSV with current upstream contents. No
backward-compatibility preservation, no `deprecated_at` column.

To refresh:

```bash
cd ../../ingest
npm run refresh-seeds
git diff -- ../dbt/seeds/
```

Review the diff — added/removed/renamed codes are real upstream changes
that may need follow-up in indicator models. Commit when satisfied.

## Loading

```bash
cd atlas-data-repo/dbt
dbt seed --full-refresh
```

This drops and recreates each `marts.ref_*` table from the CSV. It does
not touch other tables in `marts` (indicators, dimensions, etc.).
