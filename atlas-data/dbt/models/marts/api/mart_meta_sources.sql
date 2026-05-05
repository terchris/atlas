{{
  config(
    materialized='table',
    schema='marts'
  )
}}

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
  coalesce(la.downstream_model_count, 0) as downstream_model_count
from manifest m
left join ingest_run_aggregates ira on ira.source_id = m.source_id
left join lineage_aggregates la on la.source_id = m.source_id
order by m.source_id
