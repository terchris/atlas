-- Each unitary NGO's sub-unit count (excluding the national row itself)
-- should be within ±10% of the research's own measurement — [Q9], same
-- rule as the federated-NGO test. Targets transcribed verbatim from
-- docs/research/ngo-research/ingestion-specs/brreg-underenheter.md's own
-- table: Frelsesarmeen 175, Kirkens Bymisjon 151.
with targets (ngo_orgnr, ngo_name, target_count) as (
  values
    ('938498318', 'frelsesarmeen', 175),
    ('944384448', 'kirkens-bymisjon', 151)
),

actual as (
  select ngo_orgnr, count(*) as actual_count
  from {{ ref('int_ngo_chapter_subunits') }}
  where chapter_level != 'national'
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
