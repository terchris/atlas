{{
  config(
    materialized='table',
    indexes=[
      {'columns': ['adresse_id'], 'unique': True},
      {'columns': ['kommune_nr', 'adressenavn', 'nummer', 'bokstav', 'postnummer']},
      {'columns': ['kommune_nr', 'gardsnummer', 'bruksnummer']}
    ]
  )
}}

-- dim_kartverket_matrikkel_adresse — one row per address in Kartverket's
-- Matrikkelen. urb-agents #2098/#2099 (R5).
--
-- TWO COMPOSITE INDEXES, FOR THREE LOOKUP PATTERNS. The request names three:
--   (a) kommune_nr + adressenavn + nummer + bokstav + postnummer
--   (b) the same without postnummer
--   (c) gardsnummer + bruksnummer within a kommune
-- A btree on (a)'s five columns also serves (b): Postgres can use a
-- leftmost-prefix match on the same index for a query that omits the
-- trailing column, so one index covers both rather than two.
--
-- PLAIN TABLE, NOT INCREMENTAL. Matrikkelen's address file has no documented
-- change feed the way Brreg's enheter do (raw.brreg_enheter_versions) — the
-- only mechanism is a fresh whole-country pull, matching the other
-- Geonorge-sourced kartverket-* sources. A monthly full rebuild of ~2.6M
-- rows is the honest cost of that, not a corner cut.
--
-- geometry(Point, 4258) FROM Nord/Øst, NOT A PROJECTED CRS. Nord is latitude
-- (Norway spans ~58-71°N), Øst is longitude — ST_MakePoint takes (x, y) =
-- (longitude, latitude), so the arguments below are (øst, nord), not the
-- upstream column order.
select
  doc ->> 'adresseId'          as adresse_id,
  doc ->> 'kommunenummer'      as kommune_nr,
  doc ->> 'adressetype'        as adressetype,
  nullif(doc ->> 'adressenavn', '')  as adressenavn,
  nullif(doc ->> 'nummer', '')::integer      as nummer,
  nullif(doc ->> 'bokstav', '')      as bokstav,
  nullif(doc ->> 'gardsnummer', '')::integer as gardsnummer,
  nullif(doc ->> 'bruksnummer', '')::integer as bruksnummer,
  doc ->> 'postnummer'         as postnummer,
  doc ->> 'poststed'           as poststed,
  ST_SetSRID(
    ST_MakePoint(
      (doc ->> 'Øst')::double precision,
      (doc ->> 'Nord')::double precision
    ),
    4258
  ) as geometry,
  -- Fractional seconds vary in width (absent, ".41", ".786", ".501786" all
  -- measured 2026-11-08) — to_timestamp stops consuming once its format is
  -- satisfied and silently drops whatever text follows, verified directly
  -- against all four shapes rather than assumed. The cost is sub-second
  -- precision on this column, which nothing downstream needs.
  to_timestamp(doc ->> 'oppdateringsdato', 'DD.MM.YYYY HH24:MI:SS') as oppdateringsdato,
  loaded_at
from {{ source('raw', 'kartverket_matrikkel_adresse') }}
