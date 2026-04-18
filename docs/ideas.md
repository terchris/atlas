# Ideas

This document catalogs every app concept we've brainstormed for the Red Cross project, organized by theme. It pairs with `data-sources.md` and `data-sources-funding.md` — each idea lists the data sources it draws on.

These are concepts, not commitments. Some are small and buildable in a day. Some are ambitious. Some could be combined into a single app. The point is to have the full option space visible before we pick.

---

## How to read this document

Each idea has:
- A short name
- A one-line pitch
- What the experience is
- Which data sources power it
- What makes it genuinely useful (not just a demo)

Ideas are grouped by theme, not by priority. Toward the bottom there's a **Top picks** section with a recommended combined concept.

---

## Theme 1 — Chapter discovery and signup

Ideas about helping someone find the right Red Cross chapter for them.

### Chapter Finder (core concept)
**"Find the Red Cross chapter near you, tuned to what you care about."**

Landing page with location input or geolocation. Results as cards with images, descriptions, activities, distance. Filter by district, activity, active status. Click → detail page with full chapter info. Hand off to the existing volunteer signup form with chapter pre-selected.

- Data: Organizations API, rodekors.no chapter pages (for images and prose), Design System
- Why it's useful: the current chapter picker on mittrodekors.no is a flat dropdown of ~400 entries in no particular order, including test data and legal entities. This fixes a demonstrable UX problem.

### Enriched chapter landing pages
**"Every chapter gets a beautiful, data-rich page."**

Template-driven page per chapter combining Organizations API data + scraped chapter-page content + live context (weather, news). ~400 pages auto-generated from one template. Would be "the website every chapter deserves but can't build themselves."

- Data: Organizations API, rodekors.no chapter pages, met.no, Brreg
- Why it's useful: many chapter pages on rodekors.no are sparse; this closes the gap without humans having to write each one.

### Volunteer matchmaker quiz
**"Answer a few questions, find where you fit."**

Multi-step quiz: location, age group preference, activity style (indoor/outdoor, rescue/care/inclusion), time commitment, comfort with police check. Output: 3 specific activity-at-chapter recommendations with reasoning. Direct handoff to signup form.

- Data: Organizations API, scraped chapter-page activities, Design System
- Why it's useful: new volunteers currently pick chapter first, activity later (via phone call 14 days after signup). This inverts it to interest-first, making the fit better and the conversion higher.

### Chapter Explorer as a browseable map
**"See all 400 chapters on a map of Norway."**

Interactive map with pins for every chapter, clustered at low zoom, filterable by district/activity/type. Click pin → chapter card in sidebar. Exercises the geographic data that the API gives us.

- Data: Organizations API (coordinates), Kartverket boundaries, Design System
- Why it's useful: rodekors.no/lokalforeninger has no map today. Finding your chapter requires knowing your district.

### "Kartlegger" — swipe-through activity discovery
**"Tinder for volunteering."**

Card stack of activities: photo, description, nearest chapters that run it. Swipe right to save, left to skip. At end, saved activities handed off with "want us to contact these chapters for you?"

- Data: Organizations API, scraped chapter pages (for activity descriptions and photos), Design System
- Why it's useful: gamifies discovery for audiences that wouldn't work through a traditional form.

---

## Theme 2 — Activity-first navigation

Ideas built around "what activity do I want to do" rather than "which chapter am I near."

### Activity Atlas
**"Where in Norway can I do X?"**

Pick a canonical activity (Besøkstjeneste, Hjelpekorps, Leksehjelp, Flyktningguide, BARK, RØFF) → see every chapter in Norway offering it, on a map and in a list, sorted by distance from you. Sub-types visible via scraped data ("Besøksvenn med hund", "Ung Besøksvenn", "Kulturvenn").

- Data: Organizations API (`branchActivities`), scraped chapter pages (sub-activities), Design System
- Why it's useful: the current Red Cross digital presence cannot answer this question. You have to visit each of 19 district pages to see who offers what. This inverts the organization around activities.

### Activities-directed giving
**"Give to the specific thing you care about."**

