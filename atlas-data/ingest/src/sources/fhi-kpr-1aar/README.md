# fhi-kpr-1aar

FHI Folkehelsestatistikk table **370 — *KPR_1***. Annual per-region contact rates with municipal primary-care services (Kommunalt pasient- og brukerregister), broken down by ICPC-2 code group, sex, and age. First data Atlas has on the actual healthcare-utilisation side, complementing self-reported survey data from Ungdata.

## What the script does

POSTs a filtered request (latest year, KJONN=0, MEASURE=RATE) to FHI's open API and upserts ~41k rows to `raw.fhi_kpr_1aar`.

## Known quirks

- **KPR = Kommunalt pasient- og brukerregister** — Norway's municipal patient register. Captures contacts with kommune-level primary care (fastlege / legevakt). Distinct from NPR (specialist hospital care, tables 699 / 714).
- **KODEGRUPPE values are ICPC-2 code ranges**, not individual diagnoses:
  - `P01_P29` — psychological symptoms (chapter P, lower numbers)
  - `P70_P99` — psychological diagnoses (chapter P, higher numbers)
  - `P01_P29ogP70_P99` — combined chapter P (FHI's pre-aggregated total — exclude from disjoint sums)
  - `P73ogP76`, `P74ogP79ogP82`, `P01_P04ogP25ogP28_P29` — specific symptom clusters
  - `K70_K99` — chapter K (cardiovascular)
  - `L01_L29`, `L70_L99`, `L01_L29ogL70_L71ogL82_L99` — chapter L (musculoskeletal)
  - `Skader` — injuries
- **Cell budget forces aggressive filtering.** Full product is ~3.9M cells, ~80× FHI's 50k cap. Atlas pulls latest year × KJONN=0 × MEASURE=RATE only — the headline contact-rate slice. Sex-stratified, multi-year, and other measure types can be added as sibling sources.
- **GEO has 373 codes** (vs ~409 in other FHI tables) — this table is national + fylker + kommuner only, no bydel resolution.
- **AAR uses single-year format** (`"2024_2024"`) but the table is genuinely 1-year (no rolling). Companion KPR_3 (table 369) carries 3-year rolling averages for smoother trends.

## Known issues / TODOs

- ICPC-2 code-group label dictionary (`P01_P29` → "Psychological symptoms / mild") would let downstream models render human-readable group names; likely a stable hand-authored seed.
- KPR_3 (table 369, 3-year rolling) as a sibling source if smoother trends are needed.
- Sex-stratified slice if `kjonn`-resolved analysis becomes a use case.

## References

- Companion source: [`../fhi-livskvalitet/`](../fhi-livskvalitet/), [`../fhi-depresjon/`](../fhi-depresjon/) — self-reported wellbeing; pairs with KPR for actual care contacts on the same outcomes.
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- ICPC-2 reference: https://www.who.int/standards/classifications/other-classifications/international-classification-of-primary-care
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
