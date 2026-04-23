# Investigate: NGO supply data — model, ingestion, supply-vs-demand query

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide how Atlas should ingest, store, and query "what each NGO offers, where" — turning a heterogeneous mix of NGO data sources (live APIs, HTML scrapes, JSON blobs, no per-chapter data at all) into queryable `marts.*` tables that can be joined with the demand-side indicators we already ingest, so the **Coverage-gap explorer** (Signe / Arne / Ola in [`personas.md`](../../../research/personas.md)) can answer "where is the need high and the supply absent?".

**Last Updated**: 2026-04-23

**Origin**: The Norwegian Red Cross Organizations API dump at [`docs/research/api-getOrganizations-output-21apr26.json`](../../../research/api-getOrganizations-output-21apr26.json) (1.0 MB, 392 branches, 50 unique global activities) was originally fetched for Red Cross-specific UI. It now serves as the **best-case reference shape** for one of ~11+ NGOs Atlas needs to cover. The product-side data model already exists at [`docs/research/common-schema.md`](../../../research/common-schema.md). This investigation closes the gap between that conceptual model and Atlas's `marts.*` data layer — the place where supply (NGO presence) finally meets demand (the 19 already-ingested sources).

---

## Questions to Answer

1. What does the Red Cross API actually contain — and what does its **shape** tell us about the *best case* across all NGOs?
2. How does NGO supply data fit into Atlas's existing `raw.* → marts.*` pipeline? Which new schemas/tables are needed and how do they relate to the seven already in `marts`?
3. How do we model the activity taxonomy when each NGO has a different one (Red Cross 50 canonical IDs, Norsk Folkehjelp 6 CMS bins, Nasjonalforeningen no per-chapter activity at all)? What's the minimum viable cross-NGO "service category" that lets Kari search "språkkafé near me" across all orgs — and how does that align with the **ICNPO** standard already used by Brreg's Frivillighetsregister and SSB?
4. How do we resolve `branchLocation.municipality` (free text Norwegian name) to canonical `kommune_nr` — given mergers, dialects, historical names, and shared place names?
5. What's the right ingestion pattern when each NGO publishes data differently? One source folder per NGO (matching the existing `ingest/src/sources/<id>/` pattern), or a generic "NGO scraper" framework?
6. How does the "supply-vs-demand" coverage-gap query actually look in SQL — and what marts tables make it efficient to compute?
7. What goes in v1 vs deferred? With 392 branches × 50 activity types × ~50 NGOs eventually, what's the smallest useful slice?

---

## Current State

### What Atlas already has (demand side)

After PLAN-001/002/003 of the code-label investigation, `marts.*` holds:

- `fact_kommune_indicators` — long-format facts joined to `dim_kommune`/`dim_fylke` (135 698 rows from 19 sources covering child poverty, overcrowded housing, bullying, household income, education levels, family composition, …).
- `dim_kommune`, `dim_fylke` — geographic conformed dimensions.
- 17 `indicators__*` source-passthroughs.
- 5 `ref_*` reference seeds for code-label decoding.

**No NGO supply data is ingested today.** The pipeline is asymmetric: rich demand-side, empty supply-side.

### What the product side has already decided

[`docs/research/common-schema.md`](../../../research/common-schema.md) (draft 2026-04-20) already proposes a five-entity product model: `Organisation → Chapter → Activity (canonical or local) → Institution (optional) → Indicator`, plus `Pathway` for engagement. Key decisions baked in there:

