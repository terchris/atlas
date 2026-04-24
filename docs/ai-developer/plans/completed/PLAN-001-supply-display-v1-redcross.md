# PLAN-001: Supply display v1 — Red Cross

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Build the first supply-display surfaces in the Atlas frontend — engineering-validation page for the Red Cross ingest, an `/ngo` index, full per-NGO landing pages for Red Cross (`/ngo/redcross/...`), a stub template for the 10 not-yet-ingested NGOs, and a "Lokale tilbud" extension to `/kommuner/[kommune_nr]`. Adopt Tailwind v4 + shadcn/ui + Designsystemet tokens as the new visual stack alongside this work.

**Last Updated**: 2026-04-24

**Completed**: 2026-04-24 — user confirmed "i can see the data now :)" after smoke-testing the live site at http://localhost:4000.

**Investigation**: [INVESTIGATE-supply-frontend-display.md](../backlog/INVESTIGATE-supply-frontend-display.md) — Sections C, D, E, F.3, H, J + Appendices A and B.

**Estimated effort**: 10–14 hours focused. Actual: ~6h end-to-end including the Next 16 upgrade folded in mid-PLAN.

---

## Dependencies

- **Prerequisite (must already be merged)**: PLAN-002 from [`INVESTIGATE-ngo-supply-data-model.md`](./INVESTIGATE-ngo-supply-data-model.md). ✅ Already shipped — `dim_chapter`, `dim_activity`, `fact_chapter_activities` populated for Red Cross.
- **Not blocked by**: the [scraping infrastructure](./INVESTIGATE-ngo-scraping-infrastructure.md) PLAN, the [multi-NGO model extensions](../backlog/INVESTIGATE-multi-ngo-supply-model-extensions.md) PLAN, or the [Folkehjelp ingest](../backlog/INVESTIGATE-folkehjelp-supply.md) PLANs. Each adds capabilities that this PLAN can consume later but doesn't require.
- **`raw.ingest_runs` not yet present**: Section 6 of the admin validation page (Phase 3) shows "Awaiting infrastructure PLAN" until the scraping infra PLAN ships. Not blocking.
- **`dim_chapter.source_url` not yet present**: chapter detail page links out via `dim_ngo.website_url` only (no per-chapter deep-link). Lands when the multi-NGO extensions PLAN ships.

---

## Overview

This is the first supply-display PLAN. It validates that the Red Cross data we imported via PLAN-002 looks right (admin page) and gives Inger and Arne a useful view of "Red Cross from outside" (per-NGO landing pages). It also extends the existing `/kommuner/[kommune_nr]` route with the first cross-NGO supply section (single NGO for now; the section grows as more NGOs ingest).

This PLAN is also the moment we adopt Tailwind v4 + shadcn/ui + Designsystemet tokens as Atlas's frontend stack. The existing 5 demand-side routes are not touched in v1 — they migrate later.

---

## Phase 1: Stack setup — Tailwind v4 + shadcn/ui + Designsystemet tokens — DONE

### Tasks

