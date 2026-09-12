{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_brreg_enhet — the whole Norwegian organisation register, published.
--
-- 🔴 MATERIALIZED AS A VIEW, unlike every other model in models/marts/api/.
--
-- The others are small aggregates and are tables because computing them costs
-- something. This one is a straight projection of marts.dim_brreg_enhet —
-- ~1.17M rows carrying a jsonb document averaging 1,708 bytes. Materializing it
-- would add ~2 GB to hold a second copy of the largest object in the database
-- and buy nothing: the projection is free and dim_brreg_enhet is already a
-- table with the indexes consumers filter on (organisasjonsnummer, kommune_nr,
-- registrert_i_frivillighetsregisteret, is_active).
--
-- ⚠️ If you change this to a table, you are doubling Atlas's storage footprint
-- to avoid a projection. Do not do it without a measurement that says why.
--
-- PUBLISHED ON TERJE'S INSTRUCTION, 2026-09-12. This reverses his own earlier
-- decision (2026-09-11) that the Brreg work would add no public endpoint. His
-- reason, verbatim: the information about ENK and other companies is public
-- information by Norwegian law, and Norwegian law outranks any internal rule.
-- Recorded here because `api_v1` additions are public exposure and wait for a
-- named human — this is the human and this is the record.

select
  organisasjonsnummer,
  navn,
  organisasjonsform_kode,
  organisasjonsform_beskrivelse,
  naeringskode1_kode,
  kommune_nr,
  antall_ansatte,
  har_registrert_antall_ansatte,
  konkurs,
  under_avvikling,
  under_tvangsavvikling,
  is_active,
  registrert_i_frivillighetsregisteret,
  registrert_dato,
  icnpo_nummer,
  icnpo_kategori,
  grasrotandel_deltar_i,
  frivillig_innfoert_dato,
  last_seen_at,
  -- Every remaining upstream field, verbatim: postal and business addresses,
  -- telephone, mobile, email, website, capital, sector code, articles of
  -- association, historical names and the rest. Brreg publishes all of it
  -- openly under NLOD; Atlas neither adds to it nor withholds from it.
  doc
from {{ ref('dim_brreg_enhet') }}
