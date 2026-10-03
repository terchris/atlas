# lottstift-momskompensasjon

Lottstift (Lotteri- og stiftelsestilsynet) **momskompensasjon** — annual VAT-compensation
allocations to voluntary organisations: who received how much, per year. Atlas's first Lottstift
source. Completes investigation candidate #9's financial-resolution half, alongside the already-
shipped `brreg-frivillige` (organisational status + ICNPO category).

## What the script does

1. For each of **six shipped years** (2019-2024), `GET` that year's own static XLSX file
   directly from `lottstift.no` — no HTML discovery, the URLs are fixed and already known.
2. Parse that year's own column layout (recipient organisasjonsnummer column + final-amount
   column — both differ by year, see "The real file shapes" below) into
   `(organisasjonsnummer, amount)` pairs, summing duplicate-recipient rows within a year.
3. **Replace** `raw.lottstift_momskompensasjon` on each run (`DELETE` then batched
   `INSERT … ON CONFLICT …`), same convention as every other source this project.
4. Mirror rows to `atlas-data/ingest/output/lottstift-momskompensasjon.ndjson`.

Geography and ICNPO category are **not** parsed here at all — they are resolved downstream by
joining `organisasjonsnummer` against Atlas's own `dim_brreg_enhet` (populated via the separate
`brreg-frivillige` source) in `indicators__lottstift_momskompensasjon.sql`.

## The real file shapes — read this before touching `parse.ts`

Verified live 2026-10-04 (`PLAN-020-lottstift-momskompensasjon.md` Phase 1/2). **Not** the
`tilskudd.lottstift.no` search app the investigation's own URL pointed at — that is a real
Next.js/GraphQL-backed app (confirmed live: server-rendered pages embed a paginated
`SimpleRecipients` React-Query shape), but no public GraphQL endpoint was found after checking
its JS bundles and probing likely paths. The real, working mechanism is simpler:
`lottstift.no/nb/om-oss/apne-data/` lists direct, static XLSX downloads at predictable
`lottstift.no/app/uploads/YYYY/MM/<filename>.xlsx` URLs — no auth, no Cloudflare wall.

⚠️ **Every year's column layout is genuinely different** — confirmed by downloading and
inspecting all 9 available years directly (2016-2024), not assumed from one sample:

| Year | Sheet | Recipient orgnr column | Amount column | Amount meaning |
|---|---|---|---|---|
| 2019 | `2019` | `Org.nr. mottakar` | `Tildelt etter avkorting (NOK)` | awarded after reduction |
| 2020 | `2020` | `Org.nr. søkar` | `Utbetalt Beløp (NOK)` | paid |
| 2021 | `2021` | `Org.nr. mottakar` | `Utbetalt beløp ink. administrasjonsgebyr (NOK)` | paid, incl. admin fee |
| 2022 | `Uttrekk_moms` | `Org.nr` | `Tildelt beløp` | awarded |
| 2023 | `Uttrekk_moms` | `Org.nr` | `Tildelt beløp` | awarded |
| 2024 | `Tildelinger` | `Organisasjonsnummer` | `Tildelt` | awarded |

**2016, 2017, 2018 are deliberately NOT ingested** — confirmed live, these three years' files
have no recipient organisasjonsnummer at all. An umbrella applicant (e.g. "4H NORGE") reports
each sub-unit (e.g. "4H ØSTFOLD") as a name-only row with no orgnr of its own. Matching a
recipient to Brreg by name alone would be the exact kind of unreliable guess this project avoids
(see `imdi-bosetting`'s own name-crosswalk caution). 2010-2015 are PDF only on Lottstift's own
site and were not attempted, matching the established "no PDF parser" convention.

## Known quirks / fragility

- **A small number of organisations receive more than one case/grant in the same year** —
  confirmed live: 30 duplicate recipients in 2022, 30 in 2023, 14 in 2020 (out of ~20-24k rows
  each year). Amounts are summed per `(organisasjonsnummer, year)`, not kept as separate rows —
  Atlas's grain question is "how much did this org receive this year," not "how many separate
  administrative cases existed."
- **The "amount" column's real meaning differs by year** — requested, approved, awarded-after-
  reduction, or paid (sometimes including an administration fee). `amount_label` records which
  of that year's own column headers fed the value, so the difference stays visible rather than
  being silently normalised away.
- **A missing amount cell is treated as 0**, not an error — confirmed live, a still-pending or
  rejected case can have no amount recorded for that row.
- **Geography and ICNPO category come from `dim_brreg_enhet`, never from this file's own
  `Kommune`/`Kategori` text columns** — those columns are inconsistently present (2020 has
  neither) and shaped (2022/2023's `Kommune` is an upper-case town name with no code in 2022,
  a numeric `Kommunenr` added only in 2023) across years, while `dim_brreg_enhet` already
  resolves both reliably for every organisation.
- **Licence is NLOD 2.0** — confirmed directly on the registered `data.norge.no` catalogue entry
  for "Åpne datasett fra Lotteri- og stiftelsestilsynet", which names the momskompensasjon scheme
  specifically.

## References

- Open data listing: https://lottstift.no/nb/om-oss/apne-data/
- Licence (data.norge.no catalogue entry): https://data.norge.no/en/datasets/c56c33ae-3d48-407f-b2b1-41d593e83c4c/apne-datasett-fra-lotteri-og-stiftelsestilsynet-bokmal
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Plan: [`PLAN-020-lottstift-momskompensasjon.md`](../../../../../website/docs/ai-developer/plans/active/PLAN-020-lottstift-momskompensasjon.md)
