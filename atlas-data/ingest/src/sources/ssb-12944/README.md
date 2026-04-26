# ssb-12944

Ingestion module for SSB statistikkbanktabell **12944** — *Personer i husholdninger med vedvarende lavinntekt (EU-60), 3-årsperiode*.

Strategic metadata (Atlas use cases, Samfunnspuls citation, Atlas decision) lives in [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md). This README covers implementation-level notes.

## What the script does

Fetches `https://data.ssb.no/api/pxwebapi/v2-beta/tables/12944/data?lang=no&outputFormat=json-stat2`, unflattens the JSON-stat2 response, writes NDJSON locally, and (if `DATABASE_URL` is set) upserts into `raw.ssb_12944`.

## Upstream

| Field | Value |
|---|---|
| Provider | Statistisk sentralbyrå (SSB) |
| Table id | `12944` |
| Auth | None |
| Format | JSON-stat2 |
| Rate limits | 30 req/min/IP, 800 000 cells/request |
| Licence | NLOD 2.0 |
| Attribution | *Kilde: Statistisk sentralbyrå, tabell 12944* |

## Response shape

**Four** dimensions — note the extra `Alder` (age) compared to `ssb-08764`, and that `Tid` values are three-year rolling periods, not single years:

| Dimension | Values |
|---|---|
| `Region` | 1 036 codes — national, fylke, kommune, bydel, grunnkrets, historical variants |
| `Alder` | 6 codes — `999A` (all ages), `00-17`, `18-34`, `35-49`, `50-66`, `067+` |
| `ContentsCode` | 2 codes — `PersonerSeksti` (count), `EUskalaSeksti` (percent, EU-60) |
| `Tid` | 12 periods — `2011-2013` through `2022-2024` |

Full cartesian product is 1 036 × 6 × 2 × 12 = 149 184 cells; the default PxWebAPI v2-beta response returns only the latest period (as observed for 08764).

## Row shape emitted

One row per `(Region, Alder, Tid, ContentsCode)` cell:

```json
{
  "region_code": "0301",
  "age_group": "00-17",
  "period": "2022-2024",
  "contents_code": "EUskalaSeksti",
  "contents_label": "Andel personer med vedvarende lavinntekt (EU-60)",
  "value": 17.3,
  "status": null
}
```

## How to run locally

From `atlas-data/ingest/`:

```bash
npm run ingest:ssb-12944
```

## Known quirks

### `period` stored as text, not parsed into years

`Tid` values come back as upstream codes like `"2022-2024"`. We store them verbatim in the `period` column. If downstream needs start/end years, parse in dbt rather than in the ingest — keeps this module as a faithful passthrough.

### Same v2-beta defaults as 08764

PxWebAPI v2-beta returns only the latest `Tid` period unless asked for more. For v1 that's fine (need-signal feature uses latest). When we want the full 12-period trend, add an explicit Tid filter in `lib/pxweb.ts`.

### `ContentsCode` values differ from 08764

`ssb-08764` uses `EUskala60` / `Personer`; this table uses `EUskalaSeksti` / `PersonerSeksti`. Don't assume uniform SSB code conventions across tables.

## Known issues / TODOs

- Same entry-point guard gap as `ssb-08764` (runs unconditionally on import).
- No period filter (latest only, see above).
- Bydel-level data appears in the `Region` dimension for Oslo, Bergen, Trondheim, Stavanger — potentially useful once we build `kommune_dim` and its bydel extension.

## References

- Catalogue entry: [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md) — `ssb-12944` block
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
