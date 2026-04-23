# Investigate: NGO supply data — model, ingestion, supply-vs-demand query

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Decide how Atlas should ingest, store, and query "what each NGO offers, where" — turning a heterogeneous mix of NGO data sources (live APIs, HTML scrapes, JSON blobs, no per-chapter data at all) into queryable `marts.*` tables that can be joined with the demand-side indicators we already ingest, so the **Coverage-gap explorer** (Signe / Arne / Ola in [`personas.md`](../../../research/personas.md)) can answer "where is the need high and the supply absent?".

**Last Updated**: 2026-04-23
**Completed**: 2026-04-23 — foundation + Red Cross delivered via PLAN-001 + PLAN-002. Each future NGO ingest gets its own investigation (see Scope below).

## Scope of this investigation

**In scope and shipped:**

- The cross-NGO **data model** (sections A–F): `dim_ngo`, `dim_chapter`, `dim_activity`, `fact_chapter_activities`, `ref_atlas_service_category`, the 22-row vocabulary, the chapter-hierarchy `chapter_level` + `parent_chapter_id`, the per-NGO + cross-NGO reporting pivots.
- The **first NGO ingest** (Red Cross) — chosen as the reference case because it's the only NGO with a real API and the data model needed real data to ground it.

**Moved out of scope** (each gets its own investigation when picked up):

- **Folkehjelp ingest** (was Q27 / PLAN-C) — HTML scraping with very different mechanics from Red Cross's clean API. Needs its own investigation covering scrape probing, snapshot vs live-scrape, the kommune_nr-from-name resolution challenge, the 6-bin CMS shape. Sample-scrape research already done in [`docs/research/norskfolkehjelp-activities.md`](../../../research/norskfolkehjelp-activities.md). Future investigation: `INVESTIGATE-folkehjelp-ingest.md`.
- **Each subsequent NGO** (NKS, Frelsesarmeen, Kirkens Bymisjon, Speiderforbundet, etc.) — same pattern: one investigation per NGO, each covering that NGO's source mechanics. Future investigations: `INVESTIGATE-<ngo>-ingest.md`.
- **Coverage-gap mart materialisation** (was Q28 / PLAN-D) — pre-computed (need × supply) gap mart. Not really NGO-specific; depends on at least 2 NGOs being ingested AND a real performance signal that the on-the-fly query against `fact_chapter_activities` is too slow. Future investigation: `INVESTIGATE-coverage-gap-mart.md`.
- **Red Cross institution sub-array** (was Q43) — Red Cross doesn't have institutions in the formal sense; NKS / Frelsesarmeen / Kirkens Bymisjon do. Picked up in whichever of those NGOs ingests first.

**Origin**: The Norwegian Red Cross Organizations API dump at [`docs/research/api-getOrganizations-output-21apr26.json`](../../../research/api-getOrganizations-output-21apr26.json) (1.0 MB, 392 branches, 50 unique global activities) was originally fetched for Red Cross-specific UI. It now serves as the **best-case reference shape** for one of ~11+ NGOs Atlas needs to cover. The product-side data model already exists at [`docs/research/common-schema.md`](../../../research/common-schema.md). This investigation closes the gap between that conceptual model and Atlas's `marts.*` data layer — the place where supply (NGO presence) finally meets demand (the 19 already-ingested sources).

