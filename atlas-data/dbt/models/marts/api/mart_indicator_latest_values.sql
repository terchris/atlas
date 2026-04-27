with latest as (
  select source_id, contents_code, max(year) as latest_year
  from {{ ref('fact_kommune_indicators') }}
  group by source_id, contents_code
)
select
  f.source_id,
  f.contents_code,
  f.kommune_nr,
  f.kommune_name,
  f.fylke_name,
  f.value::float as value,
  f.status,
  f.year
from {{ ref('fact_kommune_indicators') }} f
join latest l on l.source_id = f.source_id
              and l.contents_code = f.contents_code
              and f.year = l.latest_year
where f.kommune_is_active
order by f.source_id, f.contents_code, f.kommune_nr
