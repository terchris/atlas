with chapter_stats as (
  select
    ngo_orgnr                                                              as orgnr,
    count(*)::int                                                          as chapter_count,
    count(*) filter (where chapter_level = 'national')::int                as national_count,
    count(*) filter (where chapter_level = 'regional')::int                as regional_count,
    count(*) filter (where chapter_level = 'local')::int                   as local_count,
    count(distinct kommune_nr)
      filter (where kommune_nr is not null and is_active)::int             as kommune_count
  from {{ ref('dim_chapter') }}
  group by ngo_orgnr
),
activity_stats as (
  select ngo_orgnr as orgnr, count(*)::int as activity_count
  from {{ ref('dim_activity') }}
  group by ngo_orgnr
)
select
  n.orgnr,
  coalesce(cs.chapter_count, 0)        as chapter_count,
  coalesce(cs.national_count, 0)       as national_count,
  coalesce(cs.regional_count, 0)       as regional_count,
  coalesce(cs.local_count, 0)          as local_count,
  coalesce(a.activity_count, 0)        as activity_count,
  coalesce(cs.kommune_count, 0)        as kommune_count
from {{ ref('dim_ngo') }} n
left join chapter_stats  cs on cs.orgnr = n.orgnr
left join activity_stats a  on a.orgnr  = n.orgnr
order by n.orgnr
