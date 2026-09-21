{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 06913 (population change indicators).
-- Same shape as indicators__ssb_08764 (Region × ContentsCode × Tid).

select
  'ssb-06913'::text   as source_id,
  region_code,
  -- 🔴 THE COMMENT HERE USED TO SAY "06913 prefixes region codes with type:
  -- K_0301 (kommune), F_03 (fylke)" AND MATCHED `^K_[0-9]{4}$`. It is wrong,
  -- and it was wrong from the day it was written. Measured by imac against
  -- raw.ssb_06913 on 2026-09-21 (urb-agents #1345):
  --
  --   codes matching ^K_[0-9]{4}$        0     <- none, anywhere
  --   codes matching ^[0-9]{4}$      1,184
  --   rows in the model            783,104
  --   of those, kommune_nr not null      0
  --   rows reaching the fact             0
  --
  -- ⚠️ EVERY ROW OF A 783,104-ROW TABLE WAS DISCARDED by the fact CTE's
  -- `where kommune_nr is not null`, for the whole life of this model. Nothing
  -- noticed because `downstream_model_count` said the source had a model and
  -- nothing asked whether rows arrived. `served_as` is the field that now
  -- says it (urb-agents #1344).
  --
  -- 🔵 The vocabulary is the same family as every sibling — 1,184 four-digit
  -- kommune codes, 41 two-digit fylke, one "0" for nasjon — which is what
  -- makes the K_ expectation look like it was written against a different
  -- export of this table rather than against this one.
  --
  -- So this now uses the canonical macro, like its siblings, rather than a
  -- one-off regex. That is the rule from urb-agents #700 and the one-off is
  -- what broke it.
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  case when region_code ~ '^[0-9]{2}$' then region_code end as fylke_nr,
  -- ⚠️ 61 CODES ENDING IN `u` (37,088 rows, e.g. 0432u) ARE CLASSIFIED
  -- `unknown` AND DO NOT BECOME KOMMUNER. That is deliberate and it is not a
  -- silent drop: they keep their region_code and carry a region_kind saying
  -- what they are not. This is a 1951-2026 series, so a suffixed variant of a
  -- four-digit code is most likely a historical or unspecified bucket — but
  -- nothing in this repo documents what SSB means by it and I have not
  -- verified it, so it is classified rather than interpreted. Recovering them
  -- as kommuner would need someone to establish what the suffix means first.
  {{ classify_region_code('region_code') }} as region_kind,
  year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at           as updated_at
from {{ source('raw', 'ssb_06913') }}
