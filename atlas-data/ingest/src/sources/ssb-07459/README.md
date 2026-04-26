# ssb-07459

SSB statistikkbanktabell **07459** — *Alders- og kjønnsfordeling i kommuner, fylker og hele landets befolkning*.

Catalogue entry: [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md).

## Upstream

| Field | Value |
|---|---|
| Provider | Statistisk sentralbyrå (SSB) |
| Table id | `07459` |
| URL | https://data.ssb.no/api/pxwebapi/v2-beta/tables/07459 |
| Auth | None |
| Format | JSON-stat2 |
| Licence | NLOD 2.0 |
| Attribution | *Kilde: Statistisk sentralbyrå, tabell 07459* |

## Response shape

Five dimensions — the largest in the catalogue so far:

| Dimension | Values |
|---|---|
| `Region` | ~994 codes |
| `Kjonn` | 2 codes — `"1"` (Menn), `"2"` (Kvinner) |
| `Alder` | 106 codes — `"000"`, `"001"`, …, `"104"`, `"105+"` (single-year age as text) |
| `ContentsCode` | 1 code — `Personer1` (resident count) |
| `Tid` | 41 years — 1986 through 2026 |

Default v2-beta response is latest year only → 994 × 2 × 106 × 1 × 1 ≈ **210 000 cells**. Well under the 800 k-cell request cap but notably larger than other sources.

## Row shape

```json
{
  "region_code": "0301",
  "sex": "2",
  "age": "042",
  "year": 2026,
  "contents_code": "Personer1",
  "contents_label": "Personer",
  "value": 4832,
  "status": null
}
```

## Run locally

```bash
npm run ingest:ssb-07459
```

Expect a longer runtime than other sources — roughly 30–60 seconds end-to-end (network-dominated fetch, plus ~420 upsert chunks of 500 rows each).

## Known quirks

- **Age stored as text.** SSB's Alder codes are three-digit strings with a `"105+"` catch-all. Preserving verbatim avoids ambiguity; dbt casts to int where needed.
- **Sex codes are digits, not letters.** SSB uses `"1"` for men and `"2"` for women — not `"M"`/`"F"` or `"M"`/`"K"`. We pass through verbatim.
- **Latest-year-only default** (like every v2-beta source so far). Historical series reachable by adding a Tid filter in `lib/pxweb.ts` when needed.
- **Large payload.** A dim-name typo (e.g. expecting `"Kjønn"` vs the actual code `"Kjonn"` without the ø) would crash the `toRow()` mapping on every cell. We check all five dimensions at the start of each mapping.

## References

- Catalogue: [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md)
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
