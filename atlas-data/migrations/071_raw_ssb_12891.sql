-- raw.ssb_12891 — SSB table 12891, surnames used by 200+ persons ("Etternavn
-- brukt av 200 personer eller flere"), per year. Populated by
-- atlas-data/ingest/src/sources/ssb-12891.
--
-- ⚠️ Same coverage caveat as raw.ssb_10501 (SSB 10501, first names): this is
-- NOT an exhaustive list of Norwegian surnames. Only surnames held by 200+
-- persons in Norway at year-end appear as a row at all.
--
-- `name_code` is SSB's own uppercased surname code (e.g. "ABBAS") — unlike
-- 10501's first-name code, surnames carry no gender prefix. `name_label` is
-- SSB's own properly-cased label for the same code (e.g. "Abbas"), kept
-- verbatim rather than reconstructed from the code. `contents_code` is
-- degenerate here for the same reason as 10501.
create table if not exists raw.ssb_12891 (
  name_code text not null,
  name_label text not null,
  year integer not null,
  contents_code text not null,
  contents_label text not null,
  value integer,
  status text,
  loaded_at timestamptz not null default now(),
  primary key (name_code, year, contents_code)
);

comment on table raw.ssb_12891 is 'SSB 12891: surnames used by 200+ persons, and the count per year. Only surnames meeting that threshold appear at all — see column comments.';
comment on column raw.ssb_12891.name_code is 'SSB''s uppercased surname code, e.g. ABBAS. No gender prefix (surnames are not gendered in this table, unlike raw.ssb_10501''s first-name codes).';
comment on column raw.ssb_12891.name_label is 'SSB''s own properly-cased label for name_code, e.g. Abbas. Not derived from name_code — kept verbatim.';
comment on column raw.ssb_12891.contents_code is 'Degenerate dimension: SSB exposes exactly one statistic ("Personer") for this table.';
comment on column raw.ssb_12891.value is 'Count of persons with this surname at year-end. NULL (with status=''.'') when the surname had 200 or fewer bearers that year, or data is otherwise unavailable — this table covers surnames used by 200+ persons only and is not an exhaustive name list.';
comment on column raw.ssb_12891.status is 'SSB suppression/availability marker (e.g. "." = 200 or fewer, or data missing). NULL when value is present.';
