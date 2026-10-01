# Investigate: IMDikator's API, for the two IMDi indicators bosettingstall doesn't cover

Whether IMDikator's backend can be reverse-engineered to serve `imdi-innvandringsgrunn-kjonn`
(immigration reasons by gender) and `imdi-landbakgrunn` (country of origin) — the two IMDi
indicators a 2026-09-29 outside-consumer report flagged as missing that `imdi-bosetting` does not
cover.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Determine whether IMDikator's API can be reverse-engineered well enough to ingest
`imdi-innvandringsgrunn-kjonn` and `imdi-landbakgrunn` — or whether a different source needs to be
found for them.

**Last Updated**: 2026-10-01

**Origin**: Split out of
[`PLAN-009-imdi-bosetting.md`](../completed/PLAN-009-imdi-bosetting.md), which deliberately did
**not** fold these two indicators in despite the parent investigation's own
[`INVESTIGATE-new-norwegian-public-sources.md`](INVESTIGATE-new-norwegian-public-sources.md)
**[Q42]** recommending exactly that — see that PLAN's Implementation Notes for the full reasoning.
Also tracked as open items **[Q42]** (scope) and **[Q43]** (overlap with `fhi-innvandrere`) in the
parent investigation, which stays in `backlog/` until this ships too. Independently corroborated by
[`INVESTIGATE-samfunnspuls-replacement-gaps.md`](INVESTIGATE-samfunnspuls-replacement-gaps.md) [Q4]
— a different outside consumer (an agent rebuilding samfunnspuls.rodekors.no) flagged the same two
IMDi indicators as missing, counting "IMDi (2)" among 15 ungraphed Samfunnspuls panels.

---

## Questions to Answer

1. **[Q1]** Does IMDikator's backend (`app-simapi-prod.azurewebsites.net`) actually carry
   `imdi-innvandringsgrunn-kjonn` and `imdi-landbakgrunn` data at all? Not confirmed — only the
   tool's *visible* scope (population composition, immigration reasons, world regions, residence
   duration) was read from its UI, which reads as closer to these two indicators than to
   bosettingstall, but no API response has actually been inspected.
2. **[Q2]** What are the real endpoint(s), request shape and response shape? The bundle that calls
   the API is loaded dynamically (confirmed: static analysis of the page's JS found only a script
   injector, no endpoint strings) — this needs a headless browser to observe actual network traffic,
   which a prior pass explicitly deferred as out of proportion for `PLAN-009`.
3. **[Q3]** Does it need authentication, a key, or is it open like `imdi-bosetting`'s static HTML?
4. **[Q4]** Overlap with `fhi-innvandrere` — the parent investigation's own **[Q43]** notes FHI
   typically lags IMDi by one cycle; worth checking whether the methodology gap between the two is
   meaningful enough to justify a second, IMDi-specific ingest of overlapping ground.
5. **[Q5]** If IMDikator doesn't pan out, is there any other public distribution for these two
   indicators — `data.norge.no` re-check, a direct IMDi statistics page in the same static-HTML
   shape as bosettingstall, or similar?

---

## Current State

**What's already confirmed, from `PLAN-009-imdi-bosetting.md`'s Phase 1.2 research (2026-10-01):**

- IMDikator is real and live, at `arkiv.imdi.no/statistikk/`.
- Backed by a dedicated API host, `app-simapi-prod.azurewebsites.net` (found via the page's
  `data-api-host` attribute).
- Currently updated — data as recent as January 2025 was seen on the page.
- No Swagger/OpenAPI docs found at the usual paths (checked, 404).
- The `data.norge.no` catalogue record that points toward it (org `987879696`,
  *"Statistikk om innvandring og integrering"*) is 6 years stale (`modified: 2020-05-26`) — not
  trustworthy on its own, consistent with catalogue staleness already found wrong twice this
  session (NAV, Bufdir).
- `imdi-bosetting` itself is live, shipped, and verified
  ([urb-agents#1799](https://github.com/terchris/urb-agents/issues/1799)) — proof IMDi as a
  publisher is reachable and that Terje's licence authorization
  (*"IMDI is ok. we can use it."*, 2026-10-01) exists for this publisher.
  ⚠️ **That authorization was given for bosettingstall specifically — treat it as likely to extend
  to other IMDi indicators, not as already re-confirmed for them.** Flag for Terje if this
  investigation reaches an implementation decision.

**What's not yet done:** nobody has pointed a headless browser (Playwright/Puppeteer) at
`arkiv.imdi.no/statistikk/`, driven its UI, and captured the actual XHR/fetch calls it makes. That
is the next concrete step, not more static analysis.

---

## Options

### Option A: Reverse-engineer IMDikator with a headless browser

**Pros:**
- If it works, likely the richest, most current source for both indicators.
- One mechanism serves both missing indicators at once.

**Cons:**
- No documented API — purely observational reverse-engineering, which can break silently on any
  IMDikator frontend change (no contract, no versioning promise).
- Unknown effort until someone actually drives it — could be a 30-minute Playwright session or a
  multi-day slog depending on how the app is built (SPA state management, auth tokens, pagination).
- [Q1] (does it even carry this data) is unconfirmed, so the investigation could end in "no."

### Option B: Find a different public distribution

**Pros:**
- Could turn out to be as simple as `imdi-bosetting` itself (static HTML, no reverse-engineering).

**Cons:**
- The obvious lead (`data.norge.no`) already pointed at IMDikator and nowhere else — a fresh search
  needs a reason to expect a different result this time, not just another query.

### Option C: Accept the gap, rely on `fhi-innvandrere` for the overlapping ground

**Pros:**
- Zero new ingest work.
- `fhi-innvandrere` already exists and may cover enough of the same signal.

**Cons:**
- Doesn't answer the consumer report's actual request — a Samfunnspuls-shaped UI wants IMDi's own
  framing (immigration reason, country of origin), not FHI's.
- Doesn't resolve **[Q43]**'s open "is the methodology gap meaningful" question, it just avoids it.

---

## Recommendation

None yet — this is exactly the gap this file exists to close. **[Q2]** (observe real network
traffic with a headless browser) is the one concrete next action; everything else is downstream of
what that returns.

---

## Next Steps

- [ ] Drive `arkiv.imdi.no/statistikk/` with a headless browser, capture real XHR/fetch calls
      against `app-simapi-prod.azurewebsites.net`.
- [ ] If a usable API surface is found: create `PLAN-011-imdi-innvandringsgrunn-landbakgrunn.md` (or
      split into two PLANs if the two indicators turn out to need different handling).
- [ ] If not: re-check `data.norge.no` and IMDi's own site for any other distribution (**[Q5]**),
      or close this out documenting why neither indicator can be self-served — same shape as
      `redcross-branches`' bespoke-extract conclusion in
      [`INVESTIGATE-samfunnspuls-replacement-gaps.md`](INVESTIGATE-samfunnspuls-replacement-gaps.md)
      [Q8].
