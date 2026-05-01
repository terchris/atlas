# fhi-innvkat

FHI Folkehelsestatistikk table **650 — *INNVAND_INNVKAT***. Population by immigrant category (1st-gen immigrant / 2nd-gen Norwegian-born with immigrant parents / combined) per region × age band.

## What the script does

POSTs a fully-wildcarded request (latest year only) to FHI's open API and upserts ~37k rows to `raw.fhi_innvkat`.

## Known quirks

- **Complements `fhi-innvandrere` (table 175).** That table splits by LANDBAK (country background); this one collapses LANDBAK and splits by INNVKAT (immigrant category — 1st-gen vs 2nd-gen vs combined). Joining the two by `geo_code + aar_code + alder_code` lets analysts cross-cut origin × generation.
- **INNVKAT codes**: `2` = innvandrere (1st-generation immigrants), `3` = norskfødte med innvandrerforeldre (Norwegian-born with two immigrant parents), `23` = combined "with immigrant background" — sum of `2` + `3`. The `23` rows are NOT independent observations; they're FHI's pre-aggregated total and should be excluded from disjoint-category sums.
- **LANDBAK is fixed at "0"** for this table — origin region is collapsed. Use `fhi-innvandrere` for origin-region resolution.
- **GEO mixes levels.** Standard FHI convention.

## Known issues / TODOs

- INNVKAT vs LANDBAK code-list mappings would benefit from a shared reference seed (`ref_fhi_innvkat`, `ref_fhi_landbak`) so downstream models can decode codes to labels without hard-coding.

## References

- Companion source: [`../fhi-innvandrere/`](../fhi-innvandrere/) (table 175 — country-origin split, INNVKAT collapsed)
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
