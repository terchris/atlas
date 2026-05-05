# Project: Atlas

Atlas is an organisation-neutral information platform that aggregates public data about every large Norwegian NGO. The product surface is a Next.js App Router web app at `atlas.helpers.no` (TypeScript, React Server Components, Digdir Designsystemet for UI, MapLibre for maps). The data behind it is produced by a separate pipeline (`atlas-data/`) that ingests Norwegian public-sector sources (SSB, FHI, Brreg, Kartverket, Bufdir, IMDi, NAV, Lottstift, Innsamlingskontrollen, …), transforms them through dbt, and serves them as `marts.*` tables in PostgreSQL.

Atlas runs on the **Urbalurba Infrastructure Stack (UIS)** at [uis.sovereignsky.no](https://uis.sovereignsky.no/) — a sovereign Kubernetes platform that already provides Postgres, observability, identity, networking, and GitOps deploy. New platform services Atlas needs (Dagster, Metabase, PostgREST) are filed as `INVESTIGATE-*.md` documents in the UIS repo's `website/docs/ai-developer/plans/backlog/`.

For the user-facing description, personas, status, and key product decisions, read the repo-root [README.md](../../README.md) first — that is the authoritative product overview.

---

## Repository structure

This repo holds three co-located concerns: the **customer-facing Next.js app** (`atlas-frontend/`, PostgREST consumer; rebuilt under PLAN-005), the **contributor diagnostic Next.js app** (`atlas-contributor-frontend/`, direct Postgres for ingestion verification), and the **data platform** (`atlas-data/`, intended to be split into a separate `atlas-data` repo later — see [`atlas-data/README.md`](../../../atlas-data/README.md) for the split-trigger conditions).

```
atlas/
├── README.md                       — product overview (read this first)
│
├── atlas-frontend/                 — Next.js customer app (atlas.helpers.no, PostgREST consumer; rebuilt under PLAN-005)
│   └── (under construction)
│
├── atlas-contributor-frontend/     — Next.js diagnostic app for contributors (direct Postgres; dev/staging only)
│   ├── package.json                — Node 20+
│   ├── next.config.ts, tsconfig.json — Next.js config
│   ├── app/                        — App Router pages and layouts
│   ├── src/                        — shared code (components, lib)
│   ├── public/                     — static assets
│   ├── postcss.config.mjs, components.json — PostCSS, shadcn config
│   └── design-tokens/              — Digdir Designsystemet token sources
│
├── atlas-data/                     — future separate `atlas-data` repo, colocated for now
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
├── atlas-private-data-repo/        — per-NGO private data folders (sample-ngo committed; real NGOs gitignored)
│
├── website/                        — user-facing documentation; Docusaurus-shaped, Docusaurus not yet installed
│   ├── README.md                   — layout conventions, helpers-projects sister-site references, Docusaurus install plan
│   └── docs/                       — MD pages, Docusaurus-compatible
│       ├── index.md                — landing page
│       ├── about/                  — what Atlas is, who it's for
│       ├── sector/                 — Norwegian NGO sector context
│       ├── getting-started/        — orientation for first-time consumers of marts.*
│       ├── concepts/               — one page per canonical entity (kommune, NGO, chapter, …)
│       ├── measurements/           — one page per (source_id, contents_code) pair
│       └── sources/                — one page per ingest source
│
└── docs/
    ├── ideas/                      — proposals being chewed on, pre-INVESTIGATE
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
TypeScript ingest (CLI — `npm run ingest:<source>`; cron-driven in v1)
        │
        ▼
raw.*  (Postgres landing tables — atlas-data/migrations/)
        │
        │  dbt run (CLI; cron-driven)
        ▼
marts.*  (Postgres consumption tables — atlas-data/dbt/models/)
        │
        │  read-only role
        ▼
PostgREST  (auto-API service; OpenAPI from schema)         ◄── HARD CONTRACT BOUNDARY
        │
        │  HTTPS via Cloudflare Tunnel (api.atlas.helpers.no)
        ▼
┌────────────────────────────────────────┬───────────────────────────────┐
│ Next.js (atlas.helpers.no)             │ External consumers            │
│ — RSC fetch via API                    │ — devs, journalists           │
│ — same surface as external (dogfood)   │ — Tilskuddsmatcher / Lisa     │
└────────────────────────────────────────┴───────────────────────────────┘
        │
        ▼
Browser (MapLibre map + Digdir Designsystemet UI)
```

The **public HTTP API** (PostgREST) is the hard contract between `atlas-data/` and consumers. Atlas's own Next.js dogfoods this surface — it goes through the same API external developers use, no direct DB role. The data pipeline owns `raw.*` and `marts.*`; it never touches frontend code. **No API gateway, no auth in v1** — added later via Authentik+Gravitee (UIS) / Okta+APIM (Azure prod) when keyed users or rate-limit pressure emerges.

In **v2**, Dagster sits between the ingest scripts and `raw.*` (and between dbt and `marts.*`) for orchestration. v1 ingest runs as CLI — pod-spawnable so v2 insertion is clean. See [`docs/stack/suggested-stack.md`](../../../docs/stack/suggested-stack.md) for the full v1/Future split and [`plans/completed/INVESTIGATE-public-api-surface.md`](plans/completed/INVESTIGATE-public-api-surface.md) for the API plan.

---

## Devcontainer

**No devcontainer.** Atlas runs directly on the host. Ignore the workflow guidance in [DEVCONTAINER.md](DEVCONTAINER.md) — none of it applies. Run all commands on the host machine, in the appropriate folder.

Requirements:

- **Node** ≥ 20 (for both the Next.js frontend and the TypeScript ingest)
- **Python** ≥ 3.11 (for dbt; see [`atlas-data/dbt/requirements.txt`](../../../atlas-data/dbt/requirements.txt))
- **PostgreSQL** access — local for development, UIS-hosted in production. Connection string lives in `atlas-data/ingest/.env` (not committed) and `atlas-data/dbt/profiles.yml`. For the bootstrap workflow + post-reset recovery sequence (rotated password after a `rancher-desktop` reset, fresh laptop, or UIS image rebuild), see [`website/docs/contributors/setup.md` § Bootstrap atlas_db on UIS Postgres](../contributors/setup.md#bootstrap-atlas_db-on-uis-postgres).

---

## Key Commands

Each subproject has its own `package.json`. Run commands from the appropriate folder.

### Next.js contributor frontend (`atlas-contributor-frontend/`)

```bash
cd atlas-contributor-frontend
npm install                  # install dependencies
npm run dev                  # dev server at http://localhost:4000
npm run build                # production build
npm run start                # serve production build
npm run typecheck            # tsc --noEmit
```

### TypeScript ingest (`atlas-data/ingest/`)

```bash
cd atlas-data/ingest
npm install
npm run migrate              # run SQL in ../migrations/ against $DATABASE_URL
npm run ingest:<source-id>   # run a single source (19 currently implemented)
npm run typecheck            # tsc --noEmit
```

The full list of `ingest:*` scripts is in [`atlas-data/ingest/package.json`](../../../atlas-data/ingest/package.json) and documented per-source in [`atlas-data/ingest/src/sources/README.md`](../../../atlas-data/ingest/src/sources/README.md).

### dbt (`atlas-data/dbt/`)

dbt is run via **uv** with the project venv at `atlas-data/dbt/.venv/` and credentials from the shared `ingest/.env`. Always invoke through this wrapper — do not call plain `dbt`, do not bypass with `psql`, do not create ad-hoc envs.

```bash
cd atlas-data/dbt

# One-time setup (also rerun this after any rename of an ancestor folder
# of .venv, e.g. atlas-data-repo -> atlas-data — Python venvs hardcode the
# absolute path to python in every script's shebang and don't survive moves)
rm -rf .venv && uv venv --python 3.12         # fresh venv at .venv/
uv pip install -r requirements.txt            # installs pinned dbt-core + dbt-postgres
uv run --env-file ../ingest/.env dbt deps     # installs dbt packages (dbt_utils, etc.)

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

- `uv` (Astral) manages the project-local Python 3.12 venv at `atlas-data/dbt/.venv/`.
- `--env-file ../ingest/.env` pulls `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` from the same `.env` the TypeScript ingest uses — single source of truth for credentials.
- `profiles.yml` lives next to `dbt_project.yml` (dbt 1.5+ auto-discovers it) and reads those env vars via `env_var()`.
- Schema-name override macro at [`atlas-data/dbt/macros/generate_schema_name.sql`](../../../atlas-data/dbt/macros/generate_schema_name.sql) means `+schema: marts` produces `marts`, not dbt's default `{target}_marts`.
- In production (per [`docs/stack/suggested-stack.md`](../../../docs/stack/suggested-stack.md)) dbt runs inside Dagster-spawned pods using the same uv-pinned environment — local and prod parity is preserved.

Full reference: [`atlas-data/dbt/README.md`](../../../atlas-data/dbt/README.md).

---

## When to read what

The `docs/` folder is split into three. Read the relevant one before working in that area.

| When you are... | Read first |
|-----------------|------------|
| Setting up your dev environment from scratch (first day) or recovering from a cluster reset (rotated Postgres password, fresh laptop, UIS image rebuild) | [`website/docs/contributors/setup.md`](../contributors/setup.md) — bootstrap workflow, `.env` shape, post-reset recovery sequence, `dbt debug` + `npm run migrate` ordering |
| Adding or modifying a data source | [`atlas-data/ingest/src/sources/README.md`](../../../atlas-data/ingest/src/sources/README.md) — per-source pattern, the template, the catalogue table |
| Working on the dbt models / dim spine / marts.* | [`atlas-data/dbt/`](../../../atlas-data/dbt/) and [`plans/completed/INVESTIGATE-data-journey-pattern.md`](plans/completed/INVESTIGATE-data-journey-pattern.md) (the worked end-to-end journey for one source — completed design investigation) |
| Writing user-facing data documentation (concept definitions, "what does this row mean", measurement reference, source provenance for non-engineers) | [`website/README.md`](../../website/README.md) — folder layout, helpers-project conventions, when Docusaurus actually gets installed. Worked example: [`website/docs/getting-started/reading-a-row.md`](../../website/docs/getting-started/reading-a-row.md) |
| Thinking about modelling, scaling beyond 19 sources, or the metric/catalogue/dictionary layers | [`docs/stack/data-strategy.md`](../../../docs/stack/data-strategy.md) — established patterns, what mid-size teams run, what Atlas needs when |
| Adding or renaming a field — establishing the canonical Atlas vocabulary | [`docs/stack/naming-conventions.md`](../../../docs/stack/naming-conventions.md) |
| Deciding how to decode a coded field for a new source (enum mapping, label lookup, structured parse) | [`plans/backlog/INVESTIGATE-code-label-mapping.md`](plans/backlog/INVESTIGATE-code-label-mapping.md) — open decision with hybrid recommendation |
| Making a stack-level decision (new platform service, install vs reuse, etc.) | [`docs/stack/suggested-stack.md`](../../../docs/stack/suggested-stack.md) — the v1-narrowed stack with explicit "removed from v1" rationales |
| Working on the Next.js frontend | Repo root: [`README.md`](../../README.md), [`app/`](../../app/), [`src/`](../../src/). UI components: [Digdir Designsystemet docs](https://designsystemet.no). Maps: [MapLibre docs](https://maplibre.org). |
| Researching the NGO sector or a specific organisation | [`docs/research/`](../../../docs/research/) — personas, NGO profiles, sector landscape, data-source catalogues |
| Investigating a specific Samfunnspuls source | [`docs/research/samfunnspuls/`](../../../docs/research/samfunnspuls/) — the 24-source catalogue, field notes, data-sources.md |
| Filing a request for a new platform service in UIS | UIS repo: `~/learn/helpers/urbalurba-infrastructure/website/docs/ai-developer/plans/backlog/INVESTIGATE-*.md` — see existing examples (Dagster, Metabase, PostgREST) for the format |

---

## Key rules and contracts

These are non-negotiable constraints. They are the things that take longer to undo than to follow.

### The public API contract (dogfood)

- **The public HTTP API (PostgREST) is the hard contract** between `atlas-data/` and all consumers — including Atlas's own Next.js frontend.
- Atlas's Next.js frontend goes through the same API external developers use. It does **not** read `marts.*` directly. The dogfood pattern means bugs, latency, and edge-case behaviour get hardened by Atlas's own development.
- External consumers (Tilskuddsmatcher, journalists, future devs) get **only** API access — no direct DB role.
- `atlas-data/` (ingest + dbt) **owns** `raw.*` and `marts.*`. PostgREST projects `marts.*` views and tables as REST endpoints; it doesn't write anywhere.
- A schema change to anything PostgREST exposes is a breaking change to the API consumers. Coordinate it explicitly.
- **v1 = no API gateway, no auth.** PostgREST sits behind Cloudflare Tunnel, public + anonymous + read-only. Auth and rate-limiting come later via Authentik+Gravitee (UIS) / Okta+APIM (Azure prod) when triggers fire (keyed users, abuse pressure, write endpoints).
- API-shaped views in `marts.*` follow the [`mart_<feature>`](../../../docs/stack/naming-conventions.md#when-to-add-a-new-mart_feature) convention. Query logic lives in dbt views; PostgREST stays a thin projection.

See [`plans/completed/INVESTIGATE-public-api-surface.md`](plans/completed/INVESTIGATE-public-api-surface.md) for the full plan, the per-route audit, and the phased migration (PLAN-D.1 → D.2 → E → F → G).

**Migration status** (2026-04-30, PLAN-005 shipped): the original `atlas-frontend/` was renamed to [`atlas-contributor-frontend/`](../../../atlas-contributor-frontend/) (it was contributor-shaped throughout) and a fresh customer-facing [`atlas-frontend/`](../../../atlas-frontend/) was scaffolded as a PostgREST consumer with no DB role. See [INVESTIGATE-frontend-data-access-architecture.md](plans/completed/INVESTIGATE-frontend-data-access-architecture.md) for the architectural rationale and [PLAN-005-frontend-split-and-rebuild.md](plans/completed/PLAN-005-frontend-split-and-rebuild.md) for the implementation log.

### Always run `dbt test` after pipeline changes

- Any change touching dbt (models, seeds, schema.yml, macros, `dbt_project.yml`) **must** end with a clean `uv run --env-file ../ingest/.env dbt test` before commit. The suite runs in seconds; it catches regressions a code review or `git diff` can't see (broken `accepted_values`, dropped relationships, sort-order drift, etc.).
- This includes pure refactors that should produce identical output (e.g. moving fetcher code between files). A byte-equivalent `git diff` proves the *output* is unchanged but not that the *pipeline* is still healthy. Run the tests anyway — they're free insurance.
- For changes that touch seeds, prefer `dbt build` over `dbt test` — it runs `seed → run → test` end-to-end on a clean target and surfaces seed-loading errors that `dbt test` alone wouldn't.

### The atlas-data split

- `atlas-data/` is structured as if it were already a separate repo. Imports do not cross the boundary in either direction except via the database.
- When the split happens (trigger conditions in [`atlas-data/README.md`](../../../atlas-data/README.md)), it should be a clean `git subtree split` with no code changes required.

### One folder per data source

- Every data source ingested by Atlas lives in its own folder under `atlas-data/ingest/src/sources/<source-id>/`.
- Folder name = source id, matching the id in `docs/research/samfunnspuls/data-sources.md`.
- Entry point is `index.ts` exporting `SOURCE_ID` and `run()`. README.md alongside. Add a row to the table in [`atlas-data/ingest/src/sources/README.md`](../../../atlas-data/ingest/src/sources/README.md). Add an `ingest:<id>` script to `package.json`.
- Implementation details and catalogue-level metadata are not duplicated — implementation details live in the per-source README, catalogue metadata in `docs/research/samfunnspuls/data-sources.md`.

### Stack decisions are recorded, not re-argued

- `docs/stack/suggested-stack.md` lists what is in v1, what is removed from v1 (with reasons), and what is deferred to v1.5+. Before proposing a new platform component, check if it has already been evaluated and rejected.
- New platform services that need to live in UIS are proposed via `INVESTIGATE-*.md` files in the **UIS repo's** backlog folder, not Atlas's. Atlas's `docs/stack/` documents the Atlas-side reasoning; UIS's backlog documents the platform-side install plan.

### User-facing documentation goes in `website/docs/`

- Documentation aimed at **consumers of `marts.*`** — concept definitions ("what is a `kommune`?"), measurement reference ("what does `EUskala50` mean?"), worked examples ("how do I read a row?"), source provenance for non-engineers — lives in [`website/docs/`](../../website/docs/).
- The folder is shaped to match Docusaurus conventions used by sister Helpers projects ([UIS](https://github.com/helpers-no/urbalurba-infrastructure), [DCT](https://github.com/helpers-no/devcontainer-toolbox)) so the eventual install requires no restructuring. Docusaurus is **not yet installed**; pages render as plain MD on GitHub for now. See [`website/README.md`](../../website/README.md) for layout, conventions inherited from the sister sites, and Docusaurus-install triggers.
- Audience split — keep these separate, do not mix:
  - `website/docs/` — for **consumers** of `marts.*` (Dev/Ola/Lisa/journalist personas, future LLM agents)
  - `docs/research/` — for the team **thinking about** the model (NGO profiles, common-schema, sector landscape)
  - `docs/ai-developer/` — for the team **building** the codebase (PLANS, WORKFLOW, INVESTIGATE-*) — *planned to move into `website/docs/ai-developer/` in a future PR, matching UIS convention so AI-developer docs become public/searchable*
  - `atlas-data/ingest/src/sources/<id>/README.md` — for the team **operating** the pipeline (per-source quirks, refresh notes)
- When adding a new dbt model, ingest source, or measurement that a consumer would need to understand, the corresponding `website/docs/` page is part of the work — not a follow-up. The MD content seeds the eventual structured Concept Catalogue YAML proposed in [`plans/backlog/INVESTIGATE-semantic-foundation-before-expansion.md`](plans/backlog/INVESTIGATE-semantic-foundation-before-expansion.md).

### Norwegian-first

- The product is for Norwegian users. UI strings, source-of-truth field names (`kommune_nr`, `fylke_nr`, `orgnr`), and most documentation are in Norwegian or use Norwegian terminology. Code, comments, and AI-developer docs are in English.

### Research phase status

- The product is in research-and-design phase (see repo-root `README.md` "Status"). Most of the repo is research material in `docs/research/`. Code lives in `app/`, `src/`, and `atlas-data/`. Don't generate placeholder pages, fake data, or speculative features in code — keep speculative work in `docs/research/` until it's been promoted to a plan in `docs/ai-developer/plans/backlog/`.

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
