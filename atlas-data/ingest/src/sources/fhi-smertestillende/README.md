# fhi-smertestillende

FHI Folkehelsestatistikk table **390 — *Smertestillende_ungdata***. Share of Ungdata respondents reporting they use painkillers at least weekly — a known marker of chronic pain / psychological distress in adolescents. Joins the Ungdata mental-health-adjacent family alongside `fhi-livskvalitet`, `fhi-depresjon`, `fhi-mobbing`.

## What the script does

POSTs an unfiltered request (full 2014–2025 history, both KJONN, both measures) to FHI's open API and upserts ~29k rows to `raw.fhi_smertestillende`.

## Known quirks

- **Painkiller frequency as a proxy.** "At least weekly" pain-medication use among teenagers is treated by FHI as an indicator of underlying chronic pain or psychological distress, not just headache prevalence — useful in the youth-wellbeing index alongside self-reported QoL and depression scores.
- **Same Ungdata shape as livskvalitet / depresjon.** ALDER is fixed at `"1_6"` (Ungdata cohort identifier — verify against Ungdata methodology before labelling), STATUS at `"Minst_ukentlig"` (at-least-weekly band — the one slice the table exposes), SOES at `"0"` (combined SES). MEASURE_TYPE = SMR + MEIS only — no TELLER/RATE because Ungdata is sample-based.
- **Small table.** ~29k cells full cartesian; no filtering needed.

## Known issues / TODOs

- Ungdata ALDER `"1_6"` semantics need verification — same gap as the other Ungdata sources.
- Companion sources to consider: `Trygghet_ungdata` (table 399 — feeling safe), other Ungdata frequency-band indicators that surface as patterns of weekly use.

## References

- Companion sources: [`../fhi-livskvalitet/`](../fhi-livskvalitet/), [`../fhi-depresjon/`](../fhi-depresjon/), [`../fhi-mobbing/`](../fhi-mobbing/) — same Ungdata cohort base
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Ungdata programme overview: https://www.ungdata.no/
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