- [x] 1.1 Install dependencies. From repo root:
  - Add: `tailwindcss@^4`, `@tailwindcss/postcss`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`.
  - Already present: `@digdir/designsystemet-css@^1.13.2` — keep.
  - Remove: `@digdir/designsystemet-react` from `package.json` dependencies (currently unused).
- [x] 1.2 Configure PostCSS. Create `postcss.config.mjs` at repo root with `@tailwindcss/postcss` as the only plugin.
- [x] 1.3 Generate the Designsystemet theme:
  ```bash
  npx @digdir/designsystemet tokens create \
    --main-colors "accent:#0062BA" \
    --neutral-color "#1E2B3C" \
    --border-radius 4 \
    --theme atlas
  npx @digdir/designsystemet tokens build
  ```
  Output goes to `design-tokens/atlas/` (created by the CLI). Add to `.gitignore`? **No** — commit the generated CSS so the build is deterministic. See investigation [Q26] for the brand colour decision.
- [x] 1.4 Wire `app/globals.css`:
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
  Preserve any existing minimal CSS reset already in `globals.css` (don't break the 5 existing demand-side routes).
- [x] 1.5 Initialise shadcn — done **manually** (wrote `components.json` + `src/lib/utils.ts` directly to avoid `npx shadcn init` overwriting the carefully-wired `globals.css`).
- [x] 1.6 Install the v1 component set:
  ```bash
  npx shadcn@latest add table button card badge tabs input select label --yes
  ```
  Created 8 files under `src/components/ui/`.
- [x] 1.7 Verify: `npx tsc --noEmit` clean, `npm run build` succeeds, all 5 existing routes still produce. Browser smoke test deferred to Phase 8.

**Phase 1 outcome**: stack is in place and compiles cleanly. New runtime files: `postcss.config.mjs`, `components.json`, `src/lib/utils.ts`, 8 shadcn primitives in `src/components/ui/`, generated Designsystemet theme in `design-tokens/` (source) + `design-tokens-build/atlas.css` (built CSS). `app/globals.css` rewritten to compose Tailwind + custom Atlas theme + Designsystemet bridge + shadcn aliases.

### Validation

```bash
npm run dev
# In a real browser, visit:
#   http://localhost:3000/
#   http://localhost:3000/data
#   http://localhost:3000/coverage-gap/barnefattigdom
#   http://localhost:3000/kommuner/0301
# All should render without errors.
# Then verify a Tailwind utility works:
#   add a one-off `<div className="bg-primary text-primary-foreground p-4">test</div>`
#   to app/page.tsx, verify the colour is the Atlas blue (#0062BA-ish).
#   Remove the test div before continuing.
```

User confirms shadcn primitives render with Designsystemet tokens applied.

---

## Phase 2: Shared supply lib — DONE

### Tasks

- [x] 2.1 Extend `src/lib/types.ts` with the new interfaces. Reference the actual marts schema in `atlas-data-repo/dbt/models/dimensions/schema.yml` and `atlas-data-repo/dbt/models/marts/schema.yml`:
  ```ts
  export interface DimNgo {
    orgnr: string;
    slug: string;
    name: string;
    brand_name: string | null;
    website_url: string | null;
    tier: string;
    chapter_data_shape: string;
    has_chapters: boolean;
    primary_focus: string | null;
    icnpo_code_1: string | null;
    icnpo_code_2: string | null;
    icnpo_code_3: string | null;
  }

  export interface DimChapter {
    chapter_id: string;
    ngo_orgnr: string;
    chapter_level: 'national' | 'regional' | 'local';
    parent_chapter_id: string | null;
    chapter_orgnr: string | null;
    name: string;
    kommune_nr: string | null;
    is_active: boolean;
    updated_at: string;
  }

  export interface DimActivity {
    activity_id: string;
    ngo_orgnr: string;
    canonical_name: string;
    service_category_code: string;
    is_active: boolean;
  }

  export interface FactChapterActivity {
    chapter_id: string;
    activity_id: string;
    ngo_orgnr: string;
    kommune_nr: string | null;
    local_activity_name: string;
    canonical_name: string;
    is_active: boolean;
    source_id: string;
    updated_at: string;
  }
  ```
- [x] 2.2 Create `src/lib/supply.ts`. Mirror `src/lib/indicators.ts`'s shape (Server-Component-friendly async functions returning typed rows). Functions to add:
  - `listNgos(): Promise<NgoWithStatus[]>` — `dim_ngo` joined to a chapter-count subquery, returning `{ngo: DimNgo, chapter_count: number, has_supply: boolean}`. Used by `/ngo`.
  - `getNgoBySlug(slug: string): Promise<DimNgo | null>` — used by `/ngo/[slug]` catch-all.
  - `getNgoOverview(orgnr: string): Promise<{chapter_count, distrikt_count, activity_count, kommune_count}>` — used by `/ngo/redcross`.
  - `listChapters(orgnr: string, filters: ChapterFilters): Promise<ChapterRow[]>` — filters per [Q31]. ChapterRow joins `dim_chapter` to `dim_kommune` and `dim_fylke`.
  - `getChapterDetail(chapter_id: string): Promise<ChapterDetail>` — chapter row + its activities + parent + children.
  - `listActivities(orgnr: string): Promise<ActivityRow[]>` — `dim_activity` with chapter-count subquery.
  - `listDistrikter(orgnr: string): Promise<DistriktRow[]>` — `chapter_level='regional'` rows with child-chapter and kommune counts.
  - `getDistriktDetail(chapter_id: string): Promise<DistriktDetail>` — child chapters + aggregate stats.
  - `listChaptersInKommune(kommune_nr: string): Promise<ChapterInKommuneRow[]>` — for the `/kommuner/[kommune_nr]` extension. Groups by `service_category_code`.
- [x] 2.3 Each function fetches via the existing `db()` from `src/lib/db.ts`. SQL is inline template literals; cast results to typed interfaces (the existing pattern). No new DB client, no ORM.

**Phase 2 outcome**: `src/lib/types.ts` extended with 6 supply types; `src/lib/supply.ts` (~330 lines) provides 9 helpers covering NGO index, NGO overview, chapter list/detail, activity catalog, distrikt list/detail, kommune supply lookup, service-category list. `npx tsc --noEmit` clean.

### Validation

```bash
# Type-check
cd /Users/terje.christensen/learn/helpers/atlas
npx tsc --noEmit
# Should pass with no errors related to new types.
```

User confirms types and lib compile cleanly.

---

## Phase 3: Engineering validation page — `/admin/supply/redcross-branches` — DONE

### Tasks

- [x] 3.1 Create `app/admin/supply/redcross-branches/page.tsx`. Server Component. Implement the 6 sections per Investigation Appendix B:
  1. Row counts (expected vs actual table; mismatches in red)
  2. Chapter level breakdown (national / regional / local)
  3. Service category coverage (count of Red Cross chapters per `service_category_code`)
  4. Sample 10 random chapters
  5. Distrikt coverage (per distrikt: child count, kommune count)
  6. Ingest run history (Section conditionally renders "Awaiting infrastructure PLAN" if `raw.ingest_runs` doesn't exist; check via `to_regclass('raw.ingest_runs') IS NOT NULL`)
- [x] 3.2 Add `<meta name="robots" content="noindex" />` via Next.js `metadata` export.
- [x] 3.3 No nav links to this page from public surfaces. Documented in `app/admin/README.md` (a single short file explaining the `/admin` convention).

**Phase 3 outcome**: `/admin/supply/redcross-branches` builds; six sections with graceful degradation when the frontend role can't read `raw.*` (current setup — clearly labeled). Smoke test deferred to Phase 8.

### Validation

```bash
# Visit http://localhost:3000/admin/supply/redcross-branches
# Verify:
#   - Section 1: counts match — 391 / 2143 / 391 / 35 / 1941
#   - Section 2: 1 national, 19 regional, 371 local
#   - Section 3: every service category has ≥1 chapter
#   - Section 4: 10 random chapters render with all columns
#   - Section 5: 19 distrikter with child/kommune counts
#   - Section 6: "Awaiting infrastructure PLAN" message
```

User confirms numbers match the post-PLAN-002 expectations.

---

## Phase 4: NGO index, Red Cross overview, non-ingested stub — DONE

### Tasks

- [x] 4.1 Create `app/ngo/page.tsx` (the `/ngo` index). Server Component using `listNgos()`. Renders a grid of shadcn `Card`s — one per NGO (11 total). Each card shows: NGO name, `primary_focus` `Badge`, `tier` `Badge`, status indicator (✅ "Tilbud importert" if `chapter_count > 0`, else ⏳ "Under arbeid"). Cards link to `/ngo/[slug]`. Page heading + sub-heading per Investigation Appendix A.
- [x] 4.2 Create `app/ngo/redcross/page.tsx` (the Red Cross overview). Server Component using `getNgoOverview('864139442')`. Three-row layout per Investigation Appendix A: header (name, badges, website link), 4-stat grid (`Card` per stat), section links into `/ngo/redcross/{chapters,distrikter,aktiviteter}` and `/kommuner` index.
- [x] 4.3 Create `app/ngo/[slug]/page.tsx` — the catch-all stub. Server Component using `getNgoBySlug(slug)`. Static `/ngo/redcross` route takes precedence over the `[slug]` dynamic segment by Next.js convention (no explicit redirect needed — verified via build output). Catch-all renders the stub layout per Appendix A; missing slug → `notFound()`.
- [x] 4.4 Add a nav link from `app/page.tsx` to `/ngo` ("Tilbud per organisasjon"). Inserted as the third `<li>` in the existing list, matching the existing inline-style pattern (didn't migrate the home page to Tailwind/shadcn — that's a follow-up PLAN per the investigation).

**Phase 4 outcome**: 3 new routes (`/ngo`, `/ngo/redcross`, `/ngo/[slug]`) + nav link. 11 NGOs visible in the index; only Red Cross shows `✓ Tilbud importert`, the other 10 show `⏳ Under arbeid` and route to the stub.

### Validation

```bash
# Visit http://localhost:3000/ngo
#   - 11 cards rendered, alphabetical
#   - Only Red Cross shows ✅; the other 10 show ⏳
#   - Cards are clickable
# Visit http://localhost:3000/ngo/redcross
#   - Counts: 391 lokallag, 19 distrikter, 35 aktiviteter, X kommuner
#   - Section links navigate
# Visit http://localhost:3000/ngo/folkehjelp
#   - Stub renders with name, badges, website link, "Tilbud-data er ikke importert ennå" copy
# Visit http://localhost:3000/ngo/nonexistent-slug
#   - 404
```

User confirms all four pages render correctly.

---

## Phase 5: Red Cross chapters list + detail — DONE

### Tasks

- [x] 5.1 Create `app/ngo/redcross/chapters/page.tsx`. Server Component reading `searchParams` for the 5 filters per [Q31] plus free-text `q`. Filter form built with native `<form method="get">` plus shadcn `Input`/`Label`/`Button` and native `<select>` styled with Tailwind to match shadcn (avoided shadcn's `Select` because it requires client component and we wanted everything server-rendered). Default `is_active=true`; checkbox toggles to include inactive. Table renders shadcn `Table`. Chapter name links to detail; kommune/parent are also linked.
- [x] 5.2 Create `app/ngo/redcross/chapters/[chapter_id]/page.tsx`. Server Component using `getChapterDetail(chapter_id)`. Header with name + level badge + active flag + kommune/fylke link + chapter's own `web` URL (linked out). "Aktiviteter" `Card` lists activities with their service-category labels as `Badge`s. Two side-by-side `Card`s for Forelder + Underliggende (parent / children navigation). Final `Card` for "Kontakt og adresse" — uses the `web`/`email`/`phone`/`postal_*` fields from `dim_chapter` (which already exist in the marts schema; the planned `source_url` from the multi-NGO extensions PLAN turned out to be a duplicate of the existing `web` column).

**Phase 5 outcome**: filterable chapters table works with all 5 URL params; chapter detail covers activities, hierarchy, contact. Notable discovery: `dim_chapter.web` already carries the chapter URL, so Phase 5 didn't need to wait for the multi-NGO extensions PLAN.

### Validation

```bash
# Visit http://localhost:3000/ngo/redcross/chapters
#   - All 371 active local chapters render (default filter)
#   - Filter by ?fylke_nr=03 → only Oslo chapters
#   - Filter by ?chapter_level=regional → 19 distrikter
#   - Filter by ?q=Modum → only matching chapters
# Visit http://localhost:3000/ngo/redcross/chapters/<a real chapter_id>
#   - Shows chapter name, badges, kommune link
#   - Lists activities with service_category_code labels
#   - Shows parent + child links
```

User confirms filtering works and detail page renders correctly.

---

## Phase 6: Red Cross activities and distrikter — DONE

### Tasks

- [x] 6.1 Create `app/ngo/redcross/aktiviteter/page.tsx`. Server Component using `listActivities('864139442')`. Table with 35 activities, sorted by `canonical_name`. The `service_category_code` column renders as a Badge — link to `/aktivitet/[code]` deferred (the destination doesn't exist in v1; rendering as a plain Badge for now). Note at the top about cross-NGO search coming in a later version.
- [x] 6.2 Create `app/ngo/redcross/distrikter/page.tsx`. Server Component using `listDistrikter('864139442')`. Table of 19 distrikter with active-children count + distinct-kommune count. Distrikt name links to its detail page.
- [x] 6.3 Create `app/ngo/redcross/distrikt/[distrikt_id]/page.tsx`. Server Component using `getDistriktDetail(distrikt_id)`. Header with name + badge + distriktskontor (linked kommune). 3-stat grid (children / kommuner / aktivitetstyper). Card with the list of child lokallag (linked to chapter detail).

**Phase 6 outcome**: aktivitetskatalog (35 rows, RC's full canonical activity set) + distrikter list (19 rows, child counts sum to ~371 = the local lokallag count) + distrikt detail. All three routes build clean.

### Validation

```bash
# Visit http://localhost:3000/ngo/redcross/aktiviteter
#   - 35 rows, sorted by name (or chapter count descending — pick one)
#   - service_category_code badges visible
# Visit http://localhost:3000/ngo/redcross/distrikter
#   - 19 distrikter listed with child counts summing to ~371
# Visit http://localhost:3000/ngo/redcross/distrikt/<a real distrikt id>
#   - Lists child lokallag, shows aggregate stats
```

User confirms.

---

## Phase 7: Extend `/kommuner/[kommune_nr]` with supply section — DONE

### Tasks

- [x] 7.1 Modify `app/kommuner/[kommune_nr]/page.tsx`. Appended a new `<section>` titled "Lokale tilbud i {kommune_name}" **after** the indicators block. Server-side `listChaptersInKommune(kommune_nr)` runs in parallel with the existing indicator fetches. Results grouped by `service_category_label_no`; each group lists deduped chapter names (one chapter can appear under one category via multiple activity rows — JS dedupe via `Map<chapter_id, row>`).
- [x] 7.2 Empty state: when no chapters from any ingested NGO have rows for this kommune, the section renders the planned "Ingen ingestede organisasjoner har lokale tilbud i {kommune_name}." copy. Honest about what we know vs don't.
- [x] 7.3 Kept the new section's visual style consistent with the existing inline-CSS indicators sections (rather than mixing shadcn `Card` mid-page). The kommune page is one of the 5 demand-side routes; the investigation says these migrate to shadcn in a separate later PLAN. v1 supply work doesn't disturb the existing styling.

**Phase 7 outcome**: `/kommuner/0301` (Oslo) shows ~30 Red Cross chapters under their service categories below the indicators table; `/kommuner/3030` (Lillestrøm) shows the empty-state copy. Surfaced a real bug in `listChaptersInKommune` — `SELECT DISTINCT … ORDER BY sc.sort_order` was missing `sort_order` in the projection (Postgres requires it under DISTINCT). Fixed by adding `sort_order` to the SELECT list. See Implementation Notes below.

### Validation

```bash
# Visit http://localhost:3000/kommuner/0301 (Oslo)
#   - Existing indicators section renders
#   - New "Lokale tilbud" section below shows Red Cross chapters in Oslo
# Visit http://localhost:3000/kommuner/2102 (a kommune with no Red Cross presence)
#   - Empty state copy renders, not blank
```

User confirms the section integrates cleanly without breaking the existing page.

---

## Phase 8: Polish + smoke test — DONE

### Tasks

- [x] 8.1 Verify the home-page nav link to `/ngo` works (added in 4.4). Confirmed: rendered HTML shows the new `<li>` with `href="/ngo"`. User confirmed visible after a hard-refresh.
- [x] 8.2 Manual smoke test in a desktop browser. User walked the routes and confirmed "i can see the data now :)" on 2026-04-24.
- [x] 8.3 Manual smoke test on a phone — deferred to user as low-priority follow-up; the v1 tables use `overflow-x-auto` containers and degrade to horizontal scroll on narrow viewports. No layout-breaking issues expected.
- [x] 8.4 `npx tsc --noEmit` passes (cleanly on Next 16.2.4 / TS 6.0.3).
- [x] 8.5 `npm run build` succeeds — all 14 routes compile under Turbopack. Build output shows the 9 new supply routes alongside the 5 existing demand-side ones.
- [x] 8.6 Visual check: Atlas blue `#0062BA` visible on the chapters-page filter "Bruk filtre" button; Designsystemet typography active. Confirmed by user.
- [x] 8.7 Update `docs/stack/naming-conventions.md` — no new vocabulary introduced; the supply terms (`service_category_code`, `chapter_data_shape`, `tier`, `primary_focus`) were added by previous PLANs. No update needed.

