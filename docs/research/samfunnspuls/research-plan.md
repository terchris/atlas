# Samfunnspuls — research plan

## Why this matters

`samfunnspuls.rodekors.no` is the Norwegian Red Cross's public knowledge bank of humanitarian-need indicators at national, county, and municipal (and in parts, neighbourhood) level. Four topic areas are visible from the home page:

1. **Population demographics** — residents by age group and gender, nation/county/kommune
2. **Child poverty & low income** — minors under 18 in low-income households, with neighbourhood-level data for Oslo, Stavanger, Bergen, Trondheim
3. **Housing conditions** — children and youth under 19 in overcrowded housing
4. **Nursing home residents** — occupancy figures, national/county/kommune

For Atlas this is doubly valuable:

- **As a data source** — the indicators feed the Coverage-gap explorer and, potentially, the Tilskuddsmatcher's need-signal layer (`goal.md` §4, §Extensions, `tilskuddsmatcher-data-availability.md`).
- **As a reference artefact** — Samfunnspuls already answers, for one organisation, a question Atlas asks across the sector: *where is the humanitarian need greatest, and what should we focus on there?* Understanding its structure, indicator choices, visual language, and sources tells us what an organisation-neutral equivalent should look like and where it can go further (cross-organisation overlay, finer granularity, grant matching, etc.).

The "hook" hypothesis the rest of this plan tests: Samfunnspuls is a thin presentation layer on top of public SSB / FHI / Kartverket / Husbanken / Bufdir data that any consumer can also reach directly. If confirmed, Atlas can replicate the same indicators with the same authority at zero licensing cost, and go beyond by combining them with cross-organisational chapter coverage.

## What we want to come out with

By the end of this research we should have produced four artefacts in this folder:

1. **`site-map.md`** — every page, section, and indicator the site exposes, with URLs and a short description of what each shows.
2. **`data-sources.md`** — for each indicator: the underlying public dataset (SSB table id, FHI indicator id, Bufdir/Husbanken source, etc.), update cadence, geographic granularity, licence, and how to fetch it programmatically (API, CSV, JSON-stat).
3. **`methodology.md`** — indicator definitions, aggregation rules (e.g. "low income" = EU60 after transfers?), any disclosed caveats, and any modelling Samfunnspuls does on top of the raw sources (imputation, smoothing, small-cell suppression, neighbourhood-level synthesis).
4. **`atlas-integration.md`** — a recommendation: which indicators we adopt as-is, which we replace with a finer-grained equivalent, which we combine with cross-organisational presence, and what the Coverage-gap explorer MVP would render. This is the one that feeds back into `goal.md` and `data-sources.md`.

The research plan itself is document zero; these four are the deliverables.

## Status (as of 2026-04-21)

Execution is split between the Claude desktop app (Chrome connector, for browser-side work on the React + Power BI SPA) and Claude Code (for upstream-source verification and synthesis). See `desktop-briefing.md` for the desktop side.

| Phase | Owner | Status | Notes |
|---|---|---|---|
| 1 — Surface inventory | Desktop | **Done (partial)** | 37 reports across 6 topic areas captured in `desktop-field-notes.md`. Granularity / time-range / filter selectors only sampled on 2 reports (Power BI iframe is cross-origin). |
| 2 — Under-the-hood data layer | Desktop | **Done** | No direct browser calls to SSB/FHI/etc. — everything flows through a first-party `/api/powerbi/reportembeddata/{reportId}` proxy that mints app-owns-data embed tokens. ReportId → dataset-name map captured, cross-references "Kilde" citations. |
| 3 — Source tracing | Desktop (citations) + Claude Code (upstream verification) | **Desktop done; Claude Code pending** | All 37 reports carry verbatim "Om tallene" blocks naming provider + table id. 20 cite specific SSB statistikkbanktabell numbers. Cross-verification against SSB PxWebAPI not yet done. |
| 4 — Methodology deconstruction | Desktop (capture) + Claude Code (validate) | **Desktop done; Claude Code pending** | Indicator definitions captured verbatim per report. Claude Code still needs to verify definitions match canonical SSB/Udir/IMDi/NAV source wording. |
| 5 — Atlas integration recommendation | Claude Code | **Pending** | Waits on 3–4. |

Headline finding from the desktop phase: **Working assumption that FHI / Bufdir / Husbanken / city open-data portals would feature as sources is overturned.** Virtually every indicator cites SSB, with a small tail of Udir, IMDi, NAV, and two Red Cross internal sources. This narrows `data-sources.md` considerably and shapes `atlas-integration.md` — the Coverage-gap explorer's data layer is mostly an SSB PxWebAPI consumer, not a multi-provider aggregator.

