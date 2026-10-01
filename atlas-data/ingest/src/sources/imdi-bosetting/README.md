# imdi-bosetting

IMDi **bosettingstall** — kommune-level refugee resettlement figures: how many people a kommune
was asked to resettle, agreed to resettle, actually resettled, and resettled under collective
protection, **per year**.

## What the script does

1. `GET` [the hub page](https://www.imdi.no/bosetting/bosettingstall/) and discover every
   `/bosetting/bosettingstall/nokkeltall-bosetting-<YYYY>/` link currently present
   (`discoverYearPages`) — not a hardcoded year range, so a new year appearing on the hub is
   picked up automatically.
2. `GET` each discovered year's page.
3. Find the `<h2>` whose text starts `"Oversikt over bosettingen i kommunene i <year>"` and parse
   every `<table>` between it and the next `<h2>` — one table per fylke, each with the same fixed
   column order: Kommune, anmodet, vedtatt, bosatte, bosatte med kollektiv beskyttelse
   (`parseKommuneTables`).
4. **Replace** `raw.imdi_bosetting` on each run (`DELETE` then batched `INSERT … ON CONFLICT …`).
5. Mirror rows to `atlas-data/ingest/output/imdi-bosetting.ndjson`.

Static, server-rendered HTML — no ZIP, no xlsx, no JS execution needed, unlike every other scraped
source in this project.

## The file shape — read this before touching `parse.ts`

Verified live 2026-10-01 (`PLAN-009-imdi-bosetting.md` Phase 1). IMDi publishes **kommune names,
not codes** — there is no upstream code to extract, so `kommune_nr` resolution happens entirely
downstream, via the existing `crosswalk_kommune_name` dbt model, on name text alone.

IMDi's own fylke groupings are **not stable across years** — the 2022 page groups kommuner into 11
fylke tables (pre-2024-reform names), the 2025 page into 15 (post-reform names, e.g. the restored
Trøndelag/pre-reform splits). Fylke is therefore deliberately **not captured as a column at all**
— storing it from one year's table shape and not another's would silently encode an upstream
naming change Atlas has no business normalizing. If a consumer wants fylke, it's derivable from
`kommune_nr` downstream via the existing kommune→fylke crosswalk, consistently across years.

Column *assignment* is by fixed table position, not by re-parsing each header's wording — but the
header cell count is checked against the expected 5 (Kommune + 4 metrics) and the function throws
on a mismatch rather than silently misaligning columns if IMDi ever changes the table layout.

## Known quirks / fragility

- **Column count is NOT fixed across this source's own history** — verified live 2026-10-01
  against all 5 then-discoverable years. 2022/2023/2025 tables have 4 metrics (anmodet, vedtatt,
  bosatte, bosatte_kollektiv_beskyttelse); 2024 has those 4 for every fylke **except Oslo**, whose
  table alone carries 2 extra columns (avtalt / agreed-to-resettle, and its collective-protection
  split); 2026 (the in-progress current year) has all 6 metrics on every one of its 15 fylke
  tables. Reads as IMDi piloting the "avtalt" pair on Oslo in 2024 before rolling it out everywhere
  in 2026. `parseKommuneTables` resolves metrics by header **text** (`HEADER_TO_METRIC`), not
  position, specifically to represent this rather than normalize it away — a table emits exactly
  the metrics its own header row has; an unrecognized header throws instead of silently
  misaligning or dropping a column.
- **Suppression marker is `:`** (a literal colon) — IMDi's own convention, explained inline on
  every year's page: *"Dette betyr at tallet er fjernet av personvernhensyn. Det betyr som regel
  at det er under fem personer i feltet..."* (removed for privacy, usually fewer than 5 people).
  Different from every other source ingested this project (`*` for NAV, `..`/`.` for SSB/Bufdir).
  Confirmed present in **every** sampled year (2022: 178 suppressed cells, e.g. Farsund's
  `bosatte_kollektiv_beskyttelse`; 2025: e.g. Alvdal's) — it is not a recent-years-only artifact.
- **A cell can also hold free text instead of a number or `:`** — Moskenes' 2024 `vedtatt` cell
  reads `"avventer vedtak"` (awaiting a decision). `parseCell` already maps any unparseable text to
  `null`, same as the `:` marker; not a second suppression convention to special-case.
- **Oslo has exactly one row, not a kommune+fylke split** — Oslo is both a kommune and a fylke, and
  IMDi's table for it has a single `tbody` row rather than the fylke-total-then-bydel-breakdown
  shape NAV's source uses. No special-casing needed; `parseKommuneTables` treats it like any other
  single-row fylke table.
- **One page per year, not a cumulative history file.** Each year's page is independent and stable
  once published (not continuously revised the way NAV's current-year file is); no re-resolution
  of a changing download hash is needed, unlike `nav-uforetrygd`.
- **The IMDikator interactive tool was investigated and deliberately not depended on.** A promising
  lead (data.norge.no → IMDikator → an `app-simapi-prod.azurewebsites.net` backend) turned out to
  need a headless browser to observe real network calls to reverse-engineer — out of proportion for
  this source. See `PLAN-009-imdi-bosetting.md` for the full investigation and the explicit decision
  not to fold in the `[Q42]`/`[Q43]` IMDikator extensions the investigation doc recommended.
- **Licence could not be found on IMDi's own site** (checked the bosettingstall page, its footer,
  and IMDi's one data.norge.no catalogue record — none states a licence). `license: NLOD` in the
  manifest is Atlas's own documented default for an unstated Norwegian public-sector licence, not a
  citation of something IMDi itself states. Terje authorized proceeding regardless — "IMDI is ok.
  we can use it." (2026-10-01). See the manifest's own licence-note comment before correcting this
  if IMDi ever publishes an explicit statement.

## References

- Hub page: https://www.imdi.no/bosetting/bosettingstall/
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Plan: [`PLAN-009-imdi-bosetting.md`](../../../../../website/docs/ai-developer/plans/active/PLAN-009-imdi-bosetting.md)
