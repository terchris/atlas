with latest as (
  select source_id, contents_code, max(year) as latest_year
  from {{ ref('fact_kommune_indicators') }}
  group by source_id, contents_code
),
have_value as (
  select distinct f.source_id, f.contents_code, f.kommune_nr
  from {{ ref('fact_kommune_indicators') }} f
  join latest l on l.source_id = f.source_id
                and l.contents_code = f.contents_code
                and f.year = l.latest_year
  where f.value is not null
),
active_kommuner as (
  select kommune_nr, kommune_name
  from {{ ref('dim_kommune') }}
  where is_active
),
all_pairs as (
  select distinct source_id, contents_code from latest
)
select
  p.source_id,
  p.contents_code,
  k.kommune_nr,
  k.kommune_name
from all_pairs p
cross join active_kommuner k
where not exists (
  select 1 from have_value hv
  where hv.source_id = p.source_id
    and hv.contents_code = p.contents_code
    and hv.kommune_nr = k.kommune_nr
)
order by p.source_id, p.contents_code, k.kommune_nr