Known gaps to close in synthesis:

- Per-report granularity / time-range / filter selectors for 35 of 37 reports (may be answerable by inspecting the Power BI dataset schemas rather than the UI).
- One report has stale "Neste oppdatering: vår 2023" metadata — check whether the underlying SSB table has in fact been updated since.
- One dataset-name / cited-table-id mismatch flagged on a social-assistance report — resolve by reading the actual SSB tables.

## How we will analyse the site

Work proceeds in five phases. Each phase ends with a concrete artefact or decision, not just notes.

### Phase 1 — Surface inventory (site map)

Goal: list every reachable page and every distinct indicator.

- Crawl the site starting from `https://samfunnspuls.rodekors.no/` following only same-host links, depth-unlimited, recording URL, page title, and any data-visualisation type present (map, bar, pie, table).
- Parallel: fetch `/robots.txt`, `/sitemap.xml`, and any linked `om-`, `om-oss`, `metode`, `kilder`, `api`, `data` pages directly.
- For each indicator page, capture: indicator name, unit, geographic granularity offered (nation / county / kommune / delbydel), time range, and any source citation in the footer or tooltip.

Deliverable: **`site-map.md`** with one row per indicator and one section per topic area.

### Phase 2 — Under-the-hood inspection (data layer)

Goal: identify whether Samfunnspuls ships data via API, static JSON, or server-rendered HTML; and whether those payloads expose source attribution.

- Inspect the production HTML and any linked JS bundles for: `fetch(` calls, `__NEXT_DATA__` blobs (if Next.js), `window.__INITIAL_STATE__` (if a SPA), JSON-stat URLs, or embedded CSV.
- Check DevTools-equivalent network traffic on a representative indicator page (via headless fetch of page + traced sub-resources) for XHR calls to `/api/…`, `ssb.no/api/v0/…`, `statistikkbanken.fhi.no/…`, Kartverket tile servers, or mapbox/maplibre vector tiles.
- Check response headers for caching behaviour and CDN provider (tells us if we could reasonably mirror or if we must re-derive from source).
- Record every external host the site loads from — that's the upper bound on external data dependencies.

Deliverable: short **`site-technical-notes.md`** (may be merged into `data-sources.md` if thin) covering stack, data transport, and external hosts.

### Phase 3 — Source tracing (upstream data)

Goal: map every Samfunnspuls indicator back to the canonical public dataset so Atlas can fetch it directly without Red Cross branding in the chain.

For each indicator from Phase 1, trace to source. Expected sources based on the topic areas visible:

- Population by age/gender × kommune → **SSB table 07459** (befolkning etter kjønn og alder, kommuner) via PxWebAPI v2 JSON-stat.
- Low-income children under 18 × kommune → **SSB table 12599 / 13183** (lavinntekt barn, EU60) or **Bufdir kommunedata** (oppvekstprofil).
- Overcrowded housing under 19 → **SSB table 12578 / 13203** (trangboddhet) or **Husbanken** boligsosial statistikk.
- Nursing home residents × kommune → **KOSTRA / SSB table 04905** (beboere i institusjon) or **Helsedirektoratet** Kommunalt pasient- og brukerregister aggregat.
- Neighbourhood-level (delbydel) child-poverty data for the four largest cities → city-published open data (Oslo: **bydelsfakta.oslo.kommune.no**, Bergen: **Statistikkbanken Bergen**, Stavanger: **ssb-regional** + kommune-leverte rutenett, Trondheim: **trondheim.kommune.no åpne data**).

For each, record: SSB/FHI table id, API endpoint, last-updated cadence, geographic resolution offered, and any small-cell suppression rule. Cross-check actual values on a sample kommune between Samfunnspuls and the traced source — if they match, the source is confirmed; if they differ, Samfunnspuls is doing something on top and Phase 4 has to explain it.

Deliverable: **`data-sources.md`**, modelled on the existing `docs/research/data-sources.md` row layout.

### Phase 4 — Methodology deconstruction

Goal: explain any transformation between upstream source and displayed indicator.

