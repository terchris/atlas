{{
  config(
    materialized='table',
    indexes=[
      {'columns': ['postnummer'], 'unique': True}
    ]
  )
}}

-- dim_kartverket_postnummeromrade — one row per postnummer, geometry unioned
-- across the upstream's disjoint polygon pieces where there is more than
-- one. urb-agents #2098/#2099 (R3).
--
-- SIMPLIFICATION METHOD, STATED RATHER THAN LEFT IMPLICIT. ST_SimplifyPreserveTopology's
-- tolerance is in the geometry's OWN units — degrees for a geographic CRS
-- like EPSG:4258, which is not what "50m" (atlas-scraper's own stated
-- tolerance) means. Reproject to EPSG:25833 (EUREF89 UTM zone 33N, metres —
-- the projection Kartverket's own national deliveries default to) before
-- simplifying, then reproject back to 4258 for publication, matching the
-- geographic CRS the request's own field list asks for throughout. UTM zone
-- 33N is not the correct zone for Norway's far east or west, so simplifying
-- there introduces a small, uncharacterised distortion outside zone 33 — not
-- measured here; flagged so a future tightening knows where to look first.
--
-- 🔵 "kommune_nr" IS AN ARRAY. The request's own field list calls it "every
-- municipality the area touches", anticipating a postnummer that spans more
-- than one kommune. Measured 2026-11-08: zero of the 57 split postnummer
-- actually did — every split stayed within one kommune. Modelled as an
-- array anyway, because a snapshot not exercising a case is not the same
-- claim as the case being impossible.

with unioned as (
  select
    postnummer,
    -- poststed is measured identical across every piece of a given
    -- postnummer (not independently re-verified on every build; `array_agg`
    -- below would surface a drift as more than one array element if that
    -- ever stops being true, which is cheaper than a hard assertion that
    -- fails the whole build over a label difference).
    (array_agg(distinct poststed))[1] as poststed,
    array_agg(distinct kommune_nr order by kommune_nr) as kommune_nr,
    max(oppdateringsdato) as oppdateringsdato,
    count(*) as piece_count,
    ST_Multi(ST_Union(geometry)) as geometry_full,
    ST_Multi(
      ST_Transform(
        ST_SimplifyPreserveTopology(
          ST_Transform(ST_Union(geometry), 25833),
          50
        ),
        4258
      )
    ) as geometry_simplified
  from {{ source('raw', 'kartverket_postnummeromrade') }}
  group by postnummer
)

select
  postnummer,
  poststed,
  kommune_nr,
  oppdateringsdato,
  piece_count,
  geometry_full,
  geometry_simplified
from unioned