**Decision-point IDs**: This file uses the `[Q<N>]` convention from [`PLANS.md`](../../PLANS.md#decision-point-ids-qn). Reference any decision by its ID — e.g. *"Q11 yes, Q40 = hand-curated seed for v1, Q46 yes"* — and there's no ambiguity. Q1–Q7 are the discovery questions at the top. Q8–Q24 are options/decisions inside the section bodies. Q25–Q28 are the proposed PLANs (Q25/Q26 shipped; Q27/Q28 moved to separate investigations). Q29–Q38 are decisions resolved during the planning conversation. Q39–Q48 are open questions (most now Resolved with strikethrough).

---

## Questions to Answer

1. **[Q1]** What does the Red Cross API actually contain — and what does its **shape** tell us about the *best case* across all NGOs?
2. **[Q2]** How does NGO supply data fit into Atlas's existing `raw.* → marts.*` pipeline? Which new schemas/tables are needed and how do they relate to the seven already in `marts`?
3. **[Q3]** How do we model the activity taxonomy when each NGO has a different one (Red Cross 50 canonical IDs, Norsk Folkehjelp 6 CMS bins, Nasjonalforeningen no per-chapter activity at all)? What's the minimum viable cross-NGO "service category" that lets Kari search "språkkafé near me" across all orgs — and how does that align with the **ICNPO** standard already used by Brreg's Frivillighetsregister and SSB?
4. **[Q4]** How do we resolve `branchLocation.municipality` (free text Norwegian name) to canonical `kommune_nr` — given mergers, dialects, historical names, and shared place names?
5. **[Q5]** What's the right ingestion pattern when each NGO publishes data differently? One source folder per NGO (matching the existing `ingest/src/sources/<id>/` pattern), or a generic "NGO scraper" framework?
6. **[Q6]** How does the "supply-vs-demand" coverage-gap query actually look in SQL — and what marts tables make it efficient to compute?
7. **[Q7]** What goes in v1 vs deferred? With 392 branches × 50 activity types × ~50 NGOs eventually, what's the smallest useful slice?

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

1. **[Q8]** **Same `marts` schema, new prefix**: `marts.dim_ngo`, `marts.dim_chapter`, `marts.fact_chapter_activities`. Symmetric with existing `dim_kommune`/`fact_kommune_indicators`. Joins are one-schema.
2. **[Q9]** **New schema `marts_supply` (or `supply`)**: separates concerns; the indicator pipeline and the NGO pipeline can rev independently. Cross-schema joins are still cheap in Postgres.
3. **[Q10]** **Keep raw NGO data in `raw.ngo_*` and roll up to a single `marts.fact_kommune_supply` (long-format like `fact_kommune_indicators`)**: every NGO becomes a `source_id` in the same fact table. Maximises symmetry with the demand side.

Q8 plus a long-format `fact_kommune_supply` (a hybrid) likely best — see Recommendation.

### B. How do we represent the activity taxonomy across orgs?

The hardest question. The `chapter_data_shape` enum from `common-schema.md` says: each NGO owns its own taxonomy, of one of four shapes. We need *both* a cross-org **service category** (Atlas-curated, UI-ready, granular enough for Kari to filter "språkkafé") *and* alignment with the **ICNPO standard** already used across Norwegian NGO statistics, so Atlas can roll up to national figures and report comparably to SSB's satellite accounts.

**Two levels of identity, both always preserved.** The model carries two distinct identifiers per activity, and reports use whichever is right for the question:

1. **NGO's own canonical name** — `dim_activity.canonical_name`. Stored verbatim as the NGO publishes it (Red Cross's `globalActivityName = "Besøkstjeneste"`, Folkehjelp's CMS bin name, etc.). Always the same string for every chapter that offers this activity within that NGO. Used for **per-NGO reporting** ("count all Red Cross Besøkstjeneste").
2. **Atlas's cross-NGO service category** — `dim_activity.service_category_code`. Atlas's curated 22-row vocabulary (Appendix A) that links similar services across NGOs. Used for **cross-NGO reporting** ("show me all elderly-visiting services regardless of which org runs them") and for the Coverage-gap query ("which kommuner have zero providers of category X?").

Both columns coexist on every `dim_activity` row. The reports that personas want (Section F) draw on one or both depending on the question. Every alternative considered below is evaluated against both reporting modes — not just the cross-NGO one.

**ICNPO** — the International Classification of Nonprofit Organisations (12 main groups, 30 subgroups, last revised 2009). Used by:
- **[Brønnøysund Frivillighetsregister](https://www.brreg.no/en/associations-2/register-a-club-or-an-association/registration-in-the-register-of-non-profit-organisations/available-categories-of-the-activity/)** — every registered NGO declares up to 3 ICNPO codes, ranked by activity scope. Available via the open Brreg API.
- **[SSB Satellittregnskap for ideelle og frivillige organisasjoner](https://www.ssb.no/nasjonalregnskap-og-konjunkturer/nasjonalregnskap/statistikk/satellittregnskap-for-ideelle-og-frivillige-organisasjoner)** — sector-wide GDP/employment statistics rolled up by ICNPO group.
- **[Frivillighet Norge](https://www.frivillighetnorge.no/)** — the umbrella body uses the same scheme in its Frivillighetsbarometer and member statistics.
- See **[research note from Samfunnsforskning](https://www.samfunnsforskning.no/sivilsamfunn/publikasjoner/notater/bruk-av-icnpo-kategorier-i-frivillighetsregisteret.pdf)** on actual usage and pitfalls in Frivillighetsregister.

ICNPO's strength is what it is — the official Norwegian NGO classification. Its limit is granularity: at *Group 4 (Social Services) → Subgroup 4.1 Social Services* it bundles "elderly visiting", "homework help", "language practice" and "thrift shop" into one bucket. That's too coarse to power UI filters like Kari's "språkkafé near me". Conversely a fully Atlas-invented service taxonomy can't aggregate to national figures.

The right answer is **both**:

1. **[Q11]** **Org level (`dim_ngo`)** — store the NGO's official ICNPO codes (up to 3, ranked) directly from Brreg. No Atlas invention; this is the canonical sector classification. Lets Atlas reproduce SSB-style sector splits and compare to Frivillighet Norge's Barometer.
2. **[Q12]** **Service level (`ref_atlas_service_category`)** — Atlas-curated ~20-row vocabulary for UI-ready filtering (`language_practice`, `homework_help`, `elderly_visiting`, `youth_drop_in`, `rescue_corps`, `crisis_helpline`, `migrant_mentoring`, `thrift_shop`, …). Each row carries an `icnpo_subgroup_code` column tagging it to its parent ICNPO subgroup, so any service-category query can also be rolled up to ICNPO for sector reporting.
3. **[Q13]** **Activity catalogue (`dim_activity`)** — one row per (NGO, NGO-canonical activity). Carries `service_category_code` directly as a column, plus optional ICNPO and SDG references inherited from the category. This **replaces the originally proposed `crosswalk_activity_to_category` table** (see "Decisions resolved during planning" near the bottom). With a real catalogue, the NGO's local string (`"Modum Røde Kors Hjelpekorps"`) survives only as a display attribute on the `fact_chapter_activities` row; canonicalisation and categorisation happen once per (NGO, canonical activity) at the catalogue level.

Same refresh-script pattern as PLAN-001's `ref_*` seeds for the seed half (`ref_atlas_service_category`) — the curated rows live in CSV, refreshable from upstream when ICNPO codes change at Brreg.

Rejected alternatives:
- **[Q14]** **ICNPO-only** — too coarse for the UI Kari needs.
- **[Q15]** **Atlas-only, no ICNPO** — orphans Atlas from Norwegian NGO statistics; can't compare to SSB or Frivillighet Norge.
- **[Q16]** **Tag-based, no fixed taxonomy** — Kari can't filter; no way to say "this kommune has zero of category X".
- **[Q17]** **Atlas-canonical activity layer between `dim_activity` and `ref_atlas_service_category`** — would just be categories-of-categories, more curation for marginal gain. Setting service-category granularity at ~22 covers the same ground.

**[Q18]** A second standard worth carrying alongside (lower priority): the **17 UN Sustainable Development Goals**. Many NGOs report against SDGs publicly. SDGs are not a sector classification (they're outcomes), but tagging each service category with relevant SDG goal numbers (e.g. `language_practice` → SDG 4 Education, SDG 10 Reduced Inequalities) gives an extra rollup axis for funders and journalists. Optional column on `ref_atlas_service_category`; populate when obvious.

### C. How do we resolve `municipality` text → `kommune_nr`?

The Red Cross API gives `"municipality": "Modum"` not `"kommune_nr": "3316"`. Across 267 unique municipality strings in the 392 branches, the matching against `dim_kommune` faces:

- **Mergers** (most painful): "Tynset" still appears in old Brreg subunits even though some kommuner have merged. Pre-2020 names → post-2020 codes need a mapping.
- **Name collisions**: "Os" exists in two places historically (Os in Innlandet; Os in Hordaland → merged into Bjørnafjorden 2020). String match alone is wrong.
- **Diacritics and dialects**: "Sør-Aurdal" vs "Sor-Aurdal", "Ålesund" vs "Aalesund", "Bø" vs "Bo".
- **Articles and suffixes**: "Karmøy" vs "Karmøy kommune".

Options:

1. **[Q19]** **Per-source name → kommune_nr mapping seed** (`marts.crosswalk_redcross_municipality_to_kommune`). Per-NGO crosswalks because each may use different upstream taxonomies (Red Cross uses post-reform names mostly; Norsk Folkehjelp may differ).
2. **[Q20]** **Generic name → kommune_nr seed** (`marts.crosswalk_kommune_name`) with one row per (alternative_name, kommune_nr) pair, populated from SSB Klass historical names. One canonical resolver per ingest.
3. **[Q21]** **Postal-code lookup via Bring/PostNord** — `branchLocation.postalAddress.postalCode` ("3340") deterministically resolves to a kommune via Posten's postnummer database. **Likely the cleanest path** — postal codes don't have the merger ambiguity that names do, and the postnummer→kommune mapping is a maintained dataset.
4. **[Q22]** **Combine Q20 + Q21** — postal-code lookup as primary path; name match as fallback for branches without a postal address.

Recommendation: Q22. Postal code is the deterministic primary; SSB Klass historical-names crosswalk catches the rest. Both materialise as `ref_*` or `crosswalk_*` seeds, refreshed quarterly.

### D. What's the ingestion pattern per NGO?

**[Q23]** The existing TypeScript ingest in [`atlas-data-repo/ingest/src/sources/`](../../../../atlas-data-repo/ingest/src/sources/) has 19 source folders, one per data source. Same pattern fits here:

- `ingest/src/sources/redcross-branches/` — fetches the Red Cross API, writes `raw.redcross_branches` and `raw.redcross_branch_activities`.
- `ingest/src/sources/folkehjelp-chapters/` — HTML scrape of folkehjelp.no chapter list, writes `raw.folkehjelp_chapters` and `raw.folkehjelp_chapter_activities`.
- `ingest/src/sources/nks-chapters/` — HTML scrape, similar.
- … one folder per Tier A NGO.

**Per-NGO `raw.*` tables** preserve upstream verbatim (the whole point of the raw layer). The dbt models in `models/supply/` (or under `models/indicators/` depending on subschema decision) normalise the four `chapter_data_shape` modes into one shared `marts.dim_chapter` + `marts.fact_chapter_activities` shape.

This **mirrors the existing pattern** — see [`docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md`](../completed/INVESTIGATE-data-journey-pattern.md) for the worked end-to-end pattern from a single source.

~~**[Q24]**~~ **Resolved (2026-04-23)**: This investigation covers Red Cross only (the foundation + first NGO). Each subsequent NGO gets its own investigation per the scope split documented at the top of this file. Ingest order beyond Red Cross is whichever NGO the team picks up next; the foundation is now stable enough that any of the 11 Tier A NGOs in `dim_ngo` can be ingested independently.

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
  select distinct fca.kommune_nr
  from marts.dim_activity da
  join marts.fact_chapter_activities fca using (activity_id)
  join marts.dim_chapter dc using (chapter_id)
  where da.service_category_code = 'homework_help'
    and fca.is_active and dc.is_active and dc.chapter_level = 'local'
)
select hn.kommune_nr, k.kommune_name, k.fylke_name
from high_need hn
join marts.dim_kommune k using (kommune_nr)
left join supply_for_category s using (kommune_nr)
where s.kommune_nr is null;
```

The supply join goes through `dim_activity.service_category_code` — a single column, no junction table. That query is the **product**. Everything in this investigation exists to make it cheap to write and fast to run.

For the related query *"what activities are available in this kommune?"*:

```sql
select dn.name as ngo, da.canonical_name, count(distinct fca.chapter_id) as chapters
from marts.fact_chapter_activities fca
join marts.dim_activity da using (activity_id)
join marts.dim_ngo dn on fca.ngo_orgnr = dn.orgnr
join marts.dim_chapter dc using (chapter_id)
where fca.kommune_nr = '0301'
  and fca.is_active and dc.is_active and dc.chapter_level = 'local' and da.is_active
group by dn.name, da.canonical_name
order by chapters desc;
```

For *"all chapters offering språkkafé, ranked by proximity"* (Kari's flow):

```sql
select dc.name as chapter, dc.kommune_nr, dn.name as ngo, da.canonical_name as activity
from marts.dim_activity da
join marts.fact_chapter_activities fca using (activity_id)
join marts.dim_chapter dc using (chapter_id)
join marts.dim_ngo dn on dc.ngo_orgnr = dn.orgnr
where da.service_category_code = 'language_practice'
  and fca.is_active and dc.is_active and dc.chapter_level = 'local';
```

### F. Reporting questions by persona

The point of the two-level identity (Section B) is that it answers very different questions cleanly. Here are real questions each persona would ask, mapped to which level the SQL pivots on. From [`docs/research/personas.md`](../../../research/personas.md).

**A note on scope of these examples**: the queries below reference Folkehjelp, NKS and other NGOs alongside Red Cross to illustrate how the two-level model works at scale. Today, only Red Cross is loaded (PLAN-002 shipped); the other NGOs become real rows only once their respective `INVESTIGATE-<ngo>-ingest.md` lands. Until then, these queries return Red Cross-only results — but the SQL shape is correct and won't change as new NGOs ingest.

#### Kari ("I want to help, somehow") — cross-NGO

> *"I'd like to help kids with their homework. Where can I do that near Bergen?"*

```sql
select dn.name as ngo, dc.name as chapter, dc.kommune_nr
from marts.dim_activity da
join marts.fact_chapter_activities fca using (activity_id)
join marts.dim_chapter dc using (chapter_id)
join marts.dim_ngo dn on dc.ngo_orgnr = dn.orgnr
where da.service_category_code = 'homework_help'        -- Atlas category
  and dc.kommune_nr in (select kommune_nr from marts.dim_kommune where fylke_nr = '46')
  and fca.is_active and dc.is_active and dc.chapter_level = 'local';
```

Pivots on `service_category_code` because Kari doesn't know which NGO offers what. She'd see Red Cross "Leksehjelp" alongside any other NGO that offers homework help in Vestland.

#### Amira ("I just arrived and I need people") — cross-NGO + spatial

> *"Where can I practice Norwegian? I live near Oslo S."*

```sql
select dn.name as ngo, dc.name as chapter, dp.post_office, dc.kommune_nr
from marts.dim_activity da
join marts.fact_chapter_activities fca using (activity_id)
join marts.dim_chapter dc using (chapter_id)
join marts.dim_ngo dn on dc.ngo_orgnr = dn.orgnr
join marts.dim_postnummer dp on dc.kommune_nr = dp.kommune_nr
where da.service_category_code = 'language_practice'
  and dp.postnummer in ('0150','0151','0152','0153','0154','0155')   -- Oslo S area
  and fca.is_active and dc.is_active and dc.chapter_level = 'local';
```

Cross-NGO again, narrowed by postnummer. Amira gets Red Cross Norsktrening, Folkehjelp, Caritas, anyone else — all in walking distance of Oslo S.

#### Tone ("I might join a chapter / compare orgs") — per-NGO

> *"How does Røde Kors compare to Norsk Folkehjelp on chapter coverage and activity breadth in Innlandet?"*

```sql
select
  dn.slug as ngo,
  count(distinct dc.chapter_id) as chapters,
  count(distinct da.canonical_name) as distinct_activities
from marts.dim_chapter dc
join marts.dim_ngo dn on dc.ngo_orgnr = dn.orgnr
left join marts.fact_chapter_activities fca using (chapter_id)
left join marts.dim_activity da using (activity_id)
where dn.slug in ('redcross', 'folkehjelp')
  and substr(dc.kommune_nr, 1, 2) = '34'   -- Innlandet
  and dc.is_active
group by dn.slug;
```

Pivots on `dn.slug` (per-NGO) and counts distinct `canonical_name` (each NGO's own taxonomy). Tone wants to compare what each NGO actually offers in their own terms — not collapsed into Atlas categories.

#### Inger (chapter leader) — per-chapter

> *"What does Atlas show about Modum Røde Kors? Is everything we offer here?"*

```sql
select da.canonical_name as activity, fca.local_activity_name, fca.is_active
from marts.dim_chapter dc
join marts.fact_chapter_activities fca using (chapter_id)
join marts.dim_activity da using (activity_id)
where dc.name = 'Modum Røde Kors'
order by da.canonical_name;
```

Pivots on `dc.name` and shows both the NGO-canonical name AND the local string Modum uses ("Modum Røde Kors Hjelpekorps"). Inger's quality-control flow.

#### Arne (district coordinator) — per-NGO aggregated

> *"Across the 23 Røde Kors locals in Innlandet, which canonical activities are most under-represented?"*

```sql
with district_chapters as (
  select dc.chapter_id from marts.dim_chapter dc
  join marts.dim_ngo dn on dc.ngo_orgnr = dn.orgnr
  where dn.slug = 'redcross' and substr(dc.kommune_nr, 1, 2) = '34'
)
select da.canonical_name,
       count(distinct fca.chapter_id) as chapters_offering,
       (select count(*) from district_chapters) - count(distinct fca.chapter_id) as chapters_missing
from marts.dim_activity da
left join marts.fact_chapter_activities fca on fca.activity_id = da.activity_id
                                           and fca.chapter_id in (select chapter_id from district_chapters)
                                           and fca.is_active
join marts.dim_ngo dn on da.ngo_orgnr = dn.orgnr
where dn.slug = 'redcross' and da.is_active
group by da.canonical_name
order by chapters_missing desc;
```

Pivots on `da.canonical_name` (per-NGO catalogue) — Arne wants to see "21 of our 23 locals offer Hjelpekorps but only 5 offer Vitnestøtte" in Red Cross's own terms.

#### Signe (national-office planner — Samfunnspuls audience) — coverage gap

> *"Which kommuner have child-poverty in the top quartile AND zero providers of homework help across the entire NGO sector?"*

The flagship Coverage-gap query. Pivots on `service_category_code` — Signe doesn't care which NGO; she cares whether ANYONE offers it.

```sql
with high_need as (
  select kommune_nr from marts.fact_kommune_indicators
  where source_id = 'bufdir-barnefattigdom' and year = 2024
    and value > (select percentile_cont(0.75) within group (order by value)
                 from marts.fact_kommune_indicators
                 where source_id = 'bufdir-barnefattigdom' and year = 2024)
),
supply_for_category as (
  select distinct fca.kommune_nr
  from marts.dim_activity da
  join marts.fact_chapter_activities fca using (activity_id)
  join marts.dim_chapter dc using (chapter_id)
  where da.service_category_code = 'homework_help'
    and fca.is_active and dc.is_active and dc.chapter_level = 'local'
)
select hn.kommune_nr, k.kommune_name, k.fylke_nr
from high_need hn
join marts.dim_kommune k using (kommune_nr)
left join supply_for_category s using (kommune_nr)
where s.kommune_nr is null
order by k.fylke_nr, k.kommune_name;
```

#### Mette (cross-NGO emergency response) — cross-NGO + spatial + spec category

> *"Which rescue-capable units exist in the area Hardanger storm warning covers?"*

```sql
select dn.name as ngo, dc.name as chapter, dc.kommune_nr,
       da.canonical_name as specific_capability
from marts.dim_activity da
join marts.fact_chapter_activities fca using (activity_id)
join marts.dim_chapter dc using (chapter_id)
join marts.dim_ngo dn on dc.ngo_orgnr = dn.orgnr
where da.service_category_code in ('rescue_corps', 'first_aid_standby')
  and dc.kommune_nr in ('4624', '4631', '4632')   -- Hardanger kommuner
  and fca.is_active and dc.is_active and dc.chapter_level = 'local';
```

Mette pivots on `service_category_code` (cross-NGO) but shows the per-NGO `canonical_name` because she needs to know if the responder is "Røde Kors Hjelpekorps" vs "Folkehjelp Sanitet" — they have different equipment and call procedures.

#### Ola (data-curious journalist) — per-NGO sector totals

> *"How many active chapters does each Tier A NGO have? Which has grown most since 2020?"*

```sql
select dn.name, dn.slug, count(*) filter (where dc.is_active) as active_chapters,
       count(*) filter (where not dc.is_active) as historical_chapters
from marts.dim_ngo dn
left join marts.dim_chapter dc on dc.ngo_orgnr = dn.orgnr
where dn.tier = 'A'
group by dn.name, dn.slug
order by active_chapters desc;
```

Pivots on `dn.slug` — Ola wants per-NGO totals, comparing apples to apples.

#### Summary: which level for which question

| Question pattern | Pivots on | Examples |
|---|---|---|
| "What does this NGO offer / how many of X does NGO Y have" | `dim_activity.canonical_name` + `dim_ngo.slug` | Tone, Inger, Arne, Ola |
| "Where can I find any NGO offering [service]" | `dim_activity.service_category_code` | Kari, Amira |
| "Which kommuner have zero providers of [service]" | `dim_activity.service_category_code` | Signe (Coverage-gap) |
| "Cross-NGO emergency response coverage in area X" | `service_category_code` (filter) + `canonical_name` (display) | Mette |
| "Compare two NGOs side by side" | `dim_ngo.slug` (group) | Tone, Jonas |

The shape is robust because **both columns are always available**. Same fact table, two query patterns, no schema branching.

---

## Options summarised

For each of the five questions A–E above:

| Question | Recommended option |
|---|---|
| A. Schema location | One `marts.*` schema. Three new dims (`dim_ngo`, `dim_chapter`, `dim_activity`) + one new fact (`fact_chapter_activities`). Optional aggregate `fact_kommune_supply` deferred until query performance demands it. |
| B. Activity taxonomy | Hybrid: ICNPO codes on `dim_ngo` (from Brreg, no curation) + Atlas-curated `ref_atlas_service_category` seed (**~22 rows**, each optionally tagged with parent ICNPO subgroup + SDG goals). Each `dim_activity` row carries `service_category_code` directly — no separate crosswalk junction. |
| C. Geo resolution | Postal-code primary (`dim_postnummer` already shipped), historical-name fallback (`crosswalk_kommune_name` already shipped). NGOs registered in Frivillighetsregister can also pull `kommunenummer` directly from Brreg. |
| D. Ingestion | One source folder per NGO under `ingest/src/sources/<ngo-id>-chapters/`, mirroring the existing 19-source pattern. Each writes its own `raw.*` tables; dbt normalises into shared marts. |
| E. Coverage-gap query | Built around `fact_kommune_indicators` ⋈ `dim_activity` ⋈ `fact_chapter_activities` joined on `service_category_code`. Materialise the top N "gap" queries as marts only if performance requires (deferred to v1.5+). |

---

## Recommendation — phased plan

Table names follow the convention in [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) (see also [INVESTIGATE-reference-tables-convention.md](INVESTIGATE-reference-tables-convention.md) for the rationale).

Three concrete plans, one per Tier A NGO milestone, plus one for the cross-cutting infra.

### ~~**[Q25]**~~ PLAN-001 (was PLAN-A) — Supply-side foundation — DONE

The plumbing every NGO ingest will need. Build once, reuse N times.

- **`marts.dim_ngo`** — one row per NGO. Columns: `orgnr` (PK, 9-digit Brreg), `slug` (`'redcross'`, `'folkehjelp'`, …; unique, URL-friendly), `name`, `brand_name`, `website_url`, `tier`, `chapter_data_shape`, `has_chapters`, `primary_focus`, **`icnpo_code_1/2/3`** (the up-to-three codes Frivillighetsregisteret carries, ranked). Source per Q40: convert [`docs/research/ngo-landscape.md`](../../../research/ngo-landscape.md) into a structured `landscape.json` (one entry per NGO with all required fields). A new seed-source at `ingest/src/seed-sources/atlas-ngo-landscape/` reads the JSON and writes `dbt/seeds/dim_ngo.csv`. The JSON is the human-edited source-of-truth; the CSV is what dbt loads. ICNPO codes can be enriched in a follow-up via a one-off Brreg lookup, but the v1 seed populates whatever the curator knows from the landscape research.
- **`marts.dim_chapter`** — empty shell (schema only). Columns: `chapter_id` (PK), `ngo_orgnr` (FK), `chapter_level` (enum: `'national' | 'regional' | 'local'`, per Q46), `parent_chapter_id` (FK, self-reference, nullable, per Q46), `chapter_orgnr` (if separately registered with Brreg), `name`, `kommune_nr` (FK, **nullable** for non-local levels that span multiple kommuner), `is_active`, `address_*`, optional contacts. Populated per-NGO during their ingest PLAN. Coverage-gap and "find providers near me" queries filter `WHERE chapter_level = 'local'` per Q48.
- **`marts.dim_activity`** — empty shell (schema only). Columns: `activity_id` (PK, composite slug like `'redcross-besokstjeneste'`), `ngo_orgnr` (FK), `canonical_name`, `service_category_code` (FK to `ref_atlas_service_category`; single column for v1, junction later if needed), `description`, `is_active`. Populated per-NGO during their ingest PLAN.
- **`marts.ref_atlas_service_category`** — Atlas's curated cross-org category vocabulary, **~22 rows** (the agreed v1 list — see Appendix A). Columns: `code`, `label_no`, `label_en`, `description`, **`icnpo_subgroup_code`** (FK to `ref_brreg_icnpo`, optional), `sdg_goals` (text array, optional, e.g. `{4,10}` for language practice).
- **Threshold rule**: a category exists only if at least 2 NGOs offer programmes in it. Single-NGO services live as `dim_activity` rows with their parent-bucket category; they appear via NGO-name search but not as primary UI filter chips until a second NGO joins.

Already exists from PLAN-foundation-reference-tables (no work needed): `dim_postnummer`, `crosswalk_kommune_name`, `ref_brreg_icnpo`, `ref_un_sdg`.

**Not built in PLAN-A**: `fact_chapter_activities` (waits for the first ingest in PLAN-B); `fact_kommune_supply` aggregate (deferred until query performance demands it).

Estimated ~3–4h. **Shipped as [PLAN-001-ngo-supply-foundation.md](../completed/PLAN-001-ngo-supply-foundation.md)** (2026-04-23).

### ~~**[Q26]**~~ PLAN-002 (was PLAN-B) — First NGO ingest: Red Cross — DONE

The clean case. Validates the foundation against real data.

- `ingest/src/sources/redcross-branches/index.ts` — reads the Red Cross Organizations API dump at [`docs/research/api-getOrganizations-output-21apr26.json`](../../../research/api-getOrganizations-output-21apr26.json), writes `raw.redcross_branches` and `raw.redcross_branch_activities`. Per Q39, the live-API client (which would re-fetch from the live Red Cross API instead of the static dump) is **deferred to a future workstream** — separate PLAN, requires API-key access negotiation. v1 uses only the dump.
- **Populates `marts.dim_activity`** with the 50 globalActivityName rows for Red Cross. Each tagged with one `service_category_code` (the curation step — assign manually, document in the PLAN). Activities that fit no v1 category get the closest parent bucket.
- **Populates `marts.dim_chapter`** with all 392 Red Cross branches across the 3 levels: 1 Nasjonalkontoret (`chapter_level = 'national'`), 18 Distrikt (`'regional'`, `parent_chapter_id` → HQ), 362 Lokalforening (`'local'`, `parent_chapter_id` → their Distrikt via the API's `branchParent` field), plus 11 Ukjent (treat as `'local'` with NULL parent until classified). `kommune_nr` resolved via `dim_postnummer` for locals; NULL for the regional and national rows. The 380 active rows (per Q44 `is_active = true`) are what Coverage-gap queries see.
- **Builds `marts.fact_chapter_activities`** for the first time (~2 400 rows for Red Cross alone).
- `marts.supply__redcross_branches` — per-source dbt passthrough/staging (mirrors `indicators__*` pattern).
- Smoke tests: every `dim_activity` row has a `service_category_code` from the v1 list; every `dim_chapter` row has a valid `kommune_nr`; every `fact_chapter_activities` row resolves to one of the 50 activities.

Estimated ~3–4h. **Shipped as [PLAN-002-redcross-ingest.md](../completed/PLAN-002-redcross-ingest.md)** (2026-04-23). Final numbers: 391 chapters, 35 activities, 1 941 fact rows. See the PLAN's "Plan deviations" for two real findings during implementation (dump-data quirk + appendix bookkeeping off-by-one).

### ~~**[Q27]**~~ PLAN-003 — Second NGO ingest: Folkehjelp — moved to separate investigation

Per the scope split documented at the top: each NGO's ingest is qualitatively different (Red Cross has an API; Folkehjelp is HTML scraping; NKS has institutions; etc.). Folkehjelp-specific decisions (snapshot vs live-scrape, the kommune_nr-from-name resolution challenge, the 6-bin CMS shape, fragility handling) belong in a dedicated investigation, not at the bottom of this one.

Future investigation: `INVESTIGATE-folkehjelp-ingest.md` (when picked up). Sample-scrape research already done in [`docs/research/norskfolkehjelp-activities.md`](../../../research/norskfolkehjelp-activities.md) confirms: 108 lokallag, 6 fixed CMS bins (Førstehjelp og redningstjeneste, Sanitetsungdom, Samfunnsarbeid, Flyktning og inkludering, Internasjonale spørsmål, Solidaritetsungdom), Craft CMS render pattern.

### ~~**[Q28]**~~ PLAN-D — Coverage-gap mart materialisation — moved to separate investigation

Once at least 2 NGOs are ingested AND the on-the-fly Coverage-gap query against `fact_chapter_activities` is shown to be too slow, build a `mart_coverage_gap` that pre-computes "high-need + low-supply" combinations.

Future investigation: `INVESTIGATE-coverage-gap-mart.md` (when a real performance need surfaces).

---

## Decisions resolved during planning (2026-04-23 conversation)

The data model was discussed and refined in a planning conversation. Decisions locked in:

- **[Q29]** `dim_ngo` carries both `orgnr` (Brreg PK) AND `slug` (`'redcross'`, `'folkehjelp'`, …). Slug is unique, URL-friendly, what UI filters use; orgnr joins everywhere.
- **[Q30]** `dim_chapter` is a separate entity — chapter-level attributes (address, status, contacts) live there, not denormed onto facts.
- **[Q31]** `dim_activity` is a separate entity (catalogue of what each NGO offers) — replaces the originally proposed `crosswalk_activity_to_category` table. Each row carries `service_category_code` directly.
- **[Q32]** Activity granularity in the fact: one row per (chapter, canonical activity) — not per local string. The local string survives as a `local_activity_name` column for display.
- **[Q33]** `activity_id` shape: composite slug, e.g. `'redcross-besokstjeneste'` (readable, stable, predictable).
- **[Q34]** Activity → category mapping: single column on `dim_activity` for v1. Multi-category junction can be added if 5+ activities legitimately need it.
- **[Q35]** Multi-kommune chapters: `dim_chapter.kommune_nr` is the **primary** kommune. v1 limitation; junction for span chapters added later if needed.
- **[Q36]** `is_active` on both `dim_chapter` AND `fact_chapter_activities` — chapter active, activity at that chapter possibly dormant.
- **[Q37]** `fact_kommune_supply` aggregate is deferred — `fact_chapter_activities` joined to `dim_activity` supports the Coverage-gap query at ~5K rows; the rollup mart is added only if performance demands it.
- **[Q38]** Service category vocabulary: ~22 rows in v1 (see Appendix A). Threshold rule: a category exists if at least 2 NGOs offer programmes in it; single-NGO services live as `dim_activity` rows under their parent-bucket category.

## Open Questions

1. ~~**[Q39]**~~ Does the Red Cross API require a key for live polls? **Resolved (2026-04-23)**: yes. For v1, ingest from the static JSON dump at [`docs/research/api-getOrganizations-output-21apr26.json`](../../../research/api-getOrganizations-output-21apr26.json). Live API polling is deferred to a separate workstream — a future PLAN will write the live-poll client when access is granted.
2. ~~**[Q40]**~~ Where do `dim_ngo` rows come from initially? **Resolved (2026-04-23)**: convert [`docs/research/ngo-landscape.md`](../../../research/ngo-landscape.md) into a structured JSON file (one entry per NGO, with `orgnr`, `slug`, `name`, `tier`, `chapter_data_shape`, `primary_focus`, etc.). An import script reads the JSON and produces `dbt/seeds/dim_ngo.csv`. The JSON is the human-edited source-of-truth; the CSV is what dbt loads. Lives at e.g. `atlas-data-repo/ingest/src/seed-sources/atlas-ngo-landscape/landscape.json` + `index.ts` that reads it and writes the seed.
3. ~~**[Q41]**~~ How granular should the service-category vocabulary be? **Resolved**: ~22 categories — see Appendix A.
4. ~~**[Q42]**~~ Should `fact_kommune_supply` be long-format like `fact_kommune_indicators`? **Resolved**: deferred. The granular `fact_chapter_activities` answers the same questions; rollup added only if needed.
5. **[Q43]** Do we model the institution sub-array (N.K.S., Frelsesarmeen, Kirkens Bymisjon)? Defer to a third per-NGO ingest.

   *Background*: certain NGOs run formal service-providing **institutions** alongside their volunteer chapters. These are distinct entities — not "activities" — because they have employees, physical addresses delivering specific services, often their own orgnr (separately registered AS or STI), and frequently licensing/oversight requirements (helsetilsyn, mattilsyn, barnehagemyndighet). Examples:

   - **N.K.S.** runs ~25 institutions: psykiatriske sykehus (e.g. NKS Olaviken AS, own orgnr 987 554 401), DPS, kvinnehelsehus, hospices, kurssentre.
   - **Frelsesarmeen** runs sykehjem, rusbehandlingssentre, krisesentre, barnehager, mat-utdeling.
   - **Kirkens Bymisjon** runs hospices, dagsentre for bostedsløse, familiesentre, rusbehandling.

   The [`common-schema.md`](../../../research/common-schema.md) already defines an `Institution` entity with a type taxonomy (`psykiatrisk_sykehus`, `dps`, `sykehjem`, `barnehage`, `hospice`, `avlastning`, `kvinnehelsehus`, `helsestasjon`, `kurssenter`, `other`) and a "Tier 1 vs Tier 2" distinction (Tier 1 = separately registered legal entity, Tier 2 = operated inside a chapter without own orgnr).

   *Why defer*: PLAN-B (Red Cross) and PLAN-C (Folkehjelp) don't have institutions in this formal sense — Red Cross's Fellesverket and Bruktbutikk are activities operated within chapters, not institutions in the sykehjem/sykehus sense. The first NGO that actually needs `dim_institution` is whichever of N.K.S./Frelsesarmeen/Kirkens Bymisjon ingests first. At that point we add `dim_institution` (orgnr_kommune_nr_type-keyed) and a `chapter_institution` link table, and decide whether institutions get their own facts (`fact_institution_capacity`?) or stay descriptive on `dim_institution`. Estimated then: ~3–4h on top of that NGO's ingest.

6. ~~**[Q44]**~~ How do we surface terminated/historical chapters? **Resolved (2026-04-23)**: use `dim_chapter.is_active`. v1 supply queries filter to `is_active = true`. Historical rows stay in `dim_chapter` with `is_active = false` so the time-travel extension (`goal.md` v1.5+) and the Coverage-gap "what changed" question can still see them.
7. ~~**[Q45]**~~ Does `dim_postnummer` exist anywhere as a Norwegian standard? **Resolved by PLAN-foundation-reference-tables**: `dim_postnummer` is shipped, sourced from Bring's free TXT (SSB Klass 488 turned out to be freight terminal codes, not postnummer).

8. ~~**[Q46]**~~ Should `dim_chapter` model the NGO's organisational hierarchy (HQ → Distrikt → Lokalforening for Red Cross; similar for most Tier A NGOs)? **Resolved (2026-04-23)**: yes. Add `chapter_level` (enum `'national'` / `'regional'` / `'local'`) + `parent_chapter_id` (self-reference, nullable). Red Cross's 392 branches all live in `dim_chapter` with the hierarchy expressed via `parent_chapter_id` (the API's `branchParent` field maps directly). Folkehjelp's similar 3-level structure fits the same shape; 2-level NGOs leave the `regional` rung empty; Tier C donor-orgs without chapters have `has_chapters = false` on `dim_ngo`. Resolves the conflation between org hierarchy and institutions that Q43's original framing missed.

9. ~~**[Q47]**~~ Does Q43 (institutions: sykehjem etc.) stay a separate concern from the org hierarchy? **Resolved (2026-04-23)**: yes — they're genuinely different things. Org hierarchy (Q46) is the structural layout of any NGO with multi-level governance (most Tier A NGOs have it, including Red Cross). Institutions (Q43) are formal service-providing entities (sykehjem, psyk. sykehus, hospices) that some NGOs run alongside their volunteer chapters (NKS, Frelsesarmeen, Kirkens Bymisjon). Red Cross has hierarchy but no institutions. Q43 stays parked until the first institution-running NGO ingests; Q46 lands in PLAN-A.

10. ~~**[Q48]**~~ When the Coverage-gap query says "providers", does it mean only `local`-level chapters, or should regional/national presence count? **Resolved (2026-04-23)**: **local only**. A single Distrikt office in Innlandet doesn't constitute "supply available to a citizen in Stange". Enforce via the `chapter_level = 'local'` filter throughout the supply-side joins in Section E, F, and any future Coverage-gap mart. Regional/national rows still exist in `dim_chapter` for org-structure queries (Inger seeing her chapter's parent district; Arne aggregating across his district) but they don't count as supply for a kommune.

---

## Next Steps

- [x] **PLAN-001-ngo-supply-foundation.md** — `ref_atlas_service_category` seed (22 rows) + `dim_ngo` seed (11 Tier A NGOs). Shipped as commit `bd378e7`. (Was PLAN-A in the original sketch.)
- [x] **PLAN-002-redcross-ingest.md** — Red Cross dump-based ingest, 391 chapters + 1941 fact rows + 35 activities. Built `dim_chapter`, `dim_activity`, `fact_chapter_activities`. (Was PLAN-B in the original sketch.)
- [ ] **INVESTIGATE-folkehjelp-supply.md** — separate investigation per NGO. Folkehjelp's data shape (cms_bins page-list) differs enough from Red Cross's API JSON that we want to scope it on its own. (Was PLAN-C in the original sketch.)
- [ ] **INVESTIGATE-coverage-gap-mart.md** — pre-computed supply×demand gap mart for the explorer UI. Deferred until at least 2 NGOs are ingested so the cross-NGO joins can be validated. (Was PLAN-D in the original sketch.)

### Not in scope for this investigation

- Folkehjelp ingest and any other NGO beyond Red Cross — each NGO gets its own investigation, since data shapes vary materially (Red Cross has a clean JSON API; Folkehjelp has cms_bins page lists; Tier A NGOs vary further).
- Tier C profile ingest (NRC, Kirkens Nødhjelp, etc.) — they have no chapters; their data is the `Profile` entity from `common-schema.md`, lives in `dim_ngo` payload columns, no chapter/activity rows.
- Funding data (Lottstift, Innsamlingskontrollen) — separate investigation, separate fact table.
- Tilskuddsmatcher — its own investigation, [`tilskuddsmatcher-data-availability.md`](../../../research/tilskuddsmatcher-data-availability.md) covers the data side.
- Live API access for Red Cross — dump-based ingest is sufficient for v1; access conversation is a separate workstream.

---

## Files this investigation produced

**Reused from PLAN-foundation-reference-tables (already shipped earlier):**
- `dim_postnummer`, `crosswalk_kommune_name`, `ref_brreg_icnpo`, `ref_un_sdg`.

**New tables built by PLAN-001 + PLAN-002:**
- `marts.ref_atlas_service_category` (seed, 22 rows — Atlas-curated cross-NGO vocabulary)
- `marts.dim_ngo` (seed, 11 Tier A NGOs with `slug`; ICNPO codes left null pending Brreg lookup)
- `raw.redcross_branches`, `raw.redcross_branch_activities`
- `marts.supply__redcross_branches`, `marts.supply__redcross_branch_activities` (Red Cross staging)
- `marts.dim_chapter` (Red Cross only in v1; future NGOs UNION ALL into the model)
- `marts.dim_activity` (Red Cross only in v1; carries `service_category_code` directly)
- `marts.fact_chapter_activities` (1941 rows for Red Cross alone)

**Dropped from the original sketch:**
- ~~`marts.crosswalk_activity_to_category`~~ — replaced by `dim_activity.service_category_code` column (resolved via [Q22]).
- ~~`marts.fact_kommune_supply`~~ — deferred to the future Coverage-gap investigation; current `fact_chapter_activities` covers v1 needs.

**Deferred to separate investigations:**
- Folkehjelp tables — `INVESTIGATE-folkehjelp-supply.md` (not yet written).
- `marts.mart_coverage_gap` — `INVESTIGATE-coverage-gap-mart.md` (not yet written).

**New ingest folders:**
- `atlas-data-repo/ingest/src/seed-sources/atlas-ngo-landscape/` (PLAN-001)
- `atlas-data-repo/ingest/src/sources/redcross-branches/` (PLAN-002)

**Documentation impact:**
- Extended [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) with the new vocabulary: `ngo_orgnr`, `ngo_slug`, `tier`, `chapter_data_shape`, `primary_focus`, `service_category_code`, `chapter_id`, `chapter_level`, `parent_chapter_id`, `chapter_orgnr`, `activity_id`, `canonical_name`, `local_activity_name`.
- The auto-generated [`docs/stack/erd.md`](../../../stack/erd.md) picked up the new entities and edges automatically (36 entities, 62 relationships post-PLAN-002).

---

## Appendix A — `ref_atlas_service_category` v1 vocabulary (22 rows)

Initial vocabulary agreed during the 2026-04-23 planning conversation. Each row is what would seed `marts.ref_atlas_service_category` in PLAN-A. Threshold rule: a category exists if at least 2 NGOs offer programmes in it. Single-NGO services live as `dim_activity` rows pointing at their parent-bucket category, not as separate categories.

| `code` | What it covers | Likely NGOs offering |
|---|---|---|
| `rescue_corps` | Search and rescue, terrain/water | Red Cross Hjelpekorps, Folkehjelp Sanitet (rescue), Redningsselskapet |
| `first_aid_standby` | Event medical presence | Red Cross Beredskap, Folkehjelp Sanitet (events) |
| `first_aid_training` | Courses for the public | Red Cross Opplæring, Folkehjelp |
| `elderly_visiting` | 1-to-1 visiting/companionship | Red Cross Besøkstjeneste +variants, NKS Lesevenn, Nasjonalforeningen Aktivitetsvenn |
| `language_practice` | Norwegian conversation groups | Red Cross Norsktrening, Folkehjelp, Caritas |
| `homework_help` | School-aged tutoring | Red Cross Leksehjelp |
| `migrant_mentoring` | 1-to-1 mentoring for newcomers | Red Cross Flyktningguide |
| `youth_drop_in` | Open youth meeting places | Red Cross Treffpunkt/Fellesverket, Frelsesarmeen |
| `youth_activity_groups` | Organised youth activities | Red Cross BARK + RØFF, Speiderforbundet |
| `holiday_camps_low_income` | Free camps/trips for low-income kids | Red Cross Ferie for alle |
| `crisis_helpline` | Phone/chat crisis support | Kors på halsen, Mental Helse, Kirkens SOS |
| `crisis_shelter` | Women's shelters etc. | NKS, Krisesentersekretariatet |
| `bullying_prevention` | School/community anti-bullying | (TBD per NGO) |
| `legal_witness_support` | Court witness accompaniment | Red Cross Vitnestøtte |
| `prison_reintegration` | Post-release support | Red Cross Nettverk etter soning |
| `street_mediation` | Restorative-justice for youth | Red Cross Gatemegling |
| `food_distribution` | Food banks, meal programmes | Frelsesarmeen, Kirkens Bymisjon |
| `housing_outreach` | Street outreach, housing-first | Kirkens Bymisjon |
| `family_support` | Practical/social support to families | Red Cross Familiesenter, NKS |
| `health_information` | Disease-awareness, health education | Nasjonalforeningen, LHL |
| `thrift_shop` | Resale + community presence | Red Cross Bruktbutikk, Frelsesarmeen, Fretex |
| `political_advocacy` | Petition, campaign action | Amnesty, Naturvernforbundet |

PLAN-A populates `marts.ref_atlas_service_category` with these 22 rows. Each gets a Norwegian + English label (TBD during PLAN-A drafting) and an optional `icnpo_subgroup_code` mapping. The "Likely NGOs" column is informational, not part of the seed — it's the reasoning trail showing why each category meets the ≥2-NGO threshold.

When new NGOs ingest and present activities that don't fit cleanly, the resolution is one of:
1. **Tag with the closest existing category** (most common) — adds a `dim_activity` row with the parent-bucket category code.
2. **Add a new category to `ref_atlas_service_category`** if at least 2 NGOs offer it. Done in a follow-up PR with explicit reasoning.
3. **Leave the activity in `dim_activity` with a placeholder category** (`other_specialised`) if it's truly unique. Visible via NGO-name search; not a UI filter chip.

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
