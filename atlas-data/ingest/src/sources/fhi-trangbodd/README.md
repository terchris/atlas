# fhi-trangbodd

FHI Folkehelsestatistikk table **794** — *Trangbodd_UTDANN*. Share of population living in overcrowded housing by region × age × education × housing-status × measure.

**Why Atlas uses this**: Samfunnspuls's overcrowded-housing indicator comes from a special-ordered SSB extract (`ssb-spesialbestilt-bosted-husholdning`) with no public-API equivalent. FHI publishes the underlying data openly in this table; Atlas sources it here instead.

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
