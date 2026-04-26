{{ config(materialized='view', schema='marts') }}

-- supply__redcross_branch_activities — staging passthrough for the per-chapter
-- activity rows from raw.redcross_branch_activities, with the 50→22 service
-- category mapping applied. See PLAN-002 Appendix A for the curation rationale
-- (especially the 6 ⚠ best-guess mappings: Møteplasser, Praktiske tjenester,
-- Våketjenesten, Turgruppe, Nattevandring, Habil).
--
-- is_service = false flags the 14 administrative / governance / recruitment
-- entries that aren't user-facing services. Those rows still exist for audit
-- but won't surface as dim_activity rows or fact_chapter_activities entries.

with src as (
  select * from {{ source('raw', 'redcross_branch_activities') }}
),

categorised as (
  select
    'redcross-' || src.branch_id  as chapter_id,
    '864139442'::text             as ngo_orgnr,
    src.global_activity_name      as canonical_name,
    src.local_activity_name,
    case src.global_activity_name
      -- Maps cleanly (30 activities)
      when 'Hjelpekorps'                                    then 'rescue_corps'
      when 'Besøkstjeneste'                                 then 'elderly_visiting'
      when 'Beredskap'                                      then 'first_aid_standby'
      when 'Besøksvenn med hund'                            then 'elderly_visiting'
      when 'Opplæring'                                      then 'first_aid_training'
      when 'Barnas Røde Kors'                               then 'youth_activity_groups'
      when 'Røde Kors Friluftsliv og Førstehjelp (RØFF)'    then 'youth_activity_groups'
      when 'Norsktrening'                                   then 'language_practice'
      when 'Flyktningguide'                                 then 'migrant_mentoring'
      when 'Øvrige aktiviteter -  Røde Kors Ungdom'         then 'youth_activity_groups'
      when 'Leksehjelp'                                     then 'homework_help'
      when 'Treffpunkt - Røde Kors Ungdom'                  then 'youth_drop_in'
      when 'Visitor'                                        then 'elderly_visiting'
      when 'Vitnestøtte'                                    then 'legal_witness_support'
      when 'Ferie for alle'                                 then 'holiday_camps_low_income'
      when 'Aktiviteter på asylmottak'                      then 'migrant_mentoring'
      when 'Bruktbutikk'                                    then 'thrift_shop'
      when 'Møteplass Fellesverkene'                        then 'youth_drop_in'
      when 'Gatemegling'                                    then 'street_mediation'
      when 'Språkgruppe'                                    then 'language_practice'
      when 'Familiesenter'                                  then 'family_support'
      when 'Vennefamilie'                                   then 'family_support'
      when 'Nettverk etter soning'                          then 'prison_reintegration'
      when 'Mentorfamilie'                                  then 'family_support'
      when 'Akuttovernatting for bostedsløse tilreisende'   then 'housing_outreach'
      when 'Kors på Halsen'                                 then 'crisis_helpline'
      when 'Aktiviteter på utlendingsinternat'              then 'migrant_mentoring'
      when 'Digital leksehjelp'                             then 'homework_help'
      when 'Internasjonal Humanitær Rett'                   then 'political_advocacy'
      -- ⚠ Best-guess mappings (6 activities); reasoning in PLAN-002 Appendix A
      when 'Møteplasser'                                    then 'family_support'
      when 'Praktiske tjenester'                            then 'family_support'
      when 'Våketjenesten'                                  then 'elderly_visiting'
      when 'Turgruppe'                                      then 'youth_activity_groups'
      when 'Nattevandring'                                  then 'street_mediation'
      when 'Habil'                                          then 'family_support'
      else null
    end                                                     as service_category_code,
    case src.global_activity_name
      -- 14 non-service activities (administrative, governance, recruitment)
      when 'Administrative oppgaver'                       then false
      when 'Sporadisk frivillige'                          then false
      when 'Lokalstyre'                                    then false
      when 'BUA'                                           then false
      when 'Distriktsstyre'                                then false
      when 'Kompetansesenter'                              then false
      when 'Mottak av frivillige i lokalforening'          then false
      when 'Lokalråd Hjelpekorps'                          then false
      when 'Lokalråd Omsorg'                               then false
      when 'Distriktsråd Hjelpekorps'                      then false
      when 'Distriktsråd Ungdom'                           then false
      when 'Døråpner'                                      then false
      when 'EVA'                                           then false
      when 'Blodgiververving'                              then false
      when 'Arrangement og reise'                          then false
      when 'Internasjonalt distriktsamarbeid'              then false
      else true
    end                                                     as is_service,
    src.loaded_at                                           as updated_at
  from src
)

select * from categorised
