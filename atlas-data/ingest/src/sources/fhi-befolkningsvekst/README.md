# fhi-befolkningsvekst

FHI Folkehelsestatistikk table **185 — *Befolkningsvekst***. Year-over-year change in resident population per region. Both absolute change (TELLER) and percent growth rate (RATE).

## What the script does

POSTs an unfiltered request (full 2002–2024 history, both measures) to FHI's open API and upserts ~19k rows to `raw.fhi_befolkningsvekst`.

## Known quirks

- **KJONN and ALDER are degenerate.** Each has exactly one code (`"0"` and `"0_120"` respectively) — the table is whole-population only, no breakdowns. Stored anyway for shape consistency with sibling FHI tables.
- **Full history pulled, no `bottom` filter.** Cell count is small enough (~19k) that we can afford the whole 23-year series — population growth is a trend metric where the year-over-year shape is the analytical signal, not a single latest value.
- **Pairs with `fhi-befolkning` (table 338) and `fhi-prognose` (table 171).** Observed counts (338) → growth rates (185) → projection (171); same dimension naming.

## Known issues / TODOs

- TELLER vs RATE semantics are not explicit in FHI's response: TELLER appears to be the absolute change (people added or lost), RATE the percent growth. Verify against FHI docs before using as a labeled headline.

## References

- Companion sources: [`../fhi-befolkning/`](../fhi-befolkning/), [`../fhi-prognose/`](../fhi-prognose/)
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
