-- Singular dbt test: every column in api_v1.* has a Postgres COMMENT.
--
-- The OpenAPI spec PostgREST projects from api_v1 sources column descriptions
-- from pg_catalog.pg_description; an undescribed column shows up as an empty
-- entry in the public API docs. PLAN-002 closed the schema.yml description
-- gaps for marts.*; this test extends the same guarantee to api_v1.*.
--
-- Returns one row per undocumented column. dbt test fails if any rows return.
--
-- Sibling validation: scripts/generate_api_v1.py emits COMMENT ON COLUMN per
-- described model column ([Q3] outcome). check-api-v1.sh's static
-- description-coverage gate verifies the COMMENTs land in the SQL; this
-- runtime test verifies they reach Postgres after apply-api-v1.sh.

select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.ordinal_position
from information_schema.columns c
join pg_class      pgc on pgc.relname = c.table_name
join pg_namespace  pgn on pgn.oid = pgc.relnamespace and pgn.nspname = c.table_schema
left join pg_description pgd
  on pgd.objoid = pgc.oid and pgd.objsubid = c.ordinal_position
where c.table_schema = 'api_v1'
  and pgd.description is null
