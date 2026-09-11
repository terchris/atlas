---
mdx:
  format: md
---

# PLAN-001: Brreg bulk snapshot

Loads all 1,174,098 Norwegian organisations from Brønnøysundregistrene into `raw.brreg_enheter_snapshot` in one streaming pass, with no CSV stage and no data mutated to fit a transport format.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — all three phases built, cluster verification outstanding

Every task in phases 1-3 is done and merged. The plan stays **Active** rather than moving to
`completed/` because three things can only be falsified where there is a database, and this agent has
neither Postgres nor a container runtime:

1. the full load, and `count(*)` against `/enheter?size=1` on the same day;
2. the second run on a populated table — the one genuinely destructive operation here;
3. migration convergence, as a `pg_dump --schema-only` diff rather than as reasoning.

It moves to `completed/` when imac reports on those, not before. Declaring it done on my own say-so
is exactly the thing the declare / apply / verify split exists to prevent.


**Goal**: a complete, point-in-time copy of Enhetsregisteret in `raw`, loadable on a fresh install and re-runnable without corrupting an existing one.

**Last Updated**: 2026-09-12

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

- [x] 2.1 Migration `052_raw_brreg_enheter_snapshot.sql` — `organisasjonsnummer text primary key`,
      `doc jsonb not null`, `snapshot_file_date date`, `loaded_at timestamptz not null default now()`.
      No flattened columns, and **no GIN index** (phase 1 measured +42% for an access pattern nothing
      uses); the reasoning is in the file header, not only here.
- [x] 2.2 Ingest module at `ingest/src/sources/brreg-enheter-alle/`.

      ⚠️ **It does not extend `lib/brreg/client.ts`, and the task said it should.** That client is
      `openapi-fetch` over the paginated HAL API — typed query params against Brreg's OpenAPI spec.
      The bulk endpoint is not in that spec, returns a gzip stream rather than a HAL envelope, and is
      consumed by a byte pipeline rather than a typed call. Routing it through the client would have
      meant a cast at the boundary and no type safety gained. Recorded as a deviation rather than
      done quietly; PLAN-002's change feed **is** a HAL endpoint and should use the client.
- [x] 2.3 Streams `gunzip → depth-aware scan → JSON.parse → batched upsert`. No CSV, no `awk`, no
      delimiter anywhere in the path. The round-trip test asserts a record containing a pipe, a
      newline, a double quote, a tab, a backslash and an emoji survives byte-identical — on the read
      path **and** through the `JSON.stringify` the database write applies.
- [x] 2.4 `manifest.yml` with `publisher: Brønnøysundregistrene`, `license: NLOD`,
      `license_url`, and the NLOD attribution string. Required a new `publishers.yaml` entry and a new
      `organisations` topic — see "Decisions this phase made" below.
- [x] 2.5 `recordIngestRun()` wrapping; `upstreamUpdatedAt` carries the snapshot file date.
- [x] 2.6 Upserts on `organisasjonsnummer`, no `DELETE`, no `TRUNCATE`. Guarded by a test over the
      module source, because what makes this safe is the *absence* of a statement and no unit test
      covers an absence. Both new guards were made to fail on purpose before being trusted.

### Findings that change the plan

🔴 **`Accept: application/json` is answered with HTTP 400.** The bulk endpoint is content-negotiated
and wants `application/vnd.brreg.enhetsregisteret.enhet.v2+gzip`. Found by running the loader against
the live service rather than by reading the docs. The Accept is pinned to `.v2` on purpose: a v3
rollout then returns 406 and the run fails loudly, where a wildcard would hand back a different record
shape that `doc` stores without complaint and dbt reads wrongly.

🔴 **Brreg's `Last-Modified` is not an HTTP date.** It is `Fri Sep 11 04:27:17 CEST 2026` — Java's
`Date.toString()`, which `Date.parse` returns `NaN` for. A loader trusting `Date.parse` would have
recorded `snapshot_file_date = null` on every run and looked like the header was missing. It is not
missing; it is differently shaped. Both accepted shapes are now read as stated calendar dates rather
than converted through UTC, because a file generated at 00:30 CEST is 22:30 UTC the day before.

⚠️ **A bulk load cannot express a deletion.** An organisation Brreg removed since the last run stays
in the table, because absence from a 1.17M-record file is indistinguishable from a truncated
download. `Sletting` / `Fjernet` events arrive through PLAN-002. Named in the migration, the module
and the README rather than left as an implicit property of "upsert".

