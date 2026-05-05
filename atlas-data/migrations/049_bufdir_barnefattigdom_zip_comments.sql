-- Align raw.bufdir_barnefattigdom column comments with ZIP + XLSX bulk ingest
-- (replacing Strapi / APIM narrative). No schema change.

comment on table raw.bufdir_barnefattigdom is
  'Bufdir Barnefattigdom kommunemonitor — kommune- and sub-kommune-level child-poverty indicators 
(annual time series from the bulk ZIP export on bufdir.no). Loaded by 
atlas-data/ingest/src/sources/bufdir-barnefattigdom.';

comment on column raw.bufdir_barnefattigdom.indicator_api_id is
  'Atlas surrogate identifier bf_zip_<24 hex> — SHA-256 over the source XLSX filename inside the 
Bufdir ZIP bundle (not Strapi''s legacy Mongo-style indicatorApiId).';

comment on column raw.bufdir_barnefattigdom.region_code is
  'Geographic code from workbook column Region (land, fylke, kommune, bydel, etc.; string as published).';

comment on column raw.bufdir_barnefattigdom.indicator_group_slug is
  'Thematic bucket label; fixed to barnefattigdom_zip for ZIP-backed workbook rows (Strapi groups are not in the export).';

comment on column raw.bufdir_barnefattigdom.category_unit is
  'First category axis from workbook column Enhet — barn or husholdning (lowercased for storage).';

comment on column raw.bufdir_barnefattigdom.category_format is
  'Second category axis from workbook column Tallformat — prosent or antall (lowercased for storage).';

comment on column raw.bufdir_barnefattigdom.values_json is
  'Full year-to-value map reconstructed from the Data sheet for this region and Enhet/Tallformat slice (.. and blank cells → null).';
