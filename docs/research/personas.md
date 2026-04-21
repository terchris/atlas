# Personas

This document defines the people who might use the app we're building. It pairs with `goal.md` (which says what we're trying to do) by naming who we're trying to do it *for*.

The goal document established that this is an **organisation-neutral public-facing app** serving Norway's NGO sector as a whole — so the personas are people engaging with the **sector**, not with one specific organisation. Some might arrive with a preferred NGO in mind; most don't. The app's job is to help them find the fit regardless of which way they enter.

This file groups personas into three tiers:

- **Primary personas** — the public-facing users who most directly shape v1. Every flow should serve at least one of them.
- **Secondary personas** — internal NGO staff and volunteers at any organisation. The app serves them, but the UX is not optimised for them in v1.
- **Tertiary personas** — users who'll land on the app less frequently, or who need a specific path they shouldn't be funnelled into the generic engagement flow. Still real users, still served — just with different needs and often a different destination from the main chapter-finder experience.

All 16 personas are people we plan to serve. No one is excluded — we just prioritise.

Each persona has:
- A name and short label
- A one-paragraph sketch of who they are
- What they want when they arrive
- What would make them bounce
- What success looks like for them
- Which ideas from the working docs speak most directly to them

---

## How to use this document

Three rules of thumb:

1. **Primary personas set the default flow.** The landing page and chapter detail views are designed around them. Every v1 feature should serve at least one primary persona directly.
2. **Secondary and tertiary personas get dedicated paths.** They don't get the spotlight, but they do get a deliberate answer to their question — a section, a page, a routing decision — not just "hope they figure it out."
3. **When in doubt, side with the less technical persona.** The audience skews toward "not a power user." Our bar for clarity and friction should be set by Kari (below), not by someone comfortable with filters and maps.

The six-barrier framework from `sector-research.md` (knowledge, time, culture, accessibility, economy, follow-up) applies across these personas. Our copy should recognise barriers without patronising.

---

## Primary personas — public-facing

These are the people the app is being built for. They all arrive without context, without an account, usually on a phone, often without a preferred organisation in mind.

### 1. Kari — "I want to help, somehow"

**Late 40s, lives in a mid-sized kommune, works part-time, kids are older now.** She's aware of several humanitarian and social organisations — Røde Kors, Norsk Folkehjelp, Kirkens Bymisjon, Sanitetskvinnene, Nasjonalforeningen — but has never been involved with any of them. A week ago she saw a news segment about loneliness among elderly and thought *"I could do something about that."* She Googles "frivillig besøksvenn" or "hjelpe eldre ensomhet" and lands on our app.

**What she wants:** to discover that multiple organisations offer relevant activities near her, understand what "visiting lonely elderly" actually looks like at each (Red Cross Besøkstjeneste? N.K.S. omsorg? Kirkens Bymisjon Gatenær? a kommunal scheme?), and find a specific human at one of them to talk to. She doesn't know that "Besøkstjeneste" is the canonical name; she just wants "to visit lonely old people."

**What makes her bounce:**
- Being forced to pick an organisation before she's understood what each one offers
- A long chapter dropdown from one org, or separate websites for every org she's heard of
- A wall of Norwegian bureaucratic vocabulary
- A form that asks for personnummer before she's decided anything
- Ambiguity about what she'd actually be doing day to day

**Success looks like:** she ends up with the name, email and phone number of the coordinator for a specific "visit lonely elderly" activity near her — at whichever organisation actually offers it best in her kommune — and she feels the app helped her compare, not made the choice for her.

**Ideas that serve her:** Activity-first finder, Volunteer matchmaker quiz, Enriched chapter pages across organisations, Multilingual activity discovery.

---

### 2. Jonas — "I want to donate, but meaningfully"

**Mid-30s, Oslo, software engineer, no kids.** He already gives to a couple of causes via fastgiver. Someone mentioned Grasrotandelen over lunch. He wants to understand: if he gives to a Norwegian NGO, where does the money go, which ones are more efficient, which get state money versus private donations, and can he direct giving somewhere specific — his hometown, a specific activity, a particular organisation?

