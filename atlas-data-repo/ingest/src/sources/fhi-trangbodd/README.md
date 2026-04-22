# fhi-trangbodd

FHI Folkehelsestatistikk table **794** — *Trangbodd_UTDANN*. Share of population living in overcrowded housing by region × age × education × housing-status × measure.

**Why Atlas uses this**: Samfunnspuls's overcrowded-housing indicator comes from a special-ordered SSB extract (`ssb-spesialbestilt-bosted-husholdning`) with no public-API equivalent. FHI publishes the underlying data openly in this table; Atlas sources it here instead.

## Upstream

| Field | Value |
|---|---|
| Provider | Folkehelseinstituttet (FHI) |
| Source | `nokkel` (Folkehelsestatistikk) |
| Table id | `794` |
| URL | https://statistikk-data.fhi.no/api/open/v1/nokkel/table/794 |
| Auth | None |
| Format | json-stat2 (response) |
| Licence | FHI open terms |
| Attribution | *Kilde: Folkehelseinstituttet, Folkehelsestatistikk tabell 794 (Trangbodd)* |

## Response shape

Six dimensions:

| FHI dim | Codes |
|---|---|
| `GEO` | ~409 (mixed kommune/fylke/bydel/nasjon) |
| `AAR` | 10 (`"2015_2015"` … `"2024_2024"`) |
| `ALDER` | 9 age bands |
| `UTDANN` | 5 education-level codes (`0`=all, `1`–`4`=specific levels) |
| `BODD` | 2 (`"trangt"` overcrowded, `"uoppgitt"` unknown) |
| `MEASURE_TYPE` | 3 (`RATE`, `SMR`, `TELLER`) |

## Query used

```json
{ "dimensions": [
  { "code": "AAR",          "filter": "bottom", "values": ["1"] },
  { "code": "ALDER",        "filter": "all",    "values": ["*"] },
  { "code": "UTDANN",       "filter": "all",    "values": ["*"] },
  { "code": "BODD",         "filter": "all",    "values": ["*"] },
  { "code": "GEO",          "filter": "all",    "values": ["*"] },
  { "code": "MEASURE_TYPE", "filter": "item",   "values": ["RATE"] }
]}
```

**Filter strategy**: keep the full UTDANN (5 education levels) × ALDER ×
BODD breakdown — the whole point of this table vs `fhi-bor-alene` is the
education dimension. Narrow `MEASURE_TYPE` to `RATE` (the headline
percentage) to stay under FHI's 50 000-cell cap:

  1 AAR × 9 ALDER × 5 UTDANN × 2 BODD × 409 GEO × 1 RATE ≈ 37 k cells.

SMR and TELLER can be added later as a parallel fetch if needed (their
combined cell count would push us over the cap).

## Row shape emitted

```json
{
  "geo_code": "0301",
  "aar_code": "2024_2024",
  "alder_code": "0_120",
  "utdann_code": "0",
  "bodd_code": "trangt",
  "measure_type": "RATE",
  "value": 12.4,
  "status": null
}
```

## How to run

```bash
npm run ingest:fhi-trangbodd
```

## Known quirks

- **FHI's `top`/`bottom` filter semantics.** `bottom 1` = latest AAR. Same as other FHI sources.
- **GEO dim mixes levels.** Same treatment as `fhi-bor-alene`: `kommune_nr` computed only for 4-digit codes.
- **ALDER 0_120 = all ages.** Useful headline. Under-18 specific view would filter to `0_17`-style codes if present.

## Known issues / TODOs

- UTDANN breakdown is out of scope for this ingest (see query explanation).
- BODD code `uoppgitt` is kept verbatim in raw; dbt headline filter uses `bodd_code = 'trangt'`.

## References

- Catalogue: [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md) — `ssb-spesialbestilt-bosted-husholdning` entry documents this substitution.
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Sibling: [`../fhi-bor-alene/`](../fhi-bor-alene/)
