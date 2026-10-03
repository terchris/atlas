# udir-nasjonale-prover

Udir **Nasjonale prøver** — national test scale-score results, uncertainty margin, and
participant count, per kommune, per grade (5th, 8th, 9th), per subject
(engelsk/lesing/regning), for the latest school year. Atlas's third Udir source, and its first
direct learning-outcome signal — every other Udir source measures supply (`udir-gsi`) or
self-reported experience (`udir-elevundersokelsen-mobbing`), not test performance.

## What the script does

1. For each of **two separate report versions** (see "The real API shape" below), `GET` its own
   Rapportside to resolve the live report version and current year — never hardcoded.
2. `GET` `filterVerdier` once per report to discover the valid school years, grades (`TrinnID`),
   and subjects (`ProevetypeID`) — not a hardcoded range or list.
3. For every discovered grade × subject combination, for the **latest school year only**: `GET`
   the data endpoint at **two `radSti` anchors** (`-12.*.*` for domestic Norway, `-13.*.*` for
   schools abroad — see "Known quirks" below), each bulk-fetching every kommune nationally in one
   call. **~18 calls total for one year.**
4. **Replace** `raw.udir_nasjonale_prover` on each run (`DELETE` then batched
   `INSERT … ON CONFLICT …`), same convention as every other source this project.
5. Mirror rows to `atlas-data/ingest/output/udir-nasjonale-prover.ndjson`.

## The real API shape — read this before touching `parse.ts`

Verified live 2026-10-03 (`PLAN-016-udir-nasjonale-prover.md` Phase 1/2). **This report's shape
matches `udir-gsi`'s, NOT `udir-elevundersokelsen-mobbing`'s.** Confirmed via the response's own
`metadata.rowHierarchy` (`["Nasjonalt","Fylke","Kommune","Enhet"]`) — `EnhetID` IS the row
hierarchy here, so the cheap `radSti` depth-by-segment-count technique `udir-gsi` already uses
applies directly, not `udir-elevundersokelsen-mobbing`'s per-region-call technique.

**Two separate report versions feed this one source** — same `NasjonaleProever` table name,
genuinely different endpoints:
- `GSK_NP_Geografisk` ("ungdomstrinn", basePath `.../NasjonaleProever/1/1`) — 8th and 9th grade.
- `GSK_NP_Geo_Trinn5` ("5. trinn", basePath `.../NasjonaleProever/4/1`) — 5th grade.

⚠️ **A real correction, caught mid-implementation, not in Phase 1**: the 5th-grade report's own
`Rapportside.gyldigeFiltre` list omits `TrinnID` entirely, which Phase 1 read as "grade 5 is
implicit, no TrinnID filter exists." That was wrong — `filterVerdier`'s response for that same
report still carries one real `TrinnID` entry (`{id:4, kode:"5"}`), and passing `TrinnID(4)`
explicitly to the data endpoint succeeds with an identical result. `gyldigeFiltre` describes the
UI's own valid-filter list, not what the data endpoint actually accepts — `parse.ts` discovers
grade uniformly from `filterVerdier` for both reports, with no special-casing.

## Known quirks / fragility

- **Not every grade × subject combination exists upstream.** English is tested only at 8th
  grade, not 9th — confirmed live: that combination returns a genuinely empty response
  (`{"metadata":{"columns":[]},"rows":[]}`), the same "real absence, not suppression" shape
  `udir-elevundersokelsen-mobbing` found on Hægebostad's missing 10th grade. This ingest does not
  hardcode which combinations are valid — it iterates every discovered `TrinnID` × `ProevetypeID`
  pair and represents an empty result as zero rows, so a future change by Udir is picked up
  automatically.
- **`Utlandet` (schools abroad) needs a second `radSti` anchor — a finding neither `udir-gsi` nor
  `udir-elevundersokelsen-mobbing` needed.** `Utlandet` sits under its own top-level node (`id
  -13`), a **sibling** of `Hele landet` (`id -12`), not a descendant — `radSti=-12.*.*` does not
  reach it (confirmed live: absent from that call's 371 rows). It carries **real, non-suppressed
  data** (73 real pupils at `Utlandet, uspesifisert`/`2599`), so this source queries both anchors
  and merges the results rather than dropping the second one.
- **Suppression marker is `*`** — same convention as `udir-gsi`/`udir-elevundersokelsen-mobbing`.
  Confirmed live on small kommuner (Bygland, Utsira); suppression is per-row, not per-kommune — a
  kommune's scale score can be suppressed in one grade/subject while reporting real data in
  another.
- **Three cell shapes, one `parseCell`.** `Skalapoeng` (scale score) is a plain integer;
  `Usikkerhet` (uncertainty) carries a Norwegian decimal comma (e.g. `"0,3"`); `Antall elever
  deltatt` (participant count) uses a plain ASCII space as a thousands separator (e.g. `"6 640"`
  — confirmed byte-by-byte, not a non-breaking space). One function handles all three.
- **No stable measure code**, unlike `udir-elevundersokelsen-mobbing`'s `EUIndeks_*`/
  `EUSpoersmaal_*` — only the column label (`Skalapoeng`/`Usikkerhet`/`Antall elever deltatt`),
  same shape as `udir-gsi`'s own measure columns. `grade` and `subject`, however, DO have stable
  codes (`TrinnID.kode`/`ProevetypeID.kode`), unlike `udir-gsi`'s measure names.
- **Historical backfill deliberately deferred, but for a different reason than
  `udir-elevundersokelsen-mobbing`'s.** All 4 available years (2022-23 through 2025-26) are
  equally cheap to query here (~18 calls/year, not ~702) — backfill is deferred by convention,
  matching every other annual Udir source, not because of call-volume cost.
- **Licence is NLOD** — same portal (`udir.no/om-udir/data/`) already confirmed twice this
  session for `udir-gsi` and `udir-elevundersokelsen-mobbing`.
- **A real, upstream-documented trend break**: results from before the 2022-23 school year were
  removed from Udir's own statistics bank on 2025-11-13 (the report's own methodology text states
  this directly) — not an Atlas backfill decision, the data genuinely does not exist upstream
  before then.

## References

- Nasjonale prøver page: https://www.udir.no/tall-og-forskning/statistikk/nasjonale-prover/
- Licence: https://data.norge.no/nlod/no/2.0
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Plan: [`PLAN-016-udir-nasjonale-prover.md`](../../../../../website/docs/ai-developer/plans/active/PLAN-016-udir-nasjonale-prover.md)
