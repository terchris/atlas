# Plan: Helfo Fastlegestatistikk — kommune-level GP list coverage

**Phase 1 conclusion: do not proceed to Phase 2.** The investigation's assumed path — a
Helsedirektoratet developer-portal API behind a Power BI browse surface, the same shape
`husbanken-bostotte` turned out to have — does not hold up live. There is no real backend to
trace to, and no raw-file fallback either. Written up here as a genuine negative finding, not a
scope decision Atlas can resolve on its own.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — Phase 1 complete. NOT ready to move to `active/`; recommend deferring pending
outreach or an official data-access channel.

**Goal** (as originally framed): add kommune-level GP-list-coverage data — does the kommune have
GPs at all, how many lists are full, how many residents have no assigned GP — plugging Report #4
(Mental-Health Triangulation, system-access axis) and a possible future Report #12
(Primary-Care Access).

**Last Updated**: 2026-10-03

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §7 [Q19]/[Q20]/[Q21], next in the Tier-2 sequence after `ssb-crime-tables` per that doc's own "Sequencing recommendation"

**Prerequisites**: None assumed to be missing going in — found otherwise; see Phase 1.

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-03)

Checked live rather than trusting the investigation's own framing, which named this as a
"Power-BI-backed source, same pattern as Husbanken — use the developer-portal API, not the
dashboard" ([Q19]). **That framing does not hold.** Husbanken's Power-BI-*looking* surface turned
out to be Qlik Sense with a real, documented, anonymously-reachable Engine API (`PLAN-011`).
This one is genuinely Power BI, and its actual backend is not reachable the same way.

### Tasks

- [x] 1.1 Confirm the real browse surface. **Confirmed** — `https://www.helfo.no/Fastlegeordninga/fastlegestatistikk`
  embeds a real Power BI report (`reportId=cc79ce26-4f2a-4297-a695-b5534f06b618`,
  `groupId=503b9ee4-a491-43e7-9735-1b970802b3f4`, cluster `WABI-NORTH-EUROPE-I-PRIMARY`), found by
  reading the page's own `powerBiLoader.js` script tag directly rather than assuming from the
  investigation's prose. This is real Microsoft Power BI (`app.powerbi.com/reportEmbed`), not a
  Qlik app wearing a Power-BI-shaped URL — the Husbanken correction does NOT repeat here.
- [x] 1.2 **The investigation's "[Q19] use the developer-portal API" recommendation is WRONG —
  checked live, not assumed.** `utvikler.helsedirektoratet.no` is a real Azure API Management
  portal, and `helsedirektoratet.no/om-oss/apne-data-api` names what it actually serves: **HAPI
  (Helsedirektoratets API-tjeneste) is a content-syndication API for helsedirektoratet.no's own
  editorial website content** — "Mesteparten av innholdet kommer fra helsedirektoratet.no"
  (most of the content comes FROM helsedirektoratet.no), confirmed directly on that page. Its
  three named content areas are guidelines/`Antibiotikamodellen` (a dedicated data model for
  antibiotic-use guidelines), `Driftsmeldinger` (planned-outage notices), and generic page
  `Attributter`. **None of this is Fastlegestatistikk's underlying dataset.** HAPI is NLOD-licensed
  for the content it actually serves, which has nothing to do with this candidate.
