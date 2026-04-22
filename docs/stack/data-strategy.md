# Atlas data strategy — scaling from 19 to 100+ sources

This document is strategy, not tooling. `suggested-stack.md` says *what* we run. This doc says *how we think about the problem* — what patterns exist for integrating many data sources, which ones Atlas needs now, which to defer, and what signals trigger adopting the next layer.

**Written**: 2026-04-22. **Context**: Atlas has 19 sources ingested and expects to grow to 50–100+ as the portal expands across the NGO sector. The user asked: "how do we create a system that contains data that are useful, that enables the user to do cross-reporting without thinking about what mappings are needed?" This doc is the answer.

---

## The problem, split into three

"Integrating many data sources" is actually three separate problems that people often conflate. Each has its own solution:

### 1. Field-level consistency — the dictionary problem
*When two tables say `kommune_nr`, do they mean the same thing?*

Two sources use different names, types, units, or encodings for the same real-world concept. Source A has `KOMnr` as a string. Source B has `kommune` as an integer. Both mean the municipality code. Left alone, every consumer rewrites the mapping.

**Solved by**: a **data dictionary** — a canonical vocabulary with one authoritative definition per concept.

The OpenAPI analogy fits here perfectly. OpenAPI defines each field once (name, type, format, enum values, description) and every producer/consumer conforms. A data dictionary does the same for a warehouse.

Atlas has this in two places already: [`naming-conventions.md`](./naming-conventions.md) and the `description:` fields in every dbt `schema.yml`.

### 2. Metric-level consistency — the semantic-layer problem
*When two dashboards say "child poverty rate", are they computed the same way?*

The field dictionary fixes names. It does not fix formulas. Two analysts can both correctly use `value` from `fact_kommune_indicators` and still produce different "child poverty rates" — one filtering to `EUskala60`, another to `EUskala50`, another to a three-year average, another excluding Svalbard. All of them defensible. All of them different numbers in a press release.

**Solved by**: a **metric store / semantic layer** — a place where each metric is defined once, with its formula, filters, denominators, and valid grains. Consumers ask for the metric by name, not by rewriting SQL.

### 3. Discoverability — the catalogue problem
*What data do we even have, who owns it, is it fresh?*

At 19 sources you can hold it in your head. At 100 sources you cannot. New contributors (human or LLM) don't know what exists. Analysts re-discover sources that already exist and build redundant logic.

**Solved by**: a **data catalogue** — a browsable inventory of sources, tables, columns, owners, freshness, and lineage.

All three problems compound with scale. At 5 sources, informal docs work. At 100, they don't. Atlas is between those scales — worth deciding which layer to build next *before* the pain hits.

---

## The established patterns

The data-engineering community has been solving these problems for three decades. Here's the landscape, roughly chronologically:

### Kimball conformed dimensions (1996) — the backbone

One authoritative dimension table per real-world concept (`dim_kommune`, `dim_fylke`, `dim_orgnr`, `dim_date`), reused across every fact table. Any source that references "kommune" joins the same `dim_kommune`. Any source that references "year" joins the same `dim_date`.

**Why it matters for Atlas**: this is the thing that makes cross-source joins work. Without conformed dims, every new source re-introduces the same entities under slightly different codes. At 100 sources, that's 100 slightly-wrong mappings to maintain.

**Cost**: discipline, not tooling. Every new fact table must reference the canonical dim.

**Atlas status**: `dim_kommune`, `dim_fylke`, `dim_kommune_history`, `dim_fylke_history` built. `dim_orgnr` needed when Brreg lands. `dim_date` not needed yet (year is an integer, good enough).

### Data dictionary / business glossary — the OpenAPI analogy

A registry where every field has: canonical name, type, unit, allowed values, definition in prose, owner, source-of-truth. The user raised this intuition directly: "just like an OpenAPI spec defines each field and its properties."

**Tooling range**, cheapest first:
- **Markdown + dbt `schema.yml`** — lightweight. Every column gets a `description:`. dbt docs auto-publishes a browsable site with lineage graphs. Free, version-controlled, good enough up to ~50 sources.
- **DataHub** (LinkedIn, OSS) — browse fields across many warehouses, tag ownership, search, lineage from dbt/Airflow/Dagster. Requires running a service.
- **OpenMetadata** (OSS) — similar scope, different implementation. Active community.
- **Amundsen** (Lyft, OSS) — older, thinner.
- **Atlan / Collibra / Alation** — commercial, expensive, enterprise.

