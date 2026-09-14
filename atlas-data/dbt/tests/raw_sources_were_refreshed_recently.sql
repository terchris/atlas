-- Singular dbt test: every scheduled raw source must have been refreshed within
-- the window its own declared cadence allows.
--
-- WHY THIS EXISTS
--
-- On 2026-08-30, fifteen of forty-one sources silently failed to refresh. The
-- transform then ran happily on stale raw data and the check suite returned
-- exactly the same numbers as the night before: 649 total, 632 pass, 17 WARN.
-- Every signal was green while a third of the data had not moved.
--
-- Nothing in the suite distinguished "refreshed, and the numbers happen to be
-- identical" from "never refreshed at all". This test is that distinction.
--
-- WHY dbt's OWN SOURCE FRESHNESS DID NOT CATCH IT
--
-- `freshness:` blocks are already declared on these sources with
-- `loaded_at_field: loaded_at`. They did not help, for two independent reasons,
-- and both had to be true for the failure to stay invisible:
--
--   1. `dbt source freshness` is a SEPARATE COMMAND. It is not part of
--      `dbt test` or `dbt build`, so it never ran in the check suite at all.
--   2. The declared thresholds are publication-cadence thresholds — warn after
--      400 days, error after 800 — because they describe how often SSB
--      publishes, not how often we ingest. Twelve-day-old data passes those
--      trivially, and so would twelve-month-old data.
--
-- Those thresholds are not wrong; they answer a different question. This test
-- answers the ingest question, inside the suite, where the rest of the checks
-- already run.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY THIS ASKS "HOW OFTEN", NOT "WHETHER" — the 2026-09-08 correction
-- ══════════════════════════════════════════════════════════════════════════
--
-- The first version of this test asserted ONE threshold — 8 days — over every
-- source, with an escape hatch listing name prefixes that were exempt. That
-- encoded a false assumption, and the escape hatch was the wrong shape.
--
-- **Not every source is weekly.** `cadence.py` has had two cadences since the
-- automation pilot: WEEKLY_CRON and MONTHLY_CRON. `ssb_klass_kommuner` and
-- `ssb_klass_fylker` poll on the 1st of the month. Against a fixed 8-day bound
-- they turn red on the 9th and stay red until the 1st — roughly 23 red days in
-- every 31, for two sources behaving exactly as designed.
--
-- That is cry-wolf by construction, which is the precise failure this test was
-- written to prevent, reintroduced by the test itself. On the cluster it was
-- measured to cross at 2026-09-13 03:10Z and would then have stayed red until
-- 10-01: eighteen consecutive red days on its first instance, and the steady
-- ~23-in-31 thereafter.
--
-- ⚠️ PREDICT FRESHNESS FROM RUN HISTORY, NOT FROM THE CRON. This crossing was
-- first predicted for 09-09 by reading MONTHLY_CRON and assuming the last load
-- was the 1st. It was four days later, because a tester had hand-refreshed
-- klass on 09-05 while proving something unrelated. Agents write to these
-- tables too, so `loaded_at` reflects the cron plus whoever has been poking the
-- cluster — and a manual refresh silently moves a boundary you are predicting
-- against. The mechanism was right and the date was wrong; on a test whose
-- whole purpose is telling real staleness from apparent staleness, that is the
-- distinction worth getting right.
--
-- A binary exempt/not-exempt flag could not have expressed the fix, because the
-- klass sources are not exempt — they must absolutely be checked, just not at
-- eight days. So the declaration now carries the CADENCE and the threshold is
-- derived from it. There is one number per cadence, in one place, and adding a
-- cadence to `cadence.py` without adding it here fails at compile time.
--
-- WHAT IT ASSERTS
--
-- For every raw source that declares a `loaded_at_field`, the newest value of
-- that field must be within the window its `meta.ingest_cadence` allows.
--
-- A table whose max is NULL — no rows at all — is also a failure. "Never
-- loaded" and "loaded long ago" are the same defect from a consumer's point of
-- view, and treating an empty table as passing is how this class of bug hides.
--
-- ══════════════════════════════════════════════════════════════════════════
-- DECLARING CADENCE — every source with a loaded_at_field must do this
-- ══════════════════════════════════════════════════════════════════════════
--
--     meta:
--       ingest_cadence: half_hourly | daily | weekly | monthly | manual | none
--       cadence_note: >-          # REQUIRED for `manual` and `none`
--         why this source has no bound
--
-- The interval values must match the asset's `automation_condition` in the
-- Dagster package. This file does not read `cadence.py` — the two are coupled
-- by convention, and that coupling is the known soft spot in this design.
--
-- 🔴 THAT SOFT SPOT BIT ON 2026-09-12, AND IT BROKE THE WHOLE CHECK JOB.
--
-- The Brreg sources were declared `daily` and `manual` when neither existed in
-- the cadence map, so the test raised a compiler error — correctly — and
-- `transform_checks` could not compile at all. It had been failing every run
-- since those sources landed, and was found by imac executing it three times
-- unattended rather than by anyone reading the file.
--
-- ⚠️ Then the cron moved to half-hourly and `sources.yml` was not updated with
-- it, so two of them were declared `daily` while polling every thirty minutes.
-- **The coupling is not merely a soft spot in theory; it has now been the same
-- defect twice in one day.** Anything that changes `cadence.py` must change this
-- file in the same commit.
--
-- 🔵 The design held even as the declaration failed: refusing to compile is why
-- this was findable at all. A version that defaulted an unknown cadence to a
-- weekly bound would have run green over sources it was silently mis-checking.
--
-- ⚠️ `none` AND `manual` ARE THE TWO VALUES THAT SILENCE A ROW, so they are the
-- two that can turn this test into decoration. Both must be argued for in
-- writing. They are NOT the same claim: `none` says nothing will ever refresh
-- this; `manual` says a human refreshes it deliberately and there is no interval
-- at which it becomes wrong. Keep them apart — collapsing them is how a
-- bootstrap ends up with a freshness bound and someone wonders why it is
-- permanently red. That is why it is the only one that must be argued for
-- in writing, at the declaration, where the next reader meets it. **If a source
-- is late, fix the source.** Reach for `none` only when the honest answer is
-- "nothing will ever refresh this", and say what makes that true.
--
-- The four that legitimately carry it today are two of a kind each:
--
--   sitemap_log, ingest_runs      library bookkeeping, not ingested sources.
--                                 The scraping library writes them as a side
--                                 effect of other sources' runs.
--   redcross_branches, and its    parked pending an API credential; no
--   _branch_activities            automation condition, so it cannot refresh.
--
-- ⚠️ `ingest_runs` was PASSING before it was declared `none`, which is why it
-- was never noticed. It was green because other ingests happened to be running
-- — luck, not a cadence. A source that passes for a reason unrelated to what
-- the test claims to measure is not evidence of anything, and the day the luck
-- changed it would have reported a fault in the wrong place entirely.
--
-- ⚠️ There was also, from the first version until 2026-09-08, an exemption for
-- `frr_` carrying a paragraph of justification. It never excluded anything:
-- `frr_resources` declares no `loaded_at_field`, so the guard below had always
-- skipped it. It read exactly like coverage for three weeks. A mechanism whose
-- entries can be inert is a bad mechanism, which is the second reason the
-- prefix list is gone: `meta` cannot be attached to a source that isn't there.
--
-- THIS TEST MUST BE SEEN TO FAIL BEFORE IT IS TRUSTED
--
-- This repo has shipped a guard that protected nothing, and a green uniqueness
-- test once masked the RISK-1 fan-out for long enough to nearly fill a disk.
-- Run it against known-stale data and watch it go red before believing a green.
--
-- WHAT IT DOES NOT COVER
--
-- If the orchestrator's daemon stalls, no schedule fires, no transform runs and
-- no check runs — so this test cannot report that the suite did not run. That
-- half needs a reader outside the pipeline and is tracked in
-- INVESTIGATE-ingest-freshness-visibility.

