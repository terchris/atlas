{#-
  The latest year an indicator series actually HAS DATA for.

  🔴 NOT `max(year)`. The fact table carries upstream's full grid, including
  rows that exist with a NULL value because the publisher has not released
  that year yet. A bare `max(year)` points `latest_year` at such a year, and
  then every figure computed at it is empty: `kommuners_with_value` 0,
  `min_value` and `max_value` null. The summary row for a live series reads
  as though the series has no data.

  ⚠️ MEASURED ON THE LIVE API, 2026-09-21 (urb-agents #1351). Seven of
  `ssb-06913`'s eight series resolved to 2026 with 0 kommuner carrying a
  value, while `indicator_latest_values` returned 2,499 nulls against 357
  real numbers. Nothing was inconsistent — the API was faithfully reporting
  an empty year as the latest one.

  🔵 THE COALESCE IS LOAD-BEARING. A series with no values in ANY year keeps
  its old answer rather than going null, so it still appears in the summary
  with a year beside it instead of vanishing from the catalogue. Disappearing
  is the worse failure: a consumer can see "0 of 357" and ask why, but cannot
  see a row that is not there.

  ⚠️ FIVE RELATIONS COMPUTED THIS INDEPENDENTLY before this macro existed —
  indicator_summary, indicator_latest_values, indicator_missing_kommuner,
  coverage_gap_barnefattigdom and unattributed_totals. Fixing it in one and
  not the others would have made them disagree about what "latest" means,
  which is how `classify_region_code` came to exist for region codes.
-#}
{% macro latest_year_agg() -%}
  coalesce(max(year) filter (where value is not null), max(year))
{%- endmacro %}
