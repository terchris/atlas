# Migrations

Plain SQL files defining Atlas's schema namespaces and its `raw.*` landing tables. Files are numbered and applied in order.

Scope is intentionally narrow: **schema namespaces, and `raw.*` landing tables**. The contents of `marts.*` and `api_v1.*` are not owned here — dbt builds the marts tables, and [`api_v1_generated.sql`](../dbt/api_v1_generated.sql) builds the wrapper views after `dbt run`. Migrations create the *namespaces* those land in, plus the raw tables dbt sources read from.

Creating an empty `api_v1` here is what lets a fresh UIS install configure PostgREST before any transform has run — see [`050_create_api_v1_schema.sql`](050_create_api_v1_schema.sql) for why.

## Conventions

- File name: `NNN_short_description.sql`, zero-padded to three digits.
- Every statement is idempotent (`create schema if not exists`, `create table if not exists`, etc.).
- **Idempotent per file is not enough — the *set* must converge.** The runner keeps no bookkeeping
  table ([`migrate.ts`](../ingest/scripts/migrate.ts)); every run re-applies every file, so the
  schema after one run must equal the schema after two. `051` exists because that was not true:
  `006`/`007` set comments *unconditionally*, `008` changes those tables' shape behind a guard, so
  from the second run onward the old comments outlived the shape they described. Each file was
  individually idempotent and the set still did not converge until `n=2`.
  **If you add a migration that alters something an earlier one describes, re-assert the
  description in your own file** — the earlier `COMMENT` will fire again on the next run.
  The check is cheap: apply `*.sql` twice to a throwaway database and `diff` two `pg_dump
  --schema-only` outputs (ignore pg_dump's random `\restrict` line).
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

Run `ls *.sql` for the full list — it is long and this table went stale when it
tried to mirror it. Only the files that create *schemas* are worth calling out:

| # | File | What it does |
|---|---|---|
| 001 | `001_create_schemas.sql` | Creates the `raw` and `marts` schemas |
| 026 | `026_private_schemas.sql` | Creates the `private_raw` and `private_marts` schemas |
| 050 | `050_create_api_v1_schema.sql` | Creates the `api_v1` schema, empty, so a fresh install can configure PostgREST |

Every other file creates one `raw.*` landing table (or amends one).

## When we outgrow this

At some point we'll want proper tracking (a `schema_migrations` table recording which versions have been applied). Tools: [sqitch](https://sqitch.org/), [node-pg-migrate](https://github.com/salsita/node-pg-migrate), or dbt's own `dbt-labs/dbt-external-tables`. Adopt one when we have more than ~10 migrations or need to coordinate across environments.
