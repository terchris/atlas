# Goal

This document describes what we're building, why, and for whom. It sits alongside:

- `personas.md` — who we're building for
- `ngo-landscape.md` — the Norwegian NGO sector map and structural-fit tiers
- `sector-research.md` — evidence on how the sector is used and where barriers lie
- `data-sources.md` / `data-sources-international.md` — the data we can draw on
- `redcross-*.md` and `norskfolkehjelp-*.md` — per-organisation working material used to validate the framework

It's a living document. Some things are settled; others are deliberately open and will be tightened as we make decisions.

---

## What this project is

**Atlas** — a Norwegian web application that is **the single source of information about Norway's NGO sector**: activities, chapters, funding, people, and the humanitarian needs that shape them. It is organisation-neutral: it aggregates and normalises public data about every large NGO that has a meaningful chapter footprint or public-facing mission in Norway, not just one.

Launched as **atlas.helpers.no**, the first service from **Helpers** (helpers.no), whose purpose is helping the helpers — NGOs and the volunteers who work for them. The name pattern `<service>.helpers.no` is how other Helpers services will be added later.

The goal is to be the place you land when you want to:

- find a way to contribute — volunteer, donate, become a member, sign a petition
- find a service you need — language practice, visiting scheme, youth activity, crisis helpline, bereavement support
- understand the sector — who does what, who's funded how, who's represented where, how Norway is served

The app **doesn't replace** any NGO's own website. It's a meta-layer that surfaces and compares, then hands off to the correct NGO system with context pre-filled.

### Where we started

The project began as a Red Cross-branded application exercising the Norwegian Red Cross Organizations API and Design System. Through the landscape research (`ngo-landscape.md`) and the Norsk Folkehjelp framework-validation work (`norskfolkehjelp-*.md`), it became clear the framework generalises across the Tier A dense-chapter humanitarian/social cluster with ~70–90% code reuse. The Red Cross-specific working documents remain in the repo (`redcross-*.md`) as the reference case the framework was built against.

---

## Who we're building for

The audience is captured in `personas.md`. In summary:

**Primary personas — public-facing** (drive the default flow)
1. **Kari** — wants to help, doesn't know the jargon, doesn't have a preferred organisation
2. **Jonas** — wants to donate transparently, wants to compare where money goes
3. **Amira** — recently arrived, needs a concrete service at a specific time and place
4. **Lars** — worried about family in a weather-warning area, wants to know who responds
5. **Tone** — civically engaged, wants to browse and compare organisations before committing
6. **Ola** — data-curious observer (journalist, researcher, citizen)

**Secondary personas — internal / staff** (served, but not the default target)

7. **Inger** — chapter leader at any NGO, uses the app to see her chapter from outside
8. **Arne** — district coordinator, future planning-tool user
9. **Signe** — national office planner, Samfunnspuls-equivalent audience
10. **Mette** — emergency response coordinator across rescue-capable NGOs
11. **Lisa** — tilskuddsansvarlig, finds grant calls that match her NGO's mission and drafts applications citing real need data

**Tertiary personas — niche audiences we also serve** (dedicated paths)

12. **Magnus** — existing active volunteer, quality-control ally
13. **Henrik** — corporate partnership lead, looking across orgs for regional fit
14. **Åse** — person in acute crisis (drives the non-negotiable crisis band)
15. **Dev** — developer exploring public data about Norwegian civil society
16. **Sara** — 15-year-old interested in youth activities

**All 16 personas are people we plan to serve.** The priority ordering determines where screen real estate goes first and what "default flow" means — not who gets turned away.

The pivot from the original Red Cross framing is subtle but material: the personas are no longer people who have already decided to engage with one specific organisation. They're people who have decided (or might decide) to engage **with the sector**, and the app's job is to help them find the right fit.

---

## What we want to accomplish

Four goals, in priority order:

### 1. Serve prospective volunteers, donors, and members well — across organisations
The primary public audience arrives wanting to *do something*. Many don't know which organisation is the best fit for their interests, location, or time commitment. The app helps them go from *"I want to help"* to *"here's where I start"*, matched to their actual preferences and anchored on their local area.

### 2. Be safe for people in acute distress
Åse is why the crisis band exists. Any page of the app, at any time, must visibly surface the right emergency and helpline numbers — 113, 112, 110, Mental Helse (116 123), Kirkens SOS (22 40 00 40), Kors på halsen (800 33 321), Alarmtelefonen for barn og unge (116 111), and others relevant to the context. This is not optional and not a footer item. It's a persistent piece of the app's chrome. The helplines are sector-wide — no single NGO owns them.