"Give to BARK" or "Give to Hjelpekorps" → pooled giving across all chapters running that activity. Show donors exactly what funds (equipment, training, meetings) at the activity level, not just the org level.

- Data: Organizations API, scraped activity descriptions, Grasrotandelen deep-links
- Why it's useful: connects giving to specific humanitarian outcomes. "My money funded 12 BARK sessions for kids in Vestfold."

### Seasonal planner
**"What's happening at Røde Kors this season near me?"**

Calendar view. Highlights activities that are seasonal (Juleaksjon, Sommerleir, Påskeaksjonen, Ferie for alle). Shows which chapters run which seasonal programs.

- Data: Organizations API, scraped activity descriptions, scraped news feeds ("Aktuelt")
- Why it's useful: connects the abstract "Red Cross does things" to concrete upcoming dates a volunteer could show up to.

---

## Theme 3 — Situational awareness and beredskap

Ideas about real-time context around chapters.

### Storm mode / Live situational map
**"When a weather warning hits, show the chapters in its path."**

Auto-activates when met.no issues a farevarsel. Map zooms to the warning area, highlights the polygon, overlays every chapter inside, sorts by proximity to centroid, surfaces leader phone numbers one-tap-to-call. Generates shareable briefing.

- Data: Organizations API, met.no (`/metalerts`, `/locationforecast`), Varsom (avalanche, flood, landslide), Kartverket
- Why it's useful: Hjelpekorps exists to respond to these exact events. A live map keyed to chapter locations is genuinely useful for both chapter coordinators and nearby citizens.

### National live wall
**"Big TV in the national office showing what's happening."**

Map of Norway as ambient display. Pins pulse on events: new warning hits a chapter area, chapter anniversary, news post, live Spleis campaign update. Designed to be wall-mounted. Rotates through storylines.

- Data: Organizations API, met.no, Varsom, Spleis, scraped news feeds, Grasrotandelen
- Why it's useful: makes the invisible visible. Red Cross is constantly doing things but there's no single view of that.

### Crisis rehearsal mode
**"What if there was a major flood in Gudbrandsdalen?"**

Pick a hypothetical scenario. App shows chapters in affected area, their Hjelpekorps readiness, estimated response times from neighboring chapters (via Entur routing), activities available. For tabletop exercises and training.

- Data: Organizations API, Entur, Varsom historical data, Kartverket, DSB Kommuneundersøkelsen
- Why it's useful: bridges the gap between reality and preparedness training. Used by beredskap coordinators.

### Preparedness compass
**"Your personal preparedness dashboard, tied to your place."**

Personal profile (browser-stored, optional login). "You live in Arendal. Your nearest Hjelpekorps chapter is 3 km away. You have a first aid kit (bought 2025). You're signed up for a course in March. Weather-forecast anomalies in your area this week." Persistent, builds over time.

- Data: Organizations API, met.no, DSB Kommuneundersøkelsen, nettbutikk, Red Cross course schedule (if available)
- Why it's useful: makes "beredskap" a lifestyle rather than a one-off — and Red Cross the natural custodian of that lifestyle.

---

## Theme 4 — Humanitarian need and coverage

Ideas built on Samfunnspuls data plus chapter presence. Most of these answer: "where are the needs, and are we there?"

### Din lokale Røde Kors coverage-gap explorer
**"Samfunnspuls v2 — with the chapter layer added."**

