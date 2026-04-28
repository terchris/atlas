# atlas-data

This folder is a **stand-in for what will become a separate repository** (`atlas-data`). It is colocated inside the Atlas product repo during the research and design phase so that structural decisions and first sketches live alongside the research that informs them.

When the scaffolding is stable and we're ready to start real implementation, this folder gets extracted into its own git repository with its own history, CI, and release cadence. Until then, everything happens here.

## What `atlas-data` will be

The data platform behind Atlas. Its only job is to produce the `marts.*` tables in the UIS PostgreSQL, from which the Next.js frontend (in the parent `atlas` repo) reads.

Expected contents once active:

```
atlas-data/
├── ingest/          # TypeScript — one file per data source
├── dbt/             # dbt Core project — transformations
├── dagster/         # Dagster user-code Python package
├── migrations/      # raw schema SQL
├── deploy/          # Dockerfile + Dagster code-location manifest + ArgoCD app
├── docs/            # operational docs: adding-a-source.md, runbook.md
└── README.md
```

The shape is motivated in `/website/docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md` (the completed design investigation that grounded the v1 pattern) and the supporting stack-narrowing conversations.

## The contract with `atlas` (the frontend)

The hard boundary between the two repos is the `marts.*` schema in UIS PostgreSQL.

- `atlas-data` **writes** `marts.*` via dbt (and writes `raw.*` via ingest).
- `atlas` (frontend) **reads** `marts.*` via a read-only Postgres role. Nothing else.
- Neither repo depends on the other's code, schedule, or deploy.

Redeploying the data platform does not cascade to the frontend. Redesigning the UI does not touch ingestion.

## When this folder splits into a separate repo

Trigger conditions — any one of these:

1. First real code lands in `ingest/src/sources/` and it's time to set up CI specifically for the data side.
2. Dagster is deployed in UIS and we need to point a real code-location at a real image built from a real repo.
3. Someone other than the original author needs to contribute to just the data side.

At that point: `git subtree split` this folder into a new repo; add it as a remote; wire up ArgoCD in UIS to watch its image tag.

## What lives here during research

Right now (minimum): this README. As we progress:

- Early schema sketches for `raw.*` and `marts.*`
- Concrete TypeScript templates for the ingestion pattern (e.g. one worked example of `src/ingest/sources/ssb-08764.ts`)
- A first dbt model layout under `dbt/models/`
- A sketch of the Dagster `@asset` structure

None of this needs to run end-to-end to be useful — it just has to be concrete enough that a fresh reader can see the shape.

## Related documents

Cross-referenced from the parent `atlas/` repo:

- `/website/docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md` — end-to-end walkthrough (completed design investigation)
- `/docs/stack/suggested-stack.md` — broader stack context (Cube, Airbyte, etc. — mostly ruled out)
- `/docs/research/samfunnspuls/data-source-schema.md` — source metadata schema
- `/docs/research/samfunnspuls/data-sources.md` — the 24-source catalogue so far
