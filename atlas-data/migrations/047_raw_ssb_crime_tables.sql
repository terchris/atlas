-- SSB crime / registered-offence statbank tables (PxWebAPI bundle).
-- Populated by atlas-data/ingest/src/sources/ssb-crime-tables (one run writes
-- all four landing tables).

-- 08484 — National anmeldte lovbrudd by detailed offence type × stat var × year.
create table if not exists raw.ssb_08484 (
  lovbrudd_krim_code      text        not null,
  lovbrudd_krim_label    text        not null,
  contents_code          text        not null,
  contents_label         text        not null,
  year                   integer     not null,
  value                  numeric,
  status                 text,
  loaded_at              timestamptz not null default now(),
  primary key (lovbrudd_krim_code, contents_code, year)
);

comment on table raw.ssb_08484 is
  'SSB 08484 — reported offences (anmeldte lovbrudd) by offence type for Norway; counts and per 1 000 inhabitants. No regional dimension.';

comment on column raw.ssb_08484.lovbrudd_krim_code is
  'Upstream LovbruddKrim dimension code (hierarchical offence classification).';
comment on column raw.ssb_08484.status is
  'PxWebAPI cell status (e.g. small-cell suppression "..").';

-- 08487 — Kommune of offence (gjerningssted) × coarse offence group; two-year averages.
create table if not exists raw.ssb_08487 (
  region_code            text        not null,
  region_label           text        not null,
  lovbrudd_krim_code     text        not null,
  lovbrudd_krim_label    text        not null,
  contents_code          text        not null,
  contents_label         text        not null,
  period_interval_code   text        not null,
  period_interval_label text        not null,
  value                  numeric,
  status                 text,
  loaded_at              timestamptz not null default now(),
  primary key (region_code, lovbrudd_krim_code, contents_code, period_interval_code)
);

comment on table raw.ssb_08487 is
  'SSB 08487 — reported offences by police-registered place of offence (kommune aggregate or higher); two-year rolling averages. Small cells may be suppressed.';
comment on column raw.ssb_08487.region_code is
  'SSB Gjerningssted code (kommune, fylke, country total, or historical regional code).';

-- 09405 — Investigated offences by police decision × offence type (absolute counts).
create table if not exists raw.ssb_09405 (
  lovbrudd_krim_code       text        not null,
  lovbrudd_krim_label      text        not null,
  politi_avgjorelse_code   text        not null,
  politi_avgjorelse_label text        not null,
  contents_code            text        not null,
  contents_label           text        not null,
  year                     integer     not null,
  value                    numeric,
  status                   text,
  loaded_at                timestamptz not null default now(),
  primary key (lovbrudd_krim_code, politi_avgjorelse_code, contents_code, year)
);

comment on table raw.ssb_09405 is
  'SSB 09405 — offences fully investigated by police disposition (national).';

-- 09406 — Investigated offences: counts + clearance percentage.
create table if not exists raw.ssb_09406 (
  lovbrudd_krim_code   text        not null,
  lovbrudd_krim_label  text        not null,
  contents_code       text        not null,
  contents_label       text        not null,
  year                 integer     not null,
  value                numeric,
  status               text,
  loaded_at            timestamptz not null default now(),
  primary key (lovbrudd_krim_code, contents_code, year)
);

comment on table raw.ssb_09406 is
  'SSB 09406 — investigated offences and clearance rate (national).';
