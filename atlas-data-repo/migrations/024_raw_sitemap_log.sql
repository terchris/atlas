-- raw.sitemap_log — shared per-URL discovery log for scraper sources
-- One row per (source_slug, url) across all scraping sources (Q19 in
-- INVESTIGATE-ngo-scraping-infrastructure.md, §C.2). Populated by the discover
-- stage of each scraper via atlas-data/ingest/src/lib/scraping/sitemap_log.ts.
--
-- Drives two behaviors:
--   1. Fetch-skip: if lastmod_now equals stored lastmod and a raw.<source>_*
--      row exists, skip the GET request.
--   2. Orphan detection: URLs whose last_seen_at is older than the current
--      run's started_at have dropped off the sitemap; propagate to is_active
--      = false on the corresponding raw.<source>_* row (§E.1).
--
-- Also used by HTML-index-driven sources (no sitemap) — they still upsert
-- here with lastmod = NULL. The table name reflects the dominant case, not a
-- restriction.

create table if not exists raw.sitemap_log (
  source_slug    text        not null,
  url            text        not null,
  lastmod        timestamptz,                  -- sitemap's <lastmod>; NULL if absent or HTML-index source
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  primary key (source_slug, url)
);

comment on table raw.sitemap_log is
  'Per-URL discovery log, one row per (source_slug, url) across all scraping sources. Stores the sitemap <lastmod> (or NULL for HTML-index sources and entries without lastmod) and the first/last time the URL was seen in discovery. Drives fetch-skip and orphan detection per INVESTIGATE-ngo-scraping-infrastructure §C.2.';
