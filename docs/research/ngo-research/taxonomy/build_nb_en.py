"""
file: taxonomy/build_nb_en.py
description: The activity taxonomy in two languages - Norwegian as people search it, then English.

Writes taxonomy/taxonomy-nb-en.csv (one row per active category) and
taxonomy/taxonomy-nb-en-families.csv.

Norwegian (bokmål) is primary. Each label is built from the generic terms people actually type
into Google (Keyword Planner, rounds 1-5, `search-terms-validated.csv`), and `label_nb_evidence`
names those terms with their monthly volume band. Search terms are listed in volume order,
taken from the validated file; brand names (an NGO's own programme names) and terms whose
volume comes from another meaning (`EXCLUDE`) are left out.

English is a translation, chosen as the plain term an English-speaking resident of Norway
would use. English search volume in Norway has NOT been measured - `en_measured = no`.

Nynorsk labels stay in categories-v2.csv until a native writer has reviewed them (task O3).

Usage: python3 taxonomy/build_nb_en.py   (from ngo/)
"""
import csv
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# Brand and programme names: true searches, but for one NGO's programme, not the kind of help.
BRAND = re.compile(r'røde ?kors|rødekors|frelsesarm|bymisjon|sanitet|nasjonalforen|\blhl\b|\b4h\b|'
                   r'speider|folkehjelp|mental helse|diabetesforb|fretex|tise|kirkens sos|natteravn|'
                   r'home.?start|matsentral|jus+hjelp|gatejurist|røff|lingdys|myrsnipa|aksept|'
                   r'gatehospital|syng med oss|bolighjelpen|demensforeningen|demensforeninger|'
                   r'møteplassen|norsk folk|\bnks\b|vekst bedrift|hjørnet|brack|salem|stokka|bergans|'
                   r'lumber|gjøvik|byåsen|jekken|vestre aker|oslo|østlandet|rusomsorg vest|tv2|butikken|'
                   r'likepersonslogg|frivilligsentral no|digital leksehjelp no|kors på halsen|ferie for alle|\bapp\b')
# Volume that belongs to another meaning of the words.
EXCLUDE = {
    'matkasser', 'matkasse for 1 person',            # commercial meal-kit subscriptions
    'møteplass skilt',                               # the road sign
    'fosterhjem hund',                               # foster homes for dogs
    'helseopplysninger 16 år',                       # access to health records
    'bostedsløs folkeregisteret',                    # registry status
    'sy og strikkebui', 'sy og strikkedilla',        # shops
    'turvenn app',                                   # an app
    'politisk påvirkning af markedsmekanismen',      # Danish economics
    'mobbeforebygging i et fellesskapsperspektiv',   # a book title
    'mobbeforebygging i et fellesskapsperspektiv nye stemmer i praksis',
    'folkerett', 'humanitær hjelp',                  # international law / overseas aid
    'flyktninger', 'asylmottak',                     # news and policy, not seeking help
    'barnehjem i norge',                             # history and adoption
    'fosterhjemsforeningen',                         # an organisation
    'ensomhet', 'ensom',                             # the feeling, not the service (kept as need terms)
}

