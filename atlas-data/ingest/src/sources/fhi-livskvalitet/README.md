# fhi-livskvalitet

FHI Folkehelsestatistikk table **373 — *Livskvalitet_Ungdata_KH***. Subjective quality of life among youth, sourced from FHI's Ungdata survey aggregations.

## What the script does

POSTs an unfiltered request (full 2021–2025 history, both KJONN and both measure types) to FHI's open API and upserts ~12k rows to `raw.fhi_livskvalitet`.

## Known quirks

- **From Ungdata** — the Norwegian youth-data survey programme. This table is FHI's regional aggregation of self-reported quality-of-life scores; the underlying respondents are 7th-graders through upper-secondary students.
- **ALDER, LIVSKVALITET, SOES are single-code dimensions in this slice.** ALDER is fixed at `1_6` (likely a survey-cohort grouping, not literal ages 1-6 — verify against Ungdata methodology), LIVSKVALITET at `8_10` (the "high quality of life" score band on a 0–10 scale), SOES at `0` (combined socioeconomic statuses). Stored anyway for shape consistency; downstream queries can ignore them.
- **MEASURE_TYPE = SMR or MEIS.** SMR is the standardised ratio vs national; MEIS is FHI's mean / smoothed indicator value. There's no TELLER (count) or RATE (percent) in this table — the underlying survey has a sample-based design, not an enumeration.
- **Small table.** ~12k cells full cartesian; we pull everything in one request.

## Known issues / TODOs

- ALDER code semantics need verification — `1_6` is non-obvious. May be a survey-cohort identifier rather than an age band.
- MEIS measure documentation needs hand-verification before this can be labelled as a headline indicator.
- Likely siblings exist in the Ungdata family on FHI Statistikk (`Trivsel_Ungdata`, `Mobbing_Ungdata`, etc.) — onboard as needed.

## References

- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Ungdata programme overview: https://www.ungdata.no/
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
