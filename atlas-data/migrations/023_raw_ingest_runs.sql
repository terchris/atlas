-- raw.ingest_runs — cross-source observability + concurrent-run lock
-- One row per ingest invocation (scraper or API-source). The row is inserted
-- with finished_at = NULL at run start and updated on completion.
--
-- The partial unique index on (source_slug) WHERE finished_at IS NULL doubles
-- as the concurrent-run lock (Q22 in INVESTIGATE-ngo-scraping-infrastructure.md):
-- a second run attempting to start for the same source_slug is rejected at the
-- DB layer, giving a clean error instead of a race on raw upserts and the
-- Crawlee KeyValueStore (which is not multi-writer safe).

create table if not exists raw.ingest_runs (
  run_id          bigserial   primary key,
  source_slug     text        not null,
  started_at      timestamptz not null,
  finished_at     timestamptz,                 -- NULL while in-progress
  exit_code       int,                         -- NULL while in-progress; 0 on success, non-zero on failure
  rows_scraped    int,                         -- pages actually fetched over the network (excludes sitemap-lastmod skips)
  rows_parsed     int,                         -- pages successfully parsed (subset of rows_scraped)
  rows_skipped    int,                         -- pages skipped by sitemap-lastmod (§C.2); record_hash skips are upsert-level and not counted here in v1
  warnings_count  int         not null default 0,
  errors_count    int         not null default 0,
  notes           text                         -- free-form summary
);

comment on table raw.ingest_runs is
  'One row per ingest invocation. Populated by atlas-data/ingest/src/lib/scraping/ingest_runs.ts. The partial unique index raw_ingest_runs_one_inprogress_per_source enforces at most one in-progress run per source_slug — application-level concurrent-run lock per INVESTIGATE §E.3.1.';

create unique index if not exists raw_ingest_runs_one_inprogress_per_source
    on raw.ingest_runs (source_slug)
 where finished_at is null;
