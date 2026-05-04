# fhi-mediebruk-spill

FHI Folkehelsestatistikk table **601 — *Mediebruk_DataTVspill_Ungdata_KH***. Share of Ungdata respondents reporting more than 3 hours per day on computer / TV / gaming. Risk-direction screen-time indicator from the Ungdata cohort.

## What the script does

POSTs an unfiltered request (full 2013–2025 history, both KJONN, both measures) to FHI's open API and upserts ~32k rows to `raw.fhi_mediebruk_spill`.

## Known quirks

- **Risk-direction indicator** — higher value = more youth report >3h/day TV+gaming = worse from a public-health framing. `ref_indicator_direction = -1`.
- **Same Ungdata shape** as the other Ungdata sources. ALDER fixed at `"1_6"`, MEDIEBRUK at `"Merenn3timer"` (>3h/day band), SOES at `"0"` (combined). MEASURE_TYPE = SMR + MEIS only.
- One of three FHI media-use tables — pairs with `fhi-mediebruk-some` (social media) and `fhi-mediebruk-underhold` (streaming) for the full screen-time picture.
- **Caveat for interpretation**: gaming + TV use is not strongly correlated with mental-health outcomes the way social-media use is in the youth-research literature. Higher gaming hours can co-occur with both withdrawn and well-socially-connected youth — context matters.

## Known issues / TODOs

- Ungdata ALDER `"1_6"` semantics — same gap as the other Ungdata sources.
- A composite "any-media >3h/day" indicator joining all three mediebruk tables would be a useful follow-up dbt model — but careful about double-counting since a youth can be over the threshold on multiple subdomains simultaneously.

## References

- Companion sources: [`../fhi-mediebruk-some/`](../fhi-mediebruk-some/), [`../fhi-mediebruk-underhold/`](../fhi-mediebruk-underhold/), [`../fhi-livskvalitet/`](../fhi-livskvalitet/), [`../fhi-depresjon/`](../fhi-depresjon/) — same Ungdata cohort
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Ungdata programme overview: https://www.ungdata.no/
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
