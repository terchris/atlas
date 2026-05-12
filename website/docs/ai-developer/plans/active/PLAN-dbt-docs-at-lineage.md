# PLAN: Ship dbt-docs at `atlas.sovereignsky.no/lineage/`

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — Phase 1 in progress

**Goal**: Add a third surface to Atlas's Docusaurus site at `/lineage/` that renders the dbt project's full model lineage / DAG / column docs / schema descriptions. Single file, no CORS, no UIS coordination, no live DB at render time.

**Last Updated**: 2026-05-12

**Investigation**: [INVESTIGATE-deployment-pipeline.md](../backlog/INVESTIGATE-deployment-pipeline.md) — closes the "dbt-docs at `/lineage/`" item from the v1 priority order. The hostname / deploy story (GitHub Pages, custom domain, snapshot pattern) is settled by [PLAN-docusaurus-install.md](../completed/PLAN-docusaurus-install.md) and [PR #94](https://github.com/terchris/atlas/pull/94) (Scalar pattern).

**Prerequisites**: Local Atlas Postgres reachable on `localhost:35432` (UIS port-forward) for the **initial snapshot only** — same dependency `npm run api:snapshot` already has.

---

## Problem Summary

Atlas has a non-trivial dbt project at [`atlas-data/dbt/`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt) — 855 nodes, ≥38 ingest sources flowing into `marts.*`. Contributors and curious external developers benefit from being able to see the full DAG: which raw tables feed which marts, what column `EUskala50` means in `indicators__ssb_08764`, what tests run on `dim_kommune`, etc. dbt's stock `dbt docs serve` does exactly this, but it's a local-only dev tool — no shared URL.

Per the [deployment-pipeline INVESTIGATE](../backlog/INVESTIGATE-deployment-pipeline.md), the v1 plan is to ship the dbt docs static bundle as a subpath of the main Docusaurus site at `atlas.sovereignsky.no/lineage/`. Research (see [Implementation Notes](#implementation-notes) below) confirms the cleanest mechanism is dbt's `--static` flag, which produces a single `static_index.html` (~4 MB) with `manifest.json` + `catalog.json` embedded — sidesteps the well-known subpath-routing bug where vanilla dbt-docs fetches `/manifest.json` at the root.

---

## Phase 1: Snapshot script + page wiring

Mirror the [Scalar pattern from PR #94](https://github.com/terchris/atlas/pull/94): committed snapshot, manual refresh, same-origin serving. Two artefacts to land + a navbar entry.

### Tasks

- [x] 1.1 Add `website/scripts/snapshot-lineage.mjs` — Node script that:
  - Resolves the path to `atlas-data/dbt/` (relative to `website/`).
  - Shells out: `uv run --env-file ../ingest/.env dbt docs generate --static --no-compile` (`--no-compile` skips re-running the model-compile step; uses whatever's already in `target/manifest.json` and freshly queries the DB for `catalog.json`). The DB query is the part that *can* fail when Postgres isn't reachable — the script should fail loudly if so (so the operator knows to start UIS / re-expose Postgres).
  - Copies `atlas-data/dbt/target/static_index.html` → `website/static/lineage/index.html`.
  - Logs file size + dbt node count for sanity (parallel to how `snapshot-openapi.mjs` reports paths + definitions).
- [x] 1.2 Add `"lineage:snapshot": "node scripts/snapshot-lineage.mjs"` to `website/package.json` scripts.
- [x] 1.3 Run the snapshot once. Commit `website/static/lineage/index.html`. Expected size: ~4 MB; the Atlas dbt project has 855 nodes, the static bundle embeds the manifest + catalog.
- [x] 1.4 Add a navbar entry to `docusaurus.config.ts`:
  - `{ to: '/lineage/', label: 'Lineage', position: 'left' }` (or similar) next to the existing Docs + API links.
  - The `/` trailing slash matters — Docusaurus + GitHub Pages serve `static/lineage/index.html` at `/lineage/`, and the trailing slash avoids a 301 redirect.
- [x] 1.5 Verify locally:
  - `npm run build` succeeds (no broken links — onBrokenLinks: 'throw' is active).
  - `npm run serve` then `curl http://localhost:3000/lineage/` returns 200 with the dbt-docs single-file UI.
  - Open the page in a browser: the dbt-docs three-pane layout renders, sidebar lists all 855 nodes, lineage graph works, column descriptions visible.
- [ ] 1.6 Push, PR, merge — same flow as #93–#96.
- [ ] 1.7 Verify live at `https://atlas.sovereignsky.no/lineage/`.

### Validation

`https://atlas.sovereignsky.no/lineage/` renders the Atlas dbt-docs UI. The lineage graph for any `marts.*` model shows its upstream `raw.*` sources and downstream consumers correctly. Column descriptions from `schema.yml` files surface in the per-model column panel. Navbar shows three Atlas surfaces: Docs (`/`), API (`/api`), Lineage (`/lineage/`).

---

## Acceptance Criteria

- [ ] `npm run lineage:snapshot` (in `website/`) regenerates `static/lineage/index.html` from the local dbt project. Fails loudly if Postgres isn't reachable.
- [ ] `website/static/lineage/index.html` is committed (a ~4 MB single-file snapshot).
- [ ] Navbar shows a "Lineage" entry that opens `/lineage/`.
- [ ] `https://atlas.sovereignsky.no/lineage/` is live and renders the full dbt-docs UI.
- [ ] CI build passes (existing workflow gates).

---

## Implementation Notes

### Why `--static` (and why not the multi-file layout)

dbt's normal `docs generate` produces `index.html` + `manifest.json` + `catalog.json` + `run_results.json` separately. The HTML loads the JSONs at runtime from **the root of wherever it's served**, e.g. `/manifest.json`, not `/lineage/manifest.json`. This is a [known dbt-docs limitation](https://github.com/fishtown-analytics/dbt-docs/issues/51) when hosting at a subpath — open since 2022, no upstream fix planned because `--static` solves it. Atlas's prior PLAN-008 (paused — [`PLAN-008-developer-discovery-surface.md`](../backlog/PLAN-008-developer-discovery-surface.md)) implicitly assumed the multi-file layout could work at `/lineage/` inside the customer Next.js app. Now that we're on Docusaurus + GitHub Pages, `--static` is the cleaner mechanism.

`--static` collapses the three JSONs into one base64-blob inside the HTML. One file at `/lineage/index.html`. No fetches. No subpath issues.

### dbt version compatibility

- dbt-core **1.8.x** (Atlas's pinned version): `--static` works correctly. Verified locally 2026-05-12 — produced a 4.3 MB single-file bundle from Atlas's existing manifest.
- dbt-core **1.9.4 + 1.10.8**: regression filed at [dbt-core Issue #11986](https://github.com/dbt-labs/dbt-core/issues/11986) — `--static` reportedly produces a file without the embedded JSONs. Open since 2025-09-02, no fix released. Avoid bumping dbt past 1.8.x until this is resolved, or test `--static` after every bump.

### The snapshot pattern

Same shape as `npm run api:snapshot` for the OpenAPI spec (`scripts/snapshot-openapi.mjs`, PR #94 + #95):

- The committed file is the source of truth for what production serves.
- Refresh is manual; the script is local-Postgres-dependent.
- Drift between snapshots is acceptable (lineage doesn't change daily; running `npm run lineage:snapshot` before a release is enough).

If/when CI gains DB access (e.g. ephemeral Postgres in GHA per [INVESTIGATE-deployment-pipeline.md](../backlog/INVESTIGATE-deployment-pipeline.md) Q9), the snapshot can move to a CI step + automatic commit. Not in scope here.

### Navbar entry: `pathname://` + new-tab quirk

Two Docusaurus footguns showed up wiring the navbar entry:

1. **`to:` vs `href:`** — `to:` makes Docusaurus client-side-route the click, which 404s because `/lineage/` is a static file, not a React route. `href:` makes it a plain anchor.
2. **`trailingSlash: false`** — even with `href:`, Docusaurus normalises trailing slashes on emitted hrefs, turning `/lineage/` → `/lineage`. Misses the static file. Fix: use the `pathname://` protocol (`href: 'pathname:///lineage/'`), Docusaurus's explicit "don't process this link" escape hatch.

Side effect: `href:` items default to `target="_blank"` (open in a new tab). Acceptable for now — dbt-docs is heavier UI than the rest of Atlas's docs so opening in a new tab arguably makes sense. If we want same-tab behavior, add `target: '_self'` to the navbar item config.

### Raw-source column-description gap (out of scope; surfaced by this PLAN)

Inspecting `/lineage/` will show that `raw.*` sources (sourced from `models/shared/sources.yml`) have **0/28 column descriptions** today — table-level descriptions exist, column-level ones don't. The existing `check-osmosis.sh` gate covers `models/` (staging + marts) but not `sources.yml`. [`INVESTIGATE-indicators-schema-coverage.md`](../backlog/INVESTIGATE-indicators-schema-coverage.md) addresses a similar gap in the `indicators__*` marts layer but doesn't cover raw sources. Logging this as a separate content-debt item to file an INVESTIGATE for; out of scope for *this* PLAN, which is about the rendering surface, not the content.

### What's deliberately not in this PLAN

- **Linking individual dbt-doc model pages from Docusaurus pages** — possible (dbt-docs uses URL fragments like `#!/model/model.atlas.marts_fact_kommune_indicators`), but cross-linking from Docusaurus content requires hand-curating links to specific models. Defer until there's content that needs it.
- **Per-endpoint lineage panel inside the `/data` catalog** (the PLAN-008 idea) — that work is paused because `atlas-frontend` isn't deployed. Will revisit if/when atlas-frontend ships.
- **CI automation of the snapshot** — defer to whenever CI gains DB access.
- **Search across dbt docs from Docusaurus's search bar** — would require parsing the embedded manifest at build time and feeding it to `@easyops-cn/docusaurus-search-local`. Out of scope; dbt-docs's built-in search inside `/lineage/` is good enough.

---

## Files to Modify / Create

**Create:**
- `website/scripts/snapshot-lineage.mjs`
- `website/static/lineage/index.html` (the snapshot itself, ~4 MB)

**Modify:**
- `website/package.json` — add `"lineage:snapshot"` script.
- `website/docusaurus.config.ts` — add the navbar `Lineage` link.

**Don't touch:**
- `atlas-data/dbt/` — the snapshot script reads from `target/` after invoking dbt, doesn't mutate the dbt project.
- `atlas-frontend/` — its `/data` catalog page is a different surface, not affected by this PLAN.
