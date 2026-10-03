# udir-fravar

Udir **Fravær i grunnskole** — median and average days/hours of documented absence, plus
participant count, **for 10th-grade pupils only**, per kommune, for every available school year.
Atlas's fourth Udir source. Plugs Report #3 (Youth Outcomes) — Atlas's first annual-absence
axis, previously only approximated by `fhi-vgs-gjennomforing`'s 3-year completion rate.

## What the script does

1. `GET` the `GSK_fravaer` Rapportside to resolve the live report version and an anchor year —
   never hardcoded.
2. `GET` `filterVerdier` once with that anchor year, to discover every valid school-year code
   Udir has data for.
3. For every discovered year, `GET` the data endpoint at **two `radSti` anchors** (`-12.*.*` for
   domestic Norway, `-13.*.*` for schools abroad — see "Known quirks" below), each bulk-fetching
   every kommune nationally in one call, with `EierformID`/`KjoennID` pinned to "alle" and both
   measure-toggle filters on so each call returns all 5 measure columns. **~22 calls total across
   11 years.**
4. **Replace** `raw.udir_fravar` on each run (`DELETE` then batched `INSERT … ON CONFLICT …`),
   same convention as every other source this project.
5. Mirror rows to `atlas-data/ingest/output/udir-fravar.ndjson`.

## The real API shape — read this before touching `parse.ts`

Verified live 2026-10-03 (`PLAN-017-udir-fravar.md` Phase 1/2). **This report's shape matches
`udir-gsi`'s/`udir-nasjonale-prover`'s, NOT `udir-elevundersokelsen-mobbing`'s.** Confirmed via
the response's own `metadata.rowHierarchy` (`["Nasjonalt","Fylke","Kommune","Enhet"]`) —
`EnhetID` IS the row hierarchy here, so the cheap `radSti` depth-by-segment-count technique
`udir-gsi` already uses applies directly.

**A genuinely separate sibling report, `VGO_fravaer` (videregående), exists upstream and is NOT
ingested by this source.** Confirmed live: its `EnhetID` hierarchy is
`["Nasjonalt","Fylke","Enhet"]` — no kommune level at all, the next depth down is individual
schools (org numbers). Norway's videregående skoler are organised and owned by fylkeskommune,
not kommune, and Udir's own `EnhetID` tree reflects that directly — this is a structural fact,
not a parsing gap. Deliberately deferred; see `PLAN-017-udir-fravar.md` **[Q4]** for the
cross-cutting decision this would require (does Atlas support a fylke-only-resolution indicator
relation, or build the `dim_school` crosswalk already deferred twice for `udir-gsi`).

⚠️ **A real correction, caught at the start of Phase 2, not Phase 1**: this plan's own Phase 1
research originally recommended "latest year only," matching what it believed was every other
annual Udir source's convention. That was wrong — `udir-gsi`'s own code (not its README's prose)
backfills fully when the call cost is cheap, confirmed by reading its `index.ts` (its main loop
iterates every discovered year, not just the latest) and its own live `filterVerdier` (12 years).
This report's cost is the same cheap shape, so **v1 backfills all 11 available years.**

⚠️ **A second real correction, caught the same day**: Phase 1's manual test of the `Utlandet`
anchor (`radSti=-13.*.*`) appeared to return zero rows — but that test had an explicit,
conflicting `EnhetID(-12)` filter alongside the `-13.*.*` anchor, an invalid combination, not a
real empty response. Re-tested without the conflicting filter, and confirmed again independently
by the real ingest module's first live run: `Utlandet` carries **real, non-suppressed data every
single year** (65 real pupils for 2024-25), the same shape `udir-nasjonale-prover` already found
for its own Utlandet anchor.

## Scope — this source is structurally 10th-grade-only

Unlike `udir-nasjonale-prover`'s multi-grade shape, `GSK_fravaer` has no `TrinnID` filter at
all — its own `Rapportside.gyldigeFiltre` list confirms this, and the report's own description
text states why: *"Tabellen viser medianen for antall dager og timer fravær for elever på 10.
trinn, slik det er ført på vitnemålet."* This is Udir's own scope for this table, not an Atlas
filter — there is no `grade` column in `raw.udir_fravar` because there is no other grade to
represent.

## Known quirks / fragility

- **Suppression marker is the literal `*`** — same convention as every Atlas source this
  session. Confirmed live on Modalen, where all 5 measures are suppressed for the only year
  sampled directly; other years/kommuner suppress independently.
- **A kommune can be entirely absent from a given year's row set without the response being
  empty overall** — confirmed live: Utsira does not appear at all in the 2024-25 domestic
  response, most likely too small a 10th-grade cohort to report that year. This is a real
  absence, not a suppressed row (which would still appear with `*` on every measure) — same
  "real absence, not suppression" shape `udir-elevundersokelsen-mobbing`/`udir-nasjonale-prover`
  already found.
- **`Utlandet` needs a second `radSti` anchor, and carries real data every year** — `Utlandet`
  (`id -13`) sits under its own top-level node, a **sibling** of `Hele landet` (`id -12`), not a
  descendant — `radSti=-12.*.*` does not reach it. See the correction above: both anchors must be
  queried, and both carry real data.
- **This report's own `filterDefaultVerdier.TidID` is a 3-element trend default**
  (`[202306, 202406, 202506]`), unlike `udir-gsi`'s single-value `TidID` — `parseRapportside`
  only ever uses `TidID[0]` as `filterVerdier`'s own "obligatorisk" anchor value (any one valid
  year satisfies it) to discover the full year list; the 3-vs-1 shape difference does not affect
  the result.
- **Five measure columns in one call** — `Median dager`, `Median timer`, `Snitt dager`,
  `Snitt timer`, `Antall elever` — more than `filterVerdier`'s own `VisMaaltall` value list
  suggested (it names only `"Snitt timer"` as the `id:1` option's label; the real response
  carries all four day/hour statistics plus the participant count under that one flag).
  Norwegian decimal comma (e.g. `"9,0"`) and ASCII-space-thousands (e.g. `"4 277"`) cell shapes,
  same `parseCell` conventions `udir-nasjonale-prover` already built.
- **Backfills all 11 available years (2014-15 through 2024-25), not latest-only** — see the
  correction above.
- **Licence is NLOD** — same portal (`udir.no/om-udir/data/`) already confirmed explicitly for
  `udir-gsi`/`udir-elevundersokelsen-mobbing` and inherited for `udir-nasjonale-prover` and this
  source.

## References

- Rapportside: https://statistikkportalen.udir.no/api/rapportering/rest/v1/Rapportside/GSK_fravaer
- Fravær i grunnskole page: https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/fravarstall/
- Licence: https://data.norge.no/nlod/no/2.0
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Plan: [`PLAN-017-udir-fravar.md`](../../../../../website/docs/ai-developer/plans/completed/PLAN-017-udir-fravar.md)
