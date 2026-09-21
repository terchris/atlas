{{
  config(
    post_hook="{{ register_source_id_fk() }}"
  )
}}

-- 🔵 The only config here is the hook: materialization and schema come from
-- dbt_project.yml (marts.api -> table, schema marts) and stay there.
-- register_source_id_fk() runs on both this model and mart_meta_sources,
-- because a rebuild of EITHER drops the constraint between them.

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
  l.latest_year,
  -- 🔵 `and not f.kommune_is_sentinel` on both: this view has one row per
  -- (source, contents_code), so the 9999 sentinel never was a ROW here — it was
  -- counted INSIDE these two numbers.
  --
  -- 🔴 THE DEFECT WAS LATENT, NOT ACTIVE, AND I FIRST WROTE THE OPPOSITE.
  -- I said "every published coverage figure was one kommune too high". That is
  -- a property of this code reported as a property of the data, and the data
  -- does not exercise it (measured by ops-dev and the demo consumer against the
  -- live API, urb-agents #1305):
  --
  --     190 of 195 series   kommuner_with_value + _with_null = 357
  --                         -> no 9999 row at all
  --       5 of 195 series   = 358, all ssb-08764, and the sentinel's value is
  --                         NULL in every one -> it lands in kommuner_with_null
  --     max(kommuner_with_value) across all 195 = 357
  --
  -- ⚠️ So no `kommuner_with_value` was ever inflated — which is the field
  -- consumers divide by — and one source is affected, in its null count only.
  --
  -- ✅ The filter still belongs here. `where f.value is not null` would have
  -- counted a non-null 9999, and nothing stops SSB publishing one: the path was
  -- open and happened to be carrying nulls. Closing a latent path is worth
  -- doing; claiming it was an active error is not, and cost a consumer a
  -- two-app re-audit it did not need.
  count(*) filter (where f.value is not null and f.kommune_is_active
                     and not f.kommune_is_sentinel)::int as kommuner_with_value,
  count(*) filter (where f.value is null and f.kommune_is_active
                     and not f.kommune_is_sentinel)::int as kommuner_with_null,
  min(f.value)::float as min_value,
  max(f.value)::float as max_value,
  max(f.updated_at) as upstream_updated,
  -- 🔴 APPENDED, NOT INSERTED, AND THAT IS LOAD-BEARING.
  --
  -- api_v1.indicator_summary is a `CREATE OR REPLACE VIEW ... SELECT *` over
  -- this table. Postgres will let that add columns AT THE END and refuses any
  -- rename, reorder or drop. I first put these four after contents_label,
  -- which reordered everything below them, and the replace was rejected —
  -- caught by Postgres, not by dbt parse or any gate here (urb-agents #1255).
  --
  -- ⚠️ THE RULE FOR EVERY PUBLISHED MART: new columns go last. Reordering one
  -- is not a cosmetic change, it is a view that can no longer be replaced.
  max(m.upstream_title) as upstream_title,
  max(m.publisher) as publisher,
  max(m.eu_theme) as eu_theme,
  max(m.tags) as tags,
  -- Last, per the rule ten lines above — which this column tried to break on
  -- its first draft by landing next to `latest_year` where it reads best.
  -- Adjacency belongs in schema.yml; ordinal position is a contract.
  max(f.window_years)::int as latest_year_window_years
from {{ ref('fact_kommune_indicators') }} f
left join {{ ref('mart_meta_sources') }} m on m.source_id = f.source_id
join latest l on l.source_id = f.source_id
              and l.contents_code = f.contents_code
              and f.year = l.latest_year
group by f.source_id, f.contents_code, l.latest_year
order by f.source_id, f.contents_code
