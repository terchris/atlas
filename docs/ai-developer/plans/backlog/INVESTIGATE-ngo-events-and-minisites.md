# Investigate: NGO chapter-page events and minisites

> **IMPLEMENTATION RULES:** Before implementing any plan from this investigation, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog (parking lot — not yet investigated)

**Goal**: Decide how, and whether, to enrich Atlas's `dim_chapter` / `dim_activity` model with sub-activity data from NGO websites that go deeper than the per-chapter page — events listings (`localBranchEvents`), minisites for specific programmes (`minisites/*`), and per-activity instructor / capacity / schedule data.

**Last Updated**: 2026-04-24

---

## Why this exists

NGO chapter pages typically expose a **shallow** activity taxonomy. For Norsk Folkehjelp, the lokallag page lists 6 canonical bins (Førstehjelp og redningstjeneste, Sanitetsungdom, Samfunnsarbeid, Flyktning og inkludering, Internasjonale spørsmål, Solidaritetsungdom). Whether a given chapter actually runs **språkkafé** vs **leksehjelp** vs **kvinnefellesskap** under "Flyktning og inkludering" is not visible at the chapter-page level — these sub-activities live on:

- **Minisites** (e.g. `folkehjelp.no/minisites/{slug}`) — programme-specific landing pages, sometimes per-chapter, sometimes regional or national.
- **Local-branch events** (`folkehjelp.no/localBranchEvents/*` per the sitemap) — calendar-style listings of upcoming activities at each chapter.
- **Per-NGO equivalents** — Red Cross has chapter event lists (`rodekors.no/lokallag/{slug}/aktiviteter`); N.K.S. has `nkstotal.no` with per-aktivitet pages; etc.

For the Coverage-gap explorer's MVP we accept the shallow-taxonomy loss (see [`INVESTIGATE-folkehjelp-supply.md`](./INVESTIGATE-folkehjelp-supply.md) Section C for the rationale). This file collects the future-work ideas so we don't lose them.

Anything that materialises from this investigation builds on the toolkit defined in [`INVESTIGATE-ngo-scraping-infrastructure.md`](./INVESTIGATE-ngo-scraping-infrastructure.md) — Crawlee + per-source folder convention + `raw.sitemap_log` + `raw.ingest_runs` apply equally to events/minisites scrapes.

---

## What this investigation should cover (when promoted to active)

1. **Inventory of deep sources per NGO** — what additional URLs each Tier A NGO exposes beyond their chapter page. NF: minisites + localBranchEvents. Red Cross: per-chapter activity tabs + the "Finn nærmeste lokallag" finder. N.K.S.: nkstotal.no programme pages. Mental Helse: hjelpetelefonen + sidetmedord pages. Etc.
2. **Schema implications** — does sub-activity granularity fit `dim_activity` directly (one extra row per sub-activity per chapter), or does it need a new `dim_subactivity` / `chapter_subactivity` link? Could become an EAV problem if not careful.
3. **Event-vs-activity distinction** — an event is a one-off (date + duration); an activity is a recurring offering. They probably need different tables. `fact_chapter_events` (date + activity_id + chapter_id)? Or treat events as just a signal that the activity is currently running?
4. **Refresh cadence** — events change weekly / daily; activities change rarely. Two scrape lanes with different schedules?
5. **Ingest cost** — minisites + events could 10× the page count per NGO (NF goes from 121 chapter pages to potentially 1 000+ event pages). Crawlee can handle it, but bandwidth + DB volume + change-detection cost grow.
6. **Value vs cost** — what new questions can the Coverage-gap explorer answer with sub-activity data that it can't answer today? Persona-driven: walk through Kari's, Inger's, Arne's questions and check which actually need this granularity vs which are satisfied by chapter-level bins.
7. **Cross-NGO comparison concerns** — if NF starts exposing språkkafé per-chapter via events, but Red Cross still aggregates Norsktrening at the chapter level, cross-NGO comparison gets uneven. Document the asymmetry policy.

---

## Ideas to capture (not yet structured)

- **Pull instructor/contact info** — many event pages list a kontaktperson with email/phone. Useful for "find the nearest språkkafé" but PII-sensitive. **Tension with [scraping infra §D.3](./INVESTIGATE-ngo-scraping-infrastructure.md#d3-no-pii--contact-information)** ("we do not store this"). Promotion to active requires a privacy review and likely a deliberate carve-out from the no-PII policy; default position is "don't ingest".
- **Schedule / opening hours** — recurring event series ("hver onsdag 18:00-20:00") could populate a `chapter_schedule` table.
- **Capacity signals** — events that say "fullt" or "venteliste" are a demand signal Atlas could surface.
- **Cross-link to Lottstift / funding** — if a chapter receives Lottstift earmarked for a specific activity, that's a verification signal that the activity actually runs.
- **Geocoding events** — events sometimes happen at a venue that isn't the chapter's main address (school, library, Frivillighetssentral). Per-event geocoding could improve "nearest" queries.
- **AI summary of long-form chapter text** — chapter "Om oss" sections are free-text Norwegian. A small LLM pass per chapter could extract: focus areas not captured in the bin taxonomy, target-population descriptions, frequency of activity. Cost: ~$0.01/chapter via Haiku; ~$1 for 100 NGO total. **Tension with [scraping infra Q16](./INVESTIGATE-ngo-scraping-infrastructure.md#why-this-exists)** ("LLM involvement at this scale, if any, stays at authoring time, not in the runtime path"). If pursued, this is an authoring-time enrichment one-shot, not a per-run extraction step.
- **Verification-by-event-presence** — a chapter listing "Flyktning og inkludering" but having no events in that area for 6+ months might be effectively dormant on that activity. Compute a `last_event_at` per (chapter, activity).

---

## Status

This is a **parking lot**. Do not promote to active without first:

1. Shipping at least 2 NGO chapter-level ingests (Folkehjelp + one more) so the trade-off is concrete.
2. Identifying a Coverage-gap query that the chapter-level taxonomy cannot answer.
3. Reviewing PII implications with whoever-handles-Atlas-privacy.
