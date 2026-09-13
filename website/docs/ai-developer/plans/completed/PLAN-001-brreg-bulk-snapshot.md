---
mdx:
  format: md
---

# PLAN-001: Brreg bulk snapshot

Loads all 1,174,098 Norwegian organisations from Brønnøysundregistrene into `raw.brreg_enheter_snapshot` in one streaming pass, with no CSV stage and no data mutated to fit a transport format.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: ✅ Completed 2026-09-13 — all three falsifiables closed on a cluster

Every task in phases 1-3 is done and merged. The plan stayed **Active** because three things can only
be falsified where there is a database, and this agent has neither Postgres nor a container runtime:

| | falsifiable | state |
|---|---|---|
| 1 | the full load, and `count(*)` against `/enheter?size=1` | ✅ **closed** — imac, stage 4 on UIS 1.6.70: install from the catalogue, exit 0 in 2m51s, **1,174,007 organisations**, all endpoints 200 |
| 2 | the second run on a populated table — the one genuinely destructive operation here | ✅ **closed** — imac, urb-agents #839, measured across 866,000 conflicting keys. Scored below, because it did not close the way it was written |
| 3 | migration convergence, as a `pg_dump --schema-only` diff rather than as reasoning | ✅ **closed** — imac, urb-agents #809, three empty diffs |

