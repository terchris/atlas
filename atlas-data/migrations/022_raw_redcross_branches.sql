-- raw.redcross_branches + raw.redcross_branch_activities
-- First NGO-supply ingest — Red Cross Organizations API data.
-- Source for v1: static JSON dump at atlas-private-data-repo/redcross/organisations/api-getOrganizations-output-21apr26.json (gitignored)
-- Live-API polling deferred to a separate workstream (per INVESTIGATE-ngo-supply Q39).

create table if not exists raw.redcross_branches (
  branch_id              text        not null,
  branch_number          text,
  organization_number    text,
  branch_type            text        not null,
  branch_name            text        not null,
  is_active              boolean     not null,
  is_terminated          boolean     not null,
  creation_date          date,
  parent_branch_id       text,
  parent_branch_number   text,
  parent_branch_name     text,
  parent_branch_type     text,
  municipality           text,
  county                 text,
  region                 text,
  postal_address_line1   text,
  postal_code            text,
  post_office            text,
  street_address_line1   text,
  street_postal_code     text,
  street_post_office     text,
  phone                  text,
  email                  text,
  web                    text,
  loaded_at              timestamptz not null default now(),
  primary key (branch_id)
);

comment on table raw.redcross_branches is
  'Norges Røde Kors branches (Nasjonalkontoret + Distrikt + Lokalforening + Ukjent), from the Red Cross Organizations API. 392 rows in the 2026-04-21 dump. Loaded by atlas-data/ingest/src/sources/redcross-branches.';

create table if not exists raw.redcross_branch_activities (
  branch_id              text        not null,
  global_activity_name   text        not null,
  local_activity_name    text,
  loaded_at              timestamptz not null default now(),
  primary key (branch_id, global_activity_name)
);

comment on table raw.redcross_branch_activities is
  'Per-branch activities from the Red Cross API. global_activity_name is Red Cross''s own canonical term (50 distinct values); local_activity_name is the per-chapter display string (2 407 distinct values). ~2 400 rows in the 2026-04-21 dump.';
