# ssb-06083

SSB statistikkbanktabell **06083** — *Familier, etter familietype*. Family counts by type per region and year.

## Upstream

| Field | Value |
|---|---|
| Provider | Statistisk sentralbyrå (SSB) |
| Table id | `06083` |
| URL | https://data.ssb.no/api/pxwebapi/v2-beta/tables/06083 |
| Licence | NLOD 2.0 |
| Attribution | *Kilde: Statistisk sentralbyrå, tabell 06083* |

## Response shape

Four dimensions. ContentsCode + Tid are `elimination=false`.

| Dim | Codes |
|---|---|
| `Region` | ~1 051 (kommune + fylke + nasjon + bydeler + historical) |
| `FamilieType` | 9 (couple with/without children, single mother, single father, etc.) |
| `ContentsCode` | 1 (`Familier` — family count) |
| `Tid` | 2005–2025 |

## Row shape emitted

```json
{"region_code":"0301","family_type":"0001","year":2025,"contents_code":"Familier","contents_label":"Familier","value":134221,"status":null}
```

## How to run locally

```bash
npm run ingest:ssb-06083
```

## Known quirks

- Single-parent families correspond to specific FamilieType codes (map in dbt layer when building the "single-parent share" feature view).
- Bydeler (6-digit region codes) are included — filter to 4-digit for kommune-level views.

## References

- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
