# Contributors

Welcome. This section is for people **developing Atlas itself** — adding data sources, writing dbt models, fixing bugs, opening PRs against the repo. If you want to *consume* Atlas's data (query the public API at `api.atlas.helpers.no` — PostgREST projecting the `api_v1.*` schema), the user-facing docs are at [the site root](../) and the API reference will be at `api.atlas.helpers.no/docs` (forthcoming).

## What is Atlas?

Atlas is an open semantic layer over Norwegian public data (SSB, FHI, Brreg) and NGO supply data (Red Cross, Folkehjelp, etc.), exposed via a public PostgREST API. Two top-level codebases:

- [`atlas-data/`](https://github.com/terchris/atlas/tree/main/atlas-data) — TypeScript ingest + dbt project. **Most contributor work happens here.**
- [`atlas-contributor-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-contributor-frontend) — Next.js diagnostics app reading `marts.*` directly (dev/staging only).
- [`atlas-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-frontend) — Next.js customer app consuming PostgREST (rebuilt under PLAN-005; under construction).

Read [data-journey.md](./data-journey.md) for the end-to-end walkthrough — it traces SSB 08764 from upstream to a user's browser. Reading that first makes everything else here make sense.

---

## Quick start

```bash
git clone https://github.com/terchris/atlas.git
cd atlas

# Bootstrap atlas_db on UIS Postgres (one-shot; creates db + role + auto-exposes :35432)
./uis configure postgresql --app atlas --database atlas_db --json

# Set up the ingest layer
cd atlas-data/ingest && npm install && cp .env.example .env
# Edit .env with the credentials from the JSON output above

# Apply schema migrations (creates raw.* schemas) and ingest one source
npm run migrate
npm run ingest:ssb-08764

# Set up dbt + load seeds + run all models
cd ../dbt
uv venv && uv pip install -r requirements.txt
uv run --env-file ../ingest/.env dbt deps
uv run --env-file ../ingest/.env dbt seed     # required on a fresh database
uv run --env-file ../ingest/.env dbt run
uv run --env-file ../ingest/.env dbt test
./check-osmosis.sh
```

If anything errors, see [setup.md](./setup.md) for the full first-time walkthrough including the common gotchas.

---

## Contributor tasks

### "I want to add a new data source"

Read [data-journey.md](./data-journey.md) first to see the end-to-end shape, then follow [adding-a-source.md](./adding-a-source.md) — the 11-step procedural workflow with an explicit completion criterion at every step. Most SSB-style sources land in ~30 minutes ingest + ~20 minutes dbt.

For the ingest-side template (`index.ts` shape, README structure, scraping convention) see [ingest-modules.md](./ingest-modules.md).

### "I want to change an existing model"

- Edit the `.sql` file under [`atlas-data/dbt/models/`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models).
- Update the corresponding `schema.yml` entry in the same change (descriptions, tests).
- Run `dbt run --select <model>+` and `dbt test --select <model>+` (the `+` includes downstream models). See [testing.md](./testing.md).
- Run `./check-osmosis.sh` to verify the description gate still passes — see [check-osmosis.md](./check-osmosis.md).

### "I want to understand schema.yml hygiene"

Atlas uses **dbt-osmosis** to propagate column descriptions across the dbt lineage, and **`check-osmosis.sh`** as the CI gate that fails any PR with an undocumented column. The descriptions become part of the public OpenAPI spec.

- [dbt-osmosis.md](./dbt-osmosis.md) — what it is, why Atlas uses it, two-pass convergence, propagation rules
- [check-osmosis.md](./check-osmosis.md) — the gate, what failure looks like, how to fix it

### "I want to understand the public API surface"

The external HTTP API at `api-atlas.helpers.no` is a **PostgREST** instance projecting the `api_v1.*` schema. Atlas auto-generates `api_v1` as wrapper views over `marts.mart_*` (one per `models/marts/api/` model); UIS deploys and operates PostgREST.

→ [api-v1.md](./api-v1.md) — what `api_v1` is, why it's separate from `marts.*`, the generator + apply workflow, the five validation gates, the deprecation flow.

### "I want to set up my dev environment"

→ [setup.md](./setup.md). Covers Node, uv, Postgres, env files, and the first-time smoke test.

### "I want to know what to run before opening a PR"

→ [testing.md](./testing.md). The PR-readiness checklist; what to run for ingest changes vs dbt changes vs schema-only changes.

### "I want to know how PRs work"

→ [git-workflow.md](./git-workflow.md). Branch naming, commit messages, multi-agent safety. For the agent-specific safety rules see [`/website/docs/ai-developer/GIT.md`](../ai-developer/GIT.md).

---

## Conventions you must follow

The full set is in [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/blob/main/docs/stack/naming-conventions.md). The most load-bearing rules:

1. **Canonical vocabulary.** Never invent variants of `kommune_nr`, `fylke_nr`, `orgnr`. Use exactly the names in naming-conventions.md.
2. **Every column described.** Repo-wide enforcement via [check-osmosis.md](./check-osmosis.md). PostgREST projects descriptions verbatim into the public OpenAPI spec, so this is documentation visible to external developers.
3. **Don't leak `raw.*` shapes into `marts.*`.** Reshape at the dbt passthrough; raw is verbatim landing.
4. **`relationships:` test for every FK.** If a column conceptually points at a `dim_*`, declare it.
5. **One PLAN, one PR is the default.** Phase-by-phase PRs are fine for large PLANs.

---

## Where things live

| Topic | Page |
|---|---|
| First-time setup | [setup.md](./setup.md) |
| End-to-end data journey (read first) | [data-journey.md](./data-journey.md) |
| Add a new data source | [adding-a-source.md](./adding-a-source.md) |
| Ingest module template | [ingest-modules.md](./ingest-modules.md) |
| dbt-osmosis description propagation | [dbt-osmosis.md](./dbt-osmosis.md) |
| The description gate (`marts.*`) | [check-osmosis.md](./check-osmosis.md) |
| The public API wrapper layer (`api_v1.*`) | [api-v1.md](./api-v1.md) |
| Local testing before a PR | [testing.md](./testing.md) |
| Git workflow + multi-agent safety | [git-workflow.md](./git-workflow.md) |

In-repo references for things this section *summarises* (canonical content lives here):

- [`atlas-data/CONTRIBUTING.md`](https://github.com/terchris/atlas/blob/main/atlas-data/CONTRIBUTING.md) — pointer to this section
- [`atlas-data/dbt/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/README.md) — dbt project layout + day-to-day commands cheatsheet
- [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md) — the implemented-sources catalogue (1 row per source, current state)

---

## For AI agents

If you're an AI agent (Claude Code, Cursor, etc.) working on the repo, the agent-specific reading order lives in [`/CLAUDE.md`](https://github.com/terchris/atlas/blob/main/CLAUDE.md) at the repo root, and the planning conventions in [`/website/docs/ai-developer/`](../ai-developer/). The contributor pages here apply to you too — read them first, then the agent-specific docs for the procedural details.
