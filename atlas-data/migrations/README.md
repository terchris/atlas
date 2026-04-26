# Migrations

Plain SQL files defining the `raw.*` landing schema. Files are numbered and applied in order.

Scope is intentionally narrow: **raw landing tables only**. The `marts.*` schema is owned by dbt — it creates and rebuilds those tables itself. Migrations here only create schemas and raw tables that dbt sources read from.

## Conventions

- File name: `NNN_short_description.sql`, zero-padded to three digits.
- Every statement is idempotent (`create schema if not exists`, `create table if not exists`, etc.). Re-running is always safe.
- One logical change per file. Don't amend an applied migration — add a new one.
- Comments (`comment on …`) explain the role of each table and non-obvious columns.

## Applying migrations

From `atlas-data/ingest/`, with `DATABASE_URL` set in `.env`:

```bash
npm run migrate
```

This runs all `migrations/*.sql` files in order, via the tiny [`scripts/migrate.ts`](../ingest/scripts/migrate.ts) runner. Idempotent — run as often as you want.

Alternatively, with `psql` installed:

```bash
for f in migrations/*.sql; do psql "$DATABASE_URL" -f "$f" || exit 1; done
```

## Current migrations

| # | File | What it does |
|---|---|---|
| 001 | `001_create_schemas.sql` | Creates `raw` and `marts` schemas |
| 002 | `002_raw_ssb_08764.sql` | Creates `raw.ssb_08764` landing table |

## When we outgrow this

At some point we'll want proper tracking (a `schema_migrations` table recording which versions have been applied). Tools: [sqitch](https://sqitch.org/), [node-pg-migrate](https://github.com/salsita/node-pg-migrate), or dbt's own `dbt-labs/dbt-external-tables`. Adopt one when we have more than ~10 migrations or need to coordinate across environments.
