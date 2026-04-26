{{ config(materialized='view', schema='marts') }}

-- supply__redcross_branches — staging passthrough for Red Cross branches.
-- Reshapes raw.redcross_branches into dim_chapter shape so dim_chapter can
-- UNION across NGOs without per-NGO logic. Mirrors the indicators__<source_id>
-- pattern in models/indicators/.
--
-- Decisions per PLAN-002:
--   chapter_id           = 'redcross-' || branch_id (composite, namespaced for cross-NGO uniqueness)
--   chapter_level        = CASE on branch_type per Q46 (Nasjonalkontoret/Distrikt/Lokalforening/Ukjent)
--   parent_chapter_id    = 'redcross-' || parent_branch_id (NULL for HQ + Ukjent)
--   kommune_nr           = via dim_postnummer lookup (Q22 + P2.Q8)
--   is_active            = false for Ukjent (P2.Q7); true for active non-terminated; false for terminated

with src as (
  select * from {{ source('raw', 'redcross_branches') }}
)

select
  'redcross-' || src.branch_id                                              as chapter_id,
  '864139442'::text                                                         as ngo_orgnr,
  case src.branch_type
    when 'Nasjonalkontoret' then 'national'
    when 'Distrikt'         then 'regional'
    when 'Lokalforening'    then 'local'
    when 'Ukjent'           then 'local'
  end                                                                       as chapter_level,
  case
    when src.branch_type = 'Nasjonalkontoret' then null::text
    when src.branch_type = 'Ukjent'           then null::text
    when src.parent_branch_id is null         then null::text
    else 'redcross-' || src.parent_branch_id
  end                                                                       as parent_chapter_id,
  src.organization_number                                                   as chapter_orgnr,
  src.branch_name                                                           as name,
  pn.kommune_nr                                                             as kommune_nr,
  case
    when src.branch_type = 'Ukjent' then false
    when src.is_terminated          then false
    else src.is_active
  end                                                                       as is_active,
  src.postal_address_line1,
  src.postal_code,
  src.post_office,
  src.phone,
  src.email,
  src.web,
  null::text                                                                as chapter_subtype,
  src.loaded_at                                                             as updated_at
from src
left join {{ ref('dim_postnummer') }} pn
  on src.postal_code = pn.postnummer
