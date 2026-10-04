-- raw.ssb_10501 — SSB table 10501, persons by first name ("Personer, etter
-- jente- eller guttenavn"), per year. Populated by
-- atlas-data/ingest/src/sources/ssb-10501.
--
-- ⚠️ COVERAGE CAVEAT, CARRIED HERE AS A COLUMN COMMENT (see `value` below) so
-- it travels with the data rather than living only in a README: SSB's own
-- table note says this covers first names used by 200 PERSONS OR MORE at
-- year-end. A name with fewer than 200 bearers in Norway in a given year does
-- not appear as a row at all — this is NOT an exhaustive list of Norwegian
-- first names, and must not be used as if it were one.
--
-- `name_code` carries SSB's own composite code verbatim: a leading digit (1 =
-- girl name, 2 = boy name) followed by the uppercased name, e.g. "1ABIGAIL".
-- `name_label` is SSB's own properly-cased label for the same code, e.g.
-- "Abigail" — kept as a separate column (not reconstructed by stripping the
-- prefix from name_code) because casing and diacritics in the label are not
-- always a mechanical transform of the all-caps code. `contents_code` is
-- degenerate here — SSB's table exposes exactly one statistic ("Personer"),
-- kept for shape-consistency with every other SSB PxWebAPI source rather than
-- special-cased away.
create table if not exists raw.ssb_10501 (
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

comment on table raw.ssb_10501 is 'SSB 10501: persons by first name and year. Only names used by 200+ persons appear at all — see column comments.';
comment on column raw.ssb_10501.name_code is 'SSB''s composite code: leading digit 1=girl name, 2=boy name, then the uppercased name, e.g. 1ABIGAIL.';
comment on column raw.ssb_10501.name_label is 'SSB''s own properly-cased label for name_code, e.g. Abigail. Not derived from name_code — kept verbatim.';
comment on column raw.ssb_10501.contents_code is 'Degenerate dimension: SSB exposes exactly one statistic ("Personer") for this table.';
comment on column raw.ssb_10501.value is 'Count of persons with this name at year-end. NULL (with status=''.'') when the name had 200 or fewer bearers that year, or data is otherwise unavailable — this table covers names used by 200+ persons only and is not an exhaustive name list.';
comment on column raw.ssb_10501.status is 'SSB suppression/availability marker (e.g. "." = 200 or fewer, or data missing). NULL when value is present.';
