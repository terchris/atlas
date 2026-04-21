# Atlas

**The Norwegian NGO sector, in one place.**

Atlas is an organisation-neutral information platform that aggregates public data about every large Norwegian NGO — activities, chapters, funding, people, and the humanitarian needs that shape them — so anyone can find what they're looking for without learning how 40 different NGO websites work.

Launched as **atlas.helpers.no**, the first service from [Helpers](https://helpers.no) — helping the helpers (NGOs and volunteers).

---

## What it does

Atlas answers three questions through three entry points:

- **Where near me?** — map-based chapter finder across every large NGO (Red Cross, Norsk Folkehjelp, Sanitetskvinnene, Nasjonalforeningen, 4H, Speiderforbundet, Kirkens Bymisjon, Frelsesarmeen, Redningsselskapet, and more)
- **I want to do / get X** — activity-first discovery (find språkkafé, leksehjelp, besøkstjeneste, Hjelpekorps rollout near you) regardless of which NGO runs it
- **Understand the sector** — funding transparency, coverage-gap explorer, honest-pair comparison of NGO efficiency

Plus a dedicated tool for NGO staff:

- **Tilskuddsmatcher** — cross-agency aggregator of open grant calls from directorates, foundations, and the EU, matched to each NGO's activity profile and kommune-level need signals

And a non-negotiable crisis band surfaces sector-wide helplines (113, 112, 110, Mental Helse 116 123, Kirkens SOS, Kors på halsen, Alarmtelefonen for barn og unge) on every page.

---

## Who it's for

16 personas across three tiers — full detail in [`docs/research/personas.md`](docs/research/personas.md). Primary:

- **Kari** wants to help but doesn't know where → activity-first matching across orgs
- **Jonas** wants to donate transparently → honest NGO comparison
- **Amira** just arrived and needs concrete services → språkkafé, Norsktrening, coordinator contact
- **Lars** worried about family in a storm warning area → who responds, across all rescue-capable orgs
- **Tone** civically engaged, exploring board service → cross-NGO chapter browsing
- **Ola** data-curious — sector explorer

Secondary (internal NGO staff):

- **Lisa** (tilskuddsansvarlig) — finds grant calls that match her org's mission and drafts applications citing real need data
- Inger, Arne, Signe, Mette (chapter/district/national staff)

Plus tertiary: Magnus (active volunteer QC), Henrik (corporate partnerships), Åse (person in crisis — crisis band), Dev (public-data developer), Sara (15-year-old looking for youth activities).

---

## Status

**Research and design phase — not yet implemented.** The repository currently contains working research, data-source verification, and design specs. No code yet.

### What's done

- 14 Norwegian NGOs mapped in depth (4 Tier A with activities + indicator matrix; 8 Tier C with profiles; 2 Tier B-minus with profiles)
- Formal data model ([`docs/research/common-schema.md`](docs/research/common-schema.md))
- Design spec for the cross-org comparison surface ([`docs/research/compare-ngos-spec.md`](docs/research/compare-ngos-spec.md))
- Sector landscape analysis ([`docs/research/ngo-landscape.md`](docs/research/ngo-landscape.md))
- Tilskuddsmatcher feasibility research — verdict: feasible as v1 MVP ([`docs/research/tilskuddsmatcher-data-availability.md`](docs/research/tilskuddsmatcher-data-availability.md))
- Data-source catalogue covering Norwegian public registries, international humanitarian sources, and per-activity need indicators

### What's next

- Business-model decision (foundation grants + state contract + SaaS for internal tools, most likely — see [`docs/research/goal.md`](docs/research/goal.md))
- Public-facing-first vs Lisa-first v1 scoping
- Implementation: Next.js + TypeScript + [Digdir Designsystemet](https://designsystemet.no)

---

## Repository structure

```
./
├── README.md                                — this file
└── docs/
    └── research/
        ├── api-getOrganizations-output-21apr26.json
        │                                    — raw Red Cross Organizations API dump (reference dataset)
        ├── goal.md                          — what we're building, why, for whom
        ├── personas.md                      — 16 personas across 3 tiers
        ├── ngo-landscape.md                 — 35+ NGO sector map
        ├── sector-research.md               — Frivillighetsbarometer + ISF findings
        ├── common-schema.md                 — formal data model
        ├── compare-ngos-spec.md             — Compare-NGOs page design spec
        ├── tilskuddsmatcher-data-availability.md
        │                                    — v1-wedge feasibility verdict
        ├── data-sources.md                  — verified Norwegian sources
        ├── data-sources-international.md    — IFRC/UN/EU/global sources
        ├── barentswatch.md                  — maritime cross-sectoral info system
        ├── forf.md                          — volunteer rescue forum
        │
        ├── <ngo>-activities.md              — activity catalogues (Tier A: Red Cross, Norsk Folkehjelp,
        │                                      Sanitetskvinnene, Nasjonalforeningen)
        ├── <ngo>-activity-indicator-matrix.md
        │                                    — activity → kommune-level need indicator mapping
        ├── <ngo>-profile.md                 — Tier C/B-minus reference profiles
        │                                      (Flyktninghjelpen, SOS-barnebyer, UNICEF-komiteen,
        │                                      Leger Uten Grenser, Redd Barna, CARE Norge,
        │                                      Plan International, Kirkens Nødhjelp, Regnskogfondet,
        │                                      WWF Norge, Bellona, ZERO, Norsk Luftambulanse,
        │                                      Redningsselskapet)
        ├── redcross-*.md                    — Red Cross-specific working material
        │                                      (the reference case the framework was built against)
        └── redcross-organizations-api-schema.json
```

---

## Key decisions on record

- **Organisation-neutral.** No NGO's branding dominates. Per-NGO logos appear on their chapter cards and attribution; shared chrome uses Digdir Designsystemet (neutral Norwegian public-sector design foundation).
- **Read-only.** Atlas consumes public APIs and renders public content. Actual signups, donations, and purchases hand off to each NGO's own systems with context pre-filled.
- **Scraping is in scope** where NGOs don't expose APIs, subject to each source's terms.
- **Four engagement pathways**: Gi tid (volunteer) / Gi penger (donate) / Bli medlem (member) / Ta et standpunkt (campaign action). The fourth is new — for orgs like Amnesty, WWF, Naturvernforbundet, Solidaritetsungdom where advocacy is the primary ask.
- **Crisis band is non-negotiable.** Built before anything else that renders on screen.
- **Norwegian-first.** UI reads naturally in Norwegian. Multilingual activity discovery is an extension for integration-adjacent activities.

---

## Data sources

Atlas is built on public Norwegian and international registries, all free and mostly no-auth:

- **Brreg** (Enhetsregisteret, Frivillighetsregisteret, Regnskapsregisteret) — the org-identity spine
- **Lottstift / tilskudd.lottstift.no** — 163 NGO grant schemes, historical awards + current open calls
- **Innsamlingskontrollen** — verified fundraising transparency
- **SSB** (PxWebApi v2) — demographics, households, income, crime, tourism
- **FHI Folkehelsestatistikk** — health indicators, Folkehelseprofil, Oppvekstprofil (replaced Kommunehelsa in Nov 2025)
- **Bufdir** — child poverty + welfare monitors
- **IMDi** — refugee settlement
- **DSB Kommuneundersøkelsen** — municipal preparedness
- **Kartverket / Geonorge** — geography, boundaries, tilfluktsrom
- **met.no + Frost + NVE HydAPI + Varsom** — weather, hydrology, hazards
- **IFRC GO, UNHCR, OCHA HDX, WHO GHO, ReliefWeb, GDACS, Carbon Brief, Meta-Gallup** — international humanitarian context

Full catalogue with verification dates and auth requirements: [`docs/research/data-sources.md`](docs/research/data-sources.md) and [`docs/research/data-sources-international.md`](docs/research/data-sources-international.md).

---

## Helpers

Atlas is the first service from **Helpers** (helpers.no), whose purpose is helping the helpers — NGOs and the volunteers who work for them. Additional Helpers services will follow the `<service>.helpers.no` pattern.

---

## Contributing

The project is in research/design phase. The research docs in `docs/research/` are working material — open to corrections, additions, and framework pressure-tests. If you spot a factual error in any org profile, activity catalogue, or indicator mapping, open an issue or PR.

When implementation starts, contribution guidelines and code-style will go here.

---

## Licence

TBD. Intent is an open licence for the code and CC BY (or equivalent) for the data research docs — consistent with the public-good positioning and open-source framing in `docs/research/goal.md`.
