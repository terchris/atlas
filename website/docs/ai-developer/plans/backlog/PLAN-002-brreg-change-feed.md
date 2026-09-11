---
mdx:
  format: md
---

# PLAN-002: Brreg change feed

Keeps the register copy current by consuming Brreg's `oppdateringer` feed daily from a durable watermark, so catch-up after any outage is the same code path as steady state.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Atlas's copy of Enhetsregisteret stays identical to Brreg's, including deletions, with no manual intervention and no separate backfill path.

**Last Updated**: 2026-09-12

**Investigation**: [INVESTIGATE-all-brreg-organisations](../backlog/INVESTIGATE-all-brreg-organisations.md)
**Prerequisites**: PLAN-001 must be complete — there is nothing to update until a snapshot exists
**Blocks**: PLAN-003 depends on a feed that produces versions
**Priority**: High

## Problem Summary

A snapshot is stale the day after it loads. Brreg publishes a change feed, verified live 2026-09-11:

```
GET /enhetsregisteret/api/oppdateringer/enheter?oppdateringsid=<n>&size=<n>
  → _embedded.oppdaterteEnheter[]: oppdateringsid, dato, organisasjonsnummer,
    endringstype, _links.enhet.href
```

Two properties were measured and both shape this plan:

- 🟢 **No retention window.** `?dato=2015-01-01` returns `oppdateringsid: 1` from 2018-04-23. The feed
  is the complete history. **Cadence is a freshness choice, not a correctness one** — a missed week
  catches up completely.
