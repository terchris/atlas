# husbanken-bostotte

Husbanken **bostøtte** (housing allowance) — application counts, decision counts, payout counts,
rejection counts and the paid-out kroner amount, **per kommune, per year**. Atlas's first
WebSocket-based ingest and its first Husbanken source.

## What the script does

1. Open a WebSocket to `wss://qlik.husbanken.no/public/app/{appId}` (the public "Statistikkbank"
   Qlik Sense app) and wait for the initial handshake push.
2. `OpenDoc` to get a document handle.
3. `CreateSessionObject` with one hypercube: dimensions `KommuneNr`, `År`; five measures with
   explicit `qLabel`s (`soknad`, `vedtak`, `utbetaling`, `avslag`, `belop`) so Qlik returns clean
   names instead of raw expression strings.
4. Page through the full result with `GetHyperCubeData` (`qTop` incrementing by 1,000 rows) —
   **required**, not an optimization; see "Known quirks" below.
5. **Replace** `raw.husbanken_bostotte` on each run (`DELETE` then batched `INSERT … ON CONFLICT
   …`), same convention as every other source this project.
6. Mirror rows to `atlas-data/ingest/output/husbanken-bostotte.ndjson`.

## The real backend — read this before touching `qlik_client.ts`

Verified live 2026-10-02 (`PLAN-011-husbanken-statistikkbank.md` Phase 1/2). An earlier
investigation assumed Husbanken's `statistikk.husbanken.no` dashboard was Power BI — it is
**Qlik Sense**, confirmed by fetching the page's own bootstrap script and `deployconfig/config.js`,
which name a `qlikUrl` and `qlikAppId` directly. The app, "Statistikkbank"
(`ee185fe5-e94d-463e-bff8-cd1c5f2f566f`), is reachable anonymously (`mustAuthenticate:false`,
confirmed from the server's own `OnAuthenticationInformation` push) over the **Qlik Engine API** —
a WebSocket JSON-RPC 2.0 protocol that Qlik itself documents and ships an open-source client for
(`enigma.js`). This is not a reverse-engineered protocol the way IMDikator's opaque bundle would
have been; `qlik_client.ts` is a small subset of it written directly against the documented calls
(`OpenDoc`, `CreateSessionObject`, `GetLayout`, `GetHyperCubeData`) because this ingest needs only
a handful of them. It uses the `ws` package's `WebSocket` explicitly, not a global — confirmed
live 2026-10-02 that the deployed image's Node (v20.20.2) has no global `WebSocket` at all (added
in Node 21+), a failure mode invisible when testing locally against a newer Node.

