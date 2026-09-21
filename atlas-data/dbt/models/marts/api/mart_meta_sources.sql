{{
  config(
    materialized='table',
    schema='marts',
    indexes=[{'columns': ['source_id'], 'unique': True}],
    post_hook="{{ register_source_id_fk() }}"
  )
}}

-- ⚠️ NO `--` COMMENTS INSIDE THAT config() CALL. It is a Jinja expression, where
-- `--` is subtraction, not a comment, and the model fails to compile. The same
-- trap is recorded in dim_brreg_enhet for `#`; this is the second spelling of it
-- and I walked into it anyway.
--
-- This model is the FK TARGET for PostgREST embedding. register_source_id_fk()
-- runs here AND on mart_indicator_summary, because a rebuild of either drops
-- the constraint between them — see macros/register_source_id_fk.sql. The hook
-- is additive: the project-level restore_api_v1_view() and analyze_if_table()
-- still run.

-- mart_meta_sources — per-source catalogue row. One per ingest source in
-- marts._sources_manifest, joined to raw.ingest_runs aggregates so consumers
-- see freshness alongside the static metadata. The primary endpoint behind
-- /data/sources in the customer frontend (PLAN-007 phase 4) and the same
-- shape external developers query via api_v1.meta_sources.
--
-- Row count = same as marts._sources_manifest (currently 41, growing as
-- the cloud-agent pipeline drains the candidate backlog).
--
-- Tag derivation: the seed's `tags` column is a comma-separated string of
-- namespace:value pairs (e.g. "provider:ssb,topic:income,geo:kommune,
-- cadence:annual"). We split it back into a Postgres text[] so PostgREST
-- consumers can filter via ?tags=cs.{provider:ssb} and the customer
-- frontend's tag-pill UI can render each pair without re-parsing. The
-- eu_theme top-level field gets prefixed with "eu_theme:" and added to the
-- array so it filters the same way as the rest.
--
-- downstream_model_count is sourced from the lineage seed (Phase 3.3); each
-- (source_id) gets the count of distinct downstream model names. Sources
-- with zero downstream models (yet to be wired into a mart) get 0.

with manifest as (
  select * from {{ ref('_sources_manifest') }}
),

ingest_run_aggregates as (
  -- Per source_slug: the freshness signals from successful runs only.
  -- exit_code = 0 means the run completed cleanly; we ignore in-progress
  -- (NULL exit_code) and failed (non-zero) runs for last_ingested_at /
  -- latest_row_count / last_upstream_update_at.
  select
    source_slug as source_id,
    max(finished_at) filter (where exit_code = 0) as last_ingested_at,
    max(upstream_updated_at) filter (where exit_code = 0) as last_upstream_update_at,
    count(*) filter (where exit_code = 0)::int as total_runs,
    -- rows_parsed from the most recent successful run. distinct on per source.
    (
      array_agg(rows_parsed order by finished_at desc)
        filter (where exit_code = 0)
    )[1] as latest_row_count
  from {{ source('raw', 'ingest_runs') }}
  group by source_slug
),

lineage_aggregates as (
  -- One row per source_id with the count of distinct downstream models.
  -- Lineage seed lands rows of (model_name, source_id) — multi-source models
  -- contribute one row per source, so a count(distinct model_name) here gives
  -- "how many models reference this source," which is what the catalogue
  -- shoppers want to see ("if I rely on ssb-08764, how many marts ride on it?").
  select
    source_id,
    count(distinct model_name)::int as downstream_model_count
  from {{ ref('lineage') }}
  group by source_id
),

-- 🔴 served_as ANSWERS THE QUESTION downstream_model_count WAS BEING ASKED.
-- That field counts models. Consumers needed "can I reach this source from
-- api_v1", and four parties each built a different partial proxy for it: the
-- CI gate, this field, a consumer's hand-kept list of four, and an ops-dev
-- summary. Three of the four were wrong on 2026-09-21, and one reached the
-- demo consumer as "the eight FHI sources served" when it was seven
-- (urb-agents #1344).
--
-- ⚠️ A SOURCE SERVING 357 ROWS AND A SOURCE SERVING NOTHING BOTH READ AS
-- "has a model". Empty served_as is the gap; non-empty names the relations.
--
-- 🔴 AND STRUCTURAL REACHABILITY IS NOT ENOUGH, which is why this is not a
-- plain lineage join. ssb-06913 feeds fact_kommune_indicators and therefore
-- reaches four published relations on paper, while contributing ZERO rows to
-- them — imac measured it absent from indicator_summary. A lineage-derived
-- boolean would have called it served and been the fifth wrong proxy. So a
-- fact-derived relation is only claimed when the source actually has rows in
-- the fact.
--
-- ⚠️ For relations that do NOT derive from the fact this is still structural:
-- there is no per-source row attribution in brreg_enhet or dim_kommune to
-- check against. The column is honest about reachability, not about volume.
fact_sources as (
  select distinct source_id from {{ ref('fact_kommune_indicators') }}
),

served as (
  select
    l.source_id,
    array_agg(distinct r.relation_name) as served_as
  from {{ ref('lineage') }} l
  join {{ ref('api_v1_relations') }} r on r.mart_name = l.model_name
  left join fact_sources f on f.source_id = l.source_id
  where r.derives_from_fact is not true or f.source_id is not null
  group by l.source_id
)

select
  m.source_id,
  m.upstream_id,
  m.upstream_url,
  m.upstream_landing_page,
  m.upstream_title,
  m.description,
  m.publisher,
  m.license,
  m.license_url,
  m.periodicity,
  m.eu_theme,
  m.attribution,
  -- Split the comma-separated tag string back into a Postgres text[] and
  -- append the eu_theme as a sixth namespaced tag so all five declared
  -- namespaces (provider, topic, geo, cadence, eu_theme) plus the layer:
  -- tag added per-endpoint in mart_meta_endpoints share one filter shape.
  string_to_array(m.tags, ',') || array['eu_theme:' || m.eu_theme] as tags,
  ira.last_ingested_at,
  ira.last_upstream_update_at,
  ira.latest_row_count,
  coalesce(ira.total_runs, 0) as total_runs,
  coalesce(la.downstream_model_count, 0) as downstream_model_count,
  coalesce(sv.served_as, array[]::text[]) as served_as
from manifest m
left join ingest_run_aggregates ira on ira.source_id = m.source_id
left join lineage_aggregates la on la.source_id = m.source_id
left join served sv on sv.source_id = m.source_id
order by m.source_id