- **`orgnr` is the universal primary key** for Organisation. Same format across Brreg, Lottstift, Grasrotandelen, Regnskapsregisteret.
- **`kommunenummer` is the universal join key** between Chapter and Indicator.
- **Four `chapter_data_shape` modes**: `api_canonical` (Red Cross), `cms_bins` (Norsk Folkehjelp, N.K.S.), `programme_only` (Nasjonalforeningen), `no_structure` (Tier C donor-only orgs).
- **Tier-based NGO classification** in [`ngo-landscape.md`](../../../research/ngo-landscape.md) (~160 lines). Tier A = dense-chapter federations (Atlas's primary subjects); Tiers B/C = thinner footprints.
- **Profile substitutes Chapter for Tier C orgs** (NRC, Kirkens Nødhjelp, etc.) — they have no kommune-level chapters; their "supply" is national or international.

This investigation **does not re-litigate the product model**. It addresses the missing layer: how that conceptual model becomes rows in Atlas's Postgres `marts.*` tables, and what an end-to-end supply-vs-demand query looks like.

### What the Red Cross API gives us (the best case)

Probed from [`docs/research/api-getOrganizations-output-21apr26.json`](../../../research/api-getOrganizations-output-21apr26.json) on 2026-04-23:

- **Top level**: `{ data: { branches: [...] }, metadata: { totalCount, timestamp } }` — 392 branches.
- **Branch-type distribution**: 362 `Lokalforening` (local branches with activities), 18 `Distrikt` (regional umbrellas), 11 `Ukjent` (unknown — pre-2024-merger remnants?), 1 `Nasjonalkontoret` (HQ).
- **Status**: 380 active, 12 terminated. The terminated ones still appear in the export with the same shape — useful for time-travel.
- **Each branch carries**:
  - **Identity**: `branchId` (`L098`-style), `branchNumber` (7-digit Red Cross internal), `organizationNumber` (9-digit Brreg).
  - **Geography**: `municipality` (text), `county` (text), `region` (text — pre-2024 fylker-region for some branches), `postalAddress`, sometimes `streetAddress`. **No `kommune_nr`**.
  - **Hierarchy**: `branchParent` pointing to the District the local is part of.
  - **Comms**: phone, email, web (per branch).
  - **Contacts**: list of `{role, firstName, lastName, isVolunteer, isMember, memberNumber}` — typically 2–6 per branch.
  - **Activities**: list of `{globalActivityName, localActivityName}` — typically 5–7 per active local; **50 distinct globalActivityName values** observed across all 392.
- **Activities by footprint** (top 15 of 50 globalActivityName values):

  | globalActivityName | branches |
  |---|---:|
  | Hjelpekorps | 298 |
  | Besøkstjeneste | 278 |
  | Møteplasser | 231 |
  | Beredskap | 182 |
  | Besøksvenn med hund | 126 |
  | Opplæring | 117 |
  | Barnas Røde Kors | 113 |
  | Administrative oppgaver | 94 |
  | RØFF (Røde Kors Friluftsliv og Førstehjelp) | 77 |
  | Norsktrening | 75 |
  | Flyktningguide | 71 |
  | Røde Kors Ungdom (øvrige aktiviteter) | 61 |
  | Leksehjelp | 61 |
  | Treffpunkt - Røde Kors Ungdom | 53 |
  | Praktiske tjenester | 45 |

  Note: this is the **authoritative globalActivityName list** that [`redcross-activities.md`](../../../research/redcross-activities.md) lacked — that file pattern-matched on local names because the older dump didn't include `globalActivityName`. The current dump fixes this.

**Average active local: 6.3 activities. Branches with 0 activities: 23** (mostly Distrikt + terminated locals).

### Why this matters for "all NGOs"

Red Cross is the **best case Atlas will see**. Nine of the eleven other NGOs profiled do not publish anything close to this:

| NGO type | Data shape | Atlas implication |
|---|---|---|
| Red Cross | Live API, canonical activity IDs, per-branch activity list | Direct ingest — cleanest case |
| Norsk Folkehjelp | HTML scrape, 6 CMS bins per chapter | One-off scraper per page; activity list is bin-typed |
| N.K.S. | HTML scrape, 7-bin CMS + institution list | Per-chapter scrape + institution sub-array |
| Nasjonalforeningen | HTML scrape, programme-only at HQ level | No per-chapter activities; programmes attach to org + chapter_type |
| Frelsesarmeen, Kirkens Bymisjon | HTML scrape with institution focus | Heavy institution model (sykehjem, hospice, kvinnehelsehus) |
| Tier C donor-orgs (NRC, Kirkens Nødhjelp, Caritas, Redd Barna, …) | No chapters at all | Only Profile entity; no kommune-level rows |

The data model has to **honestly accommodate this asymmetry**. Atlas can't pretend every NGO has Red Cross-shaped data — but it should produce a unified `marts.*` view that lets the Coverage-gap explorer ask "for the activity category 'språkkafé', which kommuner have at least one provider, regardless of which NGO?".

---

## The new questions Atlas's data layer needs to answer

### A. Where in `marts.*` does NGO supply live?

The existing `marts.*` tables are demand-side: indicators per kommune. NGO supply needs its own subschema. Options for naming:

1. **Same `marts` schema, new prefix**: `marts.dim_ngo`, `marts.dim_chapter`, `marts.fact_chapter_activities`. Symmetric with existing `dim_kommune`/`fact_kommune_indicators`. Joins are one-schema.
2. **New schema `marts_supply` (or `supply`)**: separates concerns; the indicator pipeline and the NGO pipeline can rev independently. Cross-schema joins are still cheap in Postgres.
3. **Keep raw NGO data in `raw.ngo_*` and roll up to a single `marts.fact_kommune_supply` (long-format like `fact_kommune_indicators`)**: every NGO becomes a `source_id` in the same fact table. Maximises symmetry with the demand side.

Option 1 plus a long-format `fact_kommune_supply` (a hybrid) likely best — see Recommendation.

### B. How do we represent the activity taxonomy across orgs?

The hardest question. The `chapter_data_shape` enum from `common-schema.md` says: each NGO owns its own taxonomy, of one of four shapes. We need *both* a cross-org **service category** (Atlas-curated, UI-ready, granular enough for Kari to filter "språkkafé") *and* alignment with the **ICNPO standard** already used across Norwegian NGO statistics, so Atlas can roll up to national figures and report comparably to SSB's satellite accounts.

**ICNPO** — the International Classification of Nonprofit Organisations (12 main groups, 30 subgroups, last revised 2009). Used by:
- **[Brønnøysund Frivillighetsregister](https://www.brreg.no/en/associations-2/register-a-club-or-an-association/registration-in-the-register-of-non-profit-organisations/available-categories-of-the-activity/)** — every registered NGO declares up to 3 ICNPO codes, ranked by activity scope. Available via the open Brreg API.
- **[SSB Satellittregnskap for ideelle og frivillige organisasjoner](https://www.ssb.no/nasjonalregnskap-og-konjunkturer/nasjonalregnskap/statistikk/satellittregnskap-for-ideelle-og-frivillige-organisasjoner)** — sector-wide GDP/employment statistics rolled up by ICNPO group.
- **[Frivillighet Norge](https://www.frivillighetnorge.no/)** — the umbrella body uses the same scheme in its Frivillighetsbarometer and member statistics.
- See **[research note from Samfunnsforskning](https://www.samfunnsforskning.no/sivilsamfunn/publikasjoner/notater/bruk-av-icnpo-kategorier-i-frivillighetsregisteret.pdf)** on actual usage and pitfalls in Frivillighetsregister.

ICNPO's strength is what it is — the official Norwegian NGO classification. Its limit is granularity: at *Group 4 (Social Services) → Subgroup 4.1 Social Services* it bundles "elderly visiting", "homework help", "language practice" and "thrift shop" into one bucket. That's too coarse to power UI filters like Kari's "språkkafé near me". Conversely a fully Atlas-invented service taxonomy can't aggregate to national figures.

The right answer is **both**:

1. **Org level (`dim_ngo`)** — store the NGO's official ICNPO codes (up to 3, ranked) directly from Brreg. No Atlas invention; this is the canonical sector classification. Lets Atlas reproduce SSB-style sector splits and compare to Frivillighet Norge's Barometer.
2. **Service level (`ref_atlas_service_category`)** — Atlas-curated ~20-row vocabulary for UI-ready filtering (`language_practice`, `homework_help`, `elderly_visiting`, `youth_drop_in`, `rescue_corps`, `crisis_helpline`, `migrant_mentoring`, `thrift_shop`, …). Each row carries an `icnpo_subgroup_code` column tagging it to its parent ICNPO subgroup, so any service-category query can also be rolled up to ICNPO for sector reporting.
3. **Crosswalk (`crosswalk_activity_to_category`)** — many-to-many map from each NGO's local activity name (Red Cross's 50 globalActivityNames, Norsk Folkehjelp's 6 CMS bins, etc.) to one or more Atlas service categories. Curated by us, evolves as we add NGOs.

Same refresh-script pattern as PLAN-001's `ref_*` seeds — the curated rows live in CSV, refreshable from upstream when ICNPO codes change at Brreg.

Rejected alternatives:
- **ICNPO-only** — too coarse for the UI Kari needs.
- **Atlas-only, no ICNPO** — orphans Atlas from Norwegian NGO statistics; can't compare to SSB or Frivillighet Norge.
- **Tag-based, no fixed taxonomy** — Kari can't filter; no way to say "this kommune has zero of category X".

A second standard worth carrying alongside (lower priority): the **17 UN Sustainable Development Goals**. Many NGOs report against SDGs publicly. SDGs are not a sector classification (they're outcomes), but tagging each service category with relevant SDG goal numbers (e.g. `language_practice` → SDG 4 Education, SDG 10 Reduced Inequalities) gives an extra rollup axis for funders and journalists. Optional column on `ref_atlas_service_category`; populate when obvious.

### C. How do we resolve `municipality` text → `kommune_nr`?

The Red Cross API gives `"municipality": "Modum"` not `"kommune_nr": "3316"`. Across 267 unique municipality strings in the 392 branches, the matching against `dim_kommune` faces:

- **Mergers** (most painful): "Tynset" still appears in old Brreg subunits even though some kommuner have merged. Pre-2020 names → post-2020 codes need a mapping.
- **Name collisions**: "Os" exists in two places historically (Os in Innlandet; Os in Hordaland → merged into Bjørnafjorden 2020). String match alone is wrong.
- **Diacritics and dialects**: "Sør-Aurdal" vs "Sor-Aurdal", "Ålesund" vs "Aalesund", "Bø" vs "Bo".
- **Articles and suffixes**: "Karmøy" vs "Karmøy kommune".

Options:

1. **Per-source name → kommune_nr mapping seed** (`marts.crosswalk_redcross_municipality_to_kommune`). Per-NGO crosswalks because each may use different upstream taxonomies (Red Cross uses post-reform names mostly; Norsk Folkehjelp may differ).
2. **Generic name → kommune_nr seed** (`marts.crosswalk_kommune_name`) with one row per (alternative_name, kommune_nr) pair, populated from SSB Klass historical names. One canonical resolver per ingest.
3. **Postal-code lookup via Bring/PostNord** — `branchLocation.postalAddress.postalCode` ("3340") deterministically resolves to a kommune via Posten's postnummer database. **Likely the cleanest path** — postal codes don't have the merger ambiguity that names do, and the postnummer→kommune mapping is a maintained dataset.
4. **Combine 2 + 3** — postal-code lookup as primary path; name match as fallback for branches without a postal address.

Recommendation: option 4. Postal code is the deterministic primary; SSB Klass historical-names crosswalk catches the rest. Both materialise as `ref_*` or `crosswalk_*` seeds, refreshed quarterly.

### D. What's the ingestion pattern per NGO?

The existing TypeScript ingest in [`atlas-data-repo/ingest/src/sources/`](../../../../atlas-data-repo/ingest/src/sources/) has 19 source folders, one per data source. Same pattern fits here:

- `ingest/src/sources/redcross-branches/` — fetches the Red Cross API, writes `raw.redcross_branches` and `raw.redcross_branch_activities`.
- `ingest/src/sources/folkehjelp-chapters/` — HTML scrape of folkehjelp.no chapter list, writes `raw.folkehjelp_chapters` and `raw.folkehjelp_chapter_activities`.
- `ingest/src/sources/nks-chapters/` — HTML scrape, similar.
- … one folder per Tier A NGO.

**Per-NGO `raw.*` tables** preserve upstream verbatim (the whole point of the raw layer). The dbt models in `models/supply/` (or under `models/indicators/` depending on subschema decision) normalise the four `chapter_data_shape` modes into one shared `marts.dim_chapter` + `marts.fact_chapter_activities` shape.

This **mirrors the existing pattern** — see [`docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md`](../completed/INVESTIGATE-data-journey-pattern.md) for the worked end-to-end pattern from a single source.

Open question: **how many NGOs in v1?** Red Cross alone proves the framework. Adding Norsk Folkehjelp tests the cms_bins shape. Adding Nasjonalforeningen tests programme_only. The sequence is settled in [`goal.md`](../../../research/goal.md): Red Cross + Norsk Folkehjelp first as proof of generalisation; then add Tier A federations one at a time.

### E. What does the supply-vs-demand query look like?

After this work, the Coverage-gap explorer can answer:

> *"Show me kommuner where the share of children in low-income households is in the top quartile, and where there is no NGO offering homework help (`leksehjelp` category) within the kommune."*

In SQL roughly:

```sql
with high_need as (
  select kommune_nr
  from marts.fact_kommune_indicators
  where source_id = 'bufdir-barnefattigdom'   -- once ingested
    and year = 2024
    and contents_code = 'BARNEFATTIGDOM_RATE'
    and value > (select percentile_cont(0.75) within group (order by value) from ...)
),
supply_for_category as (
  select distinct cha.kommune_nr
  from marts.fact_chapter_activities fca
  join marts.dim_chapter cha using (chapter_id)
  join marts.crosswalk_activity_to_category xw on xw.local_activity_name = fca.local_activity_name
  where xw.category_code = 'leksehjelp'
)
select hn.kommune_nr, k.kommune_name, k.fylke_name
from high_need hn
join marts.dim_kommune k using (kommune_nr)
left join supply_for_category s using (kommune_nr)
where s.kommune_nr is null;
```

That query is the **product**. Everything in this investigation exists to make it cheap to write and fast to run.

---

## Options summarised

For each of the five questions A–E above:

| Question | Recommended option |
|---|---|
| A. Schema location | One `marts.*` schema; long-format `fact_kommune_supply` mirrors `fact_kommune_indicators` (both have `source_id`, `kommune_nr`, payload). Plus per-NGO indicator-style models `supply__redcross_branches`, etc. |
| B. Activity taxonomy | Hybrid: ICNPO codes on `dim_ngo` (from Brreg, no curation) + Atlas-curated `marts.ref_atlas_service_category` seed (≤25 rows, each tagged with its parent ICNPO subgroup) + `marts.crosswalk_activity_to_category`. Optional SDG goal tags on the category seed. |
| C. Geo resolution | Postal-code primary (Posten postnummer dataset → `marts.dim_postnummer`), historical-name fallback (SSB Klass alt-names → `marts.crosswalk_kommune_name`). |
| D. Ingestion | One source folder per NGO under `ingest/src/sources/<ngo-id>-chapters/`, mirroring the existing 19-source pattern. Each writes its own `raw.*` tables; dbt normalises into shared marts. |
| E. Coverage-gap query | Build the SQL pattern around `fact_kommune_indicators` ⋈ `fact_kommune_supply` ⋈ category crosswalk. Materialise the top N "gap" queries as marts if performance requires (deferred to v1.5+). |

---

## Recommendation — phased plan

Table names follow the convention in [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) (see also [INVESTIGATE-reference-tables-convention.md](INVESTIGATE-reference-tables-convention.md) for the rationale).

Three concrete plans, one per Tier A NGO milestone, plus one for the cross-cutting infra.

### PLAN-A — Supply-side foundation (cross-cutting)

The plumbing every NGO ingest will need. Build once, reuse N times.

- `marts.dim_ngo` — one row per NGO with orgnr, name, brand_name, website_url, tier, chapter_data_shape, has_chapters, primary_focus, **`icnpo_code_1` / `icnpo_code_2` / `icnpo_code_3`** (the up-to-three codes Frivillighetsregisteret carries, ranked). Initially populated from a hand-curated seed (10–15 NGOs from `ngo-landscape.md`); the ICNPO codes come from a one-off `ingest:brreg-frivillighet` lookup against the Brreg open API.
- `marts.ref_brreg_icnpo` — the 12 ICNPO main groups + 30 subgroups, scraped once from the [Brreg category page](https://www.brreg.no/en/associations-2/register-a-club-or-an-association/registration-in-the-register-of-non-profit-organisations/available-categories-of-the-activity/). `code`, `parent_code` (null for main groups), `label_no`, `label_en`. Stable seed — last revised 2009.
- `marts.dim_postnummer` (or `marts.dim_postnummer_kommune`) — one row per (postnummer, kommune_nr) pair. Source: Posten's open postnummer dataset (free, downloadable). Refresh quarterly.
- `marts.crosswalk_kommune_name` — historical and alternative names → kommune_nr. Source: SSB Klass 131 with alt-names enabled.
- `marts.ref_atlas_service_category` — Atlas's curated cross-org category vocabulary (~20 rows, like the PLAN-001 ref_* seeds). Columns: `code`, `label_no`, `label_en`, `description`, **`icnpo_subgroup_code`** (FK to `ref_brreg_icnpo`), `sdg_goals` (text array, optional, e.g. `{4,10}` for language practice).

Estimated ~4–6h.

### PLAN-B — First NGO ingest: Red Cross

The clean case. Validates the foundation against real data.

- `ingest/src/sources/redcross-branches/index.ts` — fetches the Red Cross Organizations API, writes `raw.redcross_branches` and `raw.redcross_branch_activities`. (Today the data lives as a static JSON dump; the script normalises it. When/if API key access is granted, the script polls live.)
- `marts.supply__redcross_branches` — per-source dbt passthrough (mirrors `indicators__*`).
- `marts.crosswalk_activity_to_category` — populated for the 50 Red Cross globalActivityName values.
- The `fact_kommune_supply` mart unioning supply__* models (just one source for now).
- Smoke test: count of (kommune_nr, category_code) pairs surfaced by Red Cross alone.

Estimated ~3–4h.

### PLAN-C — Second NGO ingest: Norsk Folkehjelp (cms_bins shape)

Validates that the `chapter_data_shape` abstraction works with a non-API source.

- `ingest/src/sources/folkehjelp-chapters/index.ts` — HTML scrape of folkehjelp.no/lokallag.
- `raw.folkehjelp_chapters` and `raw.folkehjelp_chapter_activities` (one per CMS bin).
- `marts.supply__folkehjelp_chapters` and the union add to `fact_kommune_supply`.
- Crosswalk additions for the 6 CMS bins.

Estimated ~4–5h (HTML scraping is bumpier than API fetching).

### PLAN-D — Coverage-gap mart materialisation

Once supply has at least two NGOs, build a `mart_coverage_gap` that pre-computes "high-need + low-supply" combinations for the top N (need-indicator × service-category) pairs the Coverage-gap explorer surfaces.

Defer until PLAN-B and PLAN-C are live.

---

## Open Questions

1. **Does the Red Cross API require a key for live polls?** The dump suggests yes (subscription key needed; see `redcross-activities.md` open question). For v1 we can ingest from the static JSON; live polling is a separate access conversation.
2. **Where do `dim_ngo` rows come from initially?** Hand-curated seed (~15 NGOs from `ngo-landscape.md` Tier A list) is the obvious start. Brreg's `brreg-frivillighetsregisteret` ingest could automate this later, but adds complexity.
3. **How granular should the service-category vocabulary be?** Twenty categories cover the obvious axes (rescue, visiting, youth, education, integration, …). More than ~30 starts to overlap with org-specific activity lists. Aim for 20–25 in v1, with each category tagged to its parent ICNPO subgroup so cross-org rollups can be expressed in either the Atlas vocabulary or the standard.
4. **Should `fact_kommune_supply` be long-format like `fact_kommune_indicators`?** Yes — same shape lets the same UI controls (kommune picker, source filter) work for both. The `value` column for supply is "presence count" (number of branches in this kommune offering this category).
5. **Do we model the institution sub-array (N.K.S., Frelsesarmeen, Kirkens Bymisjon)?** Defer to a third per-NGO ingest. The shape is in `common-schema.md` already; just don't build it in v1.
6. **How do we surface terminated/historical chapters?** The Red Cross dump includes 12 terminated branches with creationDate + terminationDate. Useful for the time-travel extension; for v1 supply queries, filter to `is_active = true`.
7. **Does `dim_postnummer` exist anywhere as a Norwegian standard?** Posten publishes a CSV; some open mirrors exist. Lottstift has a partial. SSB Klass 488 covers postnummer too. Pick one in PLAN-A.

---

## Next Steps

- [ ] **PLAN-A-supply-foundation.md** — `dim_ngo`, `dim_postnummer`, `crosswalk_kommune_name`, `ref_atlas_service_category` seeds + the empty `fact_kommune_supply` shell.
- [ ] **PLAN-B-redcross-ingest.md** — first NGO source ingest + crosswalk for 50 Red Cross activities, populating `fact_kommune_supply`.
- [ ] **PLAN-C-folkehjelp-ingest.md** — second NGO ingest validating the cms_bins shape.
- [ ] **PLAN-D-coverage-gap-mart.md** — pre-computed supply×demand gap mart for the explorer UI. Deferred until B+C exist.

Estimated total effort across A–C: ~12–16h focused. PLAN-D depends on what's expensive in queries against the union table.

### Not in scope for this investigation

- Tier C profile ingest (NRC, Kirkens Nødhjelp, etc.) — they have no chapters; their data is the `Profile` entity from `common-schema.md`, lives in `marts.dim_ngo` payload columns, no `fact_kommune_supply` rows.
- Funding data (Lottstift, Innsamlingskontrollen) — separate investigation, separate fact table.
- Tilskuddsmatcher — its own investigation, [`tilskuddsmatcher-data-availability.md`](../../../research/tilskuddsmatcher-data-availability.md) covers the data side.
- Live API access for Red Cross — dump-based ingest is sufficient for v1; access conversation is a separate workstream.

---

## Files this investigation will produce (when promoted to PLANs)

New tables (across PLAN-A through PLAN-D):
- `raw.redcross_branches`, `raw.redcross_branch_activities`
- `raw.folkehjelp_chapters`, `raw.folkehjelp_chapter_activities`
- `marts.dim_ngo` (with up-to-3 ICNPO codes per NGO from Brreg), `marts.dim_postnummer`
- `marts.ref_brreg_icnpo` (seed — 12 main groups + 30 subgroups, scraped once)
- `marts.ref_atlas_service_category` (seed — Atlas-curated, each row tagged with its ICNPO subgroup + optional SDG goal numbers)
- `marts.crosswalk_kommune_name` (seed)
- `marts.crosswalk_activity_to_category` (seed)
- `marts.supply__redcross_branches`, `marts.supply__folkehjelp_chapters`
- `marts.fact_kommune_supply` (union of supply__*)
- `marts.mart_coverage_gap` (deferred)

New ingest folders:
- `atlas-data-repo/ingest/src/sources/redcross-branches/`
- `atlas-data-repo/ingest/src/sources/folkehjelp-chapters/`

Documentation impact (PLAN-A):
- Extend [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) with the new vocabulary: `service_category`, `chapter_id`, `branch_type`, `is_active`, `globalActivityName`, etc.
- The auto-generated [`docs/stack/erd.md`](../../../stack/erd.md) will pick up the new entities and edges automatically (no manual ERD work).

---

## Cross-references

- **ICNPO standard**:
  - [Brreg's available activity categories](https://www.brreg.no/en/associations-2/register-a-club-or-an-association/registration-in-the-register-of-non-profit-organisations/available-categories-of-the-activity/) — the canonical list of ICNPO codes used in Frivillighetsregisteret.
  - [SSB Satellittregnskap for ideelle og frivillige organisasjoner](https://www.ssb.no/nasjonalregnskap-og-konjunkturer/nasjonalregnskap/statistikk/satellittregnskap-for-ideelle-og-frivillige-organisasjoner) — the national NGO statistics rolled up by ICNPO group.
  - [Samfunnsforskning research note](https://www.samfunnsforskning.no/sivilsamfunn/publikasjoner/notater/bruk-av-icnpo-kategorier-i-frivillighetsregisteret.pdf) on actual usage patterns and edge cases in Frivillighetsregister.
  - [Frivillighet Norge](https://www.frivillighetnorge.no/) — uses ICNPO in its sector reports and Frivillighetsbarometer.
- **SDGs**: [UN Sustainable Development Goals](https://sdgs.un.org/goals) — 17 goals, optional rollup axis on `ref_atlas_service_category`.
- [`docs/research/api-getOrganizations-output-21apr26.json`](../../../research/api-getOrganizations-output-21apr26.json) — the Red Cross dump probed for this investigation.
- [`docs/research/common-schema.md`](../../../research/common-schema.md) — the product-side data model this investigation translates into Atlas marts.
- [`docs/research/goal.md`](../../../research/goal.md) — Atlas's product framing; "where in Norway can I do X regardless of which org" is the Activity Atlas extension this work enables.
- [`docs/research/ngo-landscape.md`](../../../research/ngo-landscape.md) — the Tier A/B/C classification driving the per-NGO ingestion sequence.
- [`docs/research/redcross-activities.md`](../../../research/redcross-activities.md) — earlier activity catalogue (now superseded by direct API inspection).
- [`docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md`](../completed/INVESTIGATE-data-journey-pattern.md) — the established Atlas one-source-end-to-end pattern this work follows.
- [`docs/stack/erd.md`](../../../stack/erd.md) — current marts ERD; will auto-grow when supply tables are added.
