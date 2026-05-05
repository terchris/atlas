{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- mart_meta_endpoints — one row per queryable Atlas endpoint, with tags
-- inherited from the upstream sources via the lineage seed and a `layer:`
-- tag derived from the schema. Backs the customer frontend's tag-filter
-- catalogue (PLAN-007 phase 4) and surfaces externally as
-- api_v1.meta_endpoints so external developers see what's available the
-- same way the frontend does (dogfood).
--
-- Filters (what's IN):
--   - api_v1.* — the curated wrapper views (PLAN-004).
--   - marts.*  — every dbt-built table/view (dim_*, fact_*, indicators__*,
--     mart_*, supply__*, etc.) plus the top-level seeds (eu_data_theme,
--     bufdir_indicator_alias, lineage). Excludes the underscore-prefixed
--     internal seeds (_sources_manifest, _sources_dimensions) by name
--     convention.
--   - raw.*    — the verbatim ingest landings + raw.ingest_runs +
--     raw.sitemap_log (operational tables). Useful for shoppers who want
--     to see "what came in from upstream verbatim".
--
-- Filters (what's OUT):
--   - private_marts.*    — auth-gated (Red Cross FRR personal data); kept
--     out by the explicit IN filter on api_v1/marts/raw schemas.
--   - marts.<seed>_<...>_<...>  — internal seeds whose name starts with
--     `_` (PLAN-007 convention: underscore prefix = "internal substrate,
--     not user-facing").
--   - dbt_*               — dbt's own internal tables (test failures,
--     etc.) under marts. Defensive filter.
--
-- Tag derivation:
--   - layer:<schema>      — derived from table_schema. Universal.
--   - provider/topic/geo/cadence/eu_theme — inherited from the source(s)
--     each model derives from, via the lineage seed (Phase 3.3). Multiple
--     sources contribute one tag each per namespace; the result is the
--     **union** so a `mart_*` derived from 17 indicator sources picks up
--     every source's tag. Per PLAN-007 phase 3.2: "this mart involves
--     something annual" is more useful than "this mart is purely annual."
--
-- Lineage scope:
--   - For models in marts.*: lineage seed has direct edges.
--   - For api_v1.* views: each api_v1.X wraps marts.mart_X, so we look up
--     mart_X's lineage. Implementation: strip nothing from the table_name
--     (api_v1 view names already match the api_v1 prefix-stripped name);
--     join via 'mart_' || api_v1_name to find the source set.
--   - For raw.* tables: source_id is derived from the table_name itself
--     (underscore → hyphen translation, same as extract_lineage.py).

with raw_endpoints as (
  -- Every queryable table/view in the three open-by-default schemas.
  -- We hand-filter out the internal-seeds-by-convention here rather than in
  -- application code so consumers always see a cleaned-up endpoint list.
  select
    table_schema as schema_name,
    table_name,
    table_type
  from information_schema.tables
  where table_schema in ('api_v1', 'marts', 'raw')
    and table_name not like '\_%' escape '\'
    and table_name not like 'dbt\_%' escape '\'
),

source_tags as (
  -- For every source, expose a row per tag we'll inherit downstream.
  -- mart_meta_sources already explodes the comma-separated tags string
  -- into a Postgres text[] including the eu_theme:<X> entry; we take the
  -- same array as the canonical tag set per source.
  select
    source_id,
    unnest(tags) as tag
  from {{ ref('mart_meta_sources') }}
),

marts_lineage as (
  -- For each model in marts.*, the union of source tags from every source
  -- it derives from. The lineage seed is one row per (model, source) edge,
  -- so the join naturally fans out and the array_agg(distinct …) at the
  -- end produces the union.
  select
    l.model_name,
    array_agg(distinct st.tag order by st.tag) as inherited_tags
  from {{ ref('lineage') }} l
  join source_tags st on st.source_id = l.source_id
  group by l.model_name
),

api_v1_lineage as (
  -- api_v1.X views wrap marts.mart_X (the PLAN-004 generator strips the
  -- "mart_" prefix from the view name). Look up tags by reversing that
  -- mapping: api_v1 view name `indicator_summary` corresponds to the
  -- model `mart_indicator_summary`, whose lineage is in marts_lineage.
  --
  -- For api_v1 views whose underlying mart isn't `mart_` prefixed (e.g.
  -- when a wrapper points at a non-mart_ model — none today, but be
  -- defensive), we fall back to looking up the bare name.
  select
    api_v1_name as endpoint_name,
    coalesce(prefixed.inherited_tags, bare.inherited_tags, '{}'::text[])
      as inherited_tags
  from (
    select table_name as api_v1_name
    from raw_endpoints
    where schema_name = 'api_v1'
  ) v
  left join marts_lineage prefixed
    on prefixed.model_name = 'mart_' || v.api_v1_name
  left join marts_lineage bare
    on bare.model_name = v.api_v1_name
),

raw_lineage as (
  -- For raw.<table>, the source_id IS derived from the table name via
  -- underscore → hyphen translation (same rule as extract_lineage.py).
  -- Compute tags directly from source_tags, joined on the translated id.
  -- Operational raw tables (ingest_runs, sitemap_log) translate to ids
  -- not present in source_tags and so legitimately have no inherited
  -- tags — they only carry the layer:raw tag from the schema.
  select
    r.table_name as raw_table,
    coalesce(
      array_agg(distinct st.tag order by st.tag) filter (where st.tag is not null),
      '{}'::text[]
    ) as inherited_tags
  from raw_endpoints r
  left join source_tags st on st.source_id = replace(r.table_name, '_', '-')
  where r.schema_name = 'raw'
  group by r.table_name
)

select
  e.schema_name || '.' || e.table_name as endpoint,
  e.schema_name,
  e.table_name,
  -- layer:<schema> + inherited source tags (union). Inherited tags are
  -- already deduped/sorted in marts_lineage / api_v1_lineage / raw_lineage;
  -- prepending layer: yields the final filterable tag array PostgREST
  -- consumers see.
  array['layer:' || e.schema_name] || coalesce(
    case e.schema_name
      when 'api_v1' then a.inherited_tags
      when 'marts' then m.inherited_tags
      when 'raw' then rl.inherited_tags
    end,
    '{}'::text[]
  ) as tags,
  (e.schema_name = 'api_v1') as is_public_api,
  e.table_type as table_type
from raw_endpoints e
left join marts_lineage m on m.model_name = e.table_name and e.schema_name = 'marts'
left join api_v1_lineage a on a.endpoint_name = e.table_name and e.schema_name = 'api_v1'
left join raw_lineage rl on rl.raw_table = e.table_name and e.schema_name = 'raw'
order by e.schema_name, e.table_name
