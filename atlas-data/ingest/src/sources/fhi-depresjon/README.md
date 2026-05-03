# fhi-depresjon

FHI Folkehelsestatistikk table **339 — *Depressive symptomer_Ungdata_KH***. Share of youth reporting depressive symptoms in the Ungdata survey, by region × sex × socioeconomic status. Atlas's first youth mental-health indicator; pairs with `fhi-livskvalitet` on the same Ungdata cohort base.

## What the script does

POSTs a filtered request (latest 4 years, all sex × SES × measure breakdowns) to FHI's open API and upserts ~39k rows to `raw.fhi_depresjon`.

## Known quirks

- **Sample-based, not enumeration.** Same Ungdata convention as `fhi-livskvalitet` — there's no TELLER/RATE, only SMR (standardised ratio vs national) and MEIS (FHI mean / smoothed indicator). Don't sum or count these as if they were absolute observations.
- **Cell budget forces a year-window filter.** The full 14-year × 4-SES × 3-sex product is ~137k cells, well over FHI's 50k cap. We pull `bottom(4)` — the latest four years, ~39k cells. Pre-2022 history (2012–2021) lives in the table; a sibling backfill source can add it later if downstream wants long-run trends.
- **DEPRESJON is single-code `"Ja"`.** The table reports the share answering "yes" to having depressive symptoms; "no" responses aren't in this slice. Treat the `value` as `% of respondents` reaching the symptomatic threshold.
- **SOES has 4 codes** (`0` combined + 3 specific levels) — Atlas keeps them all so the SES gradient is queryable downstream.
- **ALDER is fixed at `"1_6"`** — same Ungdata cohort identifier as `fhi-livskvalitet`. Verify against Ungdata methodology.

## Known issues / TODOs

- Add a backfill sibling for the pre-2022 history if long-run analysis becomes a use case (cell budget allows it with a single year × all SES × all sex slice per request, or by chunking).
- Document SOES code semantics — likely `1`/`2`/`3` map to low/middle/high family socioeconomic status; needs Ungdata-doc verification.

## References

- Companion source: [`../fhi-livskvalitet/`](../fhi-livskvalitet/) (table 373 — same Ungdata cohort, quality-of-life dimension)
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Ungdata programme overview: https://www.ungdata.no/
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
