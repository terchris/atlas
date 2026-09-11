---
mdx:
  format: md
---

# PLAN-001: Brreg bulk snapshot

Loads all 1,174,098 Norwegian organisations from Brønnøysundregistrene into `raw.brreg_enheter_snapshot` in one streaming pass, with no CSV stage and no data mutated to fit a transport format.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active

**Goal**: a complete, point-in-time copy of Enhetsregisteret in `raw`, loadable on a fresh install and re-runnable without corrupting an existing one.

**Last Updated**: 2026-09-11

**Investigation**: [INVESTIGATE-all-brreg-organisations](../backlog/INVESTIGATE-all-brreg-organisations.md)
**Blocks**: PLAN-002 (the change feed has nothing to update until a snapshot exists)
**Priority**: High

## Problem Summary

Atlas holds **122 organisational units**, selected by a curated list of 11 NGOs. Terje decided on
2026-09-11 to hold the full register — **1,174,098 enheter**. Underenheter (862,903) are explicitly a
follow-on, not part of this plan (ops-dev, #711).

The upstream is a single gzipped JSON file, verified live on 2026-09-11:

```
GET https://data.brreg.no/enhetsregisteret/api/enheter/lastned
  → 200, application/gzip, content-length 210,132,682, regenerated daily
```

🔴 **The reference implementation does one thing this plan must not copy.**
[`terchris/shadow-brreg`](https://github.com/terchris/shadow-brreg) converts the JSON to
pipe-delimited CSV and first runs `awk '{gsub(/\|/,"")}1'` over the source — **stripping every `|`
from the data** so it cannot collide with the delimiter. Any organisation whose name or address
contains a pipe silently loses it, and nothing records that a character was removed. That is data
mutated to fit a transport choice, and the corruption is invisible afterwards.

**This plan loads JSON into `jsonb` directly. There is no CSV stage.**

## Phase 1: Measure before building

The resource envelope is the largest unknown and the thing tor-agent is waiting on (#711).

### Tasks

- [ ] 1.1 Download `enheter/lastned` once to a scratch path; record wall-clock and actual bytes.
- [ ] 1.2 Stream-decompress and count records **without** materialising the uncompressed file.
      Record: uncompressed size, record count, and peak RSS of the process.
- [ ] 1.3 Insert 10,000 records into a scratch `jsonb` table. Measure bytes-per-row **with** and
      **without** a GIN index on the document.
- [ ] 1.4 Extrapolate to 1,174,098 and record the projected `raw` schema growth against today's
      **659 MB**. Publish the number on #711 — tor-agent needs it for database headroom.
- [ ] 1.5 Record whether a single pass fits any run-pod timeout tor-agent reports. **If it does not,
      this plan changes shape to paged chunks** — say so before writing the loader.

### Validation

The four measured numbers (uncompressed size, peak RSS, bytes/row, projected growth) are posted to
#711 and the run-pod timeout question is answered either way.

---

## Phase 2: The streaming loader

### Tasks

- [ ] 2.1 Migration: `raw.brreg_enheter_snapshot` — `organisasjonsnummer text primary key`,
      `doc jsonb not null`, `loaded_at timestamptz not null default now()`,
      `snapshot_file_date date`. **No flattened columns**; typing happens in dbt (PLAN-003).
- [ ] 2.2 Ingest module under `ingest/src/sources/brreg-enheter-alle/`, extending the existing
      `lib/brreg/` client rather than a new one (candidate #9 **[Q24]**).
- [ ] 2.3 Stream `gunzip → JSON records → COPY`/batched insert. 🔴 **No CSV, no `awk`, no delimiter
      choice that can collide with data.** Assert in a test that a record containing `|`, a newline
      and a double quote survives a round trip byte-identical.
- [ ] 2.4 `manifest.yml` with `publisher`, `license: NLOD`, `license_url`, `attribution` —
      the existing `seed-sources/brreg-enheter/` has none, which
      [INVESTIGATE-nlod-attribution](../backlog/INVESTIGATE-nlod-attribution.md) records as a live
      gap. **Do not repeat it here.**
- [ ] 2.5 `recordIngestRun()` wrapping, so it appears in `raw.ingest_runs` and `mart_ingest_health`
      like every other source.
- [ ] 2.6 Idempotence: re-running upserts on `organisasjonsnummer` and never truncates. A second run
      on a populated table must be safe.

### Validation

`select count(*) from raw.brreg_enheter_snapshot` equals the `totalElements` reported by
`/enheter?size=1` on the same day, ±the day's churn. The round-trip test in 2.3 passes.

---

## Phase 3: Dagster wiring

### Tasks

- [ ] 3.1 Asset `raw/brreg_enheter_snapshot` in a new `raw_brreg` group.
- [ ] 3.2 Job `brreg_bootstrap`, registered in `schedules.py`'s `jobs` list.
- [ ] 3.3 🔴 **No automation condition and no freshness policy**, deliberately — same treatment as
      `UNSCHEDULED_SOURCES`. Re-running a bulk load against a populated database is the one genuinely
      destructive operation in this design and it must never self-trigger. Record the reason in the
      asset docstring, not only here.
- [ ] 3.4 Add `brreg_bootstrap` to `operational.first_data.jobs` in `template-info.yaml`. ⚠️ A novice
      who skips it has an empty register and no signal why. The build gate will require the job to
      exist in `schedules.py`.
- [ ] 3.5 Update `operational.first_load` — the current claim of *"~2.9M rows"* becomes ~4.1M — and
      `install.takes`.

### Validation

`uis template info atlas` shows `brreg_bootstrap` in the first-data sequence; the render gate passes;
imac can run the job on a clean install and reach the Phase 2 row count.

---

## Out of scope

- **Underenheter** (862,903) — follow-on plan, ops-dev #711.
- **The change feed** — PLAN-002.
- **Any `marts` or `api_v1` surface** — PLAN-003. Terje decided no new public endpoint.