# code -> (label_nb, evidence, description_nb, label_en, description_en, terms_en)
L = {
  'rescue_corps': ('Hjelpekorps', 'hjelpekorpset 500 · leteaksjon 500',
    'Frivillige som leter etter savnede og gir førstehjelp i fjellet, i skogen og på sjøen.',
    'Search and rescue', 'Volunteers who search for missing people and give first aid in mountains, forests and at sea.',
    'search and rescue · missing person search · volunteer rescue service'),
  'first_aid_standby': ('Sanitetsvakt', 'sanitetsvakt 50',
    'Frivillige som har førstehjelpsvakt på arrangementer, stevner og konserter.',
    'First-aid cover at events', 'Volunteers who provide first-aid cover at events, sports meets and concerts.',
    'first aid at events · event medical cover'),
  'first_aid_training': ('Førstehjelpskurs', 'førstehjelpskurs 5000 · hlr kurs 500',
    'Kurs i førstehjelp og hjerte-lunge-redning for alle, også gratis kurs og kurs for barn.',
    'First-aid course', 'Courses in first aid and CPR for everyone, including free courses and courses for children.',
    'first aid course · CPR course · free first aid training'),
  'crisis_preparedness': ('Krisehjelp', 'krisehjelp 50 · psykososial støtte 50 · omsorgsberedskap 50',
    'Frivillige som gir omsorg og psykososial støtte til folk som er rammet av en ulykke eller krise.',
    'Support after a crisis', 'Volunteers who give care and psychosocial support to people affected by an accident or crisis.',
    'crisis support · psychosocial support · emergency care volunteers'),
  'elderly_visiting': ('Besøksvenn', 'besøksvenn 500 · ensomhet 5000 (behov)',
    'En frivillig som besøker deg jevnlig, for selskap og en prat — ofte for eldre som er ensomme.',
    'Visiting friend', 'A volunteer who visits you regularly for company and conversation, often for lonely older people.',
    'befriending · visiting service · companionship for older people · loneliness'),
  'meeting_place': ('Møteplass og åpen kafé', 'møteplass 500 · åpen kafe 500 · treffpunkt 500 · aktiviteter for eldre 500',
    'Et åpent sted å treffe andre — kafé, formiddagstreff eller kvinnekafé — der alle er velkomne.',
    'Meeting place and drop-in café', 'An open place to meet others - a café, a morning get-together or a women\'s café - where everyone is welcome.',
    'drop-in café · community café · social meeting place · activities for older people'),
  'volunteer_centre': ('Frivilligsentral', 'frivilligsentral 500',
    'Lokalt senter som kobler folk som vil hjelpe med folk som trenger hjelp, og har egne aktiviteter.',
    'Volunteer centre', 'A local centre that connects people who want to help with people who need help, and runs its own activities.',
    'volunteer centre · volunteering near me'),
  'language_practice': ('Språkkafé og gratis norsktrening', 'språkkafe 500 · gratis norskkurs 500',
    'Øv på å snakke norsk sammen med andre, gratis — språkkafé, språkvenn eller samtalegruppe.',
    'Language café and free Norwegian practice', 'Practise speaking Norwegian with others, free of charge - a language café, a language buddy or a conversation group.',
    'language café · free Norwegian lessons · Norwegian conversation practice · language buddy'),
  'migrant_mentoring': ('Flyktningguide og flyktningvenn', 'flyktningguide 50 · flyktningvenn 50 · hjelp til flyktninger 50 (behov)',
    'En frivillig som hjelper nye i Norge med å finne seg til rette, og aktiviteter på asylmottak.',
    'Refugee guide and refugee friend', 'A volunteer who helps newcomers to Norway settle in, and activities at asylum reception centres.',
    'refugee mentor · refugee buddy · help for refugees · asylum centre activities'),
  'homework_help': ('Leksehjelp', 'leksehjelp 500 · digital leksehjelp 500',
    'Gratis hjelp med lekser, på stedet eller digitalt, for barn og unge.',
    'Homework help', 'Free help with homework, in person or online, for children and young people.',
    'homework help · free tutoring · online homework help'),
  'youth_drop_in': ('Ungdomsklubb og fritidsklubb', 'ungdomsklubb 500 · fritidsklubb 500',
    'Et trygt sted å henge med venner etter skolen, med aktiviteter og voksne til stede.',
    'Youth club', 'A safe place to hang out with friends after school, with activities and adults present.',
    'youth club · youth centre · after-school club for teenagers'),
  'youth_activity_groups': ('Fritidsaktiviteter for barn og unge', 'fritidsaktiviteter barn 500 · speiding 500 · gratis aktiviteter barn 50 (behov)',
    'Faste grupper med friluftsliv, speiding og andre aktiviteter for barn og unge, ofte gratis.',
    'Leisure activities for children and young people', 'Regular groups with outdoor life, scouting and other activities for children and young people, often free.',
    'free activities for children · scouting · youth groups · outdoor activities for kids'),
  'holiday_camps_low_income': ('Sommerleir og gratis ferie', 'sommerleir 500 · ferie for alle 500 · gratis ferie 50 (behov)',
    'Gratis ferieturer og sommerleirer for barn og familier som ikke har råd til ferie.',
    'Summer camp and free holidays', 'Free holiday trips and summer camps for children and families who cannot afford a holiday.',
    'free summer camp · free holidays for low-income families · holiday for children'),
  'family_support': ('Åpen barnehage og familiesenter', 'åpen barnehage 5000 · familiesenteret 500',
    'Treffsteder og støtte for småbarnsfamilier: åpen barnehage, barseltreff, familiesenter og besøk hjemme.',
    'Drop-in playgroup and family centre', 'Meeting places and support for families with young children: drop-in playgroups, baby groups, family centres and home visits.',
    'drop-in playgroup · family centre · parent and baby group · family support'),
  'reading_friend': ('Lesevenn', 'lesevenn 50 · lese for barn 50 (behov)',
    'En frivillig som leser sammen med barn, for leselyst og språk.',
    'Reading friend', 'A volunteer who reads with children, to build a love of reading and language.',
    'reading buddy · reading volunteer · reading to children'),
  'child_welfare': ('Fosterhjem og barnevernstiltak', 'bli fosterhjem 500 · barneverntiltak 50 · tilsyn ved samvær 50',
    'Fosterhjem, barnehjem, samværssteder og andre tiltak for barn som barnevernet har ansvar for.',
    'Foster care and child welfare services', 'Foster homes, children\'s homes, supervised contact centres and other services for children in the care of child welfare.',
    'foster care · become a foster parent · supervised contact · child welfare'),
  'health_information': ('Helseopplysning og mestringskurs', 'helseopplysning 500 · mestringskurs 50 · diabeteskurs 50',
    'Kurs og kunnskap om sykdom og helse — slik at du kan mestre hverdagen med en diagnose.',
    'Health information and self-management courses', 'Courses and information about illness and health, to help you manage everyday life with a diagnosis.',
    'health information · self-management course · patient education · diabetes course'),
  'peer_support': ('Likeperson og støttegruppe', 'likeperson 500 · samtalegruppe 50 · selvhjelpsgruppe 50 · pårørendegruppe 50',
    'Snakk med noen som har vært i samme situasjon — en likeperson eller en støttegruppe.',
    'Peer support and support groups', 'Talk to someone who has been in the same situation - a peer supporter or a support group.',
    'peer support · support group · self-help group · carers\' group'),
  'dementia_support': ('Demensforening og aktivitetsvenn', 'demensforeningen 500 · demensvennlig samfunn 500 · aktivitetsvenn 50',
    'Aktiviteter, aktivitetsvenn og støtte for personer med demens og deres pårørende.',
    'Dementia support and activity friends', 'Activities, an activity friend and support for people with dementia and their families.',
    'dementia support · dementia-friendly activities · dementia activity friend · dementia carers'),
  'physical_activity': ('Trening for eldre og turvenner', 'trening for eldre 500 · turvenner 500 · gåfotball 500',
    'Trim, turgrupper og trening i fellesskap — mange tilbud er laget for eldre.',
    'Exercise for older people and walking groups', 'Exercise classes, walking groups and training together - many are designed for older people.',
    'exercise for older people · walking group · walking football · balance training'),
  'health_services': ('Gratis helsehjelp', 'gratis lege 50 · gratis helsehjelp 50 · helsesenter for papirløse 50',
    'Gratis og lavterskel helsehjelp — lege og sykepleier uten time eller fastlege, også for papirløse.',
    'Free health care', 'Free, low-threshold health care - a doctor or nurse without an appointment or a GP, including for undocumented migrants.',
    'free doctor · free health care · clinic for undocumented migrants · street nurse'),
  'addiction_support': ('Rusbehandling og rusomsorg', 'rusbehandling 500 · rusomsorg 50 · rusproblemer hjelp 50',
    'Behandling, oppfølging og et sted å være for folk med rusproblemer og deres pårørende.',
    'Addiction treatment and support', 'Treatment, follow-up and a place to be for people with drug or alcohol problems and their families.',
    'addiction treatment · drug and alcohol help · rehab · support for families of addicts'),
  'emergency_shelter': ('Akuttovernatting og herberge', 'herberge 500 · akuttovernatting 50 · har ikke sted å bo 50 (behov)',
    'Et sted å sove i natt, for deg som ikke har noe sted å bo.',
    'Emergency night shelter', 'A place to sleep tonight, if you have nowhere to stay.',
    'night shelter · homeless shelter · emergency accommodation'),
  'housing_outreach': ('Bolighjelp for bostedsløse', 'bostedsløs 500 · bolighjelp 50 · oppsøkende arbeid 50',
    'Hjelp til å finne og beholde en bolig, og oppsøkende arbeid blant folk som er bostedsløse.',
    'Housing help and outreach for homeless people', 'Help to find and keep a home, and street outreach among people who are homeless.',
    'help for homeless people · housing support · street outreach'),
  'food_distribution': ('Gratis mat og matutdeling', 'gratis mat 500 · matutdeling 50 · ikke råd til mat 50 (behov)',
    'Gratis matposer, måltider og suppekjøkken for deg som har lite penger til mat.',
    'Free food and food parcels', 'Free food parcels, meals and soup kitchens for people with little money for food.',
    'food bank · free food · food parcels · soup kitchen · free meals'),
  'thrift_shop': ('Bruktbutikk', 'bruktbutikk 50000 · gjenbruksbutikk 5000',
    'Kjøp og lever brukte klær og ting — overskuddet går til organisasjonens arbeid.',
    'Second-hand shop', 'Buy and donate second-hand clothes and goods - the profit funds the organisation\'s work.',
    'charity shop · second-hand shop · thrift store · donate clothes'),
  'work_inclusion': ('Arbeidstrening og arbeidspraksis', 'arbeidstrening 500 · arbeidspraksis 500 · arbeidsinkludering 500',
    'Arbeidstrening, praksisplass og oppfølging for deg som står utenfor arbeidslivet.',
    'Work training and job placement', 'Work training, job placements and follow-up for people outside the labour market.',
    'work training · job placement · supported employment · help to find work'),
  'legal_aid': ('Gratis rettshjelp', 'fri rettshjelp 5000 · gratis rettshjelp 500 · gratis advokat 500 (behov)',
    'Gratis juridisk hjelp — råd, hjelp med klager og representasjon — for deg som ikke har råd til advokat.',
    'Free legal aid', 'Free legal help - advice, help with appeals and representation - if you cannot afford a lawyer.',
    'free legal aid · free lawyer · legal advice clinic'),
  'legal_witness_support': ('Vitnestøtte', 'vitnestøtte 50 · vitne i retten 50 (behov)',
    'Støtte og informasjon før og under rettssaken når du skal vitne.',
    'Witness support', 'Support and information before and during the trial when you are a witness.',
    'witness support · court witness service'),
  'prison_reintegration': ('Nettverk etter soning', 'nettverk etter soning 500',
    'En frivillig og et nettverk som hjelper deg i gang med livet etter løslatelse — og støtte til innsattes barn.',
    'Support after prison', 'A volunteer and a network to help you restart your life after release - and support for prisoners\' children.',
    'support after prison · prisoner reintegration · ex-offender mentoring'),
  'crisis_helpline': ('Hjelpetelefon og chat', 'hjelpetelefon 500 · selvmordstanker hjelp 50 (behov)',
    'Ring eller chat anonymt med noen når du trenger å snakke — hele døgnet for mange av tjenestene.',
    'Helpline and chat', 'Call or chat anonymously with someone when you need to talk - many services are open around the clock.',
    'helpline · crisis line · anonymous chat · suicide helpline'),
  'crisis_shelter': ('Krisesenter', 'krisesenter 5000 · vold i nære relasjoner 500 (behov)',
    'Et trygt sted og hjelp for deg som er utsatt for vold i nære relasjoner eller menneskehandel.',
    'Crisis shelter and support after violence', 'A safe place and help if you are exposed to domestic violence or human trafficking.',
    'crisis shelter · women\'s refuge · domestic violence help'),
  'bullying_prevention': ('Hjelp mot mobbing', 'ingen målbar søkemengde',
    'Forebygging av mobbing og støtte til barn som blir mobbet.',
    'Help against bullying', 'Bullying prevention and support for children who are bullied.',
    'anti-bullying · help for bullied children'),
  'street_mediation': ('Nattevandring og gatemegling', 'nattevandring 50 · gatemegling 50',
    'Voksne som går i gatene om kvelden for trygghet, og megling når unge havner i konflikt.',
    'Night patrols and street mediation', 'Adults who walk the streets in the evening to keep things safe, and mediation when young people end up in conflict.',
    'night patrol · street mediation · youth conflict mediation'),
  'music_choir': ('Kor og korps', 'synge i kor 50 · hornorkester 50',
    'Syng i kor eller spill i korps og musikkgruppe — for alle, også nybegynnere.',
    'Choir and brass band', 'Sing in a choir or play in a brass band or music group - for everyone, beginners too.',
    'choir · community choir · brass band · music group'),
  'creative_crafts': ('Strikkekafé og hobbygruppe', 'strikkekafe 500 · hobbygruppe 50',
    'Strikk, sy og lag ting sammen med andre.',
    'Knitting café and craft group', 'Knit, sew and make things together with others.',
    'knitting group · craft group · sewing circle'),
  'worship_open_church': ('Gudstjeneste og åpen kirke', 'gudstjeneste 5000 · åpen kirke 50',
    'Gudstjenester, bønn og åpne kirker der du kan tenne et lys eller snakke med noen.',
    'Church services and open church', 'Church services, prayer and open churches where you can light a candle or talk to someone.',
    'church service · open church · prayer'),
  'political_advocacy': ('Politisk påvirkning', 'politisk påvirkning 50 · påvirkningsarbeid 50 · humanitær rett 50',
    'Organisasjonens arbeid for å endre lover og politikk, og opplysning om humanitær rett.',
    'Advocacy', 'The organisation\'s work to change laws and policy, and education about humanitarian law.',
    'advocacy · campaigning · humanitarian law'),
}

