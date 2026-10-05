{{ config(materialized='view', schema='marts') }}

-- int_ngo_chapter_subunits — the local units of the two UNITARY NGOs
-- (Frelsesarmeen, Kirkens Bymisjon), found as Brreg underenheter of their
-- own national enhet. PLAN-001-brreg-chapter-matching-and-underenheter.md
-- phase 3.4, per docs/research/ngo-research/ingestion-specs/
-- brreg-underenheter.md.
--
-- Reads raw.brreg_underenheter_snapshot directly, unfiltered by NGO at the
-- source (see that migration's own header: the ingest is deliberately the
-- whole register, not a two-NGO pull), filtered to the two unitary NGOs
-- only here, in this model — exactly the design PLAN-001's "Overlap" note
-- committed to, so a future full-register consumer finds the ingest already
-- done rather than duplicated.
--
-- ⚠️ KNOWN GAP, STATED RATHER THAN HIDDEN: this reads the bootstrap snapshot
-- only, not raw.brreg_underenheter_oppdateringer/_versions. There is no
-- dim_brreg_underenhet yet — the incremental reconciliation dim_brreg_enhet
-- does for the enheter register (apply Sletting/Fjernet, keep the freshest
-- doc per orgnr) has no sibling here. A sub-unit Brreg has deleted since the
-- last bootstrap run stays in this model until that reconciliation model
-- exists. Not building it now because PLAN-001 phase 3.4 did not ask for
-- it and this repo's own change-feed design already separates "ingest" from
-- "reconcile" as different pieces of work — flagging the gap rather than
-- silently accepting staleness or silently scope-creeping into building a
-- second dim_brreg_enhet-sized model unasked.
--
-- ⚠️ SIMPLIFIED FROM THE SPEC'S RULE 3: the spec's area-splitting
-- (`<BRAND> <AREA> AVD <UNIT>`, learning AREA from rows that use AVD and
-- stripping it from rows that omit it) is not implemented here. `unit_name`
-- below extracts only the literal text after " AVD " when present; nothing
-- downstream renders a chapter's service area yet (dim_chapter doesn't
-- exist), so the fuller fidelity is deferred rather than built untested
-- against a consumer that does not exist.

with national_rows as (
  -- Rule 2: emit the parent entity as the national row, or every sub-unit's
  -- parent_chapter_id points at a row that does not exist (723 orphans in
  -- the research without this). The national row is an ENHET, not an
  -- UNDERENHET, so it comes from dim_brreg_enhet, not this snapshot.
  select
    e.organisasjonsnummer as chapter_orgnr,
    n.slug || '-' || e.organisasjonsnummer as chapter_id,
    n.orgnr as ngo_orgnr,
    e.navn as name,
    'national'::text as chapter_level,
    e.kommune_nr,
    e.is_active,
    e.hjemmeside as web,
    null::text as unit_name,
    'high'::text as confidence,
    'legal_entity'::text as registration,
    'registry_only'::text as reconciliation,
    cast(null as text) as parent_chapter_id,
    'https://data.brreg.no/enhetsregisteret/api/enheter/' || e.organisasjonsnummer as source_url
  from {{ ref('dim_ngo') }} n
  join {{ ref('dim_brreg_enhet') }} e on e.organisasjonsnummer = n.orgnr
  where n.structure = 'unitary'
),

sub as (
  select
    doc ->> 'organisasjonsnummer' as chapter_orgnr,
    doc ->> 'overordnetEnhet' as ngo_orgnr,
    doc ->> 'navn' as navn,
    doc -> 'organisasjonsform' ->> 'kode' as organisasjonsform_kode,
    doc -> 'beliggenhetsadresse' ->> 'kommunenummer' as kommune_nr_beliggenhet,
    doc -> 'postadresse' ->> 'kommunenummer' as kommune_nr_post,
    (doc ->> 'nedleggelsesdato') is null as is_active
  from {{ source('raw', 'brreg_underenheter_snapshot') }}
),

sub_for_unitary as (
  select s.*, n.slug as ngo_slug
  from sub s
  join {{ ref('dim_ngo') }} n
    on n.orgnr = s.ngo_orgnr
   and n.structure = 'unitary'
),

classified as (
  select
    chapter_orgnr,
    ngo_slug || '-' || chapter_orgnr as chapter_id,
    ngo_orgnr,
    navn as name,
    case
      -- Rule 8: owned companies are not chapters, regardless of name
      -- keywords (Fretex is form AS). Checked first, so a Fretex division
      -- cannot be reclassified regional by a stray "REGION" in its name.
      when organisasjonsform_kode = 'AS' then 'related_entity'
      -- \y, not \b (Postgres ARE word boundary) — see int_ngo_chapter_registry_match.sql's note.
      when navn ~* '\y(DIVISJON|REGION|REGIONKONTOR)\y' then 'regional'
      when navn ~* '\y(HOVEDKONTOR|ADMINISTRASJON|ADM|HOVEDKVARTER)\y' then 'related_entity'
      else 'local'
    end as chapter_level,
    coalesce(kommune_nr_beliggenhet, kommune_nr_post) as kommune_nr,
    is_active,
    cast(null as text) as web,
    -- Simplified rule 3 — see the model header. Only the literal AVD suffix.
    case
      when navn ~* '\sAVD\s' then trim(substring(navn from '(?i)\sAVD\s+(.*)$'))
      else null
    end as unit_name,
    'high'::text as confidence,
    'sub_unit'::text as registration,
    'registry_only'::text as reconciliation,
    ngo_slug || '-' || ngo_orgnr as parent_chapter_id,
    'https://data.brreg.no/enhetsregisteret/api/underenheter/' || chapter_orgnr as source_url
  from sub_for_unitary
)

select
  chapter_orgnr, chapter_id, ngo_orgnr, name, chapter_level, kommune_nr,
  is_active, web, unit_name, confidence, registration, reconciliation,
  parent_chapter_id, source_url
from national_rows

union all

select
  chapter_orgnr, chapter_id, ngo_orgnr, name, chapter_level, kommune_nr,
  is_active, web, unit_name, confidence, registration, reconciliation,
  parent_chapter_id, source_url
from classified
