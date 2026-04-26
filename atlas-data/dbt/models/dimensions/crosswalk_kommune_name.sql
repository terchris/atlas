{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['name']},
      {'columns': ['kommune_nr']},
    ]
  )
}}

-- crosswalk_kommune_name — name → kommune_nr lookup for resolving free-text
-- municipality strings from upstream sources (NGO branches, scrapes, etc.)
-- to a canonical kommune_nr.
--
-- Derived from dim_kommune; not a seed. dim_kommune already carries both the
-- canonical Norwegian name and the Sami alternative split, plus historical
-- (pre-merger) codes with is_active=false. This model unions three views:
--
--   canonical    — every active kommune's bokmål name
--   alternative  — Sami variants (kommune_name_alt) where present, also active
--   historical   — pre-2020-reform names from inactive kommune codes; the
--                  kommune_nr points to the OLD code, not the merged-into
--                  successor (consumers needing modern resolution must take
--                  a follow-up step). v1 limitation; upgradeable later.
--
-- Norwegian place names collide ("Os" was both Os/Innlandet and Os/Hordaland
-- pre-2020); the lookup is intrinsically not unique by name. Consumers must
-- handle ambiguous matches with additional context (postal code, fylke).

with canonical as (
  select
    kommune_name as name,
    'canonical'::text as name_kind,
    kommune_nr
  from {{ ref('dim_kommune') }}
  where is_active
    and kommune_name is not null
),

alternative as (
  select
    kommune_name_alt as name,
    'alternative'::text as name_kind,
    kommune_nr
  from {{ ref('dim_kommune') }}
  where is_active
    and kommune_name_alt is not null
),

historical as (
  select
    kommune_name as name,
    'historical'::text as name_kind,
    kommune_nr
  from {{ ref('dim_kommune') }}
  where not is_active
    and kommune_name is not null
)

select * from canonical
union all
select * from alternative
union all
select * from historical
