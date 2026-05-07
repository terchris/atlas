# The two frontends

Atlas has **two** Next.js apps with deliberately different access patterns. New contributors hit confusion on this regularly: "where do I add my page?" depends entirely on which audience the page is for. This doc settles the choice.

## At a glance

| | [`atlas-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-frontend) | [`atlas-contributor-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-contributor-frontend) |
|---|---|---|
| **Audience** | The public — anyone visiting `atlas.helpers.no` | Atlas contributors verifying their own work |
| **Reads from** | `api-atlas.helpers.no` (PostgREST, HTTP) | `atlas_db` directly (`postgres.js` driver) |
| **DB role?** | None | Yes — needs SELECT on `marts.*` + `raw.*` + `private_marts.*` |
| **Deploys to** | `atlas.helpers.no` (production) | Dev / staging only — **never public** |
| **Default port (local)** | `3001` | `4000` |
| **Forkable?** | Yes — explicitly designed as a reference for external developers | No — Atlas-internal |
| **Sees private data?** | No (`private_*` schemas not exposed via PostgREST) | Yes (e.g. FRR resource details for Red Cross verification) |
| **Has `postgres.js`?** | No, never will | Yes |
| **Imports from `atlas-data/`?** | No, never will | OK |

## Why the split exists

The constraint is **forkability**. The customer app is meant to be cloned by external developers (NGOs, journalists, civic-tech projects) who want to build their own UI on top of Atlas's public API. For that to work, the customer app:

- **Cannot** import types from `atlas-data/` (forks won't have that folder).
- **Cannot** use a Postgres driver (forks won't have `atlas_db`).
- **Cannot** use Atlas-internal conventions (forks won't follow them).

Once you accept those constraints, the customer app becomes structurally unable to do contributor work — there's no way to write an "ad-hoc SQL query against `marts.*` to verify my new dbt model" page in something that isn't allowed to talk to Postgres. So the contributor diagnostic surface lives in a separate app, with the opposite constraint set: full SQL access, internal-only, never deployed publicly.

The full architectural rationale (rejected alternatives, security boundary, why not a single app with role-gated access) is at [`INVESTIGATE-frontend-data-access-architecture.md`](../ai-developer/plans/completed/INVESTIGATE-frontend-data-access-architecture.md). Read it once if you want the full reasoning; for day-to-day work, this page is enough.

## Which one do I add my feature to?

Ask: **who's using this page?**

- **End users on `atlas.helpers.no`** (Kari, Jonas, Amira, Lars, Tone, Ola, Lisa, Sara…) → [`atlas-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-frontend). The feature must be expressible against the public PostgREST surface (`api_v1.*`, `marts.*`, `raw.*` via `Accept-Profile`). If it can't be, the data shape needs work first — add the missing dbt model under `models/marts/api/` so it auto-publishes via `api_v1.*`.

- **Atlas contributors verifying their own work** during ingest + dbt iteration → [`atlas-contributor-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-contributor-frontend). Anything that needs ad-hoc SQL, joins across half-built models, visibility into `private_marts.*`, or fast iteration on a dbt model that hasn't been wrapped in `api_v1.*` yet.

- **Both audiences** → start in `atlas-contributor-frontend/` to validate the data shape, then re-implement the public-facing slice in `atlas-frontend/` once the dbt model + `api_v1.*` wrapper are stable.

## Conventions

### Adding a feature to `atlas-frontend/`

- Build it as an introspection-driven page where possible (catalog reads from `meta_endpoints`, source pages read from `meta_sources`). Avoid hardcoded endpoint lists — that's the whole point of the API-driven design.
- If the feature needs a new endpoint, add a model under `atlas-data/dbt/models/marts/api/` and re-run `./regenerate-api-v1.sh`. The PLAN-004 generator wraps it as `api_v1.<name>` automatically; PostgREST picks it up; the customer app sees it on next page load.
- Keep `src/lib/api.ts` as the single PostgREST client — never write a one-off `fetch()` in a page component.
- No `postgres`, `pg`, `prisma`, `drizzle`, or any other DB driver. The PR will be rejected if any appear in `package.json`.

### Adding a feature to `atlas-contributor-frontend/`

- Direct SQL via `postgres.js` is fine; no need to round-trip through PostgREST.
- The Designsystemet + Tailwind setup mirrors `atlas-frontend/`'s today, but they're not coupled — change one without changing the other.
- Treat `private_marts.*` access as routine; this app's whole point is being able to see those tables.
- If the feature could realistically serve external users, flag it in the PR as "consider porting to `atlas-frontend/` once the underlying dbt model is in `marts/api/`."

### What never moves between apps

- **DB driver code** (`postgres`, connection strings, env vars like `DATABASE_URL`) → stays in `atlas-contributor-frontend/`.
- **PostgREST client code** (`api.ts`, `api-types.ts`, `Accept-Profile` headers) → stays in `atlas-frontend/`.
- **Routes containing personal data** (FRR resource details, anything from `private_marts.*`) → stays in `atlas-contributor-frontend/`. Never a customer-app concern.

## See also

- [`atlas-frontend/README.md`](https://github.com/terchris/atlas/tree/main/atlas-frontend/README.md) — customer app orientation + how to fork.
- [`atlas-contributor-frontend/README.md`](https://github.com/terchris/atlas/tree/main/atlas-contributor-frontend/README.md) — contributor app orientation + the routes it ships.
- [`setup.md`](setup.md) — bootstrap for both, including the `(Optional) Set up the frontends` section.
- [`INVESTIGATE-frontend-data-access-architecture.md`](../ai-developer/plans/completed/INVESTIGATE-frontend-data-access-architecture.md) — the architectural rationale (forkability, no DB role, three-tier deployment) the split is based on.
