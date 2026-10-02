# Plan: Ingest Husbanken's bostøtte (housing allowance) statistics

Ingests Husbanken's bostøtte (housing allowance) decisions and payouts — per kommune, with a real
daily-grain time series underneath — as Atlas's first Husbanken source. The investigation's
"Power-BI-backed" claim was wrong: it's Qlik Sense, with a real, anonymously-reachable backend this
agent drove live to pull real per-kommune figures.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Add `husbanken-bostotte` as a served Atlas source, giving Reports #2 (Child Welfare) and
#5 (Income & Welfare Trajectory) the policy-response side of housing distress that `fhi-trangbodd`
(the symptom side — overcrowded housing share) doesn't cover.

**Last Updated**: 2026-10-02

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §3 (Tier 1 #3, [Q8]–[Q9])

**Prerequisites**: None — `husbanken` is already a valid `publishers.yaml` provider (#486). **[Q1]
(licence) is resolved**: Terje, 2026-10-02 — *"Husbanken is owned by the norwegian goverment and
they follow NLOD."* Unlike `imdi-bosetting`'s authorization (a bare "we can use it," with NLOD
applied only as Atlas's own default for an unstated licence), this is a direct statement of the
licence itself — `manifest.yml` records `license: NLOD` as what Terje stated, not as an assumed
default. Still not a citation of a specific Husbanken-published terms page, since this agent could
not find one directly on Husbanken's own site or on `data.norge.no` (see Phase 1.7) — kept that
distinction visible rather than implying it was independently verified on Husbanken's page.

---

## Phase 1: Research — verify the mechanism, licence and shape live

### Findings

- [x] 1.1 **The investigation's "Power-BI-backed" claim is wrong.** `statistikk.husbanken.no` (the
  statistikkbank the investigation's own **[Q8]** recommended using) is a **Qlik Sense** Angular
  app, confirmed from its own bootstrap script (`Initialiserer Qlik`, `qlikUrl`, `qlikAppId`), not
  Power BI. The actual Qlik backend: `qlik.husbanken.no/public`, app id
  `ee185fe5-e94d-463e-bff8-cd1c5f2f566f`, named `"Statistikkbank"` — confirmed live via
  `GET .../api/v1/apps/{appId}` (anonymous, 200, real JSON).
- [x] 1.2 **This is a materially better situation than `imdi-bosetting`'s IMDikator dead-end.**
  Qlik's Engine API (the WebSocket JSON-RPC protocol every Qlik Sense client uses) is **officially
  documented by Qlik**, not a reverse-engineered opaque bundle, and Qlik publishes its own
  open-source JS client (`enigma.js`, MIT licensed). Confirmed live: a raw WebSocket connection to
  `wss://qlik.husbanken.no/public/app/{appId}` completes the standard handshake with
  `"mustAuthenticate":false` — genuinely anonymous access, no credential needed.
- [x] 1.3 **Proved end-to-end, not just reachable — pulled real data live.** Sent a full
  `OpenDoc` → `CreateSessionObject` (hypercube) → `GetLayout` sequence over the WebSocket and got
  back real per-kommune housing-allowance payout figures, e.g. `Fredrikstad: 435438`,
  `Kristiansund: 124961`, `Halden: 187137` (sum of `BostøtteUtbetalingTeller`, unfiltered). This is
  stronger validation than any prior source's Phase 1 this session — not "the API should work",
  but a real number pulled through the exact mechanism Phase 2 would use.
- [x] 1.4 **The data model is real and on-topic.** `GET .../api/v1/apps/{appId}/data/metadata`
  (also anonymous, also real JSON) lists 280 fields across tables including:
  - `DimBST*` (Bostøtte/housing allowance) — `Vedtakskode`, `Brukergruppe`, `Disposisjonsform`
    (tenure form), `Eierforhold`, `EieLeie`; measures `BostøtteSøknadTeller` (applications),
    `BostøtteVedtakTeller` (decisions), `BostøtteUtbetalingTeller` (payouts),
    `BostøtteAvslagTeller` (rejections), `Beregnet bostøtte` (calculated amount).
  - `DimSts*` (Startlån/start loan — a municipal loan product) and `DimHVB*` (housing investment
    grants/subsidies, incl. church and childcare-place variants) — real, substantial sibling
    datasets, not chased further in this plan. See **[Q3]**.
  - `DimKommune` with a real `KommuneNr` field — confirmed live, SSB-format 4-digit codes
    (`1505` Kristiansund, `0301` Oslo) came back directly from a hypercube query, same as
    `udir-gsi`'s discovery — **no crosswalk needed**.
- [x] 1.5 **The real grain is daily, not annual as the investigation assumed.** The `Kalender`
  table's `Dato` field has genuine daily cardinality — confirmed live, `Count(DISTINCT Dato)` by
  month returns `31` for every January queried across 2008–2012. The investigation's "Geo: kommune,
  annual" was a guess; the underlying fact table is transactional, and Atlas can choose its own
  ingest/publish grain rather than being handed one. See **[Q4]**.
- [x] 1.6 **The Boligsosial Monitor (`boligsosial-monitor.husbanken.no`) is a genuinely separate
  mechanism, not reachable through the Qlik app above.** Checked its own JS bundle directly: zero
  mentions of `qlik`, zero `/api/` paths, no discoverable backend host beyond itself. Checked
  whether its subject matter (bostedsløshet/homelessness, kommunal bolig) exists as fields in the
  Statistikkbank's own 280-field list instead — it does not; `DimBST`/`DimSts`/`DimHVB` are
  entirely about allowance/loan/grant programs, not housing status. **This is the same shape as
  `imdi-bosetting`'s IMDikator decision**: a real, separate lead, not chased further here. See
  **[Q5]**.
- [x] 1.7 **Licence: NOT found, genuinely unverified — unlike the confident-but-wrong "NLOD" the
  investigation stated.** Checked Husbanken's privacy-policy page (no licence statement); checked
  `data.norge.no`'s real catalogue search API (the same `search.api.fellesdatakatalog.digdir.no`
  endpoint that found IMDi's and NAV's registrations) for org `942114184` — **zero registered
  datasets**, not one. A web search surfaced a secondary source's summary asserting "Husbanken uses
  NLOD," but it did not point to an actual Husbanken-published statement — **not trusted without a
  direct quote**, consistent with this session's discipline against taking a tool's own synthesis
  as ground truth. This is a real blocker, same shape as `imdi-bosetting`'s original licence
  question. See **[Q1]**.

### Validation

Live `curl`/Node `fetch` + raw WebSocket JSON-RPC against `qlik.husbanken.no` returned real,
current housing-allowance figures for named real kommuner — not asserted from documentation,
pulled and read, the same discipline as every prior source this session.

---

## Open Questions

- **[Q1] RESOLVED, 2026-10-02 — Terje**: *"Husbanken is owned by the norwegian goverment and they
  follow NLOD."* A direct statement of the licence, not merely an authorization to proceed despite
  an unknown one (contrast `imdi-bosetting`'s "we can use it," where NLOD was applied only as
  Atlas's own default). `manifest.yml` records `license: NLOD` as what Terje stated. Still not
  independently verified on a Husbanken-published terms page — this agent checked and found none
  (Phase 1.7) — so the manifest keeps that distinction visible rather than implying direct
  verification.
- **[Q2] Is anonymous Engine API access intentional, or an open door Husbanken doesn't know is
  open?** The app is `"published":true` with `mustAuthenticate:false` on the public virtual proxy —
  this reads as deliberate (Husbanken's own statistikkbank website is built on exactly this access
  path), but it's worth naming the possibility explicitly rather than assuming, the same way
  `udir-gsi`'s Swagger disclaimer ("not intended for external use") was named rather than ignored.
  Does not block starting — same reasoning as `udir-gsi`'s **[Q1]** — but if Terje's licence
  authorization conversation touches on it, record the answer here.
- **[Q3] Scope: Bostøtte only for v1, or also Startlån/HVB grants?** All three are real, substantial,
  on-topic datasets in the same app. **Recommendation**: Bostøtte only for v1 — it's the
  investigation's actual stated ask (the "policy-response side" pairing with `fhi-trangbodd`), and
  Startlån/HVB are genuinely different programs (a municipal loan product; housing-investment
  grants to municipalities/churches/institutions) that would each need their own measure/dimension
  modelling. Once this plan's Qlik WebSocket client exists, a Startlån or HVB source is a fast
  follow-up reusing the client with different field names — same shape as `udir-gsi` unlocking
  `udir-fravar`/`udir-sluttet-vgs`.
- **[Q4] What ingest grain — daily (as published), monthly, or annual?** The real data is daily;
  Atlas doesn't have to publish at that grain. **Recommendation**: annual, matching every other
  kommune-grain Husbanken-adjacent source (`fhi-trangbodd`) and keeping the first Husbanken mart
  simple — pull `Sum`/`Count` measures grouped by `KommuneNr` × `År`. Revisit if a consumer need
  for finer grain emerges; this is a choice, not a constraint the source forces.
- **[Q5] Boligsosial Monitor — pursue later, as its own investigation?** Recommendation: yes, same
  treatment as `INVESTIGATE-imdikator-api.md` — split out once this plan ships, rather than block
  it. Its own backend mechanism is still unknown (no API found in its JS bundle by static
  inspection); would need the same kind of live probing this plan did for the Qlik app, starting
  from scratch.
- **[Q6] RESOLVED, 2026-10-02 — no suppression marker exists.** Checked live against Røyrvik
  (kommune 5043, Norway's smallest by bostøtte volume): every cell is a real number. Unlike
  `udir-gsi`'s `*` or `nav-uforetrygd`'s conventions, this dataset has nothing to treat as
  suppressed; a `null` from `parse.ts`'s `parseCell` means Qlik's own `qNum` was unparseable
  (`"NaN"`), not a deliberate redaction.
- **[Q2] RESOLVED — anonymous access is deliberate**, confirmed by reaching 35,295 real rows
  through it repeatedly during Phase 2 with no auth challenge of any kind.
- **[Q3] RESOLVED — Bostøtte only, as recommended.** Startlån/HVB remain a documented fast-follow
  opportunity, not pursued here.
- **[Q4] RESOLVED — annual, as recommended.** `parse.ts` drops the real daily grain's null-year
  bucket (`"-"`, confirmed live) rather than fabricating a year; the dbt layer aggregates nothing
  further — `index.ts` requests `KommuneNr` × `År` directly from Qlik, so there is no finer grain
  to collapse.
- **[Q7] NEW, discovered during Phase 3 implementation — a second bydel code space.** Husbanken's
  `KommuneNr` dimension also carries Oslo's 15 current bydeler plus one discontinued pre-2004 one
  ("Uranienborg-Majorstua"), as 4-digit codes `0311`-`0326` — confirmed by name live against
  Husbanken's own Qlik app (`0311` = "Gamle Oslo", etc.), not guessed from the shape. This is a
  THIRD numbering for the same 15 Oslo districts Atlas already names via FHI's 6-digit convention
  (`classify_region_code`'s existing `bydel` branch). Found by running `dbt build` against a real
  local Postgres and reading a `relationships` test failure (1,300 rows) rather than assumed away
  — `classify_region_code` now has a second, literal branch for it. See
  `indicators__husbanken_bostotte.sql` and the macro's own comment.

---

## Phase 2: Ingest module + raw table (COMPLETE, 2026-10-02)

### Tasks

- [x] 2.1 Create `atlas-data/ingest/src/sources/husbanken-bostotte/`:
  - **Deviation from plan: no `enigma.js`.** The raw WebSocket/JSON-RPC approach already proven
    live in Phase 1's proof-of-concept scripts covers the handful of calls this ingest needs
    (`OpenDoc`, `CreateSessionObject`, `GetLayout`, `GetHyperCubeData`) with no new dependency.
    `qlik_client.ts` is a small, dependency-free, self-contained client — copied, not shared, for
    any future Qlik-backed source, matching this project's `fetch_retry.ts` convention.
  - `parse.ts` — `parseHypercubeRows`/`parseCell`/`extractMeasureNames`, golden-tested against a
    real 69-row hypercube fixture (`__tests__/fixtures/hypercube_sample.json`).
  - `index.ts` — opens the WebSocket session, requests one hypercube (`KommuneNr` × `År` × 5
    measures with explicit `qLabel`s), pages through `GetHyperCubeData`, upserts
    `raw.husbanken_bostotte`.
  - `manifest.yml`, `README.md`, `__tests__/parse.test.ts` (11 tests, all against the real
    fixture) — done.
  - **Two live-discovered gotchas not in the Phase 1 proof-of-concept notes**: `GetLayout`'s
    result is wrapped in `qLayout` (`result.qLayout.qHyperCube`, not `result.qHyperCube`); the
    real `belop` measure expression is `Sum([Beregnet bostøtte])`, not the guessed
    `Sum(BostøtteBeløp)`. Both caught by a live dry-run against production before touching
    Postgres.
- [x] 2.2 Migration `atlas-data/migrations/060_raw_husbanken_bostotte.sql` —
  `raw.husbanken_bostotte(region_code, year, measure, value, loaded_at)`, PK `(region_code, year,
  measure)` — same shape as `udir-gsi`. `region_code`, not `kommune_nr`, because Svalbard's
  pseudo-codes are present (confirmed live) — same lesson, applied proactively this time.
- [x] 2.3 Dagster registration — `cadence.weekly_polled()`/`WEEKLY_FRESHNESS`, added to the
  existing `annual_sources_refresh` job (`_ANNUAL_SOURCE_IDS` in `schedules.py`, `OTHER_SOURCES`/
  asset group in `raw_other.py`). **The flagged risk did not materialize**: a WebSocket-based
  ingest runs cleanly in the same subprocess-per-ingest model every HTTP source uses — the session
  opens and closes entirely inside that one process, same as any other source's HTTP client.

### Validation

Live dry-run against production (no `DATABASE_URL`): 35,295 rows parsed, zero errors. Full run
against a real local Postgres: 35,295 rows upserted into `raw.husbanken_bostotte`, confirmed via
direct query (Arendal 2010, Svalbard 2100, Oslo bydel 0311 all match the fixture/live data
exactly). `npx vitest run` (11/11 new tests, 279/279 project-wide) and `tsc --noEmit` both clean.

---

## Phase 3: dbt staging and marts (COMPLETE, 2026-10-02)

### Tasks

- [x] 3.1 Added `raw.husbanken_bostotte` to `models/indicators/sources.yml`.
- [x] 3.2 `indicators__husbanken_bostotte.sql` — `kommune_nr`/`region_kind` via
  `region_code_to_kommune_nr`/`classify_region_code`, **not** a bare passthrough — applying
  `udir-gsi`'s lesson proactively paid off: Svalbard's pseudo-codes are present, confirmed live.
  **A second, unplanned finding surfaced here** — see **[Q7]** above: Oslo's bydeler under a
  4-digit numbering `classify_region_code` didn't yet recognise. Caught by an actual
  `relationships` test failure (1,300 rows) against real loaded data, not assumed away; the macro
  now has a literal branch for it, documented in its own comment.
- [x] 3.3 Columns documented in `models/indicators/schema.yml` and `models/marts/api/schema.yml`;
  validated against a real local Postgres loaded with the real ingest (35,295 rows).
- [x] 3.4 `mart_indicators__husbanken_bostotte.sql` + `marts/api/schema.yml` entry — done.
- [x] 3.5 `dbt build` (project-wide, 873 nodes): clean except two pre-existing generic
  freshness/staleness tests unrelated to this source (this scratch Postgres has not had every
  source freshly re-ingested today — confirmed by `mart_brreg_enhet` building clean standalone).
  All 24 husbanken-bostotte-specific nodes (2 models + 21 tests + mart_atlas_inventory) PASS.

### Validation

Real local Postgres, not an empty schema (35,295 rows from a live ingest). The `kommune_nr`
relationship test genuinely exercised the data — it FAILED first (1,300 Oslo-bydel rows), which is
exactly the kind of non-trivial result `udir-gsi`'s validation note was asking for, not a sample
too small to catch anything.

Full 17-script dbt check-suite (`check-api-v1.sh` through `check-osmosis.sh`, run against the same
live Postgres): all green — 48 sources, 85 published relations, 45 per-source indicator relations,
57 raw tables, 84 counted marts. `atlas-data/uis/render-template-info.sh` also green: "first_data
covers all 48 automated sources". `npm run build` (Docusaurus): clean, no broken links.

---

## Phase 4: Deploy and verify arrival (COMPLETE, 2026-10-02 — three attempts)

Shipped live after two real, isolated bugs caught by imac's deploy testing — exactly the kind of
upgrade-path defect `project-atlas.md` says only a real cluster can exhibit:

- **[urb-agents#1807](https://github.com/terchris/urb-agents/issues/1807)** — `package.json` was
  missing the `ingest:husbanken-bostotte` npm script. 40/41 sources succeeded; this one failed with
  `npm error Missing script`, and `raw.husbanken_bostotte` landed with 0 rows. Root cause: every
  local validation this agent ran called `src/sources/husbanken-bostotte/index.ts` directly via
  `tsx`, never through the actual `npm run ingest:<id>` path Dagster uses. Fixed in PR #511, one
  line, plus a new CI gate (`check-every-source-has-an-ingest-script.sh`) proven to catch this
  exact defect before merge.
- **[urb-agents#1808](https://github.com/terchris/urb-agents/issues/1808)** — the re-deploy got
  past the script and hit `ReferenceError: WebSocket is not defined`. `qlik_client.ts` relied on
  the global `WebSocket`; the deployed image's Node is v20.20.2, which has none (added in Node
  21+). Invisible in this agent's own testing, done on Node 22 — matching `package.json`'s stated
  `engines.node >=22.0.0`, which does not match what the Dockerfile actually installs (Node 20.x,
  confirmed via a live `npm ci` printing `EBADENGINE` on every image build, silently ignored).
  Fixed in PR #512 by importing `WebSocket` from the `ws` package explicitly (promoted from a
  transitive dependency via `jsdom` to a direct one). This time verified against Node 20.20.2
  itself (installed via `nvm`) before re-requesting deploy, not a newer local version.
- **[urb-agents#1809](https://github.com/terchris/urb-agents/issues/1809)** — third attempt,
  succeeded clean. `annual_sources_refresh`: SUCCESS, `raw.husbanken_bostotte` = 35,295 rows, exact
  match to the prediction. `transform_and_publish`: SUCCESS. No regression on any of the 40 other
  sources or on `classify_region_code`'s new Oslo-bydel branch.

**Independently verified live** (not just trusting imac's report), 2026-10-02, against
`https://api-atlas.urbalurba.com`:
- `GET /meta_sources?source_id=eq.husbanken-bostotte&select=served_as` → `["indicators__husbanken_bostotte"]`
- `GET /indicators__husbanken_bostotte?limit=1` → a real row (region 1160, kommune, year 2008, measure "soknad")
- `HEAD` with `Prefer: count=exact` → `content-range: 0-35294/35295` — 35,295, exact
- `GET /atlas_inventory?endpoint=eq.indicators__husbanken_bostotte` → `row_count=35295, is_empty=false, origin="ingest"`

All four match imac's report exactly.

---

## Acceptance Criteria

- [x] **[Q1] (licence) resolved** — Terje, 2026-10-02: *"Husbanken is owned by the norwegian
  goverment and they follow NLOD."*
- [x] `husbanken-bostotte` ingests cleanly via the Qlik Engine API with zero rows silently
  dropped — 35,295 rows, confirmed live and against a real local Postgres.
- [x] `raw.husbanken_bostotte` stores `region_code` (not `kommune_nr` directly — Svalbard's
  pseudo-codes are present; `kommune_nr` is derived downstream, same as every other kommune-grain
  source).
- [x] No suppression marker exists in this dataset — confirmed live against Røyrvik, Norway's
  smallest kommune by bostøtte volume.
- [x] `indicators__husbanken_bostotte` and `mart_indicators__husbanken_bostotte` build and test
  clean against real loaded data (24/24 PASS).
- [x] `husbanken-bostotte` appears in `meta_sources.served_as` after a real deploy, independently
  verified via live `curl` — `["indicators__husbanken_bostotte"]`, 2026-10-02.
- [x] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped.

---

## Implementation Notes

- **This is Atlas's first WebSocket-based ingest.** Every prior source is a plain HTTP GET (JSON,
  HTML, or a file download). `enigma.js` manages the JSON-RPC session but the ingest still needs
  explicit connect/open/close lifecycle handling `fetch_retry.ts`'s pattern doesn't directly cover
  — budget real design time for this, don't assume the existing retry wrapper ports over unchanged.
- **Real proof-of-concept exchange** (for reference when writing `index.ts`): `OpenDoc` with
  `{qDocName: appId}` → handle; `CreateSessionObject` with a `qHyperCubeDef` (`qDimensions`,
  `qMeasures`, `qInitialDataFetch`) → object handle; `GetLayout` on that handle →
  `qHyperCube.qDataPages[0].qMatrix`. Pass `inkluderKoder`-equivalent is not needed here — codes
  come back directly when `KommuneNr` is used as a dimension field, confirmed live.
- **Qlik's own REST metadata endpoints are a useful pre-flight check, not a data source**:
  `GET /api/v1/apps/{appId}` (app info) and `GET /api/v1/apps/{appId}/data/metadata` (field/table
  list) are both anonymous and JSON — worth querying at the start of a run to confirm the app is
  still reachable and its schema hasn't moved, before opening the more expensive WebSocket session.
- **Report the dead-end anonymous Power-BI assumption back into the investigation**, same as
  `udir-gsi` corrected its own source's documented API URL — this plan found the investigation's
  own technology guess was wrong, not just a detail.

---

## Outcome

Shipped end to end, 2026-10-02: ingest (35,295 rows, zero dropped) → dbt staging and api_v1
publication → live cluster deploy → independently verified arrival. Atlas's first Husbanken source
and its first WebSocket-based ingest, over the officially documented Qlik Engine API rather than
`enigma.js` (the raw WebSocket/JSON-RPC approach proven live in Phase 1 already covered everything
needed, so the dependency was never added).

Three real findings during implementation Phase 1's research didn't anticipate, caught by real
testing rather than assumed away: (1) Husbanken's `KommuneNr` carries Oslo's 15 bydeler plus one
discontinued pre-2004 one under a 4-digit numbering distinct from the 6-digit convention FHI's
sources already use for the same districts — caught by an actual `relationships` test failure
(1,300 rows) against a live-loaded local Postgres, `classify_region_code` now recognises both; (2)
`package.json` was missing the `ingest:husbanken-bostotte` npm script — every local validation
called the module directly via `tsx`, never through the real `npm run ingest:<id>` path Dagster
uses, so it shipped clean and failed on the first real deploy ([#1807](https://github.com/terchris/urb-agents/issues/1807));
(3) `qlik_client.ts` relied on the global `WebSocket`, absent on the deployed image's Node 20.20.2
(added in Node 21+) — invisible in local testing done on Node 22, which matches `package.json`'s
stated `engines.node` but not what the Dockerfile actually installs
([#1808](https://github.com/terchris/urb-agents/issues/1808)). Both deploy-time bugs were
reproduced against the exact deployed Node version before the fix that finally landed clean
([#1809](https://github.com/terchris/urb-agents/issues/1809)) — "tested locally" turned out to
mean "tested on a Node version production doesn't run," twice, until the verification method
itself changed. A new CI gate (`check-every-source-has-an-ingest-script.sh`) now catches the first
class of defect before merge.

Also surfaced, not fixed — not this agent's call: `package.json`'s `engines.node` (`>=22.0.0`,
set directly by Terje) does not match the Dockerfile's Node 20.x install, and `npm ci` has printed
`EBADENGINE` on every image build as a result, silently ignored. Flagged to imac in the final
deploy request; whoever owns that decision should reconcile it.

Plugs the policy-response side of housing distress that `fhi-trangbodd` (the symptom side) doesn't
cover, for Reports #2 (Child Welfare) and #5 (Income & Welfare Trajectory).

---

## Files to Modify

- `atlas-data/ingest/src/sources/husbanken-bostotte/manifest.yml` (new)
- `atlas-data/ingest/src/sources/husbanken-bostotte/index.ts` (new)
- `atlas-data/ingest/src/sources/husbanken-bostotte/parse.ts` (new)
- `atlas-data/ingest/src/sources/husbanken-bostotte/qlik_client.ts` (new — no `enigma.js` dependency
  added; see Phase 2's deviation note; imports `WebSocket` from `ws` explicitly, fixed post-deploy
  per **[#1808](https://github.com/terchris/urb-agents/issues/1808)**)
- `atlas-data/ingest/src/sources/husbanken-bostotte/README.md` (new)
- `atlas-data/ingest/src/sources/husbanken-bostotte/__tests__/` (new)
- `atlas-data/ingest/package.json`, `package-lock.json` (`ingest:husbanken-bostotte` script, added
  post-deploy per **[#1807](https://github.com/terchris/urb-agents/issues/1807)**; `ws` promoted
  to a direct dependency per **#1808**)
- `atlas-data/dbt/check-every-source-has-an-ingest-script.sh` (new CI gate, added after #1807)
- `.github/workflows/check-raw-read-only.yml` (wires the new gate in)
- `atlas-data/migrations/060_raw_husbanken_bostotte.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (asset registration; also
  corrected several pre-existing stale source-count comments found while editing this same file)
- `atlas-data/dbt/macros/classify_region_code.sql` (new literal branch for Oslo's 4-digit bydel
  codes — **[Q7]**)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__husbanken_bostotte.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__husbanken_bostotte.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `husbanken` listing; also
  corrected the pre-existing stale raw-table-count claim found while editing this same file)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  shipped; correct the "Power-BI-backed" claim; split out Boligsosial Monitor per **[Q5]**)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
