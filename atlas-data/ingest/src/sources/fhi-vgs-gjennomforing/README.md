# fhi-vgs-gjennomforing

FHI Folkehelsestatistikk table **360** — *Gjennomforing i videregående skole (utdann_3)*. Upper-secondary completion rate per region × sex × parents' education × immigration category.

**Why Atlas uses this**: substitute for Samfunnspuls's `udir-sluttet-vgs` (dropout). Udir publishes only in HTML; FHI publishes cleanly via JSON. Dropout rate is derivable from completion (100 − RATE).

## Upstream

| Field | Value |
|---|---|
| Provider | FHI (Folkehelsestatistikk) |
| Table id | `360` |
| URL | https://statistikk-data.fhi.no/api/open/v1/nokkel/table/360 |
| Attribution | *Kilde: Folkehelseinstituttet, Folkehelsestatistikk tabell 360* |

## Response shape

| Dim | Codes |
|---|---|
| `GEO` | ~409 |
| `AAR` | 11 (3-year rolling) |
| `KJONN` | 3 — `"0"`/`"1"`/`"2"` |
| `UTDANN` | 5 — parents' education level |
| `INNVKAT` | 1 |
| `MEASURE_TYPE` | 4 — `TELLER`, `RATE`, `SMR`, `MEIS` |

Latest-year: 1 × 3 × 5 × 409 × 1 × 4 ≈ 24 k cells.

## How to run

```bash
npm run ingest:fhi-vgs-gjennomforing
```

## References

- Catalogue substitute for `udir-sluttet-vgs`.
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
