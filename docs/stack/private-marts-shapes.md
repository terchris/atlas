# Private marts shapes

Canonical shapes for `private_marts.*` tables in private Atlas deployments. **Atlas owns the shape; each NGO's per-NGO staging script fills it.**

This document is a living contract. Per-NGO private ingests reference it; new conformed shapes get appended here as new "every NGO has this" data categories emerge.

## Scope: Layer 2 only

Per the three-layer model in [`INVESTIGATE-private-atlas-deployments.md`](../ai-developer/plans/backlog/INVESTIGATE-private-atlas-deployments.md) §C.1:

- **Layer 1** = `marts.*` (public open data, restored from atlas.helpers.no) — covered by the public dbt project, not this doc.
- **Layer 2** = `private_marts.*` (conformed shape, NGO data) — **the only scope of this contract.**
- **Layer 3** = `private_marts_<ngo>.*` (NGO-specific) — by definition has no shared shape; each NGO owns their own schema docs in their private repo.

If you're authoring an NGO-specific private mart that doesn't generalise to other NGOs, you're in Layer 3 and this doc doesn't apply. See §J of the investigation.

---

## Why this doc exists

Some categories of private data — equipment registries, internal org units, member rolls, training records — exist at **every operational NGO**. Each NGO has their own source system: Red Cross has FRR for resources; Folkehjelp will have something else. The data shape is the same; the source system is not.

To keep the private Next.js UI surfaces NGO-agnostic and reusable, Atlas defines the canonical mart shape **once, here**. Each NGO ships a `supply__<ngo>_<entity>.sql` staging model in their private dbt project that maps their source into this shape. The `private_marts.*` model UNIONs all per-NGO stagings — in single-NGO private deployments only one NGO is in the UNION, but the pattern doesn't fork.

This mirrors the public side, where `dim_chapter` / `dim_activity` / `fact_chapter_activities` are conformed across NGOs via `supply__<ngo>_branches.sql` stagings (see [`INVESTIGATE-ngo-supply-data-model.md`](../ai-developer/plans/completed/INVESTIGATE-ngo-supply-data-model.md)).

---

## Conformance rules

- **Atlas owns the shape** (this doc). Per-NGO ingest authors map their source data to it; they do not extend the shape unilaterally. New columns / new tables go through this doc.
- **All `private_marts.*` rows reference public `marts.*` business keys** (e.g., `chapter_org_number`), not surrogate `chapter_id` IDs that may regenerate on restore. See [`INVESTIGATE-private-atlas-deployments.md`](../ai-developer/plans/backlog/INVESTIGATE-private-atlas-deployments.md) §C.3.
- **Every fact row carries `ngo_orgnr`** (denormalised) so single-tenant queries and future cross-NGO use cases both work without rewrites.
- **IDs are NGO-namespaced composites** (e.g. `redcross-frr-12345`, `folkehjelp-equipsys-7890`) so UNIONs across NGOs never collide.
- **Shape changes are forward-only** — additive columns OK; renames/drops break per-NGO ingest scripts and require coordinated migration. Same discipline as the public marts contract.
- **No PII / individual identifiers**. Aggregated by chapter or org unit only. Per Q-priv-4 of the private investigation.

---

## Where the SQL lives — **Option B** (per [Q-priv-18])

**All Layer 2 dbt files live entirely in each NGO's private repo. Nothing lives in `atlas-data-repo/`.** Atlas owns the *shape*; each NGO owns the *SQL*.

| What | Where |
|---|---|
| Shape definition (this doc) | `docs/stack/private-marts-shapes.md` — public Atlas repo |
| Vocabulary seed CSVs (e.g., `dim_resource_type`) | `atlas-private-data-repo/<ngo>/dbt/seeds/` — content is Atlas-curated, copied verbatim across NGOs |
| Per-NGO staging (`supply__<ngo>_<entity>.sql`) | `atlas-private-data-repo/<ngo>/dbt/models/supply/` |
| `private_marts.*` UNION-ALL models | `atlas-private-data-repo/<ngo>/dbt/models/private_marts/` |
| `schema.yml` tests on `private_marts.*` | `atlas-private-data-repo/<ngo>/dbt/models/private_marts/schema.yml` |
| Shared UI components reading `private_marts.*` | `src/components/private/` — public Atlas repo (mounted only when `ATLAS_MODE=private`) |
| Per-NGO UI routes | `app/private/<ngo>/` — public Atlas repo |

