-- raw.bufdir_barnevern — landing table for Bufdir Barnevern kommunemonitor
-- (Barne-, ungdoms- og familiedirektoratet). Populated by
-- atlas-data/ingest/src/sources/bufdir-barnevern. One row per indicator × region ×
-- category_format × year, from the monitor's bulk ZIP export.
--
-- Sibling of raw.bufdir_barnefattigdom (migration 048) — same shape, minus
-- category_unit: Barnevern's workbooks carry no Enhet column at all (verified
-- live 2026-10-01, see PLAN-003-bufdir-barnevern.md Phase 1). This is not a
-- nullable column that happens to always be null; the dimension doesn't exist
-- upstream for this monitor.

create table if not exists raw.bufdir_barnevern (
  indicator_api_id     text        not null,
  indicator_slug       text        not null,
  indicator_group_slug text        not null,
  indicator_name       text        not null,
  indicator_title      text        not null,
  link_text            text,
  region_code          text        not null,
  category_format      text        not null,
  year                  integer     not null,
  value                 numeric,
  values_json           jsonb       not null,
  loaded_at             timestamptz not null default now(),
  primary key (indicator_api_id, region_code, category_format, year)
);

comment on table raw.bufdir_barnevern is
  'Bufdir Barnevern kommunemonitor — kommune- and sub-kommune-level child-welfare indicators (annual time series from the bulk ZIP export on bufdir.no). Loaded by atlas-data/ingest/src/sources/bufdir-barnevern.';

comment on column raw.bufdir_barnevern.indicator_api_id is
  'Atlas surrogate identifier: bv_zip_ind_<code> derived from the workbook filename''s leading alphanumeric indicator code (e.g. 1a, 3m), or bv_zip_<24 hex SHA-256> fallback for a non-conforming filename.';

comment on column raw.bufdir_barnevern.region_code is
  'Geographic code from workbook column Region (land, fylke, kommune, bydel, etc.; string as published).';

comment on column raw.bufdir_barnevern.indicator_group_slug is
  'Thematic bucket label; fixed to barnevern_zip for ZIP-backed workbook rows.';

comment on column raw.bufdir_barnevern.category_format is
  'Category axis from workbook column Tallformat — andel or antall (lowercased for storage). "andel" is Barnevern''s own vocabulary (not the sibling bufdir_barnefattigdom source''s "prosent") and is not limited to 0-100 percentages — some andel-formatted indicators are kroner-per-child figures. There is no category_unit column for this source — Barnevern''s workbooks carry no Enhet column.';

comment on column raw.bufdir_barnevern.values_json is
  'Full year-to-value map reconstructed from the Sheet1 sheet for this region and category_format slice (.. and blank cells → null).';
