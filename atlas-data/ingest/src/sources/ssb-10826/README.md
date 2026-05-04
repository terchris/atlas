# ssb-10826

SSB statistikkbanktabell **10826** — *Alders- og kjønnsfordeling for befolkningen i bydeler*.

## What the script does

The ingest fetches the latest available year from SSB PxWebAPI v2-beta for table 10826 and writes one row per Region × Kjonn × Alder × ContentsCode × Tid cell to `raw.ssb_10826`.

## Known quirks

- The `Region` dimension is alphanumeric and includes city-total rows, active bydel rows, unknown-bydel rows, and historical bydel rows. The dbt mart preserves the verbatim region code and label, derives parent kommune from the first four digits, and only populates `bydel_code` for six-digit bydel-like codes.
- `Kjonn` uses SSB's numeric sex codes (`"2"` for Kvinner and `"1"` for Menn); dbt decodes them to Atlas's canonical `female` and `male` values.
- `Alder` uses three-character single-year age codes (`"000"` through `"104"`) plus the open-ended `"105+"` bucket.
- The default ingest follows the existing `ssb-07459` pattern and selects `Tid=TOP(1)`. Historical years are available upstream back to 2001 but are not pulled by the scheduled source.

## Known issues / TODOs

- `dim_bydel` and `crosswalk_bydel_to_kommune` are still planned catalogue plumbing, so the mart exposes `bydel_code`, `bydel_name`, and `kommune_nr` directly from the source for now.

## References

- Upstream table: https://www.ssb.no/statbank/table/10826
- Shared PxWeb client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
- Structural template: [`../ssb-07459/`](../ssb-07459/)
