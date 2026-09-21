{{ config(materialized='table', schema='marts') }}

-- Per-source indicator passthrough for FHI Folkehelsestatistikk table 370:
-- primary-care contact rates per 1 000, by ICPC-2 diagnosis group.
--
-- 🔴 SERVED BECAUSE IT IS INGESTED. Terje's standing rule, 2026-09-21: if a
-- dataset is added it must be served. This source had been pulled weekly for
-- months and modelled nowhere — reachable only as a verbatim FHI payload in
-- raw, with vendor dimension codes and no kommune column.
--
-- kommune_nr comes through region_code_to_kommune_nr, so bydel, fylke, nasjon
-- and the territorial codes get a null kommune_nr and a named region_kind
-- rather than being called municipalities by a bare four-digit regex.
--
-- ⚠️ Every upstream dimension is carried, not collapsed. The headline slice is
-- chosen in fact_kommune_indicators, where it is visible and arguable; this
-- model keeps everything so a consumer wanting another slice has one.

select
  'fhi-kpr-1aar'::text          as source_id,
  geo_code              as region_code,
  {{ region_code_to_kommune_nr('geo_code') }} as kommune_nr,
  {{ classify_region_code('geo_code') }} as region_kind,
  case when geo_code ~ '^[0-9]{2}$' then geo_code end as fylke_nr,
  (split_part(aar_code, '_', 1))::int as year,
  aar_code              as period,
  {{ period_start_year('aar_code') }} as period_start_year,
  {{ period_end_year('aar_code') }}   as period_end_year,
  {{ decode_sex('kjonn_code') }} as sex,
  alder_code            as age_band,
  kodegruppe_code       as icpc2_group,
  measure_type          as contents_code,
  case measure_type
    when 'TELLER' then 'Antall (personer)'
    when 'RATE'   then 'Andel eller rate'
    when 'SMR'    then 'Standardisert ratio (100 = landsgjennomsnitt)'
    when 'MEIS'   then 'FHI-glattet estimat'
    else measure_type
  end                   as contents_label,
  value,
  status,
  loaded_at             as updated_at
from {{ source('raw', 'fhi_kpr_1aar') }}
