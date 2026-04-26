# ssb-09429

SSB statistikkbanktabell **09429** — *Utdanningsnivå, etter kommune og kjønn*. Educational attainment distribution per kommune × education level × sex × year.

## Upstream

| Field | Value |
|---|---|
| Table id | `09429` |
| URL | https://data.ssb.no/api/pxwebapi/v2-beta/tables/09429 |
| Provider | Statistisk sentralbyrå (SSB) |
| Licence | NLOD 2.0 |
| Attribution | *Kilde: Statistisk sentralbyrå, tabell 09429* |

## Response shape

Five dimensions:

| Dim | Codes |
|---|---|
| `Region` | ~979 (kommune + fylke + nasjon + bydeler + historical) |
| `Nivaa` | 7 education-level codes (grunnskole, vgs, høyere utdanning kort/lang, forskerutdanning, uoppgitt, etc.) |
| `Kjonn` | `"0"` (both), `"1"` (men), `"2"` (women) |
| `ContentsCode` | 2 — count + share |
| `Tid` | 1970–2024 |

## Row shape emitted

```json
{"region_code":"0301","education_level":"03","sex":"0","year":2024,"contents_code":"Personer1","contents_label":"Personer 16 år og over","value":534221,"status":null}
```

## How to run

```bash
npm run ingest:ssb-09429
```

## Known quirks

- `Kjonn` uses SSB's numeric codes; dbt layer maps to `male`/`female`/`all` canonical values where needed.
- `Nivaa` codes are NUS2000-based education-level identifiers; map to human labels at the feature layer.

## References

- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
