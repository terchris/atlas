{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_ssb_klass_fylke — SSB Klass 104's full code history, published.
-- Sibling to mart_ssb_klass_kommune. urb-agents #2098/#2099 (R6).
select
  code,
  name,
  valid_from,
  valid_to,
  klass_version_id
from {{ ref('dim_ssb_klass_fylke') }}
