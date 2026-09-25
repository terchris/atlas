{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- mart_atlas_inventory — one row per PUBLISHED relation: how many records it
-- serves, when its data last arrived, and where the rows came from.
--
-- 🔵 TERJE ASKED FOR THIS DIRECTLY (urb-agents #1433): "validate that all
-- datasets that are ingested has an endpoint and it can be queried … count the
-- number of records each endpoint/dataset has and update the last time it
-- ingested data. And maybe the number of times the data has been ingested."
--
-- ⚠️ THE GRAIN IS PER RELATION, NOT PER SOURCE, and that is the whole point.
-- meta_sources answers "what did we ingest"; this answers "what can a consumer
-- query, and is there anything in it". mart_ingest_health and
-- mart_source_freshness are per-source and cannot be reshaped into this
-- (urb-agents #1432).
--
-- 🔴 last_ingested_at IS NOT TAKEN FROM meta_sources, DELIBERATELY.
-- mart_meta_sources filters every freshness field to exit_code = 0, so a source
-- that has failed for nine days reports its last SUCCESS and looks healthy.
-- That is fhi-innvandrere, 14-22 September, and publishing it on a page built
-- to look authoritative would have carried the defect forward. This model reads
-- raw.ingest_runs UNFILTERED and carries both timestamps side by side:
--
--     last_run_at        the last attempt, success or failure
--     last_succeeded_at  the last attempt that worked
--     last_status        ok / fail — which of the two the latest run was
--
-- 🔵 "Last ran" and "last succeeded" are different questions and a reader needs
-- to see the gap between them.
--
-- ⚠️ runs_total AND runs_succeeded, BOTH, AND NEITHER IS CALLED total_runs.
-- meta_sources.total_runs already means successes-only in a published relation;
-- reusing the name for attempts would give one word two meanings across two
-- endpoints. Terje's "number of times the data has been ingested" reads more
-- naturally as attempts, so both are emitted and named so neither can be
-- mistaken for the other.
--
-- 🔵 THE RELATION LIST COMES FROM seeds/sources/api_v1_relations.csv, queried at
-- execute time, NOT from a hand-written list here. That seed is the authority on
-- what is published; deriving the list from anything else is how
-- bufdir_indicator_alias and meta_dimensions lost their dataset pages
-- (urb-agents #1428).

-- 🔴 EXPLICIT depends_on, AND IT IS GENERATED FROM THE SEED, NOT HAND-WRITTEN.
-- dbt cannot infer a ref() inside an execute-guarded block — the same wall
-- mart_source_freshness documents (and a Jinja tag written inside a SQL
-- comment is still parsed — that cost one compile). Without these the model
-- builds before the
-- marts it counts and reports zeros, which is worse than failing.
--
-- ⚠️ This list MUST equal seeds/sources/api_v1_relations.csv.
-- check-inventory-depends-on.sh fails if it drifts, because a hand-list that
-- nothing checks is the defect this repo has fixed four times this week.
-- depends_on: {{ ref('api_v1_relations') }}
-- depends_on: {{ ref('lineage') }}
-- depends_on: {{ ref('mart_activity_catalog') }}
-- depends_on: {{ ref('mart_brreg_enhet') }}
-- depends_on: {{ ref('mart_bufdir_indicator_alias') }}
-- depends_on: {{ ref('mart_coverage_gap_barnefattigdom') }}
-- depends_on: {{ ref('mart_dim_kommune') }}
-- depends_on: {{ ref('mart_distrikt_summary') }}
-- depends_on: {{ ref('mart_indicator_latest_values') }}
-- depends_on: {{ ref('mart_indicator_missing_kommuner') }}
-- depends_on: {{ ref('mart_indicator_summary') }}
-- depends_on: {{ ref('mart_ingest_health') }}
-- depends_on: {{ ref('mart_kommune_befolkning_alder') }}
-- depends_on: {{ ref('mart_kommune_local_chapters') }}
-- depends_on: {{ ref('mart_kommune_ngo_summary') }}
-- depends_on: {{ ref('mart_kommune_ngo_totals') }}
-- depends_on: {{ ref('mart_meta_dimensions') }}
-- depends_on: {{ ref('mart_meta_endpoints') }}
-- depends_on: {{ ref('mart_meta_sources') }}
-- depends_on: {{ ref('mart_ngo_index') }}
-- depends_on: {{ ref('mart_ngo_overview') }}
-- depends_on: {{ ref('mart_source_freshness') }}
-- depends_on: {{ ref('mart_unattributed_totals') }}

{# 🔴 A LITERAL LIST, GENERATED FROM seeds/sources/api_v1_relations.csv AND GATED.
   The first version read the seed with run_query() at execute time, which is
   honest and does not work: `dbt compile` in CI has no database, so the model
   failed to compile with a Database Error. Measured, not predicted — it broke
   four CI jobs on the first push.
   ⚠️ So the list is static, and check-inventory-depends-on.sh asserts that BOTH
   this list and the depends_on hints above equal the seed. A hand-list that
   nothing checks is the defect this repo has fixed four times this week; a
   hand-list a gate compares against its source is just a cache.
   🔵 mart_atlas_inventory is excluded: it is published, so it appears in the
   seed it reads, and counting itself is circular. #}
{% set relations = [
  {'relation': 'activity_catalog', 'mart': 'mart_activity_catalog'},
  {'relation': 'brreg_enhet', 'mart': 'mart_brreg_enhet'},
  {'relation': 'bufdir_indicator_alias', 'mart': 'mart_bufdir_indicator_alias'},
  {'relation': 'coverage_gap_barnefattigdom', 'mart': 'mart_coverage_gap_barnefattigdom'},
  {'relation': 'dim_kommune', 'mart': 'mart_dim_kommune'},
  {'relation': 'distrikt_summary', 'mart': 'mart_distrikt_summary'},
  {'relation': 'indicator_latest_values', 'mart': 'mart_indicator_latest_values'},
  {'relation': 'indicator_missing_kommuner', 'mart': 'mart_indicator_missing_kommuner'},
  {'relation': 'indicator_summary', 'mart': 'mart_indicator_summary'},
  {'relation': 'ingest_health', 'mart': 'mart_ingest_health'},
  {'relation': 'kommune_befolkning_alder', 'mart': 'mart_kommune_befolkning_alder'},
  {'relation': 'kommune_local_chapters', 'mart': 'mart_kommune_local_chapters'},
  {'relation': 'kommune_ngo_summary', 'mart': 'mart_kommune_ngo_summary'},
  {'relation': 'kommune_ngo_totals', 'mart': 'mart_kommune_ngo_totals'},
  {'relation': 'meta_dimensions', 'mart': 'mart_meta_dimensions'},
  {'relation': 'meta_endpoints', 'mart': 'mart_meta_endpoints'},
  {'relation': 'meta_sources', 'mart': 'mart_meta_sources'},
  {'relation': 'ngo_index', 'mart': 'mart_ngo_index'},
  {'relation': 'ngo_overview', 'mart': 'mart_ngo_overview'},
  {'relation': 'source_freshness', 'mart': 'mart_source_freshness'},
  {'relation': 'unattributed_totals', 'mart': 'mart_unattributed_totals'},
] %}

{% if relations | length == 0 %}

-- Parse-time shape only. At execute time this branch is never taken; if it ever
-- is, the model is empty rather than wrong.
select
  cast(null as text)        as endpoint,
  cast(null as bigint)      as row_count,
  cast(null as boolean)     as is_empty,
  cast(null as text)        as origin,
  cast(null as text[])      as contributing_sources,
  cast(null as timestamptz) as last_run_at,
  cast(null as timestamptz) as last_succeeded_at,
  cast(null as text)        as last_status,
  cast(null as bigint)      as runs_total,
  cast(null as bigint)      as runs_succeeded
where 1 = 0

{% else %}

with counts as (
  {% for r in relations %}
  select
    cast('{{ r.relation }}' as text) as endpoint,
    count(*)::bigint                 as row_count
  from {{ ref(r.mart) }}
  {% if not loop.last %}union all{% endif %}
  {% endfor %}
),

-- Which sources feed each published relation. lineage is keyed on the mart
-- name, so it is mapped back through the same seed that produced the list.
rel_sources as (
  select
    r.relation_name as endpoint,
    l.source_id
  from {{ ref('api_v1_relations') }} r
  join {{ ref('lineage') }} l on l.model_name = r.mart_name
),

-- 🔴 UNFILTERED. Every aggregate here counts failures too; the successes-only
-- variants are named explicitly.
runs as (
  select
    source_slug                                                as source_id,
    max(finished_at)                                           as last_run_at,
    max(finished_at) filter (where exit_code = 0)              as last_succeeded_at,
    count(*)::bigint                                           as runs_total,
    count(*) filter (where exit_code = 0)::bigint              as runs_succeeded,
    (array_agg(
       case when exit_code = 0 then 'ok' else 'fail' end
       order by finished_at desc
     ) filter (where finished_at is not null))[1]              as last_status
  from {{ source('raw', 'ingest_runs') }}
  where finished_at is not null
  group by source_slug
),

per_relation as (
  select
    rs.endpoint,
    array_agg(distinct rs.source_id order by rs.source_id) as contributing_sources,
    max(ru.last_run_at)                                   as last_run_at,
    max(ru.last_succeeded_at)                             as last_succeeded_at,
    sum(coalesce(ru.runs_total, 0))::bigint               as runs_total,
    sum(coalesce(ru.runs_succeeded, 0))::bigint           as runs_succeeded,
    -- 'fail' if ANY contributing source's latest run failed. A relation is only
    -- as fresh as its worst input, and hiding one failing source behind four
    -- healthy ones is the shape this model exists to prevent.
    case when bool_or(ru.last_status = 'fail') then 'fail'
         when bool_or(ru.last_status = 'ok')   then 'ok'
    end                                                   as last_status
  from rel_sources rs
  left join runs ru on ru.source_id = rs.source_id
  group by rs.endpoint
)

select
  c.endpoint,
  c.row_count,
  (c.row_count = 0)                                  as is_empty,
  -- ⚠️ DERIVED FROM EVIDENCE, AND IT DOES NOT YET DISTINGUISH 'editorial'.
  -- urb-agents #1427 established that bufdir_indicator_alias carries
  -- hand-written judgements served beside republished NLOD statistics, and that
  -- 'editorial' is the honest value for it. That needs a human marking which
  -- relations are editorial; until then it reports as 'seed', which is true but
  -- less specific. The column exists now so the value can be added without a
  -- schema change (Terje's open decision).
  case
    when c.endpoint like 'meta\_%'                   then 'catalogue'
    when pr.runs_succeeded > 0                       then 'ingest'
    when pr.endpoint is null                         then 'seed'
    else 'declared_no_ingest'
  end                                                as origin,
  coalesce(pr.contributing_sources, array[]::text[]) as contributing_sources,
  pr.last_run_at,
  pr.last_succeeded_at,
  pr.last_status,
  coalesce(pr.runs_total, 0)                         as runs_total,
  coalesce(pr.runs_succeeded, 0)                     as runs_succeeded
from counts c
left join per_relation pr on pr.endpoint = c.endpoint
order by c.endpoint

{% endif %}