- 🟢 **`?oppdateringsid=` is supported**, and is a better watermark than the date
  [`shadow-brreg`](https://github.com/terchris/shadow-brreg) had to use: ids cannot tie and resumption
  is exact.

🔴 **`page` is capped at 20, and every reachable page is `Ukjent`. The cursor is not merely better —
it is the only thing that works.** Found by imac (urb-agents #711), reproduced 2026-09-12:

```
size=500, page 0-19    →  200
size=500, page 20+     →  HTTP 400    (the cap applies inside a ?dato= window too)
advertised totalPages  →  32,835      of which 32,815 are unreachable by page
page 0                 →  endringstype: Ukjent × 500, all dated 2018-04-23
?dato=2026-09-10       →  Endring 314, Ny 133, Sletting 53
```

⚠️ **A loader that increments `page` gets twenty pages of `Ukjent`, then HTTP 400, and never sees a
single `Sletting`** — deleting nothing while looking perfectly healthy. **Matching `Sletting`
correctly does not save it**, because the feed is never walked at all, and a test that checks only the
enum passes. So: build the cursor, and **leave no page-based fallback in**, because the fallback is
the broken path.

#### ⚠️ `totalElements` — I retracted this, and the retraction was wrong. Restored with proof.

On 2026-09-12 I struck the claim that `totalElements` gives the backlog depth, on ops-dev's relay of
imac's measurement that the figures were *"mutually inconsistent"*:

```
unfiltered                 16,417,370
at oppdateringsid=1000000  15,751,321
at oppdateringsid=16417000   7,815,236
```

I reproduced those numbers and agreed too readily. **They are not inconsistent.** They only look so
under the assumption that `oppdateringsid` is a record ordinal — that a cursor at 16,417,000 out of
16,417,370 records must leave ~370 to go. It is not an ordinal. Ids are **sparse**, and the id space
runs to ~25.18M while the record count is 16.4M, so a cursor at 16.4M genuinely has 7.8M records
ahead of it.

Two independent checks, measured 2026-09-12:

**The three segments sum exactly to the unfiltered total.**

```
[1, 1M)            666,049
[1M, 16.417M)    7,936,085
[16.417M, end)   7,815,236
                ----------
                16,417,370   = the unfiltered total, exactly
```

**And an enumerated window matches the predicted count exactly.** Walking `[25,000,000, 25,100,000)`
by cursor and counting every record:

```
totalElements at 25,000,000    141,187
totalElements at 25,100,000     58,526
predicted in the window         82,661
actually enumerated             82,661   ← exact match
```

🟢 **So `totalElements` at a cursor IS the number of records remaining from that cursor**, it costs
one request with `size=1`, and it decreases monotonically as the watermark advances. Task 2.5 is
restored.

🔴 **What is genuinely true from imac's finding, and it is narrower:** *id arithmetic* does not
measure distance. Asking for `oppdateringsid=16,417,000` returns a first record with id
`16,427,801` — a 10,801-id gap holding zero records. **Never compute "how far behind" by subtracting
ids.** Count records with `totalElements`; never infer them from the id space.

⚠️ Recorded at this length because I got it wrong in both directions within a day: first claiming more
than I had measured, then withdrawing something that was true. The measurement above is what settles
it, not either argument.

🔴 **The deletion value in current traffic is `Sletting`, not `Fjernet`.** A 500-change live sample
on 2026-09-11, re-confirmed by imac:

| value | count |
|---|---|
| `Endring` | 351 |
| `Ny` | 100 |
| **`Sletting`** | **49** |
| `Fjernet` | 0 in this sample |

An earlier draft of the investigation said `Fjernet` was *the* deletion. **An implementation built
from that text would match a value current traffic does not emit, delete nothing, and serve withdrawn
records indefinitely** — while passing every row-count check.

⚠️ **But `Fjernet` is real, and both ops-dev and I wrote "zero `Fjernet`" off a single day's sample.**
Sampling across the id range on 2026-09-12 found it:

```
cursor          1   Ukjent 500                                    2018-04-23
cursor  5,000,000   Endring 500                                   2019-11-11
cursor 14,000,000   Endring 494, Sletting 6                       2022-03-29
cursor 16,400,000   Endring 342, Sletting 112, Fjernet 23, Ny 23  2022-12-15
```

**All five values are real and all five must be handled.** "Did not appear in my sample" is not
"does not occur", and a catch-up from an old watermark walks straight through the era where `Fjernet`
is common.

#### 🔴 `_links.next` is a PAGE link. Following HAL correctly walks into the cap.

Measured 2026-09-12. The response carries `first` / `self` / `next` / `last`, and every one of them
except `self` is built with `page=`:

```
self   …/oppdateringer/enheter?oppdateringsid=16000000&size=500
next   …/oppdateringer/enheter?oppdateringsid=16000000&page=1&size=500
last   …/oppdateringer/enheter?oppdateringsid=16000000&page=2653510&size=500
```

Following `next` from a cursor start survives 20 hops and then:

```
hop 19: ok, next -> …&page=20&size=500
hop 20: HTTP 400
```

⚠️ **This is the trap wearing best-practice clothing.** "Follow the HAL `next` link rather than
constructing URLs yourself" is the correct instinct for every other endpoint, and here it is the
broken path. The cap is not a documented limit a reader would look for — it is reachable only by
walking into it.

🔴 **And `lib/brreg/client.ts`'s `paginate()` helper is exactly this pattern** — it increments `page`
until `totalPages`. So the investigation's *"extend the existing client rather than writing a new
one"* (**[Q24]**) is the **wrong instruction for this endpoint**, and following it would reproduce
the defect. The feed advances by setting `oppdateringsid` to `last seen + 1`. Nothing else.

#### 🟢 `size` goes to at least 10,000, not 500

Verified: `size=500`, `1000`, `5000`, `10000` all return 200 with that many records. A full catch-up
from id 1 is ~1,650 requests at `size=10000` rather than ~33,000 at 500. Use a large batch; the cap
on `page` has no bearing on `size`.

#### 🔴 The caught-up response has NO `_embedded` key at all

```
GET …?oppdateringsid=99000000&size=100
  → keys: ['_links', 'page']          ← _embedded is ABSENT, not an empty array
  → page: {"totalElements": 0, "totalPages": 0}
```

⚠️ A loader written as `body["_embedded"]["oppdaterteEnheter"]` throws a `KeyError` **at exactly the
moment it catches up** — that is, on every healthy run once the backlog is cleared, and never during
development against a stale watermark. The termination condition is *absent `_embedded` or empty
list*, and it is the normal end of every successful run, not an error.

#### Cursor semantics, stated exactly

`?oppdateringsid=N` returns records with **id ≥ N**, not id > N, and not "the Nth record". Asking for
`16,000,000` returns a first record of `16,043,822`. Advance with `last seen id + 1`; re-asking with
the same N re-delivers the same record, which is what makes an interrupted run safe to resume.

## Phase 1: Watermark and queue

### Tasks

- [ ] 1.1 Migration: `raw.brreg_feed_watermark` — single row, `last_oppdateringsid bigint not null`,
      `last_dato timestamptz`, `updated_at timestamptz`.
- [ ] 1.2 🔴 **The watermark lives in Postgres, not in a Dagster cursor.** A cursor lives in the
      Dagster instance database — the one that survived `uis undeploy dagster` by luck rather than
      design, and that ops preserved on #591 *specifically because it holds evidence*. If it is
      rebuilt, the feed silently restarts from nowhere. A `raw.*` row is backed up with the data it
      describes and matches `raw.ingest_runs`. **Put this reason in the migration comment** — it is
      exactly the kind of thing a later reader "simplifies".
- [ ] 1.3 Migration: `raw.brreg_oppdateringer` — append-only.
      `oppdateringsid bigint primary key`, `dato timestamptz`, `organisasjonsnummer text`,
      `endringstype text`, `processed_at timestamptz`, `process_status text`.
- [ ] 1.4 Seed the watermark from the snapshot: the bootstrap records the max `oppdateringsid` current
      at download time, so the first feed run starts there rather than at 1.

### Validation

A watermark row exists after PLAN-001's bootstrap and names a plausible id (~25M as of 2026-09).

---

## Phase 2: The poller

### Tasks

- [ ] 2.1 Ingest module: read watermark → advance the **cursor** with `?oppdateringsid=<last+1>` →
      append every change to `raw.brreg_oppdateringer` → advance the watermark **only after** the
      batch is committed. `size=10000`.
      🔴 **No `page` parameter and no `_links.next` anywhere in the module**, not even as a fallback —
      both are the broken path, and `next` is the one a careful developer reaches for. Guard it with a
      source-text check like the bootstrap's no-`DELETE` one: what makes this correct is the absence
      of a parameter, and no unit test covers an absence.
      🔴 **Do not use `lib/brreg/client.ts`'s `paginate()`** — it increments `page`, which is exactly
      the defect. This endpoint is the one place the shared client must not be reused.
- [ ] 2.1b Terminate on **absent `_embedded` or an empty list**, and treat that as the normal,
      successful end of a run. ⚠️ Not `body["_embedded"][...]` — the key is missing when caught up, so
      that spelling throws on every healthy run.
- [ ] 2.2 🔴 Branch on **all five** `endringstype` values: `Ny`, `Endring`, `Sletting`, `Fjernet` and
      **`Ukjent`**. `Sletting` is the deletion. Put the sample counts from the Problem Summary in a
      code comment beside the branch, so the next reader sees evidence rather than an assertion.
- [ ] 2.2b 🔴 **`Ukjent` is a deliberate branch, not a default case.** It is counted and surfaced in
      run metadata, it never crashes the run, it is never silently skipped, and **it never deletes
      anything**. The whole of the reachable-by-page history is `Ukjent` (2018-08 and earlier), so a
      catch-up from an early watermark meets a great many of them.
- [ ] 2.3 For each changed org, fetch its current document via `_links.enhet.href` (already in the
      feed — no separate lookup needed) and append to `raw.brreg_enheter_versions`
      (`organisasjonsnummer`, `doc jsonb`, `oppdateringsid`, `endringstype`, `fetched_at`).
      **Append-only — never update in place.** `raw.*` is a landing layer; overwriting discards the
      change feed's own value at the moment of receiving it and makes `marts` unrebuildable.
- [ ] 2.4 A `Sletting` appends a **tombstone row** (`doc` null, `endringstype='Sletting'`) rather than
      deleting anything. Deletion becomes a filter in dbt, so *"what did this organisation look like
      before it was removed"* stays answerable.
- [ ] 2.5 Emit as run metadata: **backlog depth** (`totalElements` at the watermark, which is a
      correct remaining-record count — see the Problem Summary for the proof, and for the retraction
      of the retraction), the count of changes processed this run, the highest `oppdateringsid` seen,
      and the `endringstype` histogram **including `Ukjent`**.
      🔴 **Never compute backlog by subtracting ids** — ids are sparse and the arithmetic is
      meaningless. Count records; do not infer them from the id space.
- [ ] 2.6 Resumability: a run interrupted mid-page leaves the watermark unadvanced and re-processes
      that page. Append with `on conflict (oppdateringsid) do nothing`.

### Validation

Kill the job mid-run; re-run it; assert no duplicate `oppdateringsid` rows and no gap between the
watermark and the lowest unprocessed change.

🔴 **And assert the feed was actually walked**, not merely that the enum was matched. Seed the
watermark at an id from 2018 and run: a correct implementation crosses out of the `Ukjent` era and
reaches real `Endring` / `Ny` / `Sletting` values. A page-based implementation stops at 10,000
records of `Ukjent` and then 400s — and every enum test still passes. That is the failure this
validation exists to catch, and it is not the one the original tasks would have caught.

---

## Phase 3: Dagster wiring

### Tasks

- [ ] 3.1 `DAILY_CRON = "0 4 * * *"` in `cadence.py`, Europe/Oslo.
- [ ] 3.2 🔴 **04:00 specifically.** `transform_daily` runs at `0 5 * * *`; feeding at 04:00 puts the
      day's register changes into `marts` the same morning. Later than 05:00 delays them a full day.
      Say so in the constant's comment.
- [ ] 3.3 Asset `raw/brreg_oppdateringer` + `raw/brreg_enheter_versions`, job `brreg_change_feed`,
      `automation_condition=cadence.daily_polled()`.
- [ ] 3.4 Freshness policy: warn ~3 days, fail ~7 — tighter than anything else in Atlas, and
      derivable from the daily cadence the way the existing bounds are.
- [ ] 3.5 `template-info.yaml`: new `operational.cadence` row for `0 4 * * *`. ⚠️ The build gate
      asserts every declared cron is **live** — an asset must reference `daily_polled()` or the gate
      fails.

### Validation

`./uis template info atlas` renders the new cadence row; the drift gate passes; a manual run advances
the watermark and appends versions.

---

## Phase 4: Falsification — run by imac, not by me

🔴 **This is the acceptance test and it is deliberately not a row count.**

### Tasks

- [ ] 4.1 Let the automated poll run **at least a week**. Not immediately after the bootstrap, which
      proves only that the snapshot imported.
- [ ] 4.2 Take **50 random `organisasjonsnummer`** from Atlas's copy; fetch each from
      `/enhetsregisteret/api/enheter/{orgnr}` live; diff every field. **One mismatch falsifies it.**
- [ ] 4.3 Take **50 orgnr the feed reported as `Sletting`** during that week; confirm **none** is
      still served as current by Atlas.
- [ ] 4.4 ⚠️ **Do not substitute `count(*)` against `totalElements`.** A matching count is fully
      consistent with having missed one deletion and one insertion in the same window.

### Validation

imac reports 4.2 and 4.3. **4.3 is the one that matters**: an implementation that applies `Ny` and
`Endring` but drops `Sletting` passes 4.2 perfectly and is still wrong.
