select
  a.activity_id,
  a.ngo_orgnr,
  a.canonical_name,
  a.service_category_code,
  sc.label_no                       as service_category_label_no,
  a.is_active,
  coalesce(cc.chapter_count, 0)::int as chapter_count
from {{ ref('dim_activity') }} a
join {{ ref('ref_atlas_service_category') }} sc on sc.code = a.service_category_code
left join (
  select activity_id, count(distinct chapter_id) as chapter_count
  from {{ ref('fact_chapter_activities') }}
  where is_active
  group by activity_id
) cc on cc.activity_id = a.activity_id
order by a.ngo_orgnr, a.canonical_name
