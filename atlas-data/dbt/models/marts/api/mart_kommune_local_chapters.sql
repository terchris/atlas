select distinct
  c.kommune_nr,
  c.chapter_id,
  c.name,
  c.ngo_orgnr,
  n.name           as ngo_name,
  n.brand_name     as ngo_brand_name,
  a.service_category_code,
  sc.label_no      as service_category_label_no,
  sc.sort_order
from {{ ref('fact_chapter_activities') }} fca
join {{ ref('dim_chapter') }} c                  on c.chapter_id = fca.chapter_id
join {{ ref('dim_ngo') }} n                      on n.orgnr = c.ngo_orgnr
join {{ ref('dim_activity') }} a                 on a.activity_id = fca.activity_id
join {{ ref('ref_atlas_service_category') }} sc  on sc.code = a.service_category_code
where c.is_active
  and c.chapter_level = 'local'
  and c.kommune_nr is not null
order by c.kommune_nr, sc.sort_order, c.name
