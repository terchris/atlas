# kartverket-fylke

Kartverket's **current county boundaries**, via Geonorge. urb-agents #2098/#2099 (R4). Sibling to
`kartverket-kommune` — same shape, same quirks (BOM, mixed `objtype` values in one array, see that
source's own README).

## What the script does

Places a Geonorge order for the whole country in GeoJSON/EPSG:4258, downloads the ZIP, filters to
`objtype='Fylke'` (discarding `objtype='Grense'` boundary-line features in the same array), and
upserts into `raw.kartverket_fylke`.

## Known quirks

- Same BOM and mixed-`objtype` quirks as `kartverket-kommune` — see that source's README.
- **15 rows, not 16.** `dim_fylke` carries a `'99 Uoppgitt'` sentinel because SSB Klass publishes
  one; Kartverket's own administrative geometry has no polygon for "unspecified", so there is
  nothing to filter out or exempt here — the count is just naturally 15 real fylker.
- `fylkesnavn` is already Kartverket's own combined display name (e.g. `"Troms - Romsa -
  Tromssa"`), same as `kommunenavn` on the sibling source — not a surprise here since the
  hyphenated form is visible in the field's own value, unlike `kommunenavn` where it wasn't
  obvious until checking a multi-name feature directly.

## References

- Geonorge dataset: `6093c8a8-fa80-11e6-bc64-92361f002671` (Administrative enheter fylker)
- Shared order/download helper: [`../../lib/geonorge.ts`](../../lib/geonorge.ts)
