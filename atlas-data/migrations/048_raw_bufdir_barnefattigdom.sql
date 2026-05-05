-- raw.bufdir_barnefattigdom — landing table for Bufdir Barnefattigdom kommunemonitor
-- (Barne-, ungdoms- og familiedirektoratet). Populated by
-- atlas-data/ingest/src/sources/bufdir-barnefattigdom. One row per indicator × region ×
-- category pair × year (time series from the monitor API's details endpoint).

create table if not exists raw.bufdir_barnefattigdom (
  indicator_api_id   text        not null,
  indicator_slug     text        not null,
  indicator_group_slug text      not null,
  indicator_name     text        not null,
  indicator_title    text        not null,
  link_text            text,
  region_code          text        not null,
  category_unit        text        not null,
  category_format      text        not null,
  year                 integer     not null,
  value                numeric,
  values_json          jsonb       not null,
  loaded_at            timestamptz not null default now(),
  primary key (indicator_api_id, region_code, category_unit, category_format, year)
);

comment on table raw.bufdir_barnefattigdom is
  'Bufdir Barnefattigdom kommunemonitor — kommune- and sub-kommune-level child-poverty indicators (annual time series). Loaded by atlas-data/ingest/src/sources/bufdir-barnefattigdom.';

comment on column raw.bufdir_barnefattigdom.indicator_api_id is
  'Bufdir monitor API indicator identifier (Mongo-style hex string from Strapi).';

comment on column raw.bufdir_barnefattigdom.region_code is
  'Geographic code from the monitor API (4-digit kommune, 2-digit fylke, "0" for land, or longer codes for bydel / delbydel rows).';

comment on column raw.bufdir_barnefattigdom.category_unit is
  'First category axis from the API (Norwegian), e.g. "barn" or "husholdning".';

comment on column raw.bufdir_barnefattigdom.category_format is
  'Second category axis from the API (Norwegian), e.g. "prosent" or "antall".';

comment on column raw.bufdir_barnefattigdom.values_json is
  'Full year-to-value map from the upstream details response for this indicator, region, and category slice (verbatim JSON object).';