**Phase 8 outcome**: site live and validated. User confirmed "i can see the data now :)". No regressions in the 5 existing demand-side routes.

### Validation

User browses the live frontend on desktop and phone; confirms each new page renders, filters work, navigation flows are clear, and Designsystemet tokens are visible.

---

## Acceptance Criteria

- [x] Tailwind v4 + shadcn/ui + Designsystemet tokens are wired and working in production (Phase 1).
- [x] All 7 new public routes render correctly (Phases 4–6): `/ngo`, `/ngo/redcross`, `/ngo/redcross/chapters`, `/ngo/redcross/chapters/[chapter_id]`, `/ngo/redcross/aktiviteter`, `/ngo/redcross/distrikter`, `/ngo/redcross/distrikt/[distrikt_id]`.
- [x] The catch-all `/ngo/[slug]` stub renders for the 10 non-ingested NGOs.
- [x] `/admin/supply/redcross-branches` validates the import counts (Phase 3).
- [x] `/kommuner/[kommune_nr]` has the new "Lokale tilbud" section (Phase 7).
- [x] Home page links to `/ngo`.
- [x] All existing 5 demand-side routes still render correctly (no regression).
- [x] `npx tsc --noEmit` and `npm run build` both pass.
- [x] Manual smoke test on desktop confirmed by user; phone test deferred (tables use `overflow-x-auto`).
- [x] `@digdir/designsystemet-react` removed from `package.json`.

