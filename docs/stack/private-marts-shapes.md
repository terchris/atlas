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

Some categories of private data — equipment registries, internal org units, member rolls, training records — exist at **every operational NGO**. Each NGO has their own source system: each NGO's resource register differs; Folkehjelp will have something else. The data shape is the same; the source system is not.

To keep the private Next.js UI surfaces NGO-agnostic and reusable, Atlas defines the canonical mart shape **once, here**. Each NGO ships a `supply__<ngo>_<entity>.sql` staging model in their private dbt project that maps their source into this shape. The `private_marts.*` model UNIONs all per-NGO stagings — in single-NGO private deployments only one NGO is in the UNION, but the pattern doesn't fork.

This mirrors the public side, where `dim_chapter` / `dim_activity` / `fact_chapter_activities` are conformed across NGOs via `supply__<ngo>_branches.sql` stagings (see [`INVESTIGATE-ngo-supply-data-model.md`](../ai-developer/plans/completed/INVESTIGATE-ngo-supply-data-model.md)).

---

## Conformance rules

- **Atlas owns the shape** (this doc). Per-NGO ingest authors map their source data to it; they do not extend the shape unilaterally. New columns / new tables go through this doc.
- **All `private_marts.*` rows reference public `marts.*` business keys** (e.g., `chapter_org_number`), not surrogate `chapter_id` IDs that may regenerate on restore. See [`INVESTIGATE-private-atlas-deployments.md`](../ai-developer/plans/backlog/INVESTIGATE-private-atlas-deployments.md) §C.3.
- **Every fact row carries `ngo_orgnr`** (denormalised) so single-tenant queries and future cross-NGO use cases both work without rewrites.
- **IDs come from the source verbatim, with cross-NGO uniqueness enforced by the source.** For standards-based sources, the registry's id is globally unique across NGOs by construction (the upstream registry assigns ids), so we keep them verbatim. For NGO-specific sources where the id space is per-NGO, the staging composes a namespaced id (e.g. `<ngo-slug>-<source>-<source-id>`) so cross-NGO joins never collide.
- **Shape changes are forward-only** — additive columns OK; renames/drops break per-NGO ingest scripts and require coordinated migration. Same discipline as the public marts contract.
- **PII handling is non-lossy** — see "Redaction conventions" below. We don't drop rows or NULL fields silently; we redact in place with a sentinel value so counts stay accurate and the audit trail is visible.
- **Verbatim source field names** — when adopting an external standard, column names match the source field names verbatim. The **only** transformation is camelCase → snake_case so that Postgres identifiers don't need quoting (`registerId` → `register_id`, `sistOppdatert` → `sist_oppdatert`). No `_id` / `_url` / `_navn` suffixes added; no Atlas-side prefixes added; no English translations. The exceptions are columns Atlas DERIVES (e.g., `current_*` denormalised columns extracted from nested arrays) and Atlas-introduced FK columns on side tables (`<source>_<child>.resource_id` is conventionally named after the parent entity since such registries don't expose a name for the implicit nesting relationship).
- **Table names reflect the source standard** — when a table holds data conforming to an external schema, the table name carries the standard's name as a prefix or infix (`<standard>_<entity>`, `<standard>_<entity>_<child>`, …). When a table holds data conformed to an Atlas-defined shape (no external standard), no such prefix is used.

### Redaction conventions

Two related but distinct patterns. Don't confuse them:

**(1) Shape decision — a field isn't in the contract.** The conformed shape simply has no column for it. Source-system fields that aren't in the shape (e.g. as image-attachment binary blobs; vendor-specific HR cost-centre codes from any NGO's payroll system) don't appear in the mart. **The data still lives in the source system** — Atlas just doesn't carry it. Not a data loss; a deliberate scope decision. If an NGO needs an excluded field for an NGO-specific view, it goes in `private_marts_<ngo>.*` (Layer 3).

**(2) Data redaction — the field IS in the contract but the value is sensitive.** Atlas's mart has a column for it; we want to preserve the row's existence and other fields, but obscure the sensitive value. Pattern:

| Field type | Redaction pattern |
|---|---|
| **Scalar field, unique per row** (e.g. a person-name column on a resource table) | Replace value with literal sentinel: `'[ANONYMISERT — <reason>]'`. No collision risk; just a marker. |
| **Field in the primary key or used in joins** (e.g. a phone-number column used as a join key) | Replace value with hashed sentinel: `'ANONYMISERT-' \|\| left(encode(sha256(original::bytea), 'hex'), 12)`. Stable identifier (same input → same output across runs), no PK collisions, irreversible. Add a parallel `is_redacted boolean` column. |

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

- **Standards-based source** — every NGO consumes it in the same shape, so the staging + mart SQL is identical across NGOs. The SQL lives in `atlas-data/dbt/`. Multi-NGO coexistence is via the `ngo_orgnr` column in `private_raw` (the ingest writes it; the mart preserves it). Models are tagged `private` so operators can `dbt build --exclude tag:private` if they want to.
- **NGO-specific source (Layer 3)** — bespoke per NGO. SQL lives in the NGO's private repo at `atlas-private-data-repo/<ngo>/dbt/`.

| What | Where |
|---|---|
| Shape definition (this doc) | `docs/stack/private-marts-shapes.md` — public Atlas repo |
| Standards-based migration (e.g. `private_raw.<source>_<table>`) | `atlas-data/migrations/0NN_private_raw_<source>.sql` |
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

⚠️ **EMPTY since 2026-09-24.** The only catalogued shape, and the staging
conformance walk-through that went with it, documented a source removed on
Terje's instruction (urb-agents #1453). The conformance rules, redaction
conventions and SQL-ownership split above are general and still apply — they
are what the next shape must satisfy.

🔵 The removed section is recoverable from git history if the shape is ever
needed as a worked example.

## Adding new shapes

When a new "every NGO has this" private-data category emerges (members, training records, donor segments, …):

1. **First check for an external standard.** If a Norwegian government registry, an industry-shared schema, or a sector-wide standard exists for this category — adopt it verbatim. Atlas should not invent a parallel vocabulary when one already exists. The check is: "would all NGOs in this category be feeding the same external system anyway?"
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
