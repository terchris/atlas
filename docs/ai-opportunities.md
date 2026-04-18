# AI opportunities

This document explores where an AI (LLM) layer could fit into the app described in `goal.md`. It pairs with `ideas.md` (which catalogues features regardless of whether they use AI) and `personas.md` (who we're building for).

The starting premise: the core of the app is a traditional Next.js + Design System experience — chapter finder, crisis band, engagement pathways. AI is not the main course. But AI-powered chat over structured data is a real, shipping pattern now, and the Organizations API plus scraped chapter content is a good shape for it. So: where does AI earn its place, and where is it just a demo?

This file surveys what's being done in the wild, notes what's hard for our specific project, sketches concrete opportunities, and ends with a recommendation.

---

## The landscape — patterns in use

Four broad families of "chat with your data" architectures are worth naming. Real apps usually mix them.

### 1. Text-to-SQL / text-to-API
The LLM translates a user question into a query against structured data. User asks *"which chapters in Vestfold offer Besøkstjeneste?"* → LLM emits a SQL query or REST call → app executes it → LLM narrates the result. Open-source leaders: [Vanna AI](https://github.com/vanna-ai/vanna) (MIT, agentic RAG over SQL), [WrenAI](https://github.com/Canner/WrenAI) (text-to-SQL + text-to-chart, semantic layer, any LLM), [Chat2DB](https://chat2db.ai/), [SQL Chat](https://github.com/sqlchat/sqlchat).

Good for: structured data with a clean schema, power users, exploratory questions. Weak for: free-text nuance, anything where the answer is prose rather than a row.

### 2. RAG (retrieval-augmented generation) over documents
The LLM is grounded in a vector store of chunks from scraped/written content. User asks about activities → retrieve the relevant chapter-page paragraphs → LLM composes an answer with citations. Standard stack: embeddings + vector DB (pgvector, Qdrant, Milvus) + prompt template. Especially relevant to us because the rodekors.no chapter pages are the source of activity-level prose the API doesn't give us.

Good for: prose content (activity descriptions, news, historical material), questions that don't map to a field. Weak for: numeric/relational questions ("how many chapters?") and freshness without re-indexing.

### 3. Tool-calling / agentic
The LLM is given a set of tools (typed functions) and decides which to call. Claude and the OpenAI Chat Completions API both do this natively. The Anthropic-native version is [Claude tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview): you define tools with JSON Schema, Claude emits structured calls, your app executes and returns results, Claude continues. [Model Context Protocol (MCP)](https://modelcontextprotocol.io/examples) standardises this further — a running MCP server exposes your API and any compatible client (Claude Desktop, ChatGPT apps, Cursor, VS Code) can use it.

Good for: composing multiple data sources, decisions that require reasoning ("which chapter is closest and open today?"), extensibility. Weak for: single-shot lookups where a form would be simpler.

### 4. Generative UI
The LLM doesn't just stream text — it streams React components. [Vercel AI SDK 3](https://vercel.com/blog/ai-sdk-3-generative-ui) introduced `streamUI`: tools whose `generate` function returns a React component (a ChapterCard, a Map, a DonateButton) alongside or instead of prose. The result feels less like a chat and more like an app that answers back. Requires a framework with React Server Components — Next.js specifically. See the [RSC generative UI template](https://vercel.com/templates/next.js/rsc-genui).

Good for: making chat render like an app, not a wall of text. Well-matched to Next.js + Design System. Weak for: mobile contexts where screen real estate is tight, and for users who just want a form.

### The hybrid that works
Most good implementations are **text-as-one-input-mode-among-many**. Vanna renders results as tables and charts; Vercel's examples render weather cards; [ZenCity's civic agent](https://www.zenml.io/llmops-database/ai-powered-community-voice-intelligence-for-local-government) uses MCP tools with forced citations. The chat is one entry point; the rest of the UI is there too. This matches our situation: Kari would use a search box; Ola would use chat; both should land on the same chapter card.

---

## Reference projects to learn from

**Shipped in the humanitarian / civic / public sector:**

- **Clara — American Red Cross blood-donation chatbot.** Guides donors, schedules appointments, answers medication-eligibility questions with CDC-sourced data. [redcross.org/about-us/meet-clara.html](https://www.redcross.org/about-us/meet-clara.html). Same organisation, different country, directly relevant precedent.
- **Frida — NAV (Norwegian welfare) chatbot.** Launched 2018, handled 270,000+ COVID inquiries, 80% resolved without human handoff. Built on boost.ai. [Case study](https://boost.ai/case-studies/how-conversational-ai-is-helping-norways-citizens-with-covid/).
- **Kommune-Kari.** Multi-municipality Nordic chatbot platform launched in Sandefjord 2017, now used by 118 municipalities serving 27M people. A Norwegian public-sector-chat-at-scale reference.
- **ZenCity civic agent.** Uses MCP tools + citation enforcement to let local-government officials query community-feedback data safely.
- **Civic AI Navigator.** US-focused chatbot for government websites, built on top of Drupal, with a January 2025 relaunch through Promet Source.
- **Civic Tech Field Guide bot.** Chats with a knowledge base of civic-tech projects and publishes its prompt patterns — a small example of a nonprofit making its own domain knowledge queryable.

**Developer-stack primitives:**

- **Vercel AI SDK.** Open-source TypeScript library for building streaming chat and generative UI in React/Next.js. Tool calling via Zod schemas; `streamUI` for component streaming; works with any provider (Anthropic, OpenAI, Gemini). [ai-sdk.dev](https://ai-sdk.dev/docs/introduction).
- **Claude API with tool use.** First-class JSON-Schema tools, prompt caching, streaming, long context. Pairs naturally with the Vercel AI SDK via `@ai-sdk/anthropic`.
- **Model Context Protocol.** Anthropic-originated, now cross-vendor. Wrapping the Organizations API as an MCP server would give it chat interfaces in Claude Desktop and elsewhere essentially for free — and the same server would back our own in-app chat.
- **Vanna AI 2.0** if we ever want a text-to-SQL layer over the raw API data dumped into SQLite or Postgres.

---

## Civic-sector lens — what works, what doesn't

Observations synthesised from the case studies above plus the research literature:

- **Narrow, well-scoped chatbots work.** Clara (blood donation), Frida (unemployment FAQ), Kommune-Kari (municipal services) all succeed because the user's question space is bounded. Generic "ask anything about the Red Cross" is harder to do well.
- **Human handoff is a feature, not a fallback.** Frida escalates ~20% of conversations to live agents. Chapter coordinators' phone numbers already play this role for us — the app should route confident chat answers and hand off everything else.
- **Citations matter more than fluency.** ZenCity enforces citations; multiple public-sector deployments require them. For our authoritative data (chapter contacts, helplines), every AI-generated answer should show *which chapter / which scraped page / which API field* it came from.
- **Multilingual is hard and humanitarian orgs are already working on it.** UN teams co-design refugee-language translation tools with human-in-the-loop review ([source](https://completeaitraining.com/news/from-refugee-translations-to-virtual-assistants-how-the-un/)). Low-resource languages have weaker embedding models and weaker retrieval — this is a real gap, not a minor tuning issue.

---

## Risks specific to this app

These shape what we should and shouldn't build.

### Crisis-safety contract is load-bearing
`goal.md` locks in the crisis band: helpline numbers visible on every page. A chat interface anywhere near that band creates new risks. Published research on LLM behaviour in mental-health contexts is sobering: [leading LLM judges hit only ~52% accuracy on counselling data](https://arxiv.org/html/2509.24857v2), and [LLM-powered chatbots fail to generate guideline-consistent resuscitation advice](https://pubmed.ncbi.nlm.nih.gov/37927093/). A directive hallucination in a crisis context can cause real harm.

**Consequence for us:** the AI chat must never be the path for Åse (person in crisis). Helpline numbers stay as static chrome. If a user message looks like a crisis — intent classification, keyword triggers, or an LLM-judge on each turn — the response is a hard cut: show the band, suppress any AI-generated prose, offer a human path. No cleverness, no empathy-generation, no "I'm not a therapist but here's what I think."

### Hallucination where the data is authoritative
Our data is *about* Red Cross. A wrong phone number, a wrong meeting time, a wrong activity attribution has concrete downstream cost: a refugee showing up at the wrong address, a volunteer calling someone who isn't the coordinator, Magnus (our volunteer-QC persona) losing trust in the app. Tool-calling over the API with citation-enforcement is much safer here than RAG over prose. Prefer "I looked up chapter X in the Organizations API and it says Y" over "chapter X offers Besøkstjeneste" with no provenance.

### Multilingual quality drops off a cliff
Amira (recent arrival) is one of the personas AI could most obviously help — she wants concrete Norwegian activity details in her language. But retrieval quality in Arabic, Ukrainian, Tigrinya, Somali is noticeably worse than in English and far worse than in Norwegian. An AI that confidently mistranslates an activity description is worse than no AI. If we ship multilingual chat, it needs human-verified translations of the activity catalog as a baseline, with the LLM filling only low-stakes gaps.

### Cost and latency for a public free app
This app is unauthenticated and public. A chat on every chapter page invites abuse (scrapers, jokers, prompt-injection). Cost-per-turn is real. Mitigations: aggressive prompt caching (Claude supports it natively), rate-limit per IP, cache popular tool results, keep the tool set small, don't make chat the default on every page.

### Scraping + AI compounds brittleness
The chapter-page scrape can break silently; an AI that reads from it can confidently make up content to fill the gap. If the scrape falls back to API-only, the AI layer has to know that and say so — not invent activity descriptions.

---

## Opportunity sketches for this project

Six concrete ideas, each with a persona, a technical sketch, and a candid note on fit.

### A. Chapter Concierge — "help me find the right chapter"
**Conversational layer over the chapter finder.**

User lands on the home page; alongside the search box there's a chat input: *"I want to visit lonely old people in Bergen — where should I go?"* The LLM uses tools (filter chapters by kommune, filter by activity, rank by distance) to compose an answer and renders the same ChapterCards the traditional UI uses.

- Serves: Kari (primary), Tone (comparison), Ola (exploration)
- Data: Organizations API (tool-calling only — no RAG here)
- Stack: Vercel AI SDK + Claude (Haiku is cheap enough for this), tools defined with Zod, generative UI returning ChapterCard components
- Fit: **good first experiment.** Low stakes (wrong answer just means Kari uses the form instead), clean tool surface, demonstrates Next.js + Design System + Claude in one polished feature, works offline-to-the-LLM (the traditional finder always still works).

### B. Activity Match — "I don't know what it's called, I just want to..."
**Reverse lookup from intent to canonical activity.**

User describes what they want in plain language. LLM maps it to canonical activities (Besøkstjeneste, Leksehjelp, Flyktningguide, BARK, etc.), explains each, and offers to find chapters nearby. This is the jargon-translation layer Kari needs most.

- Serves: Kari (primary), Amira (with a multilingual variant), Sara (youth-filtered variant)
- Data: Organizations API + scraped activity descriptions (for the prose answer), with canonical activity taxonomy curated by hand
- Stack: same as A, plus a small handwritten activity taxonomy file so the LLM doesn't guess at names that don't exist
- Fit: **highly aligned with primary persona.** This is the exact problem the 400-item dropdown fails to solve.

### C. Multilingual activity explainer
**Activity details, explained in your language.**

On an activity page, a small "Forklar på…" control offers English, Arabic, Ukrainian, Somali, Tigrinya. LLM produces a clear, simple-register description of *this specific activity at this specific chapter* — meeting time, place, what to expect, contact — based on scraped Norwegian content.

- Serves: Amira (primary)
- Data: scraped chapter pages, plus a pre-cached translation layer with human review for the high-value languages
- Stack: Claude (strong multilingual), with cached translations stored per chapter-activity so we're not paying per visit
- Fit: **high-impact, high-risk.** Big win for Amira if it's accurate; actively harmful if it says the wrong meeting time. Would need human verification on critical fields (address, time, phone) before ship — probably render those fields from structured data and let the LLM only translate the prose around them.

### D. Transparency Q&A — "where does my money actually go?"
**Chat over the funding data in `data-sources-funding.md` plus the Organizations API.**

Jonas asks: *"If I set up Grasrotandelen to my local chapter, where does the money end up?"* or *"How much of Vipps 2272 goes to administration?"* LLM answers with citations to tilskudd.lottstift.no, the årsrapport, and chapter org numbers.

- Serves: Jonas (primary), Ola (primary), Henrik (tertiary)
- Data: funding sources we've already catalogued, plus API for local-chapter resolution
- Stack: RAG over a small curated corpus of funding docs + tool-calling for per-chapter lookups
- Fit: **niche but differentiating.** Nothing on rodekors.no does this well today. Lower traffic than A/B, but the people who want it *really* want it. Natural candidate for an "Utforsk data" tab rather than the main flow.

### E. Storm Briefing generator (Lars)
**When a met.no warning fires, compose a plain-language briefing.**

Input: the warning polygon + chapters inside + leader contacts. Output: a short briefing Lars can read to his parents or forward as a text — "Gul fare for vind i Flekkefjord fra lørdag 14:00. Nærmeste Røde Kors Hjelpekorps er 8 km unna, kontakt Kari Jensen på 99 88 77 66." No general advice, no improvisation — structured fields only.

- Serves: Lars (primary), Mette (secondary, internal use)
- Data: met.no, Organizations API
- Stack: template-first with LLM only for natural-sounding prose around fixed fields. This is the safest use of AI on the list — the LLM can't invent a phone number because the phone number is injected, not generated
- Fit: **ships with Storm Mode extension.** Would add real value to that specific view; doesn't make sense as a standalone chat.

### F. Developer playground (Dev)
**Chat interface to the Organizations API on the "Om appen" page.**

For the developer persona: a small embed on the about page where you can try "show me all chapters founded before 1900" or "list activities with more than 10 chapters offering them." LLM emits an API call, shows the call, shows the response.

- Serves: Dev (tertiary), Ola (secondary path)
- Data: Organizations API only
- Stack: tool-calling, with the tool response rendered as raw JSON alongside prose. Or: wrap the API as an MCP server and link to the server for use in Claude Desktop/Cursor
- Fit: **cheap and defensible.** Small scope, clear audience, doubles as advertising for the API itself. A real MCP server would be a standout artefact for the open-source repo.

### Where AI does *not* earn its place
A short list of ideas that sounded AI-shaped and aren't:

- **Chat on the crisis band.** Static numbers. Never chat.
- **Volunteer matching that commits the user to a chapter.** A recommendation is fine; actual signup stays on the existing form.
- **Auto-generated chapter pages as the only source of truth.** Fine as a human-reviewed draft for chapters with thin public pages; not fine as live prose served to the public.
- **Generic "ask anything about Red Cross."** Too broad, too many hallucination surfaces, not visibly better than Google.

---

## Recommendation

**Start with A (Chapter Concierge) as the first AI experiment.** It's bounded, safe, uses only structured API data, renders through Design System components via generative UI, and directly addresses the UX problem the goal document already commits to solving. If it works, B (Activity Match) is a natural follow-on using the same infrastructure.

Concretely for v1:

1. Ship the non-AI core first — as `goal.md` says, crisis band before anything else.
2. Add Chapter Concierge as a v1.1 feature on the home page — the chat box sits next to the search box, never replaces it. Use Vercel AI SDK + Claude via `@ai-sdk/anthropic`.
3. Expose the Organizations API wrapper as an MCP server in parallel. Same tool definitions; zero extra work; gives us Dev-persona value (F) for free and future-proofs for ChatGPT apps / Claude Desktop integrations.
4. Hold B, C, D for v1.2+ once we've learned what turns of phrase users actually try.
5. Don't build E until Storm Mode itself is built.

Bias throughout: **tools over RAG**, **citations always**, **generative UI over prose walls**, **chat as one input mode among many — never the only one**.

---

## Open questions

1. **Model choice.** Claude Haiku for cost (chat concierge is mostly cheap lookups), Claude Sonnet for the multilingual / explain-the-activity path. Stay on a single provider (Anthropic) for brand alignment and prompt-caching benefits, or use the Vercel SDK abstraction to stay portable?
2. **Where does the AI budget come from?** Public, free, unauthenticated = no revenue. Need a rate-limit + caching strategy before chat goes live.
3. **Do we build the MCP server first or second?** Arguments both ways. First = the tool definitions are the design contract. Second = we know what the app actually needs before exposing anything.
4. **How strict is the crisis-intent classifier?** False positives are cheap (just show the band). False negatives are expensive. Probably: err high, show the band often.
5. **Is multilingual a v1 or v2 ambition?** C is the highest-impact idea on this list for a specific persona, but also the riskiest. May need a separate content-quality workstream.

None of these block starting. They're the calls we'll have to make when Chapter Concierge lands on the build list.
