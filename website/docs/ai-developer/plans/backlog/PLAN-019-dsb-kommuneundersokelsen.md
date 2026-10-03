# Plan: DSB Kommuneundersøkelsen — municipal preparedness

**Phase 1 conclusion: do not proceed to Phase 2.** `dsb.no` is behind a Cloudflare managed JS
challenge that this agent's tools cannot pass. Confirmed via two independent tools, not assumed
from one failed request.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — Phase 1 complete. NOT ready to move to `active/`; blocked on tool access,
not a data-design question.

**Goal** (as originally framed): kommune-level municipal-preparedness scores, pairing with
`redcross-branches` for a "is this kommune prepared, and is NGO presence sufficient" signal
(investigation's own Report #13 framing).

**Last Updated**: 2026-10-04

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §8 [Q22]/[Q23]

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-04)

### Tasks

- [x] 1.1 Fetch the landing page. **Blocked** — `curl` against
  `https://www.dsb.no/ros-og-beredskap/kommuner/kommuneundersokelsen/` returns Cloudflare's
  managed JS challenge page ("Just a moment...", `cf_chl_opt` challenge payload), not real
  content, with both a plain request and a real-browser `User-Agent` header. `WebFetch` against
  the same URL and the specific `.../kommuneundersokelsen-2025/` sub-page both return a bare
  HTTP 403. Two independent tools, same result — not a transient blip.
- [x] 1.2 Look for the raw data by another route. **Not found.** `data.norge.no`'s real search
  backend (found by following its `/api/datasets` redirect to
  `datasets.fellesdatakatalog.digdir.no`) returned a backend routing error for every query tried,
  not a real result set — this agent could not get a working query against it in reasonable
  effort. A live web search for `site:dsb.no kommuneundersøkelsen filetype:xlsx` returned no
  matching indexed file. No alternate host (CDN, document-management subdomain) was found hosting
  the same files outside the challenge-protected main site.
- [x] 1.3 Confirm this is a tooling limit, not a design question. **Confirmed** — unlike Helfo
  (`PLAN-018`), where the real finding was "the claimed mechanism doesn't exist," here the
  mechanism (an Excel/PDF download, per the investigation's own framing) may well exist exactly
  as described — this agent simply cannot reach it. A Cloudflare JS/proof-of-work challenge
  requires executing JavaScript in a real browser; no tool available to this agent does that.

### Validation

✅ Confirmed 2026-10-04. Two independent tools (curl with two different User-Agent strings,
WebFetch) both blocked, and no indexed alternate download path found. Not treated as absence of
data — treated as absence of access from here.

---

## Open Questions

- **[Q1] Can a human (or a tool with a real browser) fetch this once?** A one-time manual
  download of the current year's Excel/PDF, committed as a seed file, would unblock Phase 2
  without needing ongoing Cloudflare bypass — matching the existing "annual Excel-from-PDF" plan
  in the investigation's own [Q22]. **Recommendation**: if this candidate matters, ask Terje (or
  whichever agent next has browser access) to fetch
  `https://www.dsb.no/ros-og-beredskap/kommuner/kommuneundersokelsen/kommuneundersokelsen-2025/`
  once and hand off the resulting file(s); re-open this PLAN from Phase 2 at that point, not from
  Phase 1.
- **[Q2] Does this block every future annual refresh, or just today's research?** If Cloudflare
  protects the download links too (not just the landing page), this would need a *repeatable*
  fetch mechanism every year, not a one-time workaround — unresolved, since this agent never
  reached a real download link to test against.

---

## Acceptance Criteria

- [x] **The access blocker is confirmed with two independent tools**, not assumed from one
  failed request.
- [x] **Checked for an alternate path (data.norge.no, direct file search) before concluding
  blocked** — not just given up at the first wall.
- [ ] A human decision (manual one-time fetch, or defer) is made before any further work on this
  candidate.

---

## Files to Modify

None in this PLAN. If a one-time manual fetch becomes available, resume from Phase 2 of the
investigation's own framing (§8), not from scratch.