✅ **How 2 was scored, and it was my call to make** (ops-dev: *"your call how that scores; I am telling
you rather than deciding it, because you own the plan"*).

**The falsifiable asked one question and the attempt answered it while failing at something else.** A
second `brreg_bootstrap` over the populated cluster was attempted three times on 2026-09-13 and the
**download** terminated part-way each time. So the loader never ran to completion — but it ran far
enough, over real conflicting data, to answer what the falsifiable existed to ask:

| what the falsifiable was protecting against | measured |
|---|---|
| a re-run corrupting existing rows | ✅ upsert correct across **866,000 conflicting keys** |
| a re-run dragging the feed watermark backwards | ✅ held at `25190771` |
| a re-run deleting anything | ✅ nothing deleted |
| rows in the snapshot missing from the dimension | ✅ 286, **all tombstoned** — correct behaviour, not loss |

🔴 **The plan's goal is *"loadable on a fresh install and re-runnable without corrupting an existing
one."* Both halves are now measured.** What is *not* established is whether a second bulk **download**
can complete soon after a first — and that is a property of `data.brreg.no`, not of anything in this
plan. **Holding a plan open on an external service's behaviour under repeated requests would keep it
open for a reason PLAN-001 cannot fix.**

⚠️ **So it moves to `completed/`, and the download finding moves out** to
[INVESTIGATE-brreg-bulk-download-reliability](../backlog/INVESTIGATE-brreg-bulk-download-reliability.md),
where it belongs: it has operational consequences (retrying makes it worse) and no owner inside this
plan. 🔵 **Reversible in one commit if ops-dev scores it differently** — I am recording the reasoning
rather than just the verdict so the disagreement, if there is one, is about something specific.

⚠️ **And one thing the attempt cost, recorded because the finding does not excuse it.** The run
happened on the host serving 1.17M organisations, during a memory measurement ops-dev had requested
without naming the operation. **The sentence that should have stopped it was mine** — *"the one
genuinely destructive operation in this plan"*, written into #832 — and I did not think about what
would happen if someone acted on a different request while it was outstanding.

## 🔴 What imac's convergence run proved about the METHOD, which outlives this plan

imac ran it **both** ways rather than choosing, and the reason is worth more than the result:

```
populated cluster,  run n  vs run n+1     EMPTY DIFF
fresh database,     run 1  vs run 2       EMPTY DIFF   <- the scar case
fresh database,     run 2  vs run 3       EMPTY DIFF
```

⚠️ **I offered imac the choice and framed it wrongly.** I wrote that a throwaway proves convergence
while their cluster proves it *"against the state that actually exists, which is the stronger claim."*
**It is the weaker claim for this defect class, and imac did not take my framing.**

`051` exists because run 1 differed from run 2: `006`/`007` set comments unconditionally, `008`
changed the shape behind a guard, and the divergence appeared *the second time*. **A cluster already
at n=k is past the point where that can show at all** — it measures the steady state n → n+1. The
populated run answers *"is it converged now"*; only the fresh run answers *"does it converge"*, which
is the question `052` had never been asked.

🔵 **Generalised, because it will apply to the next idempotence check and not only to migrations: a
convergence test on an already-converged system proves the weaker half.** If this is ever automated
it wants a **fresh** database — pointed at production it will keep passing right up to and including
the day someone introduces the next `008`.

**Proof the test was not vacuous** (a diff of two empty schemas is also an empty diff): the fresh
database carried 134 `COMMENT ON` statements, 91 brreg-mentioning objects, the 5 tables from
`052`/`053`/`054`, and the `053` index comment — the statement that took the whole file down when it
was unqualified — resolving and stable across three applications.


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
      proxy returned **1,173,879**; an exact brace-depth scan returned **1,173,878**. The proxy is 2 s
      and the exact scan 232 s, so use the proxy for a smoke check and **never as the load's row-count
      assertion** — task 2.x must count objects it actually parsed.

      🔴 **My explanation of the off-by-one was wrong, and the truth is worse.** I wrote that one
      record carries the key twice, nested. imac's colon-aware scan (urb-agents #711) showed
      otherwise, and I reproduced it against the file on 2026-09-12:

      ```
      bare "organisasjonsnummer"            1,173,879
      "organisasjonsnummer"\s*:  (as a key)  1,173,878   ← matches the brace-depth truth
      ```

      The extra hit is the literal appearing **as a value**, in one organisation's free-text
      `aktivitet` array, at line 11,241,685 of the uncompressed file:

      ```
      "aktivitet" : [ "Drift av gatelys. Skal også drifte Eggum vannverk med samme", "organisasjonsnummer" ],
      ```

      So the proxy is not stably wrong by one. **It is wrong by however many times the public types
      that word into a registration form, and it can drift any morning.** Keeping it as a smoke check
      and never an assertion was right; this is the reason, and the reason I originally gave was not.
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
- ✅ **The full load, verified by imac on a cluster:** 1,174,007 organisations, stage 4 on UIS 1.6.70,
  exit 0 in 2m51s.
- ✅ **Migration convergence, verified by imac (urb-agents #809):** three empty `pg_dump --schema-only`
  diffs, ignoring only `pg_dump`'s randomised `\restrict` / `\unrestrict` lines — which were the
  entire raw diff, 8 lines, exactly as the README warns. ⚠️ **The reasoning this bullet used to offer
  in place of a diff** — *"one guarded `create table`, comments re-asserted unconditionally to the same
  text, and nothing later alters it"* — turned out to be correct, which is not the same as having been
  sufficient. `051` exists because exactly that kind of reasoning was wrong once.
- ✅ **The second-run-on-a-populated-table case, verified by imac (urb-agents #839)** to the extent the
  question required: upsert correct across 866,000 conflicting keys, watermark held at `25190771`,
  nothing deleted, and the 286 snapshot rows absent from the dimension all correctly tombstoned. ⚠️ The
  download terminated part-way, so the loader never *completed* a second run — see the scoring in the
  status block for why that closes the falsifiable and opens a separate investigation instead.

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
instead, and the artifact states the difference rather than implying it. **The gate was made to fail
on purpose**: removing `brreg_bootstrap` from `first_data.jobs` produces

```
✗ first_data.jobs does not cover 1 automated source(s): ['brreg-enheter-alle']
```

> ⚠️ **The `manual_only:` key was deleted and then restored on the same day, and the round trip is
> worth more than either decision.**
>
> imac found it rendered on no UIS surface (urb-agents #793) and argued the instruction already reached
> the operator through `first_data.how`. That was true, and I deleted it — **a key nothing reads and
> nothing displays is indistinguishable from coverage.**
>
> 🔴 **Then the surfaces turned out not to be interchangeable.** From imac's own run of
> `_install_summary_operational`, the end of an install prints `install.note`, `first_data.jobs`,
> `automation` and `unscheduled` — **not `first_data.how`.** So deleting the key left the operator who
> is *about to run the chain* seeing `brreg_bootstrap` in the job list, absent from `unscheduled`, and
> nothing on that surface saying it is a one-time load. **It reads as a job they forgot to schedule.**
>
> The duplication was real and the conclusion was wrong. **Two surfaces, two readers:** the fact
> belongs where the person about to act is looking, the reason where someone investigating is. The key
> is back, and the sentence that duplicated it has come out of `first_data.how` instead.

### Validation

- ✅ The definitions load; `brreg_bootstrap` is among the eight jobs and resolves to the right two
  assets; the asset carries neither a condition nor a policy.
- ✅ `render-template-info.sh` passes every gate, and coverage went from 40 to **41** automated
  sources with the same two parked.
- ✅ The coverage gate proven to fail on purpose.
- ✅ **Verified by imac:** `brreg_bootstrap` on a clean install from the catalogue reached the phase 2
  row count — 1,174,007 organisations, exit 0 in 2m51s on UIS 1.6.70, all endpoints 200 and automation
  running. `uis template info atlas` renders the first-data sequence from `v20260913-e0ef430` onward.

---

## Out of scope

- **Underenheter** (862,903) — follow-on plan, ops-dev #711.
- **The change feed** — PLAN-002.
- **Any `marts` or `api_v1` surface** — PLAN-003. Terje decided no new public endpoint.
