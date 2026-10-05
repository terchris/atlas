-- Each federated NGO's registry-matched row count should be within ±10% of
-- the research's own measurement (brreg-chapter-matching.md's "registered
-- chapters (legal_entity)" column) — [Q9] of
-- INVESTIGATE-ngo-research-handover.md: a source lands when its counts are
-- within tolerance, or the gap is explained in the model's own notes. The
-- register moves between the research's measurement (26-27 Sep 2026) and
-- any later build, so an exact match is not the bar; a large gap is the
-- signal, per the spec's own framing.
--
-- Targets transcribed verbatim from the spec table, not recalled:
--   Røde Kors 381 · Sanitetskvinnene 463 · Nasjonalforeningen 370 · 4H 494 ·
--   Speiderforbundet 393 · LHL 228 · Mental Helse 188 · Diabetesforbundet 117 ·
--   Folkehjelp 107
with targets (ngo_orgnr, ngo_name, target_count) as (
  values
    ('864139442', 'redcross', 381),
    ('970168001', 'sanitetskvinnene', 463),
    ('938429863', 'nasjonalforeningen', 370),
    ('943838240', 'fire-h', 494),
    ('954877841', 'speiderforbundet', 393),
    ('940190738', 'lhl', 228),
    ('971322926', 'mental-helse', 188),
    ('970169113', 'diabetesforbundet', 117),
    ('871033552', 'folkehjelp', 107)
),

actual as (
  select ngo_orgnr, count(*) as actual_count
  from {{ ref('int_ngo_chapter_registry_match') }}
  group by ngo_orgnr
)

select
  t.ngo_name,
  t.target_count,
  coalesce(a.actual_count, 0) as actual_count,
  round(
    100.0 * (coalesce(a.actual_count, 0) - t.target_count) / t.target_count, 1
  ) as pct_off
from targets t
left join actual a using (ngo_orgnr)
where abs(coalesce(a.actual_count, 0) - t.target_count) > 0.10 * t.target_count