### Decisions this phase made

- **A new `organisations` topic** in `topics.yaml`. The register is not NGO supply and not a reference
  geography; labelling 1.17M companies as either would be false on the public catalogue page. Adding a
  topic is a public-site navigation change, so it is called out here to be overruled easily.
- **`publisher.logo` is now optional.** Brreg's mark is not offered under the same open licence as the
  data, and the generator emitted an unconditional `<img>` that would have rendered broken. The page
  now renders without a logo instead.

### Validation

- ✅ 15 unit tests; both new guards proven to fail on purpose (a reintroduced pipe-strip, and an
  added `delete from`).
- ✅ `npm run typecheck`, the full 119-test ingest suite, `check-manifests.sh` (42 manifests), and
  `npm run build` for the site all pass.
- ✅ Live against the real service: HTTP 200, `snapshot_file_date` parsed as `2026-09-11`, real
  records framed and parsed (`npm run ingest:brreg-enheter-alle -- --sample 3`).
- ⬜ **Not verified here, and cannot be from this agent:** the full load, the row count against
  `/enheter?size=1`, and the second-run-on-a-populated-table case. There is no Postgres and no
  container runtime on this machine — this agent declares, another applies, a third verifies. The
  migration converges trivially (one guarded `create table`, comments re-asserted unconditionally to
  the same text, and nothing later alters it), but that is reasoning, not a `pg_dump` diff.
  **imac: please run the double-apply diff and the re-run case on a throwaway database.**

---

## Phase 3: Dagster wiring

### Tasks

- [x] 3.1 Asset in a new `assets/raw_brreg.py`, group `raw_brreg`. The key resolves to
      **`raw/brreg_enheter_alle`**, not `raw/brreg_enheter_snapshot` as this task wrote it: the
      factory's convention is `["raw", source_id_with_underscores]`, and the asset represents the
      *ingest run* rather than the table it writes. Named here because the task and the code now
      differ on purpose rather than by accident.
- [x] 3.2 Job `brreg_bootstrap`, in `schedules.py`'s `jobs` list. Resolves to
      `{raw/_migrations, raw/brreg_enheter_alle}` — verified by loading the definitions, not by
      reading the selection.
- [x] 3.3 No automation condition and no freshness policy. Verified against the loaded asset spec
      (`automation condition: None`, `freshness_policy: None`) rather than asserted from the source.
      The reason is in the asset docstring and the job description, both of which travel with the
      code into the Dagster UI.
- [x] 3.4 `brreg_bootstrap` added to `operational.first_data.jobs`, fourth of five.
- [x] 3.5 `first_load` is now ~4.1M rows across 48 raw tables, and `install.takes` says plainly that
      imac's 11.1-minute figure **predates** this job and is not the new total.

### The distinction this phase had to make explicit

`cadence.UNSCHEDULED_SOURCES` means **cannot run** — `frr` has no private data on a public
deployment, `redcross-branches` has no credential — and both are correctly absent from the first-day
sequence. `brreg-enheter-alle` is the opposite: it **must** run, once, on day one, and then be left
alone.

Parking it would have kept the coverage gate quiet and left a new user with an empty organisation
register and nothing saying why. So it stays out of `UNSCHEDULED_SOURCES` and gets a named job
instead, and `template-info.yaml` grows a `manual_only:` row so the artifact states the difference
rather than implying it. **The gate was made to fail on purpose**: removing `brreg_bootstrap` from
`first_data.jobs` produces

```
✗ first_data.jobs does not cover 1 automated source(s): ['brreg-enheter-alle']
```

### Validation

- ✅ The definitions load; `brreg_bootstrap` is among the eight jobs and resolves to the right two
  assets; the asset carries neither a condition nor a policy.
- ✅ `render-template-info.sh` passes every gate, and coverage went from 40 to **41** automated
  sources with the same two parked.
- ✅ The coverage gate proven to fail on purpose.
- ⬜ **Not verified here:** imac running `brreg_bootstrap` on a clean install and reaching the phase 2
  row count. `uis template info atlas` showing the new first-data sequence needs a publish, which
  happens on the next tag.

---

## Out of scope

- **Underenheter** (862,903) — follow-on plan, ops-dev #711.
- **The change feed** — PLAN-002.
- **Any `marts` or `api_v1` surface** — PLAN-003. Terje decided no new public endpoint.
