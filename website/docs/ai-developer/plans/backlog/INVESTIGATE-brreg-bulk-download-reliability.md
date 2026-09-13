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
register current. It leaves `raw` carrying two `snapshot_file_date` values at once.

⚠️ **CORRECTION 2026-09-13: the full-refresh hazard was overstated, and the overstatement is mine.**
This paragraph used to end *"a hazard for whoever next runs a full refresh for an unrelated reason"*,
and I repeated it more strongly elsewhere as *"a full refresh would bake in a half-and-half
register"*. **Read against the model, it would not.**

On `--full-refresh`, `is_incremental()` is false, so **both** `changed` filters disappear:
`snapshot` reads every row and `latest_change` reads `distinct on (organisasjonsnummer) … order by
oppdateringsid desc` over the **entire** versions history rather than a window. Document precedence
is `coalesce(changed_doc, snapshot_doc)`, so:

- every organisation the feed has **ever** touched takes the feed's newest document — current;
- every organisation the feed has **never** touched has, by definition, **not changed**, so its
  09-11 document and its 09-12 document are the *same document*.

🔵 **The split is a difference in PROVENANCE, not in content.** `snapshot_file_date` would end up
mixed, and that column exists precisely to record which file a row came from — it would be
**accurate**, not corrupt. "Half-and-half register" was the wrong mental model of the hazard.

🔴 **What would falsify this, stated because it is the real bound:** a feed that is lossy for one of
the ~308,239 organisations still on the older file. imac's exhaustive losslessness check covered the
866,000 carrying the **newer** file date; the older rows were not testable, because their snapshot row
*is* the file the dimension was built from. Nothing suggests selective lossiness and zero adjacent
pairs across 161 million argues against it — but the check does not cover them, and that is a
different statement from "they were checked and passed."

✅ So finishing the load is still worth doing, for provenance and for coverage of that bound — but it
is **not** a precondition for a full refresh, and treating it as one was blocking a legitimate
operation on a hazard that does not exist.

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
