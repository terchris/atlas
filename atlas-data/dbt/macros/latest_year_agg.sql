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
{#-
  🔴 THE `subject` ARGUMENT EXISTS BECAUSE THE FIRST VERSION OF THIS MACRO WAS
  A PARTIAL FIX, AND THE REASON IS SSB ZERO-FILLS RETIRED KOMMUNE CODES.

  `filter (where value is not null)` alone was defeated by a literal 0.
  Measured against SSB on 2026-09-21, table 06913:

    0301 Oslo         (active)  Dode 2025 = 4033   Dode 2026 = NULL
    0101 Halden      (-2019)    Dode 2025 = 0      Dode 2026 = 0
    0801 Kragerø     (-1959)    Dode 2025 = 0      Dode 2026 = 0

  A retired kommune carries a non-null zero for every year forever, so the
  null-filter kept 2026 while every ACTIVE kommune was null there — and
  `kommuner_with_value`, which counts active kommuner only, still found none.
  `latest_year` and the coverage computed at it disagreed about which rows
  count.

  ⚠️ ops-dev's words for it: "the same instrument failure one layer down,
  inside the fix written for a different version of it" (urb-agents #1354).
  That is accurate. The first version fixed the sources whose unreleased
  years are NULL — the crime legacy codes — and missed every source whose
  unreleased years are zero-filled.

  🔵 SO THE SUBJECT MUST MATCH THE RELATION'S OWN FILTER. If a relation
  reports over active non-sentinel kommuner, its latest_year must be the
  latest year THOSE rows have a value. Passing anything else reintroduces the
  disagreement in a new place.

  ⚠️ NOT "exclude zeros". A zero is data — a kommune with no deaths that year
  reports 0 and must keep it. What is excluded is a row whose SUBJECT is not
  part of the relation, which is a different thing and the only honest one.
-#}
{% macro latest_year_agg(subject='true') -%}
  coalesce(max(year) filter (where value is not null and ({{ subject }})), max(year))
{%- endmacro %}
