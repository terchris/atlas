# fhi-hasj

FHI Folkehelsestatistikk table **363 — *Hasjbruk_Ungdata_KH***. Share of Ungdata respondents reporting cannabis use one or more times in the past year. Risk-direction youth-substance-use indicator from the Ungdata cohort.

## What the script does

POSTs an unfiltered request (full 2012–2025 history, both KJONN, both measures) to FHI's open API and upserts ~34k rows to `raw.fhi_hasj`.

## Known quirks

- **Risk-direction indicator** — higher value = more youth reporting cannabis use = worse from a public-health framing. `ref_indicator_direction = -1` for composites.
- **Same Ungdata shape** as fhi-alkohol / fhi-livskvalitet / fhi-depresjon / fhi-smertestillende / fhi-fortrolig-venn. ALDER fixed at `"1_6"` (Ungdata cohort identifier), ANTALL_GANGER at `"engangellerflere"` (one-or-more uses — the affirmative band), SOES at `"0"` (combined SES). MEASURE_TYPE = SMR + MEIS only — sample-based, no TELLER/RATE.
- Pairs naturally with `fhi-alkohol` (table 332) — both share dim shape so a substance-use composite joins on `geo_code + aar_code + kjonn_code` cleanly.
- **Cannabis use prevalence is generally lower than alcohol** at this age cohort, so suppression is heavier — expect more NULL values at small-kommune slices than alkohol.

## Known issues / TODOs

- Ungdata ALDER `"1_6"` semantics — same gap as the other Ungdata sources.
- Suppression rate is higher than the other Ungdata indicators; the dbt model should document expected NULL-rate at kommune level.
- `Andrenarko_Ungdata` (table 810) is the natural companion for "harder narcotics beyond cannabis" — onboard if downstream substance-use composites need broader scope.

## References

- Companion sources: [`../fhi-alkohol/`](../fhi-alkohol/), [`../fhi-livskvalitet/`](../fhi-livskvalitet/), [`../fhi-depresjon/`](../fhi-depresjon/), [`../fhi-fortrolig-venn/`](../fhi-fortrolig-venn/) — same Ungdata cohort
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Ungdata programme overview: https://www.ungdata.no/
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
