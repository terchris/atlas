select
  n.orgnr,
  n.slug,
  n.name,
  n.brand_name,
  n.website_url,
  n.tier,
  n.chapter_data_shape,
  n.has_chapters,
  n.primary_focus,
  n.icnpo_code_1,
  n.icnpo_code_2,
  n.icnpo_code_3,
  coalesce(c.chapter_count, 0)::int as chapter_count,
  coalesce(c.chapter_count, 0) > 0   as has_supply
from {{ ref('dim_ngo') }} n
left join (
  select ngo_orgnr, count(*) as chapter_count
  from {{ ref('dim_chapter') }}
  where is_active
  group by ngo_orgnr
) c on c.ngo_orgnr = n.orgnr
order by n.name