**What he wants:** transparency across organisations. How much each raises, what fraction goes to the cause versus admin, how government-funded vs donor-funded they are, how local giving works. Concrete choices — give to Norwegian Red Cross, Norsk Folkehjelp, Kreftforeningen, his local Sanitetskvinner-chapter, a specific activity line (Hjelpekorps, refugee work) — with numbers he can compare.

**What makes him bounce:**
- Vague "every kroner matters" language with no real numbers
- Only one donation path from only one organisation
- Signing up for fastgiver before he's seen a single number
- NGO-specific pages that can't be compared side-by-side
- Missing or stale financial data (the Årsrapport is a PDF, Innsamlingskontrollen numbers lag)

**Success looks like:** he ends up on Grasrotandelen with his chosen chapter's org number pre-filled, or on an organisation's fast-giver signup, having seen exactly what 93%-to-cause means across three or four comparable organisations and which ones match his values best.

**Ideas that serve him:** Compare organisations, Give-local across NGOs, Chapter campaign generator, Coverage-gap explorer, funding-transparency sections.

---

### 3. Amira — "I just arrived and I need people"

**Late 20s, arrived in Norway last year on a refugee residency, lives in a small kommune where housing was available.** She has basic Norwegian, speaks Arabic at home, and is trying to build a social network. Someone at introduksjonsprogrammet mentioned that *"the Red Cross, or Folkehjelp, or the church"* all run language practice and integration groups — she isn't sure which is active in her town.

**What she wants:** to know, concretely, which organisations in her town run what activity when, where, and who to contact. She's nervous about showing up to the wrong place or contacting the wrong person. She doesn't care which NGO it is — she cares that the språkkafé meets every Tuesday at 18:00 at Kulturhuset and that she knows the coordinator's name.

**What makes her bounce:**
- A website in only Norwegian with complex sentences
- Activity descriptions in abstract language ("community building") rather than concrete ("we meet every Tuesday at 18:00 at Kulturhuset to practice Norwegian together")
- No photos of what the activity actually looks like
- Contact info that's only a generic email, not a person's name and phone
- Having to check three separate NGO websites to compile a list

**Success looks like:** she has a specific address, time, coordinator name and phone number for her nearest språkkafé — regardless of whether it's Red Cross Norsktrening, Folkehjelp Språkkafé, Kirkens Bymisjon, or a kommunal offering — and she feels okay texting that person.

**Ideas that serve her:** Activity-first across organisations, Enriched chapter pages, Multilingual activity discovery.

---

### 4. Lars — "I'm worried about my parents out there"

**Mid-50s, lives in Oslo, parents live in a small coastal kommune.** A storm warning hit his parents' area. He wants to know: is there local help nearby? Who responds — Red Cross Hjelpekorps, Norsk Folkehjelp Sanitet, Redningsselskapet, or the kommune? Who could his parents call?

**What he wants:** at-a-glance situational awareness for a specific kommune. What's the warning, who's responding (any rescue-capable NGO in the area), who's the nearest contact person, and what's the phone number his parents can call if they need help. He doesn't care which organisation responds — he cares that someone does and that there's a named human on the other end.

**What makes him bounce:**
- Anything that takes more than three clicks
- Generic "Norway is prepared" copy with no specific local information
- Links to PDFs, regional reports, or campaign pages when what he needs is "who answers the phone in Flekkefjord tonight"
- A one-org view that ignores the other rescue-capable NGOs in the area

**Success looks like:** he sees the weather warning on a map, sees rescue-capable chapters across organisations in the area, has a phone number for a local leader at whichever is closest, and can text that number or forward to his parents in under a minute.

**Ideas that serve him:** Storm mode (cross-org), Storm response giving, Preparedness compass, Enriched chapter pages.

---

### 5. Tone — "I might join a chapter / I'm a board member"

**Early 60s, retired teacher, lives in a kommune where the Red Cross chapter is dormant but the Nasjonalforeningen helselag is active and the N.K.S. forening is strong.** She's been asked — by different people at different organisations — whether she'd consider board work. She wants to compare what being on the board of each of them actually means: activity portfolio, member base, time commitment, organisational culture.