**Atlas status**: bones exist in `schema.yml`. Not yet published as dbt docs site. Adopting DataHub prematurely would be a service-operations cost with no payback at 19 sources.

### Semantic layer / metric store — the metric formula registry

A layer between the warehouse and consumers where metrics are **declared**, not queried. Instead of every dashboard re-writing `SUM(cases) / population`, you define `metric: child_poverty_rate` once with:
- formula
- valid dimensions
- filters
- grain (row per kommune-year? per person-month?)
- denominator rule
- direction (higher = better, or worse?)

Consumers ask for the metric by name. The semantic layer compiles to SQL.

**Options**:
- **dbt Semantic Layer (MetricFlow)** — metrics live in dbt YAML next to models, queried via dbt Cloud or OSS MetricFlow CLI. Lowest friction if you already use dbt.
- **Cube** (OSS) — separate service, REST/GraphQL/SQL APIs, built-in caching. More powerful but more to operate.
- **LookML** (Looker / Google) — the original, commercial, expensive.
- **Malloy** (Google, OSS) — new language, interesting experiment.
- **MetriQL** (OSS) — smaller community.

**Atlas status**: not built. The current `fact_kommune_indicators` is raw — consumers in Next.js re-derive "headline" slices each time. A hand-curated `dim_metric` table is the minimal first version and can be authored without adopting a new tool.

### Data mesh (Dehghani, 2019)

Data mesh has two separable contributions that often get bundled:

**1. The organisational model** — each domain (marketing, finance, product) owns its data as *products* with explicit contracts. A central platform team provides the plumbing; domain teams own semantics.

**2. The thinking tool** — treat every data source as a *product* with: a versioned contract, a stated grain, known dimensions, freshness SLAs, an owner, and discoverability. Decouple "source concerns" from "consumer concerns" with an explicit boundary.

**Relevance for Atlas**:

- The organisational model — **does not apply**. Atlas doesn't own SSB, FHI, Udir, IMDi, Brreg or NAV. We can't make external government agencies conform to our contracts. The producers are external, not internal domains.
- The thinking tool — **very relevant, and we're already doing a lightweight version**. Atlas has 6 distinct producers today (SSB, FHI, Udir, IMDi, Brreg, NAV) with ~19 ingested sources, projected to grow to 100+ across a similar number of producers. Each source folder in [`atlas-data-repo/ingest/src/sources/<id>/`](../../atlas-data-repo/ingest/src/sources/) is effectively a data product: its own README, its own contract (the raw-schema it writes, documented in source-level YAML), its own freshness assumption, its own failure modes.

What this means practically for Atlas:

- Each `src/sources/<id>/` is treated as a bounded unit with its own README explaining the upstream's shape and quirks. Already in place — don't regress.
- The boundary between "producer's codes and labels" (e.g., UTDANN, BODD, sex=0/1/2) and "Atlas's vocabulary" (e.g., `education_level`, `housing_status`, `sex='male'/'female'/'all'`) is a translation layer. The dbt `indicators__<source_id>` models are that layer. Keep that boundary explicit and one-way.
- Per-source freshness SLA and owner should live with the source README, not in a global metadata store. That's mesh-style "product thinking" without mesh-style org structure.
- When a producer's upstream shape changes (a new dimension, a renamed field), only that source's ingest + indicator model should break. If a change cascades into multiple other source modules, the boundary is leaking.

What Atlas does **not** need from data mesh:
- A federated platform team model
- A formal data-product registry tool (overkill at our scale; source READMEs + dbt docs suffice)
- Contract-testing frameworks between teams (we have no internal teams)

The honest framing: Atlas is a **centralised ingestion of a de-facto mesh** — many independent producers, one platform team, one consumer. We borrow the "data-as-product" mindset but not the org structure.

### Data Vault (Linstedt)

Hubs (entities), Satellites (attributes), Links (relationships). Designed for messy multi-source integration where sources contradict each other about the same entity (e.g., two CRMs with different customer records).

