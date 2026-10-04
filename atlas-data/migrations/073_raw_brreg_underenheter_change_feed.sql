-- raw.brreg_underenheter_feed_watermark, raw.brreg_underenheter_oppdateringer and
-- raw.brreg_underenheter_versions — the underenheter change feed. Populated by
-- atlas-data/ingest/src/sources/brreg-underenheter-oppdateringer.
--
-- Mirrors 053_raw_brreg_change_feed.sql field for field, for the enheter feed's
-- own sibling register. Read that migration's header for the full reasoning
-- (durable watermark vs. a Dagster cursor; append-only; the HTTP-200 deletion
-- stub) — it applies here unchanged, verified against the live underenheter
-- feed 2026-10-04: same HAL shape, same `page` cap, same absent-`_embedded`
-- caught-up response, same five endringstype values (Ny/Endring/Sletting/
-- Fjernet/Ukjent, Ny/Endring/Sletting all observed in a 100-row live sample),
-- same HTTP 200 deletion stub with `slettedato` (confirmed live on
-- organisasjonsnummer 920045154). The one structural difference: the feed's own
-- `_embedded` key is `oppdaterteUnderenheter`, not `oppdaterteEnheter`, and its
-- link to the entity is `_links.underenhet`, not `_links.enhet` — both are
-- upstream naming, not a design choice, and both are asserted in this source's
-- own tests so a future refactor cannot silently merge the two shapes.

create table if not exists raw.brreg_underenheter_feed_watermark (
  id                   integer     not null primary key default 1,
  last_oppdateringsid  bigint      not null,
  last_dato            timestamptz,
  updated_at           timestamptz not null default now(),
  constraint brreg_underenheter_feed_watermark_single_row check (id = 1)
);

comment on table raw.brreg_underenheter_feed_watermark is
  'How far Atlas has consumed Brreg''s underenheter oppdateringer feed. Exactly one row (id = 1, enforced by a check constraint). A separate table from raw.brreg_feed_watermark (the enheter feed''s) because the two registers have independent oppdateringsid sequences — see 072''s migration header. Deliberately NOT a Dagster cursor, for the same reason as the enheter watermark: a cursor lives in the Dagster instance database, a different lifecycle, and a rebuilt one restarts the feed from nowhere without reporting a gap.';

comment on column raw.brreg_underenheter_feed_watermark.last_oppdateringsid is
  'The highest oppdateringsid successfully processed and committed, in the underenheter feed''s own id space — an entirely separate counter from raw.brreg_feed_watermark''s (the real bootstrap run against live data on 2026-10-04 seeded this one at 21,390,729; not comparable to the enheter feed''s own value). The next poll asks for last_oppdateringsid + 1.';

comment on column raw.brreg_underenheter_feed_watermark.last_dato is
  'The dato of that change, carried for human legibility only. Never use it to resume — ids are sparse and several changes share a millisecond.';

create table if not exists raw.brreg_underenheter_oppdateringer (
  oppdateringsid      bigint      not null primary key,
  dato                timestamptz,
  organisasjonsnummer text        not null,
  endringstype        text        not null,
  processed_at        timestamptz not null default now(),
  process_status      text
);

comment on table raw.brreg_underenheter_oppdateringer is
  'Append-only log of every change Brreg reported to the underenheter register, one row per oppdateringsid. Never updated and never deleted from. Loaded by atlas-data/ingest/src/sources/brreg-underenheter-oppdateringer. Sibling to raw.brreg_oppdateringer, kept separate because the two feeds'' oppdateringsid values are not comparable.';

comment on column raw.brreg_underenheter_oppdateringer.oppdateringsid is
  'Brreg''s monotonic change id for the underenheter feed specifically, and the primary key. Sparse, like the enheter feed''s — never compute a backlog by subtracting ids; read page.totalElements at the cursor instead.';

comment on column raw.brreg_underenheter_oppdateringer.endringstype is
  'Brreg''s change type, stored verbatim. Same five values as the enheter feed (Ny, Endring, Sletting, Fjernet, Ukjent) — confirmed live 2026-10-04 (Ny/Endring/Sletting all present in a 100-row sample at the current cursor). Not constrained to an enum on purpose.';

comment on column raw.brreg_underenheter_oppdateringer.process_status is
  'Outcome of applying this change to raw.brreg_underenheter_snapshot: applied, tombstoned, or skipped_unknown. Null means the row was recorded but not yet applied.';

create table if not exists raw.brreg_underenheter_versions (
  oppdateringsid      bigint      not null primary key
    references raw.brreg_underenheter_oppdateringer (oppdateringsid),
  organisasjonsnummer text        not null,
  endringstype        text        not null,
  doc                 jsonb,
  fetched_at          timestamptz not null default now()
);

create index if not exists brreg_underenheter_versions_orgnr_idx
  on raw.brreg_underenheter_versions (organisasjonsnummer, oppdateringsid desc);

comment on table raw.brreg_underenheter_versions is
  'Append-only version history: the sub-unit''s document as it stood at each change. One row per oppdateringsid. Never updated in place. Reconciled with raw.brreg_underenheter_snapshot by dbt, which is why the feed never writes to the snapshot table itself — same separation as the enheter feed, so a bug here cannot damage the bootstrap-loaded table.';

comment on column raw.brreg_underenheter_versions.doc is
  'The sub-unit''s document at the time of the change, verbatim, or null when the entity fetch failed. ⚠️ For a Sletting/Fjernet this is NOT a full record: confirmed live 2026-10-04, a Sletting (organisasjonsnummer 920045154) answers HTTP 200 with a 6-key stub (respons_klasse "SlettetUnderEnhet", slettedato set), while a Fjernet (organisasjonsnummer 934464524) answers HTTP 410 with an even more minimal 3-key body and is stored here as doc = null. Consumers must branch on endringstype, never assume doc is complete or non-null.';

comment on index raw.brreg_underenheter_versions_orgnr_idx is
  'Supports "the latest version of this sub-unit" — the access pattern a later reconciliation model uses, mirroring brreg_enheter_versions_orgnr_idx.';
