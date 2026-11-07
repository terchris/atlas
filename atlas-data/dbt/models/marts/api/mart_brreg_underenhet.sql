{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_brreg_underenhet — every sub-unit in Brreg's underenheter register,
-- published for atlas-scraper (urb-agents #2098/#2099, R1). Scoped to the
-- fields that request asked for, not every upstream key the way
-- mart_brreg_enhet publishes its own register in full — that "publish
-- everything" choice was Terje's explicit ruling for the Enhet register
-- specifically (see that mart's header); it has not been extended here, and
-- api_v1 additions are public exposure that waits for a human, so this stays
-- literally scoped to what was asked rather than assumed to inherit the wider
-- policy.
--
-- VIEW, not table, for the same reason as mart_brreg_enhet: a straight
-- projection of marts.dim_brreg_underenhet, which already carries the
-- indexes consumers filter on (organisasjonsnummer, overordnet_enhet).
-- Materializing would be a second copy of the same ~867k rows for no
-- computation saved.

select
  organisasjonsnummer,
  navn,
  overordnet_enhet,
  organisasjonsform_kode,
  naeringskode1_kode,
  antall_ansatte,
  oppstartsdato,
  nedleggelsesdato,
  kommune_nr,
  is_active,
  beliggenhetsadresse_adresse,
  beliggenhetsadresse_postnummer,
  beliggenhetsadresse_poststed,
  beliggenhetsadresse_kommune_nr,
  beliggenhetsadresse_land,
  beliggenhetsadresse_landkode,
  postadresse_adresse,
  postadresse_postnummer,
  postadresse_poststed,
  postadresse_kommune_nr,
  postadresse_land,
  postadresse_landkode,
  snapshot_file_date,
  loaded_at
from {{ ref('dim_brreg_underenhet') }}
