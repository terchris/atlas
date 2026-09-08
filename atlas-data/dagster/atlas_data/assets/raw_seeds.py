"""
@asset wrappers for SEED sources — ingest/src/seed-sources/, wired to
`npm run refresh:<id>` rather than `ingest:<id>`.

Seeds are reference data: code lists, classification tables, the NGO landscape.
Most of them are genuinely static and are refreshed by hand when someone
notices upstream has moved. They are not declared as dbt sources and nothing
asserts anything about their age, which is the right treatment for a code list
that changes when SSB reorganises a classification.

`brreg-enheter` is the exception, and it is the only seed here.

## Why brreg-enheter is an asset and the other eight are not

It is the only seed declared as a dbt source with a `loaded_at_field`, because
it is not reference data at all — it is a live view of Brreg's Enhetsregister,
carrying `konkurs`, `under_avvikling` and `under_tvangsavvikling` flags that
downstream "active NGO?" queries filter on. A dissolved lokallag that Atlas
still reports as active is a wrong answer, not a stale one.

Its own README said so, and set the condition for fixing it:

    Refresh cadence. Manual. Brreg-side churn is slow (a few new Folkehjelp
    lokallag per year, occasional konkurs or dissolution flag flips).
    **Add a cron when Atlas has a job-runner.**

Atlas has had a job-runner since the declarative-automation pilot. The
condition was met and nobody went back to the note — the gap surfaced only
when the ingest-freshness test started reporting raw.brreg_enheter as
permanently stale, correctly, for three weeks.

## Why monthly rather than weekly

The README's own churn estimate — "a few per year, occasional flag flips" —
does not justify a weekly poll of Brreg's API on Atlas's behalf. MONTHLY_CRON
already exists for exactly this class of source (the KLASS classifications),
and the matching 35-day bound in the dbt freshness test is derived from it.

⚠️ Cadence is declared in TWO places that must agree: the automation condition
here, and `meta.ingest_cadence` on the source in dbt/models/shared/sources.yml.
Nothing enforces the match — change one, change the other. That coupling is
the known soft spot; see the header of
dbt/tests/raw_sources_were_refreshed_recently.sql.

## What had to change on the TypeScript side

The factory calls `get_materialize_result()`, which needs the subprocess to
have opened Dagster Pipes and reported a materialisation. All 42 sources under
src/sources/ do that via `recordIngestRun()`; **no seed source did**, so this
could not simply be pointed at the existing script. brreg-enheter now wraps its
work in `recordIngestRun()` like the rest, which also gives it a row in
raw.ingest_runs and a line in mart_ingest_health.

Any other seed promoted to an asset needs the same wrapping first. Pointing an
asset at an unwired `refresh:` script fails at the end of an otherwise
successful run, which is a confusing way to find out.
"""

from atlas_data.assets._factory import make_raw_ingest_assets
from atlas_data import cadence

SEED_SOURCES = [
    "brreg-enheter",
]

assets = make_raw_ingest_assets(
    SEED_SOURCES,
    group_name="raw_seeds",
    automation_condition=cadence.monthly_polled(),
    freshness_policy=cadence.MONTHLY_FRESHNESS,
    npm_script_prefix="refresh",
)
