"""
file: taxonomy/build_crosswalk.py
description: R1 - the crosswalk from every NGO activity to a taxonomy v2 category.

Writes taxonomy/crosswalk_activity_service_category.csv: one row per (activity, category),
the primary first. Every activity is either mapped or marked not-a-service with a reason.

Inputs: data/*/activities.json (200 definitions) and Atlas's Røde Kors CASE
(atlas-data/dbt/models/supply/supply__redcross_branch_activities.sql @ 0ffeb79), copied
below as ATLAS_REDCROSS so the comparison is reproducible without the Atlas checkout.

Each decision states its basis:
  name         - the activity's own name says it ("Leksehjelp", "Matutdeling")
  description  - the NGO's own description says it
  source_group - only the NGO's own grouping supports it (no description, or a vague one)
  programme    - the NGO's programme family says it ("... med oss" = Nasjonalforeningen's dementia activities)
  atlas_case   - Atlas's existing mapping, kept
  none         - nothing on disk supports it; a placeholder until R10 fetches the page
Confidence: HIGH = name or description states it; MEDIUM = strongly implied; LOW = best guess,
review first. `reviewed_by` stays empty until a person signs off (task O2).

Usage: python3 taxonomy/build_crosswalk.py   (from ngo/)
"""
import csv
import re
import json
import glob
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NGO = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'crosswalk_activity_service_category.csv')

