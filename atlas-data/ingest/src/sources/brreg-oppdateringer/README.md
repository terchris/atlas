# brreg-oppdateringer

Brreg's **change feed**, walked forward daily from a durable watermark. This is what keeps
[`brreg-enheter-alle`](../brreg-enheter-alle/)'s snapshot from going stale — and it is the only way
deletions reach Atlas at all, because a bulk file cannot express one.

PLAN-002.

## What the script does

1. Read `raw.brreg_feed_watermark` (one row, seeded by the bootstrap).
2. `GET /oppdateringer/enheter?oppdateringsid=<last+1>&size=10000`.
3. For each change: record it in `raw.brreg_oppdateringer`, fetch the organisation's current document
   via `_links.enhet.href`, append it to `raw.brreg_enheter_versions`.
4. Advance the watermark **only after** the batch is committed.
5. Repeat until `_embedded` is absent — the normal end of a healthy run.

It never writes to `raw.brreg_enheter_snapshot`. The bootstrap owns that table; this owns the deltas;
dbt reconciles them (PLAN-003). A bug here cannot damage the 1.17M rows that are expensive to rebuild.

## 🔴 The three ways to build this wrong

All three were measured against the live service on 2026-09-12, and none of them is in any document.

**1. Following `_links.next`.** The response is HAL, and `next` is there. It is a **page** link:

```
self   …?oppdateringsid=16000000&size=500
next   …?oppdateringsid=16000000&page=1&size=500
hop 19 → ok, next points at page=20
hop 20 → HTTP 400
```

`page` is capped at 20. A poller that follows `next` sees the oldest 10,000 changes — **all of them
`Ukjent`, not one deletion** — then dies, or worse, catches the 400 and reports success. Every
change-type test still passes, because the types it mishandles never arrive.

⚠️ `lib/brreg/client.ts`'s `paginate()` is exactly this pattern. It is correct for every other Brreg
endpoint and wrong for this one. A source-text test asserts this module contains neither `page=` nor
`_links.next` nor `paginate` — see `__tests__/parse.test.ts`, and `project-atlas.md` on absence-guards.

**2. Reading `body._embedded.oppdaterteEnheter`.** Once caught up, the response is:

```
keys: ['_links', 'page']        ← _embedded is ABSENT, not an empty array
page: {"totalElements": 0}
```

So that spelling throws a `TypeError` **at exactly the moment the poller catches up** — on every
healthy run once the backlog clears, and never in development against a stale watermark.

**3. Detecting deletion from the HTTP status.** A deleted organisation returns **200**:

```
Ny        938461023  →  200, ~30 keys, slettedato null
Sletting  929915224  →  200,  ~6 keys, slettedato 2026-09-10
```

Not 404, not 410. Deletion comes from the feed's `endringstype`; `slettedato` corroborates it; the
status code never says anything.

## Other things that are easy to get wrong

- **Ids are sparse.** Asking for `oppdateringsid=16417000` returns `16427801`. Never compute a backlog
  by subtracting ids — read `page.totalElements` at the cursor, which is a correct count of records
  remaining. (That claim was itself retracted once and then restored by enumerating a window: 82,661
  predicted, 82,661 counted. See PLAN-002's Problem Summary.)
- **The cursor is inclusive** — `?oppdateringsid=N` returns id ≥ N. Advance with `last + 1`, or the
  poller re-requests its last record forever. Re-asking with the *unadvanced* watermark is exactly
  what makes an interrupted run resume without a gap.
- **All five `endringstype` values occur.** `Fjernet` was absent from one daily sample and an earlier
  draft recorded that as "does not occur". It does — 23 of 500 at `oppdateringsid` 16,400,000.
- **`size` goes to 10,000**, not 500. ~1,650 requests for a full history walk instead of ~33,000.

## Running it

```bash
cd atlas-data/ingest
npm run migrate                          # applies 053_raw_brreg_change_feed.sql
npm run ingest:brreg-enheter-alle        # bootstrap first — it seeds the watermark
npm run ingest:brreg-oppdateringer
```

The poller **refuses to run without a watermark** rather than starting at id 1, because id 1 would
begin a 16.4-million-change walk through history Atlas already holds as a snapshot.

A run stops after 50,000 changes and says so. Each change costs one entity fetch, and an unbounded
catch-up would mean millions of requests against a public-sector API Atlas depends on staying welcome
at. Raise `BRREG_FEED_MAX_CHANGES` deliberately, when a real catch-up is intended and someone is
watching; the next run resumes from the watermark either way.

## Validation

The acceptance test is **not** a row count — see PLAN-002 phase 4. Take 50 organisations the feed
reported as `Sletting` and confirm none is still served as current. An implementation that applies
`Ny` and `Endring` but drops `Sletting` passes every row-count check and is still wrong.
