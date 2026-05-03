# fhi-mediebruk-some

FHI Folkehelsestatistikk table **602 — *Mediebruk_SOME_Ungdata_KH***. Share of Ungdata respondents reporting more than 3 hours per day on social media. Risk-direction screen-time indicator from the Ungdata cohort — and the most analytically interesting of the three media tables since the social-media subdomain has the strongest mental-health correlation in the youth-research literature.

## What the script does

POSTs an unfiltered request (full 2015–2025 history, both KJONN, both measures) to FHI's open API and upserts ~27k rows to `raw.fhi_mediebruk_some`.

## Known quirks

- **Risk-direction indicator** — higher value = more youth report >3h/day social media = worse from a public-health framing. `ref_indicator_direction = -1`.
- **Same Ungdata shape** as the other Ungdata sources. ALDER fixed at `"1_6"`, MEDIEBRUK at `"Merenn3timer"` (>3h/day band), SOES at `"0"` (combined). MEASURE_TYPE = SMR + MEIS only.
- **Strongest mental-health-outcome correlation** of the three media tables. Useful as a downstream input to youth-wellbeing composites alongside `fhi-depresjon` / `fhi-fortrolig-venn` — high SOME use + low confiding-friend share is a particularly worrying signal pattern.
- **Sex gradient is large**: girls historically report markedly higher >3h/day social-media use than boys. Composites must orient by KJONN slice or risk masking the gap.

## Known issues / TODOs

- Ungdata ALDER `"1_6"` semantics — same gap as the other Ungdata sources.
- The "social media" definition has shifted over time as platforms changed; cross-year comparisons should treat the >3h band cautiously.

## References

- Companion sources: [`../fhi-mediebruk-spill/`](../fhi-mediebruk-spill/), [`../fhi-mediebruk-underhold/`](../fhi-mediebruk-underhold/), [`../fhi-fortrolig-venn/`](../fhi-fortrolig-venn/), [`../fhi-depresjon/`](../fhi-depresjon/) — same Ungdata cohort
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Ungdata programme overview: https://www.ungdata.no/
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
