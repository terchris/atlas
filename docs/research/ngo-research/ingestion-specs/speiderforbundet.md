# Ingestion spec — Norges speiderforbund

**Status · proven 2026-10-04.** speiding.no is a single-page app with no sitemap, but the
organisation's group finder lives on a separate, server-rendered site, **blispeider.no**
("Bli speider"). It lists every group with coordinates, and each group's page gives its address,
the age branches it runs and its krets. Reconciled with the registry: 482 chapters, 266 confirmed by
both sources, every crawled group linked to its krets.

## Sources and discovery

| | |
|---|---|
| Registry side | Brreg `enheter` whose name contains `SPEIDER`, **excluding `KFUK` / `KFUM`**; strong when the name contains `SPEIDERGRUPPE`, `SPEIDERGRUPPA` or `NSF` — `reference-code/src/sources/brreg-chapters.ts` |
| Group index | `https://blispeider.no/grupper` — every group as JSON in `<script type="application/json" id="grupper-map-data">`: `id`, `title`, `url`, `lat`, `lng`, `locality`, `korpsTitle` (332 groups, 53 in a korps) |
| Group page | `https://blispeider.no/grupper/<slug>` |
| Krets page | `https://blispeider.no/kretser/<slug>` (23 kretser, linked from the groups) |
| speiding.no | the app's content API is on `admin.speiding.no` (`/api/nullsju/nodes`, `/api/nullsju/query`); not needed — the group finder holds what the research needs |
| robots.txt | blispeider.no: disallows only `/cpresources/`, `/vendor/`, `/.env`, `/cache/` (2026-10-04) |

## Politeness

1 request per second; 333 pages, ~6 minutes. User-Agent with the contact address.

## What to read → Atlas columns

| Source | Rule | Atlas column |
|---|---|---|
| index JSON `lat`, `lng` | as published | `dim_chapter.location` (exact) |
| group page `h1` | as published | `dim_chapter.name` |
| the first `<p>` with a `<br>` and a postcode (by the map pin) | `street<br>postcode PLACE` | `dim_chapter.address` (meeting place) |
| "Vi er en del av": `a[href*="/kretser/"]` | the krets, as the group states it | parent (`parent_method = page_link`) |
| "Våre enheter": each `h3` + the `<p>` after it | a unit and its school years / ages | `fact_chapter_activities` |
| "Kontaktperson" | a named person | **not read** — private path if ever |

## Rules and traps

- **KFUK-KFUM-speiderne is a different national organisation.** A plain `SPEIDER` name match returns
  565 units, of which 169 are theirs. Exclude `KFUK` and `KFUM`.
- **Kretser are not geographic** (*Asker og Bærum*, *Vestmarka*, *Ryvarden*, *Tele-Busk*): never infer a
  group's krets from its kommune. The group's own page states it — use that (`PAGE_LINK`): the
  crawler writes `parents.page.json` (group page → krets page) and the hierarchy step links the group
  to whichever row carries that krets page, which after reconciliation is the registry's row.
- **Units have local names; the branch is national.** *Beverkolonien*, *Roverlaget Snorkel*,
  *Småspeiderflokk* → Bever, Småspeider, Stifinner, Vandrer, Rover, and *Speidertropp* (the older
  troop, school years 5–10). A leaders' unit (*Leder flokk*) is not a service and is dropped.
- **Registry names carry the organisation:** `AGDER KRETS AV NORGES SPEIDERFORBUND`,
  `1. HAUGERUD SPEIDERGRUPPE AV NORGES SPEIDERFORBUND`, `VESTFOLD KRETS AV N S F …`. After stripping the
  organisation's name, also strip the connecting `AV` (and `N S F`), and treat `SPEIDERGRUPPE` /
  `GRUPPE` as the same unit word (`1. KOLBOTN GRUPPE` / `1. Kolbotn speidergruppe`). This raised
  confirmed matches from 224 to 266.
- **Group slugs carry Norwegian letters** (`/grupper/åsane-…`): store URLs percent-encoded
  (`format: uri`); fetch with the URL as published.

## Activities (R3, measured 2026-10-04)

The age branches each group publishes: Rover 140 groups, Bever 109, Småspeider 89, Stifinner 33,
Vandrer 31, Speidertropp 14 — 416 links on 218 groups. blispeider.no's front page states the
pattern for all: most groups meet weekly and go on monthly trips; membership and uniform about
2 000 kr a year, trips 1 000–8 000 kr.

## Personal data

- The contact person on each group page is not read.

## Acceptance targets

From `acceptance-targets.csv` (measured run 2026-10-04):

| chapters | local / regional / related | both / registry-only / site-only | with kommune | coords | regional links | defs | links |
|---:|---|---|---:|---:|---:|---:|---:|
| 482 | 452 / 24 / 6 | 266 / 127 / 89 | 359 | 332 | 332 | 6 | 416 |

127 registry-only rows: groups without a page on blispeider.no, or under a name the rules do not
join. 89 site-only groups: not found in the registry under any name the rules join.

## Reference implementation

`reference-code/src/sources/speiderforbundet-groups.ts`, then `reconcile-chapters.ts
speiderforbundet`, `upgrade-hierarchy.ts` (`PAGE_LINK`), `classify-units.ts`,
`build-activity-catalogue.ts speiderforbundet --force`. It runs as-is (`npm run speiderforbundet`).

## Open gaps

- 127 registry-only and 89 site-only rows: some are the same group under two names — a closer look at
  the pairs left per kommune would join more.
- The group's own "Om oss" text is not stored (it runs into the contact section on the page).
