{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['chapter_orgnr'], 'unique': True},
      {'columns': ['chapter_id'], 'unique': True},
      {'columns': ['ngo_orgnr']},
      {'columns': ['parent_chapter_id']},
    ]
  )
}}

-- int_ngo_chapter_registry_match — the registered chapters of the nine
-- FEDERATED NGOs (dim_ngo.structure = 'federated'), found by name pattern in
-- dim_brreg_enhet. PLAN-001-brreg-chapter-matching-and-underenheter.md
-- phase 2, per docs/research/ngo-research/ingestion-specs/
-- brreg-chapter-matching.md. Not a new ingest — dim_brreg_enhet already
-- holds everything this reads.
--
-- 🔴 MATERIALIZED AS A TABLE, changed 2026-10-06 — urb-agents #1857/#1866.
-- This was a VIEW until an expensive cross-NGO pattern match (9 rules ×
-- 1.17M dim_brreg_enhet rows, re-executed on every reference) OOM-killed a
-- Postgres backend and crashed/recovered the whole shared instance during
-- transform_checks — the self-referencing parent_chapter_id relationship
-- test is the worst case, since it evaluates this computation on BOTH sides
-- of a join. Materializing pays the cost once per build instead of once per
-- reference; the indexes above make that same self-join and the
-- relationships-to-dim_ngo test cheap instead of a sequential scan.
-- mart_ngo_chapter_registry_match stays a view — a thin passthrough over an
-- already-materialized table is free, same pattern as mart_dim_activity.
--
-- The two UNITARY NGOs (Frelsesarmeen, Kirkens Bymisjon) are deliberately
-- excluded here — their local units are Brreg underenheter, not enheter, and
-- a name search over enheter would return almost nothing for them (the
-- spec's own measurement: 1 row for Frelsesarmeen, 3 for Kirkens Bymisjon,
-- against 175/151 real sub-units reachable only through
-- int_ngo_chapter_subunits). See that model.
--
-- This model does NOT yet join any NGO's own website — int_ngo_chapter_
-- reconciled (a later phase) does that. So "confidence" here tops out at
-- medium, never high: high requires either the NGO's own orgnr (the
-- national row, which this model DOES classify as such) or a strong name
-- match corroborated by the NGO's own site — and no site crawl exists yet.
-- That is not a gap in this model; it is the honest ceiling of registry-only
-- evidence, stated so a later model's "upgrade to high" is visibly an
-- upgrade rather than a silent coincidence.

with rules as (
  select * from {{ ref('ref_atlas_ngo_match_rule') }}
),

-- Rule 4 (brreg-chapter-matching.md): support bodies carrying the brand are
-- never chapters, regardless of which NGO's pattern they also match. Global,
-- not per-NGO, because every NGO's brand can appear in a "friends of" or a
-- housing co-op named after it.
candidates as (
  select
    e.organisasjonsnummer as chapter_orgnr,
    e.navn,
    e.organisasjonsform_kode,
    e.kommune_nr,
    e.is_active,
    e.hjemmeside,
    r.ngo_orgnr,
    r.ngo_slug,
    r.website_host,
    {{ fold_norwegian_for_matching('e.navn') }} as navn_folded
  from {{ ref('dim_brreg_enhet') }} e
  cross join rules r
  where e.registrert_i_frivillighetsregisteret
    -- Unitary NGOs are skipped here by construction: ref_atlas_ngo_match_rule
    -- holds only the 9 federated NGOs (brreg-chapter-matching.md rule 9).
),

-- 🔴 PATTERN DIALECT TRANSLATION, VERIFIED NOT ASSUMED. The seed's patterns
-- are transcribed verbatim from brreg-chapter-matching.md, which writes them
-- in the reference TypeScript implementation's (JavaScript regex) syntax —
-- `\b` for a word boundary. Postgres's `~` operator uses Advanced Regular
-- Expressions (Tcl ARE), where `\b` is NOT a word boundary; `\y` is.
-- Confirmed directly: `'DIABETESFORBUNDET AS' ~ '\bDIABETESFORBUNDET\b'` is
-- false, `~ '\yDIABETESFORBUNDET\y'` is true — every pattern using `\b`
-- silently matched zero rows until this translation (8 of 9 NGOs; the one
-- exception, Speiderforbundet's bare `SPEIDER` with no anchors at all,
-- happened to match anyway, at exactly the spec's own pre-exclude figure of
-- 565 — which is what first made the dialect bug visible rather than silent).
-- Translated here, not in the seed, so the seed stays a faithful, portable
-- copy of the spec's own syntax rather than a Postgres-specific rewrite.
patterns_pg as (
  select
    ngo_orgnr, ngo_slug, website_host,
    replace(include_pattern, '\b', '\y') as include_pattern,
    -- 🔴 A SECOND REAL BUG, found the same way: an empty CSV field loads as
    -- NULL, not '' — dbt's seed loader does not distinguish them. 7 of 9
    -- NGOs have no exclude_pattern (correctly empty in the spec), so
    -- `exclude_pattern != ''` was NULL for them, `NULL AND anything` is
    -- NULL, and a WHERE clause treats NULL exactly like false — silently
    -- dropping every row for those 7 NGOs regardless of include_pattern.
    -- coalesce closes it; the 2 NGOs with a real exclude_pattern (mental-
    -- helse, speiderforbundet) were unaffected, which is why they alone
    -- produced results before this fix and made the bug look partial
    -- rather than universal.
    coalesce(replace(coalesce(exclude_pattern, ''), '\b', '\y'), '') as exclude_pattern,
    replace(strong_pattern, '\b', '\y') as strong_pattern
  from rules
),

