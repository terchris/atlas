-- raw.imdi_bosetting — landing table for IMDi bosettingstall (kommune-level refugee
-- resettlement figures: requested, decided, settled, and settled-under-collective-
-- protection counts). Populated by atlas-data/ingest/src/sources/imdi-bosetting.
-- One row per kommune × metric × year.
--
-- kommune_name only, no code — IMDi publishes no region code; kommune_nr resolution
-- happens downstream via crosswalk_kommune_name on name text, not here. No fylke
-- column either — IMDi's own fylke groupings are not stable across years (verified
-- live 2026-10-01, see PLAN-009-imdi-bosetting.md Phase 1.5).

create table if not exists raw.imdi_bosetting (
  kommune_name text        not null,
  year         integer     not null,
  metric       text        not null,
  value        numeric,
  loaded_at    timestamptz not null default now(),
  primary key (kommune_name, year, metric)
);

comment on table raw.imdi_bosetting is
  'IMDi bosettingstall — kommune-level refugee resettlement figures (requested, decided, settled, settled under collective protection), one row per year. Loaded by atlas-data/ingest/src/sources/imdi-bosetting.';

comment on column raw.imdi_bosetting.kommune_name is
  'Kommune name verbatim from IMDi''s own table row label — IMDi publishes no kommune code. kommune_nr is resolved downstream via crosswalk_kommune_name on this text, not stored here.';

comment on column raw.imdi_bosetting.metric is
  'Which stage of the resettlement pipeline this row''s value is: anmodet (requested), vedtatt (decided), bosatte (settled), or bosatte_kollektiv_beskyttelse (settled under collective protection) — four distinct quantities, not a count/share pair.';

comment on column raw.imdi_bosetting.value is
  'The metric''s value for this kommune and year. Null when IMDi itself suppressed the cell (its own marker, the literal character '':'', for privacy — usually fewer than 5 people).';
