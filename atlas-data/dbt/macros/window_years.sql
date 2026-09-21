{#
  How many calendar years one row covers. 1 for a point-in-time series, 3 for
  fhi-mobbing, 5 for fhi-selvmord.

  🔴 WHY THIS IS A COLUMN AND NOT A PARAGRAPH. `year` is the FIRST year of the
  window, and that single fact produced two consumer-visible errors in one day,
  in opposite directions (urb-agents #1331):

    ops-dev read fhi-selvmord's latest_year 2020 as "six years stale" and told
      the consumer not to build on it. It is the 2020-2024 window and current.
    the consumer shipped a caption reading «Mobbetallene er fra 2022», telling
      readers the bullying figures were three years old. 2022-2024, live for
      weeks, wrong the whole time.

  ⚠️ Neither was careless. `latest_year` is a bare integer whose meaning
  depends on the source and existed only in prose, so it cannot be read
  correctly without reading a paragraph. Both of us read it as a vintage
  because that is what the name says.

  ✅ AND IT IS A FACT, WHICH IS WHY IT SHIPS. FHI publishes fhi-mobbing as a
  3-year rolling average; that is a property of the upstream table, checkable
  against FHI, and true regardless of who reads it. Same category as
  `unit_type` and `denominator` — and NOT the category of `polarity`, which
  Terje rejected because whether higher is worse is an interpretation.

  🔵 DERIVED, NOT DECLARED. The consumer was hand-maintaining a two-source map
  with a comment pointing at the bus thread; it works and it rots, and the
  third windowed source Atlas adds would have been wrong in its app with nobody
  knowing. This reads the period columns the indicator models already carry, so
  a new windowed source is right the moment it is unioned.

  ⚠️ It also cannot be inferred from the description. The consumer tried, and a
  scan for a window phrase matched `fhi-kpr-1aar` — "KPR 1-year" is the
  upstream table's NAME, and that series is annual, not windowed. A regex would
  have labelled an annual healthcare series as a 3-year window, silently.

  Falls back to 1 where a model has no period columns, which is correct: no
  period means no window.
#}
{% macro window_years() -%}
  coalesce(period_end_year - period_start_year + 1, 1)::int as window_years
{%- endmacro %}
