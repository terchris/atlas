# Investigate: Frontend display of NGO supply data

> **IMPLEMENTATION RULES:** Before implementing any plan from this investigation, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog

**Goal**: Decide how Atlas's Next.js frontend should surface NGO supply data — chapters, activities, service categories — both as an immediate sanity check that the Red Cross ingest worked, and as the foundation for organisation-neutral views the public personas (Kari, Amira, Lars, Tone, Jonas, Ola) and internal personas (Inger, Arne) will use as more NGOs land.

**Last Updated**: 2026-04-24 (revised after stack decision and gap audit)

---

## Scope

**In scope:**
- Information architecture (URL structure, page types) for supply display.
- The three viewing layers: engineering-validation, public org-neutral, per-NGO landing pages.
- Per-NGO vs cross-NGO display vocabulary (`canonical_name` vs `service_category_code`).
- Visualisation choices (table / list / map) per page type.
- Visual identity — Atlas-neutral as primary, NGO branding as secondary.
- Empty states and data-quality signals (Brreg-only chapters, dormant chapters, ingest staleness).
- Technical approach — extending the existing `postgres` + Server Components + inline-CSS pattern; when to graduate to Digdir Designsystemet (already imported, currently dormant).
- Phased rollout: v1 (Red Cross only, validation + per-kommune supply), v1.5 (Folkehjelp added — first true cross-NGO finder), v2 (Coverage-gap supply×demand mart consumption).

**Out of scope:**
- The Coverage-gap mart itself (its own future investigation; this file consumes it once it exists).
- Authentication, accounts, "save my preferences" — Atlas is anonymous read-only in v1.
- Mobile-app shell / PWA installability — separate concern.
- The compare-NGOs deep-comparison page (covered by [`compare-ngos-spec.md`](../../../research/compare-ngos-spec.md) — supply-display feeds it but doesn't replicate it).
- Funding-side display (Lottstift, Innsamlingskontrollen) — different fact tables, different views.
- Indicator-side display — already shipped under `/data/...` and `/coverage-gap/barnefattigdom`.

---

## Why this exists

Atlas's mission per [`goal.md`](../../../research/goal.md) is **organisation-neutral**: it aggregates and compares NGO supply across the Norwegian sector. The default user (Kari) doesn't pick an NGO first — she picks a need ("visiting lonely elderly") and Atlas shows providers across all relevant NGOs in her area.

The data side of this is well-advanced: Red Cross is ingested (391 chapters, 35 activities, 1941 fact rows), and PLANs for Folkehjelp, the scraping infrastructure, and the multi-NGO model extensions are queued. The frontend side has zero supply views today — five existing routes, all demand-side ([`/data/...`](app/data), [`/coverage-gap/barnefattigdom`](app/coverage-gap/barnefattigdom), [`/kommuner/[kommune_nr]`](app/kommuner)).

Without this investigation:

- We'd build a Red Cross-specific page first (because that's the data we have) and then have to retrofit it as cross-NGO when Folkehjelp lands. Sunk cost.
- We'd duplicate vocabulary decisions per page (when to use `service_category_code` vs `canonical_name`) instead of choosing once.
- We'd miss the chance to design the supply side as the org-neutral counterpart of the existing demand side, with a clean integration into `/kommuner/[kommune_nr]`.

This investigation produces 1–3 PLANs covering the v1 supply views, with an explicit upgrade path as more NGOs ingest.

---

## Existing context

**Frontend stack (verified 2026-04-24):**
- Next.js App Router, Server Components by default. Repo root contains `app/`, `src/`.
- Data access: [`src/lib/db.ts`](src/lib/db.ts) — native `postgres` v3 client, reads `DATABASE_URL`, role is SELECT-only on `marts.*`. Connection pool cached across hot-reloads. Inline SQL template literals in route files.
- UI: no Tailwind, no shadcn/ui. Inline CSS-in-JS via `style=` props. `@digdir/designsystemet-react` ^1.13.2 imported in `package.json` but **currently unused** in any page.
- Maps: `maplibre-gl` ^5.23.0, used by [`app/coverage-gap/barnefattigdom/Map.tsx`](app/coverage-gap/barnefattigdom/Map.tsx). Boundary GeoJSON served from `/public/boundaries/kommuner-2024.geojson`.
- No charting library, no data grid (plain HTML `<table>`).

**Supply tables ready to query (verified):**
- `dim_chapter` — 391 rows, Red Cross only. Carries `chapter_id`, `ngo_orgnr`, `chapter_level`, `parent_chapter_id`, `name`, `kommune_nr`, `is_active`. Will gain `source_url` and `chapter_subtype` per [multi-ngo extensions](./INVESTIGATE-multi-ngo-supply-model-extensions.md).
- `dim_activity` — 35 rows. `activity_id`, `ngo_orgnr`, `canonical_name`, `service_category_code`, `is_active`.
- `fact_chapter_activities` — 1941 rows. `(chapter_id, activity_id)` join with denormalised `ngo_orgnr`, `kommune_nr`, `local_activity_name`, `canonical_name`, `is_active`, `source_id`.
- `dim_ngo` — 11 rows. `orgnr`, `slug`, `name`, `brand_name`, `website_url`, `tier`, `chapter_data_shape`, `primary_focus`. **10 of 11 NGOs are not yet ingested** — they're seeded in `dim_ngo` but have zero `dim_chapter` rows.
- `ref_atlas_service_category` — 22 rows with `code`, `label_no`, `label_en`, `description`, `sort_order`. Cross-NGO vocabulary.
- `dim_kommune`, `dim_fylke`, `dim_postnummer` — already used by existing demand-side routes.

**Personas we're serving** (from [`personas.md`](../../../research/personas.md)):
- **Primary public**: Kari (find a way to help), Jonas (donate meaningfully), Amira (need a service now), Lars (who responds in my area), Tone (compare orgs before committing), Ola (data-curious observer).
- **Secondary internal**: Inger (chapter leader, sees her chapter from outside), Arne (district coordinator).