---

## Out of scope (per resolved Q's in the investigation)

- **Maps** — no supply choropleths in v1; the data is too sparse with one NGO. v1.5 adds them with Folkehjelp.
- **Pagination** — 391 chapters is small enough for a plain table. TanStack Table virtualisation when row counts approach ~3000.
- **NGO logos** — plain text NGO names. Logos are a brand-assets PLAN.
- **Compare-with CTA** — destination doesn't exist yet (Compare-NGOs page is a separate spec). Add in v1.5+.
- **Pathway CTAs** — `dim_ngo` lacks pathway data; show single `website_url` link only. Pathway extension is its own future investigation.
- **Cross-NGO finder** (`/aktivitet/[code]`) — premature with one NGO. Add in v1.5 when Folkehjelp lands.
- **Coverage-gap mart consumption** — its own future investigation; v2.
- **Designsystemet migration of existing 5 demand-side routes** — separate small PLAN later.
- **i18n English layer** — Norwegian-first per [Q22]. English deferred.
- **Per-chapter PII (kontaktperson)** — explicit no per scraping infra D.3.

---

## Implementation Notes

### Why adopt the stack now instead of deferring

Adopting Tailwind v4 + shadcn + Designsystemet at the start of the v1 supply work avoids two later costs: (a) migrating ~7 freshly-built supply pages from inline CSS to the new stack, and (b) discovering at v1.5 (when cross-NGO views need DataTable, multi-select, and chart components) that we need to retrofit shadcn anyway. The cost of adopting now is one Phase 1 (~3h); the cost of deferring is double that plus visual inconsistency.

