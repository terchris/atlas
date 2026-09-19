with latest as (
  select source_id, contents_code, max(year) as latest_year
  from {{ ref('fact_kommune_indicators') }}
  group by source_id, contents_code
)
-- 🔴 THE SUBJECT IS CARRIED HERE BECAUSE A CONSUMER COULD NOT FIND IT.
--
-- An outside consumer used 8 of the 195 series in this view and missed the
-- ones matching its own question (urb-agents #1250, #1252). The cause is not
-- that the vocabulary is missing — publisher, theme and topic tags are
-- populated for all 44 sources in mart_meta_sources — it is that this view
-- said nothing about what a series is ABOUT.
--
-- ⚠️ `contents_label` describes the UNIT, not the subject. Scanning it returns
-- "Andel (prosent)" over and over; the subject lived only in an opaque slug,
-- and ssb-06083 carried no subject at all.
--
-- 🔵 A LEFT JOIN, not inner: a series whose source is somehow absent from the
-- catalogue must still appear here with a null subject rather than vanish from
-- the index. mart_meta_sources.source_id is tested unique + not_null, so this
-- cannot fan out.
select
  f.source_id,
  f.contents_code,
  max(f.contents_label) as contents_label,
  max(m.upstream_title) as upstream_title,
  max(m.publisher) as publisher,
  max(m.eu_theme) as eu_theme,
  max(m.tags) as tags,
  l.latest_year,
  count(*) filter (where f.value is not null and f.kommune_is_active)::int as kommuner_with_value,
  count(*) filter (where f.value is null and f.kommune_is_active)::int as kommuner_with_null,
  min(f.value)::float as min_value,
  max(f.value)::float as max_value,
  max(f.updated_at) as upstream_updated
from {{ ref('fact_kommune_indicators') }} f
left join {{ ref('mart_meta_sources') }} m on m.source_id = f.source_id
join latest l on l.source_id = f.source_id
              and l.contents_code = f.contents_code
              and f.year = l.latest_year
group by f.source_id, f.contents_code, l.latest_year
order by f.source_id, f.contents_code