⚠️ **System `curl` cannot reach these hosts** — `curl: (35) LibreSSL/3.3.6: error:1404B410:SSL
routines:ST_CONNECT:sslv3 alert handshake failure` against both `statistikk.husbanken.no` and
`qlik.husbanken.no`, with or without `--tlsv1.2` forced. This is specific to Husbanken's hosts (NAV/
IMDi/Udir all worked fine with curl). Node's own `fetch` connects cleanly, and so does `ws`'s
`WebSocket` (the global `WebSocket` does NOT exist on the deployed runtime, Node 20 — see
`qlik_client.ts`'s own header comment) — if a future
change to this source needs ad-hoc exploration, reach for `node some-script.mjs`, not `curl`.

## Known quirks / fragility

- **A single-page fetch of the whole dataset fails.** Requesting all ~7,449 rows in one
  `qInitialDataFetch`/`GetLayout` call returns Qlik's own `qErrorCode: 7009` ("hypercube too
  large"), with `qDataPages` coming back empty. `qlik_client.ts`'s `fetchHypercubeAllRows` pages in
  1,000-row batches via `GetHyperCubeData` instead, confirmed live to fetch all 7,449/7,449 rows
  correctly across 8 calls. Do not "simplify" this back to a single fetch.
- **Clean measure names require an explicit `qLabel`.** Without one, Qlik echoes the raw expression
  string (`Sum(BostøtteSøknadTeller)`) into `qMeasureInfo[].qFallbackTitle` instead of a usable name
  — confirmed live. The five `qLabel`s in `index.ts`'s `HYPERCUBE_DEF` are load-bearing; removing
  one changes what `measure` values land in `raw.husbanken_bostotte`.
- **`region_code` is not always a real kommune — same lesson as `udir-gsi`.** Svalbard's two
  pseudo-codes (`2100`, `2111`) are among the 883 distinct `KommuneNr` values, always with real zero
  values (confirmed live; not suppression — Husbanken genuinely administers no Svalbard bostøtte
  cases). `kommune_nr` resolution happens downstream via this project's existing
  `classify_region_code`/`region_code_to_kommune_nr` dbt macros, never assumed from the raw code's
  shape.
- **A second kind of non-kommune code: Oslo's bydeler, under a THIRD numbering.** `KommuneNr` also
  carries Oslo's 15 current bydeler, plus one discontinued pre-2004 one, as 4-digit codes
  `0311`-`0326` — confirmed by name live against Husbanken's own Qlik app (`0311` = "Gamle Oslo",
  etc.), not guessed from the shape. `classify_region_code`'s existing `bydel` kind already covers
  FHI's 6-digit convention for the same 15 districts; it now has a second, literal branch for
  Husbanken's 4-digit one. Found by running `dbt build` against a real local Postgres and reading
  the `relationships` test failure (1,300 rows) rather than assumed away.
- **A real null-year bucket exists.** Some rows carry `År` as the literal text `-` (no year
  assigned in Husbanken's own source system), confirmed live both nationally and on specific
  kommuner (e.g. Svalbard code 2111). `parse.ts` drops these rows rather than fabricating a year.
- **Underlying grain is daily, not annual.** `Count(DISTINCT Dato)` returns 31 for a single January
  — an earlier investigation wrongly assumed annual grain. Atlas publishes annually as its own
  choice (matching sibling indicator sources), not because the source is coarser than that.
- **No suppression marker found.** Checked live against Røyrvik (kommune 5043, Norway's smallest by
  bostøtte volume) — every cell is a real number. Unlike `udir-gsi`'s `*` or `nav-uforetrygd`'s
  conventions, there is nothing to treat as "suppressed" here; a `null` from `parse.ts`'s
  `parseCell` means Qlik's own `qNum` was unparseable, not a deliberate redaction.
- **Boligsosial Monitor is a separate, deferred app** on the same Qlik backend, carrying related but
  distinct indicators (see `PLAN-011-husbanken-statistikkbank.md` for the reasoning) — not pulled
  by this source.
- **This is Atlas's first WebSocket-based ingest.** `qlik_client.ts` is deliberately
  self-contained and copied, not imported, by convention (matching `fetch_retry.ts` across every
  other source) — if a future Husbanken or other Qlik-backed source needs this mechanism, copy the
  file rather than factoring out a shared dependency.

## References

- App (Engine API): `wss://qlik.husbanken.no/public/app/ee185fe5-e94d-463e-bff8-cd1c5f2f566f`
- App metadata (REST, also anonymous): https://qlik.husbanken.no/api/v1/apps/ee185fe5-e94d-463e-bff8-cd1c5f2f566f
- Dashboard (JS-rendered, not fetched directly by this source): https://statistikk.husbanken.no/
- Qlik Engine API protocol docs: https://help.qlik.com/en-US/sense-developer/
- Licence: https://data.norge.no/nlod/no/2.0 — authorized directly by Terje, 2026-10-02 (not
  independently found on a Husbanken terms page; see `manifest.yml`)
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Plan: [`PLAN-011-husbanken-statistikkbank.md`](../../../../../website/docs/ai-developer/plans/completed/PLAN-011-husbanken-statistikkbank.md)
