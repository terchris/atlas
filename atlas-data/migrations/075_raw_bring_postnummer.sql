-- raw.bring_postnummer — Posten Bring's postcode register, verbatim,
-- including the kategori column the existing dim_postnummer seed drops.
--
-- urb-agents #2098/#2099 (R2). dim_postnummer (seeds/dim_postnummer.csv) is
-- the SAME upstream, fetched by the same URL, but is a periodically-run
-- seed-refresh script with no meta_sources row and no visible last-refresh
-- (check-kommune-marts-exclude-sentinels.sh's own EXEMPT comment says so).
-- This table is the properly-provenanced, scheduled sibling: same register,
-- served with the category Bring publishes and the date Atlas fetched it.
-- Kept SEPARATE from dim_postnummer rather than replacing it — two existing
-- models (mart_dim_postnummer, supply__redcross_branches) depend on that
-- seed's exact shape, and this table changes nothing about it.
--
-- ⚠️ A 2026-11-08 diff between the committed dim_postnummer.csv and a fresh
-- download of this same upstream found 13 postcodes only in the seed and 3
-- only in the live file — exactly the counts #2098 cited. Checked by name
-- (MESNALI, LALM, NYKIRKE, STORFOSNA and others): these are real, plausible
-- rural Norwegian postnummer, consistent with ordinary closures/additions
-- between the seed's last refresh and today. Not a data defect in either
-- source — it is what "periodically refreshed" means, and the reason this
-- table exists: it won't drift, because it is refreshed every run.

create table if not exists raw.bring_postnummer (
  postnummer    text        not null,
  poststed      text        not null,
  kommune_nr    text        not null,
  kommune_navn  text        not null,
  kategori      text        not null,   -- G gateadresse, P postboks, B both, S service, F flere
  loaded_at     timestamptz not null default now(),
  primary key (postnummer)
);

comment on table raw.bring_postnummer is
  'Posten Bring''s postcode register (postnummerregister-ansi.txt), verbatim, including kategori. Loaded by atlas-data/ingest/src/sources/bring-postnummer. Sibling to seeds/dim_postnummer.csv, which carries the same upstream without kategori or a visible refresh date — see this migration''s header for why both exist.';

comment on column raw.bring_postnummer.postnummer is
  'Four-digit postcode, leading zeros significant — always text. Primary key.';
comment on column raw.bring_postnummer.kategori is
  'Bring''s own category letter: G (gateadresse/street addresses), P (postboks/post boxes only), B (both), S (service address), F (flere/several uses). Verbatim, not decoded here.';
comment on column raw.bring_postnummer.loaded_at is
  'When Atlas fetched this row. Bring''s file carries no upstream Last-Modified header (checked 2026-11-08 — the HTTP response has no Last-Modified, only its own Date), so this is the only date available: the fetch date, not a publication date. Null would be no more honest than this.';
