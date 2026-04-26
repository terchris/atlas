# Kommune boundary attribution

`kommuner-2024.geojson` — simplified 2024 kommune boundaries, 357 features.

**Source**: [robhop/fylker-og-kommuner](https://github.com/robhop/fylker-og-kommuner) (`Kommuner-S.geojson`, the "S" = simplified variant)
**Original data**: [Kartverket](https://www.kartverket.no/) via [Geonorge](https://www.geonorge.no/).
**Licence**: CC BY 4.0.

**Attribution shown in UI**: "Kommunegrenser: Kartverket via robhop/fylker-og-kommuner, CC BY 4.0."

Feature properties used by Atlas:
- `kommunenummer` (4-digit code) — join key to `marts.dim_kommune.kommune_nr`
- `kommunenavn` — kept for fallback if `dim_kommune` isn't available client-side

Not used:
- `name`, `id` — duplicates of the above

Refresh schedule: replace when new kommune boundaries become authoritative (next likely event: 2026 kommune reform or name changes).
