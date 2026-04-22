-- Atlas schema layout.
--
-- raw.*    — ingested landing tables; written by atlas-data/ingest/*, read by dbt.
-- marts.*  — dbt outputs; read-only contract with the Next.js frontend.
--
-- Both schemas are idempotent to create. Running this migration more than once
-- is safe.

create schema if not exists raw;
create schema if not exists marts;

comment on schema raw   is 'Atlas landing layer. Populated by the atlas-data ingest modules. Source of truth for upstream data as fetched.';
comment on schema marts is 'Atlas serving layer. Populated by dbt. Read-only contract with downstream consumers (frontend, dashboards).';
