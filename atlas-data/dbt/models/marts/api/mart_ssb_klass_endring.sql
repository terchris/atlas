{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_ssb_klass_endring — SSB Klass's correspondence log with the kind of
-- change derived, published. urb-agents #2098/#2099 (R6). VIEW, not table —
-- a straight projection of marts.dim_ssb_klass_endring, which already
-- carries the derivation (see that model's own header for the method and
-- the measured distribution, including why split_and_merged and
-- renamed_and_renumbered are real categories, not noise).
select
  classification_id,
  old_code,
  old_name,
  new_code,
  new_name,
  change_occurred,
  kind
from {{ ref('dim_ssb_klass_endring') }}
