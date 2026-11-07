-- dim_brreg_underenhet.sql — current state of every sub-unit in Brreg's
-- underenheter register (~867k rows), typed from the daily bootstrap snapshot.
--
-- ⚠️ KNOWN GAP, STATED RATHER THAN HIDDEN — the same choice
-- int_ngo_chapter_subunits.sql made first, generalised here to the whole
-- register: this reads raw.brreg_underenheter_snapshot directly, not
-- reconciled against raw.brreg_underenheter_oppdateringer the way
-- dim_brreg_enhet reconciles against the enheter change feed. A sub-unit Brreg
-- has deleted since the last bootstrap run stays here until that
-- reconciliation model is built. Not building it now: urb-agents #2098/#2099
-- asked Atlas to serve the whole register for atlas-scraper's lookups by
-- organisasjonsnummer and by overordnet_enhet, not to build underenheter's own
-- dim_brreg_enhet-sized reconciliation pipeline — that is separate, larger
-- work, flagged here rather than silently scope-creeped into or silently
-- accepted as staleness.
{{
  config(
    materialized='table',
    indexes=[
      {'columns': ['organisasjonsnummer'], 'unique': True},
      {'columns': ['overordnet_enhet']}
    ]
  )
}}

select
  organisasjonsnummer,
  doc ->> 'navn'                                                   as navn,
  doc ->> 'overordnetEnhet'                                        as overordnet_enhet,
  doc -> 'organisasjonsform' ->> 'kode'                            as organisasjonsform_kode,
  doc -> 'naeringskode1' ->> 'kode'                                as naeringskode1_kode,
  nullif(doc ->> 'antallAnsatte', '')::integer                     as antall_ansatte,
  (doc ->> 'oppstartsdato')::date                                  as oppstartsdato,
  (doc ->> 'nedleggelsesdato')::date                               as nedleggelsesdato,
  doc -> 'beliggenhetsadresse' ->> 'kommunenummer'                 as kommune_nr,
  coalesce(
    (select array_agg(x) from jsonb_array_elements_text(doc -> 'beliggenhetsadresse' -> 'adresse') x),
    '{}'
  )::text[]                                                        as beliggenhetsadresse_adresse,
  doc -> 'beliggenhetsadresse' ->> 'postnummer'                    as beliggenhetsadresse_postnummer,
  doc -> 'beliggenhetsadresse' ->> 'poststed'                      as beliggenhetsadresse_poststed,
  doc -> 'beliggenhetsadresse' ->> 'kommunenummer'                 as beliggenhetsadresse_kommune_nr,
  doc -> 'beliggenhetsadresse' ->> 'land'                          as beliggenhetsadresse_land,
  doc -> 'beliggenhetsadresse' ->> 'landkode'                      as beliggenhetsadresse_landkode,
  coalesce(
    (select array_agg(x) from jsonb_array_elements_text(doc -> 'postadresse' -> 'adresse') x),
    '{}'
  )::text[]                                                        as postadresse_adresse,
  doc -> 'postadresse' ->> 'postnummer'                            as postadresse_postnummer,
  doc -> 'postadresse' ->> 'poststed'                              as postadresse_poststed,
  doc -> 'postadresse' ->> 'kommunenummer'                         as postadresse_kommune_nr,
  doc -> 'postadresse' ->> 'land'                                  as postadresse_land,
  doc -> 'postadresse' ->> 'landkode'                              as postadresse_landkode,
  (doc ->> 'nedleggelsesdato') is null                             as is_active,
  snapshot_file_date,
  loaded_at
from {{ source('raw', 'brreg_underenheter_snapshot') }}
