# INVESTIGATE: Bufdir restructured their download page

> **IMPLEMENTATION RULES:** Before implementing, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Restore `bufdir-barnefattigdom` after an upstream page restructure.

**Last Updated**: 2026-08-25

**Origin**: F2 from the first full 41-source live run — one of two failed sources.

---

## What happened

The ingest discovers Bufdir's child-poverty zip by scraping their page for the download link. Bufdir changed the page, so discovery fails.

**The error message diagnosed it correctly** — `discoverZipUrl` reports what it looked for and did not find, which is why this arrives as "Bufdir restructured their page" rather than "bufdir failed". Worth noting as evidence that the effort spent on ingest error messages pays for itself: this needed no debugging session.

## Why this is an INVESTIGATE and not a PLAN

The fix depends on what Bufdir now publishes, and nobody has looked yet. It could be a moved link (a one-line selector change), a changed file format (parser work), or data withdrawn or relocated behind a different route (a sourcing question). Those are three very different pieces of work.

## To find out

- [ ] What does the Bufdir page look like now, and is the same zip still published?
- [ ] Is there a stabler route — an API, a data.norge.no entry, a permanent URL — rather than scraping a page that has now moved at least once?
- [ ] Does the file's internal structure still match `parse.ts` (the surrogate-indicator-id work in `PLAN-bufdir-surrogate-id-migration` assumed a specific sheet shape)?
- [ ] Should discovery fail loudly on the *next* restructure, or fall back to a pinned URL?

## Notes

Not urgent in the sense that nothing else depends on it, but it is one of only two failing sources, and child-poverty data is one of Atlas's more load-bearing indicators — `mart_coverage_gap_barnefattigdom` is built on it.
