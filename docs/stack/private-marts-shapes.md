# Private marts shapes

Canonical shapes for `private_marts.*` tables in private Atlas deployments. **Atlas owns the shape; each NGO's per-NGO staging script fills it.**

This document is a living contract. Per-NGO private ingests reference it; new conformed shapes get appended here as new "every NGO has this" data categories emerge.

## Scope: Layer 2 only

Per the three-layer model in [`INVESTIGATE-private-atlas-deployments.md`](../ai-developer/plans/backlog/INVESTIGATE-private-atlas-deployments.md) §C.1:

- **Layer 1** = `marts.*` (public open data, atlas.helpers.no manages — fetched centrally) — covered by the public dbt project, not this doc.
- **Layer 2** = `private_marts.*` (Atlas defines the shape, NGO ingests the data) — **the only scope of this contract.**
- **Layer 3** = `private_marts_<ngo>.*` (NGO-specific; Atlas knows nothing about it) — by definition has no shared shape; each NGO owns their own schema docs in their private repo.

If you're authoring an NGO-specific private mart that doesn't generalise to other NGOs, you're in Layer 3 and this doc doesn't apply. See §J of the investigation.

### Same-Postgres dev mode

In production each NGO runs its own private deployment with its own Postgres. **In development we use a single Postgres for all three layers** — `marts.*`, `private_marts.*`, and (eventually) `private_marts_<ngo>.*` schemas coexist in the same database, separated by schema namespace and by Postgres role. The public Atlas frontend role is SELECT-only on `marts.*`; the private-Atlas frontend role gets SELECT on `marts.*` + `private_marts.*` + `private_marts_<ngo>.*`. Same architectural separation, fewer moving parts during development.

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
- **IDs come from the source verbatim, with cross-NGO uniqueness enforced by the source.** For standards-based sources like FRR, the registry's id is globally unique across NGOs by construction (FRR assigns ids), so we keep them verbatim. For NGO-specific sources where the id space is per-NGO, the staging composes a namespaced id (e.g. `<ngo-slug>-<source>-<source-id>`) so cross-NGO joins never collide.
- **Shape changes are forward-only** — additive columns OK; renames/drops break per-NGO ingest scripts and require coordinated migration. Same discipline as the public marts contract.
- **PII handling is non-lossy** — see "Redaction conventions" below. We don't drop rows or NULL fields silently; we redact in place with a sentinel value so counts stay accurate and the audit trail is visible.
- **Verbatim source field names** — when adopting an external standard (FRR, etc.), column names match the source field names verbatim. The **only** transformation is camelCase → snake_case so that Postgres identifiers don't need quoting (`registerId` → `register_id`, `sistOppdatert` → `sist_oppdatert`). No `_id` / `_url` / `_navn` suffixes added; no Atlas-side prefixes added; no English translations. The exceptions are columns Atlas DERIVES (e.g., the `current_*` denormalised columns on `frr_resources` extracted from nested arrays) and Atlas-introduced FK columns on side tables (`frr_resource_position.resource_id` is conventionally named after the parent entity since FRR doesn't expose a name for the implicit nesting relationship).
- **Table names reflect the source standard** — when a table holds data conforming to an external schema, the table name carries the standard's name as a prefix or infix (`frr_resources`, `frr_resource_position`, …). When a table holds data conformed to an Atlas-defined shape (no external standard), no such prefix is used.

### Redaction conventions

Two related but distinct patterns. Don't confuse them:

**(1) Shape decision — a field isn't in the contract.** The conformed shape simply has no column for it. Source-system fields that aren't in the shape (e.g., FRR's image-attachment binary blobs; vendor-specific HR cost-centre codes from any NGO's payroll system) don't appear in the mart. **The data still lives in the source system** — Atlas just doesn't carry it. Not a data loss; a deliberate scope decision. If an NGO needs an excluded field for an NGO-specific view, it goes in `private_marts_<ngo>.*` (Layer 3).

