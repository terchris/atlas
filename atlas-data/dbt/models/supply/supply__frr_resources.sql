-- supply__frr_resources.sql
--
-- Map raw FRR JSON rows (in private_raw.frr_resources) to the canonical
-- frr_resources shape per docs/stack/private-marts-shapes.md.
--
-- FRR is multi-NGO: ngo_orgnr is in raw, so this single staging covers every
-- NGO that drops a JSON file into atlas-private-data-repo/<ngo>/frr/. No
-- per-NGO branching required.
--
-- Notes:
--   - Verbatim FRR field names (camelCase → snake_case only).
--   - PII redaction in place: personnavn (~17 records) + kontaktinformasjon
--     get sentinel marker; rows are preserved.
--   - Joins to public marts.dim_kommune / dim_fylke via name → nr.
--   - Latest position + status denormalised via "distinct on" CTEs.

{{ config(materialized='view', schema='private_marts', tags=['private']) }}

with src as (
  select * from {{ source('private_raw', 'frr_resources') }}
),

latest_pos as (
  select distinct on (src.id)
         src.id                                          as resource_id,
         (pos->>'oppdatertTidspunkt')::timestamptz       as position_at,
         pos->'område'->>'fylkesnavn'                    as fylke_navn,
         pos->'område'->>'kommunenavn'                   as kommune_navn,
         pos->'område'->>'politidistriktnavn'            as politidistrikt,
         (pos->'posisjon'->>'breddegrad')::float         as lat,
         (pos->'posisjon'->>'lengdegrad')::float         as lon,
         pos->>'kilde'                                   as kilde
  from src,
       jsonb_array_elements(src.raw_payload->'posisjoner') as pos
  order by src.id, (pos->>'oppdatertTidspunkt')::timestamptz desc nulls last
),

latest_status as (
  select distinct on (src.id)
         src.id                                  as resource_id,
         (st->>'startTidspunkt')::timestamptz    as status_at,
         st->>'statuskode'                       as statuskode
  from src,
       jsonb_array_elements(src.raw_payload->'status') as st
  order by src.id, (st->>'startTidspunkt')::timestamptz desc nulls last
)

select
  -- Identity (verbatim FRR + Atlas-introduced ngo_orgnr)
  src.id,
  src.ngo_orgnr,
  'frr'::text                                         as source_id,

  -- Display + classification (verbatim FRR)
  src.raw_payload->>'visningsnavn'                    as visningsnavn,
  src.raw_payload->>'ressurstype'                     as ressurstype,
  src.raw_payload->>'hovedfunksjon'                   as hovedfunksjon,
  src.raw_payload->>'beskrivelse'                     as beskrivelse,
  src.raw_payload->>'sektor'                          as sektor,
  src.raw_payload->>'bilde'                           as bilde,
  (src.raw_payload->>'verifisertAvEier')::boolean     as verifisert_av_eier,

  -- PII fields with redaction-in-place (preserves row, marks the substitution)
  case when src.raw_payload->>'personnavn' is not null
       then '[ANONYMISERT — personnavn]'
       end                                            as personnavn,
  case when src.raw_payload->>'kontaktinformasjon' is not null
       then '[ANONYMISERT — fri tekst kan inneholde PII]'
       end                                            as kontaktinformasjon,
  (src.raw_payload->>'personnavn' is not null)        as is_personnavn_redacted,
  (src.raw_payload->>'kontaktinformasjon' is not null) as is_kontaktinfo_redacted,

  -- FRR identifiers (verbatim, snake-cased)
  src.raw_payload->>'registerId'                      as register_id,
  src.raw_payload->>'morId'                           as mor_id,
  src.raw_payload->>'baseressurs'                     as baseressurs,
  src.raw_payload->>'eksternSystem'                   as ekstern_system,
  src.raw_payload->>'eksternId'                       as ekstern_id,
  src.raw_payload->>'eksternMorId'                    as ekstern_mor_id,

  -- Denormalised current state (derived from latest position + status)
  ls.statuskode                                       as current_statuskode,
  ls.status_at                                        as current_status_at,
  lp.kommune_navn                                     as current_kommune_navn,
  k.kommune_nr                                        as current_kommune_nr,
  lp.fylke_navn                                       as current_fylke_navn,
  f.fylke_nr                                          as current_fylke_nr,
  lp.politidistrikt                                   as current_politidistrikt,
  lp.lat                                              as current_lat,
  lp.lon                                              as current_lon,
  lp.position_at                                      as position_at,
  lp.kilde                                            as position_kilde,

  -- Arrays as native Postgres arrays (GIN-indexable)
  case when src.raw_payload->'undertyper' is not null
       then array(select jsonb_array_elements_text(src.raw_payload->'undertyper'))
       end                                            as undertyper,
  case when src.raw_payload->'kapasiteter' is not null
       then array(select jsonb_array_elements_text(src.raw_payload->'kapasiteter'))
       end                                            as kapasiteter,

  -- Less-structured nested data: JSONB
  src.raw_payload->'felter'                           as felter,
  src.raw_payload->'utstyr'                           as utstyr,
  src.raw_payload->'vedlegg'                          as vedlegg,

  -- Provenance
  src.sist_oppdatert,
  src.loaded_at

from src
left join latest_pos    lp on lp.resource_id = src.id
left join latest_status ls on ls.resource_id = src.id
-- dim_kommune carries historical kommune codes too (Norway's 2020 reform left
-- duplicate names like 'Larvik' that map to 5 different kommune_nrs). Filter
-- to active to avoid row multiplication.
left join {{ ref('dim_kommune') }} k
  on k.kommune_name = lp.kommune_navn and k.is_active
left join {{ ref('dim_fylke') }} f
  on f.fylke_name = lp.fylke_navn and f.is_active
