{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- indicators__fhi_ensomhet — the per-source indicator relation for `fhi-ensomhet`,
-- published verbatim from its own upstream rather than folded into a
-- cross-source mart. Same reasoning as mart_indicators__fhi_bor_alene (see
-- that file): the source's own shape, not Atlas's curated one.
--
-- stability:source. Only MEASURE_TYPE=SMR exists here — a standardised ratio
-- against the national average, never a raw percentage and never a count.
-- urb-agents #2100/#2101 (T5).

select *
from {{ ref('indicators__fhi_ensomhet') }}