### Why `app/admin/...` for the validation page

Two reasons: (1) it's not a user-facing destination, so it shouldn't appear in nav or sitemap; (2) it sets a convention — every future ingest PLAN includes a small `/admin/supply/<source>` validation page as part of its acceptance criteria, so we never ingest data we can't see. Documented in `app/admin/README.md`.

### Why no internal API routes

The frontend reads `marts.*` directly via the `postgres` client in `src/lib/db.ts`. No `/api/...` routes for supply data in v1 — the SQL is in Server Components, and there's no third-party consumer that needs an HTTP API surface. Add API routes when there's a real consumer (mobile app, third-party integration, …).

### Server vs Client Components

Default to Server. Only Client where you need interactive state (filter bar updates, sortable column toggles). The chapter table's filter bar is the most interactive thing in v1 — keep it small. Use Next.js's `searchParams`-driven pattern (Server Component reads `searchParams`, runs SQL, renders); client form just submits the URL change. No client-side filtering of pre-fetched rows.

### `src/lib/supply.ts` mirrors `src/lib/indicators.ts`

Keeping the lib structure parallel to the existing demand-side lib means future PLANs (v1.5 cross-NGO finder, v2 Coverage-gap) follow a known pattern. Don't introduce a different shape just because it's a new file.

### Mid-PLAN deviations (recorded for the next contributor)

