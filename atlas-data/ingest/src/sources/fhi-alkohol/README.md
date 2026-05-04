# fhi-alkohol

FHI Folkehelsestatistikk table **332 — *Alkohol_Ungdata_KH***. Share of Ungdata respondents reporting alcohol use one or more times in the past year. Risk-direction youth-substance-use indicator from the Ungdata cohort.

## What the script does

POSTs an unfiltered request (full 2012–2025 history, both KJONN, both measures) to FHI's open API and upserts ~34k rows to `raw.fhi_alkohol`.

## Known quirks

- **Risk-direction indicator** — higher value = more youth reporting alcohol use = worse from a public-health framing. `ref_indicator_direction = -1` for composites.
- **Same Ungdata shape** as fhi-livskvalitet / fhi-depresjon / fhi-smertestillende / fhi-fortrolig-venn / fhi-hasj. ALDER fixed at `"1_6"` (Ungdata cohort identifier), ANTALL_GANGER at `"engangellerflere"` (one-or-more uses — the affirmative band), SOES at `"0"` (combined SES). MEASURE_TYPE = SMR + MEIS only — sample-based, no TELLER/RATE.
- Pairs naturally with `fhi-hasj` (table 363, cannabis) — both share dim shape and Ungdata cohort, so a substance-use composite joins on `geo_code + aar_code + kjonn_code` cleanly.

## Known issues / TODOs

- Ungdata ALDER `"1_6"` semantics — same gap as the other Ungdata sources.
- Companion FHI Ungdata indicators worth onboarding as needed: `Skulketskolen_Ungdata` (table 813 — school truancy), `Andrenarko_Ungdata` (810 — other narcotics), `Royk_Ungdata` (812 — smoking), `Snus_Ungdata` (814 — snus).

## References

- Companion sources: [`../fhi-hasj/`](../fhi-hasj/) (cannabis), [`../fhi-livskvalitet/`](../fhi-livskvalitet/), [`../fhi-depresjon/`](../fhi-depresjon/), [`../fhi-fortrolig-venn/`](../fhi-fortrolig-venn/), [`../fhi-smertestillende/`](../fhi-smertestillende/), [`../fhi-mobbing/`](../fhi-mobbing/) — same Ungdata cohort
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Ungdata programme overview: https://www.ungdata.no/
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
