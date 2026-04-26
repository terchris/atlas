---
sidebar_position: 1
---

# About Atlas

**The Norwegian NGO sector, in one place.**

Atlas is an organisation-neutral information platform that aggregates public data about every large Norwegian NGO — activities, chapters, funding, people, and the humanitarian needs that shape them. It's the place to land when you want to find a way to contribute, find a service you need, or understand the sector.

Launched as **atlas.helpers.no**, the first service from [Helpers](https://helpers.no), whose purpose is helping the helpers — NGOs and the volunteers who work for them.

---

## What Atlas does

Atlas answers three questions through three entry points:

1. **Where near me?** A map-based chapter finder across every large NGO (Red Cross, Norsk Folkehjelp, Sanitetskvinnene, Nasjonalforeningen, 4H, Speiderforbundet, Kirkens Bymisjon, Frelsesarmeen, Redningsselskapet, and more).
2. **I want to do or get X.** Activity-first discovery — find språkkafé, leksehjelp, besøkstjeneste, Hjelpekorps near you, regardless of which NGO runs it.
3. **Understand the sector.** Funding transparency, coverage-gap explorer, honest-pair comparison of NGO efficiency.

Plus a dedicated tool for NGO staff:

- **Tilskuddsmatcher** — a cross-agency aggregator of open grant calls from directorates, foundations, and the EU, matched to each NGO's activity profile and kommune-level need signals.

A non-negotiable **crisis band** surfaces sector-wide helplines (113, 112, 110, Mental Helse 116 123, Kirkens SOS, Kors på halsen, Alarmtelefonen for barn og unge) on every page.

---

## What Atlas is for

Four goals, in priority order.

### 1. Help people contribute — across organisations

Most people who want to volunteer, donate, or join an organisation arrive without a preferred NGO in mind. Atlas helps them go from *"I want to help"* to *"here's where I start"* — matched to their interests, location, and time commitment, regardless of which organisation runs the activity.

### 2. Be safe for people in acute distress

Anyone in crisis must immediately see the right emergency or helpline numbers. The crisis band is built before anything else that renders on screen — it is part of the app's chrome, not a footer item, and the helplines are sector-wide (no single NGO owns them).

### 3. Solve real UX problems the current Norwegian NGO digital presence doesn't

Today, someone who wants to help has to visit dozens of org websites, each with different language, structure, and engagement models. Atlas fills the gap with:

- A single chapter map across organisations in your kommune.
- Activity filters that work across organisations (find every "Norwegian language practice" group near you, not just one NGO's).
- Side-by-side funding-transparency comparisons.
- Humanitarian-need indicators overlaid with NGO presence at kommune level.
- Coverage-gap visualisation — where need is high and no organisation is currently active.

### 4. Make the sector legible

Norwegian civil society is worth 4.7% of mainland GDP and 142 000 volunteer årsverk. The activity data, funding flows, chapter networks, and board compositions are mostly public but scattered. Bringing them into one coherent structure is valuable as a public good on its own — for journalists, researchers, policy planners, and engaged citizens — and is what makes Atlas reusable beyond the engagement flow.

The [NGO landscape](../sector/ngo-landscape.md) and [sector research](../sector/sector-research.md) pages cover the structural picture; the data documentation (in progress) covers the technical surface.

---

## Who Atlas is for

The full audience map is on the [Personas](./personas.md) page. In short:

- **Public-facing primary**: Kari (wants to help), Jonas (wants to donate transparently), Amira (just arrived, needs services), Lars (worried about family in a storm-warning area), Tone (browsing for board service), Ola (data-curious observer).
- **Internal NGO staff** (secondary): chapter leaders, district coordinators, national planners, emergency coordinators, Lisa (tilskuddsansvarlig — the Tilskuddsmatcher user).
- **Tertiary**: existing volunteers, corporate-partnership leads, people in acute crisis, developers exploring civil-society data, youth.

All audiences are served. The primary public-facing personas set the default flow; the others get dedicated paths.

---

## How users engage

Every chapter view supports up to four engagement pathways, where applicable:

1. **Gi tid** — volunteer (deep-link to the organisation's own signup flow, with chapter pre-selected where possible).
2. **Gi penger** — donate (Vipps, Grasrotandelen with the chapter's org number pre-filled, the organisation's fast-giver signup).
3. **Bli medlem** — become a member of that specific organisation.
4. **Ta et standpunkt** — campaign action / sign petition / participate in advocacy (for organisations whose mission includes advocacy: Amnesty, WWF, Naturvernforbundet, Solidaritetsungdom, etc.).

Atlas is **read-only**: it consumes public APIs and renders public content; it does not write back into any NGO system. Actual signups, donations, and purchases hand off to the existing organisational systems with context pre-filled.

---

## Scope

The **core** that everything else depends on:

1. A common chapter data model across NGOs (organisation, geographic unit, org number, coordinates, activities, contacts, funding identifiers).
2. Chapter-anchored browsing — search, filter, map, detail view — covering Red Cross and Norsk Folkehjelp at minimum.
3. The persistent crisis band.
4. The four engagement pathways.
5. Minimal supporting pages for tertiary personas (Om appen, For bedrifter, Meld feil).

The **extensions** include expanded NGO coverage (N.K.S., Nasjonalforeningen, 4H, Speiderforbundet, Frelsesarmeen, Kirkens Bymisjon, and more), the Activity Atlas (cross-NGO activity discovery), Storm mode (live weather warnings overlaid on the chapter map), the Coverage-gap explorer, time-travel through chapter history, give-local across organisations, multilingual activity discovery, sector funding transparency visualisations, and Tilskuddsmatcher.

---

## How Atlas works (principles)

- **Organisation-neutral.** No NGO's branding dominates. Atlas uses [Digdir Designsystemet](https://designsystemet.no), the neutral Norwegian public-sector design foundation. Per-NGO logos appear on chapter cards and attribution; the shared chrome stays neutral.
- **Read-only.** Atlas consumes public APIs and renders public content. Donations, signups, and purchases hand off to each NGO's own systems.
- **Public information is fair to harvest.** If it's published on a Norwegian NGO website or in a public registry (Brreg, Lottstift, Innsamlingskontrollen, SSB, FHI, Bufdir, IMDi, etc.), Atlas pulls it in for its intended purpose — helping people engage with the sector — and credits the source.
- **Scraping is in scope.** Where NGOs don't expose APIs, Atlas scrapes public pages, subject to each source's terms.
- **Crisis band is non-negotiable.** Built before anything else that renders on screen; sector-wide, not branded.
- **Norwegian-first.** UI reads naturally in Norwegian; multilingual activity discovery is an extension for integration-adjacent activities.

---

## Technical foundation

Atlas is built on:

- **Frontend**: Next.js (App Router), TypeScript, [Digdir Designsystemet](https://designsystemet.no), [MapLibre GL](https://maplibre.org).
- **Data platform**: TypeScript ingestion modules + dbt + PostgreSQL. The [`atlas-data-repo/`](https://github.com/terchris/atlas/tree/main/atlas-data-repo) folder holds the data side, intended to split into a separate `atlas-data` repo as it matures.
- **Hosting**: the [Urbalurba Infrastructure Stack](https://uis.sovereignsky.no) (UIS) — a sovereign Kubernetes platform.
- **Data sources**: SSB, FHI, Brreg, Bufdir, IMDi, NAV, Lottstift, Innsamlingskontrollen, Kartverket, met.no, plus per-NGO APIs and scrapes.

The frontend reads `marts.*` Postgres tables via a read-only role; the data pipeline owns `raw.*` and `marts.*` and never touches frontend code. This boundary is the hard contract between the two halves of Atlas.

---

## Where Atlas fits in Helpers

Atlas is the first service from **Helpers** ([helpers.no](https://helpers.no)), whose purpose is helping the helpers — NGOs and the volunteers who work for them. Additional Helpers services will follow the `<service>.helpers.no` pattern.

---

## Read more

- [Personas](./personas.md) — the 16 audiences Atlas serves.
- [The Norwegian NGO landscape](../sector/ngo-landscape.md) — sector map and structural-fit tiers.
- [Sector research](../sector/sector-research.md) — the evidence base behind why Atlas exists.
- [How to read a row](../getting-started/reading-a-row.md) — first-time orientation for the data platform.
