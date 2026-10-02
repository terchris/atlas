-- raw.nav_helt_ledige — landing table for NAV HL060 ("Helt ledige. Fylke og
-- kommune. Tidsserie måned") — count and share of the labour force
-- registered as fully unemployed, per kommune, monthly. Populated by
-- atlas-data/ingest/src/sources/nav-helt-ledige. One row per region x
-- category_format (antall/prosent, derived from which sheet the row came
-- from) x year x month.
--
-- Atlas's fourth NAV-adjacent source, third source on the existing
-- monthly_sources_refresh job. Same shape as raw.nav_aap: no category_unit
-- column, no dim_period reference (month is a plain integer).
--
-- region_code is NOT always a 4-digit kommune: this table also publishes
-- the Svalbard pseudo-kommune (2100) and a literal "Ukjent" (unknown-region)
-- row with no numeric code at all — confirmed live 2026-10-02, a real,
-- substantial count, not suppressed or dropped. classify_region_code
-- resolves 2100 via its existing svalbard branch and falls through to its
-- existing 'unknown' branch for "Ukjent".

create table if not exists raw.nav_helt_ledige (
  region_code     text        not null,
  category_format text        not null,
  year            integer     not null,
  month           integer     not null,
  value           numeric,
  values_json     jsonb       not null,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, category_format, year, month)
);

comment on table raw.nav_helt_ledige is
  'NAV HL060 — Helt ledige. Fylke og kommune. Tidsserie måned. Count and share of the labour force registered as fully unemployed, per kommune, monthly. Loaded by atlas-data/ingest/src/sources/nav-helt-ledige.';

comment on column raw.nav_helt_ledige.region_code is
  'NAV''s own region code from the workbook row label — a 4-digit kommune code (including the Svalbard pseudo-kommune 2100), or the literal string "Ukjent" (NAV''s own unknown-region bucket, no numeric code). region_kind is derived downstream via classify_region_code, not stored here.';

comment on column raw.nav_helt_ledige.category_format is
  'Which sheet the row came from — antall (count) or prosent (share of the labour force) — not a column within a sheet. There is no category_unit column for this source.';

comment on column raw.nav_helt_ledige.month is
  'Calendar month (1-12), from the workbook''s own Norwegian month-name header row. A plain integer, not a dim_period reference — none exists in the codebase.';

comment on column raw.nav_helt_ledige.values_json is
  'Full month-to-value map reconstructed from the sheet for this region and category_format slice, for the sheet''s one covered year (NAV''s own suppression marker, *, and blank cells -> null).';