The supply-display work serves all primary personas (every primary persona reaches a chapter at some point) plus the two internal ones explicitly.

---

## Section A — Personas and the supply-side questions

Mapping each persona to the supply-side question they ask, and the page type that answers it. Drives the IA in Section B.

| Persona | Question | Best-fit page type |
|---|---|---|
| **Kari** | "Who offers visiting-lonely-elderly near me?" | Activity-first finder: pick category → see chapters across NGOs in chosen kommune. **Cross-NGO**, Atlas-neutral vocabulary. |
| **Amira** | "Where's the nearest språkkafé that's running this Tuesday?" | Same finder, but with a `language_practice` filter pre-applied; eventually with event-frequency signals from [`INVESTIGATE-ngo-events-and-minisites.md`](./INVESTIGATE-ngo-events-and-minisites.md). |
| **Lars** | "Who responds to weather warnings in my parents' kommune?" | Per-kommune view + filter to `rescue_corps` + `first_aid_standby`. |
| **Tone** | "What does each NGO actually do — comparison view." | Per-NGO landing pages (one per NGO) + the dedicated compare-NGOs page (out of scope here, see [`compare-ngos-spec.md`](../../../research/compare-ngos-spec.md)). |
| **Jonas** | "Where does my donation go — what does this org actually fund?" | Per-NGO landing page + activities catalog + future funding overlay. |
| **Ola** | "Cross-sector data: how many providers per kommune per service?" | Cross-NGO browse pages, raw counts, links to data download (future). |
| **Inger** (chapter leader) | "How does my chapter look from outside? Who are my peers?" | Per-NGO chapter detail + parent/sibling navigation. |
| **Arne** (district coordinator) | "What's the supply across my distrikt — gaps, overlaps?" | Per-NGO regional view + per-kommune drilldown. Pre-Coverage-gap. |

Two cross-cutting observations:

- Kari/Amira/Lars want **org-neutral** views first; they may reach a per-NGO page only after seeing the comparison.
- Inger/Arne want **per-NGO** views first; they're already inside one NGO's mental model.
- Tone and Jonas want **both** — they pivot between cross-NGO comparison and per-NGO detail.

This is why the IA below has both layers, with cross-NGO as the default entry point.

---

## Section B — Three viewing layers — **[Q1]**

Splitting supply display into three layers clarifies what to build now vs later, and what audience each serves:

### Layer 1 — Engineering-validation views (build now, alongside each ingest)

Purpose: sanity-check that the data we imported looks right. Audience: us. Not linked from public navigation.

- Plain tables, no styling polish.
- Show the raw structure (counts, coverage, joins) so import bugs are visible.
- Live under `/admin/...` or `/internal/...` (see [Q2]).

### Layer 2 — Public org-neutral views (mature over multiple ingests)

Purpose: Atlas's main public flow per [`goal.md`](../../../research/goal.md). Audience: Kari, Amira, Lars, Tone, Jonas, Ola.

