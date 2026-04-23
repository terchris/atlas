# Project: Atlas

Atlas is an organisation-neutral information platform that aggregates public data about every large Norwegian NGO. The product surface is a Next.js App Router web app at `atlas.helpers.no` (TypeScript, React Server Components, Digdir Designsystemet for UI, MapLibre for maps). The data behind it is produced by a separate pipeline (`atlas-data-repo/`) that ingests Norwegian public-sector sources (SSB, FHI, Brreg, Kartverket, Bufdir, IMDi, NAV, Lottstift, Innsamlingskontrollen, …), transforms them through dbt, and serves them as `marts.*` tables in PostgreSQL.

Atlas runs on the **Urbalurba Infrastructure Stack (UIS)** at [uis.sovereignsky.no](https://uis.sovereignsky.no/) — a sovereign Kubernetes platform that already provides Postgres, observability, identity, networking, and GitOps deploy. New platform services Atlas needs (Dagster, Metabase, PostgREST) are filed as `INVESTIGATE-*.md` documents in the UIS repo's `website/docs/ai-developer/plans/backlog/`.

For the user-facing description, personas, status, and key product decisions, read the repo-root [README.md](../../README.md) first — that is the authoritative product overview.

---

## Repository structure

This repo holds two co-located concerns: the **Next.js frontend** (lives at the repo root) and the **data platform** (lives in `atlas-data-repo/`, intended to be split into a separate `atlas-data` repo later — see [`atlas-data-repo/README.md`](../../atlas-data-repo/README.md) for the split-trigger conditions).

```
atlas/
├── README.md                       — product overview (read this first)
├── package.json                    — Next.js frontend (Node 20+)
├── next.config.ts, tsconfig.json   — Next.js config
├── app/                            — Next.js App Router pages and layouts
├── src/                            — Next.js shared code (components, lib)
├── public/                         — static assets
│
├── atlas-data-repo/                — future separate `atlas-data` repo, colocated for now
│   ├── README.md                   — what atlas-data is, contract with frontend
│   ├── ingest/                     — TypeScript ingestion (one folder per source)
│   │   ├── package.json            — `@atlas-data/ingest`, Node 20+
│   │   ├── scripts/migrate.ts      — runs SQL files in ../migrations/
│   │   └── src/sources/<id>/       — one folder per data source (19 implemented)
│   │       ├── index.ts            — entry point, exports SOURCE_ID + run()
│   │       └── README.md           — source-specific notes
│   ├── dbt/                        — dbt Core project (Python)
│   │   ├── dbt_project.yml         — project config
│   │   ├── profiles.yml            — connection profiles
│   │   ├── models/                 — SQL transformations raw.* → marts.*
│   │   └── packages.yml            — dbt_utils etc.
│   └── migrations/                 — raw.* schema SQL, numbered 001_*.sql onwards
│
└── docs/
    ├── research/                   — sector research, personas, NGO profiles, data sources
    │   └── samfunnspuls/           — 24-source Samfunnspuls-traced catalogue
    ├── stack/                      — architecture decisions, narrowed v1 stack
    └── ai-developer/               — this folder; framework docs + project-atlas.md
        └── plans/                  — INVESTIGATE-*.md and PLAN-*.md files
            ├── backlog/
            ├── active/
            └── completed/
```

---

## Architecture in one diagram

```
Upstream sources (SSB, FHI, Brreg, Kartverket, NAV, IMDi, Lottstift, …)
        │  HTTP fetch / HTML scrape / bulk download
        ▼
Dagster (planned — see UIS INVESTIGATE-dagster.md)
        │  spawns pods from atlas-data image, via Dagster Pipes
        ▼
TypeScript ingest (atlas-data-repo/ingest/src/sources/<id>/index.ts)
        │
        ▼
raw.*  (Postgres landing tables — atlas-data-repo/migrations/)
        │
        │  dbt run (downstream Dagster asset)
        ▼
marts.*  (Postgres consumption tables — atlas-data-repo/dbt/models/)
        │
        │  read-only Postgres role  ◄── HARD CONTRACT BOUNDARY
        ▼
Next.js App Router (atlas/app/, React Server Components)
        │
        ▼
Browser (MapLibre map + Digdir Designsystemet UI)
```

The `marts.*` schema is the hard contract between `atlas-data-repo/` and the Next.js frontend. The frontend has read-only access; it never writes. The data pipeline owns `raw.*` and `marts.*`; it never touches frontend code.

---

## Devcontainer

**No devcontainer.** Atlas runs directly on the host. Ignore the workflow guidance in [DEVCONTAINER.md](DEVCONTAINER.md) — none of it applies. Run all commands on the host machine, in the appropriate folder.

Requirements:

- **Node** ≥ 20 (for both the Next.js frontend and the TypeScript ingest)
- **Python** ≥ 3.11 (for dbt; see [`atlas-data-repo/dbt/requirements.txt`](../../atlas-data-repo/dbt/requirements.txt))
- **PostgreSQL** access — local for development, UIS-hosted in production. Connection string lives in `atlas-data-repo/ingest/.env` (not committed) and `atlas-data-repo/dbt/profiles.yml`.

---

## Key Commands

Each subproject has its own `package.json`. Run commands from the appropriate folder.

### Next.js frontend (repo root)

```bash
npm install                  # install dependencies
npm run dev                  # dev server at http://localhost:4000
npm run build                # production build
npm run start                # serve production build
npm run typecheck            # tsc --noEmit
```

### TypeScript ingest (`atlas-data-repo/ingest/`)

```bash
cd atlas-data-repo/ingest
npm install
npm run migrate              # run SQL in ../migrations/ against $DATABASE_URL
npm run ingest:<source-id>   # run a single source (19 currently implemented)
npm run typecheck            # tsc --noEmit
```

The full list of `ingest:*` scripts is in [`atlas-data-repo/ingest/package.json`](../../atlas-data-repo/ingest/package.json) and documented per-source in [`atlas-data-repo/ingest/src/sources/README.md`](../../atlas-data-repo/ingest/src/sources/README.md).

### dbt (`atlas-data-repo/dbt/`)

dbt is run via **uv** with the project venv at `atlas-data-repo/dbt/.venv/` and credentials from the shared `ingest/.env`. Always invoke through this wrapper — do not call plain `dbt`, do not bypass with `psql`, do not create ad-hoc envs.

```bash
cd atlas-data-repo/dbt

# One-time setup
uv venv && uv pip install -r requirements.txt    # creates .venv/, installs pinned dbt-core + dbt-postgres
uv run --env-file ../ingest/.env dbt deps        # install dbt packages (dbt_utils, etc.)

# Day-to-day
uv run --env-file ../ingest/.env dbt debug       # verify Postgres connection
uv run --env-file ../ingest/.env dbt seed        # load reference CSVs (marts.ref_*)
uv run --env-file ../ingest/.env dbt run         # build all models in marts.*
uv run --env-file ../ingest/.env dbt run --select indicators__fhi_trangbodd
uv run --env-file ../ingest/.env dbt test        # run schema tests (relationships, not_null, unique)
uv run --env-file ../ingest/.env dbt show --inline "select ..."   # ad-hoc query — use this instead of psql
uv run --env-file ../ingest/.env dbt docs generate && dbt docs serve
```

How it's wired:

- `uv` (Astral) manages the project-local Python 3.12 venv at `atlas-data-repo/dbt/.venv/`.
- `--env-file ../ingest/.env` pulls `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` from the same `.env` the TypeScript ingest uses — single source of truth for credentials.
- `profiles.yml` lives next to `dbt_project.yml` (dbt 1.5+ auto-discovers it) and reads those env vars via `env_var()`.
- Schema-name override macro at [`atlas-data-repo/dbt/macros/generate_schema_name.sql`](../../atlas-data-repo/dbt/macros/generate_schema_name.sql) means `+schema: marts` produces `marts`, not dbt's default `{target}_marts`.
- In production (per [`docs/stack/suggested-stack.md`](../../docs/stack/suggested-stack.md)) dbt runs inside Dagster-spawned pods using the same uv-pinned environment — local and prod parity is preserved.

Full reference: [`atlas-data-repo/dbt/README.md`](../../atlas-data-repo/dbt/README.md).

---

## When to read what

The `docs/` folder is split into three. Read the relevant one before working in that area.

| When you are... | Read first |
|-----------------|------------|
| Adding or modifying a data source | [`atlas-data-repo/ingest/src/sources/README.md`](../../atlas-data-repo/ingest/src/sources/README.md) — per-source pattern, the template, the catalogue table |
| Working on the dbt models / dim spine / marts.* | [`atlas-data-repo/dbt/`](../../atlas-data-repo/dbt/) and [`plans/completed/INVESTIGATE-data-journey-pattern.md`](plans/completed/INVESTIGATE-data-journey-pattern.md) (the worked end-to-end journey for one source — completed design investigation) |
| Thinking about modelling, scaling beyond 19 sources, or the metric/catalogue/dictionary layers | [`docs/stack/data-strategy.md`](../../docs/stack/data-strategy.md) — established patterns, what mid-size teams run, what Atlas needs when |
| Adding or renaming a field — establishing the canonical Atlas vocabulary | [`docs/stack/naming-conventions.md`](../../docs/stack/naming-conventions.md) |
| Deciding how to decode a coded field for a new source (enum mapping, label lookup, structured parse) | [`plans/backlog/INVESTIGATE-code-label-mapping.md`](plans/backlog/INVESTIGATE-code-label-mapping.md) — open decision with hybrid recommendation |
| Making a stack-level decision (new platform service, install vs reuse, etc.) | [`docs/stack/suggested-stack.md`](../../docs/stack/suggested-stack.md) — the v1-narrowed stack with explicit "removed from v1" rationales |
| Working on the Next.js frontend | Repo root: [`README.md`](../../README.md), [`app/`](../../app/), [`src/`](../../src/). UI components: [Digdir Designsystemet docs](https://designsystemet.no). Maps: [MapLibre docs](https://maplibre.org). |
| Researching the NGO sector or a specific organisation | [`docs/research/`](../../docs/research/) — personas, NGO profiles, sector landscape, data-source catalogues |
| Investigating a specific Samfunnspuls source | [`docs/research/samfunnspuls/`](../../docs/research/samfunnspuls/) — the 24-source catalogue, field notes, data-sources.md |
| Filing a request for a new platform service in UIS | UIS repo: `~/learn/helpers/urbalurba-infrastructure/website/docs/ai-developer/plans/backlog/INVESTIGATE-*.md` — see existing examples (Dagster, Metabase, PostgREST) for the format |

---

## Key rules and contracts

These are non-negotiable constraints. They are the things that take longer to undo than to follow.

### The marts.* contract

- The Next.js frontend reads `marts.*` via a **read-only Postgres role**. It never writes anything.
- `atlas-data-repo/` (ingest + dbt) **owns** `raw.*` and `marts.*`. The frontend never reaches into `raw.*`.
- A schema change in `marts.*` is a breaking change to the frontend. Coordinate it explicitly.

### Always run `dbt test` after pipeline changes

- Any change touching dbt (models, seeds, schema.yml, macros, `dbt_project.yml`) **must** end with a clean `uv run --env-file ../ingest/.env dbt test` before commit. The suite runs in seconds; it catches regressions a code review or `git diff` can't see (broken `accepted_values`, dropped relationships, sort-order drift, etc.).
- This includes pure refactors that should produce identical output (e.g. moving fetcher code between files). A byte-equivalent `git diff` proves the *output* is unchanged but not that the *pipeline* is still healthy. Run the tests anyway — they're free insurance.
- For changes that touch seeds, prefer `dbt build` over `dbt test` — it runs `seed → run → test` end-to-end on a clean target and surfaces seed-loading errors that `dbt test` alone wouldn't.

### The atlas-data-repo split

- `atlas-data-repo/` is structured as if it were already a separate repo. Imports do not cross the boundary in either direction except via the database.
- When the split happens (trigger conditions in [`atlas-data-repo/README.md`](../../atlas-data-repo/README.md)), it should be a clean `git subtree split` with no code changes required.

### One folder per data source

- Every data source ingested by Atlas lives in its own folder under `atlas-data-repo/ingest/src/sources/<source-id>/`.
- Folder name = source id, matching the id in `docs/research/samfunnspuls/data-sources.md`.
- Entry point is `index.ts` exporting `SOURCE_ID` and `run()`. README.md alongside. Add a row to the table in [`atlas-data-repo/ingest/src/sources/README.md`](../../atlas-data-repo/ingest/src/sources/README.md). Add an `ingest:<id>` script to `package.json`.
- Implementation details and catalogue-level metadata are not duplicated — implementation details live in the per-source README, catalogue metadata in `docs/research/samfunnspuls/data-sources.md`.

### Stack decisions are recorded, not re-argued

- `docs/stack/suggested-stack.md` lists what is in v1, what is removed from v1 (with reasons), and what is deferred to v1.5+. Before proposing a new platform component, check if it has already been evaluated and rejected.
- New platform services that need to live in UIS are proposed via `INVESTIGATE-*.md` files in the **UIS repo's** backlog folder, not Atlas's. Atlas's `docs/stack/` documents the Atlas-side reasoning; UIS's backlog documents the platform-side install plan.

### Norwegian-first

- The product is for Norwegian users. UI strings, source-of-truth field names (`kommune_nr`, `fylke_nr`, `orgnr`), and most documentation are in Norwegian or use Norwegian terminology. Code, comments, and AI-developer docs are in English.

### Research phase status

- The product is in research-and-design phase (see repo-root `README.md` "Status"). Most of the repo is research material in `docs/research/`. Code lives in `app/`, `src/`, and `atlas-data-repo/`. Don't generate placeholder pages, fake data, or speculative features in code — keep speculative work in `docs/research/` until it's been promoted to a plan in `docs/ai-developer/plans/backlog/`.

---

## External context

These are not in this repo but you will reference them frequently:

- **UIS — Urbalurba Infrastructure Stack** at [uis.sovereignsky.no](https://uis.sovereignsky.no/). The sovereign Kubernetes platform Atlas runs on. Repo: `~/learn/helpers/urbalurba-infrastructure/`.
- **UIS backlog** at `~/learn/helpers/urbalurba-infrastructure/website/docs/ai-developer/plans/backlog/`. New platform services Atlas needs are proposed here as `INVESTIGATE-*.md`. Existing entries: Dagster, Metabase, PostgREST.
- **Helpers** at [helpers.no](https://helpers.no). The umbrella project. Atlas is the first service.
- **Digdir Designsystemet** at [designsystemet.no](https://designsystemet.no). The Norwegian public-sector design system used for shared UI.

---

## Always-loaded rules

There is no `CLAUDE.md` in the repo root for Atlas. The always-loaded rules for this project are the **Key rules and contracts** section above.
