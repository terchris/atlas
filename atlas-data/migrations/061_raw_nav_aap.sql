-- raw.nav_aap — landing table for NAV AAP155 (arbeidsavklaringspenger —
-- work-assessment allowance — recipients: count and share of the
-- population, per kommune, monthly). Populated by
-- atlas-data/ingest/src/sources/nav-aap. One row per region x category_format
-- (antall/andel, derived from which sheet the row came from) x year x month.
--
-- Atlas's second NAV source and second monthly-cadence source. Same shape
-- as raw.nav_uforetrygd: no category_unit column, no dim_period reference
-- (month is a plain integer).
--
-- region_code is NOT always a 4-digit kommune: this table also publishes a
-- literal "Ukjent" (unknown-region) row with no numeric code at all —
-- confirmed live 2026-10-02, a real, substantial count, not suppressed or
-- dropped. classify_region_code's digit-based branches correctly fall
-- through to its existing 'unknown' kind for it.

create table if not exists raw.nav_aap (
  region_code     text        not null,
  category_format text        not null,
  year            integer     not null,
  month           integer     not null,
  value           numeric,
  values_json     jsonb       not null,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, category_format, year, month)
);

comment on table raw.nav_aap is
  'NAV AAP155 — arbeidsavklaringspenger (work-assessment allowance) recipients, count and share of the population, per kommune, monthly. Loaded by atlas-data/ingest/src/sources/nav-aap.';

comment on column raw.nav_aap.region_code is
  'NAV''s own region code from the workbook row label — a 4-digit kommune code, or the literal string "Ukjent" (NAV''s own unknown-region bucket, no numeric code). region_kind is derived downstream via classify_region_code, not stored here.';

comment on column raw.nav_aap.category_format is
  'Which sheet the row came from — antall (count) or andel (share of population) — not a column within a sheet. There is no category_unit column for this source.';

comment on column raw.nav_aap.month is
  'Calendar month (1-12), from the workbook''s own Norwegian month-name header row. A plain integer, not a dim_period reference — none exists in the codebase.';

comment on column raw.nav_aap.values_json is
  'Full month-to-value map reconstructed from the sheet for this region and category_format slice, for the sheet''s one covered year (NAV''s own suppression marker, *, and blank cells -> null).';
