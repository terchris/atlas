# Desktop briefing — Samfunnspuls field research

You are the Claude desktop app with the Chrome connector. Your job is to observe the live Samfunnspuls site in a real browser (which Claude Code cannot do — the site is a React / Power BI SPA and server-side fetch returns an empty shell) and record raw field notes for Claude Code to synthesise.

**Read this whole briefing before starting.** The research plan it supports is `research-plan.md` in this same folder. Read that too for context, then come back here for execution.

---

## What you are doing, and what you are *not* doing

Your mission is to **understand what each Samfunnspuls report is, and find the upstream public source behind it**, so that Atlas can later fetch the same data directly from that source (SSB, FHI, Bufdir, Husbanken, a city open-data portal, etc.).

You are explicitly **not** extracting data values from the reports. Samfunnspuls is not a data source for Atlas — it is a reference artefact. Do not read numbers off the dashboards and do not attempt to reconstruct their datasets. If the temptation arises to "capture the value for kommune X so we can verify later", suppress it: the verification happens in Atlas by calling the upstream source, not by copying Samfunnspuls.

What you produce is a **map from each report to its upstream source**, plus enough methodology detail that Atlas knows *which* table, *which* indicator, and *which* definition to request from that source.

## The "Om tallene" block — your primary target

Each report on Samfunnspuls has an expandable **"Om tallene"** section on the right-hand side that contains a standardised block of source metadata. Example, captured from the child-poverty report:

> **Statistikkens navn:** Antall barn og unge under 18 år som tilhører husholdninger med lavinntekt (EU-60)
> **Kilde:** Statistisk sentralbyrå (SSB), statistikkbanktabell 08764
> **Type:** registerdata
> **Telletidspunkt:** 31. desember
> **Innhenting:** fra SSBs åpne API
> **Definisjoner:** [long verbatim definition block]

This single block is **exactly** what the research needs — it names the source, the specific table/dataset id, the update pattern, and the formal definition. Assume this block exists on every report until proven otherwise. Your first and most important task is to open "Om tallene" on every report and copy its fields verbatim.

If a report lacks "Om tallene" (or has it but empty), record that explicitly — "Om tallene present: no" — because that's a gap Atlas will need to handle differently.

## Context (so you know what matters)

**Atlas** is a Norwegian web application being built as an organisation-neutral portal to the Norwegian NGO sector — browse chapters, funding, activities, and humanitarian-need indicators across many NGOs, not just one. One planned extension is a "Coverage-gap explorer" overlaying need indicators on cross-organisational chapter presence. `samfunnspuls.rodekors.no` is the Norwegian Red Cross's own knowledge bank of need indicators; it does for one organisation what Atlas wants to do for the sector.

The research plan's hypothesis: Samfunnspuls is a thin presentation layer over public SSB / FHI / Bufdir / Husbanken data, with at most light transformation. The "Om tallene" pattern already appears to confirm this for the first sampled report. Your observations confirm or overturn it across the rest.

## What is already known — do not re-derive

The homepage exposes four topic areas. Start from them and go deeper, but you do not need to rediscover that these exist:

1. **Population demographics** — residents by age group and gender, nation/county/kommune.
2. **Child poverty & low income** — minors under 18 in low-income households; neighbourhood-level data for Oslo, Stavanger, Bergen, Trondheim.
3. **Housing conditions** — children and youth under 19 in overcrowded housing.
4. **Nursing home residents** — occupancy, national/county/kommune.

The site is reported to be React + Power BI. Confirm or correct that.

## Your job — three observation tasks

Work through them in order. Task 1 is the bulk of the work; task 2 is a sanity check; task 3 is light technical context. Don't stop to interpret or recommend — capture raw observations; Claude Code does the synthesis.

### Task 1 — Report inventory with "Om tallene" capture

Navigate from the homepage to every reachable report page. For each report, record two things: a short description of what it is, and the verbatim "Om tallene" block.

**Description (short):**

- URL of the hosting page
- Report title as displayed
- One-sentence description of the indicator (e.g. "share of children under 18 in low-income households, by kommune") — not the values
- Visualisation types present: map, bar chart, line chart, table, KPI tile
- Geographic granularity offered in selectors: nation / fylke / kommune / bydel / delbydel / grunnkrets
- Time range offered (list the available years, not the values)
- Filters/toggles: age bands, gender, subcategory, etc.

**"Om tallene" verbatim capture:**

Expand the "Om tallene" section and copy the block exactly. Preserve the field labels and the order. The fields you should expect, based on the observed template:

- `Statistikkens navn:` — the formal indicator name
- `Kilde:` — the upstream provider and, crucially, any specific table/dataset id (e.g. "SSB statistikkbanktabell 08764", "FHI Kommunehelsa indikator …")
- `Type:` — registerdata, utvalgsdata, etc.
- `Telletidspunkt:` — reference point in time
- `Innhenting:` — how the data is fetched ("fra SSBs åpne API", etc.)
- `Definisjoner:` — the formal definition of the indicator

Other fields may appear (e.g. `Oppdateringsfrekvens`, `Geografisk nivå`, `Tidsperiode`). Capture whatever is there.