Map choropleth of Norway colored by any humanitarian-need indicator (Samfunnspuls's ~37 curated statistics: child poverty, loneliness, refugees settled, single elderly, unemployment, etc.). Chapters overlaid as pins, colored by which activities they offer. Sidebar per-kommune: "here's the need, here's our coverage, here's the gap."

- Data: Organizations API, SSB, NAV, FHI (Folkehelseprofil), Bufdir (Barnefattigdom + Barnevern), IMDi, Ungdata, Samfunnspuls indicator list, Kartverket
- Why it's useful: **this is exactly what Samfunnspuls is trying to do but doesn't because it lacks the chapter layer.** Red Cross's own planners need this.

### Ensomhetskartet (Loneliness map)
**"Where is loneliness high but Besøkstjeneste thin?"**

Overlay kommune-level loneliness data (via FHI Folkehelseprofil + Ungdata) with chapters offering Besøkstjeneste. Shows recruitment targets — places where the activity would fill a genuine gap.

- Data: Organizations API, FHI Folkehelseprofil, Ungdata, SSB (single-person-household proxy)
- Why it's useful: turns "you should volunteer as a besøksvenn" into "here's exactly where you'd make the biggest difference."

### Flyktningguide match map
**"Where are people arriving, and where is the welcome network?"**

Per kommune: number of recently arrived refugees (IMDi). Overlaid with chapters offering Flyktningguide, Norsktrening, Språkkafé. Gaps are recruitment opportunities; strengths are success stories.

- Data: Organizations API, IMDi statistics, scraped chapter activities
- Why it's useful: matches supply of Red Cross welcome activities with demand from refugee settlement policy. Bridges federal policy with local volunteer action.

### Youth well-being atlas
**"Where do kids feel most/least connected?"**

Map per kommune (and bydel in Oslo/Bergen/Stavanger/Trondheim) colored by Ungdata indicators: loneliness among youth, bullying, mental health, lokalmiljø satisfaction. Chapters running BARK/RØFF/Leksehjelp overlaid.

- Data: Organizations API, Ungdata, FHI Oppvekstprofil, Bufdir, scraped chapter activities
- Why it's useful: youth-well-being is central to Red Cross's "Trygg oppvekst" strategy. This visualizes where the need is sharpest and whether Red Cross is present.

### Ageing Norway
**"What will 2045 look like for your kommune?"**

SSB population projections per kommune through 2050. Overlay current Besøkstjeneste and care-activity coverage. "By 2040 this kommune will have 3x more 80+ residents — is there a plan?"

- Data: Organizations API, SSB projection tables
- Why it's useful: makes abstract demographic trends vivid and actionable at the chapter level.

### Rural vitality / gap explorer
**"As public services retreat, where does volunteer infrastructure still hold?"**

Map of kommune population decline (SSB), service retreat indicators, overlaid with Red Cross chapter presence and activity count. Shows where Red Cross is becoming essential because nothing else is there.

- Data: Organizations API, SSB, KOSTRA, Bufdir
- Why it's useful: tells a specific, underappreciated story about Red Cross's role in rural Norway.

---

## Theme 5 — Heritage and history

Ideas about 160 years of Røde Kors in Norway.

### Time-travel mode
**"Watch Red Cross Norway grow from 1865 to today."**

Slider across the map. As you drag through years, chapters appear when founded, fade when terminated, regional clusters emerge. Commentary layer highlighting historical context (WWII, post-war expansion, 2020 COVID volunteer surge).

- Data: Organizations API (`creationDate`, `terminationDate`)
- Why it's useful: visually unique. Good for storytelling, anniversaries, press, internal comms.

### Anniversary radar
**"Every chapter turning 100 this year."**

Dashboard: chapters hitting round-number anniversaries (50, 100, 150 years). Auto-generates celebration page with photos, founding decade context, activities. National comms team gets pre-made content.

- Data: Organizations API, scraped chapter pages (photos), Brreg (founding cross-check)
- Why it's useful: useful internal tool, also nice public-facing stories.

### Memorial view
**"Red Cross has had 612 chapters. 217 are gone. Their stories."**

Dedicated section for terminated chapters. Each gets a memorial card: founding date, termination date, what they did, where they were. Historical context.

- Data: Organizations API, Brreg, Wikipedia/Wikidata where available
- Why it's useful: poignant heritage angle, makes the organization feel permanent.

### Chapter Genesis — start a new one
**"There's no chapter in your municipality yet. Here's how to start one."**

Wizard showing historical patterns: how new chapters form, what activities they typically start with, what resources the district provides, who to contact. Turns "no chapter here" from dead end into call-to-action.

- Data: Organizations API (historical founding patterns), rodekors.no district contacts
- Why it's useful: addresses white spots on the map proactively.

---

## Theme 6 — Giving and support

Ideas about donation, membership, preparedness commerce.

### Give local (flipping the default)
**"Donate to your local chapter, not just national."**

Map-based giving. Click your kommune → three buttons: Grasrotandelen with chapter's org number pre-filled, Vipps to national (with note "supports the whole network including your local chapter"), become a member of that specific chapter.

- Data: Organizations API, Grasrotandelen deep-links, webshop deep-links, Vipps
- Why it's useful: inverts the current giving UX where national is the default. Makes "my donation helps my neighbors" tangible.

### Chapter campaign generator
**"Every chapter gets its own donate page for free."**

Auto-generated landing page per chapter: photo, activities, leader, org number, Grasrotandelen setup, Vipps deep-link, Spleis link, social share. ~400 landing pages from one template.

- Data: Organizations API, scraped chapter pages, Grasrotandelen, Spleis
- Why it's useful: turns every chapter into its own fundraiser without national HQ writing 400 pages.

### Live fundraising dashboard
**"Watch crowdfunding across Red Cross in real time."**

Pulls Spleis campaigns live. Map + list + running total. Celebrates active campaigns, aggregates supporter counts.

- Data: Organizations API, Spleis scraping
- Why it's useful: only live-updating fundraising data we have. Good ambient view for public site or internal screens.

### Storm response giving
**"When a warning hits, make it easy to help that specific area."**

During storm mode: alongside volunteer+call-to-action CTAs, show Vipps/Spleis for affected chapters, show webshop items relevant to the hazard. Crisis-responsive giving.

- Data: Organizations API, met.no, Varsom, Spleis, nettbutikk
- Why it's useful: channels emotional response into appropriate, local action without crossing into opportunism.

### Memorial gifts done right
**"Mark a loved one's memory through Red Cross."**

Flow: pick chapter (their hometown?), pick activity that honored them (outdoorsy → Hjelpekorps, kids → BARK), generate printable tribute card with donation confirmation.

- Data: Organizations API, Brreg (donation mechanics), scraped activity descriptions
- Why it's useful: adds dignity and agency to grief. Currently a generic page-link on the donation overview.

### Preparedness-check + shop
**"Are you ready for 72 hours?"**

Wizard: do you have water, food, light, first aid, radio, warm clothes, meds? Personalized shopping list linking to webshop + nearest chapter's first-aid course + "here's the Hjelpekorps team for your area if you want to be part of local response."

- Data: Organizations API, nettbutikk, DSB preparedness guidance, met.no (typical hazards), Red Cross course schedule
- Why it's useful: Red Cross becomes the trusted voice on personal preparedness — genuine public utility.

### Sponsor a first aid kit
**"Gift preparedness to a family in need, via your local chapter."**

Donate a kit → chapter distributes via existing programs → donor gets (anonymized) photo of handoff + tax receipt. Tangible outcome, sourced from webshop inventory.

- Data: Organizations API, nettbutikk, scraped chapter activities
- Why it's useful: concrete giving with visible outcome. Like "sponsor a child" but for preparedness.

### Workplace preparedness
**"Bedrift-pakken" — buy preparedness for your whole team.**

Bulk purchase flow for companies: kits + online course from Red Cross + Q&A with local Hjelpekorps coordinator. Sold as HR/ESG product.

- Data: Organizations API, nettbutikk, course system
- Why it's useful: new B2B revenue channel that still routes through local chapters.

---

## Theme 7 — Internal / admin tools

Ideas aimed at Red Cross staff rather than the public.

### Data completeness audit
**"Where is our chapter data broken?"**

Side-by-side: Organizations API data vs. rodekors.no page vs. innmeldingsskjema dropdown. Flags:
- Chapters in API but no public page (test/legacy?)
- Chapters on site but not in API (sync issue)
- API activities that disagree with chapter-page prose
- Missing leader contacts
- Inactive chapters still in volunteer dropdown
- Legal entities mixed with volunteer-able chapters

- Data: Organizations API, scraped public pages, scraped mittrodekors dropdown
- Why it's useful: Red Cross integration team has a real need to clean this up. A visible dashboard builds the case.

### Chapter vitality score
**"Which chapters are thriving? Which need help?"**

Per chapter: activities offered, volunteer contacts listed, news recency, photo count, web presence, longevity, board completeness (Brreg). Compute a 0-100 score. Rank all 400. Sortable, filterable.

- Data: Organizations API, scraped chapter pages, Brreg, Grasrotandelen standing, Spleis
- Why it's useful: competitive element that encourages chapters to improve their digital presence. Strategic tool for district offices.

### News aggregator (Aktuelt across all chapters)
**"What's new in Red Cross Norway this week?"**

Aggregate news feeds from all ~400 chapter pages. Chronological, filterable by district and activity. Ambient ticker on landing page showing most recent.

- Data: Scraped chapter pages, Organizations API
- Why it's useful: there's no central place to see chapter-level news. This creates one.

### Board diversity & turnover dashboard
**"Who leads Røde Kors?"**

Cross-reference Brreg board data across all chapters. Age distribution, gender, turnover rate. National strategic view.

- Data: Organizations API, Brreg (full board info via org numbers)
- Why it's useful: representation and succession planning are real concerns. Data-driven view is rare.

### Coverage strategist tool
**"Where should we grow next?"**

For national or district planners: combine need indicators (SSB, FHI, IMDi, Bufdir) + current coverage (Organizations API + activities) + volunteer supply (working-age population) + historical founding patterns. Recommends kommuner where a new activity or chapter would have highest impact.

- Data: Organizations API, all Samfunnspuls sources, FHI, Bufdir, IMDi, Ungdata
- Why it's useful: turns strategic planning from intuition-based to evidence-based.

---

## Theme 8 — Commerce and integration

Ideas that tie the webshop and other systems more tightly into the chapter network.

### Route webshop revenue by location
**"5% of this purchase supports your local chapter."**

At checkout, identify local chapter via postal code, show "5% goes to [chapter name]." Chapters see webshop sales in their area.

- Data: Organizations API, nettbutikk (WooCommerce)
- Why it's useful: makes every purchase locally impactful, not just nationally.

### Preparedness subscription
**"Fastgiver for things."**

99 kr/month subscription → every 4 months a rotating preparedness item (kit, radio, water tabs, hand warmers). Part of revenue goes to local chapter, part to national.

- Data: nettbutikk (products, subscriptions), Organizations API
- Why it's useful: builds personal preparedness over time, creates recurring revenue with local attachment.

### Corporate partnership storytelling
**"Sponsor your local chapter, track your impact."**

Company picks a chapter (typically near their office). Dashboard shows: funded activities, volunteer hours contributed by their staff, photos, impact metrics. Chapters get named sponsors like football teams.

- Data: Organizations API, scraped activities, Brreg (company info), optional manual inputs
- Why it's useful: gives corporate partners a concrete story to tell employees and shareholders.

---

## Theme 9 — Multilingual and inclusive

Ideas about widening Red Cross's digital reach.

### Multilingual activity discovery
**"Find your chapter in your language."**

Many activities serve immigrants and refugees — Flyktningguide, Språkkafé, Norsktrening — but the current site is Norwegian-only. Build activity discovery in Norwegian, English, Arabic, Ukrainian, Somali, Tigrinya. Machine translation of activity descriptions with fallback to original Norwegian.

- Data: Organizations API, scraped activity descriptions, translation service
- Why it's useful: the audience for these activities often cannot read Norwegian well. Red Cross should meet them in their language.

### Accessibility-first chapter cards
**"Every chapter page works for screen readers, cognitive disabilities, and poor connections."**

Part of baseline design, not a separate idea. But worth naming because it's an underserved audience: a lot of Red Cross users (elderly, recent arrivals, those in crisis) need accessible tools more than most.

- Data: Design system accessibility features, Organizations API
- Why it's useful: aligns with Red Cross values and expands practical reach.

---

## Theme 10 — Playful / experimental

Ideas that may not be the main show but are fun and could draw attention.

### "Guess the district" game
**"Show me the chapter's activities and founding date — where in Norway is it?"**

Educational game. Builds familiarity with Red Cross geography and activity diversity.

- Data: Organizations API
- Why it's useful: low-stakes, shareable, accidentally educational.

### Compare two chapters
**"Side-by-side: pick any two branches."**

Activities, leadership, history, news recency in parallel. Useful for evaluating where to volunteer, move, or benchmark.

- Data: Organizations API, scraped pages, Brreg
- Why it's useful: rare feature, genuinely useful for certain decisions.

### "A day in the life of Røde Kors Norge"
**"Sped-up 60-second replay."**

Animated day view. Meetings happening, weather events, volunteers signing up (anonymized), news posts. Shows scale.

- Data: Organizations API, met.no, aggregated volunteer signups, news feeds
- Why it's useful: marketing gold. Pitch decks, recruitment videos, lobby displays.

### Talk-to-the-org natural language interface
**"Ask the org."**

"Which chapters offer Hjelpekorps and Besøkstjeneste within 50 km of Bergen, founded before 1950?" → structured query over the combined data → results on a map.

- Data: Organizations API, scraped pages, Brreg
- Why it's useful: shows off the richness of the underlying data. Natural, exploratory.

---

## Cross-cutting concept: "Din trygghet, ditt Røde Kors"

**"Norway's safety net — one front door."**

Instead of four separate digital products (rodekors.no, mittrodekors.no, nettbutikk, stott-arbeidet), one unified app anchored on the chapter. Land on a chapter-first experience. Every feature radiates from there:

- See what your chapter does
- Meet the people running it
- Join as a volunteer (deep-link to innmelding with chapter pre-selected)
- Become a member
- Donate once (Vipps) or recurring (Grasrotandelen, fastgiver)
- Buy preparedness (nettbutikk with 5% to your chapter)
- See storm warnings affecting your area
- See your chapter's history
- Share your chapter's story

National Røde Kors becomes the meta-layer (Norway-wide campaigns, Vipps 2272, international work). Chapters are the protagonist.

This is a **big vision** — ambitious, unlikely to ship in one go — but it's the right frame for the other ideas. Every specific concept above becomes a page or feature inside this umbrella.

---

## Top picks — my recommendation

If we can only build one thing, **Chapter Finder with enriched chapter pages**. It:
- Has a clear user (prospective volunteer/donor/member)
- Solves a visible, demonstrable UX problem (the current 400-item dropdown)
- Uses a healthy fraction of the Design System
- Degrades gracefully — works even without scraping, or without weather, or without Samfunnspuls data
- Is self-contained and shippable

If we have more scope, the natural extensions are:

1. **Activity Atlas** — "find your thing" cross-cuts well with finder, answers a question no current Red Cross product answers
2. **Storm mode / situational awareness** — the "wow" moment, mission-aligned
3. **Coverage-gap explorer with Samfunnspuls data** — the strategic tool that matches internal needs
4. **Time-travel history** — the emotional anchor, good for heritage storytelling

These four plus Chapter Finder form a coherent five-part app that exercises the full data stack. Good scope for a serious project.

If the project is more "demo to impress" than "real tool to ship," I'd bias toward **Chapter Finder + Storm mode + Time-travel** — those three give the best visual wow-factor per hour of build.

---

## Decisions still to make

Before we commit to a scope, a few open questions:

1. **Who is the primary audience?** Public (prospective volunteer/donor), staff (planning tool), or demo (showcase to impress)? Each biases the picks differently.
2. **How deep on scraping?** None (API only, quickest), light (cached hero images + prose, good payoff), or deep (parse activity-level details, unlocks most ideas)?
3. **Is the Samfunnspuls direction fair game?** If yes, the coverage-gap explorer is the most differentiated idea on the list. If no (might feel like stepping on internal toes), we focus on public-facing concepts.
4. **What's the intended outcome?** Learning, portfolio piece, job interview, open-source reference, actual proposal to Red Cross? Determines how polished vs. how ambitious to go.
5. **Mock data or real API access first?** The mock-first route lets us start immediately and feels no different to users once the key arrives.

None of these need answering before we start — but they're worth thinking about early.