**What she wants:** to browse and compare across organisations. She wants to look at a dozen nearby chapters of three or four different NGOs, see what they do, who runs them, how long they've been around, whether they seem to be thriving. Essentially a cross-organisational reference library with the detail to tell her not just *which org* but *which specific chapter* would be the right place for her.

**What makes her bounce:**
- A site designed for "find one chapter at one org" that makes cross-org browsing hard
- No historical depth (founding dates, heritage, chapter vitality trends)
- No way to see a chapter's board or leadership
- No sense of how the activity mix differs across organisations

**Success looks like:** she's visited a dozen chapter pages across four organisations, has a mental model of what a healthy chapter looks like in each, knows which chapters near her are most active, and has the district contact number at the organisation she's leaning toward.

**Ideas that serve her:** Chapter Explorer map, Compare chapters (same or cross-org), Time-travel mode, Anniversary radar, Memorial view, Chapter vitality score, Chapter Genesis.

---

### 6. Ola — "I want to see the numbers"

**Late 30s, journalist / researcher / student / involved citizen — could be any of these.** He's interested in how Norwegian civil society works as a sector: scale, funding, geographic distribution, history, activities, coverage gaps, which organisations cluster where. Maybe he's writing an article about NGO efficiency, maybe he's a civil-society researcher, maybe he's just curious. The audience at the tail end of public-facing.

**What he wants:** facts, data, context across the sector. "How many chapters of each organisation? What's the sector's total economy (4.7% of mainland GDP, see `sector-research.md`)? How much comes from state grants versus private donations? How is coverage distributed geographically? Where are the gaps?"

**What makes him bounce:**
- Marketing copy in place of data
- PDF-only sources (Årsrapport is the main example)
- Numbers without citations or links to originals
- Single-org framing when he needs cross-org comparisons

**Success looks like:** he finds clear, comparable answers, with sources, and a path into deeper data. The app becomes a resource he cites or shares. Bonus: he becomes a repeat visitor because it's the only place he can see this data in one coherent view.

**Ideas that serve him:** Coverage-gap explorer, Activity Atlas, Time-travel, News aggregator, funding-transparency features, sector-wide API attribution.

---

## Secondary personas — internal / staff

These are real people inside the NGOs themselves — we might hear from them, the app might evolve to serve them, but v1 is not for them. Named here so we remember they exist and don't accidentally close doors. They're organisation-agnostic: any of them could work at any NGO in Norway.

### 7. Inger — chapter leader
**The volunteer leader of a mid-sized lokalforening at any NGO.** Spends evenings on org work. Cares deeply about her chapter, less about national strategy. She might use our app to see how her chapter looks to the public, spot errors in the scraped or API data, or compare her activity mix to nearby chapters at her own organisation or at similar NGOs. She's not the audience for features she'd have to log in to use.

### 8. Arne — district coordinator
**Paid staff at a district office at any NGO.** Oversees 10–30 chapters, supports their operations, runs recruitment campaigns. Would find the coverage-gap explorer and cross-organisational chapter comparison genuinely useful as planning tools. Likely among the first internal users we'd hear from if the app got attention.

### 9. Signe — national office planner
**Works on strategy at a national office.** Already has internal tools; possibly has access to Samfunnspuls or equivalent. Our app is useful to her only if it shows her something internal tools don't — the chapter overlay at her own organisation, the competitor/collaborator overlay across organisations, or public-audience framing she can point external stakeholders to.

### 10. Mette — emergency response coordinator
**Runs beredskap training and real-event coordination for a region** — whether at Red Cross Hjelpekorps, Norsk Folkehjelp Sanitet, Redningsselskapet, or cross-organisational. The one whose work most benefits from the storm mode idea. Would want a version with additional capabilities (crisis rehearsal, phone trees, operational status across orgs) beyond what we'd build in a public app.

### 11. Lisa — tilskuddsansvarlig

**Late 30s, works at an NGO's district or national office** — could be Red Cross, Norsk Folkehjelp, N.K.S., Nasjonalforeningen, Kreftforeningen, Kirkens Bymisjon, or any other Tier A organisation. Her title varies — tilskuddsansvarlig, søknadsansvarlig, fagansvarlig, organisasjonsutvikler — but her job is the same: find funding the organisation can apply for, evaluate fit, draft applications that cite real need data, track outcomes. At larger NGOs she's full-time; at smaller ones she combines this with other duties. She's the primary internal user of Samfunnspuls-style need data at Red Cross and has direct analogues at every other Tier A NGO.