- Check every page for a "Metode" / "Om dataene" / "Kilder" link. Capture verbatim.
- Verify indicator definitions: which income measure (EU60 vs EU50, before/after housing costs); which age ranges (under 18 vs under 19 — note the homepage uses both); which overcrowding definition (SSB's < 20 m² + bedrooms rule vs a looser one).
- Where neighbourhood-level values appear for Oslo/Stavanger/Bergen/Trondheim but SSB only publishes at kommune: determine whether the numbers come from city open-data portals, from Bufdir's delbydel releases, or from Samfunnspuls's own modelling (unlikely given Red Cross's stance on methodological transparency — but has to be verified).
- Check for caveats: small-cell suppression thresholds (SSB typically suppresses n<5), reference year, confidence intervals.

Deliverable: **`methodology.md`**, one section per indicator.

### Phase 5 — Atlas integration recommendation

Goal: decide how Atlas uses this.

Synthesise phases 1–4 into a single decision document answering:

- **Adopt vs re-derive** — for each indicator, does Atlas fetch from Samfunnspuls (cheap, adds a Red Cross-branded dependency), or re-derive from the upstream SSB/FHI/Bufdir/city sources (more work, organisation-neutral, richer metadata)? Default expected answer: re-derive; justify exceptions.
- **Indicator coverage** — are Samfunnspuls's four topics the right four for Atlas's Coverage-gap explorer, or does Atlas want a different set (e.g. add: loneliness proxies, mental-health primary-care contact rates, refugee-settlement counts, unemployment youth, digital-exclusion indicators)?
- **Granularity** — Samfunnspuls goes to kommune for most, delbydel for four cities. For Atlas, the chapter-anchored data model expects kommune primarily; we note where sub-kommune granularity exists so we can match it with dense-chapter NGOs (e.g. Oslo bydelslag of Røde Kors, Kirkens Bymisjon stasjoner).
- **Cross-organisational layer** — the thing Samfunnspuls *cannot* do is overlay multiple organisations' chapter presence on the need indicators. Document what the Atlas Coverage-gap explorer renders that Samfunnspuls does not.
- **Attribution plan** — whatever we use, how we credit.

Deliverable: **`atlas-integration.md`**, with explicit feed-back items for `goal.md` (Extension 4) and `data-sources.md`.

## What is out of scope for this research

- Scraping Samfunnspuls's frontend for display in Atlas. If we want the indicators we get them from source — cleaner attribution, no coupling to someone else's branded layer.
- Reverse-engineering any internal Red Cross analytics or non-public dashboards linked from the site.
- Judgement calls on indicator *choice* (what "need" means for the NGO sector) — that's a follow-up once we know what Samfunnspuls covers and we can see the gaps.

## Working assumptions to test

These will either be confirmed or overturned in phases 2–4. Flag any that flip.

1. ✅ **Confirmed (partially).** Samfunnspuls is a thin presentation layer over SSB — with a small tail of Udir / IMDi / NAV and two internal Red Cross sources. The multi-provider framing (FHI / Bufdir / Husbanken / city portals) was wrong; it's SSB-dominant.
2. 🔶 **Pending Claude Code upstream verification.** All 37 reports' "Om tallene" blocks state `Innhenting: fra SSBs åpne API`, which implies open/no-auth access. Claude Code needs to confirm by actually calling the cited tables.
3. ❌ **Overturned.** Delbydel data for the four largest cities does not appear as a distinct upstream source — the homepage claim about neighbourhood-level coverage may refer to SSB's own grunnkretsdata, or may be a homepage-copy artefact not reflected in the actual reports. Needs confirmation against the captured report list.
4. 🔶 **Partially addressed.** "Om tallene" blocks include `Telletidspunkt` but not always an explicit cadence. One report has a stale 2023 cadence note. Claude Code to verify against SSB's published release calendar.
5. 🔶 **Pending Phase 5.** The SSB-heavy finding makes this easier (one provider, one API surface) but narrower than planned. The "reproduce + extend" framing still holds; the "extend with additional indicators" question becomes more interesting given Samfunnspuls covers only SSB-derivable things.

## Timeline and order of execution

Sequential, because each phase's questions are sharper once the previous phase's answers are in:

1. Phase 1 (site map) — quick, mostly automated crawl.
2. Phase 2 (data layer) — parallel with Phase 1's tail end.
3. Phase 3 (source tracing) — the biggest chunk; one indicator at a time, sample-value cross-check on each.
4. Phase 4 (methodology) — relies on Phase 3 traces.
5. Phase 5 (Atlas integration) — writes the recommendation and pushes the feedback into `goal.md` and `data-sources.md`.

No blockers to starting Phase 1 immediately.
