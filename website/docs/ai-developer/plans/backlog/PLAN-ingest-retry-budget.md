# PLAN: Give the ingest clients a real retry budget — and one implementation instead of three

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: A brief upstream throttle should cost seconds, not a week of data. Today a 429 with a
short `Retry-After` collapses the whole retry budget to ~4 seconds, and two of our three HTTP
clients ignore `Retry-After` entirely.

**Last Updated**: 2026-08-30

**Priority**: Medium — nothing is broken and the next weekly tick is a week out. But this decides
whether that tick survives a wobble. **Not urgent, and explicitly not the cause of the 2026-08-30
incident** (see "What this does NOT fix").

**Origin**: The Sunday 02:00 tick of 2026-08-30, captured by ops
(`for-atlas-ops-sunday-tick-capture.md` in `terchris/home`). All 15 `raw__ssb_*` steps failed on
HTTP 429 in 6–11s each. Findings F-A and F-C.

---

## Problem Summary

### F-A: `Retry-After` overrides the backoff ladder instead of flooring it

`ingest/src/lib/pxweb.ts` already implements both mechanisms people reach for first:

```ts
const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
const wait = retryAfter ?? backoffMs(attempt);
```

```ts
function backoffMs(attempt: number): number {
  // 500ms, 1s, 2s, 4s … with small jitter
  const base = 500 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}
```

So the ladder is exponential *and* `Retry-After` is honoured. The defect is that `??` makes
`Retry-After` **win outright**. When the server answers "retry after 1 second", all four attempts
fire ~1s apart and the client gives up after roughly **four seconds** — shorter than if the header
had been absent (0.5 + 1 + 2 + 4 ≈ 7.5s).

**Evidence — the captured waits fit no rung of the ladder.** The ladder can only emit
500–749 / 1000–1249 / 2000–2249 / 4000–4249 ms. The run logged:

```
"status":429,"wait_ms":970,"attempt":1
"status":429,"wait_ms":1000,"attempt":2
"status":429,"wait_ms":1000,"attempt":3
```

970 falls in no bucket, and flat ~1000 at attempts 2 and 3 is not 2s-then-4s. These are
`Retry-After` values — 970 is the HTTP-date branch (`date - Date.now()`). Attempts 1–3 settle it
on their own; the attempt-0 line is not load-bearing. (Verbatim run logs are retained
cluster-side; ask ops if anyone wants belt-and-braces.)

⚠️ **The first diagnosis of this was the inverse** — "no exponential backoff, `Retry-After` not
honoured" — and the suggested fix was to add both. They are already there. Adding them again would
have changed nothing. Verify against the code that produced the log line, not the log line.

### F-C: three near-identical clients, only one honours `Retry-After`

| client | backoff | `Retry-After` | logs `attempt` |
|---|---|---|---|
| `lib/pxweb.ts` | `backoffMs()` helper | ✅ `parseRetryAfter` | ✅ |
| `lib/klass.ts` | `backoffMs()` helper | ❌ ignored | ✅ |
| `lib/fhi.ts` | inlined `500 * 2 ** attempt` | ❌ ignored | ❌ |

All three are `attempts = 4` copies of the same function with the same `User-Agent`. Fixing
`pxweb` alone leaves the 21 FHI sources and the KLASS classification fetches non-compliant. **They
passed on 2026-08-30 because FHI was healthy, not because they are correct.**

`fhi.ts` also omits `attempt` from its retry log, which would have made the F-A diagnosis above
impossible had FHI been the failing source.

### Stale comment

`pxweb.ts` says *"SSB rate limit is 30 req/min/IP (typical)"*. Observed live on 2026-08-30:

```
x-ratelimit-policy: 40;w=60s
x-ratelimit-limit: 40
```

Worth correcting while we are in here. Note our own concurrency bound is **4**, so we are nowhere
near this limit — our fan-out did not cause the 429.

---

## What this does NOT fix

**This would not have saved the 2026-08-30 run.** SSB returned 429 at 02:00 and the whole
`v2-beta` surface was still returning 503 at 07:35 — a 5.5-hour-plus outage. No retry policy
survives that. This plan is for a *wobble*; the multi-hour case is
[INVESTIGATE-ssb-api-version-dependency](./INVESTIGATE-ssb-api-version-dependency.md), and the
"nobody noticed" half is
[INVESTIGATE-ingest-freshness-visibility](./INVESTIGATE-ingest-freshness-visibility.md).

---

## Phases

### Phase 1 — one shared client

- [ ] Extract a single `fetchWithRetry` into `ingest/src/lib/http.ts`, with `backoffMs`,
      `parseRetryAfter` and `sleep`.
- [ ] Point `pxweb.ts`, `klass.ts` and `fhi.ts` at it; delete the three copies.
- [ ] Keep the per-client log prefix (`pxweb.fetch.retry` etc.) via a `label` option — the prefixes
      are load-bearing for diagnosis and must not collapse into one generic event.
- [ ] Ensure every retry log carries `attempt`, `status` and `wait_ms` (closes the `fhi.ts` gap).

### Phase 2 — the budget

- [ ] `wait = Math.max(retryAfter ?? 0, backoffMs(attempt))` — the header raises the wait, never
      lowers it.
- [ ] Cap a single wait (`MAX_WAIT_MS`, ~60s) so a hostile `Retry-After: 3600` cannot hang a run.
- [ ] Add a **total elapsed budget** (`MAX_TOTAL_MS`) rather than only an attempt count; give up on
      whichever comes first.
- [ ] Raise `attempts` from 4, chosen against the budget rather than picked independently.
- [ ] Values configurable by env with the current behaviour as documented defaults.

### Phase 3 — prove it can fail

- [ ] Unit tests with a stubbed `fetch`: 429 + `Retry-After: 1` must now take the ladder, not ~1s
      flat; a 429 storm must exhaust the *budget* rather than the attempt count; `Retry-After: 3600`
      must be capped; a 200 on attempt 2 must return normally.
- [ ] **Make one test fail on purpose before trusting it** — this repo has shipped a guard that
      protected nothing, and a green uniqueness test once masked the RISK-1 fan-out.
- [ ] Run under Node ≥22 (`export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"`); Vitest 4
      dies at startup on the machine default 20.11 and it looks like a broken repo, not a bad Node.

## Acceptance

- One retry implementation, three call sites, no behavioural drift between them.
- A 429 carrying `Retry-After: 1` no longer shortens the retry window below the bare ladder.
- Tests cover the budget, the cap and the floor, and at least one was seen red before it went green.
- `npm run typecheck` and `npm test` green.

## Falsifications

- If `Retry-After` is honoured but not floored, a stubbed `Retry-After: 1` still gives up in ~4s.
- If the shared client dropped the log prefixes, a failing run can no longer be attributed to a
  source family from the logs alone.
- If the budget is attempt-count-only, a `Retry-After: 30` storm runs far past `MAX_TOTAL_MS`.