**What she wants:** a single place to see **what grant calls are currently open** across all the sources she tracks today — directorates (Bufdir, Helsedirektoratet, Kulturrådet, Miljødirektoratet, Norad, IMDi, KS), foundations (Stiftelsen Dam, Gjensidigestiftelsen, Sparebankstiftelsen DNB, Fritt Ord), EU Funding & Tenders Portal, Frivillighet Norge's tilskuddskatalog, plus kommunale and fylkeskommunale calls. Filter by deadline, purpose, eligibility, and typical award size. Match against her organisation's actual activity profile so the list isn't drowned in irrelevant noise. Pull in kommune-level need indicators so she can write a stronger application. See historical award patterns — who won this ordning last year, average success rate, typical amount — so she can scope realistically.

**What makes her bounce:**
- A raw retrospective list of every grant ever awarded — useful for benchmarking, but doesn't tell her what's open now
- Per-agency portals with no cross-cut — she's already checking 15 sites and doesn't want a 16th
- No way to filter by her organisation's activity profile
- Missing deadlines because new calls publish without aggregation
- Generic templates with no need-data integration

**Success looks like:** she opens the app on a Monday morning, sees three open calls that match her organisation's activity mix with deadlines in the next 60 days, clicks through to each directorate's own portal pre-informed about the ordning's history, and files stronger, faster applications. Over a year, more wins per hour spent.

**Ideas that serve her:** **Tilskuddsmatcher** (the central feature for her — see `goal.md` extensions), Coverage-gap explorer (produces evidence for applications), historical award patterns from `tilskudd.lottstift.no`, Compare organisations (to benchmark positioning), alerts for new calls matching her org's profile.

---

## Design implications — what the primary/secondary tier tells us

A few consequences for v1, written down so we don't drift:

**1. The app has to work for someone arriving cold, on a phone, in Norwegian, without a preferred organisation.** This is Kari and Amira's default. If the app requires multiple context-setting moves before it's useful, it's too complex. The fastest path from landing page to "here's what I need" wins.

**2. Every chapter detail view is trying to serve at least four personas at once.** Kari wants to volunteer; Jonas wants to donate; Amira wants an address and a time; Tone wants a reference view. The page has to accommodate all of them without becoming cluttered. A tabbed or section-based layout — "What we do / How to help / How to reach us / History / Funding" — probably works better than one long wall of everything.

**3. Rich detail and simple entry aren't in tension as long as we order them right.** Landing page = simple and org-agnostic. Chapter detail = rich. Advanced cross-org features (compare, time-travel, coverage-gap maps) = one click behind an "Utforsk mer" link, so they don't clutter the main flow but aren't hidden either.

**4. Ola and Tone are the reason deep scraping and cross-org normalisation pay off.** Kari, Jonas, Amira and Lars mostly need what each organisation's public data gives us, normalised. But the browsing-and-comparing personas genuinely depend on scraped activity details, news, coordinator contacts, history across organisations. That's why the scrape-deep-then-normalise architecture matters.

**5. Internal personas are the target for v2.** If v1 lands well with the public, the natural next move is an internal-tool layer — coverage strategist, vitality dashboard, crisis rehearsal — that reuses the same data and would be useful to Arne, Mette and Signe at any organisation. Mentioning them here keeps that door open.

---

## Tertiary personas — niche audiences we also serve

Real users with needs the primary/secondary flows don't cover well. They get deliberate paths, not fallbacks.

### 12. Magnus — existing active volunteer

**Mid-30s, active volunteer at a rescue-capable NGO for six years.** He uses his organisation's internal tools (Mitt Røde Kors, Folkehjelpens portal, or similar) regularly for shifts and internal comms, but he'll also land on our public app — to show it to a prospective recruit, to check how his chapter looks to the outside world, to verify that contacts and activities are rendered correctly, and to see how his chapter compares to neighbouring ones at his own organisation or at peer NGOs. He's a quality-control user as much as a consumer.