**(2) Data redaction — the field IS in the contract but the value is sensitive.** Atlas's mart has a column for it; we want to preserve the row's existence and other fields, but obscure the sensitive value. Pattern:

| Field type | Redaction pattern |
|---|---|
| **Scalar field, unique per row** (e.g., `personnavn` on `frr_resources`) | Replace value with literal sentinel: `'[ANONYMISERT — <reason>]'`. No collision risk; just a marker. |
| **Field in the primary key or used in joins** (e.g., `telefonnummer` on `frr_resource_phone`) | Replace value with hashed sentinel: `'ANONYMISERT-' \|\| left(encode(sha256(original::bytea), 'hex'), 12)`. Stable identifier (same input → same output across runs), no PK collisions, irreversible. Add a parallel `is_redacted boolean` column. |

**Why redact-in-place beats dropping**:
- Counts stay accurate (`select count(*)` doesn't lie about how many rows were ingested).
- Downstream consumers can detect "this was withheld" vs "this never existed" — important for debugging and audit.
- Future ingest changes are traceable: "we redacted X yesterday, we don't redact X today" shows up as data motion, not silent presence.
- A UI rendering `[ANONYMISERT]` is self-documenting — the user sees that data exists but was filtered, not that it doesn't exist.
- If someone later asks "did we lose this data?", the answer is documentable.

**Decision boundary** — when ingesting a new field, ask:
- "Does the conformed shape have a column for this?" → If no: shape decision (1), don't add a column for it.
- "Does the conformed shape have a column but the value is PII for this row?" → Redaction (2), preserve the row, obscure the value.

The "no PII" rule of Q-priv-4 (in the investigation) is interpreted via this two-pattern policy. The donations example in §F.1 is yet a third case: aggregate-at-write-time, where individual donor rows never enter the mart at all because we never had access to them upstream.

---

## Where the SQL lives — **split by source ownership** (per the revised [Q-priv-18])

Atlas owns the *shape*. Where the *SQL* lives depends on whether the source itself is a shared standard:

- **Standards-based source (e.g. FRR)** — every NGO consumes it in the same shape, so the staging + mart SQL is identical across NGOs. The SQL lives in `atlas-data/dbt/`. Multi-NGO coexistence is via the `ngo_orgnr` column in `private_raw` (the ingest writes it; the mart preserves it). Models are tagged `private` so operators can `dbt build --exclude tag:private` if they want to.
- **NGO-specific source (Layer 3)** — bespoke per NGO. SQL lives in the NGO's private repo at `atlas-private-data-repo/<ngo>/dbt/`.

| What | Where |
|---|---|
| Shape definition (this doc) | `docs/stack/private-marts-shapes.md` — public Atlas repo |
| Standards-based migration (e.g. `private_raw.frr_resources`) | `atlas-data/migrations/0NN_private_raw_<source>.sql` |
| Standards-based ingest (NGO-agnostic, scans per-NGO data folders) | `atlas-data/ingest/src/sources/<source>/` |
| Per-NGO data files for a standards-based source | `atlas-private-data-repo/<ngo>/<source>/*.json` (gitignored) |
| Synthetic data files for onboarding + CI | `atlas-private-data-repo/sample-ngo/<source>/*.json` (committed) |
| Standards-based staging (`supply__<source>_*.sql`) | `atlas-data/dbt/models/supply/`, tagged `private` |
| Standards-based `private_marts.*` models | `atlas-data/dbt/models/private_marts/`, tagged `private` |
| Standards-based `schema.yml` tests | `atlas-data/dbt/models/private_marts/schema.yml` |
| NGO-specific staging + mart (Layer 3) | `atlas-private-data-repo/<ngo>/dbt/models/{supply,private_marts_<ngo>}/` |
| Shared UI components reading `private_marts.*` | `src/components/private/` — public Atlas repo (mounted only when `ATLAS_MODE=private`) |
| Per-NGO UI routes | `app/private/<ngo>/` — public Atlas repo |

**Why this split**:

- Standards-based SQL is identical across NGOs. Putting it in N private repos duplicates code that Atlas in fact owns. The earlier "all Layer 2 in NGO repo" decision (Option B) over-corrected — it traded code duplication for the false promise of "NGO owns their staging." For a government-defined source, no NGO meaningfully owns the conformance code.
- NGO-specific SQL stays in the NGO's repo because the schema itself is bespoke (Visma org units, custom CRMs, payment integrations). No sharing benefit; full NGO ownership.
- On public deployments (`atlas.helpers.no`) the standards-based migrations create empty `private_raw` / `private_marts` tables and the dbt models materialize as empty tables — no special gating, no conditional Jinja. Operators who want to skip them entirely use `dbt build --exclude tag:private`.

Alternatives considered and rejected for v1:

- **Var-gated models in atlas-data with conditional Jinja** — more complex than tag-based exclusion; adds nothing.
- **A shared `atlas-private-marts` dbt package that NGOs import** — most "proper" dbt approach, but real complexity for ~1 standards-based source.

---

## Shape catalog

### Resources — FRR-aligned

**Atlas adopts FRR's schema directly.** FRR (Felles Ressursregister) is a Norwegian government-defined registry for emergency-response resources that the FORF-member NGOs (Red Cross, Norsk Folkehjelp, Sjøredningsselskapet, Norsk Luftambulanse, …) all participate in. The OpenAPI spec lives in each NGO's private repo (`atlas-private-data-repo/<ngo>/docs/felles-ressursregister-frr-openapi-spec.md`).

We don't invent an Atlas-side vocabulary — FRR's enums (`ressurstype`, `statuskode`, `fylkesnavn`, `politidistriktnavn`) are the contract. NGOs that don't participate in FRR either don't surface in this mart or do their own conformance work.

**Column names are kept verbatim Norwegian** to match the FRR spec. The frontend renders display labels; column names don't reach end users.

#### frr_resources

The spine: one row per FRR resource. Denormalised current state for the common UI questions; arrays + JSONB for the nested-but-rarely-filtered fields.

```sql
create table private_marts.frr_resources (
  -- Identity — verbatim FRR (camelCase → snake_case only)
  id                       text primary key,           -- FRR id
  ngo_orgnr                text not null,              -- Atlas-introduced; denormalised, for cross-NGO clarity
  source_id                text not null,              -- Atlas-introduced; 'frr' (the source IS the FRR registry; the NGO is identified by ngo_orgnr)

  -- Display + classification — verbatim FRR
  visningsnavn             text not null,
  ressurstype              text not null,              -- enum: drone | fartøy | kjøretøy | objekt
                                                       -- | organisatorisk enhet | personell - enkeltperson
                                                       -- | personell - gruppe | sentral | utstyr
  hovedfunksjon            text,                       -- free-text, e.g. 'Snøskuter', 'Mannskapsbil', 'Korpshus'
  beskrivelse              text,
  sektor                   text,                       -- 'frivillig' (others possible)
  bilde                    text,                       -- FRR description: "URL or reference to an image"
  verifisert_av_eier       boolean,

  -- PII fields — preserved with redaction-in-place per "Redaction conventions" (2)
  personnavn               text,                       -- redacted: '[ANONYMISERT — personnavn]' (only ~17 of 3971 rows have a value)
  kontaktinformasjon       text,                       -- redacted: '[ANONYMISERT — fri tekst kan inneholde PII]'
  is_personnavn_redacted   boolean not null default false,   -- Atlas-introduced
  is_kontaktinfo_redacted  boolean not null default false,   -- Atlas-introduced

  -- FRR identifiers + provenance — verbatim
  register_id              text,                       -- FRR registerId (which register the resource belongs to; not an ownership pointer)
  mor_id                   text,                       -- self-FK; FRR's morId — parent in the resource/org-unit hierarchy
  baseressurs              text,                       -- self-FK; FRR's baseressurs — sub-resource of a base (rare; e.g. radio mounted on a vehicle)
  ekstern_system           text,                       -- e.g. 'RKH'
  ekstern_id               text,                       -- internal code from external system, NOT a Brreg orgnr
  ekstern_mor_id           text,                       -- internal code, NOT a Brreg orgnr

  -- DENORMALISED current state — derived at staging from the latest position + status
  -- Most common UI questions ('where is it?', 'is it ready?') are then a column lookup, no JOIN.
  current_statuskode       text,                       -- S100 | S200 | S300
  current_status_at        timestamptz,
  current_kommune_navn     text,                       -- raw FRR
  current_kommune_nr       text,                       -- joined from kommunenavn → marts.dim_kommune at staging
  current_fylke_navn       text,                       -- raw FRR (may use pre-2024 names)
  current_fylke_nr         text,                       -- joined from fylkesnavn → marts.dim_fylke at staging
  current_politidistrikt   text,
  current_lat              float,
  current_lon              float,
  position_at              timestamptz,
  position_kilde           text,                       -- adresse | ais | forenklet_tilgang | manuell

  -- Arrays kept as Postgres native arrays (GIN-indexable for fast filtering)
  undertyper               text[],                     -- e.g. ['Snøskuter']
  kapasiteter              text[],                     -- e.g. ['Terrenggående vinter', 'Vannredning']

  -- Less-structured nested data: JSONB
  felter                   jsonb,                      -- EAV custom fields {feltnavn, verdi, benevning}
  utstyr                   jsonb,                      -- equipment carried (FRR spec leaves untyped)
  vedlegg                  jsonb,                      -- attachments

  -- Provenance
  sist_oppdatert           timestamptz,                -- verbatim FRR (camelCase → snake_case)
  loaded_at                timestamptz not null         -- Atlas-introduced
);

create index on private_marts.frr_resources (ngo_orgnr);
create index on private_marts.frr_resources (current_kommune_nr) where current_kommune_nr is not null;
create index on private_marts.frr_resources (ressurstype);
create index on private_marts.frr_resources (mor_id) where mor_id is not null;
create index on private_marts.frr_resources using gin (undertyper);
create index on private_marts.frr_resources using gin (kapasiteter);
```

**Note: FRR includes org units AS resources.** The `ressurstype` enum value `'organisatorisk enhet'` (~306 of 3971 in RC's snapshot) is how FRR models distrikter and lokallag. Don't make a separate `dim_org_unit` table for FRR-participating NGOs — filter `frr_resources` by `ressurstype = 'organisatorisk enhet'` to get the org-unit subset. Hierarchy is via `mor_id` self-FK; org units' `hovedfunksjon` is the place name (e.g. 'Oslo', 'Tromsø').

NGOs that do NOT participate in FRR but still want internal-org-unit display surfaces use Layer 3 (`private_marts_<ngo>.*`) with their own schema. There's no separate Atlas-Layer-2 contract for org units — FRR covers it for participating NGOs, and there's no government standard for the rest.

The full raw FRR JSON is **not** carried on this row. For forensics, query `private_raw.frr_resources.raw_payload` (the unparsed landing zone).

#### frr_resource_position — historical positions

Current position is denormalised on `frr_resources`. This table holds the history.

```sql
create table private_marts.frr_resource_position (
  resource_id      text not null,
  position_at      timestamptz not null,
  fylke_navn       text,
  kommune_navn     text,
  kommune_nr       text,                              -- joined at staging
  politidistrikt   text,
  lat              float,
  lon              float,
  kilde            text,                              -- adresse | ais | forenklet_tilgang | manuell
  loaded_at        timestamptz not null,
  primary key (resource_id, position_at)
);

create index on private_marts.frr_resource_position (resource_id);
create index on private_marts.frr_resource_position (kommune_nr) where kommune_nr is not null;
```

#### frr_resource_status — historical statuses

Current status is denormalised on `frr_resources`. This table holds the history.

```sql
create table private_marts.frr_resource_status (
  resource_id        text not null,
  start_tidspunkt    timestamptz not null,
  statuskode         text not null,                   -- S100 | S200 | S300
  statuskommentar    text,
  loaded_at          timestamptz not null,
  primary key (resource_id, start_tidspunkt)
);

create index on private_marts.frr_resource_status (resource_id);
```

#### frr_resource_phone — phones (PII-redacted in place)

Phones live in their own table because (a) PII redaction applies per-row at staging time, (b) "alarm number for resource X" is a clean JOIN.

```sql
create table private_marts.frr_resource_phone (
  resource_id              text not null,
  retningsnummer           text,
  telefonnummer            text not null,             -- if redacted: 'ANONYMISERT-' || left(sha256-hash, 12)
  beskrivelse              text,                      -- e.g. 'Alarmnummer' — preserved
  kategori                 text,                      -- nødnett | jobb | sentral | ikke angitt | privat
  er_utalarmeringsnummer   boolean,
  is_redacted              boolean not null default false,
  loaded_at                timestamptz not null,
  primary key (resource_id, telefonnummer)
);
```

**PII redaction policy — non-lossy**: rather than drop rows or NULL fields, mark them. The row count, the `kategori` distribution, the `er_utalarmeringsnummer` flag, and the `beskrivelse` (which is a role label like 'Alarmnummer', not personal) all stay accurate. Only the actual phone digits are obscured for the categories we don't surface.

| Field | If `kategori IN ('nødnett','jobb','sentral','ikke angitt')` | If `kategori = 'privat'` |
|---|---|---|
| `telefonnummer` | actual number | `'ANONYMISERT-' \|\| left(encode(sha256(original::bytea), 'hex'), 12)` |
| `is_redacted` | `false` | `true` |
| Other columns | actual values | actual values |

The hashed sentinel keeps the PK unique (no collisions if a resource has two privat numbers) and never reverses to the original. The PK position is preserved as a stable identifier; downstream joins on `(resource_id, telefonnummer)` keep working.

**Same pattern for FRR frr_resources scalars**:

| Field | Default | Redaction (when present) |
|---|---|---|
| `personnavn` (only ~17 of 3971 rows) | actual value | `'[ANONYMISERT — personnavn]'` (literal sentinel) |
| `kontaktinformasjon` (free-text) | actual value | `'[ANONYMISERT — fri tekst kan inneholde PII]'` |

There's no row-uniqueness concern for these scalars — at most one value per resource — so a literal sentinel is enough.

**Why redact-in-place beats dropping**: counts stay accurate, downstream consumers can detect "this was withheld" vs "this never existed", future ingest changes can be traced (we redacted X yesterday, we don't redact X today), and a UI rendering `[ANONYMISERT]` is self-documenting. Dropping creates silent lossiness that's hard to audit.

**Why the private-Atlas audience can see operational categories**: `nødnett`/`jobb`/`sentral` numbers attach to roles, not individuals; RC staff using the private Atlas already see these in their other operational tools. The `privat` category is the bright line — those are personal.

#### Five key joins this enables

```sql
-- 1. All available resources in a kommune
select * from private_marts.frr_resources
where current_kommune_nr = ${kommune_nr} and current_statuskode = 'S100';

-- 2. All org units (filter resources by type)
select * from private_marts.frr_resources
where ressurstype = 'organisatorisk enhet';

-- 3. Find the org unit a resource belongs to (walk mor_id up the FRR hierarchy)
with recursive up(id, mor_id, ressurstype, depth) as (
  select id, mor_id, ressurstype, 0
  from private_marts.frr_resources
  where id = ${resource_id}
  union all
  select r.id, r.mor_id, r.ressurstype, up.depth + 1
  from private_marts.frr_resources r
  join up on r.id = up.mor_id
  where up.depth < 10
)
select * from up where ressurstype = 'organisatorisk enhet' limit 1;

-- 4. Resources with a specific capability (GIN-indexed array filter)
select * from private_marts.frr_resources
where kapasiteter && array['Terrenggående vinter'];

-- 5. Resource detail with kommune + alarm phone
select r.*, k.kommune_name,
       (select telefonnummer from private_marts.frr_resource_phone p
        where p.resource_id = r.id and p.er_utalarmeringsnummer
        limit 1) as alarm_number
from private_marts.frr_resources r
left join {{ source('marts', 'dim_kommune') }} k on k.kommune_nr = r.current_kommune_nr
where r.id = ${resource_id};
```

(Position history queries `frr_resource_position` directly; status history queries `frr_resource_status` — both shown in those tables' sections above.)

### Org units (NOT a separate table — `frr_resources` filtered by ressurstype)

For FRR-participating NGOs, **org units are already in `frr_resources`** as `ressurstype = 'organisatorisk enhet'` (see the spine note above). No separate table; no Visma data path; no Layer 2 contract beyond what FRR already provides.

Queries treat them as a subset:

```sql
-- All org units (lokallag, distrikter, etc.) for the NGO
select * from private_marts.frr_resources
where ressurstype = 'organisatorisk enhet';
```

Hierarchy via `mor_id` self-FK; place name in `hovedfunksjon`; current kommune in the same denormalised columns as any other resource.

For NGOs that don't participate in FRR, org-unit display surfaces (if needed) live in Layer 3 (`private_marts_<ngo>.*`) with the NGO's own schema — there's no Atlas-Layer-2 contract for it.

---

## How the FRR staging conforms

Because Atlas adopts FRR's schema verbatim, the staging is mostly column-rename + denormalisation of `latest position` and `latest status` from the nested arrays. There is **one** staging per FRR-shape table (not per NGO) — multi-NGO coexistence comes from the `ngo_orgnr` column in raw, populated by the ingest from each per-NGO data folder.

```sql
-- atlas-data/dbt/models/supply/supply__frr_resources.sql
{{ config(materialized='view', schema='private_marts', tags=['private']) }}

-- Maps raw FRR rows to the canonical frr_resources shape.
-- See docs/stack/private-marts-shapes.md for the contract.

with src as (
  select * from {{ source('private_raw', 'frr_resources') }}
),
latest_pos as (
  -- pick the most recent position per resource
  select distinct on (src.id)
         src.id                                          as resource_id,
         (pos_item->>'oppdatertTidspunkt')::timestamptz  as position_at,
         pos_item->'område'->>'fylkesnavn'               as fylke_navn,
         pos_item->'område'->>'kommunenavn'              as kommune_navn,
         pos_item->'område'->>'politidistriktnavn'       as politidistrikt,
         (pos_item->'posisjon'->>'breddegrad')::float    as lat,
         (pos_item->'posisjon'->>'lengdegrad')::float    as lon,
         pos_item->>'kilde'                              as kilde
  from src,
       jsonb_array_elements(src.raw_payload->'posisjoner') as pos_item
  order by src.id, (pos_item->>'oppdatertTidspunkt')::timestamptz desc nulls last
),
latest_status as (
  select distinct on (src.id)
         src.id                                  as resource_id,
         (st->>'startTidspunkt')::timestamptz    as status_at,
         st->>'statuskode'                       as statuskode
  from src, jsonb_array_elements(src.raw_payload->'status') as st
  order by src.id, (st->>'startTidspunkt')::timestamptz desc nulls last
)
select
  src.id,                                              -- verbatim FRR
  src.ngo_orgnr,                                       -- carried forward from raw
  'frr'::text                                       as source_id,

  src.raw_payload->>'visningsnavn'                  as visningsnavn,
  src.raw_payload->>'ressurstype'                   as ressurstype,
  -- … (see actual model for the full select)

  -- PII redaction in place (preserves row, marks the change). See Redaction conventions (2).
  case when src.raw_payload->>'personnavn' is not null
       then '[ANONYMISERT — personnavn]'
       end                                          as personnavn,
  (src.raw_payload->>'personnavn' is not null)      as is_personnavn_redacted,
  -- …

  ls.statuskode                                     as current_statuskode,
  lp.kommune_navn                                   as current_kommune_navn,
  k.kommune_nr                                      as current_kommune_nr,
  -- …
from src
left join latest_pos lp     on lp.resource_id = src.id
left join latest_status ls  on ls.resource_id = src.id
-- Filter to active kommuner — historical pre-2020 names duplicate.
left join {{ ref('dim_kommune') }} k on k.kommune_name = lp.kommune_navn and k.is_active
left join {{ ref('dim_fylke') }}   f on f.fylke_name   = lp.fylke_navn   and f.is_active
```

The `private_marts.frr_resources.sql` model is then a thin passthrough:

```sql
-- atlas-data/dbt/models/private_marts/frr_resources.sql
{{ config(materialized='table', schema='private_marts', tags=['private']) }}

select * from {{ ref('supply__frr_resources') }}
```

No UNION ALL — the multi-NGO data is already merged in `private_raw.frr_resources` via the `ngo_orgnr` column. The same shape applies to `frr_resource_position`, `frr_resource_status`, `frr_resource_phone`.

The NGO-agnostic ingest at `atlas-data/ingest/src/sources/frr/index.ts` discovers every `atlas-private-data-repo/<ngo>/frr/*.json` and writes each row with the right `ngo_orgnr` (looked up from `atlas-ngo-landscape/landscape.json`).

---

## Adding new shapes

When a new "every NGO has this" private-data category emerges (members, training records, donor segments, …):

1. **First check for an external standard.** If a Norwegian government registry, an industry-shared schema, or a sector-wide standard exists for this category — adopt it verbatim, the way we adopted FRR for resources. Atlas should not invent a parallel vocabulary when one already exists. The check is: "would all NGOs in this category be feeding the same external system anyway?"
2. If no external standard exists (the org-units case — each NGO uses their own HR system), define a **conformed Atlas shape** that's intentionally minimal. Each NGO's staging maps their internal source into the shape; source-specific extras drop at staging time (or land in `private_marts_<ngo>.*` as Layer 3 if needed).
3. Append a new section to this doc with the canonical table spec.
4. Document the conformance rules specific to that shape (PK, joins to public marts, PII filter, source-specific extras handling).
5. **If the source is standards-based** (every NGO consumes it identically): add migration + ingest + dbt models to `atlas-data/`, tagged `private`, with multi-NGO coexistence via an `ngo_orgnr` column populated from per-NGO data folders under `atlas-private-data-repo/<ngo>/<source>/`. Add a synthetic example to `atlas-private-data-repo/sample-ngo/<source>/`.
6. **If the source is NGO-specific** (Layer 3): the first NGO with the data ships an ingest + a `supply__<ngo>_<entity>.sql` + a `private_marts_<ngo>.<table>.sql` in their own private repo.
7. UI components reading the new shape go in `src/components/private/` in the public Atlas repo so they're available to every NGO.

---

## Companion documents

- [`docs/stack/private-data-layout.md`](./private-data-layout.md) — where private code lives on disk (the per-NGO sibling repo convention).
- [`INVESTIGATE-private-atlas-deployments.md`](../ai-developer/plans/backlog/INVESTIGATE-private-atlas-deployments.md) — the architectural rationale that produced this contract.
- `docs/stack/data-inventory.md` (planned, PLAN-A of the private investigation) — public source list; per-NGO inventories at `atlas-private-data-repo/<ngo>/docs/data-inventory.md` follow the same format.
