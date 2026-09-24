{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- 🔴 THREE OF BRREG'S 64 KEYS ARE DELIBERATELY NOT COLUMNS, AND THIS IS THE
-- RECORD OF WHY. Terje's instruction was "extract all fields properly"
-- (urb-agents #1457). Someone auditing that against the enumeration will count
-- 64 keys and fewer columns, and a silence there looks like an oversight.
--
--   respons_klasse   COUNTED, not sampled: 'Enhet' on all 1 175 415 rows and
--                    zero rows differ. It is a TYPE DISCRIMINATOR for a Brreg
--                    endpoint that can also return Underenhet; Atlas ingests
--                    only Enhet, so it is constant here by construction. A
--                    column with one distinct value across 1.17M rows carries
--                    no information.
--                    ⚠️ It becomes meaningful the day Atlas ingests Underenhet
--                    — which PLAN-001 notes is a separate register with its own
--                    change feed. Add it then.
--   links / _links   HATEOAS navigation for Brreg's own API, not data about the
--                    organisation. 🔵 They partition the table perfectly
--                    (1 112 582 / 62 716 / both 0) and that fact is recorded in
--                    dim_brreg_enhet, because it says something about Atlas's
--                    ingest paths rather than about any organisation.
--
-- 🔵 ops-dev's view was to extract respons_klasse anyway — a constant column is
-- useless and harmless, and an exception costs a justification someone has to
-- maintain. That is a fair argument and this comment is the maintenance cost
-- being paid up front rather than deferred.

-- mart_brreg_enhet — the whole Norwegian organisation register, published.
--
-- 🔴 MATERIALIZED AS A VIEW, unlike every other model in models/marts/api/.
--
-- The others are small aggregates and are tables because computing them costs
-- something. This one is a straight projection of marts.dim_brreg_enhet —
-- ~1.17M rows at ~1,651 bytes of jsonb storage each. Materializing it would add
-- ~2 GB to hold a second copy of the largest object in the database and buy
-- nothing: the projection is free and dim_brreg_enhet is already a table with
-- the indexes consumers filter on (organisasjonsnummer, kommune_nr,
-- registrert_i_frivillighetsregisteret, is_active).
--
-- ⚠️ THIS LINE SAID "a jsonb document averaging 1,708 bytes" UNTIL 2026-09-23.
-- 1,708 IS A REAL MEASUREMENT OF A DIFFERENT OBJECT: it is the average record
-- size in Brreg's UNCOMPRESSED JSON DOWNLOAD — 2,005,028,121 bytes over
-- 1,173,878 records (PLAN-001 phase 1). Text on the wire, not jsonb on disk.
--
-- 🔵 The figure this sentence wanted was already in the repo, one file away, in
-- ingest/src/sources/brreg-enheter-alle/README.md:
--
--     storage   1,651 bytes/row jsonb;  2,340 with a GIN index (+42%)
--
-- The mislabel survived because both numbers are ~1.7 kB and the conclusion —
-- "do not materialize this, it costs ~2 GB" — is right either way.
--
-- ⚠️ These still do not fully reconcile with the cluster measurements on
-- urb-agents #1444: heap/n_live_tup 1,769 B/row and an EXPLAIN width estimate
-- of 1,564 B/row for dim_brreg_enhet, which is LESS than raw's 1,651 B of doc
-- alone. Something differs between raw and the dimension, or the planner's
-- avg_width is stale. `avg(pg_column_size(doc))` on dim_brreg_enhet settles it;
-- do not quote a doc-size figure here until it has.
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
  -- 🔴 Both clocks, published together and deliberately. `last_seen_at` is when
  -- the ingest wrote this organisation into raw; `reconciled_at` is when the
  -- transform last reconciled it into marts. The feed polls every half hour and
  -- the reconciliation follows ten minutes behind, so raw can be fresher than
  -- what this view serves.
  --
  -- Without both, "current" means two different things depending on which table
  -- you read — and a consumer of a public endpoint has no way to tell which one
  -- they are on. An install once sat 13.5 hours behind Brreg with every health
  -- check green; this is the column that makes that visible from outside.
  reconciled_at,
  -- Every remaining upstream field, verbatim: postal and business addresses,
  -- telephone, mobile, email, website, capital, sector code, articles of
  -- association, historical names and the rest. Brreg publishes all of it
  -- openly under NLOD; Atlas neither adds to it nor withholds from it.
  epostadresse,
  mobil,
  telefon,
  hjemmeside,
  registrert_i_mvaregisteret,
  registrert_i_foretaksregisteret,
  registrert_i_stiftelsesregisteret,
  registrert_i_partiregisteret,
  er_i_konsern,
  stiftelsesdato,
  vedtektsdato,
  registreringsdato_foretaksregisteret,
  registreringsdato_merverdiavgiftsregisteret,
  registreringsdato_mva_enhetsregisteret,
  registreringsdato_frivillig_mva,
  registreringsdato_frivillighetsregisteret,
  registreringsdato_antall_ansatte_enhetsreg,
  registreringsdato_antall_ansatte_nav,
  fravalg_revisjon_dato,
  fravalg_revisjon_beslutnings_dato,
  konkursdato,
  under_avvikling_dato,
  tvangsopplost_pga_manglende_regnskap_dato,
  tvangsopplost_pga_manglende_revisor_dato,
  tvangsopplost_pga_mangelfullt_styre_dato,
  under_rekonstruksjonsforhandling_dato,
  tvangsavviklet_pga_manglende_sletting_dato,
  registreringsdato_partiregisteret,
  under_utenlandsk_insolvensbehandling_dato,
  naeringskode1_beskrivelse,
  naeringskode2_kode,
  naeringskode2_beskrivelse,
  naeringskode3_kode,
  naeringskode3_beskrivelse,
  institusjonell_sektorkode_kode,
  institusjonell_sektorkode_beskrivelse,
  hjelpeenhetskode_kode,
  hjelpeenhetskode_beskrivelse,
  forretningsadresse_adresse,
  forretningsadresse_postnummer,
  forretningsadresse_poststed,
  forretningsadresse_kommune,
  forretningsadresse_land,
  forretningsadresse_landkode,
  postadresse_adresse,
  postadresse_postnummer,
  postadresse_poststed,
  postadresse_kommune,
  postadresse_kommune_nr,
  postadresse_land,
  postadresse_landkode,
  kapital_belop,
  kapital_valuta,
  kapital_antall_aksjer,
  kapital_innfort_dato,
  kapital_type,
  kapital_fullt_innbetalt,
  kapital_innbetalt,
  foretaksform_i_hjemlandet_kode,
  foretaksform_i_hjemlandet_beskrivelse,
  foretaksform_i_hjemlandet_beskrivelse_bokmaal,
  utenlandsk_register_adresse_adresse,
  utenlandsk_register_adresse_poststed,
  utenlandsk_register_adresse_land,
  utenlandsk_register_navn,
  registreringsnummer_i_hjemlandet,
  underlagt_lovgivning_land,
  underlagt_lovgivning_landkode,
  overordnet_enhet,
  maalform,
  siste_innsendte_aarsregnskap,
  aktivitet,
  vedtektsfestet_formaal,
  frivillig_mva_registrert_beskrivelser,
  historiske_navn,
  paategninger,
  doc
from {{ ref('dim_brreg_enhet') }}
