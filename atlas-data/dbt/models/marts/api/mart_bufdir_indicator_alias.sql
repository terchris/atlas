{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source alias table for bufdir-barnefattigdom indicator_api_id renumbers.
-- One row per (historical_id, canonical_id) mapping consumers can join on for
-- cross-time-series continuity when Bufdir splits, retires, or renumbers
-- workbooks (e.g. the observed Indikator 9 → 9a/9b split, Indikator 10 retired).
--
-- Thin pass-through over the seed at seeds/sources/bufdir_indicator_alias.csv.
-- Lives under models/marts/api/ so the PLAN-004 generator auto-wraps as
-- api_v1.bufdir_indicator_alias (the leading "mart_" is stripped by the
-- generator per the marts/api/ README).
--
-- See website/docs/ai-developer/plans/active/PLAN-bufdir-surrogate-id-migration.md
-- for the design rationale and the maintenance ritual that keeps this current.

select
  source_id,
  historical_id,
  canonical_id,
  note
from {{ ref('bufdir_indicator_alias') }}
order by source_id, historical_id, canonical_id nulls last
