# Testing your change

What to run before opening a PR. Atlas's CI is light today (the gates are mostly local-discipline); a clean run of these commands locally is the bar for "ready to merge."

If you've never set up the dev environment, start at [setup.md](./setup.md).

---

## The PR-readiness checklist

Before opening a PR, every box must be true. Run from the repo root unless noted.

```bash
# In atlas-data/ingest:
npm run typecheck     # TypeScript compile — zero errors

# Only when ingest code changed:
npm run ingest:<source-id>   # Smoke-test the ingest module end-to-end

# In atlas-data/dbt:
uv run --env-file ../ingest/.env dbt parse                            # Syntax + ref/source resolution
uv run --env-file ../ingest/.env dbt run --select <models touched>+   # Build affected models
uv run --env-file ../ingest/.env dbt test --select <models touched>+  # All tests pass, zero warns
./check-osmosis.sh                                                    # Strict ✓, TOTAL = 0
uv run --env-file ../ingest/.env dbt-osmosis yaml document --dry-run --check  # exit 0
```

The `+` after a model name means "this model and everything downstream." Use it whenever you change a model that other models read from — otherwise you'll miss test failures one hop downstream.

---

## When to run what

### Ingest changes (TypeScript)

If you changed code under `atlas-data/ingest/`:

```bash
cd atlas-data/ingest
npm run typecheck
npm run ingest:<source-you-touched>
```

The smoke-test verifies the module still produces rows. Spot-check the row count with:

```bash
psql "$DATABASE_URL" -c "select count(*) from raw.<source>;"
```

### dbt model changes (SQL)

If you changed a `.sql` file under `atlas-data/dbt/models/`:

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt run --select <model>+
uv run --env-file ../ingest/.env dbt test --select <model>+
```

The `+` ensures downstream models rebuild and their tests run too — you'll catch shape regressions immediately.

### schema.yml changes (descriptions, tests)

If you only changed `schema.yml` (not `.sql`), `dbt parse` plus the osmosis check is sufficient — `dbt test` would just re-run existing tests against unchanged tables.

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt parse                            # syntax check
./check-osmosis.sh                                                    # description gate
uv run --env-file ../ingest/.env dbt-osmosis yaml document --dry-run --check  # idempotency
```

Skip `dbt test` for description-only changes — see [dbt-osmosis.md § when you don't need to run osmosis](./dbt-osmosis.md#when-you-dont-need-to-run-osmosis).

### Migration files

A new `migrations/NNN_*.sql`:

```bash
cd atlas-data/ingest
npm run migrate    # idempotent — must succeed
```

Re-run it. If it fails on the second run, the migration isn't idempotent — fix it.

### Frontend changes

```bash
cd atlas-contributor-frontend
npm run typecheck
npm run build
```

There's no end-to-end test today; verify the change works by clicking through the affected route in `npm run dev`.

---

## What CI runs

`ingest-ci.yml` runs `npm run typecheck` and `npm test` for `atlas-data/ingest` on every PR touching it, on Node 22. Before 2026-08-25 **nothing did** — the 104 unit tests were enforced by no workflow at all, which is how a typecheck failure sat on `main` unnoticed.

CI configuration is currently minimal — most gates are run locally. The known gates that will block a merge:

- **`check-osmosis.sh` strict mode** — fails CI if any column lacks a description. Required because PostgREST projects descriptions verbatim into the public OpenAPI spec.
- **`dbt parse`** — catches `schema.yml` syntax errors and broken `ref()` / `source()` references.
- **TypeScript compile** — `npm run typecheck` in `atlas-data/ingest/` and `atlas-contributor-frontend/`.

CI does **not** currently run `dbt run` / `dbt test` (it would need a live Postgres). Reviewer responsibility to verify these passed locally before requesting merge.

---

## Reading test output

dbt prints `PASS=N WARN=N ERROR=N TOTAL=N` at the end of every `dbt test` run.

- **`ERROR > 0`** — block. A required test failed (e.g. `not_null` violated, FK pointing at a missing row).
- **`WARN > 0` (and unchanged from baseline)** — accept. Atlas has a small set of `severity: warn` tests for known data-quality cases (e.g. Svalbard kommune `2100` not in `dim_kommune`). Compare against the previous-known WARN count — if it went up, investigate.
- **`PASS > 0`, `WARN = 0`, `ERROR = 0`** — green.

For the current accepted-WARN baseline see [PLAN-002 outcome](../ai-developer/plans/completed/PLAN-002-fill-schema-yml-description-gaps.md).

---

## Common test-failure recipes

### `not_null` violated on a new column

Either the upstream genuinely has a NULL, or the ingest module is dropping the value. Check upstream first; only relax the test if NULL is semantically valid.

### `relationships` violated (FK)

The target dim doesn't have the row your fact references. Causes:

- The dim was built from a different upstream snapshot than the fact (re-run both).
- A real data-quality issue — upstream emits a code that isn't canonical (see Svalbard / `2100`). Soften to `severity: warn`, document in the description.

### `unique_combination_of_columns` violated

Your model emits duplicate rows for the same natural key. Almost always a join-fan-out — a 1:N join produced more rows than expected. Fix the join, don't relax the test.

### `accepted_values` violated

Upstream introduced a new value not in your enum. Decide: add it (new value is valid), or filter it out in the model (new value is wrong / unsupported).

### `accepted_range` on year violated

Upstream is publishing a year outside the bounds you set. If valid, expand the range; if not (e.g. 1900 placeholder), filter.

### `check-osmosis.sh` strict fails

A new column appeared without a description. See [check-osmosis.md § how to fix a failure](./check-osmosis.md#how-to-fix-a-failure).

---

## A test that exists is not a test that runs

Four separate defects in the Dagster integration came from the same mistake, and
none of them made anything fail — they made things *quietly stop being checked*.
Worth knowing before you add a test, because each looked correct at the level it
was checked at:

| What was verified | What was actually true |
|---|---|
| The test is in the repo (`git`) | `dbt/tests/` was never copied into the image |
| The test is in the image | It was absent from the compiled `manifest.json` |
| The test is in the manifest | Nothing invoked it — no `ref()`, so no parent asset, so no asset check |
| The guard against all this | Shipped inert for the same reason, protecting nothing |

The pattern: **evidence one level away from where the thing actually runs.** A
green CI log says the build succeeded, not that the test executes in a cluster.

Two practical rules follow.

**Singular tests need a `ref()`, or they need re-homing.** dagster-dbt turns a dbt
test into an asset check by looking at the model it depends on. A singular test in
`dbt/tests/` that queries relations by name — `select ... from api_v1.foo` — has no
parent, gets no check, and nothing in the pipeline runs it. Either `ref()` the model
it is really about, or write it as a Python asset check on the asset that owns the
thing (see `atlas-data/dagster/atlas_data/assets/api_v1.py`). The image build now
fails naming any singular test nothing runs, so this is enforced rather than
remembered.

**Make a new guard fail once, on purpose, before trusting it.** Every guard in this
repo was verified in both directions — the ENOENT fix was reproduced before it was
fixed, and the fan-out guard was run against the pre-fix model to watch it fail. A
guard that has never failed is a guard nobody has tested, and this codebase has
shipped exactly that.

---

## Cross-references

- [setup.md](./setup.md) — first-time dev environment
- [adding-a-source.md](./adding-a-source.md) — the workflow these tests gate
- [dbt-osmosis.md](./dbt-osmosis.md) — schema.yml description propagation
- [check-osmosis.md](./check-osmosis.md) — the strict description gate
- [git-workflow.md](./git-workflow.md) — branch / commit / PR conventions
