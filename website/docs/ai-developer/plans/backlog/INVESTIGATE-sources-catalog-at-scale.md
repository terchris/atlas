# Investigate: A sources catalog surface for `atlas.sovereignsky.no` that holds up at 200 datasets

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide the architecture for a public-facing dataset catalog on the Atlas docs site (`atlas.sovereignsky.no/sources`) whose source of truth is the per-source `manifest.yml` files, and which remains usable when Atlas grows from today's 41 sources to a target of 200+. Inspired structurally by [`tmp.sovereignsky.no`](https://tmp.sovereignsky.no/) ([dev-templates](https://github.com/helpers-no/dev-templates)) but corrected for the higher cardinality, the heterogeneous publisher mix, and the multi-axis filtering that statistical datasets need.

**Last Updated**: 2026-05-12 (five same-day revisions: initial draft → persona-research grounding → single-surface v1 framing → web-shop reframe → **all 45 decisions resolved**, see "Decisions resolved" section. Ready to spawn child PLAN.)

**Origin**: User asked for a promotional/educational catalog on the docs site that mirrors how dev-templates surfaces its templates (`/templates` landing → category groups → per-item page, all derived at build time from per-item YAML). Atlas already has 41 `manifest.yml` files and is expected to onboard well past 200 as Norwegian public sources (SSB, FHI, Bufdir, Brreg, Helsedirektoratet, Kartverket, …) and NGO-supply sources are added. The user explicitly flagged that the dev-templates pattern works for ~10 items but is unlikely to work for 200 — this INVESTIGATE captures what changes at that scale. After the first draft, the user pointed at the existing persona research ([`personas.md`](../../../about/personas.md), [`docs/research/persona-data-opportunities.md`](https://github.com/terchris/atlas/blob/main/docs/research/persona-data-opportunities.md)) and asked that it inform the design — see the rewritten **Audience** section and the persona-driven questions **[Q30]**–**[Q36]**.

---

## Scope

**v1 deployment context (2026-05-12):** Per [INVESTIGATE-deployment-pipeline.md](INVESTIGATE-deployment-pipeline.md), Atlas's **single human-facing surface in v1 is `atlas.sovereignsky.no`** (Docusaurus on GitHub Pages). The Next.js customer frontend (`atlas-frontend/`) is kept in the repo but not deployed. PostgREST is at `api-atlas.sovereignsky.no` (renamed from `api-atlas.helpers.no` on 2026-05-11; some sibling docs still carry the old hostname pending a sweep). This means the sources catalog is part of the same site as the rest of the Atlas public surface — not a sibling of a separate customer app.

**In scope:**
- The `/sources` (and `/sources/<…>`) surface on the Docusaurus site at `atlas.sovereignsky.no`.
- The generation pipeline from `atlas-data/ingest/src/sources/*/manifest.yml` → website data → rendered pages.
- The taxonomy that organises sources (categories, facets, search).
- The per-source page contract — what fields are required, what is optional, what is generated vs hand-authored.
- The manifest schema evolution needed to support all of the above at 200.

**Out of scope (handled by sibling investigations / plans):**
- The operational `/data/[schema]/[table]` interactive table viewer — covered by [PLAN-008-developer-discovery-surface.md](PLAN-008-developer-discovery-surface.md). That PLAN was originally written for the now-deferred Next.js customer frontend; if it lands on the Docusaurus site instead, the catalog still links *to* it (where deployed) but doesn't try to replace it.
- The MCP / programmatic discovery surface for LLM agents — covered by [INVESTIGATE-data-discovery-surface.md](INVESTIGATE-data-discovery-surface.md) and [INVESTIGATE-semantic-foundation-before-expansion.md](INVESTIGATE-semantic-foundation-before-expansion.md).
- DCAT-AP-NO / EU Data Theme / LOS interop and harvestability by `data.norge.no` — covered by [INVESTIGATE-felles-datakatalog-classification.md](INVESTIGATE-felles-datakatalog-classification.md). This INVESTIGATE *consumes* `eu_theme` (already in the manifest) but does not decide DCAT publishing.
- Per-measurement pages (`measurements/`) — different cardinality (one per `(source_id, contents_code)` pair, easily 1000+).
- Per-concept pages (`concepts/`) — different cardinality and scope.
- The Scalar `/api` playground (already shipped) and dbt-docs `/lineage/` (already shipped) — sibling surfaces on the same site that the catalog links *to*.

---

## Audience — grounded in the existing persona research

Atlas already has detailed persona research: the public-facing [`personas.md`](../../../about/personas.md) (16 named personas, tiered primary/secondary/tertiary) and the longer internal-research synthesis [`docs/research/persona-data-opportunities.md`](https://github.com/terchris/atlas/blob/main/docs/research/persona-data-opportunities.md) (data needs per persona). The persona research was written assuming a separate customer frontend would host the activity-finder / chapter-finder experience; in v1 that frontend is not deployed, so `atlas.sovereignsky.no` is the only public Atlas surface. That doesn't change *which* personas land on `/sources` — it just means the activity-finder personas (Kari, Amira, Sara, Åse) are under-served by v1 Atlas overall, not "served by another surface". The sources catalog has a narrower audience — the personas who arrive *wanting to understand the data itself*, not the activities or chapters that data eventually powers.

### Personas who land on this surface (in priority order for catalog design)

| # | Persona | What they want from `/sources` | Quote from persona research |
|---|---|---|---|
| 15 | **Dev** — developer exploring Norwegian civil-society data | An *"Om dataene"* page: what sources Atlas uses, what each contributes, scrape cadence, links to originals, link to repo, enough context to build on the same stack | *"this is a good reference for how to build on Norwegian civil-society data"* |
| 6 | **Ola** — "I want to see the numbers" (journalist / researcher / student) | Citation-ready data: every metric carries source URL, year, methodology, last fetched. Cross-source comparable. Downloadable. | *"facts, data, context across the sector … with sources, and a path into deeper data"* |
| 11 | **Lisa** — tilskuddsansvarlig (NGO grant officer) | Need-data with provenance she can cite in a grant application; understand which sources cover which target groups, geographies, age ranges | *"draft applications that cite real need data"* |
| 2 | **Jonas** — "I want to donate, but meaningfully" | Methodology notes on funding-truth sources (so he doesn't trust naive efficiency comparisons) | *"missing or stale financial data … Innsamlingskontrollen numbers lag"* |
| 7 | **Inger** — chapter leader | Every field has provenance + last-seen + a "meld feil" path; she trusts public renderings *because* she can see where the data came from | *"public confidence flags: 'from API', 'from chapter page', 'from Brreg', 'not recently verified'"* |
| 12 | **Magnus** — existing active volunteer | Same provenance / correction expectations as Inger; route errors to the correct source owner | *"no way to report inaccuracies"* (a bounce trigger) |
| 8, 9, 13 | **Arne / Signe / Henrik** — internal planners and corporate partnerships | Cross-source comparable metrics; understand which sources can join (`kommune_nr`, `orgnr`, year) | *"comparable metrics that internal single-org tools usually miss"* |

**Personas who do NOT land here primarily** — Kari, Amira, Lars, Sara, Åse, Tone. Their wants (an activity-finder, a chapter-finder, a crisis-resource band) belong on a different kind of surface. In v1 that surface doesn't exist (the Next.js `atlas-frontend/` is in the repo but not deployed); when it returns or is rebuilt on Docusaurus, the sources catalog will be one click away from it via a footer / "Om dataene" link. Optimising the catalog for these personas would produce activity-finder UI on a docs site — wrong shape for the data it carries.

**Search engines + LLMs that index public docs** remain a real audience — Atlas wants its sources surfaced when someone searches *"Norwegian kommune mobbing statistics"* on Google or asks Claude *"what's the best source for Norwegian child poverty rates?"*. This is not a persona but a discovery channel; it informs **[Q19]** (Schema.org markup) and **[Q21]** (sitemap), not the page structure.

### What the persona analysis changes vs. a generic-audience reading

Several design implications flip once we ground the audience in named personas rather than vague "explorers":

1. **"Shop window" was wrong framing.** Dev and Ola explicitly do NOT want marketing copy (*"marketing copy in place of data"* is one of Ola's bounce triggers in `personas.md`). The catalog is a **research surface with provenance** — closer to a citation database than a brochure. This tilts **[Q9]** away from rich editorial prose and toward dense, factual, source-linked structure.

2. **Provenance is first-class, not chrome.** Inger, Magnus, Dev, and Ola all flag missing/unclear provenance as a bounce trigger. `last_updated`, `attribution`, `source_url`, `license`, and methodology notes must be visible above the fold on every per-source page — not hidden in a footer or a tab.

3. **"Meld feil" workflow has real demand.** Inger and Magnus both name it. The personas research is explicit: *"a clear 'meld feil' or 'kontakt kapitlet' path routed to the correct organisation"*. For sources, this routes to either a GitHub issue (Dev-friendly) or to the upstream publisher's own feedback channel. New question added below (**[Q31]**).

4. **Citation-ready metadata is high-value.** Ola wants to cite Atlas; Lisa wants to cite sources in grant applications. This makes Schema.org JSON-LD (**[Q19]**) and a per-source "How to cite this" block more than nice-to-haves. New question (**[Q32]**).

5. **Cross-source comparability matters more than per-source depth.** Arne, Signe, Henrik, and Ola all want side-by-side views. A "compare these sources" or "join-key crosswalk" view is higher leverage than long-form per-source prose. New question (**[Q33]**).

6. **Norwegian/English mix is unavoidable.** Source titles are Norwegian (*"07459: Alders- og kjønnsfordeling …"*); methodology notes will be Norwegian; dimensions are Norwegian codes; Dev is potentially international; Ola is Norwegian. The catalog must render mixed-locale content gracefully — **[Q12]** sharpens from "should we localise?" to "how do we handle mixed-locale content without breaking search?"

Out of audience for this surface (covered elsewhere):
- Developers building against the API → Scalar at `atlas.sovereignsky.no/api` (live) + OpenAPI from `api-atlas.sovereignsky.no` / PLAN-008 once it relocates.
- Atlas contributors adding a new source → `website/docs/contributors/adding-a-source.md` / PLAN-003.
- Agents introspecting the schema programmatically → MCP, not HTML / INVESTIGATE-semantic-foundation-before-expansion.

---

## Current state

- 41 `manifest.yml` files at [`atlas-data/ingest/src/sources/<id>/manifest.yml`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources), all conforming to the schema bootstrapped by PLAN-007 / `bootstrap-manifest.ts`.
- Every source has a sibling `README.md` (verified — 41 of 41).
- Manifest fields available today: `source_id`, `upstream_id`, `upstream_url`, `upstream_landing_page`, `upstream_title`, `description`, `publisher`, `license`, `license_url`, `periodicity` (ISO 8601 like `P1Y`), `eu_theme`, `attribution`, `tags.{provider,topic,geo,cadence}`, `dimensions[].{code,meaning,value_format,notes}`, optional `raw_tables[]`.
- Distribution of `tags.topic` over 41 sources: health (12), demographics (10), income (5), education (5), social (4), ngo-supply (3), reference (2).
- Distribution of `eu_theme`: SOCI (25), HEAL (11), EDUC (5), GOVE (2), JUST (1).
- The Atlas docs site is Docusaurus 3.10, doc route `/`, sidebar already reserves an empty "Sources" category at [`website/docs/sources/`](https://github.com/terchris/atlas/tree/main/website/docs/sources). No React components exist yet (`website/src/` is css-only). Search is via `@easyops-cn/docusaurus-search-local` (already installed).
- No category metadata exists yet — the `tags.topic` strings are the closest thing.
- Adjacent PLAN-008 (lineage panel + Scalar) is for the **customer frontend**, not the docs site. No overlap; complementary.

---

## The scaling problem in concrete terms

The dev-templates pattern works because (a) ~10 templates fit on one screen, (b) categories are ≤7 and curated by hand, (c) every template's prose section is short and singular. Atlas at 200 violates all three. Specifically:

| Concern | At 41 | At 200 (projected) | What breaks |
|---|---|---|---|
| Flat grid of all sources on one page | Scrolls one screen | Scrolls 5+ screens, ~2 MB DOM | "Browse all" stops being useful; users need search/filter |
| Categories | 7 topics, balanced | Topics will explode (health → mental, physical, substance, media; social → housing, immigration, family) **or** topics will skew (SOCI absorbs 80%) | Flat single-axis taxonomy stops discriminating |
| Per-source MDX pages | 41 files, ~5 KB each, ~200 KB total | 200 files, ~5 KB each, ~1 MB total + 200 sidebar entries | Sidebar becomes navigable only via search; build time grows |
| Editorial prose | Manageable to hand-author one paragraph per source | 200 × paragraph is real ongoing editorial overhead | Either prose quality degrades or the catalog ships stub pages |
| Search vocabulary | `mobbing` works because it's in 1 description | `mobbing` returns 8 sources — which to surface? | Search needs ranking signals beyond presence |
| Multi-affiliation | `fhi-vgs-gjennomforing` is education *and* demographics — pick one | Many sources legitimately belong to 2-3 buckets | Single `tags.topic` forces a poor choice |
| URL stability | Few enough to manage manually if a category changes | Recategorisation under `/sources/<cat>/<id>` rewrites hundreds of URLs and breaks SEO + citations | Path design becomes a 5-year commitment |
| Manifest field gaps | Few enough that gaps are noticeable per-PR | Gaps systematic and only fixable by schema change | Need to decide *now* which fields are required at scale |

These are not hypothetical at 200 — most start biting around 80-100. We should design for 200 because Norway alone has more than 200 publicly-funded statistical tables at SSB + FHI + Bufdir + Brreg + Helsedir + Utdanningsdirektoratet + Politiet + Kriminalomsorgen + Kartverket + Miljødirektoratet + Vegvesenet etc., and the [INVESTIGATE-new-norwegian-public-sources.md](INVESTIGATE-new-norwegian-public-sources.md) backlog already names dozens more candidates.

---

## Prior art — how mature catalogs handle this

Worth surveying before deciding, because most of these problems are 20 years old in the data-portal world.

| Catalog | Scale | What they do | Lesson for Atlas |
|---|---|---|---|
| [data.norge.no](https://data.norge.no/) (Felles datakatalog) | ~12 000 datasets | Faceted search as primary surface; facets on Tema (LOS), EU-tema (13 buckets), Utgiver, Format, Lisens, Tilgangsnivå. No "browse all" page. Per-dataset page is rich DCAT-AP-NO. | At scale, facets replace categories. Categories become **one facet** among many. |
| [data.europa.eu](https://data.europa.eu/) | ~1.7M datasets | Same — facets first, search-driven. EU Data Theme is the primary thematic facet. | Confirms the pattern. EU Data Theme is the right cross-publisher axis Atlas already has (`eu_theme`). |
| [Datasette catalogs](https://datasette.io/) (e.g. [global-power-plants](https://global-power-plants.datasettes.com/)) | 10s–1000s | Single landing page enumerates tables; per-table page shows schema, sample rows, faceted column filters. Tables are first-class URLs. | Per-table direct-link approach works at moderate scale. Atlas can do the same per source. |
| [OpenMetadata](https://docs.open-metadata.org/) | Enterprise-scale (10k+) | Hierarchical browsing (Service → Database → Schema → Table) + global search + glossary + tags + lineage. No flat "all assets" page. | If Atlas ever has 1000+, OpenMetadata's hierarchy is the precedent. Adjacent INVESTIGATE-data-discovery-surface already debates adopting it. |
| [HuggingFace datasets](https://huggingface.co/datasets) | ~200 000 | Tag-cloud landing + free-text search + filter sidebar. No fixed category list — every dataset has multi-label tags, the UI surfaces popular tags as filters. | At very large scale, fixed categories fail and **multi-label tags + search** wins. |
| [CKAN](https://ckan.org/) (powers many government portals) | 1k–100k | Group + Tag + Organization + free-text. Group is a curated topic; Tag is open. | Hybrid: curated groups *and* open tags coexist. |
| [dev-templates](https://tmp.sovereignsky.no/) (our reference) | ~10 | Flat grid + curated single-axis category. | Works at this scale only. Atlas can use it for the front page but not as the *whole* surface. |
| [Schema.org / `Dataset` markup](https://schema.org/Dataset) | n/a | Standard structured-data markup that makes datasets discoverable by Google Dataset Search. | Cheap to emit per-source. Worth doing — wide audience reach for one-time work. |

**Patterns that recur**:
1. Faceted filter sidebar (not a single category axis).
2. Multi-label tags (a source belongs to many buckets, not one).
3. Search is primary at > 100 items.
4. Per-item URL is stable (`/dataset/<id>` not `/dataset/<cat>/<id>`).
5. Structured-data markup (Schema.org/DCAT) ships alongside the HTML.

---

## The web-shop reframe — sell datasets, don't catalogue them

The prior-art survey above lands us in **data-catalog space**. Those surfaces are designed by data people for data people. They scale to thousands of entries because they assume the visitor already knows what they want and has a vocabulary to search with. **Most Atlas visitors will not.** Kari doesn't know SSB table 07459 exists; she Googles *"ensomhet eldre Norge"* and lands somewhere. Jonas doesn't know "Innsamlingskontrollen" by name. Ola doesn't browse the SSB Statbank — he reads sector reports.

Web shops solve this exact problem at much larger scale. Amazon sells ~600 million products; visitors find what they want despite never having heard of half the catalog, because the surface is built around **promoting unknown items to people who have a need but no vocabulary**. That's the framing this INVESTIGATE should adopt — **the goal is to sell datasets, not to enumerate them.**

This is not a contradiction of the Ola-driven anti-marketing-copy rule from the persona section — it's a clarification of *where in the funnel marketing belongs*. Ola bounces from marketing copy **on the data** (*"each kroner matters"* in place of a real number). Ola is fine with marketing copy on **discovery surfaces** — an editorial collection titled *"Five datasets every grant application about child poverty cites"* tells him exactly where to look. Marketing lives upstream of the data; evidence lives on the data page itself.

### What e-commerce patterns translate to Atlas

| E-commerce pattern | Web-shop example | Atlas equivalent | Why it matters here |
|---|---|---|---|
| **Curated collections** | Amazon "Gift guides", IKEA "Working from home" room scenes | Editorial dataset bundles for named use cases: "Grant-application essentials" (Lisa), "NGO funding-truth" (Jonas), "Kommune child-welfare" (Arne) | Value lives at the *intersection* of datasets, where real questions get answered |
| **Featured / spotlight** | Amazon homepage hero, App Store "Editor's choice" | "Dataset of the week" on `/sources` front page; quarterly editorial picks | Forces the editor to articulate value; gives visitors a way in |
| **Frequently bought together** | Amazon product page, IKEA bundles | "Frequently joined with" — `kommune_nr`-shared sources, time-aligned indicators | Surfaces the joinability value that makes Atlas more than the sum of its sources |
| **Recommendations** | Spotify Discover Weekly, Netflix carousels | Same-topic, same-publisher, same-geo siblings; later, observed joint usage from `marts.lineage` | Helps the curious researcher widen scope without re-searching |
| **Brand pages** | Amazon publisher / author storefronts | Per-publisher landing pages: `/sources/by/ssb`, `/sources/by/fhi`, with publisher logo, "all 17 SSB datasets in Atlas" | Norwegian readers trust SSB; surfacing the publisher prominently inherits that trust |
| **Social proof** | Reviews, ratings, "1,247 customers bought this" | Citation count ("used in 4 Atlas models", "referenced by 2 sector reports"); endorsement strings | Substitutes for ratings in a domain where ratings don't apply |
| **Freshness as urgency** | "In stock now", "New arrival" | "Last refreshed yesterday", "Just added this week"; RSS for new ingests | Freshness is genuinely actionable here — Ola and Jonas both care |
| **Visual richness** | Product photos, gallery, video | Sparkline of time coverage; geographic-coverage thumbnail map (tiny Norway SVG); sample-row preview; publisher logo | Text-only catalogs feel inert; small visual hints carry a lot of UX weight cheaply |
| **Category landing pages, not filters** | IKEA's Living Room, Bedroom — each its own editorially-laid-out page | Per-category index with editorial framing (*"Health data in Atlas: 12 sources covering …"*), not a tag-filter result | Categories that read like pages outperform categories that read like search results |
| **Search is fallback, not primary** | Amazon homepage is browse-heavy; search exists but homepage is editorial | `/sources` is curated and visual; faceted `/sources/browse` exists for power users | Mirrors how visitors actually arrive — mostly via Google to a deep page, then browse |

### What doesn't translate

- **Price / scarcity / urgency** — datasets are free, abundant, stable. Don't fake urgency. Freshness is the soft equivalent.
- **Reviews and ratings** — public statistical datasets aren't products one *rates*. Substitute with citation / usage signals, not stars.
- **Personalisation by purchase history** — no accounts in v1. Recommendations must be content-based (same topic, joinable keys), not behavioural.
- **Cart and checkout** — no buy flow. The "transaction" is copy-citation, copy-query, or follow-link-to-upstream. Reframe: every page has a clear *primary action*, not a buy button.
- **E-commerce-scale editorial teams** — Atlas has one editor. Web shops curate weekly with staff. Atlas must design for a *curate-once-per-quarter* rhythm with derived signals (joinable, recently-refreshed, citation count) filling the gaps.

### What this reframes in earlier sections

- **[Q1]** primary navigation: option **(c) hybrid — curated front page + faceted browse** is reinforced. The front page becomes a *shop window*: hero with editorial pick, "What's new", featured collection, category grid. Browse-all stays as the power-user surface.
- **[Q9]** prose: persona section pushed toward "evidence-first, no marketing copy". That still applies on the **per-source page**. On **landing and browse surfaces**, editorial framing is the point — Ola doesn't bounce from a collection page because it's not pretending to be data.
- **[Q17]** parking-lot "featured/spotlight": promoted from parking-lot to first-class. The web-shop reframe makes this a Phase-1 question, not a v2 question.
- **[Q11]** lifecycle badges: read as **product status** ("In stock" / "Pre-order" / "Discontinued"), not just metadata. Stable = green badge, beta = yellow, deprecated = greyed card.
- **[Q36]** per-source page section order: still evidence-first below the header, but the **header itself becomes the hero / buy-box** — publisher logo, license badge, freshness, primary action (copy-query, view-data). Mirrors a product detail page above the fold.

---

## Questions to Answer

The questions below use the `[Q<N>]` convention from PLANS.md. They are listed in roughly the order they need answering — earlier questions constrain later ones.

### Taxonomy and navigation

1. **[Q1]** **Primary navigation pattern**: at 200 sources, is the front page a **(a) curated category grid** (dev-templates style, breaks at scale), **(b) faceted filter UI** (data.norge.no style, looks like a query tool, heavy chrome), or **(c) hybrid — short curated front page that links into faceted "all sources" page** (CKAN/HuggingFace style)?

2. **[Q2]** **Single category axis or multi-label tags?** Today `tags.topic` is single-valued. Many sources legitimately belong to 2-3 topics (`fhi-vgs-gjennomforing` is *education* + *demographics*; `fhi-mediebruk-some` is *health* + *media* + *youth*). Do we (a) keep single `topic` for primary nav and add a separate `tags[]` array for multi-label, or (b) make `topic` itself multi-valued?

3. **[Q3]** **Where does the curated category list live?** Same `source-categories.yaml` pattern as dev-templates ([template-categories.yaml](https://github.com/helpers-no/dev-templates/blob/main/templates/template-categories.yaml)) — yes/no? If yes, where on disk: `atlas-data/ingest/src/sources/source-categories.yaml` (alongside sources, shared with ingest tooling), or `website/docs/sources/_categories.yaml` (docs-only)?

4. **[Q4]** **Subcategorisation at 200**: when `health` has 30+ entries and `social` has 60+, do we (a) split into subcategories editorially (mental-health, physical-health, substance, media), (b) rely on facets + search to slice, or (c) accept long category pages?

5. **[Q5]** **Which facets become first-class** (visible filter chips, not just buried fields)? Candidates: `provider` (SSB/FHI/…), `geo` (kommune/fylke/national), `eu_theme`, `cadence` (annual/irregular/…), `license` (NLOD/internal/permissive), `time_coverage` (recent/historical/long-running), `freshness` (current/stale), `lifecycle` (stable/beta/deprecated). Pick a minimal set — every facet adds chrome and editorial discipline.

### URLs and routing

6. **[Q6]** **Per-source URL shape**: `/sources/<id>` (Datasette/HF pattern — stable under recategorisation, simple) or `/sources/<category>/<id>` (dev-templates pattern — tells a path-aware reader the topic, but breaks if categorisation changes)?

7. **[Q7]** **One MDX per source vs single dynamic [id] route**: dev-templates generates 9 MDX files. Atlas at 200 means 200 MDX files. Pros of generated MDX: stable URLs, indexable, hand-authored prose can sit alongside generated blocks, each page is in the sidebar. Cons: 200 sidebar entries, big PR diffs on schema change, harder to keep prose fresh. Alternative: one `pages/sources/[id].tsx` route that renders dynamically from `sources-registry.json` — no MDX per source, no sidebar bloat, harder to add prose.

8. **[Q8]** **Sidebar treatment**: at 200 sources, the Docusaurus sidebar should probably not enumerate every source. Options: (a) sidebar shows categories only, sources are reached from category pages; (b) sidebar shows nothing under "Sources" except the landing page, browse is purely on the rendered pages; (c) sidebar enumerates everything (default Docusaurus, breaks at 200).

### Content and editorial

9. **[Q9]** **Per-source prose**: required, optional, or generated? At 200 we cannot rely on per-source hand-authored long-form. Options: (a) generate everything from manifest + `dimensions[]` (no prose), (b) use the existing per-source `README.md` as the prose body (already exists for 41/41), (c) keep prose optional — generated structured blocks always, prose appended where written.

10. **[Q10]** **README integration**: the per-source READMEs at `atlas-data/ingest/src/sources/<id>/README.md` are currently written for contributors (ingest mechanics, troubleshooting). Reusing them on the public docs site needs editorial alignment — do we (a) embed READMEs as-is (mismatch in audience), (b) split README into a `## Public summary` section that the website pulls (added burden on contributors), or (c) introduce a separate `description.md` file per source for the public-facing prose, leaving READMEs operator-focused?

11. **[Q11]** **Lifecycle status surfacing**: at 200 some sources will be beta, deprecated, or temporarily broken. Where does the status live (new manifest field `lifecycle: stable|beta|deprecated|broken`?), and how does the catalog render it (badge, separate "deprecated" section, hidden by default)?

12. **[Q12]** **Localisation**: search vocabulary is bilingual today (`mobbing`, `kommune`, `bor alene` are Norwegian; `census`, `health`, `kommune` are English). Atlas docs are English-only in [docusaurus.config.ts](https://github.com/terchris/atlas/blob/main/website/docusaurus.config.ts), but Norwegian terms appear in titles and descriptions. Do we (a) keep single-locale and accept mixed-language search, (b) add Norwegian as a separate locale, (c) tag terms with locale metadata in the manifest?

### Manifest schema evolution

13. **[Q13]** **Required fields at 200 that are optional/absent at 41**. Candidates the catalog UI would benefit from:
    - `last_updated` (ingest date — already in `mart_ingest_health`, not in manifest; could be looked up at build time)
    - `time_coverage.start` / `time_coverage.end` (the years this source covers)
    - `geo_resolution_level` (kommune / fylke / nasjon / bydel / NUTS-X) — partially in `tags.geo`, but ordinal not categorical
    - `lifecycle` (per Q11)
    - `quality_notes` (known caveats — pre-2020 kommune reform, sampling issues, etc.)
    - `suggested_joins` (which other source_ids pair naturally — for "you might also like")
    - `primary_key` (which dimensions form the natural key — useful for the dimensions table)
    - `sample_query` (one PostgREST URL the reader can click to see real data)
    - `tags[]` (multi-label, per Q2)
    - `subtopic` (per Q4)

    Which of these are required at 200, optional, or rejected? Each adds editorial burden but each gives the catalog a more useful surface.

14. **[Q14]** **Field origin — author vs derived**. Some fields can be computed (`last_updated` from ingest health; `dimensions[].cardinality` from raw row counts; `sample_query` from a primary-key template). Author burden is real — derive what we cleanly can. Which fields are derived (and by which job) vs author-supplied?

15. **[Q15]** **Manifest schema validation**: today `bootstrap-manifest.ts` and `fill-manifest-todos.ts` initialise fields but no schema validator enforces them. At 200, do we (a) add a JSON Schema (`manifest.schema.json`) and a CI gate that runs on every PR touching manifests, (b) lean on osmosis-style "every field documented" gates, or (c) accept best-effort?

### Generation pipeline

16. **[Q16]** **Generator location**: at the repo root (dev-templates pattern: `scripts/generate-registry.ts`), in `website/scripts/` (where [snapshot-openapi.mjs](https://github.com/terchris/atlas/blob/main/website/scripts/snapshot-openapi.mjs) and [snapshot-lineage.mjs](https://github.com/terchris/atlas/blob/main/website/scripts/snapshot-lineage.mjs) already live), or in `atlas-data/ingest/scripts/` (closer to the source data)?

17. **[Q17]** **CI gate behaviour**: when `manifest.yml` changes but `sources-registry.json` isn't regenerated, does CI (a) fail the build (forces contributors to run the generator locally), (b) auto-regenerate and commit on a bot account, (c) regenerate at build time without committing (no diff in repo, no drift detection)? The osmosis gate at [`atlas-data/dbt/check-osmosis.sh`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/check-osmosis.sh) is the precedent — option (a).

18. **[Q18]** **Registry shape**: one big `sources-registry.json` (dev-templates pattern, ~200 KB at 200 sources, loaded on every page) or one JSON per source + an index file? Splitting helps lazy-load per-source pages but complicates the build.

### Discoverability and standards

19. **[Q19]** **Schema.org `Dataset` markup**: emit JSON-LD `<script type="application/ld+json">` on each per-source page so Google Dataset Search and LLM crawlers index Atlas? Cheap, well-defined, big audience-reach payoff.

20. **[Q20]** **DCAT-AP-NO catalog endpoint**: this surface and the DCAT-AP-NO catalog discussed in [INVESTIGATE-felles-datakatalog-classification.md](INVESTIGATE-felles-datakatalog-classification.md) feed off the same manifest data. Do we ship a `/catalog.ttl` (or `/catalog.jsonld`) from this PLAN, or strictly defer to the Felles datakatalog INVESTIGATE? Lean: don't conflate — this PLAN delivers the human catalog, the DCAT endpoint is a follow-up PLAN that reads the same generator output.

21. **[Q21]** **Sitemap + OpenGraph cards per source**: free with Docusaurus for MDX pages; needs explicit handling if we go single-route ([Q7]) dynamic.

### Cross-surface consistency

22. **[Q22]** **Relationship to the PostgREST API at `api-atlas.sovereignsky.no`**: each per-source page should link to the matching `api-atlas.sovereignsky.no/<table>` endpoint(s) so a curious reader can fetch real rows. With the v1 deploy collapsing onto `atlas.sovereignsky.no`, the related question becomes: does the catalog also embed Scalar-style "try it" UI inline (already shipped at `atlas.sovereignsky.no/api`), or just deep-link there with anchors? Lean: deep-link with an explicit "Try this query at /api" line per source, not inline embed (avoids duplication and loads stay fast).

23. **[Q23]** **Relationship to dbt docs at `/lineage/`** (shipped, PLAN-dbt-docs-at-lineage): each per-source docs page links to the matching node in the lineage graph, and the dbt docs page link back. Cheap, high-value.

24. **[Q24]** **Relationship to `measurements/`** (sidebar exists, empty): each source has 1-many `contents_code` values → 1-many measurements. The source page should list and link to its measurements, the measurements pages should link back. This is the strongest reason to handle source-level URLs as `/sources/<id>` (stable) — measurements pages will link to them by ID.

### Persona-driven requirements

These questions are derived directly from named persona needs in [`personas.md`](../../../about/personas.md) and [`persona-data-opportunities.md`](https://github.com/terchris/atlas/blob/main/docs/research/persona-data-opportunities.md). They didn't make it into the original list because the original audience framing was too generic; the persona review surfaced them.

30. **[Q30]** **Methodology-notes as a first-class manifest field** (driven by Ola, Jonas, Lisa). Methodology context — *"FHI Folkehelseprofil uses 3-year rolling averages"*, *"SSB low-income uses EU-SILC equivalised income"*, *"Bufdir Barnefattigdom counts children under 18 in households below 60% of median income"* — belongs prominently on the per-source page, not buried in `description`. New manifest field `methodology_notes:` (multi-line Markdown). Required for all sources at v1, or optional with a fallback to "no methodology notes yet — see upstream documentation"?

31. **[Q31]** **"Meld feil" / data-issue reporting per source** (driven by Inger, Magnus). Every per-source page needs a visible "Report a data issue" link. The personas research insists on *"routing to the correct source owner"*. Options:
    - **(a)** Auto-generated `mailto:` to a single Atlas contact — simple, but doesn't route by source.
    - **(b)** Pre-filled GitHub issue with `source_id` and section pre-populated — Dev-friendly, requires the reporter to have a GitHub account (excludes Inger).
    - **(c)** Two-button pattern: "Report to Atlas" (GitHub issue) + "Report to publisher" (links to SSB / FHI / NGO's own feedback channel from a new manifest field `feedback_url`).
    - Lean: option **(c)**, with the publisher link sourced from a new optional `feedback_url:` manifest field.

32. **[Q32]** **"How to cite this source" block** (driven by Ola, Lisa). Render a copy-clickable citation block on each source page:
    - One-line text citation: *"Statistics Norway (SSB), Table 07459: Alders- og kjønnsfordeling i kommuner …, accessed via Atlas (atlas.sovereignsky.no/sources/ssb-07459) on YYYY-MM-DD"*.
    - BibTeX block.
    - Permalink with a date-stamp anchor (so citations remain reproducible even if the page evolves).
    - Cheap to generate from existing fields (`publisher`, `upstream_title`, `upstream_url`, `attribution`). High persona impact.

33. **[Q33]** **Cross-source comparability view** (driven by Arne, Signe, Henrik, Ola). Provide a sibling page `/sources/joinable` (or `/sources/crosswalk`) that surfaces which sources share `kommune_nr` / `fylke_nr` / `orgnr` / year join keys and at what overlap. Build from existing `marts.lineage` + manifest `dimensions[].code` — no new data needed. Scope: ship in v1 as part of the sources catalog PLAN, or defer to a follow-up PLAN?

34. **[Q34]** **Stable anchor-ID contract for deep linkers** (driven by Dev, Ola, Inger; originally framed around the now-deferred customer frontend). Any future deep-linker — a re-deployed customer frontend, the Scalar `/api` page linking out, a third-party tool citing Atlas, an LLM crawler — should be able to land directly on the right section of a per-source page. What anchor IDs do we promise to keep stable across catalog rewrites? Lean: `#provenance`, `#methodology`, `#dimensions`, `#sample-query`, `#citation`, `#related`. These become part of the per-source page contract — renaming them later is a breaking change.

35. **[Q35]** **Freshness badge prominence** (driven by Ola, Inger, Dev, Magnus). Builds on parking-lot **[Q25]**, elevates it. Not just a colour-coded indicator — show the actual ISO date with `periodicity` context: *"Last fetched 2026-04-29 · Expected cadence annual · Next refresh by ~2027-04-29 · Source SSB Statbank"*. Drawn from `mart_ingest_health` at build time. Where on the page? (a) Inline with the title, (b) in a dedicated provenance block, (c) both. Lean: (c) — once in the header for at-a-glance, once in the provenance block with full context.

36. **[Q36]** **Per-source page section order — evidence-first, not narrative-first** (driven by Ola's anti-marketing-copy rule). Default dev-templates ordering puts a long descriptive paragraph at the top. Ola bounces from that. Proposed order for Atlas per-source pages, evidence-first:
    1. Header: title, publisher (linked), license badge, lifecycle badge, last-fetched timestamp.
    2. Provenance block: upstream URL, landing page, attribution string, methodology notes (**[Q30]**).
    3. Dimensions table — the actual schema.
    4. Sample query — a clickable PostgREST URL that returns real rows.
    5. Citation block (**[Q32]**).
    6. Related / joinable sources — link out to **[Q33]** crosswalk.
    7. Short prose summary (last, not first; one paragraph max).
    8. Footer: "Report a data issue" (**[Q31]**), "Edit on GitHub", "View ingest code", "View dbt model".

    This ordering also serves Dev — the technical fields come before the narrative.

### Promotion and merchandising (web-shop reframe)

These questions all flow from the "sell datasets, don't catalogue them" framing in the web-shop section above. They didn't exist in the original catalogue-style draft.

37. **[Q37]** **Curated collections as a first-class surface**. Editorial bundles around a named use case — *"Grant-application essentials for child poverty"* (Lisa), *"NGO funding-truth"* (Jonas), *"Kommune planning for elderly loneliness"* (Arne / Kari). Each collection has its own page (`/sources/collections/<slug>`) with editorial intro, ordered list of sources, and a "How to use these together" section explaining the joins. New YAML file `source-collections.yaml` defines them — a curated list, not derived from tags. Scope: ship in v1 with 3–5 hand-picked collections, or defer to v2?

38. **[Q38]** **Per-publisher brand pages**. `/sources/by/<publisher-slug>` (e.g. `/sources/by/ssb`, `/sources/by/fhi`, `/sources/by/bufdir`, `/sources/by/redcross`) with publisher logo, short editorial intro, list of all Atlas sources from that publisher, license summary, and a link out to the publisher's own portal. `publisher:` is already in every manifest — trivial to generate. Publisher trust transfers to Atlas via this association.

39. **[Q39]** **"Frequently joined with" on per-source pages**. Render related sources based on:
    - Shared join keys (`kommune_nr`, `fylke_nr`, `orgnr`, `year`) — derivable from manifest `dimensions[].code`.
    - Same `tags.topic` / `tags.geo`.
    - Manual `suggested_joins[]` from **[Q13]** when natural-join inference is wrong.
    - Eventually, observed joint usage from `marts.lineage` and [seeds/sources/lineage.csv](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/sources).

    Render as a horizontally-scrollable card row, Amazon "frequently bought together" style.

40. **[Q40]** **Social proof signals** on per-source pages. No reviews or ratings, but we can compute:
    - How many Atlas dbt models consume this source (from `marts.lineage`) → *"Used in 4 Atlas models"*.
    - How many Atlas docs pages reference it (from a build-time grep over `website/docs/`).
    - Whether it's part of any curated collection (per **[Q37]**) → *"Featured in 2 collections"*.
    - Future: external citations (sector reports, papers) — manual seed file initially, then automate.

    Render as small inline badges near the header, not stars. The goal is "this dataset is actually used", not "5 out of 5".

41. **[Q41]** **Visual richness per source**. Add cheap visual hints that text-only catalogs lack:
    - **Sparkline** of time coverage — one line per source, shows years available (e.g. 1986–2025 with gaps shaded).
    - **Geographic-coverage thumbnail** — a tiny SVG of Norway with covered regions shaded. Reused widely — render once per `geo_resolution_level` value (`kommune` / `fylke` / `bydel` / `national`), not per source.
    - **Sample-row preview table** — 3 rows fetched at build time from PostgREST and cached as JSON.
    - **Publisher logo** beside the title (SSB, FHI, Bufdir, Red Cross, etc. — all have publicly usable logos).

    Each is cheap individually; together they transform the page from "spec sheet" to "product detail page".

42. **[Q42]** **Per-source page as product detail page** — formal restatement of **[Q36]** in e-commerce terms. Above the fold = the "buy box":
    - Title, publisher logo, license badge.
    - Lifecycle badge — read as "In stock" / "Pre-order" / "Discontinued".
    - Freshness — *"Last refreshed 2026-04-29 · Next expected ~2027-04-29"*.
    - **Primary action button**: "Get this data" → expands an inline panel with copy-clickable PostgREST URL + curl + Python snippet. (E-commerce parallel: "Add to cart".)
    - **Secondary actions**: "Cite this source", "View upstream", "Report a data issue".

    Below the fold: provenance, methodology, dimensions, sample data preview, related sources, citation block, prose summary. Same content as **[Q36]** but reordered so the *primary action is above the fold*, not buried after the schema.

43. **[Q43]** **"New & noteworthy" feed**. A `/sources/new` page (and a homepage section) showing recently-added or recently-refreshed sources. Drawn from manifest add-date (git blame on the manifest file) + `mart_ingest_health` freshness. Also a per-page RSS / Atom feed for data-portal regulars who subscribe to such things — cheap to emit, real audience.

44. **[Q44]** **Use-case landing pages for primary personas**. Sister to **[Q37]** collections but persona-shaped, not theme-shaped. `/sources/for/grant-officers` (Lisa), `/sources/for/journalists` (Ola), `/sources/for/chapter-leaders` (Inger), `/sources/for/donors` (Jonas). Each page names the persona's task and the sources that serve it. **These are the persona research turned into navigable surfaces** — without them, the persona research stays in `personas.md` and never reaches a visitor.

45. **[Q45]** **Editorial cadence at single-editor scale**. Web shops curate weekly with editorial staff. Atlas has one editor. What rhythm is sustainable? Lean:
    - **Quarterly**: one curated collection (**[Q37]**), one use-case landing page (**[Q44]**).
    - **Auto-rotated**: "dataset of the week" pulls from a small `featured.yaml` editorial pool.
    - **Derived automatically**: "new & noteworthy" (**[Q43]**), social proof (**[Q40]**), joinable suggestions (**[Q39]**), freshness (**[Q35]**) — no editor needed once the generator is built.

    Tooling matters: every editorial surface must have an obvious YAML/Markdown source so curation is a 15-minute commit, not a 2-hour design session.

---

## Options analysis for the load-bearing questions

The 24 Qs are not equally weighted. Five of them set the architecture; the rest are decorations. The five are: **[Q1]**, **[Q2]**, **[Q6]**, **[Q7]**, **[Q9]**.

### [Q1] Primary navigation pattern

**Option A — curated category grid only** (dev-templates parity)
- *Pros*: Looks like dev-templates, low effort, narrative-first.
- *Cons*: Stops working past ~50. Hard recategorisation later.
- *Verdict*: Phase-1 only, must evolve.

**Option B — faceted filter UI**
- *Pros*: Industry-standard at scale. data.norge.no, HuggingFace, CKAN all do it.
- *Cons*: Looks like a query tool, not a shop window. Heavy UI for what should be welcoming. Wrong-tone for our explorer audience.
- *Verdict*: Right at 1000+, wrong at 200.

**Option C — hybrid: curated front page + facet-driven "browse all"**
- *Pros*: Best of both. Front page tells a narrative ("Health · Demographics · Income · …"); "Browse all" is a faceted list for power-users. Front page survives 200 because it's curated. Browse-all page survives because it has search + facets.
- *Cons*: Two surfaces to maintain. The boundary between "featured" and "long-tail" is editorial work.
- *Verdict*: Recommended baseline. Front page can be the dev-templates-style category grid; browse-all is the new thing.

### [Q2] Single category axis vs multi-label tags

**Option A — keep single-valued `tags.topic`**
- Forces editorial decisions ("is this health or social?"), keeps UI simple.
- Fails for hybrid sources (multi-domain).

**Option B — single `topic` for primary nav + multi-label `tags[]` array**
- Pragmatic. Each source has one "home" category for shop-window placement, and any number of secondary tags for facet-driven browse.
- Author burden: one editorial pick + open-ended tags.
- HuggingFace, CKAN follow this hybrid.

**Option C — fully multi-valued `topics[]`**
- Most expressive. Per-source page can appear under each topic.
- Breaks the "front page category grid" navigation (a source appears multiple times) — unless we suppress.
- Hardest to keep editorially clean.

**Verdict**: Lean Option B. Migration from today's single `tags.topic` is a one-line additive change.

### [Q6] Per-source URL shape

**Option A — `/sources/<id>`** (e.g. `/sources/ssb-07459`)
- Stable under recategorisation.
- Matches Datasette, HF, GitHub-repo conventions.
- Source-id is the natural identifier already (`source_id` in every manifest, every dbt model, every PostgREST endpoint).
- Citations from papers, news articles, NGO reports all become permalinks.

**Option B — `/sources/<category>/<id>`** (e.g. `/sources/health/fhi-mobbing`)
- Tells the URL-reader what category.
- Recategorisation breaks every link. With our explorer audience and 5-year horizon, this is a real cost.

**Verdict**: Strongly lean Option A. Category is a property of the source, not part of its identity.

### [Q7] Generated MDX vs dynamic [id] route

**Option A — one MDX per source, generated**
- *Pros*: Each source is a real Docusaurus page (sitemap, search-indexable, OpenGraph cards, sidebar entry, MDX prose-extensibility).
- *Pros*: Standard Docusaurus search picks it up for free.
- *Cons*: 200 MDX files in the repo. Big PRs when schema changes. Sidebar bloat.

**Option B — single `pages/sources/[id].tsx` React route**
- *Pros*: No MDX files, no sidebar bloat. Schema changes auto-propagate.
- *Cons*: Docusaurus search local doesn't index dynamic routes by default — would need a separate search index build step. SEO needs manual sitemap. Prose extensibility lost.

**Option C — generated MDX with prose appended from `README.md`**
- Same as Option A but the editorial prose burden is solved by reading the per-source README. Wraps Option A's main cost (per-source prose).

**Verdict**: Lean Option C — generated MDX, prose from README. The 200-file cost is real but the indexability + sitemap + Docusaurus-native behaviour wins. Sidebar bloat is solved by Q8 option (a) or (b).

### [Q9] Per-source prose

**Option A — all generated, no prose**
- Dimensions table, tags, upstream link, that's it.
- Honest at scale, but cold.

**Option B — README is the prose**
- All 41 sources already have READMEs. Audience mismatch (READMEs are operator-focused), but at least the prose isn't blank.
- Need a `## Public summary` section convention in the README to extract for the docs site, or accept the full README content.

**Option C — separate `description.md` per source for public prose**
- Clean separation, but doubles the editorial burden — and we just established at 200 it has to be cheap.

**Verdict**: Lean Option B with a convention. Add a short `## Atlas summary` section to every README; the catalog generator extracts only that section. Sources without it fall back to the manifest `description:`. Authorial burden is one paragraph, in a file the contributor already touches.

---

## Decisions resolved (2026-05-12)

All 45 questions resolved in a triage pass. Detailed reasoning is preserved in the questions sections above; this is the compact index. Anything marked *follow-up* is genuinely out of v1 — not deferred indefinitely, just not in the first PLAN that ships.

### v1 scope envelope

**Standard v1**: structure end-to-end with one of each editorial surface as a working example, so adding more later is a 15-minute commit. Specifically: hybrid front page, browse-all, per-source product pages, brand pages, "new & noteworthy" + RSS, one demo collection (Lisa's grant-application essentials), one demo use-case page (`/sources/for/grant-officers`), publisher logos + sample-row previews. Follow-up PLAN: crosswalk page, geo thumbnail maps, sparklines, additional collections and use-case pages.

### Navigation & taxonomy

- **[Q1]** **Resolved →** option (c) hybrid: curated shop-window front page + faceted `/sources/browse` for power users.
- **[Q2]** **Resolved →** single primary `topic` for navigation + multi-label `tags[]` array for facets and cross-listing.
- **[Q3]** **Resolved →** `atlas-data/ingest/src/sources/source-categories.yaml` (alongside manifests; shared with ingest tooling).
- **[Q4]** **Resolved →** defer subcategorisation; revisit when any single category exceeds ~30 entries. Tags + facets carry until then.
- **[Q5]** **Resolved →** first-class facets: `provider`, `geo`, `eu_theme`, `cadence`, `lifecycle`, `freshness`. Drop `license` (too uniform — almost all NLOD) and `time_coverage` (too continuous — use search).

### URLs & routing

- **[Q6]** **Resolved →** `/sources/<id>` (stable, citation-friendly, recategorisation-proof).
- **[Q7]** **Resolved →** generated MDX per source (option C: generated structural blocks always, README "Atlas summary" prose appended where present).
- **[Q8]** **Resolved →** sidebar shows only landings (Sources / Browse / By publisher / Collections / For …); per-source pages reached from those, not enumerated.

### Content & editorial

- **[Q9]** **Resolved →** generated structural blocks always; prose optional from README's `## Atlas summary` section.
- **[Q10]** **Resolved →** introduce `## Atlas summary` section convention in each source's README; catalog generator extracts only that section.
- **[Q11]** **Resolved →** new manifest field `lifecycle: stable|beta|deprecated|broken`; rendered as a coloured product-status badge in the hero.
- **[Q12]** **Resolved →** English single-locale at v1; accept mixed-locale content gracefully; revisit when sources cross ~100.

### Manifest schema

- **[Q13]** **Resolved →** additions: `tags[]`, `lifecycle`, `time_coverage{start,end}`, `suggested_joins[]`, `sample_query` (optional), `methodology_notes`, `feedback_url` (optional), `publisher_logo` (optional). `last_updated` derived from `mart_ingest_health` at build time.
- **[Q14]** **Resolved →** derived: `last_updated`, `dimensions[].cardinality`, default `sample_query` (when omitted). Authored: everything else.
- **[Q15]** **Resolved →** ship `manifest.schema.json` + CI gate, mirroring [`check-osmosis.sh`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/check-osmosis.sh). Validate on every PR touching manifests.

### Generation pipeline

- **[Q16]** **Resolved →** generator at `website/scripts/generate-sources-registry.mjs`, matching the `snapshot-openapi.mjs` / `snapshot-lineage.mjs` convention.
- **[Q17]** **Resolved →** fail-on-drift in CI (option a). No bot commits — contributors regen locally before pushing.
- **[Q18]** **Resolved →** single `sources-registry.json`. ~200 KB at full scale is fine for the Docusaurus build.

### Discoverability & standards

- **[Q19]** **Resolved →** emit Schema.org `Dataset` JSON-LD on every per-source page. Free SEO + LLM-crawler win.
- **[Q20]** **Resolved →** DCAT-AP-NO endpoint deferred to [INVESTIGATE-felles-datakatalog-classification.md](INVESTIGATE-felles-datakatalog-classification.md). The registry-JSON is the contract; a future DCAT emitter reads it as a sibling consumer.
- **[Q21]** **Resolved →** free via Docusaurus MDX route choice in **[Q7]**. Per-source `<title>` and OpenGraph cards generated.

### Cross-surface

- **[Q22]** **Resolved →** deep-link to Scalar at `/api` with a "Try this query at /api" line per source; do not embed inline.
- **[Q23]** **Resolved →** bidirectional link with the `/lineage/` dbt-docs node for each source.
- **[Q24]** **Resolved →** bidirectional link with measurement pages once those exist (pending a future measurements-catalog PLAN).

### Persona-driven

- **[Q30]** **Resolved →** `methodology_notes` optional; render an honest placeholder when missing. Stretch goal: write notes for the top-10 most-cited sources over the first year.
- **[Q31]** **Resolved →** two-button "Meld feil" pattern: "Report to Atlas" (GitHub issue) + "Report to publisher" (links to new optional `feedback_url`).
- **[Q32]** **Resolved →** citation block (BibTeX + one-line text + permalink) on every per-source page.
- **[Q33]** **Resolved → follow-up PLAN.** The per-source "Frequently joined with" (**[Q39]**) covers ~80% of crosswalk value in v1.
- **[Q34]** **Resolved →** stable anchor IDs: `#provenance`, `#methodology`, `#dimensions`, `#sample-query`, `#citation`, `#related`. Renaming is a breaking change.
- **[Q35]** **Resolved →** freshness in both the header (at-a-glance) and the provenance block (full ISO date + cadence context).
- **[Q36]** **Resolved →** superseded by **[Q42]** (product-detail-page layout).

### Promotion & merchandising

- **[Q37]** **Resolved →** ship 1 demo collection in v1 (*"Grant-application essentials for child poverty"* — Lisa's path). More collections via the quarterly cadence in **[Q45]**.
- **[Q38]** **Resolved →** ship brand pages in v1; trivial to generate from `publisher:` field.
- **[Q39]** **Resolved →** ship "Frequently joined with" in v1; derived from manifest `dimensions[].code` shared keys + `suggested_joins[]`.
- **[Q40]** **Resolved →** ship social-proof badges in v1; cheap (dbt model count from `marts.lineage` + docs-page grep).
- **[Q41]** **Resolved →** option (b) at v1: publisher logo + sample-row preview only. Geo thumbnail map and sparkline are **follow-up PLAN** work.
- **[Q42]** **Resolved →** adopt the product-detail-page layout: hero/buy-box above the fold, evidence stack below.
- **[Q43]** **Resolved →** ship `/sources/new` + per-page RSS feed in v1.
- **[Q44]** **Resolved →** ship 1 demo use-case page in v1 (`/sources/for/grant-officers` — Lisa). Additional persona pages via the quarterly cadence.
- **[Q45]** **Resolved →** quarterly editorial cadence: one new collection + one new use-case page per quarter. ~2 hrs per quarter once tooling is in place. Derived signals (joinable / new / freshness / social proof) carry the rest automatically.

### Parking lot

- **[Q25]** Resolved → promoted to **[Q35]**.
- **[Q26]** Resolved → covered by **[Q43]**.
- **[Q27]** Still open. Revisit when first source becomes deprecated.
- **[Q28]** Still open. Pending **[Q12]** revisit at ~100 sources.
- **[Q29]** Resolved → dev-templates is inspiration only; the web-shop reframe takes Atlas's front page well past it.

---

## Recommendation — the architecture sketch this INVESTIGATE leans toward

(Confirmed 2026-05-12. Reflects the resolved decisions above.)

1. **Front page** at `/sources` — a **shop window**, not a catalog index. Sections, top to bottom:
   - **Hero**: "Dataset of the week" (rotated from `featured.yaml`), short editorial framing, big visual.
   - **Curated collections** strip (**[Q37]**) — 3–5 cards linking to themed bundles ("Grant-application essentials", "NGO funding-truth", "Kommune planning for elderly loneliness").
   - **For you** strip (**[Q44]**) — persona-shaped use-case pages ("For grant officers", "For journalists", "For donors", "For chapter leaders").
   - **New & recently refreshed** strip (**[Q43]**).
   - **Browse by category** grid (the dev-templates-style curated grid).
   - **Browse by publisher** strip (**[Q38]**) — SSB / FHI / Bufdir / NGO badges.
   - Subtle link to `/sources/browse` for power users.

   Personas served: Lisa (lands on her use-case page in one click), Ola (lands on a collection or browses by publisher), Jonas (lands on "For donors" or the funding-truth collection), Dev (sees the structure of the whole catalog at a glance).

2. **Browse-all page** at `/sources/browse` — the data-catalog surface, intentionally backstage. Faceted: provider, eu_theme, geo, cadence, lifecycle, freshness. Free-text search on title + description + methodology + tags. Power-user surface; most visitors never see it.

3. **Curated collection pages** at `/sources/collections/<slug>` (**[Q37]**) — editorial intro, ordered source list, "How to use these together" join recipe. Authored in `source-collections.yaml`.

4. **Per-publisher brand pages** at `/sources/by/<publisher-slug>` (**[Q38]**) — publisher logo, all Atlas sources from that publisher, license summary, link out.

5. **Use-case persona pages** at `/sources/for/<persona-slug>` (**[Q44]**) — name the task, list the sources, link to the relevant collection.

6. **Per-source page** at `/sources/<id>` — generated MDX, stable URL, structured as a **product detail page** (per **[Q42]** restating **[Q36]** in e-commerce terms):
   - **Hero / buy-box (above the fold)**: title, publisher logo, license badge, lifecycle badge ("In stock" / "Pre-order" / "Discontinued"), freshness (**[Q35]**), social-proof badges (**[Q40]**), and **primary action** ("Get this data" → expands an inline panel with copy-clickable PostgREST URL + curl + Python). Secondary actions: "Cite this source", "View upstream", "Report a data issue" (**[Q31]**).
   - **Below the fold, evidence-first** (per **[Q36]** order): provenance block → dimensions table → sample query → sample-row preview (**[Q41]**) → citation block (**[Q32]**) → frequently-joined-with strip (**[Q39]**) → short prose summary (last) → footer ("Edit on GitHub", "View ingest code", "View dbt model").
   - Schema.org `Dataset` JSON-LD emitted invisibly (**[Q19]**) for Google Dataset Search and LLM crawlers.
   - Stable anchor IDs (`#provenance`, `#methodology`, `#dimensions`, `#sample-query`, `#citation`, `#related`) per **[Q34]**.

7. **Crosswalk page** at `/sources/joinable` (**[Q33]**) — surfaces join-key overlaps between sources. Cheap to build from `marts.lineage` + manifest `dimensions[].code`. Personas served: Arne, Signe, Henrik, Ola. Scope: v1 vs follow-up PLAN.

8. **Sidebar** — only "Sources" landing + "Browse all" + "Joinable sources" + category / publisher / collection / use-case index pages. Per-source pages reached from those, not enumerated (avoids 200-entry sidebar).

9. **Source of truth**:
   - `atlas-data/ingest/src/sources/<id>/manifest.yml` — structural fields (existing + additions per **[Q13]**, **[Q30]**, **[Q31]**).
   - `atlas-data/ingest/src/sources/<id>/README.md` `## Atlas summary` section — short prose paragraph.
   - New `atlas-data/ingest/src/sources/source-categories.yaml` — curated category metadata.
   - New `website/docs/sources/_data/source-collections.yaml` (**[Q37]**) — editorial collections.
   - New `website/docs/sources/_data/use-cases.yaml` (**[Q44]**) — persona-shaped use-case pages.
   - New `website/docs/sources/_data/featured.yaml` (**[Q45]**) — "dataset of the week" rotation pool.

10. **Generator** — `website/scripts/generate-sources-registry.mjs`, runs in CI on PR, emits:
    - `website/src/data/sources-registry.json` (committed).
    - `website/docs/sources/<category>/<id>.mdx` per source (committed; category folder is filesystem grouping only — URL stays `/sources/<id>` per **[Q6]**).
    - Brand / collection / use-case index pages from their YAML inputs.

11. **CI gate** — drift check (regen, diff against committed; fail if non-zero — mirrors `check-osmosis.sh`). Manifest JSON Schema validation gate. Optional: HEAD-request bot for `feedback_url` link-rot (**[Q31]** risk).

12. **Manifest schema additions** (per **[Q13]**, **[Q14]**, **[Q30]**, **[Q31]**, **[Q41]**):
    - `tags[]` array (multi-label).
    - `lifecycle` (stable / beta / deprecated / broken).
    - `time_coverage` (`{start, end}`).
    - `suggested_joins[]` (source_ids that pair naturally — feeds **[Q39]**).
    - `sample_query` (optional PostgREST URL — feeds the buy-box "Get this data" panel).
    - `methodology_notes` (Markdown).
    - `feedback_url` (optional, upstream publisher's feedback channel).
    - `publisher_logo` (optional, path or URL — feeds **[Q41]** visual richness).
    - `last_updated` *not* in manifest — derived from `mart_ingest_health` at build time.

This baseline holds at 200 because:
- Front page is a **shop window**, not a 200-row index — complexity bounded by editorial cadence, not source count.
- Browse-all is faceted (power-user surface, intentionally backstage).
- URLs are flat and stable — recategorisation never breaks a link or a citation.
- Editorial cost per new source is bounded: manifest fields + one README paragraph + (optionally) methodology notes.
- Every persona-driven and merchandising requirement is wired into the same generated MDX — no per-feature surface to maintain separately.
- Editor workload (**[Q45]**): one new collection per quarter is the sustainable cadence; the rest of the merchandising is derived automatically from manifests, lineage, and freshness.

---

## Risks and gaps

- **Editorial drift**: even with Option B for prose, 200 README "Atlas summary" sections is real work. Without it, the catalog ships stub pages. Mitigation: CI warns but doesn't fail when summary is missing — fallback to manifest description.
- **Methodology-notes backlog at 200** (**[Q30]**): the persona research makes methodology notes load-bearing for Ola and Jonas, but writing methodology summaries for 200 statistical tables is a real ongoing commitment. Mitigation: stage by `lifecycle` (require for `stable`, optional for `beta`); accept "no methodology notes yet — see upstream documentation" as an honest placeholder for v1.
- **"Meld feil" routing gets stale** (**[Q31]**): per-publisher `feedback_url` values change over time. Mitigation: bot check (HEAD request) in CI flags 404s; otherwise the field rots silently.
- **Manifest schema evolution is a one-way door**: adding `lifecycle` and `tags[]` to 41 manifests is easy; changing their meaning later is hard. The PLAN should over-spec these fields before any are populated.
- **Search local quality at 200**: `@easyops-cn/docusaurus-search-local` may not rank well across 200 short MDX pages — needs a real test before commitment. Alternative: hand-rolled fuse.js search on the browse-all page using `sources-registry.json` directly.
- **Overlap with Felles datakatalog INVESTIGATE**: that INVESTIGATE may decide Atlas should publish DCAT-AP-NO from these same manifests. Generator must be structured so a DCAT emitter is a sibling consumer, not a fork. Lean: the registry-JSON output is the contract; both the HTML site and any future DCAT endpoint read from it.
- **PLAN-008 / `/data` surface drift**: the customer frontend's `/data` shows the same sources from a developer angle. If field meanings diverge between the two surfaces, contributors will be confused about which one is canonical. Mitigation: this PLAN's per-source page links to `/data/<schema>/<table>` and vice versa; both consume the same `mart_meta_*` tables where possible.
- **Norwegian / English bilingual content**: search may underperform across mixed-locale text. Probably fine at v1, but worth retesting at 100.
- **Build performance**: generating + indexing 200 MDX files is non-trivial. Should benchmark with synthetic-source fixtures before going live.

---

## Next steps

- [x] **[Q1]**–**[Q45]** reviewed and resolved (2026-05-12) — see "Decisions resolved" section.
- [ ] **Draft `PLAN-001-sources-manifest-schema-v2.md`** — adds the new manifest fields (**[Q13]**), JSON Schema, CI validation gate. Prerequisite for the catalog PLAN; lands first so the manifests can be backfilled before any UI consumes them.
- [ ] **Draft `PLAN-002-sources-catalog-foundation.md`** — generator script + registry JSON + per-source MDX + front page (shop window) + browse-all + brand pages. The structural shell.
- [ ] **Draft `PLAN-003-sources-catalog-merchandising.md`** — 1 demo collection, 1 demo use-case page, "new & noteworthy" + RSS, social-proof badges, "Frequently joined with", citation block, "Meld feil" wiring, Schema.org JSON-LD, sample-row previews.
- [ ] **Follow-up backlog** (not in v1): crosswalk page (**[Q33]**), geo thumbnail maps + sparklines (**[Q41]**), additional collections / use-case pages (per **[Q45]** quarterly cadence), DCAT-AP-NO emitter (per **[Q20]**, deferred to Felles datakatalog INVESTIGATE).
- [ ] Update [`1PRIORITY.md`](1PRIORITY.md) — place this INVESTIGATE in the right tier; promote its child PLANs.

---

## Open questions (parking lot)

- ~~**[Q25]**~~ Freshness indicator. **Resolved** → promoted to **[Q35]** with full ISO date + cadence framing.
- ~~**[Q26]**~~ RSS / Atom feed. **Resolved** → part of **[Q43]** "New & noteworthy".
- **[Q27]** Should the catalog support per-source "deprecation notices" with redirect-to-replacement metadata? Likely needed eventually; out of scope for v1 unless any current source becomes deprecated before launch.
- **[Q28]** Norwegian-language landing page (`/sources/no`)? Defer until **[Q12]** is resolved.
- ~~**[Q29]**~~ Mirror `tmp.sovereignsky.no` front page exactly? **Resolved** → no, the web-shop reframe takes Atlas's front page well past the dev-templates pattern. dev-templates is inspiration for the per-item card style only.