matched as (
  select
    *,
    navn_folded ~ include_pattern as is_include_match,
    (exclude_pattern != '' and navn_folded ~ exclude_pattern) as is_excluded,
    navn_folded ~ strong_pattern as is_strong_match,
    (website_host != '' and hjemmeside is not null
       and hjemmeside ilike '%' || website_host || '%') as host_corroborates
  from (
    select c.*, r.include_pattern, r.exclude_pattern, r.strong_pattern
    from candidates c
    join patterns_pg r using (ngo_orgnr, ngo_slug, website_host)
  ) x
),

-- Global exclude (rule 4): support bodies carrying the brand. Checked after
-- the per-NGO include match, same as the spec orders it — a row is only a
-- candidate at all once it already matched some NGO's pattern.
not_support_body as (
  select *
  from matched
  where is_include_match
    and not is_excluded
    -- \y (Postgres ARE word boundary), not \b — see patterns_pg's note above.
    and navn_folded !~ '\y(FORELDREFORENING|VENNEFORENING|VENNER AV|STOTTEFORENING|STOTTEGRUPPE|BORETTSLAG|EIENDOM|HUS AS|SAMEIE)\y'
),

scored as (
  select
    *,
    case
      when chapter_orgnr = ngo_orgnr then 'orgnr'
      when is_strong_match and host_corroborates then 'nameStrong+website'
      when is_strong_match then 'nameStrong'
      else 'nameWeak'
    end as match_method,
    case
      when chapter_orgnr = ngo_orgnr then 'high'
      -- host_corroborates alone (without a strong name) does not promote to
      -- high — rule 2 requires a STRONG name corroborated, not corroboration
      -- substituting for one.
      when is_strong_match then 'medium'
      else 'low'
    end as confidence
  from not_support_body
),

-- Rule 5: one orgnr can match two NGOs' patterns (a sanitetsforening whose
-- name contains HELSELAG, the spec's own example). Keep the stronger claim.
ranked as (
  select
    *,
    row_number() over (
      partition by chapter_orgnr
      order by
        case confidence when 'high' then 1 when 'medium' then 2 else 3 end,
        ngo_orgnr
    ) as claim_rank
  from scored
),

winners as (
  select * from ranked where claim_rank = 1
),

classified as (
  select
    chapter_orgnr,
    ngo_slug || '-' || chapter_orgnr as chapter_id,
    ngo_orgnr,
    navn as name,
    case
      when chapter_orgnr = ngo_orgnr then 'national'
      when organisasjonsform_kode in ('AS', 'STI') then 'related_entity'
      -- Rule 7 region-tier keywords. Folded the same way as the brand match,
      -- for the same reason (a county name can carry Ø/Æ/Å — "MØRE").
      -- \y, not \b — see patterns_pg's note above.
      when navn_folded ~ '\y(DISTRIKT|FYLKESLAG|FYLKESSTYRET|FYLKESFORENING|FYLKE|KRETS|REGION)\y'
        then 'regional'
      else 'local'
    end as chapter_level,
    kommune_nr,
    is_active,
    hjemmeside as web,
    confidence,
    match_method,
    'legal_entity'::text as registration,
    'registry_only'::text as reconciliation,
    'https://data.brreg.no/enhetsregisteret/api/enheter/' || chapter_orgnr as source_url
  from winners
),

with_parent as (
  select
    c.*,
    national.chapter_id as parent_chapter_id
  from classified c
  left join classified national
    on national.ngo_orgnr = c.ngo_orgnr
   and national.chapter_level = 'national'
   and c.chapter_level != 'national'
)

select
  chapter_orgnr,
  chapter_id,
  ngo_orgnr,
  name,
  chapter_level,
  kommune_nr,
  is_active,
  web,
  confidence,
  match_method,
  registration,
  reconciliation,
  parent_chapter_id,
  cast(null as text) as parent_method, -- rule: the registry states no parent link
  source_url
from with_parent
