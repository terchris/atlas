{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- SSB 08487 — reported offences by place of offence (kommune and higher aggregates);
-- two-year rolling averages.
-- ⚠️ contents_code must NOT embed region_code or period_interval_code.
--
-- It used to: `region_code__lovbrudd__contents__period`. That made every code
-- unique to one kommune and one period, so `contents_code` stopped being an
-- indicator identifier and became a row identifier — 484,992 distinct codes for
-- 484,992 fact rows.
--
-- mart_indicator_missing_kommuner cross joins every (source_id, contents_code)
-- against every active kommune to ask "who is missing this indicator?". With
-- kommune-specific codes, every code was reported missing for the other 357
-- kommuner, producing **173.6M rows / 17GB** — 281x the fact table — and nearly
-- filling the disk on the first full 41-source run.
--
-- kommune_nr and year are already carried as their own columns, so the region
-- and period were redundant in the code as well as harmful. After the fix:
-- 32 distinct codes, and the missing-kommuner mart drops to 6,916 rows.
--
-- contents_label follows the same rule, so a label stays 1:1 with its code —
-- mart_indicator_summary does `max(contents_label) group by contents_code`,
-- which silently picks an arbitrary region's label if they disagree.
select
  'ssb-crime-tables'::text as source_id,
  case
    when region_code ~ '^[0-9]{4}$'
      and region_code <> '0000'
      and right(region_code, 2) <> '99'
      then region_code
  end as kommune_nr,
  case when region_code ~ '^[0-9]{2}$' then region_code end as fylke_nr,
  -- The raw region identifier, kept as its own column. SSB 08487 reports on
  -- kommuner, fylker, police districts and the country, and the last two fit
  -- neither kommune_nr nor fylke_nr — so without this the region is simply
  -- absent from the model and rows that differ only by region look identical.
  -- That is what made smuggling it into contents_code look acceptable.
  region_code::text as region_code,
  cast(split_part(replace(period_interval_code, '–', '-'), '-', 2) as integer) as year,
  (lovbrudd_krim_code || '__' || contents_code)::text as contents_code,
  (lovbrudd_krim_label || ' — ' || contents_label)::text as contents_label,
  value,
  status,
  loaded_at               as updated_at
from {{ source('raw', 'ssb_08487') }}