-- HOW THIS TEST GETS RUN AT ALL — read before removing the ref() below
--
-- A singular dbt test that references only sources has no parent model, so
-- dagster-dbt attaches it to no asset and NOTHING EVER RUNS IT. It sits in the
-- manifest looking exactly like coverage. The image build refuses to ship in
-- that state (`atlas-data/deploy/Dockerfile`, the singular-test reachability
-- assertion), and it caught this test on its first CI run — which is the guard
-- doing precisely the job it was written for.
--
-- ✅ That edge used to be a bare `-- depends_on:` hint pointing at
-- `fact_kommune_indicators`, a model this test did not read. It was honest —
-- the fact table is only trustworthy if the raw inputs behind it are current —
-- but it was a hint, and a hint is exactly the kind of line someone tidies away.
-- The test now SELECTS from `mart_source_freshness`, so the edge is a real
-- dependency that cannot be removed without breaking the query. Reachability
-- stopped being a convention and became the thing the test is made of.

{#-
  🔴 THE COMPARISON MOVED; THE GATE DID NOT.

  This test used to compute max(loaded_at) over every source itself. That
  computation now lives in `mart_source_freshness`, a VIEW — because the verdict
  needed to be readable by `atlas-status.py`, which cannot see dbt run results or
  Dagster's event log, and so reported a 24-hour window that could not see a
  weekly source go stale at all (ops-dev, urb-agents #1039).

  ⚠️ What stayed here is everything that makes this a GATE rather than a
  surface: the declaration validation below, which refuses to compile on a
  missing, unargued or invented cadence. That refusal is load-bearing — it is
  why the 2026-09-12 mis-declaration was findable — and it belongs on the check
  job, where a bad declaration stops the suite, rather than on a model, where it
  would stop the publish.

  🔵 One computation, two readers, and the reader cannot disagree with the gate
  because it is the same rows. The bounds are `vars` in dbt_project.yml with NO
  default here: a second default is a second number that must agree, which is
  the failure this project keeps meeting.
-#}
{% set cadence_max_age = var('ingest_cadence_max_age_days') %}

{% if execute %}
    {% set errors = [] %}

    {% for node in graph.sources.values() | sort(attribute='name') %}
        {% if node.loaded_at_field %}
            {% set cadence = node.meta.get('ingest_cadence') %}

            {% if not cadence %}
                {#- A new source must state its cadence. Defaulting one in is how
                    the klass sources acquired a threshold nobody chose. -#}
                {% do errors.append(
                    node.name ~ ": declares loaded_at_field '" ~ node.loaded_at_field ~
                    "' but no meta.ingest_cadence. Add half_hourly, daily, weekly,"
                    " monthly, manual or none (manual and none also require"
                    " meta.cadence_note)."
                ) %}

            {% elif cadence == 'none' %}
                {#- Silencing a row is the one action that must be argued for. -#}
                {% if not node.meta.get('cadence_note') %}
                    {% do errors.append(
                        node.name ~ ": meta.ingest_cadence is 'none' but there is no"
                        " meta.cadence_note. 'none' claims the source will never refresh;"
                        " say what makes that true."
                    ) %}
                {% endif %}

            {% elif cadence == 'manual' %}
                {#- 'manual' is excluded like 'none', and it is a SEPARATE category
                    on purpose. 'none' means nothing refreshes this. 'manual' means
                    a human refreshes it, deliberately, and it has no interval — so
                    there is no age at which it becomes wrong.

                    The bootstrap load is the case: it must never self-trigger, and
                    the register's currency comes from the change feed rather than
                    from re-running it. Both "never stale" and "always stale" are
                    false of it, which is why it gets no bound rather than a
                    generous one.

                    ⚠️ Collapsing the two would lose the reason, and the reason is
                    the thing that stops someone later giving a bootstrap a
                    freshness bound and wondering why it is permanently red. -#}
                {% if not node.meta.get('cadence_note') %}
                    {% do errors.append(
                        node.name ~ ": meta.ingest_cadence is 'manual' but there is no"
                        " meta.cadence_note. 'manual' silences this row; say who runs"
                        " it, and what keeps the data current in the meantime."
                    ) %}
                {% endif %}

            {% elif cadence not in cadence_max_age %}
                {% do errors.append(
                    node.name ~ ": unknown meta.ingest_cadence '" ~ cadence ~ "'."
                    " Known: " ~ (cadence_max_age.keys() | list | join(', ')) ~ ", manual, none."
                    " Add it to vars.ingest_cadence_max_age_days in dbt_project.yml"
                    " with a bound before using it."
                ) %}
            {% endif %}
        {% endif %}
    {% endfor %}

    {% if errors %}
        {{ exceptions.raise_compiler_error(
            "Source cadence declarations are incomplete, so the ingest-freshness test"
            " cannot say what it checks:\n  - " ~ errors | join("\n  - ") ~
            "\nSee the header of dbt/tests/raw_sources_were_refreshed_recently.sql."
        ) }}
    {% endif %}
{% endif %}

-- The failing rows: anything the view says is late, empty, or carrying a cadence
-- nobody has bounded.
--
-- ⚠️ `unknown_cadence` and `undeclared` cannot normally reach here, because the
-- validation above refuses to compile on them. They are selected anyway, and
-- that is not decoration: the view builds and reports in exactly the state where
-- this test cannot compile, and if the validation is ever loosened the gate must
-- not quietly narrow with it.
select
    source_table,
    last_loaded_at,
    age_days,
    max_age_days,
    freshness_status
from {{ ref('mart_source_freshness') }}
where freshness_status in ('overdue', 'never_loaded', 'undeclared', 'unknown_cadence')

union all

-- 🔴 FAIL LOUDLY RATHER THAN PASS VACUOUSLY. A freshness test that checks
-- nothing must not look green, and "the view came back empty" is the shape that
-- reads as a clean bill of health. The old version could only make this claim at
-- compile time, from `graph.sources`; asking the view itself also catches an
-- empty build, a wrong schema, or a view that exists and selects nothing.
select
    'no-bounded-sources-in-view' as source_table,
    cast(null as timestamptz)   as last_loaded_at,
    cast(null as numeric)       as age_days,
    cast(null as integer)       as max_age_days,
    'empty'                     as freshness_status
where not exists (
    select 1 from {{ ref('mart_source_freshness') }}
    where freshness_status <> 'not_bounded'
)

union all

-- 🔴 DRIFT BETWEEN THE DECLARATIONS AND THE VIEW.
--
-- `mart_source_freshness` builds its row set from `graph.sources` at execute
-- time, which means the view holds whatever the declarations said WHEN IT WAS
-- LAST BUILT. Nothing forces a rebuild when a source is added: the model
-- registers no dependencies in the DAG at all, because its source() calls sit
-- inside an execute-only guard, which dbt's parser never enters (the model's
-- header explains why, and why it cannot be fixed).
--
-- ⚠️ So a newly declared source would be missing from the surface and from this
-- gate at the same time, and a freshness check that silently stops covering a
-- source is the 2026-08-30 failure with extra steps. This arm is compiled fresh
-- on every run from the same declarations, so it sees the new source even while
-- the view does not.
select
    d.source_table,
    cast(null as timestamptz) as last_loaded_at,
    cast(null as numeric)     as age_days,
    cast(null as integer)     as max_age_days,
    'absent_from_view'        as freshness_status
from (
    select unnest(array[
        {%- for node in graph.sources.values() | sort(attribute='name') %}
        {%- if node.loaded_at_field %}
        '{{ node.name }}'{% if not loop.last %},{% endif %}
        {%- endif %}
        {%- endfor %}
    ]) as source_table
) d
left join {{ ref('mart_source_freshness') }} v on v.source_table = d.source_table
where v.source_table is null
