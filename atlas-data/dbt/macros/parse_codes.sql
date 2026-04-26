{#
  Helpers for decoding small universal enums and parsing the structured
  code formats that appear across multiple Atlas indicator models.

  See INVESTIGATE-code-label-mapping.md for the wider hybrid strategy.
  Domain enums (family_type, household_type, education_level, …) are
  handled via the `marts.ref_*` seeds + left join — not by macros here.
#}

{#
  decode_sex — SSB Kjonn / FHI KJONN: '0' = all, '1' = male, '2' = female.
  Same coding in every Atlas source that carries this dimension.
#}
{% macro decode_sex(col) -%}
  case {{ col }}
    when '0' then 'all'
    when '1' then 'male'
    when '2' then 'female'
  end
{%- endmacro %}

{#
  period_start_year — first year of an FHI 'YYYY_YYYY' or SSB-12944
  'YYYY-YYYY' period string. Either separator works; coerces to int or
  returns NULL on anything else.
#}
{% macro period_start_year(col) -%}
  case
    when {{ col }} ~ '^[0-9]{4}[_-][0-9]{4}$'
      then split_part(replace({{ col }}, '-', '_'), '_', 1)::int
  end
{%- endmacro %}

{#
  period_end_year — last year of the same range string.
#}
{% macro period_end_year(col) -%}
  case
    when {{ col }} ~ '^[0-9]{4}[_-][0-9]{4}$'
      then split_part(replace({{ col }}, '-', '_'), '_', 2)::int
  end
{%- endmacro %}

{#
  age_range_min / age_range_max — handle FHI's 'A_B' (e.g. '0_120',
  '16_120') and SSB-12944's 'AA-BB' (e.g. '00-17', '18-34'). The caller
  passes the literal separator that source uses. SSB-12944's '999A'
  (all-ages aggregate) and any non-matching value yield NULL.

  '067+' (open-ended) returns 67 for min and NULL for max — the open
  upper bound is honestly unbounded.
#}
{% macro age_range_min(col, sep) -%}
  case
    when {{ col }} ~ ('^[0-9]+' || '{{ sep }}' || '[0-9]+$')
      then split_part({{ col }}, '{{ sep }}', 1)::int
    when {{ col }} ~ '^[0-9]+\+$'
      then regexp_replace({{ col }}, '\+$', '')::int
  end
{%- endmacro %}

{% macro age_range_max(col, sep) -%}
  case
    when {{ col }} ~ ('^[0-9]+' || '{{ sep }}' || '[0-9]+$')
      then split_part({{ col }}, '{{ sep }}', 2)::int
  end
{%- endmacro %}