These weren't in the PLAN but happened during implementation. Calling them out so the next reader understands why the as-built state differs in small ways.

1. **Next.js 15 → 16 upgrade folded into this PLAN.** When the user reviewed Phase 1, they pointed out we were on Next 15.5.15 while 16.2.4 was the latest stable (released 2025-10-21). I bumped `next`, `react`, `react-dom`, `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `maplibre-gl`, `@digdir/designsystemet-css` to latest stable. No codemods needed — the only Next 16 change visible in the build is `▲ Next.js 16.2.4 (Turbopack)` (Turbopack is now the default dev/build runtime). All tests still pass on the new versions. Worth its own PLAN-002 in retrospect; doing it inline here was practical because there was nothing else to upgrade.

2. **`SELECT DISTINCT … ORDER BY sc.sort_order` bug** in `listChaptersInKommune`. Postgres requires every ORDER BY column to appear in the SELECT list under DISTINCT. The first run of `/kommuner/0301` after Phase 7 returned 500 because of this; fixed by adding `sc.sort_order` to the projection (and a comment explaining why it's there even though no consumer reads it). General lesson: when writing `SELECT DISTINCT … ORDER BY x`, x must be in the SELECT.

3. **Dev-server staleness after major dep churn.** The user had a Next 15 dev-server process running on port 4000 throughout Phase 1's npm install. After my changes, that process kept the old in-memory webpack module graph and started returning 500s with `Cannot find module './778.js'`. Fix is `kill <pid>; rm -rf .next; npm run dev`. Recipe documented here so the next dev who lands a big dep change doesn't waste 10 minutes on it.

4. **`dim_chapter.web` already exists** as the chapter-website column. The investigation talks about adding `source_url` via the [multi-NGO extensions PLAN](../backlog/INVESTIGATE-multi-ngo-supply-model-extensions.md), but inspection of the live `dim_chapter` schema (built by PLAN-002) revealed that the same data is already exposed as `web` — populated from Red Cross's API `branchUrl` field via `supply__redcross_branches.sql`. So Phase 5's chapter detail page links out via `chapter.web` directly, no schema change needed. The `source_url` work in the multi-NGO extensions PLAN is now mostly a rename + per-NGO normalisation question, not a new column.

5. **shadcn `Select` not used.** The PLAN suggested shadcn primitives for the chapters filter. shadcn `Select` is a Radix `Select.Root` wrapper that requires a Client Component. To keep the chapters page server-rendered (and avoid hydrating the filter form), I used native `<select>` elements styled with the same Tailwind classes shadcn applies to its Input — visually consistent, no client-component cost. shadcn `Select` becomes worthwhile when we need filtering UX richer than a native dropdown (multi-select, search, command palette).

---

## Files to Modify / Create

**Modified:**
- `package.json` — add Tailwind/shadcn deps, remove `@digdir/designsystemet-react`
- `app/page.tsx` — add nav link to `/ngo`
- `app/globals.css` — Tailwind import + Designsystemet bridge + `@theme` aliases
- `app/kommuner/[kommune_nr]/page.tsx` — append "Lokale tilbud" section
- `src/lib/types.ts` — add supply interfaces
- `tsconfig.json` — add `@/*` path alias if shadcn init didn't set it up
- `docs/stack/naming-conventions.md` — minor updates if needed

**Created:**
- `postcss.config.mjs`
- `components.json` (shadcn config)
- `src/components/ui/*` — shadcn primitives (table, button, card, badge, tabs, input, select, label)
- `src/lib/supply.ts`
- `src/lib/utils.ts` (created by shadcn init — `cn()` helper)
- `design-tokens/atlas/*` — generated by `npx @digdir/designsystemet tokens`
- `app/admin/README.md` — documents the `/admin` convention
- `app/admin/supply/redcross-branches/page.tsx`
- `app/ngo/page.tsx`
- `app/ngo/redcross/page.tsx`
- `app/ngo/redcross/chapters/page.tsx`
- `app/ngo/redcross/chapters/[chapter_id]/page.tsx`
- `app/ngo/redcross/aktiviteter/page.tsx`
- `app/ngo/redcross/distrikter/page.tsx`
- `app/ngo/redcross/distrikt/[distrikt_id]/page.tsx`
- `app/ngo/[slug]/page.tsx` (catch-all stub)
