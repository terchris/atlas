-- raw.nav_uforetrygd — landing table for NAV PST302 (uføretrygd recipients, count
-- and share of population 18-67, per kommune, monthly). Populated by
-- atlas-data/ingest/src/sources/nav-uforetrygd. One row per region × category_format
-- (antall/andel, derived from which sheet the row came from) × year × month.
--
-- Atlas's first monthly-cadence source. No category_unit column — NAV has no
-- equivalent dimension; no dim_period reference — month is a plain integer,
-- same shape as every other source's year column (verified live 2026-10-01,
-- see PLAN-004-nav-uforetrygd.md: no dim_period infrastructure exists or is
-- needed as a prerequisite anywhere in the codebase).

create table if not exists raw.nav_uforetrygd (
  region_code     text        not null,
  category_format text        not null,
  year            integer     not null,
  month           integer     not null,
  value           numeric,
  values_json     jsonb       not null,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, category_format, year, month)
);

comment on table raw.nav_uforetrygd is
  'NAV PST302 — uføretrygd (disability benefit) recipients, count and share of population 18-67, per kommune (annual time series would be P1Y; this is Atlas''s first P1M source). Loaded by atlas-data/ingest/src/sources/nav-uforetrygd.';

comment on column raw.nav_uforetrygd.region_code is
  'NAV''s own region code from the workbook row label — 2-digit fylke, 4-digit kommune, or 6-digit bydel (Oslo, Bergen, Stavanger, Trondheim only). region_kind is derived downstream via classify_region_code, not stored here.';

comment on column raw.nav_uforetrygd.category_format is
  'Which sheet the row came from — antall (count) or andel (share of population 18-67) — not a column within a sheet. There is no category_unit column for this source.';

comment on column raw.nav_uforetrygd.month is
  'Calendar month (1-12), from the workbook''s own Norwegian month-name header row. A plain integer, not a dim_period reference — none exists in the codebase.';

comment on column raw.nav_uforetrygd.values_json is
  'Full month-to-value map reconstructed from the sheet for this region and category_format slice, for the sheet''s one covered year (NAV''s own suppression marker, *, and blank cells → null).';
