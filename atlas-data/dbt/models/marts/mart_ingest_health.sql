{{
  config(
    materialized='view',
    schema='marts',
  )
}}

-- mart_ingest_health — minimal per-source ingest-run health (Q14 / §E.3).
--
-- One row per scraper or API-source, showing the most recent COMPLETED run
-- (rows with finished_at IS NULL are in-progress and excluded). The three
-- columns land by design — Q14 keeps v1 minimal. Additional columns (failure
-- counts, template-drift counters from §C.3.1, 30-day trend, warning totals)
-- get added on demand when a real operational consumer — dashboard, alert,
-- CI gate — asks for them.
--
-- NOTE: empty output is expected until the first scraper writes to
-- raw.ingest_runs. An empty `select *` is not a wiring bug — it's the correct
-- reflection of "no scrapers have run yet."

-- Raw tables use `source_slug` (matches ingest folder/npm conventions);
-- marts rename to `source_id` per naming-conventions.md "rename at the
-- dbt passthrough" rule.
select distinct on (source_slug)
  source_slug                                        as source_id,
  finished_at                                        as last_run_at,
  case when exit_code = 0 then 'ok' else 'fail' end  as last_status
from {{ source('raw', 'ingest_runs') }}
where finished_at is not null
order by source_slug, finished_at desc
