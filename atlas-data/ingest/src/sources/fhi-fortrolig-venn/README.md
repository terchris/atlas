# fhi-fortrolig-venn

FHI Folkehelsestatistikk table **354 — *FORTROLIGVENN_Ungdata_KH***. Share of Ungdata respondents reporting they have a "fortrolig venn" — a close friend they can confide in about personal matters. Social-connectedness indicator and a known protective factor against mental-health risk; complements the symptom-side family (depression, painkillers, suicide).

## What the script does

POSTs an unfiltered request (full 2012–2025 history, both KJONN, both measures) to FHI's open API and upserts ~34k rows to `raw.fhi_fortrolig_venn`.

## Known quirks

- **Protective-direction indicator.** Unlike depression / painkillers / mobbing, *more* of this is *better* — the value is the share answering "ja, tror eller helt sikker" (yes, I think so or definitely). Downstream composites must orient correctly (`ref_indicator_direction = +1`).
- **Same Ungdata shape as livskvalitet / depresjon / smertestillende.** ALDER fixed at `"1_6"` (Ungdata cohort), HARVENN at `"Jatrorellerheltsikker"` (the affirmative band — the one slice the table exposes), SOES at `"0"` (combined SES). MEASURE_TYPE = SMR + MEIS only — sample-based, no TELLER/RATE.
- **34k cells, no filtering needed** — pull everything.

## Known issues / TODOs

- ALDER `"1_6"` and SOES code semantics — same Ungdata-methodology TODOs as the sibling sources.
- Companion FHI Ungdata indicators worth onboarding when the user surfaces them: `Trygghet_ungdata` (table 399 — feeling safe), `Fremtidsoptimisme_Ungdata_KH` (table 355 — future optimism), `Mediebruk_*` (601 / 602 / 667 — screen time).

## References

- Companion sources: [`../fhi-livskvalitet/`](../fhi-livskvalitet/), [`../fhi-depresjon/`](../fhi-depresjon/), [`../fhi-smertestillende/`](../fhi-smertestillende/), [`../fhi-mobbing/`](../fhi-mobbing/) — same Ungdata cohort
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Ungdata programme overview: https://www.ungdata.no/
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
