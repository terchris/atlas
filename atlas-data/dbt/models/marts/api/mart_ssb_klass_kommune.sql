{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_ssb_klass_kommune — SSB Klass 131's full code history, published.
-- urb-agents #2098/#2099 (R6). VIEW, not table — a straight projection of
-- marts.dim_ssb_klass_kommune, which already carries the version-id join.
select
  code,
  name,
  valid_from,
  valid_to,
  klass_version_id
from {{ ref('dim_ssb_klass_kommune') }}
