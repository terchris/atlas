{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['organisasjonsnummer'], 'unique': True},
      {'columns': ['kommune_nr']},
      {'columns': ['registrert_i_frivillighetsregisteret']},
      {'columns': ['is_active']}
    ]
  )
}}

-- dim_brreg_enhet — current state of every organisation in Enhetsregisteret.
--
-- Reconciles two raw inputs that answer different questions:
--   raw.brreg_enheter_snapshot  — the whole register at one moment (PLAN-001)
--   raw.brreg_enheter_versions  — every change since (PLAN-002)
--
-- 🔴 DELETION IS A FILTER, NEVER A DELETE.
--
-- A tombstoned organisation is excluded from current state and stays in the
-- version history, so "what did this look like before it was removed" remains
-- answerable. Deletions are 8.0% of change traffic (measured over seven days:
-- Sletting 7.3%, Fjernet 0.7%) and they arrive ONLY through the feed — a bulk
-- file cannot express one, because absence from a 1.17M-record file is
-- indistinguishable from a truncated download.
--
-- ⚠️ WHY THE SNAPSHOT IS NOT SIMPLY THE TRUTH.
--
-- The snapshot is a day old the moment it lands, and it can never lose a row.
-- The feed is current but only covers what changed. Neither alone is the
-- register. This model is the only place the two are combined, which is why it
-- is materialized as a table rather than a view: the reconciliation is the
-- expensive part and nothing downstream should repeat it.
--
-- ⚠️ TYPING IS SELECTIVE ON PURPOSE. The eight columns below are the ones Atlas
-- queries. The other ~35 fields stay in `doc`, available to anyone who needs one,
-- without this model having an opinion about all of them and without a migration
-- every time Brreg adds a field.

with snapshot as (
  select
    organisasjonsnummer,
    doc,
    snapshot_file_date,
    loaded_at
  from {{ source('raw', 'brreg_enheter_snapshot') }}
),

-- The most recent change per organisation. `distinct on` with a descending
-- oppdateringsid is exact here because the id is Brreg's own monotonic sequence:
-- there are no ties to break, which is the whole reason the feed is walked by id
-- rather than by timestamp.
latest_change as (
  select distinct on (organisasjonsnummer)
    organisasjonsnummer,
    oppdateringsid,
    endringstype,
    doc as changed_doc,
    fetched_at
  from {{ source('raw', 'brreg_enheter_versions') }}
  order by organisasjonsnummer, oppdateringsid desc
),

-- Organisations the feed has seen but the snapshot has not: registered after the
-- bulk file was generated. A full outer join rather than a left join, because
-- dropping these would mean the register silently lags the feed by up to a day
-- for every new organisation — 16.1% of change traffic is `Ny`.
combined as (
  select
    coalesce(s.organisasjonsnummer, c.organisasjonsnummer) as organisasjonsnummer,
    -- The changed document wins when there is one. ⚠️ For a tombstone this is
    -- Brreg's six-key deletion stub, NOT a full record — a deleted organisation
    -- still answers HTTP 200. Such rows are excluded from current state below,
    -- so the stub never reaches a consumer expecting an Enhet.
    coalesce(c.changed_doc, s.doc) as doc,
    c.endringstype,
    c.oppdateringsid,
    s.snapshot_file_date,
    greatest(coalesce(c.fetched_at, s.loaded_at), coalesce(s.loaded_at, c.fetched_at)) as last_seen_at
  from snapshot s
  full outer join latest_change c
    on s.organisasjonsnummer = c.organisasjonsnummer
),

