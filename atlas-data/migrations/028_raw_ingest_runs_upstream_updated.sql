-- Add raw.ingest_runs.upstream_updated_at — the upstream's own last-modified
-- timestamp at the time of the ingest run.
--
-- Per PLAN-007: ingest modules that can read a "last modified" / "updated"
-- field from the upstream's metadata response populate this column on each
-- successful run; modules that can't (Red Cross web scrape, Brreg per-entity)
-- leave it null. The column is nullable.
--
-- Downstream: marts.meta_sources joins to MAX(upstream_updated_at) WHERE
-- exit_code = 0 per source_slug, exposing the freshness signal as
-- api_v1.meta_sources.last_upstream_update_at. The lag between
-- last_ingested_at (when we ran) and last_upstream_update_at (when they
-- published) is itself a useful signal: "Atlas is N days behind upstream"
-- or "upstream stable for M months."

alter table raw.ingest_runs
  add column if not exists upstream_updated_at timestamptz;

comment on column raw.ingest_runs.upstream_updated_at is 'Upstream-reported last-modified timestamp at the time of this run. NULL when the upstream provider does not expose such a field, or when the ingest module does not capture it. PLAN-007.';
