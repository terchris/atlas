-- Singular dbt test: every api_v1.X view returns the same row count as its
-- underlying marts.mart_X table.
--
-- Catches generator bugs (e.g. wrong source-relation name, accidental WHERE
-- clauses, projection that drops rows) and permission-related silent
-- filtering. For the pure SELECT * wrapper case row-count parity is the
-- right check — fast, no row-level diff cost.
--
-- Returns one row per (api_v1.X, marts.mart_X) pair where counts disagree.
-- dbt test fails if any rows return.
--
-- Maintenance: when adding a new mart_<name> view in models/marts/api/,
-- add a corresponding `union all` line below. The static drift gate in
-- check-api-v1.sh enforces wrapper count = api/ model count, but this
-- file is hand-maintained today (PLAN-004 [Q16] #4 — could be generated
-- in a future iteration if drift becomes a real problem).
--
-- Preconditions: ./apply-api-v1.sh has run (api_v1.* exists), and
-- `dbt run` has built marts.mart_* (the underlying tables).

with row_counts(view_name, api_count, mart_count) as (
  select 'activity_catalog',
         (select count(*) from api_v1.activity_catalog),
         (select count(*) from marts.mart_activity_catalog)
  union all select 'coverage_gap_barnefattigdom',
         (select count(*) from api_v1.coverage_gap_barnefattigdom),
         (select count(*) from marts.mart_coverage_gap_barnefattigdom)
  union all select 'distrikt_summary',
         (select count(*) from api_v1.distrikt_summary),
         (select count(*) from marts.mart_distrikt_summary)
  union all select 'indicator_latest_values',
         (select count(*) from api_v1.indicator_latest_values),
         (select count(*) from marts.mart_indicator_latest_values)
  union all select 'indicator_missing_kommuner',
         (select count(*) from api_v1.indicator_missing_kommuner),
         (select count(*) from marts.mart_indicator_missing_kommuner)
  union all select 'indicator_summary',
         (select count(*) from api_v1.indicator_summary),
         (select count(*) from marts.mart_indicator_summary)
  union all select 'kommune_local_chapters',
         (select count(*) from api_v1.kommune_local_chapters),
         (select count(*) from marts.mart_kommune_local_chapters)
  union all select 'ngo_index',
         (select count(*) from api_v1.ngo_index),
         (select count(*) from marts.mart_ngo_index)
  union all select 'ngo_overview',
         (select count(*) from api_v1.ngo_overview),
         (select count(*) from marts.mart_ngo_overview)
  union all select 'bufdir_indicator_alias',
         (select count(*) from api_v1.bufdir_indicator_alias),
         (select count(*) from marts.mart_bufdir_indicator_alias)
)
select view_name, api_count, mart_count
from row_counts
where api_count <> mart_count
