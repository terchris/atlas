# fhi-mobbing

FHI Folkehelsestatistikk table **377** — *Mobbing, 7. og 10. klasse, 3-årige tall*. Share of pupils reporting bullying in 7th and 10th grade, 3-year rolling averages per region.

**Why Atlas uses this**: substitute for Samfunnspuls's `udir-elevundersokelsen` mobbing block. Udir publishes only via HTML / non-API Skoleporten; FHI republishes the kommune-level data cleanly via JSON.

## Upstream

| Field | Value |
|---|---|
| Provider | FHI (Folkehelsestatistikk) |
| Table id | `377` |
| URL | https://statistikk-data.fhi.no/api/open/v1/nokkel/table/377 |
| Attribution | *Kilde: Folkehelseinstituttet, Folkehelsestatistikk tabell 377* |

## Response shape

| Dim | Codes |
|---|---|
| `GEO` | ~409 (kommune/fylke/nasjon/bydel) |
| `AAR` | 7 (3-year rolling, e.g. `2016_2018`, `2022_2024`) |
| `KJONN` | 1 — `"0"` (both sexes) |
| `TRINN` | 2 — `"7"`, `"10"` |
| `SPM_ID` | 1 — question id (bullying composite) |
| `MEASURE_TYPE` | 3 — `SMR`, `MEIS`, `RATE` |

Latest-year query: 1 AAR × 2 TRINN × 409 GEO × 3 MEASURE ≈ 2 500 cells.

## How to run

```bash
npm run ingest:fhi-mobbing
```

## References

- Replacement for the bullying half of `udir-elevundersokelsen` (catalogue).
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
