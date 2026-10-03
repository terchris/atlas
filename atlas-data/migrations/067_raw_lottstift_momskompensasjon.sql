-- raw.lottstift_momskompensasjon — landing table for Lottstift's annual
-- VAT-compensation allocations to voluntary organisations
-- (momskompensasjon). Populated by
-- atlas-data/ingest/src/sources/lottstift-momskompensasjon. One row per
-- organisasjonsnummer x year (amounts summed across duplicate-recipient
-- rows within a year — see this source's README).
--
-- Atlas's first Lottstift source. Not the tilskudd.lottstift.no GraphQL
-- app an earlier investigation pointed at (no public API found there) —
-- the real mechanism is direct static XLSX downloads from
-- lottstift.no/nb/om-oss/apne-data/.
--
-- Six years (2019-2024) have a usable recipient organisasjonsnummer;
-- 2016-2018 are deliberately excluded (recipient identified by name only
-- under an umbrella applicant, no orgnr to join against Brreg reliably).
--
-- Geography and ICNPO category are NOT stored here — organisasjonsnummer
-- is joined against dim_brreg_enhet (populated via the separate,
-- already-shipped brreg-frivillige source) downstream in
-- indicators__lottstift_momskompensasjon.sql.

create table if not exists raw.lottstift_momskompensasjon (
  organisasjonsnummer text        not null,
  year                integer     not null,
  amount_nok          numeric     not null,
  amount_label        text        not null,
  loaded_at           timestamptz not null default now(),
  primary key (organisasjonsnummer, year)
);

comment on table raw.lottstift_momskompensasjon is
  'Lottstift momskompensasjon — annual VAT-compensation allocations to voluntary organisations. One row per organisasjonsnummer x year. Loaded by atlas-data/ingest/src/sources/lottstift-momskompensasjon.';

comment on column raw.lottstift_momskompensasjon.organisasjonsnummer is
  'The recipient organisation''s 9-digit Norwegian organisasjonsnummer. Joined against dim_brreg_enhet downstream for kommune_nr/region_kind/icnpo_kategori — not stored here.';

comment on column raw.lottstift_momskompensasjon.year is
  'The grant year. Six years shipped (2019-2024) — the only ones whose published file carries a usable recipient organisasjonsnummer.';

comment on column raw.lottstift_momskompensasjon.amount_nok is
  'The final awarded/paid amount for this organisation/year, summed across every case in that year (a small number of organisations receive more than one case per year).';

comment on column raw.lottstift_momskompensasjon.amount_label is
  'Which of that year''s own column headers amount_nok was read from — the real meaning (requested/approved/awarded/paid) differs by year, kept visible rather than normalised away.';
