with latest as (
  select max(year) as year
  from {{ ref('fact_kommune_indicators') }}
  where source_id = 'ssb-08764' and contents_code = 'EUskala60'
)
select
  f.kommune_nr,
  f.kommune_name,
  f.fylke_name,
  f.year,
  max(case when f.contents_code = 'EUskala60' then f.value end)::float as value_pct,
  max(case when f.contents_code = 'Personer'  then f.value end)::float as personer
from {{ ref('fact_kommune_indicators') }} f
join latest l on f.year = l.year
where f.source_id = 'ssb-08764'
  and f.contents_code in ('EUskala60', 'Personer')
  and f.kommune_is_active
group by f.kommune_nr, f.kommune_name, f.fylke_name, f.year
order by f.kommune_nr