Also capture any **outbound links** inside the block — especially the linked SSB table number (often a clickable link to `www.ssb.no/statbank/table/…`) and the linked "API" word (probably goes to SSB's PxWebAPI landing page).

If the "Om tallene" block is missing, incomplete, or structured differently on any report, flag it — that's an exception worth recording.

Also check `/robots.txt` and `/sitemap.xml` directly and list what they contain.

### Task 2 — Network-traffic sanity check

This is a secondary check, not a primary source of data. Goal: confirm that the `Innhenting: fra SSBs åpne API` claim is true at runtime, and notice if any report pulls from a provider not mentioned in its "Om tallene".

Procedure: open DevTools, pin the Network tab, reload one representative report from each of the four topic areas, and interact with it lightly (change kommune, change year). For each session, record:

- Hosts observed, classified:
  - First-party (`*.rodekors.no`, `*.samfunnspuls.rodekors.no`)
  - Power BI (`*.powerbi.com`, `*.analysis.windows.net`)
  - Microsoft auth (`login.microsoftonline.com`)
  - Public data sources (`*.ssb.no`, `*.fhi.no`, `*.bufdir.no`, `*.husbanken.no`, `*.helsedirektoratet.no`, city open-data portals)
  - Map tiles (`*.kartverket.no`, OpenStreetMap, Mapbox)
  - Analytics / tracking
  - Other
- Whether there are direct calls to `*.ssb.no` / `*.fhi.no` / etc. from the browser, or whether everything goes via Power BI / a first-party proxy.
- If Power BI is in the picture: is it embedded as an iframe (`app.powerbi.com/reportEmbed?…`) or via the Power BI JS SDK? What's the token type (AAD user token, app-owns-data, or public "publish to web" — the last one has URLs starting with `app.powerbi.com/view?r=…` and requires no sign-in)?

Do **not** persist `Authorization: Bearer …` values, embed tokens, or cookies. Note their presence and format, not their contents.

Do **not** dump every request — summarise by host and by pattern.

### Task 3 — Stack and infrastructure notes

Light technical context — one short section is enough.

- Frontend framework (look in `view-source:` for `__NEXT_DATA__`, `data-reactroot`, Svelte markers, etc.)
- Hosting / CDN (response headers: `server`, `x-vercel-*`, `x-azure-*`, `cf-ray`)
- `<html lang="…">` and meta description
- Any obvious CMS signatures (Sanity, Contentful, Strapi, WordPress, headless Drupal, etc.)
- Whether there is a service worker

## How to record your findings

Write a **single file**: `docs/research/samfunnspuls/desktop-field-notes.md`.

Use this top-level structure (copy it verbatim and fill in):

```markdown
# Samfunnspuls — desktop field notes

Captured by: Claude desktop app with Chrome connector
Date: YYYY-MM-DD
Session duration: ~X minutes
Completion: [complete | partial — see §N]

## Report inventory and "Om tallene" captures

[One subsection per report. Template:]

### [Topic area] — [Report title]

- URL: …
- Indicator (one sentence): …
- Visualisations: …
- Geographic granularity: …
- Time range: …
- Filters: …
- Om tallene present: yes | no | partial

**Om tallene (verbatim):**

> Statistikkens navn: …
> Kilde: …
> Type: …
> Telletidspunkt: …
> Innhenting: …
> Definisjoner: …
> [any other fields]

**Outbound links inside Om tallene:**

- [link text] → [URL]

---

[repeat for every report]

## Network-traffic sanity check

### Hosts observed
[classified list, per topic area sample]

### Direct upstream calls
[any `*.ssb.no` / `*.fhi.no` / etc. calls seen from the browser — URL pattern, not contents]

### Power BI pattern
[embed type, token type, direct vs proxied]

## Stack and infrastructure

[frontend stack, hosting, CMS signatures, service worker]

## Notes / anomalies / things that surprised me

[anything that didn't fit above — reports without Om tallene, weird behaviours, caveats the synthesis step should know about]
```

## Scope boundaries — do not do these

- **Do not extract data values from the reports.** Not for "verification", not for "samples", not for any reason. You are mapping reports to sources, not copying data out.
- **Do not call SSB / FHI / Bufdir / Husbanken APIs yourself** to cross-check. That's Claude Code's job, done against upstream sources, with repo context.
- **Do not paraphrase "Om tallene" text.** Copy it verbatim, including the field labels and the Norwegian original. Paraphrased methodology loses the precision that makes it useful.
- **Do not write** `site-map.md`, `data-sources.md`, `methodology.md`, or `atlas-integration.md`. Those are deliverables Claude Code produces from your field notes. Your only output is `desktop-field-notes.md`.
- **Do not crawl off-domain.** Stay on `samfunnspuls.rodekors.no` and whatever it loads in the browser (Power BI, Microsoft auth, map tiles — those you see passively).
- **Do not persist tokens, Authorization headers, or cookies.** Note their presence and format, not their contents.
- **Do not speculate on what Atlas should do with the data.** That's Phase 5 synthesis and needs repo context.
- **Do not rewrite the research plan.** If you disagree, add a note in "Notes / anomalies" and flag it.
- **Raw and complete beats polished and partial.** If you run out of steam, mark the section `[partial]` and move on — Claude Code can loop you back for the gaps.

## When you are done

Save the file. Leave a one-line summary at the bottom: "Ready for Claude Code synthesis" or "Partial — reports X and Y still needed". That's the handoff.
