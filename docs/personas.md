# Personas

This document defines the people who might use the app we're building. It pairs with `goal.md` (which says what we're trying to do) by naming who we're trying to do it *for*.

The goal document established that this is a **public-facing app** — so the personas skew toward the general public, but Red Cross operates at the intersection of many audiences. This file groups personas into three tiers:

- **Primary personas** — the public-facing users who most directly shape v1. Every flow should serve at least one of them.
- **Secondary personas** — internal Red Cross staff and volunteers. The app serves them, but the UX is not optimized for them in v1.
- **Tertiary personas** — users who'll land on the app less frequently, or who need a specific path they shouldn't be funneled into the generic volunteer/donor flow for. Still real users, still served — just with different needs and often a different destination from the main chapter-finder experience.

All 15 personas in this document are people we plan to serve. No one is excluded — we just prioritize.

Each persona has:
- A name and short label
- A one-paragraph sketch of who they are
- What they want when they arrive
- What would make them bounce
- What success looks like for them
- Which ideas from `ideas.md` speak most directly to them

---

## How to use this document

Three rules of thumb:

1. **Primary personas set the default flow.** The landing page and chapter detail views are designed around them. Every v1 feature should serve at least one primary persona directly.
2. **Secondary and tertiary personas get dedicated paths.** They don't get the spotlight, but they do get a deliberate answer to their question — a section, a page, a routing decision — not just "hope they figure it out."
3. **When in doubt, side with the less technical persona.** The Red Cross audience skews toward "not a power user." Our bar for clarity and friction should be set by Kari (below), not by someone comfortable with filters and maps.

---

## Primary personas — public-facing

These are the people the app is being built for. They all arrive without context, without an account, usually on a phone.

### 1. Kari — "I want to help, somehow"

**Late 40s, lives in a mid-sized kommune, works part-time, kids are older now.** She's heard of Red Cross her whole life but has never been involved. A week ago she saw a news segment about loneliness among elderly and thought *"I could do something about that."* She Googles "Røde Kors frivillig" and lands on our app.

**What she wants:** to discover that there's a local chapter near her, that it does things she could actually do, and that there's a specific human she could talk to. She doesn't know what "Besøkstjeneste" is called; she just wants "to visit lonely old people."

