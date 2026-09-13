---
mdx:
  format: md
---

# INVESTIGATE: a slow run stacks rather than skips, and two runs then race on one table

## Status

**Open — 2026-09-13.** Found by imac while measuring something else (urb-agents #837). 🔴 **The hazard
is present in the pinned build, not only in the change that exposed it.**

## What happened

A `brreg_transform` run took 37 minutes against a `*/30` schedule. The next tick did not skip — it
started, and two runs executed `delete+insert` against `marts.dim_brreg_enhet` concurrently:

```
Database Error in model dim_brreg_enhet
duplicate key value violates unique constraint
DETAIL: Key (organisasjonsnummer)=(930823686) already exists.
```

```
a run exceeding its 30-min interval STACKS rather than skips
  -> stacked runs execute concurrently
  -> concurrent delete+insert on one table
  -> duplicate key, the second run dies
```

## ✅ What was ruled out, so this is not re-litigated

**The union arm in `dim_brreg_enhet` was the other candidate and it is eliminated by construction**,
not by argument: the predicate uses `UNION`, not `UNION ALL`; `raw.brreg_enheter_snapshot` has
`organisasjonsnummer` as its primary key; `latest_change` is `distinct on (organisasjonsnummer)`; and
`combined` is a full outer join between two sets each already unique on that column. **An organisation
appearing in both arms yields one row.** Three sequential solo runs also passed.

⚠️ That elimination makes this finding **worse**, not better. A model bug would have been fixable in
the model. This is a property of how the job is scheduled, and **nothing in the pipeline prevents it
today.**

## Why it has not bitten before

**At ~97 s per run against a 30-minute interval, stacking is unreachable.** It took one slow run to
expose it. ⚠️ Anything that makes a run slow enough gets there — a Brreg outage, a large catch-up, an
I/O-noisy neighbour, or a future model change — and **no warning fires as the margin closes**, because
run duration is not compared to the interval anywhere.

## The decision, which is why this is an investigation and not a fix

**Skip and queue are both defensible and they lose different things:**

| | behaviour | what it costs |
|---|---|---|
| **skip** | a tick that finds a run in flight does nothing | a poll is lost; the feed cursor is unaffected, so the next run catches up — but freshness policies see a gap |
| **queue / serialise** | the tick waits for the in-flight run | runs bunch after a slow one, and a long stall becomes a growing queue rather than a visible skip |

🔵 **Skip looks right for this job** — the work is idempotent and the next run subsumes a missed one,
which is exactly why the cursor watermark is read from the dimension rather than from the feed. But it
is a cadence decision with consequences for the freshness clocks, and those were set deliberately
(`BRREG_FRESHNESS`, 2 h warn / 6 h fail).

⚠️ **Whichever is chosen, it should come with the signal that is missing either way: run duration
against the interval.** A job that quietly moves from 97 s to 20 minutes has lost its margin long
before it stacks, and nothing says so.

## Prerequisite

Needs a cluster to verify; this agent has neither Postgres nor a container runtime. ⚠️ **Reproducing it
deliberately means forcing a long run, which on a populated cluster means a real transform — so the
cheaper route is to configure the bound and confirm the second tick declines, rather than to
reproduce the race first.**
