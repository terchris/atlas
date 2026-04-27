with latest as (
  select source_id, contents_code, max(year) as latest_year
  from {{ ref('fact_kommune_indicators') }}
  group by source_id, contents_code
)
select
  f.source_id,
  f.contents_code,
  max(f.contents_label) as contents_label,
  l.latest_year,
  count(*) filter (where f.value is not null and f.kommune_is_active)::int as kommuner_with_value,
  count(*) filter (where f.value is null and f.kommune_is_active)::int as kommuner_with_null,
  min(f.value)::float as min_value,
  max(f.value)::float as max_value,
  max(f.updated_at) as upstream_updated
from {{ ref('fact_kommune_indicators') }} f
join latest l on l.source_id = f.source_id
              and l.contents_code = f.contents_code
              and f.year = l.latest_year
group by f.source_id, f.contents_code, l.latest_year
order by f.source_id, f.contents_code
