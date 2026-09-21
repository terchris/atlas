{{ config(materialized='table', schema='marts') }}

-- Per-source indicator passthrough for FHI Folkehelsestatistikk (Ungdata):
-- share of youth respondents reporting having a close confiding friend.
--
-- 🔴 UNGDATA IS A SURVEY, NOT AN ENUMERATION. There is no TELLER and no RATE in
-- these tables — only SMR (a standardised ratio against the national average,
-- 100 = national) and MEIS (FHI's smoothed estimate). ⚠️ So these values cannot
-- be summed, and multiplying one by a population does NOT give a number of
-- young people. That is the `personer` defect waiting to happen, on nine
-- sources at once, so it is said here and in every published description.
--
-- The upstream slice is degenerate on three dimensions and they are carried
-- rather than dropped, so a consumer can see what was held fixed:
--   ALDER  always "1_6"  ⚠️ an Ungdata survey-cohort identifier, NOT ages 1-6.
--                        Unverified against Ungdata methodology — flagged in
--                        the manifest by whoever ingested it, still open.
--   HARVENN  always "Jatrorellerheltsikker"
--   SOES   always "0" (combined)
--
-- kommune_nr comes through region_code_to_kommune_nr, not a bare four-digit
-- regex: GEO mixes kommune, fylke, bydel and national codes, and the bare
-- regex is what called Svalbard a municipality (urb-agents #700).

select
  'fhi-fortrolig_venn'::text     as source_id,
  geo_code              as region_code,
  {{ region_code_to_kommune_nr('geo_code') }} as kommune_nr,
  {{ classify_region_code('geo_code') }} as region_kind,
  case when geo_code ~ '^[0-9]{2}$' then geo_code end as fylke_nr,
  (split_part(aar_code, '_', 1))::int as year,
  aar_code              as period,
  {{ period_start_year('aar_code') }} as period_start_year,
  {{ period_end_year('aar_code') }}   as period_end_year,
  {{ decode_sex('kjonn_code') }} as sex,
  alder_code            as ungdata_cohort,
  harvenn_code          as response,
  soes_code             as socioeconomic_status,
  measure_type          as contents_code,
  case measure_type
    when 'SMR'  then 'Standardisert ratio (100 = landsgjennomsnitt)'
    when 'MEIS' then 'FHI-glattet estimat (andel)'
    else measure_type
  end                   as contents_label,
  value,
  status,
  loaded_at             as updated_at
--
-- ⚠️ THE MEIS LABEL DIFFERS FROM indicators__fhi_mobbing, DELIBERATELY. That
-- model glosses MEIS as 'Tillatelsesintervall-indeks'; FHI documents MEIS as a
-- smoothed estimate, and one of the two is wrong. Rather than propagate a gloss
-- I cannot verify across nine more sources, this says what the manifests say.
-- Reconciling mobbing is a separate change and needs someone who can check
-- FHI's own documentation.

from {{ source('raw', 'fhi_fortrolig_venn') }}
