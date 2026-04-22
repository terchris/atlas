# Atlas naming conventions

The constitution for names used anywhere a consumer sees them. "Consumer" = the Next.js frontend, any future public API, analyst tooling, or another team/app reading our data.

**Scope**: `marts.*` schema, public API endpoints, and any data product we expose beyond the ingest team.
**Out of scope**: `raw.*` schema — raw names follow upstream verbatim by design; the rename happens in the dbt passthrough.

This file is authoritative. When it conflicts with a specific model, fix the model.

---

## Hard rules

All rules apply to marts, public APIs, and any external contract.

1. **MUST** use `snake_case` for every identifier (schemas, tables, columns, constants).
2. **MUST** use full words — no abbreviations except those in the canonical vocabulary below.
3. **MUST** use English for generic identifiers (model names, verb-based columns). **MUST** preserve Norwegian for Norway-specific concepts: `kommune`, `fylke`, `orgnr`, `bydel`, `grunnkrets`.
4. **MUST NOT** let raw column names from upstream leak into marts. Rename in the dbt passthrough.
5. **MUST** declare a description in `schema.yml` for every column in every marts model.
6. **MUST** declare a `relationships:` test for every column that references a `dim_*` table.
7. **MUST** commit changes that follow this file, not ones that violate it. If a rule is wrong, change the rule; don't bypass it.

---

## Canonical vocabulary

Use these **exact names** when the concept is present. Never invent variants.

| Concept | Canonical name | Type | Rules |
|---|---|---|---|
| 4-digit kommune code (active) | `kommune_nr` | `text` | 4 chars, zero-padded, must exist in `dim_kommune` |
| Kommune name | `kommune_name` | `text` | |
| 2-digit fylke code (active) | `fylke_nr` | `text` | 2 chars, zero-padded, must exist in `dim_fylke` |
| Fylke name | `fylke_name` | `text` | |
| Bydel code (Oslo/Bergen/etc.) | `bydel_code` | `text` | |
| Bydel name | `bydel_name` | `text` | |
| Calendar year as integer | `year` | `integer` | 1900–2100 |
| Three-year rolling period | `period` | `text` | e.g. `"2022-2024"` |
| 9-digit Brreg org number | `orgnr` | `text` | |
| Atlas source identifier | `source_id` | `text` | `"ssb-08764"` form, matches catalogue |
| Source-specific variable code | `contents_code` | `text` | verbatim from upstream |
| Human-readable label for `contents_code` | `contents_label` | `text` | verbatim from upstream |
| Upstream numeric value | `value` | `numeric` | null when suppressed |
| Upstream suppression marker | `status` | `text` | null when value is present |
| When this row was last loaded | `updated_at` | `timestamptz` | |
| Valid-from date (temporal dims) | `valid_from` | `date` | |
| Valid-to date (temporal dims) | `valid_to` | `date` | null = still valid |
| Boolean currently-active flag | `is_active` | `boolean` | computed from `valid_to` |
| Geographic region code, mixed type | `region_code` | `text` | **Allowed only at mart level where mixing is intentional.** For kommune-only data use `kommune_nr`. |
| Biological/administrative sex | `sex` | `text` | One of `"male"`, `"female"`. Map raw codes in the dbt model (e.g. SSB's `"1"`/`"2"` → `"male"`/`"female"`). |
| Single-year age | `age` | `text` | Upstream codes preserved (`"000"` … `"105+"`). Consider `age_int` column when range queries are needed. |
| Age band | `age_group` | `text` | Source-specific enum (varies per table). Enforce with `accepted_values`, no shared dim. |

## Never in marts

Forbidden names, and what to use instead.

| Seen upstream | Never in marts — use this instead |
|---|---|
| `kommunenummer`, `komnr`, `kommunenr` | `kommune_nr` |
| `Region`, `region`, `regioncode` (when kommune-only) | `kommune_nr` |
| `K_0301` style prefixed code | strip prefix in dbt; store as `kommune_nr` |
| `kommunenavn`, `region_name` (when kommune-only) | `kommune_name` |
| `aar`, `tid`, `period_year`, `year_code` | `year` (integer) or `period` (text) |
| `organisasjonsnummer`, `org_id`, `orgnummer` | `orgnr` |
| `verdi`, `amount`, `val`, `v` | `value` |
| `loaded_at` (when exposed beyond raw) | `updated_at` |
| `id`, `recno`, `row_id` | don't expose; use the business key |
| `created_by`, `modified_by` | don't expose unless the concept is user-facing |
| SSB's raw sex codes `"1"` / `"2"` | `"male"` / `"female"` |
| `kjonn`, `kjønn`, `gender` | `sex` |

---

## Schema assignments

| Schema | Purpose | Who writes | Who reads |
|---|---|---|---|
| `raw.*` | Upstream landing. Names follow source. | `atlas-data-repo/ingest/*` | `dbt` only |
| `marts.*` | Atlas public contract. Canonical names. | `dbt` only | frontend, analysts, public API, other teams |
| `dagster.*` | Dagster platform metadata. | Dagster itself | Dagster itself |

A process **MUST NOT** write to a schema it doesn't own. A consumer **MUST NOT** read from a schema it's not listed for.

---

## Model naming

| Pattern | Use | Example |
|---|---|---|
| `dim_<concept>` | Conformed dimension. One per concept, never per source. | `dim_kommune`, `dim_fylke`, `dim_periode`, `dim_orgnr` |
| `indicators__<source_id>` | Per-source passthrough from raw. Double underscore. | `indicators__ssb_08764` |
| `fact_<concept>` | Fact table joining multiple sources, FKs to dims. | `fact_kommune_indicators` |
| `mart_<feature>` | Application-shaped marts sized to a specific feature. | `mart_coverage_gap_barnefattigdom` |

- **MUST NOT** prefix models by team, owner, or date.
- **MUST NOT** create variants like `dim_kommune_v2` — fix the original, deprecate only as a last resort.
- **SHOULD** keep mart names short; the schema prefix (`marts.`) carries the rest.

---

## Deprecation

When a model is retired:

1. Add `deprecation_date: YYYY-MM-DD` to its config. dbt warns on reference from that date.
2. Announce in the commit message that references should migrate.
3. Remove the model file at the deprecation date. No tolerance for "we'll delete it later" — we won't.

**Don't leave dead code in the repo.** Old tables rot; they become someone else's cleanup project.

---

## How this file is enforced

- `schema.yml` descriptions + `relationships:` tests catch most name-and-FK drift automatically.
- PR checklist (see `atlas-data-repo/CONTRIBUTING.md`) asks each contributor to check this file.
- New columns that match a "Never in marts" entry → rename before merge.
- If no canonical name exists for a concept you're introducing, **add it to the Canonical vocabulary table in this file** as part of the same PR. The vocabulary grows deliberately, not by accident.

---

## Rationale

These rules exist because another team's data warehouse grew to 1800 tables with cryptic internal names that no consumer could read without an OpenAPI retrofit. Every rule here is a specific thing that could have prevented that, applied at the moment a new table is born rather than a decade later.
