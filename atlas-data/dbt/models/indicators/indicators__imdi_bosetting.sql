{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for IMDi bosettingstall (kommune-level refugee
-- resettlement figures). One row per (kommune_name, year, metric).
--
-- No region_code / region_kind / fylke_nr the way classify_region_code-based
-- sources carry — IMDi publishes kommune names only, no code at all, and
-- every row here is kommune-grain (Oslo's single row IS the kommune, not a
-- fylke rollup). kommune_nr is resolved via crosswalk_kommune_name instead.
--
-- Restricted to name_kind IN ('canonical', 'alternative') — i.e. ACTIVE
-- kommune codes only, never the crosswalk's 'historical' (pre-2020-reform)
-- branch. IMDi's data starts in 2022, after the 2020 reform, so a historical
-- code is never the right match and including it would only add ambiguity:
-- measured live 2026-10-01, the unrestricted crosswalk makes 259 of 359
-- distinct kommune_name values match 2+ kommune_nr; restricted to active
-- names only, 352 of 359 match with ZERO ambiguity. The 7 that still don't
-- match are IMDi's own fylke-disambiguation suffixes ("Bø (Nordland)", "Nes
-- (Ak.)", "Os (Hedm.)", "Sande (Møre og Romsdal)", "Våler (Hedm.)") plus two
-- spelling differences ("Kåfjord" vs the crosswalk's "Kåfjord - Kaivuono",
-- and bare "Våler") — left NULL rather than guessed.

with active_crosswalk as (
  -- Excludes dim_kommune.is_sentinel (SSB's 9999 'Uoppgitt' and the other
  -- non-kommune codes classify_region_code flags). Not observed in real
  -- IMDi data — no kommune_name here has ever matched one — but crosswalk's
  -- canonical/alternative branches don't filter it themselves, so a future
  -- upstream row named e.g. "Uoppgitt" would otherwise resolve to it. This
  -- source's grain is one row per kommune; 9999 is not a kommune.
  select cw.name, cw.kommune_nr
  from {{ ref('crosswalk_kommune_name') }} cw
  join {{ ref('dim_kommune') }} k on k.kommune_nr = cw.kommune_nr and not k.is_sentinel
  where cw.name_kind in ('canonical', 'alternative')
)

select
  'imdi-bosetting'::text as source_id,
  b.kommune_name,
  c.kommune_nr,
  b.year,
  b.metric,
  ('imdi_bosetting__' || b.metric)::text as contents_code,
  case b.metric
    when 'anmodet' then 'Anmodet om å bosette'
    when 'vedtatt' then 'Vedtatt å bosette'
    when 'bosatte' then 'Bosatte'
    when 'bosatte_kollektiv_beskyttelse' then 'Bosatte med kollektiv beskyttelse'
    when 'avtalt' then 'Avtalt å bosette'
    when 'avtalt_kollektiv_beskyttelse' then 'Avtalt å bosette med kollektiv beskyttelse'
  end::text as contents_label,
  b.value,
  b.loaded_at as updated_at
from {{ source('raw', 'imdi_bosetting') }} b
left join active_crosswalk c on c.name = b.kommune_name
