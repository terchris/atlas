-- Singular dbt test: `contents_code` must identify an INDICATOR, not a ROW.
--
-- This exists because that invariant was violated silently and cost 17GB.
--
-- indicators__ssb_08487 composed contents_code as
-- `region_code__lovbrudd__contents__period`, so every code was unique to one
-- kommune and one period — 484,992 distinct codes for 484,992 fact rows.
-- mart_indicator_missing_kommuner cross joins every (source_id, contents_code)
-- against every active kommune to ask "which kommuner lack this indicator?",
-- so each kommune-specific code was reported missing for the other 357:
-- 173,589,188 rows / 17GB, 281x the fact table. It nearly filled the disk on
-- the first full 41-source run and blocked both the next transform and the
-- remaining 477 asset checks.
--
-- Nothing caught it. The model's own uniqueness test PASSED, because the
-- region was smuggled inside contents_code and so the key looked unique.
-- The failure only became visible as a disk number on a live cluster.
--
-- The invariant, stated directly: an indicator code describes a MEASURE, which
-- many kommuner report. So per source there should be far fewer distinct codes
-- than there are kommuner reporting them. A source with vastly more codes than
-- kommuner has put row-identifying information (a region, a period, an id) into
-- the code.
--
-- The 10x multiple is deliberately loose — this is a canary for a fan-out of
-- three or more orders of magnitude, not a style rule. Pre-fix ssb-crime-tables
-- was 1,354x over; post-fix it is 0.09x.
--
-- If this fails: look at how that source builds contents_code, and check
-- whether something already carried as its own column (kommune_nr, year) has
-- been concatenated into it.

with per_source as (
  select
    source_id,
    count(distinct contents_code) as distinct_codes,
    count(distinct kommune_nr)    as distinct_kommuner,
    count(*)                      as rows_total
  from {{ ref('fact_kommune_indicators') }}
  group by source_id
)

select
  source_id,
  distinct_codes,
  distinct_kommuner,
  rows_total,
  round(distinct_codes::numeric / nullif(distinct_kommuner, 0), 1) as codes_per_kommune
from per_source
where distinct_kommuner > 0
  and distinct_codes > distinct_kommuner * 10
