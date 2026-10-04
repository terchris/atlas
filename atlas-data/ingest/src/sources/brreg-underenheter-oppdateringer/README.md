# brreg-underenheter-oppdateringer

The **underenheter change feed poller** — walks `/oppdateringer/underenheter` forward from a
durable watermark, keeping [`brreg-underenheter`](../brreg-underenheter/README.md)'s bootstrap
snapshot current. Mirrors [`brreg-oppdateringer`](../brreg-oppdateringer/README.md) exactly; see
that source's README for the full reasoning behind every design choice.

## What the script does

1. Reads `raw.brreg_underenheter_feed_watermark` — seeded by the bootstrap load, never by this
   poller starting at 1.
2. `GET /oppdateringer/underenheter?oppdateringsid=<cursor>&size=10000`, cursor only, never
   `page=`, never `_links.next` (see "Things that are easy to get wrong").
3. For each change, fetches the sub-unit's current document via `_links.underenhet.href` (4
   concurrent fetches), recording the change in `raw.brreg_underenheter_oppdateringer` and the
   document in `raw.brreg_underenheter_versions`.
4. Advances the watermark only after a batch is durably committed.
5. Stops at 50,000 changes processed in one run (`BRREG_UNDERENHETER_FEED_MAX_CHANGES` to raise
   it) — the next run resumes from the watermark.

## Things that are easy to get wrong

Everything in [`brreg-oppdateringer`'s README](../brreg-oppdateringer/README.md#things-that-are-easy-to-get-wrong)
applies here unchanged — the `page` cap and page-built `_links.next`, the absent-not-empty
`_embedded` at caught-up, the HTTP-200 deletion stub, the sparse id space. One thing specific to
this feed:

- **The embedded key and the entity link are named differently from the enheter feed.** This
  feed's `_embedded` key is `oppdaterteUnderenheter` (enheter's is `oppdaterteEnheter`), and the
  entity link is `_links.underenhet` (enheter's is `_links.enhet`). Both are Brreg's own naming —
  verified live 2026-10-04 — not a choice Atlas made, and reading the enheter feed's key names here
  would silently see zero changes forever (an absent key reads exactly like "caught up").
- **This feed's `oppdateringsid` is not comparable to the enheter feed's.** They are two
  independent counters — a real bootstrap run against live data on 2026-10-04 seeded this feed's
  watermark at 21,390,729, entirely separate from enheter's own feed's value. Never mix a watermark
  or a cursor between the two feeds.
- **A deleted sub-unit does not always answer HTTP 200 with a stub.** Confirmed live 2026-10-04,
  running this poller for real against a `Fjernet` entry: the entity answered HTTP 410 with a
  3-key body (`_links`, `organisasjonsnummer`, `slettedato` — no `respons_klasse` at all), not the
  6-key `SlettetUnderEnhet` stub a `Sletting` entry gives. This is a real difference from what
  `brreg-oppdateringer`'s own docs claim for the enheter feed ("not 404 or 410") — which this same
  check against a live `Fjernet` enhet (organisasjonsnummer 928856062) also disproves. Both cases
  are already handled: the entity fetch treats any HTTP error as "no document" (`doc = null`), and
  `classify(endringstype)` never depends on the fetch having succeeded.

## Running it

```bash
cd atlas-data/ingest
npm run migrate                                           # applies 073_raw_brreg_underenheter_change_feed.sql
npm run ingest:brreg-underenheter                         # bootstrap first — seeds the watermark
npm run ingest:brreg-underenheter-oppdateringer           # then the feed; needs DATABASE_URL
```

## Validation

After a run, `select last_oppdateringsid from raw.brreg_underenheter_feed_watermark` should be
close to the newest id the live feed reports
(`https://data.brreg.no/enhetsregisteret/api/oppdateringer/underenheter?oppdateringsid=<near-current>&size=1`
— the `page.totalElements` at a high cursor shows how far behind the watermark is).
