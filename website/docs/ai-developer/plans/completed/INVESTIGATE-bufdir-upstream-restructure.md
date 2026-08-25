# INVESTIGATE: Bufdir restructured their download page

> **IMPLEMENTATION RULES:** Before implementing, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed (2026-08-25) — diagnosed and fixed in the same session

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


---

## Outcome (2026-08-25) — fixed; the page moved, the data did not

Investigated by fetching the live page rather than reasoning about it, and the
answer was not what the failure suggested.

**The ZIP is still published.** Bufdir moved the monitor onto a **Strapi CMS on
Azure Container Apps**, and the filename went from a canonical, dated,
subject-named form to a generic hashed one:

```
was:  .../uploads/<YYYY_MM_DD>_barnefattigdom_monitor_<hash>.zip
now:  https://ca-statistikk-strapi-prod…azurecontainerapps.io/
        uploads/Filer_publisert_03_07_26_og_2025_640b1b30b3.zip
```

All four discovery tiers required the literal `barnefattigdom` in the URL, so all
four missed. The module's own comment says *"Hostname is intentionally not
constrained — Bufdir has flagged its CDN host as something that might move."* The
host was anticipated; **the filename was not**, and that is what actually moved.

### The fix, and why it is not simply "match any ZIP"

A `sole-upload` last-resort tier: any ZIP under `/uploads/`, **but only when there
is exactly one**. If Bufdir ever publishes two unnamed bundles, it fails and lists
the candidates rather than guessing — because guessing would likely *succeed*, and
quietly ingest the wrong dataset into a child-poverty indicator. A loud failure is
recoverable; silently wrong data is not.

### Answers to the questions this investigation asked

- **Is the same zip still published?** Yes, and its contents are unchanged in shape — 8 workbooks parsed with no parser changes at all.
- **Does the internal structure still match `parse.ts`?** Yes. **81,568 rows** ingested, 624 region codes, and the downstream dbt models including `mart_coverage_gap_barnefattigdom` build clean (22 PASS).
- **Is there a stabler route?** Not found. A Strapi upload path with a content hash is *less* stable than what it replaced, so this will drift again — which is the argument for the tiers plus the refuse-to-guess rule, rather than pinning a URL.
- **Should discovery fail loudly next time?** It already does, and that is what made this a 20-minute fix: the error named the cause (*"Bufdir likely restructured the page"*) rather than a stack trace, so no debugging session was needed. Retained.

**Freshness bonus**: the new bundle reports `upstream_updated_at = 2026-07-03`, so
the freshness signal is real rather than inherited from the ingest time.

Four discovery tests added, including that a canonical URL still wins when present
and that two unnamed ZIPs raise rather than guess.
