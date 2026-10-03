{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for Lottstift's momskompensasjon (annual VAT-compensation
-- allocations to voluntary organisations). One row per (organisasjonsnummer, year).
-- Atlas's first Lottstift source.
--
-- ⚠️ Geography and ICNPO category are NOT in raw.lottstift_momskompensasjon at all — they are
-- resolved here via a LEFT JOIN to dim_brreg_enhet on organisasjonsnummer (populated via the
-- separate, already-shipped brreg-frivillige source). LEFT, never INNER: an unmatched recipient
-- (deleted from Brreg, or never captured by a bulk/feed cycle) resolves to NULL kommune_nr/
-- icnpo_* rather than silently disappearing from this relation.
--
-- kommune_nr via classify_region_code/region_code_to_kommune_nr, same as every other
-- kommune-grain source — dim_brreg_enhet's own kommune_nr is Brreg's raw forretningsadresse
-- field, verbatim, and can itself carry Svalbard's 21xx or other sentinel codes.

with recipients as (
  select
    organisasjonsnummer,
    year,
    amount_nok,
    amount_label,
    loaded_at
  from {{ source('raw', 'lottstift_momskompensasjon') }}
),

enriched as (
  select
    r.*,
    b.kommune_nr as brreg_kommune_nr,
    b.icnpo_nummer,
    b.icnpo_kategori
  from recipients r
  left join {{ ref('dim_brreg_enhet') }} b
    on r.organisasjonsnummer = b.organisasjonsnummer
)

select
  'lottstift-momskompensasjon'::text as source_id,
  organisasjonsnummer,
  {{ region_code_to_kommune_nr('brreg_kommune_nr') }} as kommune_nr,
  {{ classify_region_code('brreg_kommune_nr') }} as region_kind,
  icnpo_nummer,
  icnpo_kategori,
  year,
  'lottstift_momskompensasjon__tildelt'::text as contents_code,
  amount_label::text as contents_label,
  amount_nok as value,
  loaded_at as updated_at
from enriched
