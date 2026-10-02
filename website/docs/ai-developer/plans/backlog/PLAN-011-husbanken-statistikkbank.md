# Plan: Ingest Husbanken's bostøtte (housing allowance) statistics

Ingests Husbanken's bostøtte (housing allowance) decisions and payouts — per kommune, with a real
daily-grain time series underneath — as Atlas's first Husbanken source. The investigation's
"Power-BI-backed" claim was wrong: it's Qlik Sense, with a real, anonymously-reachable backend this
agent drove live to pull real per-kommune figures.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — unblocked, ready for Phase 2

**Goal**: Add `husbanken-bostotte` as a served Atlas source, giving Reports #2 (Child Welfare) and
#5 (Income & Welfare Trajectory) the policy-response side of housing distress that `fhi-trangbodd`
(the symptom side — overcrowded housing share) doesn't cover.

**Last Updated**: 2026-10-02

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](INVESTIGATE-new-norwegian-public-sources.md) §3 (Tier 1 #3, [Q8]–[Q9])

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
- **[Q6] Suppression / small-cell handling — not yet characterized.** Bostøtte counts for a small
  kommune could plausibly be suppressed for privacy, matching every other person-level-adjacent
  source this session. Not yet observed on real data (unlike `udir-gsi`'s `*` marker, confirmed
  live before drafting this far). Phase 2's first task against real data, same discipline as every
  prior source.

---

## Phase 2: Ingest module + raw table (not started)

### Tasks

- [ ] 2.1 Create `atlas-data/ingest/src/sources/husbanken-bostotte/`:
  - Add `enigma.js` (Qlik's official open-source Engine API client, MIT licensed) as a new direct
    dependency — this project's **first WebSocket-based ingest**, a genuinely new mechanism shape
    compared to every prior HTTP-only source.
  - `parse.ts` — pure functions for turning a `GetLayout` hypercube response into flat rows
    (pattern: same shape as `udir-gsi`'s `parseGsiData`, but the fetch mechanism itself is new).
  - `index.ts` — open a WebSocket session to `wss://qlik.husbanken.no/public/app/{appId}`, `OpenDoc`,
    `CreateSessionObject` with a hypercube over `KommuneNr` × `År` × the bostøtte measures,
    `GetLayout`, paginate if `qSize` exceeds one page, close the session, upsert
    `raw.husbanken_bostotte`.
  - `manifest.yml` — `source_id: husbanken-bostotte`, `provider: husbanken`, `periodicity: P1Y`,
    `eu_theme: SOCI`, `tags.topic: social`, `license: NLOD` (stated directly by Terje, 2026-10-02 —
    see **[Q1]** — not independently verified on a Husbanken-published terms page).
  - `README.md` and `__tests__/` — golden-file tests against a real captured `GetLayout` response.
- [ ] 2.2 Migration `raw.husbanken_bostotte` — columns TBD once **[Q3]**/**[Q6]** resolve during
  implementation; expect at minimum `kommune_nr`, `year`, `measure`, `value`, `loaded_at`, same
  shape as `udir-gsi`.
- [ ] 2.3 Dagster registration — `cadence.weekly_polled()`/`WEEKLY_FRESHNESS` (annual data, same
  polling cadence as `imdi-bosetting`/`udir-gsi`, not a new job) — **pending confirmation a
  WebSocket-based ingest runs cleanly in the same subprocess-per-ingest model every HTTP source
  uses**; flag during implementation if it doesn't.

### Validation

```bash
cd atlas-data/ingest && npm test -- husbanken-bostotte
```
Golden-file tests pass; a manual run against the live Qlik app returns real kommune-grain rows,
zero rows silently dropped, with the suppression marker (if any) identified from real data, not
assumed.

---

## Phase 3: dbt staging and marts (not started)

### Tasks

- [ ] 3.1 Add `raw.husbanken_bostotte` to `sources.yml`.
- [ ] 3.2 `indicators__husbanken_bostotte.sql` — `kommune_nr` passed through directly (confirmed
  real SSB-format codes, no crosswalk — same as `udir-gsi`'s **corrected** understanding; check for
  a Svalbard-shaped surprise before assuming none exists, per `udir-gsi`'s **[Q6]** lesson).
- [ ] 3.3 Document columns in `schema.yml`; validate against a local Postgres loaded with the real
  ingest.
- [ ] 3.4 `mart_indicators__husbanken_bostotte.sql` api passthrough + `marts/api/schema.yml` entry.
- [ ] 3.5 `dbt build` + `dbt test`.

### Validation

Same discipline as every prior source: real local Postgres, not an empty schema; check the
`kommune_nr` relationship test isn't passing on an all-matching trivially-small sample.

---

## Phase 4: Deploy and verify arrival (not started)

Same shape as every prior source's Phase 4 this session.

---

## Acceptance Criteria

- [x] **[Q1] (licence) resolved** — Terje, 2026-10-02: *"Husbanken is owned by the norwegian
  goverment and they follow NLOD."*
- [ ] `husbanken-bostotte` ingests cleanly via the Qlik Engine API with zero rows silently dropped.
- [ ] `raw.husbanken_bostotte` stores `kommune_nr` directly (verified real SSB kommune codes).
- [ ] The suppression marker (if any) is identified from real data, not assumed.
- [ ] `indicators__husbanken_bostotte` and `mart_indicators__husbanken_bostotte` build and test
  clean against real loaded data.
- [ ] `husbanken-bostotte` appears in `meta_sources.served_as` after a real deploy, independently
  verified via live `curl`.
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped.

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

## Files to Modify

- `atlas-data/ingest/src/sources/husbanken-bostotte/manifest.yml` (new)
- `atlas-data/ingest/src/sources/husbanken-bostotte/index.ts` (new)
- `atlas-data/ingest/src/sources/husbanken-bostotte/parse.ts` (new)
- `atlas-data/ingest/src/sources/husbanken-bostotte/README.md` (new)
- `atlas-data/ingest/src/sources/husbanken-bostotte/__tests__/` (new)
- `atlas-data/ingest/package.json` (`enigma.js` dependency, `ingest:husbanken-bostotte` script)
- `atlas-data/migrations/<next>_raw_husbanken_bostotte.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (asset registration)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__husbanken_bostotte.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__husbanken_bostotte.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `husbanken` listing)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  shipped; correct the "Power-BI-backed" claim; split out Boligsosial Monitor per **[Q5]**)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
