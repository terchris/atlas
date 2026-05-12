# `atlas-data/dagster/` — Dagster code location for Atlas

This Python package is Atlas's Dagster **code location**: the gRPC server that Dagster's webserver + daemon talk to in order to discover and execute Atlas's assets. It's the Python half of the polyglot `atlas-data` image — its job is to *describe* every Atlas ingest source + dbt model as a Dagster `@asset`, and to *execute* those assets by shelling out to the existing TypeScript ingest scripts (via [Dagster Pipes](https://docs.dagster.io/concepts/dagster-pipes)) or to dbt.

For the wider architecture (how Dagster runs in UIS, the two-pod model, the language-agnostic Pipes pattern), see the authoritative [UIS INVESTIGATE-dagster.md](https://github.com/helpers-no/urbalurba-infrastructure/blob/main/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md). For the Atlas-side implementation plan, see [PLAN-dagster-codelocation-image.md](../../website/docs/ai-developer/plans/active/PLAN-dagster-codelocation-image.md).

## Install

```bash
cd atlas-data/dagster
uv sync                  # installs into a local .venv
```

Python 3.11+ required. The `[deploy]` extra installs `dagster-dbt`, `dagster-k8s`, and `dbt-postgres` for the polyglot Docker image — not needed for local `dagster dev`.

## Run locally

```bash
cd atlas-data/dagster
uv run --extra dev dagster dev --port 3010
```

The Dagster webserver boots at <http://localhost:3010>. Port 3010 (not the default 3000) so it doesn't collide with the Docusaurus dev server.

Asset materialisation requires `ATLAS_DATABASE_URL` pointing at a reachable Postgres — the same env you've already set up for `npm run ingest:*` in `../ingest/.env`. Easiest way:

```bash
export $(grep -v '^#' ../ingest/.env | xargs)
uv run --extra dev dagster dev --port 3010
```

## What lives here

```
atlas-data/dagster/
├── pyproject.toml             # Python package + deps; uv-managed
├── atlas_data/
│   ├── __init__.py
│   ├── definitions.py         # Dagster entrypoint — `defs = Definitions(...)`
│   └── assets/
│       ├── __init__.py
│       └── raw_ssb.py         # @asset wrappers for SSB ingest sources
└── README.md
```

## The cheap-to-import discipline

`definitions.py` is imported by every Dagster run pod on cold-start. Every microsecond at module scope pays its full cost on every materialisation. Rules baked into the module docstring:

- No DB connections at module scope. Open them inside `@asset` function bodies.
- No expensive file I/O at module scope.
- No `os.environ[...]` (use `os.getenv(..., default)` so an absent var doesn't kill import).

`dagster-dbt`'s manifest parsing is the one expensive operation we accept later — Dagster needs it to expose dbt models as assets at all. Not present yet.

## How an ingest source becomes a Dagster asset

The pattern is "Python `@asset` invokes the existing TypeScript ingest as a subprocess, communicating via Dagster Pipes." The TS side adds ~5 lines (`openDagsterPipes()` + `context.reportAssetMaterialization(...)`) — when run outside Dagster (e.g. `npm run ingest:ssb-08764` locally), Pipes no-ops because the Dagster env vars are absent.

This means:

- **One image, two pod types**: the always-on code-location pod runs `dagster api grpc` and describes assets; ephemeral run pods spawned per materialisation execute them.
- **TypeScript source modules stay TypeScript** — no rewrite. The same ingest script works inside and outside Dagster.
- **Local dev unaffected**: `npm run ingest:*` works exactly as before.

See `atlas_data/assets/raw_ssb.py` for the canonical example.