**Why this layout** (Option B in the investigation):

- Each NGO's private dbt project is self-contained: `dbt run`, CI, local dev all work without env-var gymnastics, model selectors, or conditional Jinja.
- atlas.helpers.no's public dbt build never has to skip / disable / variable-gate models that don't apply to it.
- The UNION-ALL files are tiny boilerplate (≈5 lines per shape per NGO) — copy the pattern from this doc.
- Atlas owns the contract via this doc + by reviewing PRs that add new shapes here. Per-NGO authors enforce conformance by mapping their source columns onto the canonical column names below.

Alternatives considered and rejected for v1:

- **Option A** — UNION-ALL files in `atlas-data-repo/dbt/models/private_marts/`, `var()`-gated so the public build skips them. More central control, more dbt-config gymnastics. Revisit if shape drift across NGOs becomes an actual problem.
- **Option D** — ship an `atlas-private-marts` dbt package that NGOs import. Most "proper" dbt approach, but real complexity for 1–2 NGOs and 3 shapes.

---

## Shape catalog

### dim_resource_type

Atlas-curated vocabulary for resource categories. Hand-maintained seed.

```sql
create table private_marts.dim_resource_type (
  resource_type_code   text primary key,        -- e.g. 'tent_4p', 'first_aid_kit_basic', 'terrain_vehicle'
  category             text not null,           -- 'shelter' | 'first_aid' | 'transport' | 'communication' | 'rescue' | 'other'
  label_no             text not null,
  label_en             text,
  description          text,
  sort_order           int  not null
);
```

Vocabulary lives as a CSV at `<ngo>/dbt/seeds/private_dim_resource_type.csv`. The CSV is Atlas-curated; copying it verbatim across NGOs keeps the vocabulary aligned. **Adding new resource types is a change to this doc + the canonical seed; bilateral PRs to every active private repo when it changes (rare).**

### fact_chapter_resources

Aggregated resources per chapter per type. **One row per (chapter, resource_type, source_id)**. No per-item identity — Atlas does not track individual pieces of equipment.

```sql
create table private_marts.fact_chapter_resources (
  chapter_id            text not null,           -- FK (business-key style) to marts.dim_chapter
  resource_type_code    text not null references private_marts.dim_resource_type(resource_type_code),
  ngo_orgnr             text not null,           -- denormalised for clarity / future cross-NGO queries
  quantity              int  not null,
  condition_summary     text,                    -- free-text or NGO categorical, e.g. 'good' | 'fair' | 'needs_maintenance'
  readiness_score       numeric,                 -- nullable; 0.0–1.0 if NGO supports it; ignored for v1 if not
  last_inspected_at     date,
  source_id             text not null,           -- e.g. 'redcross-frr'
  updated_at            timestamptz not null,
  primary key (chapter_id, resource_type_code, source_id)
);
```

**Per-NGO mapping responsibility**: the staging model maps the NGO's internal resource codes (FRR codes for RC) to `dim_resource_type.resource_type_code`. Resources that don't fit the canonical vocabulary either: (a) get a new `resource_type_code` added to the vocabulary, or (b) get bucketed under `category='other'` with a generic code.

### dim_org_unit

Internal organisational units per NGO — committees, teams, working groups, divisions. **Parallel to `dim_chapter`** (which models governance + geographic hierarchy). Org units may anchor to a specific chapter or be national / cross-cutting.

```sql
create table private_marts.dim_org_unit (
  org_unit_id            text primary key,         -- composite, NGO-namespaced
  ngo_orgnr              text not null,
  parent_org_unit_id     text,                     -- self-FK; hierarchy of org units
  unit_type              text not null,            -- free-text in v1; recommended values: 'committee', 'team', 'working_group', 'division', 'department', 'other'
  name                   text not null,
  scope_chapter_id       text,                     -- nullable; FK (business-key style) to marts.dim_chapter when the unit anchors to one chapter
  is_active              boolean not null default true,
  source_id              text not null,
  updated_at             timestamptz not null
);
```