**Relevance for Atlas**: low. SSB doesn't contradict FHI — they report complementary indicators. Data Vault is overkill. Worth knowing it exists in case we later integrate sources that disagree (e.g., two NGO member registries that overlap).

### Master Data Management (MDM)

"One golden record per customer / product / location." Tools: Informatica, Reltio. Enterprise-grade, heavy, expensive.

**Relevance for Atlas**: none. We don't have conflicting records of "the same kommune" — SSB Klass is authoritative.

### Linked Data / RDF / Schema.org

W3C Semantic Web approach: every field is a URI, vocabularies are linked globally. Powerful in theory. In practice, mostly used by governments and libraries (SSB publishes in RDF alongside PxWebAPI).

**Relevance for Atlas**: low to adopt, worth knowing upstream sources emit it. SSB Klass has RDF endpoints if we ever need cross-government linkage.

---

## What mid-size teams actually run in 2026

The pragmatic stack that's emerged:

- **dbt** for transformation (we have this)
- **Conformed dims** in dbt (we have this)
- **dbt docs** for the first-pass catalogue (free, we haven't published yet)
- **dbt Semantic Layer** *or* **Cube** for metrics (when metric duplication becomes real pain)
- **DataHub** or **OpenMetadata** for catalogue+lineage at scale (when dbt docs stops being enough)
- **Postgres / Snowflake / BigQuery** underneath

Nobody starts with all of it. People add layers as pain appears.

---

## How this maps to Atlas's scale

Atlas is at a specific scale: **19 sources today, 100 projected, ~6 external producers (SSB, FHI, Udir, IMDi, Brreg, NAV), one consumer (Next.js app), one platform team.** One *topic* (Norwegian public-sector well-being), but many independent producers — see Data Mesh section for how we handle that without adopting the mesh org model.

Implications:

- **We don't need DataHub yet.** dbt docs + a hand-curated `dim_metric` table covers catalogue + dictionary at this scale. We'd adopt DataHub when we have multiple producers and consumers asking "what data exists?"
- **We do need a metric layer, soon.** The user's stated pain — "users should do cross-reporting without thinking about mappings" — is exactly the metric-store problem. 100 sources × ad-hoc joins in Next.js = unmaintainable.
- **Cube vs dbt Semantic Layer**: if we adopt a real semantic layer, dbt Semantic Layer is the lower-friction choice because our transformations are already in dbt. Cube is more powerful but is a second system to operate.

---

## Where the OpenAPI analogy holds and where it breaks

**Holds**: a central schema document, machine-readable, with field-level definitions that every producer and consumer agrees on. That's a data dictionary — and the intuition is correct.

**Breaks**: OpenAPI describes *endpoints*, not *metrics*. `GET /kommuner/{nr}` has a schema. "Child poverty rate, 3-year average, excluding Svalbard" is not an endpoint schema — it's a **metric definition**: formula + dimensions + filters + grain. We need both layers:

- **Field dictionary** (OpenAPI-like) — what is `kommune_nr`, what is `value`, what is `contents_code`. Lives in `schema.yml` and `naming-conventions.md`.
- **Metric catalogue** — what is `child_poverty_rate_eu60`, what source feeds it, what's its denominator, how does it aggregate up to fylke. Lives in `dim_metric` (to be built).

---

## Recommendation — ranked by ROI at current scale

Build in this order. Each step unlocks the next. Stop when the pain signal for the next step hasn't appeared.

### 1. Finish conformed dims (mostly done)

- `dim_kommune`, `dim_fylke` — done
- `dim_kommune_history`, `dim_fylke_history` — done
- `dim_codes` or dbt seeds for enum decoding — **open decision** in [`../ai-developer/plans/backlog/INVESTIGATE-code-label-mapping.md`](../ai-developer/plans/backlog/INVESTIGATE-code-label-mapping.md)
- `dim_orgnr` — build when Brreg lands

### 2. Build `dim_metric` as a hand-curated catalogue

One row per Atlas-level metric, with:
- `metric_id` — canonical name, snake_case
- `name_no` — Norwegian display name
- `theme` — barnefattigdom / utdanning / bolig / helse / arbeid / demografi
- `unit` — percent / count / nok / rate_per_1000
- `direction_good` — up / down / neutral
- `definition_no` — one-paragraph prose definition
- `source_id` + `contents_code` + any filter rules → how to compute it from `fact_kommune_indicators`
- `denominator_rule` — what populates the denominator (if a rate)
- `valid_grains` — kommune / fylke / nasjon
- `freshness_sla` — how often we expect it to update

This is our "OpenAPI spec" for metrics. It lives as a dbt seed or a hand-maintained table. No new tools required.

### 3. Publish dbt docs

Fill `schema.yml` descriptions religiously. Run `dbt docs generate && dbt docs serve`. Host as a static site. Free data dictionary with lineage graphs. Good enough to ~50 sources.

### 4. Build `mart_kommune_key_indicators` — the wide pivot

A wide, consumer-friendly mart with one row per `(kommune_nr, year)` and columns per metric (`child_poverty_rate_eu60`, `single_parent_share`, `overcrowded_share`, …). Derived from `dim_metric` + `fact_kommune_indicators`. This is what Next.js queries for cross-reporting. No joins at consumption time.

### 5. Defer — wait for the signal

- **Cube / dbt Semantic Layer** — adopt when we have 5+ consumers duplicating metric logic, OR when Next.js has 10+ metric-computing queries scattered across pages.
- **DataHub / OpenMetadata** — adopt when contributors start asking "what data do we have?" and `dbt docs` isn't enough, OR when we cross ~50 sources.
- **Data Vault** — adopt if we integrate sources that contradict each other on the same entity. Unlikely.

---

## The trap to avoid

Installing Cube + DataHub + OpenMetadata now because they sound right. Each is a service to operate (config, upgrades, storage, access control). The teams who succeed add one layer at a time, driven by observed pain. The teams who fail install the full stack on day one and spend a quarter operating tools that weren't needed.

**Rule**: every new tool must be justified by a specific pain we have *today*, not a pain we expect at some future scale.

---

## Decision triggers

Concrete signals that tell us when to add the next layer:

| Signal observed | Action |
|---|---|
| Same filter clause (`where household_type = '0000' and ...`) appears in 3+ places across Next.js or dbt | Promote to `dim_metric` and `mart_kommune_key_indicators` |
| A new metric is requested and we can't explain to a contributor where to add it | `dim_metric` is missing; build it |
| dbt docs page loads take >10s OR `schema.yml` files exceed ~500 lines | Time to consider DataHub |
| Two analysts publish different numbers for "the same" metric | Semantic layer now — dbt Semantic Layer or Cube |
| A source arrives whose records directly conflict with an existing source | Evaluate Data Vault patterns (Hubs / Satellites / Links) |
| An LLM contributor (Claude/Copilot) starts making plausible-but-wrong guesses about field names | Dictionary rules need to be machine-readable and linked from `CONTRIBUTING.md` |

---

## Cross-references

- [`suggested-stack.md`](./suggested-stack.md) — the tooling chosen for v1 and why
- [`naming-conventions.md`](./naming-conventions.md) — current field dictionary
- [`../ai-developer/plans/backlog/INVESTIGATE-code-label-mapping.md`](../ai-developer/plans/backlog/INVESTIGATE-code-label-mapping.md) — enum-decoding architectural options (sub-problem of the dictionary; open decision in backlog)
- [`../ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md`](../ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md) — end-to-end walkthrough of how one source flows through the stack (the completed design investigation that grounded the v1 pattern)
- [`../../atlas-data-repo/CONTRIBUTING.md`](../../atlas-data-repo/CONTRIBUTING.md) — rules for adding new sources

---

## Reading list

Primary sources if you want to go deeper:

- **Kimball, *The Data Warehouse Toolkit*** — the conformed-dimensions chapter is the foundation
- **dbt Semantic Layer docs** — the most readable modern take, directly relevant to Atlas
- **Benn Stancil, "The Rise of the Metrics Store"** — framing the problem well
- **DataHub and OpenMetadata project pages** — skim feature lists to see what catalogues actually do
- **Dehghani, *Data Mesh*** — worth knowing even if Atlas won't adopt it
