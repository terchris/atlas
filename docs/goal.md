# Goal

This document describes what we're building, why, and for whom. It sits alongside:

- `personas.md` — who we're building for (15 personas across three tiers)
- `ideas.md` — the option space (~40 concepts across 10 themes)
- `data-sources.md` and `data-sources-funding.md` — what we have to work with

It's a living document. Some things are settled; others are deliberately open and will be tightened as we make decisions.

---

## What this project is

A Red Cross-branded web application that exercises two publicly available Norwegian Red Cross assets:

1. **The Red Cross Organizations API** (`https://api.redcross.no/nrx/v1/organizations`) — the structured catalog of every Red Cross organizational unit in Norway: National Office, 19 districts, ~400 local chapters, with coordinates, activities, contacts, founding dates, org numbers, and hierarchy.
2. **The Red Cross Design System** (`rk-designsystem`, built on Digdir's Designsystemet, 65 React components, MIT-licensed).

It will be a **Next.js web app** that displays data from the API and other public Red Cross sources, using the Design System, with complementary public data layered in where it adds real value.

The project is being built by someone inside Red Cross, so it's a **legitimate first-party build** using Red Cross branding — not an unofficial third-party tool.

---

## Who we're building for

The audience is captured in detail in `personas.md`. In summary:

**Primary personas — public-facing** (drive the default flow)
1. **Kari** — wants to volunteer, doesn't know the jargon
2. **Jonas** — wants to donate transparently, with local choice
3. **Amira** — recently arrived, needs concrete activity details
4. **Lars** — worried about family in a weather-warning area
5. **Tone** — potential board member, wants to browse and compare
6. **Ola** — data-curious observer (journalist, researcher, citizen)

**Secondary personas — internal / staff** (served, but not the default target)

7. **Inger** — chapter leader, uses the app to see herself from outside
8. **Arne** — district coordinator, future planning-tool user
9. **Signe** — national office planner (Samfunnspuls audience)
10. **Mette** — emergency response coordinator

**Tertiary personas — niche audiences we also serve** (dedicated paths)

11. **Magnus** — existing active volunteer, quality-control ally
12. **Henrik** — corporate partnership lead
13. **Åse** — person in acute crisis (drives the non-negotiable crisis band)
14. **Dev** — developer exploring the Organizations API
15. **Sara** — 15-year-old interested in youth activities

**All 15 personas are people we plan to serve.** The priority ordering determines where screen real estate goes first and what "default flow" means — not who gets turned away.

---

## What we want to accomplish

Four goals, in priority order:

### 1. Serve prospective volunteers, donors, and members well
The primary public audience (Kari, Jonas, Amira, Lars, Tone, Ola) arrives wanting to connect with Red Cross somehow. The app helps them go from *"I want to do something"* to *"here is where I start"*, anchored on their local chapter.

### 2. Be safe for people in acute distress
Åse is why the crisis band exists. Any page of the app, at any time, must visibly surface the right emergency and helpline numbers — 113, 112, 110, Mental Helse (116 123), Kors på halsen (800 33 321), Røde Kors-telefonen (815 55 201). This is not optional and not a footer item. It's a persistent piece of the app's chrome.

### 3. Solve real UX problems the current Red Cross digital presence doesn't
The chapter finder on mittrodekors.no is a flat 400-item dropdown with test data mixed in. The lokalforeninger page on rodekors.no has no map, no search, and no activity filter. Our app should visibly improve on these.

### 4. Show the API and Design System used well together
The Organizations API is rich but mostly invisible to the public. The Design System has 65 well-built components. A coherent, polished app that uses both in a real context is valuable on its own — and is what makes the work reusable.

---

## The primary user experience

The app is **chapter-anchored and public-facing**. Someone arrives wanting to connect with Red Cross somehow. They find their local chapter — by location, by activity, or by browsing the map. They see what that chapter does, who's behind it, what's happening there right now. From there they can take the next step: volunteer, become a member, give, or simply learn more.

The app doesn't process signups, donations, or purchases itself — it hands off to the existing Red Cross systems (mittrodekors.no, rodekors.no/bli-medlem, Vipps 2272, Grasrotandelen, nettbutikk.rodekors.no) with as much context pre-filled as possible.

### Three engagement pathways

Every chapter-related view should, where relevant, support all three public-facing asks:

1. **Gi tid** — volunteer (deep-link to mittrodekors.no innmelding with chapter pre-selected if possible)
2. **Gi penger** — donate (Vipps, Grasrotandelen with the chapter's org number pre-filled, Spleis campaigns)
3. **Bli medlem** — become a member

Optional fourth: **kjøp og vær forberedt** — the preparedness webshop angle, if that becomes relevant.

### Supporting flows for non-primary personas

Each of these is a small, dedicated path — not a rewrite of the main flow:

- **Crisis band** (Åse) — persistent component on every page
- **Meld feil** (Magnus, Inger) — "this looks wrong, flag it" path on chapter detail views
- **For bedrifter** (Henrik) — a short dedicated page routing to Red Cross's partnership contacts, with regional chapter context
- **For ungdom / age filters** (Sara) — activity filters and age labels on activity cards; Kors på halsen linked as a resource
- **Om appen** (Dev, Ola) — meta-transparency page with data sources, GitHub repo, API attribution

---

## Scope

**Scope for v1 is deliberately left open.** We'll decide once we've built enough of the core to see what's feasible and what adds the most value.

The **core** that everything else depends on:

1. A chapter-anchored browsing experience — search, filter, map, detail view — built on the Organizations API plus scraped content from rodekors.no chapter pages.
2. A persistent crisis band in the app's chrome.
3. The three engagement pathways (Gi tid, Gi penger, Bli medlem) on every chapter view.
4. A minimal set of supporting pages for tertiary personas (Om appen, For bedrifter, Meld feil).

This core is locked in.

The **extensions** (any of which could be v1 scope or left for later):

1. **Activity Atlas** — "where in Norway can I do X" — pivot around activities rather than geography
2. **Storm mode** — live weather warnings overlaid on chapter map, met.no + Varsom
3. **Coverage-gap explorer** — Samfunnspuls-style humanitarian-need indicators with chapter overlay
4. **Time-travel** — 160-year timeline of chapter foundings, scrub through history
5. **Give-local** — chapter-anchored donation flow prominently offered
6. **Multilingual activity discovery** — expanded language support for Amira-adjacent personas

We'll reassess scope once the core is running.

---

## Stance on what we'll do to build this

A few decisions that shape how "in scope" is defined:

- **Scraping is fully in scope.** We'll scrape whatever we need from rodekors.no and other public Red Cross pages, and store it locally if helpful for performance or resilience. This is how we surface the activity-level detail, coordinator contacts, photos, and news that make chapter pages useful. Cache invalidation and respectful crawl rates are implementation concerns — not scope restrictions.
- **Public information is fair to harvest.** If it's published on a public Red Cross website, we can pull it in and display it for its intended purpose — helping people connect with Red Cross.
- **The app is Red Cross-branded.** Built first-party, using Red Cross logos, the Design System, and brand colors. Not a third-party tool pretending to be Red Cross.
- **Read-only by default.** We consume public APIs and render public content; we don't write back into Red Cross systems. Actual signups, donations, and purchases always hand off to the existing systems.

---

## Technical stack

- **Framework**: Next.js (App Router preferred, unless we discover a reason otherwise)
- **UI**: `rk-designsystem` + `@digdir/designsystemet-css` + `rk-design-tokens` + `@navikt/aksel-icons`
- **Language**: TypeScript (types generated from the OpenAPI schema in `organizations-api-schema.json`)
- **Data fetching**: Next.js server components + fetch. API response is small enough (~400 branches) to load once and cache; client-side filtering on top of that.
- **Scraping**: Server-side, cached at build or on a schedule. Graceful fallback to API-only when a scrape fails.
- **Map library**: TBD. Likely MapLibre GL or Leaflet (both free, no API key required, unlike Mapbox). Tiles from Kartverket where possible.
- **Hosting**: TBD. Vercel or similar static/edge host.

---

## Constraints and realities

A few things shape what's possible:

- **The Organizations API requires a subscription key.** We'll build against mock data shaped like the real response schema until the key is available. Swap to live data via an env var.
- **External data sources** (SSB, FHI, met.no, Brreg, etc.) are all free and require no auth. See `data-sources.md` for the full catalog.
- **Scraping is fragile.** rodekors.no's markup can change. The app degrades gracefully when a scrape fails, falling back to API-only data.
- **PII in the API.** `branchContacts` includes real names, emails, phone numbers of volunteers. We respect the schema's privacy-masking flags and surface contacts in context (a volunteer coordinator's phone number on a chapter page is appropriate; a bulk directory export is not).
- **Norwegian first, other languages later.** The UI reads naturally in Norwegian. Multilingual activity discovery is an extension, not the default.
- **Crisis band is non-negotiable.** Built before anything else that renders on screen.

---

## Success criteria

How we know the core is done:

- [ ] **Crisis band** is visible on every page, from the very first commit onward.
- [ ] A visitor without context (Kari) can find their nearest chapter in under 30 seconds.
- [ ] All active chapters are represented, with correct names, locations, activities, and leader contacts where the API provides them.
- [ ] Search, filter (by district and activity), and map views all work and agree with each other.
- [ ] Chapter detail views show **scraped** content from rodekors.no: activities with descriptions, meeting times and places, coordinator names, recent news.
- [ ] Each chapter view offers the three engagement pathways — Gi tid, Gi penger, Bli medlem — with deep-links to existing Red Cross systems.
- [ ] **Meld feil** path is available on chapter detail views.
- [ ] **For bedrifter** page exists and routes correctly.
- [ ] **Om appen** page exists and credits data sources.
- [ ] Youth-coded activities display age ranges and appropriate signposting.
- [ ] The Design System is used consistently — no ad-hoc styles that break the brand.
- [ ] Works on mobile, meets basic accessibility standards (keyboard navigation, screen-reader labels, sufficient contrast).
- [ ] Handles the case where the API is unreachable, the subscription key is missing, or a scrape fails, without breaking.
- [ ] Reads naturally in Norwegian.

How we know a given extension is worth building: it serves at least one primary or tertiary persona in a way the core doesn't, and doesn't dilute the core flow.

---

## Open decisions

Decisions already made (documented throughout this file):

- ✅ Audience: public-facing primary, with secondary and tertiary personas served on dedicated paths
- ✅ Scope for v1: core locked in, extensions open
- ✅ Scraping: deep, fully in scope, store locally if useful
- ✅ Branding: first-party Red Cross
- ✅ Crisis band: non-negotiable, v0 deliverable

Things still to decide:

1. **Which extensions land in v1** — reassess once the core is running.
2. **Hosting and distribution** — a running site with a URL, a GitHub repo to clone, or both. Likely both eventually; starting with local dev plus GitHub.
3. **Live API vs. mock-first** — the Organizations API requires a subscription key (free, request-based). Mock-first gets us moving immediately; swap to live via env var when the key arrives.
4. **Meld feil backend** — where do flagged errors go? Email to a chapter? Internal Red Cross ticket? GitHub issue on the repo? Decide when Magnus's flow is built.
5. **"For bedrifter" contact details** — which team or email at Red Cross should the partnerships page route to? Needs a decision before that page ships.

None of these block starting.

---

## Non-goals for v1

Explicitly out of scope for the first version:

- Authentication and user accounts (no login)
- Writing back to Red Cross systems (read-only consumption of public APIs)
- Handling money ourselves (deep-link to Vipps, Grasrotandelen, Spleis)
- Replacing any existing rodekors.no page
- Full multilingual UI (Norwegian only; multilingual activity discovery is an extension)
- Competing with Mitt Røde Kors or other authenticated internal tools
- Being a crisis intake tool (we signpost to helplines; we do not triage)

These might be in scope for v2 or an extension. They are not in scope for v1.