**`unit_type` is free-text** in v1 to avoid over-constraining before we have data from 3+ NGOs. Add an `accepted_values` dbt test once the vocabulary stabilises.

**Why parallel to `dim_chapter` and not unified**: `dim_chapter` models who's accountable in a governance + geographic hierarchy (national → distrikt → lokallag). `dim_org_unit` models who works together operationally (a beredskap committee may span multiple lokallag; a national working group has no chapter at all). They overlap in some cases (a lokallag IS an "org unit" in a sense) — but conflating them would lose information.

---

## How a per-NGO staging script conforms

Example sketch — Red Cross's FRR ingest:

```sql
-- atlas-private-data-repo/redcross/dbt/models/supply/supply__redcross_resources.sql
{{ config(materialized='view', schema='private_marts') }}

-- Map raw FRR rows to the canonical fact_chapter_resources shape.
-- See docs/stack/private-marts-shapes.md for the contract.
--
-- Note: marts.dim_chapter is referenced as source('marts', 'dim_chapter')
-- because the public marts arrive via nightly restore and are NOT built by
-- this dbt project. See docs/stack/private-data-layout.md for the convention.

select
  dc.chapter_id                                       as chapter_id,
  case f.frr_resource_code
    when 'TENT_4P_STD'   then 'tent_4p'
    when 'FAK_BASIC_v3'  then 'first_aid_kit_basic'
    -- ... rest of mapping
    else 'other_uncategorised'
  end                                                 as resource_type_code,
  '864139442'::text                                   as ngo_orgnr,
  f.quantity                                          as quantity,
  f.condition                                         as condition_summary,
  null::numeric                                       as readiness_score,   -- FRR doesn't expose this
  f.last_inspected_date                               as last_inspected_at,
  'redcross-frr'::text                                as source_id,
  f.loaded_at                                         as updated_at
from {{ source('private_raw', 'frr_resources') }} f
join {{ source('marts', 'dim_chapter') }} dc
  on dc.chapter_orgnr = f.owner_org_number
where dc.is_active
```

The `private_marts.fact_chapter_resources.sql` mart is then a `UNION ALL` of every per-NGO staging:

```sql
-- atlas-private-data-repo/redcross/dbt/models/private_marts/fact_chapter_resources.sql
{{ config(materialized='table', schema='private_marts') }}

select * from {{ ref('supply__redcross_resources') }}
-- when Folkehjelp lands their private deployment:
-- union all
-- select * from {{ ref('supply__folkehjelp_resources') }}
```

In any single-NGO private deployment only one branch of the UNION exists — but the pattern is the same as the public-side `dim_chapter` UNION ALL ([`atlas-data-repo/dbt/models/dimensions/dim_chapter.sql`](../../atlas-data-repo/dbt/models/dimensions/dim_chapter.sql)).

---

## Adding new shapes

When a new "every NGO has this" private-data category emerges (members, training records, donor segments, …):

1. Append a new section to this doc with the canonical table spec.
2. Document the conformance rules specific to that shape (PK, joins to public marts, vocabulary owners, etc.).
3. The first NGO that has source data ships a `supply__<ngo>_<entity>.sql` staging in their private repo + a thin `private_marts.<table>.sql` UNION-ALL model.
4. UI components reading the new shape go in `src/components/private/` in the public Atlas repo so they're available to every NGO.

---

## Companion documents

- [`docs/stack/private-data-layout.md`](./private-data-layout.md) — where private code lives on disk (the per-NGO sibling repo convention).
- [`INVESTIGATE-private-atlas-deployments.md`](../ai-developer/plans/backlog/INVESTIGATE-private-atlas-deployments.md) — the architectural rationale that produced this contract.
- `docs/stack/data-inventory.md` (planned, PLAN-A of the private investigation) — public source list; per-NGO inventories at `atlas-private-data-repo/<ngo>/docs/data-inventory.md` follow the same format.
