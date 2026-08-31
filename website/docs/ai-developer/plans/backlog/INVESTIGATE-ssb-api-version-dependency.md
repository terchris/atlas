# INVESTIGATE: All SSB ingest depends on a beta API surface

## Status: Backlog

**Question**: Every SSB source fetches through `api/pxwebapi/v2-beta`. On 2026-08-30 that entire
surface returned 503 for hours while the rest of SSB answered normally. Do we stay on it, add a
fallback, or move — and what would we even move *to*?

**Last Updated**: 2026-08-30

**Priority**: Medium — durable reliability, not an incident response. Nothing is broken today.

**Origin**: Finding F-B from the Sunday 02:00 tick of 2026-08-30
(`for-atlas-ops-sunday-tick-capture.md` in `terchris/home`).

---

## What we know

`ingest/src/lib/pxweb.ts:8` pins the base URL:

```ts
const PXWEB_BASE = "https://data.ssb.no/api/pxwebapi/v2-beta";
```

Every `ssb-*` source routes through it — 15 of them failed together on 2026-08-30 for this reason.
The `klass.ts` client is **not** affected; it uses `https://data.ssb.no/api/klass/v1`, which is a
stable versioned surface.

**This is already a known risk in the repo.** `ingest/src/sources/ssb-08764/README.md` records it:

> SSB's documentation says "v2" but the live endpoint (as of 2026-04-21) is at
> `https://data.ssb.no/api/pxwebapi/v2-beta/…`. Our client points at `v2-beta` for now.
> **Re-check annually; move to `/v2/` when the beta flag is dropped.**

What is new is evidence that the beta surface is *differentially* unreliable, measured from two
vantage points on 2026-08-30:

| endpoint | from inside the cluster (07:30) | from tecMacDev (07:35) |
|---|---|---|
| `v2-beta` table data / metadata / list | **503** | **503** |
| `v0` legacy API | 200 | **200** |
| `www.ssb.no` | 200 | — |

Two independent networks agree, so this is SSB's, not our own network path.

⚠️ **`v0` is the deprecated legacy API, not "v2 stable".** The obvious-sounding move — "v0 answers,
point at v0" — is a move *backwards* onto a surface SSB intends to retire. It is a fallback
candidate at best, not a destination. This investigation exists because the direction is not
obvious, and tonight's evidence is an input to it, not an answer.

## Questions to resolve

1. **Has `/v2/` shipped?** The 2026-04-21 note said no. Re-check; if it has, this collapses into a
   small PLAN (swap the base URL, re-run the suite).
2. **Is `v2-beta` actually less reliable, or did we sample one bad night?** One outage is an
   anecdote. Is there a status page, changelog or announcement list worth watching?
3. **Is a fallback worth the cost?** `v0` and `v2-beta` differ in response shape (`json-stat2`
   handling, and the v2-beta "latest Tid period only" default we have written around in several
   sources). A fallback means maintaining two parsers for the same table — possibly worse than an
   outage that self-heals.
4. **What does an outage actually cost us now?** With
   [INVESTIGATE-ingest-freshness-visibility](./INVESTIGATE-ingest-freshness-visibility.md) resolved
   we would at least *know*. If a missed weekly refresh is visible and self-heals next tick, the
   answer may legitimately be "accept it and document it".
5. **Does anything else in Atlas depend on a beta/unversioned upstream?** FHI and Bufdir should be
   audited the same way rather than assumed fine.

## Not in scope

The retry policy — that is [PLAN-ingest-retry-budget](./PLAN-ingest-retry-budget.md). No retry
budget survives a 5.5-hour outage, so the two are independent.

## Possible outcomes

- **Move to `/v2/`** if it exists → small PLAN.
- **Stay, and document the exposure** with a re-check date → close as accepted risk.
- **Fallback path** → PLAN, only if questions 3 and 4 justify the parser cost.