### 3. Solve real UX problems the current Norwegian NGO digital presence doesn't
Today, someone who wants to help has to visit dozens of org websites, each with different language, structure, and engagement models. There is no single place to:
- browse NGO chapters in your kommune regardless of which organisation runs them
- filter by activity type across organisations ("find places offering språkkafé near me" regardless of whether that's Red Cross, Folkehjelp, or Kirkens Bymisjon)
- compare funding transparency side-by-side
- see humanitarian-need indicators overlaid with NGO presence at kommune level
- see which organisations are absent where the need is high (coverage gaps)

The app fills that gap.

### 4. Make the sector legible
Norwegian civil society is worth 4.7% of mainland GDP and 142 000 volunteer årsverk (see `sector-research.md`). The activity data, funding flows, chapter networks, and board compositions are mostly public but scattered. Bringing them into one coherent structure is valuable as a public good on its own — for journalists, researchers, policy planners, and engaged citizens — and is what makes the app reusable beyond the engagement flow.

---

## The primary user experience

The app supports **three entry points**. Users arrive via whichever matches their mental model:

1. **Location-first** — "what's near me?" — a map of Norway with every NGO chapter/station/lokallag/korps overlaid. Filter by organisation, by activity, by chapter status.
2. **Activity-first** — "I want to do/get X" — pick an activity type (visit lonely elderly, teach Norwegian, help with homework, join a rescue corps, etc.) and see every organisation offering it, ranked by proximity.
3. **Organisation-first** — "I know about Red Cross / Folkehjelp / Kreftforeningen, show me more" — the organisation's chapter network, activities, funding, people.

All three paths converge on the same data model: a **chapter view** that shows what the chapter does, who's behind it, what's happening there, and how to engage.

### Four engagement pathways

Every chapter-related view should, where relevant, support four asks:

1. **Gi tid** — volunteer (deep-link to the organisation's own signup flow with chapter pre-selected if possible)
2. **Gi penger** — donate (Vipps, Grasrotandelen with the chapter's org number pre-filled, Spleis campaigns, the organisation's fast-giver signup)
3. **Bli medlem** — become a member of that specific organisation
4. **Ta et standpunkt** — campaign action / sign petition / participate in advocacy (for organisations whose mission includes advocacy: Amnesty, Naturvernforbundet, Natur og Ungdom, Solidaritetsungdom, etc.)

The fourth pathway is new relative to the original Red Cross framing; it surfaced as a structural requirement during the Norsk Folkehjelp framework-validation work (`norskfolkehjelp-activity-indicator-matrix.md`).

### Supporting flows for non-primary personas

Each of these is a small, dedicated path — not a rewrite of the main flow:

- **Crisis band** (Åse) — persistent component on every page, sector-wide helplines
- **Meld feil** (Magnus, Inger) — "this looks wrong, flag it" path on chapter detail views, routed to the relevant organisation
- **For bedrifter** (Henrik) — a short dedicated page routing corporate partnership asks to the right organisation, with regional/activity context
- **For ungdom / age filters** (Sara) — activity filters and age labels on activity cards
- **Om appen** (Dev, Ola) — meta-transparency page with data sources, GitHub repo, API attribution, per-organisation scrape provenance
- **Compare organisations** (Tone, Jonas) — side-by-side view of two or more NGOs on activities, funding, coverage, scale
- **Coverage-gap explorer** (Signe, Arne, Ola) — humanitarian-need indicators overlaid with organisational presence across the sector

---

## Scope

**Scope for v1 is deliberately left open.** We'll decide once we've built enough of the core to see what's feasible and what adds the most value.

The **core** that everything else depends on:

1. **Common chapter data model** — `{organisation, geographic unit, org number, coordinates, activities, contacts, funding identifiers}` — normalised from per-NGO scrapes and APIs
2. **Chapter-anchored browsing** — search, filter, map, detail view — covering Red Cross and at least one second organisation (Norsk Folkehjelp as the validation case)
3. **Persistent crisis band** in the app's chrome
4. **Four engagement pathways** on every chapter view (where applicable)
5. **Minimal supporting pages** for tertiary personas (Om appen, For bedrifter, Meld feil)

This core is locked in.

The **extensions** (any of which could be v1 scope or left for later):

1. **Expanded organisation coverage** — N.K.S., Nasjonalforeningen, 4H, Speiderforbundet, Frelsesarmeen, Kirkens Bymisjon, and other Tier A dense-chapter federations from `ngo-landscape.md`
2. **Activity Atlas** — "where in Norway can I do X, regardless of which organisation" — pivot around activities across organisations
3. **Storm mode** — live weather warnings overlaid on chapter map, using met.no + Varsom, surfacing all rescue-capable NGOs in the affected area
4. **Coverage-gap explorer** — Samfunnspuls-style humanitarian-need indicators with cross-organisational overlay
5. **Time-travel** — chapter foundings across the sector over time, scrub through history
6. **Give-local across organisations** — chapter-anchored donation flow routed to the right NGO
7. **Multilingual activity discovery** — expanded language support, primarily for integration-adjacent activities
8. **Sector funding transparency** — visualisation of state grants, private donations, and sector-wide money flow
9. **Tilskuddsmatcher** — aggregates **open grant calls** from directorates (Bufdir, Helsedirektoratet, Kulturdirektoratet, Miljødirektoratet, Norad, IMDi), foundations (Stiftelsen Dam, Gjensidigestiftelsen, Sparebankstiftelsen DNB, Fritt Ord), EU Funding & Tenders Portal (SEDIA API), Interreg, and kommunale calls. Matches each open call to an NGO's activity profile and kommune-level need indicators. Historical benchmarking via `tilskudd.lottstift.no` (typical award size, success rate, recent winners). Serves Lisa (tilskuddsansvarlig) — a role that exists at every Tier A NGO and has no cross-agency aggregator today. **Feasibility research completed** — see `tilskuddsmatcher-data-availability.md`. **Verdict: feasible as v1 MVP.** Key finding: `tilskudd.lottstift.no` (= tilskudd.no) is NOT retrospective-only — it's the official DFØ-administered aggregator of 163 current NGO grant schemes with deadlines, amounts, and eligibility, served as Next.js SSR with full `__NEXT_DATA__` JSON embedded. One scraper delivers ~70–80% of v1 data. EU SEDIA Search has a real public JSON API. Aggregate ~80–90% of NGO-relevant funding volume reachable in ~2 weeks of integration.

We'll reassess scope once the core is running with two organisations.

---

## Stance on what we'll do to build this

A few decisions that shape how "in scope" is defined:

- **Scraping is fully in scope.** We'll scrape whatever we need from NGO public websites, and store it locally if helpful for performance or resilience. Each organisation's scrape is its own module with a graceful-degradation fallback. Cache invalidation and respectful crawl rates are implementation concerns — not scope restrictions.
- **Public information is fair to harvest.** If it's published on a public Norwegian NGO website or registry (Brreg, Lottstift, Innsamlingskontrollen), we can pull it in and display it for its intended purpose — helping people engage with the sector. We use it for that purpose and credit the source.
- **The app is organisation-neutral.** No NGO's branding dominates. Each organisation's content is shown in a consistent app chrome, with the organisation's own logo and identity used where appropriate (e.g. on its chapter cards) but not as the frame. We are a portal, not a reskin.
- **Read-only by default.** We consume public APIs and render public content; we don't write back into any NGO system. Actual signups, donations, and purchases always hand off to the existing organisational systems.

---

## Technical stack

- **Framework**: Next.js (App Router preferred, unless we discover a reason otherwise)
- **UI**: **Digdir Designsystemet** — the shared Norwegian public-sector design foundation — used directly. Per-NGO theming (logos, accent colours, brand touches) layered on top. The Red Cross's `rk-designsystem` is itself built on Digdir Designsystemet, so this is the one level of abstraction up; consistent with every other NGO that doesn't have its own design system.
- **Language**: TypeScript (types generated from each organisation's data schema where available; bespoke schemas for scraped sources)
- **Data fetching**: Next.js server components + fetch. Per-org data is small enough (~100–550 chapters per federation) to cache at build or on a schedule. Client-side filtering on top.
- **Scraping**: Server-side, cached at build or on a schedule. Graceful fallback when a scrape fails.
- **Map library**: TBD. Likely MapLibre GL or Leaflet (both free, no API key required). Tiles from Kartverket where possible.
- **Hosting**: TBD. Vercel or similar static/edge host.

---

## Constraints and realities

A few things shape what's possible:

- **Each organisation's data has a different shape.** Red Cross has an Organizations API (requires subscription key); Norsk Folkehjelp is an HTML scrape; some others have JSON blobs exposed in their finder pages; some are fully HTML. A common chapter schema has to accommodate all.
- **External data sources** (SSB, FHI, met.no, Brreg, etc.) are all free and require no auth. See `data-sources.md` for the full catalog.
- **Scraping is fragile.** Each organisation's markup can change. The app degrades gracefully when a scrape fails, falling back to the last-cached data and flagging staleness.
- **PII handling varies by source.** Red Cross's API has PII-masking flags; other scrape sources expose coordinator names and phone numbers directly. We respect organisation-specific privacy signals and surface contacts only in context.
- **Norwegian first, other languages later.** The UI reads naturally in Norwegian. Multilingual activity discovery is an extension, not the default.
- **Crisis band is non-negotiable.** Built before anything else that renders on screen.

---

## Success criteria

How we know the core is done:

- [ ] **Crisis band** is visible on every page, from the very first commit onward.
- [ ] A visitor without context (Kari) can find a local volunteer opportunity across at least two organisations in under 30 seconds.
- [ ] All active chapters of the covered organisations are represented, with correct names, locations, activities, and leader contacts where the underlying data provides them.
- [ ] Search, filter (by organisation, by district, by activity), and map views all work and agree with each other.
- [ ] Chapter detail views show **scraped** content from the organisation's own site: activities with descriptions, meeting times and places, coordinator names, recent news.
- [ ] Each chapter view offers the relevant engagement pathways (up to four) — with deep-links to the right organisation's systems.
- [ ] **Meld feil** path is available on chapter detail views.
- [ ] **For bedrifter** page exists and routes correctly per organisation.
- [ ] **Om appen** page exists and credits data sources, per-organisation scrape provenance, and the Brreg/Lottstift registries we rely on.
- [ ] Youth-coded activities display age ranges and appropriate signposting regardless of which organisation runs them.
- [ ] The Design System (Digdir Designsystemet) is used consistently — no ad-hoc styles that break the neutral frame.
- [ ] Works on mobile, meets basic accessibility standards (keyboard navigation, screen-reader labels, sufficient contrast).
- [ ] Handles the case where a scrape fails, where an API key is missing, or where an organisation's site is unreachable, without breaking.
- [ ] Reads naturally in Norwegian.

How we know an extension is worth building: it serves at least one primary or tertiary persona in a way the core doesn't, and doesn't dilute the core flow.

---

## Open decisions

Decisions already made (documented throughout this file):

- ✅ Audience: public-facing primary, with secondary and tertiary personas served on dedicated paths
- ✅ Scope for v1: core locked in, extensions open
- ✅ Scraping: deep, fully in scope, store locally if useful
- ✅ Branding: organisation-neutral using Digdir Designsystemet
- ✅ Crisis band: non-negotiable, v0 deliverable
- ✅ Four engagement pathways (volunteer / donate / member / campaign action)
- ✅ Red Cross and Norsk Folkehjelp as the first two organisations (proof of framework generalisation)

Things still to decide:

1. **Public-facing first, or internal-staff first?** The current core scope is public-facing (Kari / Jonas / Amira / Lars / Tone / Ola). An alternative framing makes **Lisa (tilskuddsansvarlig)** the v1 wedge: build the Tilskuddsmatcher extension first, serving the internal staff at every Tier A NGO who already spend real hours on this job with no cross-agency tool. Arguments for Lisa-first: cleaner single-user demand signal, no competition with existing public-facing NGO sites, direct measurable value (applications filed, grants won), **data-availability research confirmed feasibility (2026-04-20) — ~80–90% of NGO-relevant funding volume reachable in ~2 weeks of integration via tilskudd.lottstift.no + EU SEDIA + 10 other machine-readable sources**. Arguments against: internal-staff wedges don't directly build public audience for future public-facing features. The data-gate no longer blocks the decision.
2. **Which additional organisations land in v1** — candidates from the Tier A list in `ngo-landscape.md` (N.K.S., Nasjonalforeningen, Speiderforbundet, 4H, Frelsesarmeen, Kirkens Bymisjon, etc.). Reassess once two-org core is running.
3. ~~**Project name / domain.**~~ **Resolved (2026-04-21):** service name is **Atlas**, launched at **atlas.helpers.no** under the Helpers umbrella (helpers.no). Repo to be renamed to `atlas`. "Atlas" chosen for the Helseatlas-style precedent in Norwegian info-products, neutral cross-feature framing (fits finder + funding + indicators + compare), and short clean subdomain.
4. **Hosting and distribution** — a running site with a URL, a GitHub repo to clone, or both. Likely both eventually; starting with local dev plus GitHub.
5. **Live API vs. mock-first for per-organisation data.** Red Cross's API needs a key. Other orgs are scrape-first. Mock-first gets us moving immediately; swap to live via env vars when ready.
6. **Meld feil backend** — where do flagged errors go per organisation? Email to the chapter? Internal ticket into their system? GitHub issue on our repo? Decide per-organisation when each one's flow is built.
7. **"For bedrifter" contact routing** — which contact at each organisation does the partnerships page route to? Per-organisation config.

None of these block starting.

---

## Non-goals for v1

Explicitly out of scope for the first version:

- Authentication and user accounts (no login)
- Writing back to any NGO system (read-only consumption of public data)
- Handling money ourselves (deep-link to Vipps, Grasrotandelen, Spleis, org-specific flows)
- Replacing any existing NGO website
- Full multilingual UI (Norwegian only; multilingual activity discovery is an extension)
- Competing with organisation-specific authenticated tools (Mitt Røde Kors, Folkehjelpens internal portals, etc.)
- Being a crisis intake tool (we signpost to helplines; we do not triage)
- Being an exhaustive directory of every registered NGO in Norway (Brreg Frivillighetsregisteret is already that; we focus on organisations with a meaningful chapter footprint or public-facing mission where the framework adds value)

These might be in scope for v2 or an extension. They are not in scope for v1.
