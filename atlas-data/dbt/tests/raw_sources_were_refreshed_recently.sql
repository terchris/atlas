-- Singular dbt test: every scheduled raw source must have been refreshed recently.
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
-- WHAT IT ASSERTS
--
-- For every raw source table that declares a `loaded_at_field`, the newest
-- `loaded_at` must be within `max_ingest_age_days` (default 8 — one day of
-- slack beyond the weekly cadence, so a single missed weekly tick is caught
-- while normal jitter is not).
--
-- A table whose max is NULL — no rows at all — is also a failure. "Never
-- loaded" and "loaded long ago" are the same defect from a consumer's point of
-- view, and treating an empty table as passing is how this class of bug hides.
--
-- SOURCES WITH NO CADENCE BY DESIGN ARE EXEMPT
--
-- `var('freshness_exempt_prefixes')` lists table-name prefixes that legitimately
-- never refresh on a timer:
--
--   frr_*       permanent and private by design; read from a private data repo
--               that is not present on any public deployment.
--   redcross_*  parked pending an API credential — the three views it feeds are
--               deliberately empty.
--
-- These are exempt because they have no automation condition and no freshness
-- policy, for different reasons. That is the trap this design had to avoid: a
-- naive "everything must be fresh" check fires on both from day one, gets muted,
-- and then protects nothing.
--
-- ⚠️ AN EXEMPTION IS A CLAIM THAT A SOURCE SHOULD NEVER REFRESH. Adding a prefix
-- here to quiet a failing source is how this test becomes decoration. If a
-- source is late, fix the source.
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

{% set exempt_prefixes = var('freshness_exempt_prefixes', ['frr_', 'redcross_']) %}
{% set max_age_days = var('max_ingest_age_days', 8) %}

{% if execute %}
    {% set checked = [] %}
    {% for node in graph.sources.values() %}
        {% if node.loaded_at_field %}
            {% set ns = namespace(skip=false) %}
            {% for p in exempt_prefixes %}
                {% if node.name.startswith(p) %}{% set ns.skip = true %}{% endif %}
            {% endfor %}
            {% if not ns.skip %}
                {% do checked.append(node) %}
            {% endif %}
        {% endif %}
    {% endfor %}
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
    {{ max_age_days }} as max_age_days
where 1 = 1

{% else %}

with per_source as (
{% for node in checked %}
    select
        '{{ node.name }}' as source_table,
        max({{ node.loaded_at_field }}) as last_loaded_at
    from {{ source(node.source_name, node.name) }}
    {% if not loop.last %}union all{% endif %}
{% endfor %}
)

select
    source_table,
    last_loaded_at,
    round(extract(epoch from (current_timestamp - last_loaded_at)) / 86400.0, 2) as age_days,
    {{ max_age_days }} as max_age_days
from per_source
where last_loaded_at is null
   or last_loaded_at < current_timestamp - interval '{{ max_age_days }} days'
order by last_loaded_at nulls first

{% endif %}
