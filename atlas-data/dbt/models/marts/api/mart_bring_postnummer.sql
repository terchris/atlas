{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_bring_postnummer — Posten Bring's postcode register with kategori,
-- published for urb-agents #2098/#2099 (R2). Sibling to the existing
-- api_v1.dim_postnummer (same upstream, no kategori, no visible refresh
-- date) — see atlas-data/migrations/075_raw_bring_postnummer.sql for why
-- both are served rather than one replacing the other.
--
-- VIEW, not table — a straight projection of marts.dim_bring_postnummer,
-- which already carries the indexes consumers filter on (postnummer,
-- kommune_nr). ~5,100 rows; materializing would be a second copy for no
-- computation saved.

select
  postnummer,
  poststed,
  kommune_nr,
  kommune_navn,
  kategori,
  loaded_at
from {{ ref('dim_bring_postnummer') }}
