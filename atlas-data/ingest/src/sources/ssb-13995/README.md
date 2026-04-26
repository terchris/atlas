# ssb-13995

SSB statistikkbanktabell **13995** — *Sosialhjelpstilfeller, utbetalt beløp og stønadstid*. Per-kommune counts of social-assistance cases and recipients, payouts, and support duration.

## What the script does

Fetches the latest year for every region × every content code (34 of them), unflattens the JSON-stat2 response, upserts ~30 000 rows to `raw.ssb_13995`.

## Upstream

| Field | Value |
|---|---|
| Provider | Statistisk sentralbyrå (SSB) |
| Table id | `13995` |
| URL | https://data.ssb.no/api/pxwebapi/v2-beta/tables/13995 |
| Auth | None |
| Format | JSON-stat2 |
| Licence | NLOD 2.0 |
| Attribution | *Kilde: Statistisk sentralbyrå, tabell 13995* |

## Response shape

Three dimensions. All three carry `elimination=false` — explicit filters required.

| Dimension | Codes | Notes |
|---|---|---|
| `KOKkommuneregion0000` | ~891 | KOSTRA region code — kommuner + aggregates. Mapped to `region_code` at ingest. |
| `ContentsCode` | 34 | Number of cases, recipients, share of population, amounts, duration, etc. |
| `Tid` | 2022–2025 | 4 years |

## Row shape emitted

```json
{
  "region_code": "3101",
  "year": 2024,
  "contents_code": "KOSsosantkliente0000",
  "contents_label": "Sosialhjelpsmottakere per 1000 innbyggere",
  "value": 27.1,
  "status": null
}
```

## How to run locally

```bash
npm run ingest:ssb-13995
```

## Known quirks

- **Unusual dim name.** KOSTRA tables use `KOKkommuneregion0000` instead of the standard `Region`. Semantically the same — we rename in `toRow()`.
- **Many content codes.** 34 distinct codes means a heavy fact-layer footprint. `fact_kommune_indicators` will include the kommune-level subset; consumers pick the specific codes they need.
- **Time span is narrow.** 2022–2025 only. SSB deprecates and rebuilds KOSTRA tables periodically; older data lives in other table ids.

## Known issues / TODOs

- Content codes need human-friendly labels in downstream features. The `contents_label` column carries SSB's own — use those where possible.

## References

- Catalogue: [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md) — ssb-13995 entry.
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
