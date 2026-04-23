{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['chapter_id'], 'unique': True},
      {'columns': ['ngo_orgnr']},
      {'columns': ['kommune_nr']},
      {'columns': ['chapter_level']},
    ]
  )
}}

-- dim_chapter — every NGO chapter Atlas knows about, conformed across NGOs.
--
-- One row per chapter at any organisational level (national / regional /
-- local) per Q46 of the NGO-supply investigation. Coverage-gap and "find
-- providers near me" queries filter to chapter_level = 'local' per Q48.
--
-- Built by UNIONing per-NGO supply__<ngo_slug>_branches staging models.
-- PLAN-002 lands the first staging model (Red Cross). PLAN-003 will add
-- supply__folkehjelp_chapters and a UNION ALL clause here.

select * from {{ ref('supply__redcross_branches') }}
