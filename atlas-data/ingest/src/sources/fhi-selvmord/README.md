# fhi-selvmord

FHI Folkehelsestatistikk table **344 — *Selvmord femårig***. Suicide deaths per region, 5-year rolling windows, broken down by sex and age band.

## What the script does

POSTs a filtered request (latest 3 rolling 5-year windows, all sex × age, MEASURE=MEIS) to FHI's open API and upserts ~48k rows to `raw.fhi_selvmord`.

## Known quirks

- **5-year rolling windows are FHI's standard for suicide.** Annual kommune-level rates are too noisy due to small samples — most kommuner have 0 or 1 suicide in a typical year. The 5-year window stabilises the denominator. AAR codes are `"YYYY1_YYYY5"` (e.g. `"2020_2024"`) for each rolling 5-year period; latest typically lags by ~1 year as cause-of-death registration completes.
- **MEIS measure preferred over raw RATE for small areas.** FHI publishes:
  - `RATE` — raw incidence rate per 100,000 (noisy at kommune level)
  - `TELLER` — absolute deaths in the 5-year window (small-cell suppression applies)
  - `SMR` — standardised ratio vs national (100 = national average)
  - `MEIS` — FHI's mean / smoothed indicator that pools information across geography
  Atlas pulls **MEIS only** because at kommune level the smoothed value is the only one that maps reliably onto a chart. Sibling sources can add the raw measures for analyses where pooling is inappropriate.
- **Cell budget forces a year-window filter.** Full table is ~2M cells (31 rolling windows). Atlas pulls `bottom(3)` — three most recent windows, ~48k cells. Pre-2010 history exists in the table for trend analysis if needed.
- **AARSAK is a single code "SELVMORD"** in this table — the table is pre-filtered to suicide. The `aarsak_code` column is stored anyway for shape consistency with FHI's wider cause-of-death table 342 (`Dødsårsaker tiårig`) and 343 (annual `Dødsårsaker-nøkkeltall-1990-ettårig`) where AARSAK is multi-valued.
- **Suppression is heavy.** Many kommune × age × sex cells will be NULL (in the `value` column) because FHI suppresses small counts to protect privacy. This is correct behaviour — don't backfill or interpolate at ingest.

## Sensitivity note

Suicide statistics are sensitive. Downstream consumers should follow FHI's [veileder for omtale av selvmord](https://www.fhi.no/) when publishing — avoid sensational framing, link to crisis-help resources, and prefer smoothed regional aggregates over single-kommune call-outs.

## Known issues / TODOs

- Sibling source for raw RATE / TELLER if a use case actually needs unsmoothed counts (with explicit caveats about sample-size noise and small-cell suppression).
- Companion `fhi-dodsarsaker` source from table 342 (10-year rolling, all causes) for placing suicide alongside other causes of death.

## References

- FHI Folkehelseprofilen suicide methodology: https://www.fhi.no/
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
