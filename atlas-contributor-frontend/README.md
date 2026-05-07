# atlas-contributor-frontend

The **internal diagnostics** Next.js app for Atlas contributors. Reads `marts.*` directly from Postgres (uses `postgres.js`, has a DB role) — used to verify ingest output, inspect dbt-built models, and debug per-NGO data shape during contributor work. Default port `4000`.

**Not deployed publicly.** Lives only on dev / staging boxes; never reachable from `*.helpers.no`. The customer-facing app at [`atlas-frontend/`](../atlas-frontend/) is the only Next.js surface external users ever see.

This is one of Atlas's [two frontends](../website/docs/contributors/frontends.md). Read that doc to understand when to use which — short version: this one is for contributors verifying their own data work; the other is the public app.

## Run locally

```bash
cd atlas-contributor-frontend
cp .env.example .env.local         # set DATABASE_URL to your atlas_db
npm install
npm run dev
```

Default dev URL: <http://localhost:4000>. (The customer app `atlas-frontend/` runs on port 3001; this app uses 4000 so they coexist.)

For the pages to render, your local Postgres needs `atlas_db` populated — at minimum the dim spine + one ingest source + a `dbt run`. See [`website/docs/contributors/setup.md`](../website/docs/contributors/setup.md) for the full bootstrap.

## What's in here

App routes under `app/`:

- **`/`** — landing page
- **`/admin`** — operational dashboard (ingest run history, source freshness)
- **`/coverage-gap`** — coverage-gap explorer for the barnefattigdom indicator
- **`/data`** — table-by-table mart browser (every `marts.*` model, raw SQL view)
- **`/kommuner`** — per-kommune drill-down with map (`maplibre-gl`)
- **`/ngo`** — per-NGO chapter + activity browser

Plus `extract:redcross` script for one-off Red Cross data prep work.

## Why direct Postgres, not PostgREST

This app is for **contributors verifying their own work** during ingest + dbt iteration. It needs:

- Arbitrary SQL across `marts.*` and `raw.*` (sometimes ad-hoc joins between half-built models)
- Visibility into dev-only `private_marts.*` data (e.g. FRR resource details for Red Cross integration testing) — these never go through PostgREST
- Fast iteration when a dbt model changes shape and you need to see the new columns *now* without regenerating the API spec

The PostgREST app (`atlas-frontend/`) is the wrong tool for this work — its whole reason for existing is to enforce the public-API contract. Contributor diagnostics need to bypass that contract.

The trade-off: this app has a DB driver, so it's structurally unable to be deployed as a public frontend. That's enforced by the architecture, not by policy — `postgres.js` requires a DB role, and giving the public a role on `atlas_db` is the thing the entire PostgREST architecture is designed to avoid.

## What's deliberately not in here

- **No PostgREST client code.** That lives in `atlas-frontend/src/lib/api.ts`. If a feature can be built against the public API, build it there — it auto-deploys; this app doesn't.
- **No customer-facing routes** (`/finn`, `/lag`, `/innsikt`, etc.). Those are the customer app's territory.
- **No design-system parity guarantee with `atlas-frontend/`.** Both happen to use Tailwind + Digdir Designsystemet today, but they're not required to track each other — one is internal, one is public, different audiences.

## See also

- [`website/docs/contributors/frontends.md`](../website/docs/contributors/frontends.md) — the WHY behind two frontends, when to use which.
- [`atlas-frontend/`](../atlas-frontend/) — the sibling customer app. PostgREST consumer. Forkable as a reference.
- [`website/docs/contributors/setup.md`](../website/docs/contributors/setup.md) — first-time bootstrap including `atlas_db` setup and dbt run.
- [`website/docs/contributors/data-journey.md`](../website/docs/contributors/data-journey.md) — end-to-end walkthrough; reading it makes everything else here make sense.