# id -> (primary, [secondary], confidence, basis, note). primary None = not a service; note = reason.
M = {
  # --- Frelsesarmeen (36) ---
  'frelsesarmeen:arendal-hornmusikk': ('music_choir', [], 'HIGH', 'name', ''),
  'frelsesarmeen:hornorkester-bergen-sentrum': ('music_choir', [], 'HIGH', 'name', ''),
  'frelsesarmeen:bibeltime-samtalemote-sandefjord': ('worship_open_church', [], 'HIGH', 'name', ''),
  'frelsesarmeen:bostedsattest': (None, [], 'HIGH', 'description', 'an information page about the residence certificate the unit asks for, not an activity'),
  'frelsesarmeen:bonn-og-samtale-bergen': ('worship_open_church', [], 'HIGH', 'name', ''),
  'frelsesarmeen:fa-kor-sandefjord': ('music_choir', [], 'HIGH', 'name', ''),
  'frelsesarmeen:samling-for-store-og-sma-harstad': ('family_support', ['meeting_place'], 'MEDIUM', 'description', 'shared dinner, activities and devotion for adults and children'),
  'frelsesarmeen:festkveld-levanger': ('worship_open_church', ['meeting_place'], 'MEDIUM', 'description', 'evening gathering with coffee, Bible and songbook'),
  'frelsesarmeen:formiddagstreff-i-egersund': ('meeting_place', [], 'HIGH', 'description', ''),
  'frelsesarmeen:sammen': ('meeting_place', [], 'HIGH', 'description', ''),
  'frelsesarmeen:frelsesarmeens-brukbutikk': ('thrift_shop', [], 'HIGH', 'name', ''),
  'frelsesarmeen:gudstjeneste-asker': ('worship_open_church', [], 'HIGH', 'name', ''),
  'frelsesarmeen:gudstjeneste-2': ('worship_open_church', [], 'HIGH', 'name', ''),
  'frelsesarmeen:gudstjeneste-sandnes': ('worship_open_church', [], 'HIGH', 'name', ''),
  'frelsesarmeen:gudstjenester-oslo': ('worship_open_church', [], 'HIGH', 'name', ''),
  'frelsesarmeen:gudstjenester-sandefjord': ('worship_open_church', [], 'HIGH', 'name', ''),
  'frelsesarmeen:gudstjenester-1': ('worship_open_church', [], 'HIGH', 'name', ''),
  'frelsesarmeen:hornmusikk-brassband-kristiansand': ('music_choir', [], 'HIGH', 'name', ''),
  'frelsesarmeen:kom-som-du-er-trimmen-asker': ('physical_activity', [], 'HIGH', 'name', ''),
  'frelsesarmeen:kreativt-fellesskap-arendal': ('creative_crafts', [], 'HIGH', 'description', ''),
  'frelsesarmeen:kveldsapent-harstad': ('meeting_place', [], 'HIGH', 'description', ''),
  'frelsesarmeen:kvinneforum': ('meeting_place', [], 'MEDIUM', 'name', 'a women\'s forum; description says only "care for each other"'),
  'frelsesarmeen:kvinnekafe-oslo': ('meeting_place', [], 'HIGH', 'name', ''),
  'frelsesarmeen:mat-stotte-og-veiledning-nedre-eiker': ('food_distribution', [], 'MEDIUM', 'name', '"Mat, støtte og veiledning" at a care centre'),
  'frelsesarmeen:diakonalt-arbeid-matutdeling': ('food_distribution', [], 'HIGH', 'name', ''),
  'frelsesarmeen:matutdeling-harstad': ('food_distribution', [], 'HIGH', 'name', ''),
  'frelsesarmeen:matutdeling-sandefjord': ('food_distribution', [], 'HIGH', 'name', ''),
  'frelsesarmeen:moter-fester': ('meeting_place', ['worship_open_church'], 'MEDIUM', 'description', 'weekly evening with song, music, coffee and food; free and open to all'),
  'frelsesarmeen:sanggruppa-arendal': ('music_choir', [], 'HIGH', 'name', ''),
  'frelsesarmeen:mat-stotte-og-veiledning-molde': ('food_distribution', [], 'MEDIUM', 'source_group', 'page id says "mat-stotte"; the name drops "mat"'),
  'frelsesarmeen:supermandag-asker': ('family_support', ['meeting_place'], 'MEDIUM', 'description', 'dinner and activities for children and parents'),
  'frelsesarmeen:tro-hornmusikk-sandvika': ('music_choir', [], 'HIGH', 'name', ''),
  'frelsesarmeen:utleie-av-selskapslokaler-egersund': (None, [], 'HIGH', 'name', 'venue rental'),
  'frelsesarmeen:rodelokka-matutdeling-oslo': ('food_distribution', ['meeting_place'], 'MEDIUM', 'description', 'meals, advice, crisis help and family/holiday activities at one station'),
  'frelsesarmeen:vennemusikken': ('music_choir', [], 'HIGH', 'description', ''),
  'frelsesarmeen:apenkafe': ('meeting_place', [], 'HIGH', 'name', ''),

  # --- Kirkens Bymisjon (144) ---
  'kirkens-bymisjon:a-senteret': ('addiction_support', ['health_services'], 'MEDIUM', 'description', 'residential treatment unit, 26 places'),
  'kirkens-bymisjon:aksept': ('health_services', ['peer_support'], 'MEDIUM', 'description', 'centre for everyone affected by HIV'),
  'kirkens-bymisjon:aktiv-framtid': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:aktiv-fritid': ('meeting_place', ['work_inclusion'], 'MEDIUM', 'description', 'activity and network offer'),
  'kirkens-bymisjon:aktivitetshuset-bjerke': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:bymisjonssenteret-haugesund': ('meeting_place', ['housing_outreach'], 'MEDIUM', 'description', 'centre for street-based work'),
  'kirkens-bymisjon:aktivitetshuset-prindsen': ('meeting_place', ['addiction_support'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:aktivitetskafe': ('meeting_place', ['work_inclusion'], 'MEDIUM', 'description', ''),
  'kirkens-bymisjon:aktivitetsplikten': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kafe-kirkenes': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:akuttovernatting': ('emergency_shelter', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:arbeid-ute': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:bamsehiet': ('family_support', [], 'HIGH', 'description', 'open place for families with children 0-12'),
  'kirkens-bymisjon:batteriet': ('political_advocacy', [], 'MEDIUM', 'description', 'helps groups and organisations work for welfare and justice'),
  'kirkens-bymisjon:berort-av-rus': ('addiction_support', ['peer_support'], 'MEDIUM', 'name', 'for those affected by someone else\'s substance use; theme evenings'),
  'kirkens-bymisjon:blomsterbua': ('work_inclusion', [], 'MEDIUM', 'source_group', ''),
  'kirkens-bymisjon:bo-team': ('housing_outreach', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:bruktbutikk': ('thrift_shop', ['work_inclusion'], 'HIGH', 'name', ''),
  'kirkens-bymisjon:bybo-oslo': ('housing_outreach', [], 'MEDIUM', 'description', '22 rental homes with ordinary contracts'),
  'kirkens-bymisjon:bymisjonskapellet': ('worship_open_church', ['meeting_place'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:bymisjonssenteret-oslo': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:bymisjonssenteret-porsgrunn': ('meeting_place', ['work_inclusion'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:bymisjonssenteret-alesund': ('meeting_place', ['physical_activity'], 'MEDIUM', 'description', 'yoga and walking groups among other things'),
  'kirkens-bymisjon:byparken': (None, [], 'HIGH', 'description', 'conference venue rental; the page describes no service for people'),
  'kirkens-bymisjon:byverkstedet': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:retro-ullverksted': ('work_inclusion', ['creative_crafts'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:baerekraftige-fellesskap': ('work_inclusion', [], 'MEDIUM', 'source_group', 'a production kitchen'),
  'kirkens-bymisjon:camp-hudoy': ('holiday_camps_low_income', [], 'MEDIUM', 'name', 'no description on disk'),
  'kirkens-bymisjon:camp-killingen': ('holiday_camps_low_income', [], 'HIGH', 'description', 'summer holiday colony for children'),
  'kirkens-bymisjon:dag-1': ('family_support', [], 'HIGH', 'description', 'attachment support from pregnancy'),
  'kirkens-bymisjon:demokratiskolen': ('meeting_place', ['migrant_mentoring'], 'HIGH', 'description', 'women with migrant background (was women_migrant_network, merged)'),
  'kirkens-bymisjon:egenutviklingsskolen': ('addiction_support', ['peer_support'], 'MEDIUM', 'description', 'lecturers with own experience'),
  'kirkens-bymisjon:empo': ('meeting_place', ['migrant_mentoring'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:enga': ('addiction_support', ['housing_outreach'], 'HIGH', 'description', 'residential care for people after long-term drug use'),
  'kirkens-bymisjon:englefabrikken': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:enter-fritid': ('addiction_support', ['physical_activity'], 'MEDIUM', 'description', 'leisure for people in aftercare'),
  'kirkens-bymisjon:enter-jobb': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:et-sted-a-hore-til': ('language_practice', ['meeting_place'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:familieaktiviteter': ('holiday_camps_low_income', ['family_support'], 'MEDIUM', 'description', 'holiday memories for the whole family'),
  'kirkens-bymisjon:familietid': ('family_support', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:familieveiledning': ('family_support', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:feltsykepleien': ('health_services', ['addiction_support'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:forandringshuset': ('youth_drop_in', [], 'MEDIUM', 'description', 'youth culture and prevention centre'),
  'kirkens-bymisjon:fri-barn-og-familie': ('family_support', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:fri-rus': ('housing_outreach', ['addiction_support'], 'MEDIUM', 'description', 'path from shared room to own home'),
  'kirkens-bymisjon:friminuttet': ('homework_help', [], 'HIGH', 'description', 'homework help, meals and play'),
  'kirkens-bymisjon:fritidshuset-tonsberg': ('family_support', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:frivilligsentralen-kristiansand': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:frivilligsentralen-pasvik': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:frivilligsentralen-sor-varanger': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:gatejuristen': ('legal_aid', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:basen': ('health_services', ['addiction_support'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:gatemagasinet-asfalt': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:gatesosionomen': ('housing_outreach', [], 'LOW', 'description', 'GAP: help with public services has no category'),
  'kirkens-bymisjon:generasjonsmoter': ('meeting_place', ['homework_help'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:gi-det-videre': ('family_support', [], 'LOW', 'description', 'GAP: donated clothes and sports equipment for children 0-18; equipment lending/donation has no category'),
  'kirkens-bymisjon:heggeli-barnehjem': ('child_welfare', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:heggeli-familiehjem': ('child_welfare', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:heggeli-hjelpetiltak': ('child_welfare', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:heggeli-ungdomshjem': ('child_welfare', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:helsesenteret-for-papirlose-migranter': ('health_services', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:holmen': ('addiction_support', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:home-start': ('family_support', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:i-jobb': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:ila-frivilligsentral': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:innsattes-barn': ('family_support', ['prison_reintegration'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kafe-josephine': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kafe-krohnhagen': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kafe-saba': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kafe-torvet': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kafe-honefoss': ('meeting_place', ['work_inclusion'], 'MEDIUM', 'description', 'café open to all, run as a social enterprise'),
  'kirkens-bymisjon:kafeer-og-motesteder': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kaffekoppen': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kb-arbeid': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kirkens-bymisjons-barneverntiltak': ('child_welfare', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:korskirken': ('worship_open_church', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kreaktivt-verksted': ('work_inclusion', ['creative_crafts'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kudos': ('youth_drop_in', [], 'MEDIUM', 'description', 'arenas where all young people are welcome'),
  'kirkens-bymisjon:kvartal-xiii': ('housing_outreach', ['addiction_support'], 'MEDIUM', 'description', 'supported living'),
  'kirkens-bymisjon:kvinner-i-sentrum': ('meeting_place', ['migrant_mentoring'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:kvinneverkstedet': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:larkollen-behandlingssenter': ('health_services', [], 'HIGH', 'description', 'long-term residential mental-health care, ages 13-18'),
  'kirkens-bymisjon:lauras-hus': ('crisis_shelter', [], 'MEDIUM', 'description', 'staffed housing for victims of human trafficking'),
  'kirkens-bymisjon:legal-aid': ('legal_aid', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:matstasjon': ('food_distribution', [], 'HIGH', 'description', 'delivers surplus food to people\'s homes'),
  'kirkens-bymisjon:fattige-tilreisende': ('housing_outreach', [], 'MEDIUM', 'description', 'humanitarian help for poor EU/EEA citizens'),
  'kirkens-bymisjon:moss-frivilligsentral': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:myrsnipa-samvaerssted': ('child_welfare', [], 'HIGH', 'description', 'supervised contact visits'),
  'kirkens-bymisjon:mysen-frivilligsentral': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:moteplass-for-ungdom': ('youth_drop_in', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:motestedet': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:nabolagshuset': ('youth_drop_in', ['meeting_place'], 'MEDIUM', 'description', ''),
  'kirkens-bymisjon:nadheim': ('health_services', [], 'MEDIUM', 'description', 'drop-in for people who sell sex or are trafficked: health, safety, advice'),
  'kirkens-bymisjon:natteravnene': ('street_mediation', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:omsorgsstasjonen-for-barn-og-ungdom': ('family_support', [], 'HIGH', 'description', 'counselling for families with school-age children; groups for separating parents'),
  'kirkens-bymisjon:oppsokende-team': ('addiction_support', ['housing_outreach'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:origosenteret': ('addiction_support', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:pedalen-sykkelverksted': ('work_inclusion', [], 'MEDIUM', 'source_group', 'a bicycle workshop run as work inclusion'),
  'kirkens-bymisjon:portalen': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:primaermedisinsk-verksted': ('meeting_place', ['language_practice'], 'MEDIUM', 'description', 'women\'s café, men\'s group, language group, choir'),
  'kirkens-bymisjon:produksjonskjokkenet': ('work_inclusion', ['food_distribution'], 'MEDIUM', 'description', ''),
  'kirkens-bymisjon:paahjul-sykkelverksted': ('work_inclusion', [], 'MEDIUM', 'source_group', 'a bicycle workshop run as work inclusion'),
  'kirkens-bymisjon:ren-by': ('work_inclusion', [], 'MEDIUM', 'source_group', 'a subscription cleaning service run as work inclusion'),
  'kirkens-bymisjon:ressurssenter-for-norske-romer': ('legal_aid', [], 'MEDIUM', 'description', 'GAP-adjacent: rights work and help in meeting public services'),
  'kirkens-bymisjon:rettshjelp-a-krim': ('legal_aid', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:risenga-bo-og-omsorgssenter': ('health_services', [], 'LOW', 'name', 'GAP: residential elderly care has no category'),
  'kirkens-bymisjon:robust': ('family_support', [], 'HIGH', 'description', 'counselling for school-age children and their families, no referral'),
  'kirkens-bymisjon:romano-kher': ('youth_activity_groups', [], 'MEDIUM', 'description', 'leisure activities for Roma children'),
  'kirkens-bymisjon:rusomsorgen': ('addiction_support', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:saupstad-frivilligsentral': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:skattkammeret': ('youth_activity_groups', [], 'LOW', 'description', 'GAP: free lending of sports and leisure equipment, under 25; no category'),
  'kirkens-bymisjon:skovheim-allsenter': ('meeting_place', [], 'MEDIUM', 'description', 'meals as the gathering point'),
  'kirkens-bymisjon:spenn': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:sporet': ('housing_outreach', [], 'HIGH', 'description', 'outreach at Oslo S'),
  'kirkens-bymisjon:sprak-gjennom-arbeid': ('language_practice', ['work_inclusion'], 'HIGH', 'name', ''),
  'kirkens-bymisjon:st-hanshaugen-frivilligsentral': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:st-hanshaugen-seniorsenter': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:stovner-frivilligsentral': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:stovner-leaderz': ('youth_activity_groups', [], 'MEDIUM', 'description', 'leadership training for young people'),
  'kirkens-bymisjon:sveio-frivilligsentral': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:tekstilinnsamling': (None, [], 'HIGH', 'description', 'textile collection that funds the NGO\'s services'),
  'kirkens-bymisjon:tillitsperson': ('addiction_support', [], 'MEDIUM', 'description', 'GAP-adjacent: assists people with addiction in contact with services'),
  'kirkens-bymisjon:toyen-kro': ('meeting_place', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:toyenkirken': ('worship_open_church', ['meeting_place'], 'HIGH', 'description', ''),
  'kirkens-bymisjon:ullern-frivilligsentral': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:ung-pa-dagtid': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:ung-rettshjelp': ('legal_aid', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:ungdomskafe': ('youth_drop_in', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:sitename-sep-title-page': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:vaktmestertjenesten': ('work_inclusion', [], 'MEDIUM', 'source_group', 'a caretaker service run as work inclusion'),
  'kirkens-bymisjon:veiviser': ('migrant_mentoring', ['language_practice'], 'HIGH', 'description', 'groups of three: newcomer, Norwegian-born, experienced migrant'),
  'kirkens-bymisjon:ventilene': ('peer_support', [], 'MEDIUM', 'description', 'young relatives from difficult homes'),
  'kirkens-bymisjon:verdensrommet': ('addiction_support', [], 'LOW', 'source_group', 'no description on disk'),
  'kirkens-bymisjon:verksteder': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:verkstedet': ('work_inclusion', [], 'HIGH', 'description', ''),
  'kirkens-bymisjon:veslelien': ('addiction_support', [], 'HIGH', 'description', 'specialised addiction treatment'),
  'kirkens-bymisjon:vibemyr-skoleverksted': ('homework_help', [], 'LOW', 'description', 'GAP: an upper-secondary school with adapted teaching; no category for alternative education'),
  'kirkens-bymisjon:villa-berg': ('addiction_support', ['health_services'], 'HIGH', 'description', 'long-term addiction treatment for men over 18'),
  'kirkens-bymisjon:viste-strandhotell': (None, [], 'HIGH', 'description', 'hotel and conference venue; the page describes no service for people'),
  'kirkens-bymisjon:valerengahjemmet-bo-og-kultursenter': ('health_services', ['meeting_place'], 'LOW', 'description', 'GAP: residential elderly care has no category'),
  'kirkens-bymisjon:var-frue-apen-kirke': ('worship_open_church', ['music_choir'], 'HIGH', 'name', ''),
  'kirkens-bymisjon:ostbyen-frivilligsentral': ('volunteer_centre', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:apen-barnehage': ('family_support', [], 'HIGH', 'name', ''),
  'kirkens-bymisjon:apen-kirke': ('worship_open_church', [], 'HIGH', 'name', ''),

  # --- Nasjonalforeningen (6). "Med oss" is its general programme of local activities; the
  # page (folkehelse/lokale-aktiviteter) files Gåfotball and Syng med oss under dementia ---
  'nasjonalforeningen:demensvennlig-med-oss': ('dementia_support', ['health_information'], 'HIGH', 'description', 'courses for municipal staff and businesses who meet people with dementia'),
  'nasjonalforeningen:ga-med-oss': ('physical_activity', [], 'HIGH', 'description', 'walking groups for different target groups'),
  'nasjonalforeningen:gafotball': ('physical_activity', ['dementia_support'], 'HIGH', 'description', 'filed under activities for people with dementia'),
  'nasjonalforeningen:spis-med-oss': ('meeting_place', ['dementia_support'], 'MEDIUM', 'description', 'meals as a meeting place; dementia café is one of its examples'),
  'nasjonalforeningen:strikk-med-oss': ('creative_crafts', [], 'HIGH', 'description', 'knitting cafés across generations'),
  'nasjonalforeningen:syng-med-oss': ('music_choir', ['dementia_support'], 'HIGH', 'description', 'singing for people with dementia'),

  # --- Folkehjelp (6): the "Aktivitetsområder" on its chapter pages (R3) ---
  'folkehjelp:forstehjelp-og-redningstjeneste': ('rescue_corps', ['first_aid_training'], 'HIGH', 'description', 'first aid and rescue service; training free'),
  'folkehjelp:sanitetsungdom': ('youth_activity_groups', ['first_aid_training'], 'HIGH', 'description', 'first-aid groups for ages 13-18'),
  'folkehjelp:flyktning-og-inkludering': ('migrant_mentoring', ['language_practice'], 'HIGH', 'description', 'inclusion of refugees: language cafés, leisure'),
  'folkehjelp:solidaritetsungdom': ('youth_activity_groups', ['political_advocacy'], 'MEDIUM', 'description', 'ages 13-30: integration, solidarity, anti-racism'),
  'folkehjelp:samfunnsarbeid': ('meeting_place', [], 'MEDIUM', 'description', 'meeting places and services in the local community'),
  'folkehjelp:internasjonale-sporsmal': ('political_advocacy', [], 'HIGH', 'description', 'meetings on international issues'),

  # --- LHL (17): activity types from its chapters' activity pages (R3) ---
  'lhl:bassengtrening-og-vanntrim': ('physical_activity', [], 'HIGH', 'name', 'warm-water training'),
  'lhl:fysisk-aktivitet-niva-1': ('physical_activity', ['health_services'], 'HIGH', 'name', 'LHL level 1: gentlest, often for lung disease'),
  'lhl:fysisk-aktivitet-niva-2': ('physical_activity', [], 'HIGH', 'name', 'LHL level 2 (formerly heart training)'),
  'lhl:fysisk-aktivitet-niva-3': ('physical_activity', [], 'HIGH', 'name', 'LHL level 3'),
  'lhl:trim-og-trening': ('physical_activity', [], 'HIGH', 'name', ''),
  'lhl:yoga-balanse-og-avspenning': ('physical_activity', [], 'HIGH', 'name', ''),
  'lhl:dans': ('physical_activity', ['meeting_place'], 'HIGH', 'name', ''),
  'lhl:turgruppe-og-gaturer': ('physical_activity', [], 'HIGH', 'name', 'walking groups'),
  'lhl:bowling-boccia-og-spill-i-bevegelse': ('physical_activity', ['meeting_place'], 'HIGH', 'name', ''),
  'lhl:pratekafe-og-sosiale-treff': ('meeting_place', ['peer_support'], 'HIGH', 'name', 'includes aphasia talk cafés'),
  'lhl:bingo-og-kortspill': ('meeting_place', [], 'HIGH', 'name', ''),
  'lhl:hobby-og-handarbeid': ('creative_crafts', [], 'HIGH', 'name', ''),
  'lhl:sanggruppe': ('music_choir', [], 'HIGH', 'name', ''),
  'lhl:temamoter-og-kurs': ('health_information', [], 'HIGH', 'name', ''),
  'lhl:ferieopphold-og-turer': ('meeting_place', [], 'MEDIUM', 'name', 'trips and holiday stays for members'),
  'lhl:local-bevegelse-til-musikk': ('physical_activity', ['music_choir'], 'MEDIUM', 'name', ''),
  'lhl:local-lhl-skjak': ('physical_activity', [], 'LOW', 'description', 'an outdoor activity day; the page name is the chapter'),

  # --- Diabetesforbundet (7): activity types from its chapters' events (R3) ---
  'diabetesforbundet:diakafe-og-treff': ('meeting_place', ['peer_support'], 'HIGH', 'name', 'diakafé, diaprat'),
  'diabetesforbundet:gagruppe-og-turer': ('physical_activity', [], 'HIGH', 'name', ''),
  'diabetesforbundet:trening-og-fysisk-aktivitet': ('physical_activity', [], 'HIGH', 'name', ''),
  'diabetesforbundet:temamoter-og-kurs': ('health_information', [], 'HIGH', 'name', ''),
  'diabetesforbundet:treff-for-barn-unge-og-familier': ('family_support', ['peer_support'], 'MEDIUM', 'name', 'families with a child with diabetes'),
  'diabetesforbundet:likepersoner-og-motivasjonsgrupper': ('peer_support', [], 'HIGH', 'name', ''),
  'diabetesforbundet:strikkekafe': ('creative_crafts', ['meeting_place'], 'HIGH', 'name', ''),

  # --- Mental Helse (7): activity types from its chapters' event API (R3) ---
  'mental-helse:sosialt-treff-og-kafe': ('meeting_place', ['peer_support'], 'HIGH', 'name', ''),
  'mental-helse:turgruppe-og-turer': ('physical_activity', [], 'HIGH', 'name', ''),
  'mental-helse:fysisk-aktivitet': ('physical_activity', [], 'HIGH', 'name', ''),
  'mental-helse:foredrag-og-kurs': ('health_information', [], 'HIGH', 'name', ''),
  'mental-helse:likepersoner-og-samtalegrupper': ('peer_support', [], 'HIGH', 'name', ''),
  'mental-helse:utflukter-og-sosiale-arrangementer': ('meeting_place', [], 'MEDIUM', 'name', 'cinema, trips, seasonal parties'),
  'mental-helse:markeringer-for-psykisk-helse': ('political_advocacy', [], 'HIGH', 'name', 'torchlight march, world mental health day'),

  # --- 4H (3): its national programme by age group (R3, programme activities) ---
  'fire-h:4h-klubb-10-18-ar': ('youth_activity_groups', [], 'HIGH', 'description', 'club activity and 4H projects, ages 10-18'),
  'fire-h:familieaktiviteter-0-9-ar': ('family_support', ['youth_activity_groups'], 'HIGH', 'description', 'family activities, ages 0-9'),
  'fire-h:4h-for-alumner-19-ar': ('youth_activity_groups', [], 'MEDIUM', 'description', 'alumni, international exchange'),

  # --- Speiderforbundet (6): age branches each group publishes on blispeider.no ---
  'speiderforbundet:bever': ('youth_activity_groups', [], 'HIGH', 'description', 'scouting, school years 1-2'),
  'speiderforbundet:smaspeider': ('youth_activity_groups', [], 'HIGH', 'description', 'scouting, school years 3-4'),
  'speiderforbundet:stifinner': ('youth_activity_groups', [], 'HIGH', 'description', 'scouting, school years 5-7'),
  'speiderforbundet:vandrer': ('youth_activity_groups', [], 'HIGH', 'description', 'scouting, school years 8-10'),
  'speiderforbundet:speidertropp': ('youth_activity_groups', [], 'HIGH', 'description', 'scouting troop, school years 5-10'),
  'speiderforbundet:rover': ('youth_activity_groups', [], 'HIGH', 'description', 'scouting, ages 16-25'),

  # --- Sanitetskvinnene (14) ---
  'sanitetskvinnene:asylmottak': ('migrant_mentoring', [], 'HIGH', 'name', ''),
  'sanitetskvinnene:dig-in': ('physical_activity', [], 'LOW', 'none', 'a placeholder: nothing on disk says what Dig In is; needs R10 before review'),
  'sanitetskvinnene:eldre': (None, [], 'HIGH', 'description', 'a thematic area page (group heading), not an activity'),
  'sanitetskvinnene:integrering': (None, [], 'HIGH', 'description', 'a thematic area page (group heading), not an activity'),
  'sanitetskvinnene:kanskje-kommer-kongen': ('meeting_place', ['elderly_visiting'], 'MEDIUM', 'description', 'against loneliness among older women living alone'),
  'sanitetskvinnene:klovertur': ('physical_activity', [], 'HIGH', 'description', ''),
  'sanitetskvinnene:kvinnehelse': ('health_information', [], 'HIGH', 'description', ''),
  'sanitetskvinnene:lesevenn': ('reading_friend', [], 'HIGH', 'name', ''),
  'sanitetskvinnene:motherhood': ('family_support', ['migrant_mentoring'], 'HIGH', 'description', ''),
  'sanitetskvinnene:naeringsliv': (None, [], 'HIGH', 'description', 'guidance for chapters on working with local businesses'),
  'sanitetskvinnene:omsorgsberedskap': ('crisis_preparedness', [], 'HIGH', 'name', ''),
  'sanitetskvinnene:ressursvenn': ('crisis_shelter', [], 'HIGH', 'description', 'support after leaving a violent partner (was violence_support, merged)'),
  'sanitetskvinnene:sisterhood': ('meeting_place', ['migrant_mentoring'], 'LOW', 'name', 'page on disk is training material; the activity itself needs R10'),
  'sanitetskvinnene:sprakvenn': ('language_practice', [], 'HIGH', 'name', ''),
}

# Atlas's CASE for Røde Kors, as in the repo at 0ffeb79, and the research's proposal for each.
# (global_activity_name, atlas_code, proposed_primary, [secondary], confidence, note)
ATLAS_REDCROSS = [
  ('Hjelpekorps', 'rescue_corps', 'rescue_corps', [], 'HIGH', ''),
  ('Besøkstjeneste', 'elderly_visiting', 'elderly_visiting', [], 'HIGH', ''),
  ('Beredskap', 'first_aid_standby', 'first_aid_standby', ['crisis_preparedness'], 'MEDIUM', 'v2 adds crisis_preparedness; on rodekors.no it also covers psykososial førstehjelp groups'),
  ('Besøksvenn med hund', 'elderly_visiting', 'elderly_visiting', [], 'HIGH', ''),
  ('Opplæring', 'first_aid_training', 'first_aid_training', [], 'MEDIUM', ''),
  ('Barnas Røde Kors', 'youth_activity_groups', 'youth_activity_groups', [], 'HIGH', ''),
  ('Røde Kors Friluftsliv og Førstehjelp (RØFF)', 'youth_activity_groups', 'youth_activity_groups', ['first_aid_training'], 'HIGH', ''),
  ('Norsktrening', 'language_practice', 'language_practice', [], 'HIGH', ''),
  ('Flyktningguide', 'migrant_mentoring', 'migrant_mentoring', [], 'HIGH', ''),
  ('Øvrige aktiviteter -  Røde Kors Ungdom', 'youth_activity_groups', 'youth_activity_groups', [], 'MEDIUM', ''),
  ('Leksehjelp', 'homework_help', 'homework_help', [], 'HIGH', ''),
  ('Treffpunkt - Røde Kors Ungdom', 'youth_drop_in', 'youth_drop_in', [], 'HIGH', ''),
  ('Visitor', 'elderly_visiting', 'prison_reintegration', [], 'HIGH', 'CHANGE: rodekors.no (R8): confidential conversations with prisoners - prison visiting, not elderly visiting'),
  ('Vitnestøtte', 'legal_witness_support', 'legal_witness_support', [], 'HIGH', ''),
  ('Ferie for alle', 'holiday_camps_low_income', 'holiday_camps_low_income', [], 'HIGH', ''),
  ('Aktiviteter på asylmottak', 'migrant_mentoring', 'migrant_mentoring', [], 'HIGH', ''),
  ('Bruktbutikk', 'thrift_shop', 'thrift_shop', [], 'HIGH', ''),
  ('Møteplass Fellesverkene', 'youth_drop_in', 'youth_drop_in', [], 'MEDIUM', ''),
  ('Gatemegling', 'street_mediation', 'street_mediation', [], 'HIGH', ''),
  ('Språkgruppe', 'language_practice', 'language_practice', [], 'HIGH', ''),
  ('Familiesenter', 'family_support', 'family_support', [], 'HIGH', ''),
  ('Vennefamilie', 'family_support', 'family_support', ['migrant_mentoring'], 'HIGH', ''),
  ('Nettverk etter soning', 'prison_reintegration', 'prison_reintegration', [], 'HIGH', ''),
  ('Mentorfamilie', 'family_support', 'family_support', ['migrant_mentoring'], 'MEDIUM', ''),
  ('Akuttovernatting for bostedsløse tilreisende', 'housing_outreach', 'emergency_shelter', [], 'HIGH', 'CHANGE: v2 has emergency_shelter'),
  ('Kors på Halsen', 'crisis_helpline', 'crisis_helpline', [], 'HIGH', ''),
  ('Aktiviteter på utlendingsinternat', 'migrant_mentoring', 'migrant_mentoring', [], 'HIGH', ''),
  ('Digital leksehjelp', 'homework_help', 'homework_help', [], 'HIGH', ''),
  ('Internasjonal Humanitær Rett', 'political_advocacy', 'political_advocacy', [], 'MEDIUM', ''),
  ('Møteplasser', 'family_support', 'meeting_place', [], 'MEDIUM', 'CHANGE: Atlas best guess; v2 has meeting_place'),
  ('Praktiske tjenester', 'family_support', 'family_support', [], 'LOW', 'Atlas best guess kept; check content (R8)'),
  ('Våketjenesten', 'elderly_visiting', 'elderly_visiting', [], 'MEDIUM', 'Atlas best guess kept: sitting with the dying, closest is visiting'),
  ('Turgruppe', 'youth_activity_groups', 'physical_activity', [], 'MEDIUM', 'CHANGE: Atlas best guess; v2 has physical_activity'),
  ('Nattevandring', 'street_mediation', 'street_mediation', [], 'HIGH', 'Atlas best guess confirmed: v2 street_mediation covers night walks'),
  ('Habil', 'family_support', 'work_inclusion', [], 'MEDIUM', 'CHANGE: rodekors.no (R8): a volunteer to practise driving with, for a driving licence - mobility for work'),
  ('EVA', 'not a service', 'crisis_shelter', [], 'HIGH', 'CHANGE: Atlas marks it not a service; rodekors.no (R8): a support person for a year after domestic violence, negative social control or trafficking'),
  ('Døråpner', 'not a service', 'meeting_place', ['addiction_support', 'prison_reintegration'], 'HIGH', 'CHANGE: Atlas marks it not a service; rodekors.no (R8): free evening activity groups after addiction, psychiatry, prison or loneliness'),
]
ATLAS_REDCROSS_NOT_SERVICE = [
  'Administrative oppgaver', 'Sporadisk frivillige', 'Lokalstyre', 'BUA', 'Distriktsstyre',
  'Kompetansesenter', 'Mottak av frivillige i lokalforening', 'Lokalråd Hjelpekorps',
  'Lokalråd Omsorg', 'Distriktsråd Hjelpekorps', 'Distriktsråd Ungdom',
  'Blodgiververving', 'Arrangement og reise', 'Internasjonalt distriktsamarbeid',
]
NOT_SERVICE_NOTE = {
  'BUA': 'Atlas: not a service. QUESTION: BUA lends sports equipment to the public free of charge - the same gap as Kirkens Bymisjon\'s Skattkammeret',
}

# Røde Kors activities a branch names that are not one of the national activities (redcross-branches.ts
# marks them `redcross:local-…`). Keyword rules on the local name, first match wins; the branch's own
# text is on the chapter. (pattern, primary, secondary, confidence, note)
REDCROSS_LOCAL = [
  (r'blod', None, [], 'HIGH', 'blood donor recruitment - Atlas: not a service'),
  (r'lokalforein|resepsjon|kur?s?tilbud frivillig', None, [], 'HIGH', 'about the branch or its volunteers (management, reception, volunteer training), not a service'),
  (r'gardermo|ledersager|ledsager', 'meeting_place', [], 'LOW', 'GAP-adjacent: assistance for people with disabilities (airport, guiding the blind)'),
  (r'julearrangement|julekveld', 'meeting_place', [], 'MEDIUM', 'Christmas Eve for people who would otherwise be alone'),
  (r'generasjon', 'elderly_visiting', [], 'MEDIUM', 'young people read and sing for residents of care homes'),
  (r'utstyrsbank|utstyrsbas|turbo|turbua|utlånssentral', 'youth_activity_groups', [], 'LOW', 'GAP: free equipment lending (BUA-type); no category'),
  (r'røde kors-telefonen|negativ sosial kontroll', 'crisis_helpline', [], 'HIGH', ''),
  (r'krisesenter', 'crisis_shelter', [], 'HIGH', ''),
  (r'pårørende- og evakuert|ettersamtale', 'crisis_preparedness', [], 'MEDIUM', ''),
  (r'dykker', 'rescue_corps', [], 'MEDIUM', ''),
  (r'hjertestarter', 'first_aid_training', [], 'LOW', 'defibrillators placed in the community'),
  (r'familiekobling|ankomstsenter|migrasjon|flerkultur|integrering|mangfold|flyktning', 'migrant_mentoring', [], 'MEDIUM', ''),
  (r'norskprat|norskundervisning|norsk', 'language_practice', [], 'HIGH', ''),
  (r'internasjonal|verdens kvinner|kameleon|medkvinner|kvinnegrupp|dame|svømming for kvinner', 'meeting_place', ['migrant_mentoring'], 'MEDIUM', 'women\'s and international groups'),
  (r'ungdomsklubb|klubben|g10|smud', 'youth_drop_in', [], 'HIGH', ''),
  (r'åpen barnehage|foreldrekaf|familie|barnas dag|obu|omsorg (for )?barn', 'family_support', [], 'MEDIUM', ''),
  (r'barn|ungdom|oppvekst|rusfri', 'youth_activity_groups', [], 'MEDIUM', ''),
  (r'arbeidstrening|jobbsjansen|mengdekjøring|kjøretrening', 'work_inclusion', [], 'MEDIUM', ''),
  (r'funksjonshemm|funksjonsevne|evne og vilje|sulasusen|døve|ledsager', 'meeting_place', [], 'LOW', 'GAP-adjacent: activities for people with disabilities'),
  (r'sykehus|unn\b|frivilligverter', 'health_services', [], 'LOW', 'GAP: hospital guides and hosts; no category for volunteering in hospitals'),
  (r'trim|trening|volleyball|innebandy|svøm|bading|bassenget|til topps|turmarsj|skitur|sykkel|aktiv aldring|aktiv i 100|aktivitetsdag', 'physical_activity', [], 'HIGH', ''),
  (r'strikk|\bsy|håndarbeid|handarbeid|hobby|kreativ|fugleredet|systue|gartner|bærplukking', 'creative_crafts', [], 'MEDIUM', ''),
  (r'sang|allsang', 'music_choir', [], 'HIGH', ''),
  (r'butikk|gjenbruk|loppemarked|klesrom|bruktbu', 'thrift_shop', [], 'HIGH', ''),
  (r'julaften for alle|ferieglede|gratis ferie', 'holiday_camps_low_income', ['family_support'], 'MEDIUM', ''),
  (r'juletre|ønsketre', 'family_support', [], 'MEDIUM', 'Christmas gifts for families with little money'),
  (r'matstasjon|matservering|mat på bordet|kveldsmat|varmestua', 'food_distribution', [], 'MEDIUM', ''),
  (r'spisevenn|lyttevenn|kulturvenn|hverdagsvenn|omsorg|eldre|senior|besteforeldre', 'elderly_visiting', [], 'LOW', 'Røde Kors omsorg = mostly visiting and social activities for older people'),
  (r'lesevenn', 'reading_friend', [], 'HIGH', ''),
  (r'følgetjeneste|transport|sjåfør|bårebil|tralle|handlehjelp|hverdagshjelp|varetransport|datahjelp|digital senior', 'elderly_visiting', [], 'LOW', 'GAP: practical help (transport, shopping, digital help); no category'),
  (r'sosial resept', 'physical_activity', ['meeting_place'], 'MEDIUM', 'activity on prescription'),
  (r'kaf[eè]|kaffe|åpent hus|stua|stuå|onsdagsgjengen|hygge|spillkveld|bingo|vaffel|trivsel|påskekaffe|høstfest|treff|nettverk|sosial|restart|mulighetens hus|samarbeidsgruppa|aktivitetsgrupp|arka|buda|frivilligsentral|ressursgruppe|sherrytralla|spydeberg|syltemartnan|høstmarked|hjerte for|lyngdøler|bruk hue|når krigen raser|krigen|trygg hygge|mentor|kompis|aktiviteter|aktivitet', 'meeting_place', [], 'LOW', 'a local social or community activity; check the branch text'),
]

FIELDS = ['activity_id', 'ngo', 'name', 'source_group', 'service_category_code', 'is_primary',
          'is_service', 'atlas_case_code', 'method', 'basis', 'confidence', 'note',
          'reviewed_by', 'reviewed_at']


def slug(s):
    import re, unicodedata
    s = s.lower().replace('ø', 'o').replace('æ', 'ae').replace('å', 'a')
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def main():
    codes = {r['code'] for r in csv.DictReader(open(os.path.join(HERE, 'categories-v2.csv')))
             if r['status'] == 'active'}
    rows, seen = [], set()
    redcross_disk = []
    for f in sorted(glob.glob(os.path.join(NGO, 'data', '*', 'activities.json'))):
        d = json.load(open(f))
        for a in (d.get('items', d) if isinstance(d, dict) else d):
            aid = a['id']
            seen.add(aid)
            if aid.startswith('redcross:'):
                redcross_disk.append(a)
                continue
            if aid not in M:
                sys.exit(f'unmapped activity: {aid} ({a["name"]})')
            primary, secondary, conf, basis, note = M[aid]
            group = a.get('group') or {}
            base = dict(activity_id=aid, ngo=aid.split(':')[0], name=a['name'],
                        source_group=group.get('name') or group.get('id', '').split(':')[-1],
                        atlas_case_code='', method='RESEARCH_PROPOSED', basis=basis,
                        confidence=conf, note=note, reviewed_by='', reviewed_at='')
            if primary is None:
                rows.append({**base, 'service_category_code': '', 'is_primary': '', 'is_service': 'false'})
                continue
            for i, code in enumerate([primary] + secondary):
                rows.append({**base, 'service_category_code': code, 'is_primary': 'true' if i == 0 else 'false',
                             'is_service': 'true'})
    stale = set(M) - seen
    if stale:
        sys.exit(f'mapping for activities not on disk: {sorted(stale)}')
    # Røde Kors: the national activities on rodekors.no keep Atlas's mapping where the branch texts
    # agree (ATLAS_REDCROSS, with its CHANGE notes); local ones go through REDCROSS_LOCAL.
    national = {'redcross:' + slug(n): (n, at, p, sc, cf, nt) for n, at, p, sc, cf, nt in ATLAS_REDCROSS}
    unmatched = []
    for a in redcross_disk:
        aid = a['id']
        base = dict(activity_id=aid, ngo='redcross', name=a['name'], source_group='',
                    method='RESEARCH_PROPOSED', reviewed_by='', reviewed_at='')
        if aid in national:
            n, atlas, primary, secondary, conf, note = national.pop(aid)
            base.update(atlas_case_code=atlas, basis='atlas_case' if primary == atlas else 'description',
                        confidence=conf, note=(note + '; ' if note else '') + f"on {a.get('chapterCount', 0)} branch pages")
        else:
            rule = next((r for r in REDCROSS_LOCAL if re.search(r[0], a['name'], re.I)), None)
            if not rule:
                unmatched.append(a['name']); continue
            _, primary, secondary, conf, note = rule
            base.update(atlas_case_code='', basis='name', confidence=conf,
                        note=(note + '; ' if note else '') + f"a branch's own activity, {a.get('chapterCount', 0)} branch(es)")
        if primary is None:
            rows.append({**base, 'service_category_code': '', 'is_primary': '', 'is_service': 'false'})
            continue
        for i, code in enumerate([primary] + secondary):
            rows.append({**base, 'service_category_code': code, 'is_primary': 'true' if i == 0 else 'false', 'is_service': 'true'})
    if unmatched:
        sys.exit(f'Røde Kors local activities no rule maps: {unmatched}')
    # National activities in Atlas's list that no branch page publishes: kept for the comparison with Atlas.
    for aid, (name, atlas, primary, secondary, conf, note) in national.items():
        base = dict(activity_id=aid, ngo='redcross', name=name, source_group='', atlas_case_code=atlas,
                    method='RESEARCH_PROPOSED', basis='atlas_case' if primary == atlas else 'name', confidence=conf,
                    note=(note + '; ' if note else '') + 'not on any rodekors.no branch page (2026-10-04)',
                    reviewed_by='', reviewed_at='', is_service='true')
        for i, code in enumerate([primary] + secondary):
            rows.append({**base, 'service_category_code': code, 'is_primary': 'true' if i == 0 else 'false'})
    for name in ATLAS_REDCROSS_NOT_SERVICE:
        rows.append(dict(activity_id='redcross:' + slug(name), ngo='redcross', name=name, source_group='',
                         service_category_code='', is_primary='', is_service='false', atlas_case_code='',
                         method='RESEARCH_PROPOSED', basis='atlas_case', confidence='HIGH',
                         note=NOT_SERVICE_NOTE.get(name, 'Atlas: administrative, governance or recruitment'),
                         reviewed_by='', reviewed_at=''))
    bad = {r['service_category_code'] for r in rows if r['service_category_code']} - codes
    if bad:
        sys.exit(f'codes not active in categories-v2.csv: {bad}')
    # Keep a reviewer's sign-off across rebuilds, for rows whose mapping did not change.
    if os.path.exists(OUT):
        signed = {(r['activity_id'], r['service_category_code'], r['is_primary']): r
                  for r in csv.DictReader(open(OUT)) if r.get('reviewed_by')}
        for r in rows:
            prev = signed.get((r['activity_id'], r['service_category_code'], r['is_primary']))
            if prev:
                r['reviewed_by'], r['reviewed_at'] = prev['reviewed_by'], prev['reviewed_at']
    with open(OUT, 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    acts = {r['activity_id'] for r in rows}
    prim = [r for r in rows if r['is_primary'] == 'true']
    print(f'{len(acts)} activities, {len(rows)} rows, {len(prim)} with a primary category, '
          f'{sum(r["is_service"] == "false" for r in rows)} not a service -> {os.path.relpath(OUT, NGO)}')


if __name__ == '__main__':
    main()
