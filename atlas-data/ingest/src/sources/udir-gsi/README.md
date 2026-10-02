# udir-gsi

Udir **GSI** (Grunnskolens informasjonssystem) — pupil counts, counts of pupils with
individually-tailored instruction, counts of pupils with reinforced Norwegian instruction, and
school counts, **per kommune, per school year**. Atlas's first Udir source.

## What the script does

1. `GET` [the Rapportside endpoint](https://statistikkportalen.udir.no/api/rapportering/rest/v1/Rapportside/GSK_Elev_Skol)
   to resolve the **current** report version's data endpoint path (e.g.
   `rest/v1/Statistikk/GSK/GSI/1/8`) and Udir's own declared current school year. Never
   hardcoded — Udir republishes report versions over time, and a version pinned once would
   eventually go stale and 404 or silently serve an outdated shape.
2. `GET` `filterVerdier` once with that current year, to discover every valid school-year code
   Udir has data for — again, not a hardcoded range.
3. For each discovered year, `GET` the data endpoint with the trinn/kjønn/eierform breakdown
   filters pinned to `-10` (Udir's own "alle"/all sentinel), which collapses the response to
   exactly 4 measure columns per kommune — see "Scope" below for why.
4. **Replace** `raw.udir_gsi` on each run (`DELETE` then batched `INSERT … ON CONFLICT …`), same
   convention as every other source this project.
5. Mirror rows to `atlas-data/ingest/output/udir-gsi.ndjson`.

## The real API — read this before touching `parse.ts`

Verified live 2026-10-01/02 (`PLAN-010-udir-gsi.md` Phase 1/2). Udir's own public documentation
page (`udir.no/om-udir/data/api-data-fra-elevundersokelsen/`) names a base URL for a *sibling*
API (Elevundersøkelsen) that is **dead**:
`api.udir-statistikkbanken.no` resolves and completes a TLS handshake, but the certificate
presented is a generic `*.azurewebsites.net` wildcard that does not cover that hostname, and every
path returns Azure's own "Web App - Error 404" page — not Udir's API.

The real, working system this source actually talks to is **"USS — Udirs StatistikkSystem"**, at
`statistikkportalen.udir.no/api/rapportering`, documented via a real Swagger/OpenAPI doc
(`.../swagger/v1/swagger.json`) found by reading the structured error message the real API
returns when a required filter is missing — it names its own docs location. ⚠️ **Its own
description**: *"Dette APIet tilgjengeliggjør statistikkdata for utdanningsdirektoratet. APIet er
ikke ment for ekstern bruk i dag, og vil endres uten varsel."* (not intended for external use
today, will change without notice). Real, documented, working — but not a stability promise.
Treat a response-shape change as an expected failure mode: this ingest throws loudly on an
unexpected shape (wrong cell count, missing endpoints) rather than silently misparsing.

**This one API covers far more than GSI** — confirmed live by listing every table under each
schema (`GSK` grunnskole, `VGO` videregående, `BHG` barnehage, `OT`). `GSK` alone includes `GSI`
(this source), `FravaerG`, `NasjonaleProever`, `EUG`/`ElevundersoekelsenG`, `ResultatFagG`, and
more; `VGO` includes `SluttaV`, `GjennomfoeringV`, and more. A future Udir source should reuse
this same client shape with a different `skjema`/`tabell` pair, not re-derive the mechanism.

## Scope — read this before "fixing" the measure count

GSI's own report ("Elever og skoler") is a genuine multi-dimensional cross-tab: measures broken
down by trinn (grade, 1st–10th + rollups), kjønn (sex), and eierform (kommunal/ikke-kommunal), on
top of the kommune/fylke/national geography. Requesting the *unfiltered* default returns **420
columns per kommune per year** for this one report alone.

This source deliberately ingests only the **grand-total slice**: trinn/kjønn/eierform all pinned
to `-10` ("alle"), collapsing the response to exactly the 4 top-line measures — total pupils,
individually-tailored-instruction count, Norwegian-reinforcement count, school count. This is a
real, considered scope decision (see `PLAN-010-udir-gsi.md` **[Q2]**/**[Q3]**), not a parsing
shortcut: Report #10 (the stated downstream consumer) needs kommune-level supply totals, not a
10-grade × 2-sex × 2-ownership breakdown nobody has asked for yet. If a future consumer needs the
breakdown, it's the same API with different filter values — not a new source.

## Known quirks / fragility

- **Suppression marker is the literal `*`** — same convention as `nav-uforetrygd`, different from
  `imdi-bosetting`'s `:` and the Bufdir sources' `..`/`.`. Confirmed on real small kommuner (Træna,
  Utsira) where the individually-tailored-instruction and Norwegian-reinforcement counts are
  suppressed while the plain pupil/school counts for the same kommune are not.
- **`region_code` needs no crosswalk, but it is not the same claim as "is a kommune."** The
  `EnhetID` hierarchy already carries real SSB-format codes at this level when the request includes
  `inkluderKoder=true` — a row's own `kode` field is usable directly, no free-text name to resolve
  (unlike `imdi-bosetting`). But `2100` (Svalbard) and `2111` sit at the exact same tree depth as
  genuine kommuner, because GSI reports a school there — matching SSB's own `21xx` Svalbard
  pattern. `raw.udir_gsi` stores the column as `region_code`, not `kommune_nr`, for this reason;
  `indicators__udir_gsi.sql` resolves `kommune_nr` through this project's existing
  `classify_region_code`/`region_code_to_kommune_nr` macros, same as every other kommune-grain
  source — never by assuming every 4-digit code at this depth is a real kommune.
- **A depth row-identification trap**: a data row's own `id` field is a dot-separated internal
  path (e.g. `"1.49.1423"`), **not** a usable code — the real code only appears in the separate
  `kode` field. The `radSti=-12.*.*` query mixes fylke-level (2 path segments) and the next level
  down (3 segments) into one response; `parse.ts` filters to exactly 3 segments. A `radSti` that
  returns only that level was not found — filtering client-side by path depth is simpler and was
  verified correct against the real response (373 rows = 15 fylker + 358 at depth 3, including
  Svalbard).
- **No `dim_school` built here.** GSI's data is also queryable at individual-school resolution
  (org number) — deliberately not ingested in this source. See `PLAN-010-udir-gsi.md` **[Q2]** for
  the full reasoning; this is Atlas's first school-CAPABLE source but not its first school-grain
  one.
- **No authentication needed** for the statistics read endpoints used here. The Swagger doc also
  lists `/Altinn/*`, `/Authentication/*`, `/Authorization/*` paths — those are for the *reporting*
  side (schools submitting their own return data via Altinn), not the public read side this source
  uses.

## References

- Rapportside: https://statistikkportalen.udir.no/api/rapportering/rest/v1/Rapportside/GSK_Elev_Skol
- Swagger: https://statistikkportalen.udir.no/api/rapportering/swagger/v1/swagger.json
- Udir's own (partially dead-linked) data portal: https://www.udir.no/om-udir/data/
- Licence: https://data.norge.no/nlod/no/2.0 (confirmed directly on Udir's own terms page)
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Plan: [`PLAN-010-udir-gsi.md`](../../../../../website/docs/ai-developer/plans/active/PLAN-010-udir-gsi.md)