**What he wants:** to see his chapter rendered well for the public audience, to compare it against neighbouring chapters (same org and across orgs), and ideally to flag errors he spots in the scraped or aggregated data.

**What makes him bounce:**
- Data that contradicts what he knows (e.g. an activity listed that's been discontinued, or a leader name that's wrong)
- No way to report inaccuracies
- The app pretending to replace his organisation's internal tools — he already has those

**Success looks like:** he sends the chapter URL to someone considering joining and it tells the right story. When he notices something wrong, there's a clear "meld feil" or "kontakt kapitlet" path routed to the correct organisation.

**Ideas that serve him:** Enriched chapter pages, Compare chapters, Chapter vitality score (read-only public version), News aggregator, Meld feil.

---

### 13. Henrik — corporate partnership lead

**Director at a mid-sized Norwegian company.** His CEO wants the company to do something meaningful as an ESG commitment and hasn't pre-committed to an organisation. He needs to understand the partnership landscape across NGOs: who does what where, which organisations are near his offices, what each would need, what a region-by-region engagement might look like, and how his company's sector footprint maps onto NGO need.

**What he wants:** a macro view (what the Norwegian NGO sector looks like at scale — 4.7% of GDP, 142 000 årsverk, funding composition) plus a local view (which chapters of which organisations are near his four Nordic offices, what they'd need, what a multi-org partnership might look like). He then wants the right human to talk to — per organisation, or via a single intake.

**What makes him bounce:**
- A page that treats him like a private donor with a credit card
- No sense of scale or scope — just feel-good language
- No clear "kontakt bedriftssamarbeid" path per organisation
- No way to scope engagement geographically across orgs (he has offices in four cities; he needs regional context across multiple NGOs)

**Success looks like:** he has a clear mental model of the Norwegian NGO sector's scale, footprint and funding, has named chapters of specific organisations near his offices, and has a direct path to a partnerships contact at whichever organisations he wants to engage — or at a curated few.

**Ideas that serve him:** Corporate partnership storytelling, Compare organisations, Coverage-gap explorer (to identify where his company's offices overlap with unmet need), For bedrifter page with per-org routing.

---

### 14. Åse — person in acute crisis

**Any age, any place. She's in acute distress right now.** Her house has just flooded, she's being abused at home, she's contemplating suicide, or she's caring for someone in crisis. She types "hjelp", "noen å snakke med", or "Røde Kors hjelp" into Google and lands on our app.

**What she wants:** the right number to call, right now. Not sector-structural overview. Not the nearest chapter's weekly BARK schedule. A phone number, visible, immediately.

**What makes her bounce:**
- Having to scroll, click, or navigate
- A page full of volunteer signups and donation buttons when what she needs is a helpline
- Crisis information in the footer or behind a link

**Success looks like:** within three seconds of landing on any page of the app, she can see — visibly, persistently, not buried — the appropriate emergency and helpline numbers. The helplines are sector-wide, owned by no single NGO:
- 113 (ambulance), 112 (police), 110 (fire)
- Mental Helse: 116 123
- Kirkens SOS: 22 40 00 40
- Kors på halsen (for young people): 800 33 321
- Alarmtelefonen for barn og unge: 116 111
- Others relevant to the specific context (tvangsekteskap, overgrep, vold i nære relasjoner — each has its own helpline across multiple providers)

And if her need maps to a specific NGO service, the app tells her so clearly without forcing her to navigate.

**Ideas that serve her:** a **persistent crisis band** on every page — a small, always-visible component, readable at a glance, sector-wide (not organisation-branded). This is arguably the single most important non-negotiable UX element in the app. Storm mode also serves her directly (if her crisis is a weather event).

---

### 15. Dev — developer exploring Norwegian civil-society data

**Norwegian or international software engineer, curious about public data on the Norwegian NGO sector.** Maybe they're considering building something themselves — for a school project, a hackathon, a proposal, or another civil-society tool. They want to see what the available data can do and what a reference implementation using it looks like.

**What they want:** an "Om dataene og teknologien" page or similar — what data sources this app uses (Red Cross Organizations API, scrape of folkehjelp.no, Brreg, Lottstift, Innsamlingskontrollen, SSB, FHI, Bufdir, IMDi, Kartverket, NVE, met.no), what each contributes, what the scrape cadence is, where to find the original sources. A link to our GitHub repo, links to the relevant registry portals, and enough context that they could build on the same stack.

**What makes them bounce:**
- No technical details at all (they can't tell what the app is built on)
- Mysterious data provenance — they can't tell if what they're looking at is authoritative
- Per-organisation attribution missing — they can't tell what came from where

**Success looks like:** they end up on our GitHub, skim the code, and come away thinking *"this is a good reference for how to build on Norwegian civil-society data."* Bonus: they cite or star the repo, or build their own thing using it as a template.

**Ideas that serve them:** a lightweight "Om appen / Om dataene" section. Clear attribution on every page showing which data source powered each view. Open-source repo prominently linked.

---

### 16. Sara — 15-year-old interested in youth activities

**Early teens, heard about youth activities from a school assembly, a friend, or social media** — could be RØFF, BARK, 4H, Speidergrupper, Sanitetsungdom, Solidaritetsungdom, Kors på halsen. She wants to find one or more that might suit her, regardless of which organisation runs it. She doesn't know that RØFF is Red Cross or that 4H is rural — she just wants to know what kids her age do.

**What she wants:** clear information about youth activities across organisations — ages, times, places, what to expect, whether a parent needs to be involved, whether it's free. She wants to recognise herself in the content (photos of people her age, not middle-aged volunteers).

**What makes her bounce:**
- Adult-focused photography and language
- Forms that ask for her personnummer and payment details
- Unclear rules about age or parental consent
- A signup flow that assumes she's an adult making autonomous decisions
- One-org views when she doesn't know which org offers what

**Success looks like:** she finds her local youth activity — regardless of which NGO runs it — knows exactly what to expect, and has a clear next step that feels welcoming, not bureaucratic.

**Ideas that serve her:** Activity Atlas with age filters; activity pages that clearly mark age ranges and parental-consent requirements; a "For ungdom" section or tag that cuts across organisations. Kors på halsen as a visible resource for youth who aren't looking to volunteer but might need someone to talk to.

---

## Design implications from the tertiary personas

Three things these additional personas add that the primary six don't:

**1. The crisis band is non-negotiable and organisation-neutral.** Åse's needs trump every other layout decision. An always-visible component with sector-wide helpline numbers is the first thing we build, before any chapter finder.

**2. We need a "meta" layer the app wears lightly.** Magnus wants to flag errors in any organisation's data. Dev wants to see what's under the hood across all data sources. Henrik wants a cross-org partnerships path. None of this is the primary flow, but all of it can be addressed with 2–3 supporting pages and a consistent footer or "Om appen" section.

**3. Youth-coded and language-coded content needs filters, not just tags.** Sara and Amira both benefit from age-appropriate and language-appropriate filtering of activities **across organisations**. This isn't a separate app — it's filter chips on the Activity Atlas, age labels on activity cards, and thoughtful signposting that cuts across organisational silos.

---

## Stance on what we'll do to serve these personas

A few decisions that shape what "in scope" means for the project:

**Scraping is fully in scope, per organisation.** We'll scrape whatever we need from each organisation's public website and related registries, and store it locally if helpful for performance or resilience. This is how we surface the activity-level detail, coordinator contacts, photos and news that make chapter pages useful to Kari, Amira, Tone, Magnus — regardless of which NGO. Cache invalidation and respectful crawl rates are implementation concerns — not scope restrictions.

**Public information is fair to harvest, subject to each source's terms.** If it's published on a public Norwegian NGO website, or held in a public registry (Brreg, Lottstift, Innsamlingskontrollen, SSB, FHI, Bufdir, IMDi, etc.), we can pull it in and display it. We use it for its intended purpose — helping people engage with the sector — not repurpose it for unrelated ends, and we credit the source on every view.

**The app is organisation-neutral.** No single NGO's branding dominates. Each organisation's content appears in a consistent app chrome, with its own logo and identity shown where appropriate (on chapter cards, in attribution) but not as the frame. The shared chrome uses Digdir Designsystemet — the neutral Norwegian public-sector design foundation. We are a portal, not a reskin of any one organisation.
