---
mdx:
  format: md
---

# INVESTIGATE: repeated Brreg bulk downloads get less far, not further

## Status

**Open — 2026-09-13.** Spun out of
[PLAN-001-brreg-bulk-snapshot](../completed/PLAN-001-brreg-bulk-snapshot.md), which closed without it.
The plan's falsifiable was answered; this is a different question with a different owner, and holding
a plan open on an external service's behaviour would have kept it open for a reason the plan cannot
fix.

## What was observed

Four downloads of the same 210 MB bulk file from `data.brreg.no` within ninety minutes on 2026-09-13.
The first completed. Each subsequent one terminated sooner:

```
run 122   from 308,239 / 866,000   reached 590,000   399 s   terminated
run 124   from 308,239 / 866,000   reached 150,000   203 s   terminated
```

🔴 **Byte-identical database state, roughly 4× difference in reach.** Database state cannot explain
that, so the cause is external and cumulative.

## 🔴 What is NOT claimed

**Rate-limiting is a hypothesis, not a finding.** The error text is only `terminated`; Brreg's side is
not visible from Atlas. imac declined to name a mechanism and that restraint is kept here — *"four
bulk downloads in ninety minutes, each getting less far"* is the observation, and anything about
*why* is not yet evidence.

⚠️ Recording the hypothesis without the distinction would be worse than recording nothing: the next
person would inherit a cause that was never established and stop looking.

## Why it matters operationally, which is why it is not just a curiosity

**Re-running the bootstrap is what an operator does to repair the register.** If reach degrades with
repetition then the instinct that follows a failure — try again — is the wrong move, and every retry
makes the next attempt worse. That is already in `operational.troubleshooting` as *stop retrying, the
remedy is time*, on the observation alone rather than on a mechanism.

🔵 A partial load is safe to leave in place meanwhile: the loader upserts on `organisasjonsnummer`,
deletes nothing (both measured across 866,000 conflicting keys, #839), and the change feed keeps the
register current. ⚠️ But it leaves `raw` carrying two `snapshot_file_date` values at once — not a
fault in itself, and a hazard for whoever next runs a full refresh for an unrelated reason.

## What would settle it

- **One clean bootstrap on a cold relationship** — no bulk download for at least a day. Confirms the
  file and the loader are fine, which the first run of the night already suggests.
- **Whether reach correlates with recency of the previous attempt** rather than with anything in
  Atlas. Needs attempts spaced deliberately, which is expensive in wall-clock and cheap in effort.
- **Whether Brreg documents a limit.** Worth reading before measuring — a documented policy would
  make the rest of this unnecessary, and Atlas depends on staying welcome at these APIs.

⚠️ **Do not investigate this by repeatedly downloading the file.** If the hypothesis holds, the
investigation is the harm. Any measurement plan should say how many requests it will make and why that
number is the smallest that answers the question.

## Prerequisite

Needs a cluster and a container runtime; this agent has neither. Whoever picks it up runs it, and the
first useful move is the read (documented limits), not the write.