-- Frivillighetsregisteret enrichment (PLAN-003 phase 3). LEFT JOIN, never inner:
-- ~72,798 of 1.17M organisations are in this register, and an inner join would
-- silently reduce the dimension to the voluntary sector.
--
-- 🔴 This does NOT supply membership. `registrertIFrivillighetsregisteret` below
-- comes from the Enhetsregister document and is on 100% of records, so the NGO
-- population is derived without this table. Only icnpo_* and the FRR-specific
-- attributes depend on it — which means a day when this register is unreachable
-- costs Atlas its classifications, not its NGO population.
frivillig as (
  select
    organisasjonsnummer,
    icnpo_nummer,
    icnpo_kategori,
    doc as frivillig_doc
  from {{ source('raw', 'brreg_frivillige') }}
),

typed as (
  select
    organisasjonsnummer,
    doc ->> 'navn'                                               as navn,
    doc -> 'organisasjonsform' ->> 'kode'                        as organisasjonsform_kode,
    doc -> 'organisasjonsform' ->> 'beskrivelse'                 as organisasjonsform_beskrivelse,
    doc -> 'naeringskode1' ->> 'kode'                            as naeringskode1_kode,
    doc -> 'forretningsadresse' ->> 'kommunenummer'              as kommune_nr,
    -- ⚠️ `antallAnsatte` is present on only ~4% of records (13 of 300 sampled
    -- live on 2026-09-12), while `harRegistrertAntallAnsatte` is on 100%. NULL
    -- here therefore means "not reported", which is NOT the same as zero
    -- employees — and a coverage analysis that reads NULL as 0 understates
    -- staffed organisations by a wide margin. Both columns are kept so the
    -- distinction survives.
    nullif(doc ->> 'antallAnsatte', '')::integer                 as antall_ansatte,
    coalesce((doc ->> 'harRegistrertAntallAnsatte')::boolean, false)
                                                                 as har_registrert_antall_ansatte,
    coalesce((doc ->> 'konkurs')::boolean, false)                as konkurs,
    coalesce((doc ->> 'underAvvikling')::boolean, false)         as under_avvikling,
    coalesce((doc ->> 'underTvangsavviklingEllerTvangsopplosning')::boolean, false)
                                                                 as under_tvangsavvikling,
    coalesce((doc ->> 'registrertIFrivillighetsregisteret')::boolean, false)
                                                                 as registrert_i_frivillighetsregisteret,
    nullif(doc ->> 'registreringsdatoEnhetsregisteret', '')::date as registrert_dato,
    nullif(doc ->> 'slettedato', '')::date                       as slettedato,
    f.icnpo_nummer,
    f.icnpo_kategori,
    f.frivillig_doc -> 'grasrotandel' ->> 'deltarI'              as grasrotandel_deltar_i,
    nullif(f.frivillig_doc ->> 'innfoertDato', '')::date         as frivillig_innfoert_dato,
    endringstype,
    oppdateringsid,
    snapshot_file_date,
    last_seen_at,
    doc
  from combined
  left join frivillig f using (organisasjonsnummer)
)

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
  registrert_i_frivillighetsregisteret,
  registrert_dato,
  icnpo_nummer,
  icnpo_kategori,
  (grasrotandel_deltar_i = 'true') as grasrotandel_deltar_i,
  frivillig_innfoert_dato,
  -- "Trading" rather than "exists". An organisation in konkurs or under
  -- avvikling is still registered and still answers from Brreg; it is simply not
  -- something a coverage analysis should count as an operating body. Consumers
  -- who want everything registered should ignore this column rather than expect
  -- it to mean something else.
  not (konkurs or under_avvikling or under_tvangsavvikling) as is_active,
  endringstype as last_endringstype,
  oppdateringsid as last_oppdateringsid,
  snapshot_file_date,
  last_seen_at,
  doc
from typed
-- 🔴 The deletion filter. Tombstoned rows stay in raw.brreg_enheter_versions and
-- are excluded here. `slettedato` is belt and braces: it catches an organisation
-- deleted between the snapshot and the first feed run, where no version row
-- exists yet to carry the endringstype.
where coalesce(endringstype, '') not in ('Sletting', 'Fjernet')
  and slettedato is null
