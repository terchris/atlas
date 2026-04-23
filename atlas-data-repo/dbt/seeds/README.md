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

| File | Owner | Concept | Source | Rows | label_en? | Refresh |
|---|---|---|---|---|---|---|
| `ref_ssb_family_type.csv` | SSB | FamilieType | table 06083 | 9 | yes | rare (`refresh:ssb-family-type`) |
| `ref_ssb_household_type.csv` | SSB | HusholdType | table 06944 | 5 | yes | rare (`refresh:ssb-household-type`) |
| `ref_ssb_nivaa.csv` | SSB | Nivaa (NUS2000) | table 09429 | 7 | yes | rare (`refresh:ssb-nivaa`) |
| `ref_fhi_utdann.csv` | FHI | UTDANN (parents' education) | tables 794, 360 | 5 | no | rare (`refresh:fhi-utdann`) |
| `ref_fhi_innvkat.csv` | FHI | INNVKAT (immigration category) | table 360 | 1 | no | rare (`refresh:fhi-innvkat`) |
| `ref_un_sdg.csv` | UN | Sustainable Development Goals | UN sdgs.un.org | 17 | yes | **never** (hand-curated, no script) |
| `ref_brreg_icnpo.csv` | Brreg | ICNPO categories (14+32 hierarchy) | `data.brreg.no/frivillighetsregisteret/api/icnpo-kategorier` | 46 | no | rare (`refresh:brreg-icnpo`) |
| `dim_postnummer.csv` | Bring | Norwegian postal codes → primary kommune | `bring.no/postnummerregister-ansi.txt` (Windows-1252 TSV) | 5 122 | n/a | periodic (`refresh:bring-postnummer`) |

FHI UTDANN is a coarser scheme than SSB Nivaa — FHI collapses
fagskole + university into a single "universitet/ høgskole" code. The
two are not interchangeable.

SSB Nivaa preserves upstream order: `00, 01, 02a, 11, 03a, 04a, 09a`.
`11` (Fagskolenivå) sits between upper secondary and university,
matching its place in the Norwegian education hierarchy.

`ref_un_sdg` has no seed-source folder — there's nothing to fetch. The
17 goals have been fixed since 2015. The 169 sub-targets are deferred
to a future `ref_un_sdg_target` seed; not needed for any v1 query.

## Refresh policy

Labels are pinned in CSV. Atlas is pre-production: when upstream changes
labels or codes, we overwrite the CSV with current upstream contents. No
backward-compatibility preservation, no `deprecated_at` column.

Each seed has its own refresh command — one per source, mirroring the
`ingest:<id>` pattern used for source ingests that write to `raw.*`. Each
seed-source lives at [`../../ingest/src/seed-sources/<id>/`](../../ingest/src/seed-sources/)
with its own `index.ts` and is independently retriable and schedulable
(relevant for Dagster automation down the road).

To refresh a specific seed:

```bash
cd ../../ingest
npm run refresh:ssb-family-type
npm run refresh:ssb-household-type
npm run refresh:ssb-nivaa
npm run refresh:fhi-utdann
npm run refresh:fhi-innvkat
git diff -- ../dbt/seeds/
```

Review the diff — added/removed/renamed codes are real upstream changes
that may need follow-up in indicator models. Commit when satisfied.

SSB endpoints occasionally return transient HTTP 503; the underlying
fetch wrapper retries with backoff. Re-run the specific `refresh:<id>`
command if one fails while others succeed.

## Loading

```bash
cd atlas-data-repo/dbt
dbt seed --full-refresh
```

This drops and recreates each `marts.ref_*` table from the CSV. It does
not touch other tables in `marts` (indicators, dimensions, etc.).