**What makes her bounce:**
- A 400-item dropdown (which is what she'd hit on mittrodekors.no today)
- A wall of Norwegian bureaucratic vocabulary
- A form that asks her for her personnummer before she's decided anything
- Ambiguity about what she'd actually be doing day to day

**Success looks like:** she ends up with the name, email, and phone number of the coordinator for her local Besøkstjeneste — or she clicks through to the signup form with her chapter and activity already pre-filled.

**Ideas that serve her:** Chapter Finder, Enriched chapter pages, Volunteer matchmaker quiz, Activity Atlas, Multilingual activity discovery.

---

### 2. Jonas — "I want to donate, but meaningfully"

**Mid-30s, Oslo, software engineer, no kids.** He already gives to a couple of causes via fastgiver. Someone mentioned Grasrotandelen over lunch. He wants to understand: if he gives to Red Cross, where does the money go, and can he direct it somewhere specific, like his hometown or a specific program.

**What he wants:** transparency — how much Red Cross raises, what fraction goes to the cause, what fraction to admin, how local giving actually works. Concrete choices: "give to Røde Kors nationally" vs. "give to my local chapter" vs. "give to Hjelpekorps specifically."

**What makes him bounce:**
- Vague "every kroner matters" language with no real numbers
- Only one donation path (he wants to compare)
- Signing up for fastgiver before he's seen a single number
- The current rodekors.no/stott-arbeidet page is better than most, but still doesn't explain the local vs. national split well

**Success looks like:** he ends up on Grasrotandelen with his local chapter's org number pre-filled, or on Vipps 2272 having seen what 90%-to-formål actually means.

**Ideas that serve him:** Give local (flipping the default), Chapter campaign generator, Memorial gifts done right, Activities-directed giving, anything that surfaces the tilskudd / funding breakdown transparently.

---

### 3. Amira — "I just arrived and I need people"

**Late 20s, arrived in Norway last year on a refugee residency, lives in a small kommune where housing was available.** She has basic Norwegian, speaks Arabic at home, and is trying to build a social network. Someone at introduksjonsprogrammet told her Red Cross runs Flyktningguide and Språkkafé.

**What she wants:** to know, concretely, whether her town has these activities, when they meet, where, who to contact. She's nervous about showing up to the wrong place or contacting the wrong person.

**What makes her bounce:**
- A website in only Norwegian with complex sentences
- Activity descriptions in abstract language ("community building") rather than concrete ("we meet every Tuesday at 18:00 at Kulturhuset to practice Norwegian together")
- No photos of what the activity actually looks like
- Contact info that's only a generic chapter email, not a person's name and phone

**Success looks like:** she has a specific address, time, coordinator name, and phone number for her nearest Språkkafé, and she feels okay texting that person.

**Ideas that serve her:** Enriched chapter pages (scraped activity details), Multilingual activity discovery, Flyktningguide match map (indirectly, by making sure supply/demand match), Accessibility-first chapter cards.

---

### 4. Lars — "I'm worried about my parents out there"

**Mid-50s, lives in Oslo, parents live in a small coastal kommune.** A storm warning hit his parents' area. He wants to know: is there local help nearby? Is Red Cross doing something there? Who could his parents call?

**What he wants:** at-a-glance situational awareness for a specific kommune. What's the warning, where is the nearest Hjelpekorps-capable chapter, is there a number his parents can call if they need help.

**What makes him bounce:**
- Anything that takes more than three clicks
- A generic "Red Cross is here to help" page with no specific local information
- Links to PDFs, regional reports, or campaign pages when what he needs is "who answers the phone in Flekkefjord"

**Success looks like:** he sees the weather warning on a map, sees which chapters are in its area, has a phone number for a local leader, and can text that number or the number to his parents in under a minute.

**Ideas that serve him:** Storm mode / Live situational map, Storm response giving, Preparedness compass, Enriched chapter pages (leader contacts).

---

### 5. Tone — "I might start a chapter / I'm a board member"

**Early 60s, retired teacher, lives in a kommune where the Red Cross chapter is dormant.** She's been asked by her district office if she'd consider restarting or board-joining. She wants to know what a Red Cross chapter *is* — what it does, how it's structured, what other chapters near her look like as reference points.

**What she wants:** to browse and compare. She wants to look at five nearby chapters, see what they do, who runs them, how long they've been around, whether they seem to be thriving. Basically she needs a reference library of Red Cross chapters.

**What makes her bounce:**
- A site designed for "find one chapter" that makes it hard to browse many
- No historical depth (founding dates, heritage)
- No way to see a chapter's board or leadership
- No sense of the activity mix across chapters

**Success looks like:** she's visited a dozen chapter pages, has a mental model of what a healthy chapter looks like, knows which chapters near her are most active, and has the district contact person's number.

**Ideas that serve her:** Chapter Explorer map, Compare two chapters, Time-travel mode, Anniversary radar, Chapter Genesis, Memorial view, Chapter vitality score (public version).

---

### 6. Ola — "I want to see the numbers"

**Late 30s, journalist / researcher / student / involved citizen — could be any of these.** He's interested in how Red Cross works as an organization: scale, funding, geographic distribution, history, activities. Maybe he's writing an article, maybe he's a civil-society researcher, maybe he's just curious. The audience at the tail end of public-facing.

**What he wants:** facts, data, context. "How many chapters are there? How big is the organization financially? What does state funding cover? How is it distributed across the country?"

**What makes him bounce:**
- Marketing copy in place of data
- PDF-only sources (the Årsrapport is the main example)
- Numbers without citations or links to originals

**Success looks like:** he finds clear answers, with sources, and a path into deeper data where he wants it. Bonus: the app becomes a resource he cites or shares.

**Ideas that serve him:** Any chart that surfaces the Organizations API data in aggregate, funding transparency features, Time-travel mode, News aggregator, links out to tilskudd.lottstift.no and Samfunnspuls.

---

## Secondary personas — internal / staff

These are real Red Cross people — we might hear from them, the app might evolve to serve them, but v1 is not for them. Named here so we remember they exist and don't accidentally close doors.

### 7. Inger — chapter leader
**The volunteer leader of a mid-sized lokalforening.** Spends evenings on Red Cross work. Cares deeply about her chapter, less about national strategy. She might use our app to see how her chapter looks to the public, to spot errors in the API or scraped data, or to compare her activity mix to nearby chapters. She's not the audience for features she'd have to log in to use.

### 8. Arne — district coordinator
**Paid staff at one of the 19 district offices.** Oversees ~20 chapters, supports their operations, runs recruitment campaigns. Would find the coverage-gap explorer and the chapter vitality score genuinely useful, as planning tools. Likely the first internal user we'd hear from if the app got attention.

### 9. Signe — national office planner
**Works on strategy at Nasjonalkontoret, the audience Samfunnspuls was built for.** Already has internal tools. Our app would be useful to her only if it shows her something Samfunnspuls doesn't — which means the chapter overlay, or ease-of-use, or public-audience framing (so she can point external stakeholders to it).

### 10. Mette — emergency response coordinator
**Runs beredskap training and real-event coordination for a region.** The one whose work most benefits from the storm mode idea. Would want a version of it with additional capabilities (crisis rehearsal, phone trees, operational status) that exceed what we'd build in a public app.

---

## Design implications — what this tells us

A few consequences for v1, written down so we don't drift:

**1. The app has to work for someone arriving cold, on a phone, in Norwegian.** This is Kari and Amira's default. If the app requires multiple context-setting moves before it's useful, it's too complex. The fastest path from landing page to "here's what I need" wins.

**2. Every chapter detail view is trying to serve at least four personas at once.** Kari wants to volunteer; Jonas wants to donate; Amira wants an address and a time; Tone wants a reference view. The page has to accommodate all of them without becoming cluttered. A tabbed or section-based layout — "What we do / How to help / How to reach us / History" — probably works better than one long wall of everything.

**3. Rich detail and simple entry aren't in tension as long as we order them right.** Landing page = simple. Chapter detail = rich. Advanced features like compare-two-chapters, time-travel, or coverage-gap maps = one click behind an "Utforsk mer" or "For planleggere" link, so they don't clutter the main flow but aren't hidden either.

**4. Ola and Tone are the reason deep scraping pays off.** Kari, Jonas, Amira, and Lars mostly need what the API gives us plus a bit of scraped context. But the browsing-and-comparing personas (Ola, Tone) genuinely depend on scraped activity details, news, coordinator contacts, history. That's why the "scrape deep" decision matters.

**5. Internal personas are the target for v2.** If v1 lands well with the public, the natural next move is an internal-tool layer — coverage strategist, vitality dashboard, crisis rehearsal — that reuses the same data and Design System. Mentioning them here keeps that door open.

---

## Tertiary personas — niche audiences we also serve

Real users with needs the primary/secondary flows don't cover well. They get deliberate paths, not fallbacks.

### 11. Magnus — existing active volunteer

**Mid-30s, Hjelpekorps member in his chapter for six years.** He uses Mitt Røde Kors regularly for shifts and internal comms, but he'll also land on our public app — to show it to a prospective recruit, to check how his chapter looks to the outside world, to verify that contacts and activities are rendered correctly. He's a quality-control user as much as a consumer.

**What he wants:** to see his chapter rendered well for the public audience, to compare his chapter against neighboring ones, and ideally to flag errors he spots in the scraped or API data.

**What makes him bounce:**
- Data that contradicts what he knows (e.g. an activity listed that's been discontinued, or a leader name that's wrong)
- No way to report inaccuracies
- The app pretending to replace Mitt Røde Kors — he already has that

**Success looks like:** he sends the chapter URL to someone considering joining and it tells the right story. When he notices something wrong, there's a clear "meld feil" or "kontakt kapitlet" path.

**Ideas that serve him:** Enriched chapter pages, Compare two chapters, Chapter vitality score (read-only public version), News aggregator. A "meld feil" UX on chapter pages would be a genuine v1 consideration.

---

### 12. Henrik — corporate partnership lead

**Director at a mid-sized Norwegian company.** His CEO wants the company to do something meaningful with Red Cross as an ESG commitment. He needs to understand the partnership landscape: what Red Cross does where, which chapters are near his offices, what local engagement could look like.

**What he wants:** a macro view (what Red Cross does, how big it is, how it's funded) plus a local view (which chapters are near his four Nordic offices, what they'd need, what a region-by-region engagement might look like). He then wants the right human to talk to — not a donate button.

**What makes him bounce:**
- A page that treats him like a private donor with a credit card
- No sense of scale or scope — just feel-good language
- No clear "kontakt bedriftssamarbeid" path
- No way to scope engagement geographically (he has offices in four cities; he needs regional context)

**Success looks like:** he has a clear mental model of Red Cross's scale, footprint, and programs; he has named chapters near his offices; and he has a direct path to a partnerships contact — either an email or a form.

**Ideas that serve him:** Corporate partnership storytelling, Chapter Explorer map, Activities-directed giving (at the macro level), funding transparency sections. A dedicated "For bedrifter" page that routes to Red Cross's partnership team.

---

### 13. Åse — person in acute crisis

**Any age, any place. She's in acute distress right now.** Her house has just flooded, she's being abused at home, she's contemplating suicide, or she's caring for someone in crisis. She types "Røde Kors hjelp" into Google and lands on our app.

**What she wants:** the right number to call, right now. Not Red Cross structural overview. Not her nearest chapter's weekly BARK schedule. A phone number, visible, immediately.

**What makes her bounce:**
- Having to scroll, click, or navigate
- A page full of volunteer signups and donation buttons when what she needs is a helpline
- Crisis information in the footer or behind a link

**Success looks like:** within three seconds of landing on any page of the app, she can see — visibly, persistently, not buried — the appropriate emergency numbers:
- 113 (ambulance), 112 (police), 110 (fire)
- Mental Helse: 116 123
- Kors på halsen (for young people): 800 33 321
- Røde Kors-telefonen om tvangsekteskap og kjønnslemlestelse: 815 55 201
- Korspåhalsen.no (chat)

And if her need maps to a specific Red Cross service, the app tells her so clearly.

**Ideas that serve her:** a **persistent crisis band** on every page — probably a small, always-visible component in the Design System, tucked top-right or along a consistent edge, readable at a glance. This is arguably the single most important non-negotiable UX element in the app. Storm mode also serves her directly (if her crisis is a weather event).

---

### 14. Dev — developer exploring the Organizations API

**Norwegian or international software engineer, curious about the Organizations API.** Maybe they're considering building something themselves — for a school project, a hackathon, or a proposal. They want to see what the API can do and what a reference implementation using it looks like.

**What they want:** an "Om dataene og teknologien" page or similar: what data sources this app uses, which API endpoints it calls, what the Design System is, a link to our GitHub repo, a link to developer.redcross.no for the API docs themselves.

**What makes them bounce:**
- No technical details at all (they can't tell what the app is built on)
- Mysterious data provenance — they can't tell if what they're looking at is authoritative

**Success looks like:** they end up on our GitHub, skim the code, and come away thinking *"this is a good reference for how to build on the Organizations API."* Bonus: they cite or star the repo, or build their own thing using it as a template.

**Ideas that serve them:** a lightweight "Om appen / Om dataene" section. Clear attribution on every page showing which data source powered each view. Open-source repo prominently linked. Essentially: make the meta-layer legible without cluttering the main flow.

---

### 15. Sara — 15-year-old interested in youth activities

**Early teens, saw RØFF at a school assembly or heard about BARK from a friend.** She wants to know if there's a youth activity she can join near her, what happens at the meetings, and what she needs to do to sign up. Red Cross's young-people audience is real and growing — RØFF, BARK, Ung Besøksvenn, Kameleonkvinnene, Leksehjelp, Kors på halsen chatters — and they deserve a path tuned to them.

**What she wants:** clear information about youth activities — ages, times, places, what to expect, whether a parent needs to be involved, whether it's free. She wants to recognize herself in the content (photos of people her age, not middle-aged volunteers).

**What makes her bounce:**
- Adult-focused photography and language
- Forms that ask for her personnummer and payment details
- Unclear rules about age or parental consent
- A signup flow that assumes she's an adult making autonomous decisions

**Success looks like:** she finds her local youth activity, knows exactly what to expect, and has a clear next step — typically involving her parent or the activity coordinator — that feels welcoming, not bureaucratic.

**Ideas that serve her:** Activity Atlas with age filters; activity pages that clearly mark age ranges and parental-consent requirements; a "For ungdom" section or tag. Kars på halsen as a visible resource for youth who aren't looking to volunteer but might need someone to talk to.

---

## Design implications from the tertiary personas

Three things these additional personas add that the primary six don't:

**1. The crisis band is non-negotiable.** Åse's needs trump every other layout decision. An always-visible component with helpline numbers is the first thing we build, before any chapter finder.

**2. We need a "meta" layer the app wears lightly.** Magnus wants to flag errors. Dev wants to see what's under the hood. Henrik wants a partnerships path. None of this is the primary flow, but all of it can be addressed with 2–3 supporting pages and a consistent footer or "Om appen" section.

**3. Youth-coded and language-coded content needs filters, not just tags.** Sara and Amira both benefit from age-appropriate and language-appropriate filtering of activities. This isn't a separate app — it's filter chips on the Activity Atlas, age labels on activity cards, and thoughtful signposting.

---

## Stance on what we'll do to serve these personas

A few decisions that shape what "in scope" means for the project:

**Scraping is fully in scope.** We'll scrape whatever we need from rodekors.no and other public Red Cross pages, and store it locally if helpful for performance or resilience. This is how we surface the activity-level detail, coordinator contacts, photos, and news that make chapter pages useful to Kari, Amira, Tone, and Magnus. Cache invalidation and respectful crawl rates are implementation concerns — not scope restrictions.

**Public information is fair to harvest.** If it's published on a public Red Cross website (rodekors.no, chapter pages, district pages, news items), we can pull it in and display it. That includes the contact details the API already exposes in `branchContacts`, and the richer per-activity contacts on chapter pages. We use it for its intended purpose — helping people connect with Red Cross — not repurpose it for unrelated ends.

**The app is Red Cross-branded.** Project owner works at Red Cross, so the app is a legitimate first-party build using the Design System, Red Cross logos, and Red Cross colors. Not an unofficial third-party tool pretending to be Red Cross, and not trying to hide behind a neutral wrapper. Proper branding is part of making the app feel trustworthy to Kari when she's deciding whether to enter her phone number.
