# fhi-mediebruk-underhold

FHI Folkehelsestatistikk table **667 — *Mediebruk_underhold_ungdata***. Share of Ungdata respondents reporting more than 3 hours per day on streaming / entertainment media (TV streaming, music, podcasts, etc.). Risk-direction screen-time indicator from the Ungdata cohort.

## What the script does

POSTs an unfiltered request (full 2018–2025 history, both KJONN, both measures) to FHI's open API and upserts ~20k rows to `raw.fhi_mediebruk_underhold`.

## Known quirks

- **Risk-direction indicator** — higher value = more youth report >3h/day entertainment streaming = worse from a public-health framing. `ref_indicator_direction = -1`.
- **Same Ungdata shape** as the other Ungdata sources. ALDER fixed at `"1_6"`, MEDIEBRUK at `"Merenn3timer"` (>3h/day band), SOES at `"0"` (combined). MEASURE_TYPE = SMR + MEIS only.
- **Shorter time series** (~8 years) than `fhi-mediebruk-spill` (~13 years) — streaming was a relatively new category when FHI added this table.
- One of three FHI media-use tables — companion to `fhi-mediebruk-spill` (TV+gaming) and `fhi-mediebruk-some` (social media). Streaming is the least mental-health-loaded of the three in the literature; included for completeness in the time-budget picture.

## Known issues / TODOs

- Ungdata ALDER `"1_6"` semantics — same gap as the other Ungdata sources.
- "Underhold" (entertainment) is a broader category than the other two — definition stability across years should be verified.

## References

- Companion sources: [`../fhi-mediebruk-spill/`](../fhi-mediebruk-spill/), [`../fhi-mediebruk-some/`](../fhi-mediebruk-some/) — completes the screen-time triplet on the same Ungdata cohort
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Ungdata programme overview: https://www.ungdata.no/
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
