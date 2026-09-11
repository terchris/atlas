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

## Phase 1: Measure before building ✅ COMPLETE 2026-09-12

The resource envelope was the largest unknown and the thing tor-agent was waiting on (#711).

### Tasks

- [x] 1.1 Download `enheter/lastned` — **210,132,682 bytes in 52 s**.
- [x] 1.2 Stream-decompress and count. **2,005,028,121 bytes uncompressed (2.0 GB), gzip ratio 9.5×,
      1,173,878 records, avg 1,708 bytes/record.** Peak RSS streaming the whole 2 GB: **33 MB** —
      memory is bounded by chunk size because nothing is materialised.

      ⚠️ **Two counting methods, and the cheap one was wrong.** A `grep -c '"organisasjonsnummer"'`
      proxy returned **1,173,879**; an exact brace-depth scan returned **1,173,878**. One record
      carries that key twice. The proxy is 2 s and the exact scan 232 s, so use the proxy for a smoke
      check and **never as the load's row-count assertion** — task 2.x must count objects it actually
      parsed.
- [x] 1.3 10,000 records into a scratch `jsonb` table on Postgres 15:
      **1,651 bytes/row** (heap + toast + PK), **2,340 bytes/row** with a
      `gin (doc jsonb_path_ops)` index — **+42%**.
- [x] 1.4 Extrapolated and posted to #711:

      | | total | raw schema becomes |
      |---|---|---|
      | without GIN | **1.94 GB** | 0.659 → **2.60 GB** (3.9×) |
      | with GIN | **2.75 GB** | 0.659 → **3.41 GB** (5.2×) |

- [x] 1.5 Single-pass duration is **not** the risk it looked like — decompress+scan is 2 s and the
      download 52 s. The run-pod timeout question stands with tor-agent but **no longer gates the
      design**; a full load is minutes, not tens of minutes.

### Findings that change the plan

🔴 **The file is a single pretty-printed JSON array, not newline-delimited.** `[\n  {\n  "links" : [ ],…`
A naive `json.load()` would need ~2 GB resident. **A streaming parser is mandatory**, not a
preference — task 2.3 already assumed it, and this confirms why.

🟢 **Skip the GIN index initially.** It costs +42% (0.8 GB) and PLAN-003 types the fields Atlas
actually queries into columns, so `jsonb` path lookups are not the access pattern. Add it only when a
query needs it. **Measured decision, not a preference.**

✅ **The record count validates the whole design.** The bulk file has **1,173,878** records against the
API's live **1,174,098** — **220 fewer**. The file is a daily snapshot; the API is live. That gap is
precisely what PLAN-002's change feed exists to close, and seeing it at this scale is the first
evidence the two halves fit together.

### Validation

All four numbers measured and posted to #711. The timeout question is answered as "no longer
gating".

---

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
