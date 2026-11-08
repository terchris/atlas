{{
  config(
    materialized='table',
    indexes=[
      {'columns': ['code', 'valid_from']}
    ]
  )
}}

-- dim_ssb_klass_fylke — SSB Klass classification 104's full code history,
-- typed, with the KLASS version id(s) each period falls inside. Sibling to
-- dim_ssb_klass_kommune — see that model's own header for why "with Sami
-- forms" needs no separate fetch (16 of 56 active+historical fylke codes
-- measured 2026-11-08 carry a combined name, same mechanism) and why
-- klass_version_id is an array.
select
  k.code,
  k.name,
  k.valid_from_in_range as valid_from,
  k.valid_to_in_range as valid_to,
  (
    select array_agg(v.version_id order by v.valid_from)
    from {{ source('raw', 'ssb_klass_versions') }} v
    where v.classification_id = '104'
      and v.valid_from < coalesce(k.valid_to_in_range, 'infinity'::date)
      and coalesce(v.valid_to, 'infinity'::date) > k.valid_from_in_range
  ) as klass_version_id,
  k.loaded_at
from {{ source('raw', 'ssb_klass_fylker') }} k
