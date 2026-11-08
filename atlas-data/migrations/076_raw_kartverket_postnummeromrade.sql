-- raw.kartverket_postnummeromrade — Kartverket's Postnummerområder, verbatim,
-- one row per upstream GeoJSON feature. urb-agents #2098/#2099 (R3).
--
-- Idempotent on purpose: production already has PostGIS 3.6.2 installed
-- manually (see migration 069's own header for why that happened outside
-- this repo's pipeline), so this is a no-op there. A fresh install gets the
-- extension created by the `atlas` role directly, which sidesteps 069's own
-- cross-role REVOKE trap entirely — the object is then owned by the role
-- that needs to manage it.
create extension if not exists postgis;

-- ⚠️ NOT ONE ROW PER postnummer. The upstream file can carry more than one
-- Feature for the same postnummer (measured 2026-11-08: 3,450 features for
-- 3,382 distinct postnummer, 57 of them split across 2-3 disjoint polygon
-- pieces — a postnummer whose service area is not one contiguous shape).
-- This table stores every upstream feature verbatim; the per-postnummer
-- union (ST_Union across those pieces) is a dbt derivation, not something
-- decided here — raw never aggregates.
--
-- ⚠️ "kommunenummer (every municipality the area touches)" from the
-- request's own field list did not happen in the 2026-11-08 pull: every one
-- of the 57 split postnummer stays within a SINGLE kommune across all its
-- pieces (checked directly, not assumed). The dbt layer still models
-- kommune_nr as an array, because the request names a real possibility this
-- snapshot happens not to exercise, and the data shape should not quietly
-- assume it never will.
create table if not exists raw.kartverket_postnummeromrade (
  lokalid            text        not null,   -- Kartverket's own stable feature id (a GUID)
  postnummer         text        not null,
  poststed           text        not null,
  kommune_nr         text        not null,   -- single kommune for THIS feature; see header
  oppdateringsdato   date,                   -- null on most rows — see column comment
  versjonid          text,
  geometry           geometry(Polygon, 4258) not null,
  loaded_at          timestamptz not null default now(),
  primary key (lokalid)
);

comment on table raw.kartverket_postnummeromrade is
  'Kartverket Postnummerområder (Geonorge dataset 462a5297-33ef-438a-82a5-07fff5799be3), verbatim, one row per upstream GeoJSON feature. Loaded by atlas-data/ingest/src/sources/kartverket-postnummeromrade. The per-postnummer union lives in dbt (dim_kartverket_postnummeromrade), not here — see this migration''s header for why a postnummer can be more than one row.';

comment on column raw.kartverket_postnummeromrade.lokalid is
  'Kartverket''s own feature-local GUID. Primary key — stable across releases for the same polygon piece, per Kartverket''s own SOSI convention, though not independently re-verified across two releases here.';
comment on column raw.kartverket_postnummeromrade.oppdateringsdato is
  'The feature''s own last-update date, where Kartverket published one. NULL on 3,187 of 3,450 rows measured 2026-11-08 — most polygons carry no individual update date, only the whole-dataset "datauttaksdato" (extraction date), which is not stored here because it describes the download, not the feature, and Atlas already has loaded_at for that.';
comment on column raw.kartverket_postnummeromrade.geometry is
  'Verbatim from the upstream GeoJSON, in its native EUREF89/ETRS89 geographic CRS (EPSG:4258) — not reprojected, not simplified. dbt derives the published full and simplified geometries from this.';
