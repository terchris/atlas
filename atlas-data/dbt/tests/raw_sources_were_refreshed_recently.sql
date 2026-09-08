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
--       ingest_cadence: weekly | monthly | none
--       cadence_note: >-          # REQUIRED when, and only when, cadence: none
--         why this source has no cadence at all
--
-- `weekly` / `monthly` must match the asset's `automation_condition` in the
-- Dagster package. This file does not read `cadence.py` — the two are coupled
-- by convention, and that coupling is the known soft spot in this design.
--
-- ⚠️ `none` IS A CLAIM THAT A SOURCE SHOULD NEVER REFRESH ON A TIMER. It is
-- the only value that silences a row, so it is the only one that can turn this
-- test into decoration. That is why it is the only one that must be argued for
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
-- The `depends_on` hint below creates that edge without putting the model into
-- the query. dbt's own compiler suggests this form, and it is honest rather
-- than a formality: the fact table is only trustworthy if the raw inputs behind
-- it are current, which is exactly this test's claim.
--
-- ⚠️ Remove the hint and this test silently stops running. That is the failure
-- mode it was written to prevent, so it would be a bad one to reintroduce.

-- depends_on: {{ ref('fact_kommune_indicators') }}

{#-
  Cadence -> maximum tolerated age. Each is the polling interval plus enough
  slack to absorb one late tick without crying wolf, and no more:
    weekly   7 + 1
    monthly  31 + 4   (a 31-day month, then four days to notice a missed tick)
  A cadence named on a source but absent here is a compile error, not a
  default — silently defaulting an unknown cadence to a weekly bound is the
  exact bug the klass sources were sitting on.
-#}
{% set cadence_max_age = var('ingest_cadence_max_age_days', {'weekly': 8, 'monthly': 35}) %}

{% if execute %}
    {% set checked = [] %}
    {% set errors = [] %}

    {% for node in graph.sources.values() | sort(attribute='name') %}
        {% if node.loaded_at_field %}
            {% set cadence = node.meta.get('ingest_cadence') %}

            {% if not cadence %}
                {#- A new source must state its cadence. Defaulting one in is how
                    the klass sources acquired a threshold nobody chose. -#}
                {% do errors.append(
                    node.name ~ ": declares loaded_at_field '" ~ node.loaded_at_field ~
                    "' but no meta.ingest_cadence. Add weekly, monthly, or none"
                    " (none also requires meta.cadence_note)."
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

            {% elif cadence not in cadence_max_age %}
                {% do errors.append(
                    node.name ~ ": unknown meta.ingest_cadence '" ~ cadence ~ "'."
                    " Known: " ~ (cadence_max_age.keys() | list | join(', ')) ~ ", none."
                    " Add it to ingest_cadence_max_age_days with a bound before using it."
                ) %}

            {% else %}
                {% do checked.append({'node': node, 'max_age': cadence_max_age[cadence]}) %}
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
{% else %}
    {% set checked = [] %}
{% endif %}

{% if checked | length == 0 %}

-- No source declares a loaded_at_field, or we are in parse. Fail loudly rather
-- than pass vacuously: a freshness test that checks nothing must not look green.
select
    'no-sources-checked' as source_table,
    cast(null as timestamptz) as last_loaded_at,
    cast(null as numeric) as age_days,
    cast(null as integer) as max_age_days
where 1 = 1

{% else %}

with per_source as (
{% for c in checked %}
    select
        '{{ c.node.name }}' as source_table,
        max({{ c.node.loaded_at_field }}) as last_loaded_at,
        {{ c.max_age }} as max_age_days
    from {{ source(c.node.source_name, c.node.name) }}
    {% if not loop.last %}union all{% endif %}
{% endfor %}
)

select
    source_table,
    last_loaded_at,
    round(extract(epoch from (current_timestamp - last_loaded_at)) / 86400.0, 2) as age_days,
    max_age_days
from per_source
where last_loaded_at is null
   or last_loaded_at < current_timestamp - make_interval(days => max_age_days)
order by last_loaded_at nulls first

{% endif %}
