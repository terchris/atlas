# ssb-06913

SSB statistikkbanktabell **06913** — *Folkemengde 1. januar og endringer i kalenderåret (folketilvekst, fødsler, dødsfall, inn- og utflyttinger)*.

Catalogue entry: [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md).

## Upstream

| Field | Value |
|---|---|
| Provider | Statistisk sentralbyrå (SSB) |
| Table id | `06913` |
| URL | https://data.ssb.no/api/pxwebapi/v2-beta/tables/06913 |
| Auth | None |
| Format | JSON-stat2 |
| Licence | NLOD 2.0 |
| Attribution | *Kilde: Statistisk sentralbyrå, tabell 06913* |

## Response shape

Three dimensions, same layout as ssb-08764:

| Dimension | Values |
|---|---|
| `Region` | ~1 288 codes — including historical variants going back decades |
| `ContentsCode` | 8 codes — `Folkemengde`, `Levende`, `Dode`, `Fodselsoverskudd`, `Innflyttinger`, `Utflyttinger`, `Nettoinnflytting`, `Folketilvekst` |
| `Tid` | 76 years — 1951 through 2026 (projections in later years) |

Cell count: 1 288 × 8 × 76 ≈ 783 k cells (just under SSB's 800 k-per-request cap). Default v2-beta response with no filters now returns 400 *"Non-existent value"* — the ingest module passes explicit `valuecodes[Region|ContentsCode|Tid]=*` to work around this (observed 2026-04-28; smaller SSB tables like 08764 still accept the no-filter default).

## Row shape

```json
{
  "region_code": "0301",
  "year": 2026,
  "contents_code": "Folkemengde",
  "contents_label": "Folkemengde 1. januar",
  "value": 720000,
  "status": null
}
```

## Run locally

```bash
npm run ingest:ssb-06913
```

## Known quirks

- **Region codes are prefixed.** Unlike `ssb-08764` / `ssb-12944` / `ssb-07459`, this table prefixes region codes with a type indicator: `K_0301` (Oslo as kommune), `F_03` (Oslo as fylke), `R_*` for other region types. The `kommune_dim` dbt model will need to strip/normalise prefixes when joining against sources that use bare codes.
- **Historical region codes galore.** The Region dimension includes codes for kommuner and fylker that have since merged. Filtering happens downstream (in `kommune_dim`), not in ingest.
- **Includes projections.** For years beyond the last observation, SSB publishes projections. The table mixes observed and projected values without a flag on individual rows — something to verify against the upstream metadata if it becomes important downstream.
- **ContentsCode names.** 8 codes: `Folkemengde`, `Levende`, `Dode`, `Fodselsoverskudd`, `Innflyttinger`, `Utflyttinger`, `Nettoinnflytting`, `Folketilvekst`. No accented characters in the code strings even where the label has them.
- **Explicit valuecodes filters required.** The default `/data` endpoint with no filters returns 400 — see "Response shape" above. Fixed by passing `filters: { Region: "*", ContentsCode: "*", Tid: "*" }` in `index.ts`.

## References

- Catalogue: [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md)
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