- [x] 1.3 Confirm there is no raw-file fallback. **Confirmed absent.** Helfo's own
  `?tidligere-versjoner` ("previous versions") link, which on other Helfo pages can carry
  historical attachments, returns here: *"Vi har ingen eldre versjoner av denne siden"* ("We have
  no older versions of this page") — a CMS page-history feature finding nothing, not a data
  archive. No linked Excel/CSV/PDF data file found anywhere on the live dashboard page (only a PDF
  *user guide* for the dashboard itself, `Veiledning i bruk av dashbordet.pdf` — how to operate
  the Power BI widget, not the data).
- [x] 1.4 Checked SSB's PxWebApi — the mechanism Atlas already speaks fluently for 19 existing
  sources — for an equivalent, independently-reachable table. **Searched live
  (`data.ssb.no/api/pxwebapi/v2/tables?query=fastlege`), found 20 matches, none of them this
  statistic.** The closest are GP *demographics* (07388 "etter innvandringskategori og
  pasientlistestatus", 07470 "etter innvandringskategori og kommunestørrelse", 12720 "etter
  innvandrer...og sentralitet") and *consultation-pattern* tables (09491/09492/09493/09535/10141
  "konsultasjoner hos fastlegen, etter alder/kjønn/innvandringskategori/diagnose") — a genuinely
  different analytical axis (who GPs are, how often people see them) from what Helfo's dashboard
  tracks (is a kommune's GP-list capacity full, how many residents have no assigned GP at all).
  SSB does not appear to publish Helfo's specific list-coverage/vacancy statistic at all.
- [x] 1.5 Why not scrape the Power BI embed directly, matching this project's own precedent of
  tracing a BI tool to its real backend (per investigation §E [Q34], established while shipping
  `husbanken-bostotte`). **Confirmed this is a structurally different case, not the same
  correction repeating**: the embed's own `data-embedToken` and `data-expirationToken` fields
  (read directly from the page HTML) show a token minted **server-side, per page load, by an
  internal, undocumented helsedirektoratet.no service** (`/_/service/helsedirektoratet/updatePowerBiToken`)
  with roughly a **2-minute validity window observed live**. Reusing or renewing this would mean
  depending on an unofficial internal endpoint with no stability guarantee, not a documented
  public backend the way Qlik's Engine API genuinely was for Husbanken — [Q34]'s own convention
  ("always trace to the underlying dataset or backend API... never scrape a BI tool's iframe")
  describes exactly the thing this candidate would require doing, not a path around it.
- [x] 1.6 Licence. **Not independently verified** — moot until a real data-access path exists;
  the NLOD claim inherited from HAPI's own terms page (1.2) applies to HAPI's content, not to
  this unrelated dataset, so it is not evidence either way for Fastlegestatistikk specifically.

### Validation

✅ Confirmed 2026-10-03. Real live checks against `helfo.no`, `helsedirektoratet.no`,
`utvikler.helsedirektoratet.no`, and `data.ssb.no`'s own search API — not inferred from the
investigation's own description, which turned out to describe a mechanism ("developer-portal API
behind the dashboard") that does not exist for this specific dataset.

---

## Open Questions

- **[Q1] Is there an official channel this agent cannot reach?** This agent has no cluster
  access and no authority to register for credentialed APIs or send outreach email on Atlas's
  behalf (see [`INVESTIGATE-folkehjelp-supply` §A.4](./INVESTIGATE-folkehjelp-supply.md#a4-craft-cms-graphql-probe--q2-outreach-worth-pursuing)'s
  own precedent for this class of question). **Recommendation**: if this dataset matters enough
  to pursue, the next step is a human-sent inquiry to Helsedirektoratet/Helfo (the open-data
  contact `HelsedirektoratetAPI@helsedir.no`, found live on the same `om-oss/apne-data-api` page)
  asking specifically whether Fastlegestatistikk's underlying dataset — list vacancy/coverage per
  kommune — exists anywhere outside the Power BI dashboard. Not something to chase further from
  here without that answer.
- **[Q2] Is there a different, narrower slice already reachable?** SSB's existing fastlege tables
  (1.4) measure a different thing (GP demographics, consultation patterns) but are real,
  kommune-adjacent, PxWebApi-reachable data Atlas already knows how to ingest. **Not
  recommended as a substitute** — conflating "GP consultation rate by age" with "does this
  kommune have enough GP capacity" would misrepresent what the investigation's own framing
  actually wanted (a system-access signal, not a usage-pattern one). Flagging the option rather
  than silently picking it.
- **[Q3] Should this candidate move to Tier 3 (deferred) rather than stay in the Tier-2
  sequence?** Given no clean ingest path exists today, **recommendation: yes** — update
  `INVESTIGATE-new-norwegian-public-sources.md` to move this entry, so the next agent reading the
  Tier-2 sequencing table doesn't re-discover the same dead end. Not done in this PLAN itself
  (see Files to Modify) to keep the finding and the triage-doc update as one clean commit, same
  as every prior PLAN's close-out pattern — but flagged here so it isn't lost.

---

## Acceptance Criteria

- [x] **The real mechanism is checked live, not assumed** — a genuine Power BI embed with a
  short-lived, server-minted token and no documented backend; the investigation's own
  "developer-portal API" claim is found incorrect, not inherited.
- [x] **The raw-file and SSB-table fallback paths are both checked and ruled out**, not assumed
  absent.
- [x] **No ingest was attempted against an undocumented internal token-minting endpoint** —
  this project's own BI-tool convention was applied as a reason NOT to proceed, not worked around.
- [ ] A human decision (outreach, or formally deferring to Tier 3) is made before any further
  work on this candidate.

---

## Files to Modify

None in this PLAN — Phase 1 concludes "do not proceed." If Terje decides to defer this
candidate formally:
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` — move
  §7 from Tier 2 to Tier 3, citing this PLAN's findings, and update the "Sequencing
  recommendation" section's Phase 2 list.
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` — mark this candidate's row accordingly
  rather than "drafted, ready for Phase 2."