FAMILY_EN = {}  # label_en comes from families.csv; checked below


def main():
    cats = [r for r in csv.DictReader(open(os.path.join(HERE, 'categories-v2.csv'))) if r['status'] == 'active']
    fams = {r['code']: r for r in csv.DictReader(open(os.path.join(HERE, 'families.csv')))}
    terms = {}
    for r in csv.DictReader(open(os.path.join(HERE, 'search-terms-validated.csv'))):
        terms.setdefault(r['code'], []).append(r)
    missing = {c['code'] for c in cats} - set(L)
    if missing or set(L) - {c['code'] for c in cats}:
        sys.exit(f'labels out of step with categories-v2.csv: {missing or set(L) - {c["code"] for c in cats}}')

    def ranked(code, intents):
        seen, out = set(), []
        rows = sorted(terms.get(code, []), key=lambda r: -float(r['band_mid'] or 0))
        for r in rows:
            t = r['term'].strip().lower()
            if (r['intent'] not in intents or r['other_meaning'] == 'yes' or t in EXCLUDE
                    or BRAND.search(t) or t in seen or float(r['band_mid'] or 0) < 50):
                continue
            seen.add(t)
            out.append(f"{t} ({int(float(r['band_mid']))})")
        return ' | '.join(out)

    # Every "term band" in an evidence string must be in the validated file with that band.
    band = {}
    for code, rs in terms.items():
        for r in rs:
            band.setdefault(r['term'].strip().lower(), set()).add(int(float(r['band_mid'] or 0)))
    wrong = []
    for code, v in L.items():
        for part in v[1].split(' · '):
            m = re.match(r'(.+?) (\d+)(?: \(behov\))?$', part.strip())
            if not m:
                continue
            t, b = m.group(1).lower(), int(m.group(2))
            if b not in band.get(t, set()):
                wrong.append(f'{code}: "{t}" {b} (data: {sorted(band.get(t, [])) or "not measured"})')
    if wrong:
        sys.exit('evidence does not match search-terms-validated.csv:\n  ' + '\n  '.join(wrong))

    rows = []
    for c in cats:
        label_nb, evidence, desc_nb, label_en, desc_en, terms_en = L[c['code']]
        f = fams[c['family_code']]
        rows.append({
            'family_code': c['family_code'], 'family_nb': f['label_nb'], 'family_en': f['label_en'],
            'code': c['code'],
            'label_nb': label_nb, 'label_nb_evidence': evidence, 'description_nb': desc_nb,
            'search_terms_nb': ranked(c['code'], {'label', 'alternative', 'autocomplete', 'discovered'}),
            'need_terms_nb': ranked(c['code'], {'need'}),
            'volunteer_terms_nb': ranked(c['code'], {'volunteer'}),
            'label_en': label_en, 'description_en': desc_en, 'terms_en': terms_en, 'en_measured': 'no',
            'search_entry': c['search_entry'], 'previous_label_nb': c['label_nb'] if c['label_nb'] != label_nb else '',
        })
    out = os.path.join(HERE, 'taxonomy-nb-en.csv')
    with open(out, 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    fout = os.path.join(HERE, 'taxonomy-nb-en-families.csv')
    with open(fout, 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=['code', 'label_nb', 'label_en', 'sort_order'])
        w.writeheader()
        for f in sorted(fams.values(), key=lambda f: int(f['sort_order'])):
            w.writerow({k: f[k] for k in ['code', 'label_nb', 'label_en', 'sort_order']})
    changed = sum(1 for r in rows if r['previous_label_nb'])
    print(f'{len(rows)} categories in {len(fams)} families -> {os.path.relpath(out)}; '
          f'{changed} Norwegian labels changed to searched terms')


if __name__ == '__main__':
    main()