- Activity-first finder ("I want to do X near Y → list providers across NGOs").
- Per-kommune view extended with "tilbud i denne kommunen" (org-neutral list).
- Designed-quality, eventually adopting [Digdir Designsystemet](#section-h--technical-approach).

These views are **shape-correct from day one** but **only useful at N≥2 NGOs** — with Red Cross alone they look like a single-NGO list with weird empty NGO columns. Real launch is when Folkehjelp lands.

### Layer 3 — Per-NGO landing pages (secondary, for Inger/Arne and Tone/Jonas drilldown)

Purpose: per-organisation detail, useful even pre-launch as deep-link targets and validation tools. Audience: Inger ("my chapter from outside"), Arne ("my distrikt"), Tone/Jonas (drilldown from compare).

- One landing page per NGO under `/ngo/<slug>` (see [Q3]).
- Sub-views: chapters list, activity catalog, distrikt structure.
- Atlas-styled but with NGO brand accents (see [Q10]).

**Decision rule**: build Layer 1 for Red Cross now (cheap, validates the import). Build Layer 3 for Red Cross now (modest effort, gives Inger something useful day-one, becomes per-NGO-replicable when Folkehjelp lands). **Defer Layer 2** until Folkehjelp lands so the cross-NGO design is grounded in actual cross-NGO data.

---

## Section C — Information architecture

### C.1 URL structure — **[Q2]/[Q3]/[Q4]/[Q5]**

| URL pattern | Layer | What it shows | Build when? |
|---|---|---|---|
| `/admin/supply/<source-slug>` | 1 | Per-source raw row counts, coverage, sample joins. Not linked publicly. | v1 (Red Cross), then per ingest |
| `/admin/ingest-health` | 1 | `mart_ingest_health` view, last-run status per source. | When `raw.ingest_runs` ships (infra PLAN-001) |
| `/ngo/<slug>` | 3 | NGO landing page — overview, chapter count, activity count, distrikt structure. | v1 (Red Cross), then per ingest |
| `/ngo/<slug>/chapters` | 3 | Filterable list of all the NGO's chapters. | v1 (Red Cross) |
| `/ngo/<slug>/chapters/<chapter_id>` | 3 | Single chapter detail — activities, parent, kommune, deep-link to NGO's own page (`source_url`). | v1 (Red Cross) |
| `/ngo/<slug>/aktiviteter` | 3 | Per-NGO activity catalog — `canonical_name` vocabulary, count of chapters offering each. | v1 (Red Cross) |
| `/aktivitet/<service-category-code>` | 2 | Cross-NGO finder for one Atlas service category — list providers, optional kommune filter. | v1.5 (after Folkehjelp) |
| `/kommuner/<kommune_nr>` (existing) | 2 | Extended with "Tilbud i kommunen" section listing local chapters across NGOs. | v1 (Red Cross only initially; the section grows as more NGOs land) |
| `/coverage-gap/<service-category-code>/<kommune_nr>` | 2 | Future: supply×demand mart for one (service, kommune) — pre-computed by the Coverage-gap PLAN. | v2 |

Rationale:

- `/admin/...` keeps engineering pages off the public sitemap (and out of search results); a single noindex meta + a robots.txt rule covers the prefix.
- `/ngo/<slug>` (singular) follows REST-ish convention (`/kommuner/<nr>` already singular-resource-style; matches).
- `/aktivitet/<code>` (singular) matches `/ngo/...`.
- The existing `/data/<source_id>/<contents_code>` pattern is preserved for indicators — supply doesn't reuse it because supply concepts (chapter, activity, service category) don't map cleanly to (source, contents).

### C.2 Navigation surface — **[Q6]**

The home page at [`app/page.tsx`](app/page.tsx) currently links to `/data` and `/coverage-gap/barnefattigdom`. Proposed v1 additions:

- "Tilbud per organisasjon" — links to a v1 NGO index `/ngo` (lists all 11 dim_ngo rows; clickable for the ingested ones, "ikke ingestet" badge for the others).
- "Tilbud i din kommune" — same `/kommuner` index that exists today, but the kommune detail pages now also include supply.
- (v1.5) "Finn en aktivitet" — `/aktivitet` index page listing the 22 service categories.

Layer 1 (`/admin/...`) does **not** appear in the public nav.

### C.3 Pre-launch display of unfinished NGOs — **[Q15]**

`dim_ngo` has 11 rows; only Red Cross has supply data. The `/ngo` index page shows all 11 with status badges:

- ✅ "Tilbud importert" — has `dim_chapter` rows. Card is clickable.
- ⏳ "Under arbeid" — seeded in `dim_ngo` but no supply rows yet. Card is greyed out, links to a brief "we're working on this org" stub page (so deep-linking from external sources doesn't 404 indefinitely).

This is honest about the project's state and avoids the awkward "where are the others?" question.

---

## Section D — Per-NGO vs cross-NGO display

### D.1 Vocabulary toggle — **[Q7]**

The same activity has two names:

- **`dim_activity.canonical_name`** — the NGO's own term ("Modum Røde Kors Hjelpekorps Beredskap", "Norsk Folkehjelp Førstehjelp og redningstjeneste").
- **`ref_atlas_service_category.label_no`** — Atlas's neutral term ("Førstehjelpsberedskap").

When to use which:

| Page type | Vocabulary | Why |
|---|---|---|
| Per-NGO views (`/ngo/<slug>/...`) | `canonical_name` primary, `service_category_code` shown as small label | The user is in the NGO's mental model; speak their language. |
| Cross-NGO views (`/aktivitet/...`, `/kommuner/...` supply section) | `service_category_code` primary, `canonical_name` shown on hover/expand | The user is comparing across NGOs; need a common vocabulary. |
| Engineering views (`/admin/...`) | Both shown verbatim | Validate the mapping is correct. |

### D.2 ICNPO codes display — **[Q8]**

`dim_ngo` carries up to 3 ICNPO codes per NGO (per `icnpo_code_1/2/3`). v1 surfaces them only on the `/ngo/<slug>` overview page as a small "klassifisert som" footer item — Ola (data-curious) cares; primary personas don't. Don't promote to navigation or filtering until a real persona need surfaces.

### D.3 NGO regions vs SSB fylker

NGO-defined regions (Red Cross's 19 distrikter) live in `dim_chapter` with `chapter_level='regional'`. They are **NGO-internal navigation** — `/ngo/redcross/distrikter` lists them; `/ngo/redcross/distrikt/<chapter_id>` shows the distrikt's children. They do **not** appear in cross-NGO views, which use SSB `dim_fylke` exclusively (Kari doesn't know what a Røde Kors-distrikt is).

The `chapter_kommune_coverage` link table (per [multi-ngo extensions](./INVESTIGATE-multi-ngo-supply-model-extensions.md)) lets per-NGO regional pages show "kommuner served" and lets cross-NGO views show regional-level supply when local-level data is sparse.

---

## Section E — Visualisation choices

### E.1 Default representation per page type — **[Q9]/[Q10]**

| Page | Default | Why | Map adds value? |
|---|---|---|---|
| `/admin/supply/<source>` | Plain HTML table | Validation; tables are scannable | No |
| `/ngo/<slug>` overview | Stat blocks + small distrikt diagram | Single-screen at-a-glance | Optional kommune choropleth ("Røde Kors er til stede i Y kommuner") — defer to v1.5 |
| `/ngo/<slug>/chapters` | Filterable table | 391 rows is manageable; filters are essential | Toggle to map view (defer; not v1) |
| `/ngo/<slug>/aktiviteter` | List with counts | 35 items; small | No |
| `/aktivitet/<code>` (v1.5) | Two-column: list of providers + map showing kommuner with coverage | Geographic distribution is the answer | **Yes** — choropleth of "providers per kommune for this service" |
| `/kommuner/<kommune_nr>` supply section | List of local chapters grouped by service category | Dense info at the bottom of an existing page | No (page already has demand maps) |

### E.2 When *not* to use a map

- Sparse data — Red Cross alone, one service category often covers <50 kommuner. Map looks empty; table communicates the same data more honestly.
- Within-kommune detail — there's only ever one kommune to show.
- Engineering validation — tables show schema correctness; maps don't.

### E.3 Reuse existing map pattern

The MapLibre setup in [`app/coverage-gap/barnefattigdom/Map.tsx`](app/coverage-gap/barnefattigdom/Map.tsx) is the template. v1.5 supply choropleths use the same `kommuner-2024.geojson`, the same MapLibre styling, swapping only the `feature.properties.kommune_nr` → value lookup.

---

## Section F — Visual identity — **[Q11]/[Q12]**

### F.1 Atlas-neutral as primary

Atlas is org-neutral. The default visual identity is:

- A small Atlas wordmark / colour palette (TBD — not yet defined; the project lacks brand assets).
- No NGO logos in cross-NGO contexts (one logo would look like a recommendation).
- NGO names rendered as text only.

### F.2 Per-NGO branding as secondary

On `/ngo/<slug>/...` pages it's appropriate to show:

- The NGO's logo (small, header-corner, not page-dominant).
- A subtle accent colour from the NGO's palette (border-left on chapter cards, maybe).
- Link out to `source_url` when present (per [multi-ngo extensions](./INVESTIGATE-multi-ngo-supply-model-extensions.md)).

This signals "you are looking at one specific NGO" without making Atlas feel like that NGO's site.

### F.3 Stack decision — **[Q13] Resolved 2026-04-24** — Tailwind v4 + shadcn/ui + Designsystemet tokens

**Adopt the new stack as Phase 1 of the v1 PLAN**, not as a deferred migration. Rationale: the existing inline-CSS pattern across the 5 demand-side routes is small enough that we don't gain by extending it for another 7 supply routes; we'd just have more to migrate later. Adopting the stack alongside v1 also unlocks the data-heavy components (DataTable, sortable columns, Command palette, charts) that v1.5 cross-NGO views and the eventual Compare-NGOs page will need.

**The combination:**

- **shadcn/ui** as the component library — copy-paste source we own, built on Radix primitives, Tailwind-styled.
- **Tailwind v4** as the styling layer — required by Designsystemet's bridge file (uses `@theme {}`).
- **Designsystemet tokens** as the visual identity — colour, typography, spacing, border-radius. Generated via `npx @digdir/designsystemet tokens create`, output as a Tailwind v4-native CSS bridge (`designsystemet.tailwind.css`) that exposes `--ds-*` tokens as Tailwind-recognised `--color-*` / `--font-*` / `--radius-*` names.

**The integration recipe** (~30 lines of CSS in `app/globals.css`):

```css
@import "tailwindcss";
@import "@digdir/designsystemet-css/theme/designsystemet.css";
@import "@digdir/designsystemet-css/theme/designsystemet.tailwind.css";

@theme {
  /* shadcn semantic names → Designsystemet role-based tokens */
  --color-background:        var(--ds-color-background-default);
  --color-foreground:        var(--ds-color-neutral-text-default);
  --color-primary:           var(--ds-color-accent-base-default);
  --color-primary-foreground: var(--ds-color-accent-base-contrast-default);
  --color-secondary:         var(--ds-color-neutral-surface-default);
  --color-secondary-foreground: var(--ds-color-neutral-text-default);
  --color-muted:             var(--ds-color-neutral-surface-tinted);
  --color-muted-foreground:  var(--ds-color-neutral-text-subtle);
  --color-accent:            var(--ds-color-accent-surface-default);
  --color-accent-foreground: var(--ds-color-accent-text-default);
  --color-destructive:       var(--ds-color-danger-base-default);
  --color-destructive-foreground: var(--ds-color-danger-base-contrast-default);
  --color-border:            var(--ds-color-neutral-border-default);
  --color-input:             var(--ds-color-neutral-border-subtle);
  --color-ring:              var(--ds-color-accent-border-strong);
  --radius:                  var(--ds-border-radius-md);
}
```

shadcn components reach for `var(--color-primary)` etc., which resolves through to Designsystemet's tokens. Theme regeneration via `npx @digdir/designsystemet tokens create --main-colors "accent:#XXXXXX" ...` swaps the brand colour without touching shadcn.

**Trade-offs noted**:

- **Tailwind v4 required.** Atlas has no Tailwind today — adopt v4 fresh, no migration.
- **Designsystemet's vocabulary is richer** than shadcn's (`accent`, `brand1/2/3`, `neutral`, `danger`, `info`, `warning`, `success`, `base`). Aliases above collapse it to shadcn's smaller set; surfaces that want richer semantics (Compare-NGOs focus-area colours per [`compare-ngos-spec.md`](../../../research/compare-ngos-spec.md)) use `--ds-*` directly via Tailwind arbitrary values like `bg-[--ds-color-success-base-default]`.
- **No component conflicts** — we use Designsystemet's *tokens*, not its *components*. shadcn is the only Button source.
- **`@digdir/designsystemet-react` dropped** from `package.json` (already imported but unused). `@digdir/designsystemet-css` kept for the token CSS.
- **shadcn neutral defaults remain** for variables Designsystemet doesn't cover (chart colours, sidebar variants).

**Atlas brand colour — [Q26]** open. Default for v1: **`#0062BA`** (Designsystemet's own default accent). Easily changed by re-running the token generator. Final colour is a brand decision deferred until Atlas has a brand identity.

---

## Section G — Empty states and data-quality signals

### G.1 Brreg-only / dormant chapters — **[Q14]**

Per [`INVESTIGATE-folkehjelp-supply.md` Q7](./INVESTIGATE-folkehjelp-supply.md), Brreg-only chapters land in `dim_chapter` with `is_active=false`. Display rules:

- Default chapter lists filter to `is_active=true`.
- A "Vis også inaktive" toggle reveals them, rendered greyed-out with a "Registrert i Brreg, ikke aktiv på nettsiden" badge.
- Coverage queries (kommune view, finder) only count active chapters.

### G.2 No-supply kommuner

Some kommuner have no chapters from any ingested NGO. On the kommune view, the supply section explicitly says "Ingen ingestede organisasjoner har lokale tilbud i denne kommunen." (Not "no supply" — that overclaims.)

### G.3 Ingest staleness

`mart_ingest_health` (per [scraping infra E.3](./INVESTIGATE-ngo-scraping-infrastructure.md#e3-end-of-run-summary-rawingest_runs--q12)) tracks last-run-at per source. Display rule:

- `/admin/ingest-health` shows full table.
- Per-NGO landing pages show a small footer "Sist oppdatert: <date>".
- If staleness exceeds N days (TBD per source — Red Cross monthly, Folkehjelp monthly, see source READMEs), surface a "Data kan være utdatert" warning. Threshold open per [Q16].

### G.4 Activity vocabulary drift

When parsing surfaces a new activity label not in the per-source CASE mapping ([scraping infra E.1](./INVESTIGATE-ngo-scraping-infrastructure.md#e1-per-page-failure-warn-and-continue--q10)), the row is loaded but unmapped. Display:

- `/admin/supply/<source>` lists "Unmapped labels: N" with the labels.
- Cross-NGO views silently skip these rows (they don't have a `service_category_code`).

---

## Section H — Technical approach

### H.1 Component model — **[Q17]**

- **Server Components by default** — every page that's a read-only table or list is a Server Component fetching from `db()` at request time, mirroring the existing `/kommuner/<kommune_nr>` pattern.
- **Client Components only when interactive** — filter inputs on the chapters table, the MapLibre map, sortable column headers. Hydrated boundaries only where needed.
- **Data fetching at the page level**, not in a client `fetch('/api/...')`. No internal API routes for supply data in v1 — the SQL is right there.
- **Visual layer**: Tailwind v4 utilities + shadcn/ui components themed with Designsystemet tokens (see F.3). Inline `style=` props are the previous pattern; supply pages use the new stack from day one. Existing 5 demand-side routes are not touched in v1 — they migrate later as a small follow-up PLAN.

### H.2 URL state for filters — **[Q18]**

Filters on the chapters table (kommune, fylke, level, activity) live in **URL query params** (`?kommune=0301&category=rescue_corps`). Reasons:

- Bookmarkable / shareable. Inger can email Arne a link that reproduces what she's looking at.
- Server Components can read `searchParams` and execute the right SQL — no client-side filtering needed for the typical 391-row table.
- The same filter pattern reused on `/aktivitet/<code>?kommune=...` later.

### H.3 Pagination — **[Q19]**

Skip pagination in v1. The biggest table is 391 rows (Red Cross all chapters). With Folkehjelp adding ~108 it'll be ~500. With all 11 ingested NGOs realistically ~3000–4000. At that point introduce TanStack Table with virtualisation. Until then plain HTML tables are fine.

### H.4 Caching — **[Q20]**

Default: server fetch on every request. dbt rebuilds run nightly at most; no need for fancier ISR/SSG in v1. Revisit if a page shows up in a perf budget.

### H.5 Types — **[Q21]**

Continue the manual TypeScript interface pattern from `src/lib/types.ts`. Types per supply table go alongside (e.g. `DimChapter`, `DimActivity`, `FactChapterActivity`). Code generation from dbt schema is a future investigation if the manual pattern decays.

---

## Section I — Internationalisation

### I.1 Norwegian first — **[Q22]**

All UI copy in Norwegian (bokmål) for v1. The personas are Norway-resident; even Amira, who arrived recently, is more likely to be served by simple Norwegian + the NGO's own language support than by a half-baked English layer.

`ref_atlas_service_category` already carries `label_no` and `label_en`; the column is there for future use but v1 surfaces only `label_no`.

### I.2 Sami / Kven names

`dim_kommune` carries `kommune_name_sami` for kommuner in Sami areas. v1 displays the bokmål name primary, with the Sami name in parentheses where present. Already the convention in the existing `/kommuner/<kommune_nr>` page; supply views inherit it.

---

## Section J — Phased rollout — **[Q23]**

### v1 — ships alongside the Red Cross display PLAN

Audience: us (validation), Inger (sees Red Cross from outside), Arne (sees his distrikt).

Pages:
- `/admin/supply/redcross-branches` (validation)
- `/ngo` (NGO index with badges)
- `/ngo/redcross` (overview)
- `/ngo/redcross/chapters` + `/ngo/redcross/chapters/<chapter_id>`
- `/ngo/redcross/aktiviteter`
- `/ngo/redcross/distrikter` (the 19 distrikter)
- `/kommuner/<kommune_nr>` extended with a "Lokale tilbud" section (Red Cross only initially)

What's not built: cross-NGO finder, maps for supply, Designsystemet migration.

### v1.5 — triggers when Folkehjelp ships

The cross-NGO finder becomes useful only when there's something to compare. Triggered by Folkehjelp landing.

Pages added:
- `/ngo/folkehjelp` + sub-views (mirrors Red Cross structure).
- `/aktivitet` index + `/aktivitet/<code>` cross-NGO finder pages.
- `/kommuner/<kommune_nr>` supply section grows to include both NGOs.
- First supply choropleth — providers per kommune for one selected service category.

### v2 — triggers when the Coverage-gap mart lands

Pages added:
- `/coverage-gap/<service-category-code>/<kommune_nr>` — supply×demand for one (service, kommune).
- An "Aktivitetsforslag basert på behov" surface on the kommune view.

### Always-on — `/admin/supply/<source-slug>` per ingest

Each new ingest PLAN includes the small validation page as part of its acceptance criteria, so we never ingest data we can't see.

---

## Decisions resolved during planning

These are the recommendations baked into the sections above; recording them here as the canonical resolved set:

1. ~~**[Q1]**~~ Three viewing layers (engineering / public org-neutral / per-NGO). Codified.
2. ~~**[Q2]**~~ Engineering-validation pages live under `/admin/...` (noindex, off public nav).
3. ~~**[Q3]**~~ Per-NGO pages live under `/ngo/<slug>/...` (singular).
4. ~~**[Q4]**~~ `/kommuner/<kommune_nr>` is extended with a "Lokale tilbud" section, not duplicated.
5. ~~**[Q5]**~~ Cross-NGO finder is `/aktivitet/<service-category-code>` (singular).
6. ~~**[Q6]**~~ Home-page nav adds "Tilbud per organisasjon" in v1; "Finn en aktivitet" in v1.5.
7. ~~**[Q7]**~~ Per-NGO views use `canonical_name`; cross-NGO views use `service_category_code`. ICNPO display deferred per [Q8].
8. ~~**[Q9]**~~ Default rendering is table/list; maps only where geographic distribution is the point. Choropleth supply views deferred to v1.5.
9. ~~**[Q11]**~~ Atlas-neutral primary; NGO branding only on `/ngo/<slug>/...` pages. No NGO logos in cross-NGO contexts.
10. ~~**[Q13]**~~ Adopt Tailwind v4 + shadcn/ui + Designsystemet tokens as Phase 1 of the v1 PLAN, not as a deferred migration. See F.3 for the integration recipe.
17. ~~**[Q27]**~~ Pathway CTAs (Gi tid / Gi penger / etc.) — **skipped in v1**. `dim_ngo` only carries `website_url`; landing pages show a single "Besøk rodekors.no" link. Pathway data lives in `common-schema.md` as `Pathway` entity but isn't in `dim_ngo` yet — extending the schema is its own future investigation/PLAN.
18. ~~**[Q28]**~~ Compare-with CTA on per-NGO pages — **deferred in v1**. The Compare-NGOs page doesn't exist yet (separate spec at [`compare-ngos-spec.md`](../../../research/compare-ngos-spec.md)). Add the CTA in v1.5+ when the destination exists.
19. ~~**[Q29]**~~ NGO logos — **plain text NGO name in v1**. No logos folder, no per-NGO image assets. Logos deferred to a brand-assets PLAN.
20. ~~**[Q30]**~~ Stub page for non-ingested NGOs — **single template at `/ngo/[slug]`** showing `dim_ngo` fields (name, website_url, primary_focus, tier) plus "Tilbud-data er ikke importert ennå. Besøk {website_url}." No per-NGO variation.
21. ~~**[Q31]**~~ Chapter table filter set — five URL params: `kommune_nr`, `fylke_nr`, `chapter_level` (national / regional / local), `service_category_code` (multi-select from the 22 categories), `is_active` toggle. Plus free-text search by chapter name as `?q=`.
22. ~~**[Q32]**~~ Admin validation page contents — see Appendix B for the exact spec.
11. ~~**[Q15]**~~ `/ngo` index shows all 11 NGOs with badges; non-ingested NGOs link to a brief stub.
12. ~~**[Q17]**~~ Server Components by default; client only when interactive.
13. ~~**[Q18]**~~ Filter state in URL query params, read via `searchParams` server-side.
14. ~~**[Q19]**~~ No pagination in v1; introduce TanStack Table with virtualisation when row counts approach ~3000.
15. ~~**[Q22]**~~ Norwegian-first UI copy; English deferred. Sami names in parentheses where present.
16. ~~**[Q23]**~~ Three-phase rollout: v1 (Red Cross + per-kommune supply section), v1.5 (Folkehjelp + cross-NGO finder + first supply choropleth), v2 (Coverage-gap consumption).

---

## Open Questions

1. **[Q8]** ICNPO display on per-NGO landing — stub footer item only, or skip entirely in v1? Recommendation: footer item.
2. **[Q10]** Distrikt diagram on `/ngo/redcross` — small SVG tree, or a flat table with parent links? Recommendation: flat table for v1 (simpler), upgrade to SVG when there are 2+ NGOs to compare hierarchies across.
3. **[Q12]** NGO brand-colour list — where does this live (a small JSON in `src/lib/`)? Source of truth and update process? Defer to first NGO landing PLAN.
4. **[Q14]** "Vis også inaktive" toggle — default off (recommended) or default on with a "skjul"? Default off.
5. **[Q16]** Staleness thresholds per source for the "Data kan være utdatert" badge. Recommend: 2× the source's expected refresh cadence (so a monthly source warns at 60+ days).
6. **[Q20]** Caching policy — accept request-time fetch cost in v1; add Next.js Cache or revalidation only when a real perf concern surfaces.
7. **[Q21]** Type generation from dbt schema — defer; manual interfaces work at v1 scale. Surface as an investigation when manual maintenance becomes painful.
8. **[Q24]** Mobile layout — does the v1 chapters table degrade gracefully on phones? Probably yes (horizontal scroll). Test with a real device before signing off the PLAN.
9. **[Q25]** Should `/ngo/redcross/distrikt/<distrikt_id>` exist as its own URL, or is "distrikt" just a filter on `/ngo/redcross/chapters`? Recommend its own URL — distrikt is a navigable entity (it has children, a name, a kommune set).
10. **[Q26]** Atlas primary brand colour. Default for v1: `#0062BA` (Designsystemet's default accent). Final colour deferred until Atlas has a brand identity; trivially regeneratable via the Designsystemet token CLI.

---

## Next Steps

Three sequential PLANs, total estimated effort ~10–15 h focused. The first one is the immediate "see the Red Cross data" PLAN.

- [ ] **PLAN-001-supply-display-v1-redcross.md** (~10–14h)
  - **Phase 1 (~3h): stack setup** — Tailwind v4 + shadcn/ui + Designsystemet tokens per F.3. Drop `@digdir/designsystemet-react`, keep `-css`. Generate Designsystemet theme with `--main-colors "accent:#0062BA"` per [Q26]. Wire `app/globals.css` with the `@theme` aliases. `npx shadcn@latest add table button card badge tabs input select`.
  - **Phase 2 (~1h): shared lib** — `src/lib/types.ts` extended with `DimChapter`, `DimActivity`, `FactChapterActivity`, `DimNgo`. `src/lib/supply.ts` with SQL helpers (mirror `src/lib/indicators.ts`).
  - **Phase 3 (~1h): admin validation** — `/admin/supply/redcross-branches` per Appendix B spec.
  - **Phase 4 (~2h): NGO index + Red Cross overview + non-ingested stub** — `/ngo` (11-NGO index with badges), `/ngo/redcross` (overview with stat blocks), `/ngo/[slug]` catch-all stub.
  - **Phase 5 (~2h): Red Cross chapters** — `/ngo/redcross/chapters` (filterable table per [Q31]), `/ngo/redcross/chapters/[chapter_id]`.
  - **Phase 6 (~1.5h): Red Cross activities + distrikter** — `/ngo/redcross/aktiviteter`, `/ngo/redcross/distrikter`, `/ngo/redcross/distrikt/[distrikt_id]`.
  - **Phase 7 (~1h): kommune view extension** — `/kommuner/[kommune_nr]` adds "Lokale tilbud — Røde Kors" section.
  - **Phase 8 (~0.5h): polish** — nav link from home page; manual smoke test on phone + desktop.
  - **Out of scope**: maps, pagination, NGO logos, Compare CTA, Pathway CTAs (all deferred per resolved Q's).

- [ ] **PLAN-002-supply-display-v1.5-cross-ngo.md** (~4–6h, triggered when Folkehjelp lands)
  - Build `/ngo/folkehjelp` + sub-views (mirroring Red Cross structure — most code becomes a per-NGO template).
  - Build `/aktivitet` index + `/aktivitet/<service-category-code>` cross-NGO finder.
  - Add the first supply choropleth on `/aktivitet/<code>?map=true`.
  - Extend `/kommuner/<kommune_nr>` supply section to include both NGOs.

- [ ] **PLAN-003-supply-display-v2-coverage-gap.md** (~6–8h, triggered by Coverage-gap mart)
  - Build `/coverage-gap/<service-category-code>/<kommune_nr>` consuming the mart.
  - Add "Aktivitetsforslag basert på behov" cross-link from kommune view.

Each PLAN ships with a manual smoke test checklist (visit each new page in a real browser, verify data and layout) per [`project-atlas.md`](../../project-atlas.md).

---

## Files this investigation will produce

**New routes (per Section J v1):**
- `app/admin/supply/redcross-branches/page.tsx`
- `app/ngo/page.tsx`
- `app/ngo/redcross/page.tsx`
- `app/ngo/redcross/chapters/page.tsx` + `app/ngo/redcross/chapters/[chapter_id]/page.tsx`
- `app/ngo/redcross/aktiviteter/page.tsx`
- `app/ngo/redcross/distrikter/page.tsx` + `app/ngo/redcross/distrikt/[distrikt_id]/page.tsx`

**Extended:**
- `app/kommuner/[kommune_nr]/page.tsx` — adds the "Lokale tilbud" section.
- `app/page.tsx` — adds nav link to `/ngo`.

**New shared code:**
- `src/lib/supply.ts` — SQL helpers analogous to `src/lib/indicators.ts`.
- `src/lib/types.ts` — extend with `DimChapter`, `DimActivity`, `FactChapterActivity`, `DimNgo` interfaces.

**Documentation:**
- Brief notes in `docs/stack/naming-conventions.md` if new vocabulary is introduced (probably not).
- A short `app/admin/README.md` explaining the `/admin/...` convention (noindex, off public nav).

---

## Companion investigations

- [`INVESTIGATE-ngo-scraping-infrastructure.md`](./INVESTIGATE-ngo-scraping-infrastructure.md) — produces the data this consumes.
- [`INVESTIGATE-multi-ngo-supply-model-extensions.md`](./INVESTIGATE-multi-ngo-supply-model-extensions.md) — produces `dim_chapter.source_url` (deep-link out of `/ngo/<slug>/chapters/<chapter_id>`) and `chapter_kommune_coverage` (consumed on the kommune view).
- [`INVESTIGATE-folkehjelp-supply.md`](./INVESTIGATE-folkehjelp-supply.md) — second NGO; v1.5 build trigger.
- [`compare-ngos-spec.md`](../../../research/compare-ngos-spec.md) — defines the deeper compare-NGOs page that sits alongside per-NGO landings.

---

## Appendix A — Page layouts (v1, Red Cross)

One paragraph per route. Components named below are shadcn primitives unless noted.

### `/admin/supply/redcross-branches`

Plain validation page. No nav, no styling beyond default. See Appendix B for content spec.

### `/ngo` — NGO index

Server Component. Fetches all 11 rows from `dim_ngo`. Renders a grid of `Card` components, one per NGO, alphabetised by `name`. Each card shows: NGO `name` (text, no logo), `primary_focus` `Badge`, `tier` `Badge`, status indicator (✅ "Tilbud importert" if `dim_chapter` count > 0, else ⏳ "Under arbeid"). Cards are `Link`-wrapped to `/ngo/<slug>` (always — the catch-all stub handles non-ingested). Page heading: "Organisasjoner i Atlas". Sub-heading: "Atlas følger 11 norske frivillige organisasjoner. Trykk på en for å se hva de tilbyr."

### `/ngo/redcross` — Red Cross overview

Server Component. Stat-block layout in three rows:
- **Row 1 — header**: NGO name (h1), `primary_focus` + `tier` `Badge`s, link out to `dim_ngo.website_url` ("Besøk rodekors.no").
- **Row 2 — counts** (4 stat `Card`s): "X lokallag", "Y distrikter", "Z aktiviteter", "W kommuner med tilbud". Each is a Server Component query.
- **Row 3 — sections**: links into the four sub-views (`Chapters →`, `Distrikter →`, `Aktiviteter →`, plus a "Se i kommunekart" link to `/kommuner` index for now).

### `/ngo/redcross/chapters` — chapters table

Server Component reading `searchParams` for filters per [Q31]: `kommune_nr`, `fylke_nr`, `chapter_level`, `service_category_code` (multi-select), `is_active`, `q` (free-text on `name`). Filters render as `Select` and `Input` components in a sticky filter bar. Default `is_active=true`. Table (shadcn `Table`) columns: `name`, `chapter_level` `Badge`, `kommune_name`, `fylke_name`, parent chapter (link). Sortable by `name` and `kommune_name` via column header buttons (Server Component re-fetches via URL params). Empty state when filters return zero: "Ingen lokallag matcher filtrene." Footer: "X av Y lokallag vist".

### `/ngo/redcross/chapters/[chapter_id]` — chapter detail

Server Component fetching one `dim_chapter` row + its activities via `fact_chapter_activities`. Layout:
- Header: `name` (h1), `chapter_level` + `is_active` `Badge`s, `kommune_name` / `fylke_name` (linked to `/kommuner/<kommune_nr>`).
- Section "Aktiviteter": list of `dim_activity.canonical_name` rows for this chapter (8–25 items typically). Each item shows the `service_category_code` as a small label.
- Section "Hierarki": parent chapter (link to its detail page) and child chapters (list, linked).
- Section "Kontakt": for v1, just a link to the NGO website. No PII.

### `/ngo/redcross/aktiviteter` — Red Cross activity catalog

Server Component listing all 35 `dim_activity` rows for `ngo_orgnr=864139442`. Table columns: `canonical_name`, `service_category_code` (`Badge` linking to a future cross-NGO `/aktivitet/<code>` page — for v1 the link is dead but the visual is right), count of chapters offering this activity (subquery on `fact_chapter_activities`). Sortable by name and chapter count.

### `/ngo/redcross/distrikter` — distrikt list

Server Component listing the 19 `chapter_level='regional'` rows. Table: `name`, count of child lokallag (subquery), `kommune_name` (where the distrikt office sits). Each row links to `/ngo/redcross/distrikt/[distrikt_id]`.

### `/ngo/redcross/distrikt/[distrikt_id]` — distrikt detail

Server Component. Header: distrikt `name`. Two sections: list of child lokallag (linked to chapter detail), aggregate stats (count of chapters, count of distinct kommuner served, count of distinct service categories offered).

### `/ngo/[slug]` — non-ingested NGO stub

Catch-all Server Component. If the slug matches a `dim_ngo` row but no `dim_chapter` rows exist, render: NGO `name` (h1), `primary_focus` + `tier` `Badge`s, `mission_short` if present (currently null in `dim_ngo`), and a single `Card` with copy: "Tilbud-data er ikke importert ennå. Følg arbeidet på [GitHub](https://github.com/terchris/atlas) eller besøk {website_url}." If no `dim_ngo` row matches, return 404.

### `/kommuner/[kommune_nr]` — extension to existing route

Existing page rendered above; new "Lokale tilbud" section appended below the indicators table. Heading: "Lokale tilbud i {kommune_name}". Subquery: all `fact_chapter_activities` rows where `kommune_nr` matches and chapter is `is_active`, grouped by `service_category_code`, listing chapter names per category. Empty state: "Ingen ingestede organisasjoner har lokale tilbud i {kommune_name}." (Per [G.2 — does not overclaim](#g2-no-supply-kommuner)).

---

## Appendix B — `/admin/supply/redcross-branches` validation spec

Single Server Component page. Plain styling (no shadcn components needed — this is for us, not for users). Six sections, each a `<section>` with an `<h2>` and a small table or stat block.

### Section 1 — Row counts

Compare expected vs actual:

| Table | Expected | Actual (live query) |
|---|---|---|
| `raw.redcross_branches` | 391 (after L192 dedup) | `select count(*) from raw.redcross_branches` |
| `raw.redcross_branch_activities` | 2143 | `select count(*) from raw.redcross_branch_activities` |
| `dim_chapter` (Red Cross) | 391 | `select count(*) from dim_chapter where ngo_orgnr = '864139442'` |
| `dim_activity` (Red Cross) | 35 | `select count(*) from dim_activity where ngo_orgnr = '864139442'` |
| `fact_chapter_activities` (Red Cross) | 1941 | `select count(*) from fact_chapter_activities where source_id = 'redcross-branches'` |

Mismatched rows render in red.

### Section 2 — Chapter level breakdown

```
select chapter_level, count(*)
from dim_chapter
where ngo_orgnr = '864139442'
group by chapter_level;
```

Expected: 1 national, 19 regional, 371 local.

### Section 3 — Service category coverage

```
select da.service_category_code,
       count(distinct fca.chapter_id) as chapter_count
from fact_chapter_activities fca
join dim_activity da on da.activity_id = fca.activity_id
where fca.source_id = 'redcross-branches'
group by da.service_category_code
order by chapter_count desc;
```

Renders as a table — validates the activity → category mapping. Each `service_category_code` should have ≥1 chapter; categories with 0 are flagged.

### Section 4 — Sample chapters

`select * from dim_chapter where ngo_orgnr = '864139442' order by random() limit 10` — shows all denormalised columns to spot-check the supply staging.

### Section 5 — Distrikt coverage

For each of the 19 distrikter: list child lokallag count, count of distinct kommuner served (via `parent_chapter_id` rollup). Validates Red Cross's hierarchy.

### Section 6 — Ingest run history

`select * from raw.ingest_runs where source_slug = 'redcross-branches' order by run_id desc limit 10` — only when `raw.ingest_runs` table exists (after the [scraping infra PLAN](./INVESTIGATE-ngo-scraping-infrastructure.md) ships). Until then, this section displays "Awaiting infrastructure PLAN — `raw.ingest_runs` not yet created."

### Page wrapper

- `<noindex />` meta tag.
- Header: "Atlas — Red Cross supply data validation".
- Footer: "Sist oppdatert: {now()}" — this page renders fresh on every request, no caching.
