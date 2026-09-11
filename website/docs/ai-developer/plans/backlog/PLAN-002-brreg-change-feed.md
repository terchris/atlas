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

**Last Updated**: 2026-09-11

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
  [`shadow-brreg`](https://github.com/terchris/shadow-brreg) had to use: ids cannot tie, resumption is
  exact, and the response's `totalElements` is the **backlog depth**, so *"how far behind are we"* is
  one request.

🔴 **The deletion value is `Sletting`, not `Fjernet`.** A 500-change live sample on 2026-09-11:

| value | count |
|---|---|
| `Endring` | 351 |
| `Ny` | 100 |
| **`Sletting`** | **49** |
| `Fjernet` | **0 — did not appear** |

An earlier draft of the investigation said `Fjernet` was the deletion. **An implementation built from
that text would match a value the API never emits, delete nothing, and serve withdrawn records
indefinitely** — while passing every row-count check. Handle all four.

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

- [ ] 2.1 Ingest module: read watermark → page `?oppdateringsid=` → append every change to
      `raw.brreg_oppdateringer` → advance the watermark **only after** the page is committed.
- [ ] 2.2 🔴 Branch on **all four** `endringstype` values. `Sletting` is the deletion. Put the sample
      counts from the Problem Summary in a code comment beside the branch, so the next reader sees
      evidence rather than an assertion.
- [ ] 2.3 For each changed org, fetch its current document via `_links.enhet.href` (already in the
      feed — no separate lookup needed) and append to `raw.brreg_enheter_versions`
      (`organisasjonsnummer`, `doc jsonb`, `oppdateringsid`, `endringstype`, `fetched_at`).
      **Append-only — never update in place.** `raw.*` is a landing layer; overwriting discards the
      change feed's own value at the moment of receiving it and makes `marts` unrebuildable.
- [ ] 2.4 A `Sletting` appends a **tombstone row** (`doc` null, `endringstype='Sletting'`) rather than
      deleting anything. Deletion becomes a filter in dbt, so *"what did this organisation look like
      before it was removed"* stays answerable.
- [ ] 2.5 Emit backlog depth (`totalElements` at the current watermark) as run metadata, so a run that
      is falling behind is visible without a query.
- [ ] 2.6 Resumability: a run interrupted mid-page leaves the watermark unadvanced and re-processes
      that page. Append with `on conflict (oppdateringsid) do nothing`.

### Validation

Kill the job mid-run; re-run it; assert no duplicate `oppdateringsid` rows and no gap between the
watermark and the lowest unprocessed change.

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
