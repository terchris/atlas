# Atlas data platform — documentation

Welcome. This documentation is for people **using** the Atlas data platform — querying its data, building on top of it, or trying to understand what a particular number means.

If you're trying to figure out **what Atlas is as a product**, start at the repo's [README](https://github.com/terchris/atlas) and the [About Atlas](./about/what-is-atlas.md) page.

If you're trying to **build or operate the data pipeline**, see [`atlas-data-repo/`](https://github.com/terchris/atlas/tree/main/atlas-data-repo) and [`docs/ai-developer/`](https://github.com/terchris/atlas/tree/main/docs/ai-developer).

This documentation is for everyone else.

## What Atlas's data platform is, in one paragraph

Atlas aggregates public data about Norway's NGO sector and the humanitarian needs that shape it. On the data side, that means a Postgres `marts.*` schema containing:

- **Conformed dimensions** — `dim_kommune`, `dim_fylke`, `dim_ngo`, `dim_chapter`, `dim_activity`. The canonical entities, with stable identifiers (`kommune_nr`, `orgnr`, etc.) used consistently across every other table.
- **Per-source indicator passthroughs** — `indicators__ssb_08764`, `indicators__fhi_mobbing`, etc. One per upstream source, normalising shape but preserving meaning.
- **Cross-source facts** — `fact_kommune_indicators` (every kommune-level need indicator from every source, in one queryable table) and `fact_chapter_activities` (every NGO chapter × activity combination).
- **Reference vocabularies** — `ref_atlas_service_category` (cross-NGO activity taxonomy), `ref_un_sdg`, `ref_brreg_icnpo`, and others.

Read access is via a read-only Postgres role. A public HTTP/JSON API is planned but not yet shipped.

## Who this documentation is for

| You are… | Start here |
|---|---|
| Curious what Atlas is and who it's for | [About Atlas](./about/what-is-atlas.md), [Personas](./about/personas.md) |
| Curious about the Norwegian NGO sector | [NGO landscape](./sector/ngo-landscape.md), [Sector research](./sector/sector-research.md) |
| New to the platform and want to understand what a row means | [How to read a row](./getting-started/reading-a-row.md) |
| Looking up what a specific concept means (`kommune`, `chapter`, `activity`) | `concepts/` *(in progress)* |
| Looking up what a specific measurement means (e.g. `ssb-08764` + `EUskala50`) | `measurements/` *(in progress)* |
| Looking for the upstream source of a particular table | `sources/` *(in progress)* |

## The state of this documentation, honestly

This folder is **early**. The `marts.*` schema is production-shape with 19 ingest sources implemented, but the user-facing documentation is just starting. What exists today:

- This intro page.
- The **About** section — what Atlas is and who it's for.
- The **Sector** section — Norwegian civil society landscape and research evidence.
- One worked example: [How to read a row](./getting-started/reading-a-row.md) — walks through one record from upstream SSB to the final mart.

What's planned (and why it isn't here yet): see [`docs/ai-developer/plans/backlog/INVESTIGATE-semantic-foundation-before-expansion.md`](https://github.com/terchris/atlas/blob/main/docs/ai-developer/plans/backlog/INVESTIGATE-semantic-foundation-before-expansion.md) and [`docs/ideas/semantic-data-platform-discussion.md`](https://github.com/terchris/atlas/blob/main/docs/ideas/semantic-data-platform-discussion.md).

If a page you need doesn't exist, the data probably does — open an issue or check the dbt model's `schema.yml` description in [`atlas-data-repo/dbt/models/`](https://github.com/terchris/atlas/tree/main/atlas-data-repo/dbt/models).

## Conventions

- **Norwegian field names where SSB/FHI/Brreg use them** (`kommune_nr`, `fylke_nr`, `orgnr`) — these are the public-registry canonical forms; we don't anglicise them.
- **English column names where Atlas defines them** (`source_id`, `chapter_level`, `service_category_code`).
- **All dates and timestamps in ISO 8601, UTC**.
- **Provenance always present** — every row in `marts.fact_*` carries `source_id` and `updated_at` so you can trace it back.
