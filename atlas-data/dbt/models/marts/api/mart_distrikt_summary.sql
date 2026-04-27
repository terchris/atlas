select
  c.chapter_id,
  c.name,
  c.kommune_nr,
  k.kommune_name,
  c.ngo_orgnr,
  coalesce(stats.child_count, 0)::int            as child_count,
  coalesce(stats.kommune_coverage_count, 0)::int as kommune_coverage_count
from {{ ref('dim_chapter') }} c
left join {{ ref('dim_kommune') }} k on k.kommune_nr = c.kommune_nr
left join (
  select
    parent_chapter_id,
    count(*)                                  as child_count,
    count(distinct kommune_nr)
      filter (where kommune_nr is not null)   as kommune_coverage_count
  from {{ ref('dim_chapter') }}
  where is_active
  group by parent_chapter_id
) stats on stats.parent_chapter_id = c.chapter_id
where c.chapter_level = 'regional'
order by c.ngo_orgnr, c.name
