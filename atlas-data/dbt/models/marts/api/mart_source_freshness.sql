{{
  config(
    materialized='view',
    schema='marts',
  )
}}

-- mart_source_freshness — is every raw source within the window its own declared
-- cadence allows, answerable at any moment without the pipeline having run.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY A VIEW AND NOT A TEST RESULT
-- ══════════════════════════════════════════════════════════════════════════
--
-- The comparison already existed, in `tests/raw_sources_were_refreshed_recently`
-- — written after 2026-08-30, when fifteen of forty-one sources silently failed
-- to refresh and the suite returned exactly the same numbers as the night
-- before. That test is correct and it stays. Its VERDICT, though, existed only
-- for as long as the suite was running: it lands in dbt's run results and in
-- Dagster's event log, and `atlas-status.py` can read neither. The event log is
-- owned by the `dagster` role, which Atlas has no SELECT on.
--
-- 🔴 So the operator-facing command reported a 24-HOUR WINDOW instead — honest
-- about being a window, and unable to see a weekly or monthly source go stale at
-- all, because after a day they simply drop out of it (ops-dev, urb-agents
-- #1039). SSB/FHI/Bufdir could go stale, the dbt test would fail, and
-- `uis template check atlas` would still exit 0.
--
-- ⚠️ INVESTIGATE-ingest-freshness-visibility names this exactly: *"the freshness
-- signal must be readable from somewhere that does not depend on the pipeline
-- having run"*. A view satisfies that literally — it is evaluated when it is
-- queried, so it is current whether or not the transform, the suite or the
-- daemon ran. A table would carry the staleness it is trying to report.
--
-- 🔵 ONE COMPUTATION, TWO READERS. The test now selects its failures from this
-- view rather than recomputing them, so a reader and a gate cannot disagree
-- about whether a source is late. The cadence bounds are `vars` in
-- dbt_project.yml, read by both and defaulted by neither.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT `freshness_status` MEANS, AND WHY THE SILENCED ROWS ARE STILL HERE
-- ══════════════════════════════════════════════════════════════════════════
--
--   ok            within its bound
--   overdue       past its bound — the finding
--   never_loaded  no rows at all. NOT a separate kind of healthy: "never
--                 loaded" and "loaded long ago" are the same defect to a
--                 consumer, and treating an empty table as passing is how this
--                 class of bug hides.
--   not_bounded   cadence 'manual' or 'none' — deliberately silenced, and each
--                 one carries a written cadence_note saying why.
--   undeclared    declares loaded_at_field and no ingest_cadence at all.
--   unknown_cadence  declares a cadence nothing holds a bound for. Kept apart
--                 from `undeclared`: one is a source nobody finished adding, the
--                 other is a cadence somebody invented, and they need different
--                 fixes. The 2026-09-12 compile failure was the second kind.
--
-- ⚠️ `not_bounded` ROWS ARE EMITTED RATHER THAN FILTERED OUT, so a reader can
-- say "29 bounded, 5 silenced" instead of quietly reporting a smaller universe
-- than exists. A row that vanishes from a freshness surface is indistinguishable
-- from a source nobody ever added. The four `none` rows are library bookkeeping
-- (sitemap_log, ingest_runs) and the two parked redcross tables; the one
-- `manual` row is the Brreg bootstrap, which must never self-trigger.
--
-- 🔴 `undeclared` IS NOT DEAD CODE, though the test refuses to compile on it.
-- On 2026-09-12 exactly that happened: Brreg sources were declared with cadences
-- that did not exist, the test raised a compiler error — correctly — and
-- `transform_checks` could not compile at all. In that state this view still
-- builds and still reports, which is the difference between a gate and a
-- surface. The gate stays in the test, where a bad declaration must stop the
-- suite rather than the publish.
--
-- ⚠️ THIS MUST BE SEEN TO FAIL BEFORE IT IS TRUSTED. Age the `loaded_at` of one
-- source past its bound and watch the row turn `overdue` and the test go red.
-- This repo has shipped a guard that protected nothing.

{#
══════════════════════════════════════════════════════════════════════════
🔴 THIS MODEL DECLARES NO DEPENDENCIES IN THE DAG, AND IT LOOKS LIKE IT DOES
══════════════════════════════════════════════════════════════════════════

The `{{ source(...) }}` calls below are inside `{% if execute %}`. dbt
registers refs and sources while PARSING, where `execute` is false and
`graph.sources` is empty — so the parse manifest records
`depends_on.nodes: []` and `sources: []` for this model. Measured, not
assumed: the manifest says zero.

⚠️ A reader who sees 34 `source()` calls will assume the graph knows about
them. It does not, and there is no dbt API that would let it: `graph` exists
only at execute time, so a dynamic fan-in cannot be declared statically. The
singular test that used to live here met the same wall and worked around it
with a `-- depends_on:` comment naming ONE model; there is no honest single
name for thirty-four sources.

🔵 WHAT THAT DOES NOT BREAK, and why the model is still correct:
  · dbt does not build sources, so there is no ordering to get wrong.
  · it is a VIEW — nothing about it is stale between runs, because it is
    evaluated when queried.
  · `transform_and_publish` builds every model, so it is recreated daily and
    picks up a newly declared source on the next run.
  · it is absent from `seeds/sources/lineage.csv` for the same reason, which
    is the outcome we want anyway: an operational view has no business
    appearing on every public dataset page as a "consuming mart".

🔴 WHAT IT DOES RISK is drift between the declarations and this view — a
source declared in sources.yml while the view still holds the old set,
because nothing forces a rebuild. `raw_sources_were_refreshed_recently`
carries the guard: it fails with `absent_from_view` for any source the
declarations know about and this view does not.
#}

{% set cadence_max_age = var('ingest_cadence_max_age_days') %}

{% set rows = [] %}
{% if execute %}
    {% for node in graph.sources.values() | sort(attribute='name') %}
        {% if node.loaded_at_field %}
            {% set cadence = node.meta.get('ingest_cadence') %}
            {% do rows.append({
                'node': node,
                'cadence': cadence or 'undeclared',
                'max_age': cadence_max_age.get(cadence),
            }) %}
        {% endif %}
    {% endfor %}
{% endif %}

{% if rows | length == 0 %}

{#- Parse time, or no source declares a loaded_at_field. The column list and its
    types are spelled out so the view's shape does not depend on which branch
    built it — a surface whose schema changes between builds is worse than one
    that is empty. -#}
select
    cast(null as text)        as source_name,
    cast(null as text)        as source_table,
    cast(null as text)        as ingest_cadence,
    cast(null as integer)     as max_age_days,
    cast(null as timestamptz) as last_loaded_at,
    cast(null as numeric)     as age_days,
    cast(null as text)        as freshness_status
where 1 = 0

{% else %}

with per_source as (
{% for r in rows %}
    select
        cast('{{ r.node.source_name }}' as text) as source_name,
        cast('{{ r.node.name }}' as text)        as source_table,
        cast('{{ r.cadence }}' as text)          as ingest_cadence,
        cast({{ r.max_age if r.max_age is not none else 'null' }} as integer) as max_age_days,
        max({{ r.node.loaded_at_field }})        as last_loaded_at
    from {{ source(r.node.source_name, r.node.name) }}
    {% if not loop.last %}union all{% endif %}
{% endfor %}
)

select
    source_name,
    source_table,
    ingest_cadence,
    max_age_days,
    last_loaded_at,
    round(extract(epoch from (current_timestamp - last_loaded_at)) / 86400.0, 2) as age_days,
    case
        when ingest_cadence in ('manual', 'none')             then 'not_bounded'
        when ingest_cadence = 'undeclared'                    then 'undeclared'
        {#- Declared, but not a cadence anything holds a bound for. Distinct from
            'undeclared' on purpose: one is a source nobody finished adding, the
            other is a cadence somebody invented. They need different fixes, and
            the 2026-09-12 compile failure was the second kind. -#}
        when max_age_days is null                             then 'unknown_cadence'
        when last_loaded_at is null                           then 'never_loaded'
        when last_loaded_at < current_timestamp
                             - make_interval(days => max_age_days) then 'overdue'
        else 'ok'
    end as freshness_status
from per_source
order by source_table

{% endif %}
