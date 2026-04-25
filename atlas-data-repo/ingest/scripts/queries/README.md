# queries/ — ad-hoc and debugging scripts

Small TypeScript scripts that ask a specific question of the database. Lives separately from the operational scripts (`migrate`, `verify-frr`, `validate-frr`) because these are throwaway / one-off / written for a particular investigation.

## When to put a script here

- **Ad-hoc query** — "show me all resources matching X" written to answer one question, never run again. Example: `query-gol-snoskuter.ts`.
- **Debugging investigation** — "why is this row count off?" written to figure out what's going on. May be re-run if the same kind of bug surfaces again. Example: `diagnose-frr.ts`.

## When NOT to put a script here

- Re-runnable operational tooling (migrators, validators, ingest scripts) — those go in the parent `scripts/` directory.
- Anything that produces persistent data — write a real ingest script under `ingest/src/sources/`.
- Tests — those belong with the dbt project (`dbt test`) or as proper Vitest unit tests.

## Naming

- `query-<topic>.ts` for ad-hoc queries
- `diagnose-<topic>.ts` for debugging investigations

## Running

From the repo root:

```bash
npx tsx --env-file=atlas-data-repo/ingest/.env \
  atlas-data-repo/ingest/scripts/queries/<script-name>.ts
```

## Lifetime

These scripts have no upgrade discipline — they may rot when the underlying schema changes and that's fine. If a script becomes valuable enough to keep current, promote it to operational tooling in `scripts/` and add a test.
