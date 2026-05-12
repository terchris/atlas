# PLAN: Rename public catalog vocabulary — sources → datasets / topics / publishers

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Completed**: 2026-05-12

**Branch (stacks)**: `feature/sources-catalog-foundation` (same branch as PR #104; the rename lands before that PR merges so no one ever sees `/sources/<id>` URLs publicly).

**Goal**: Rebrand the public-facing catalog vocabulary from data-engineering jargon ("source") to civilian terms ("dataset / topic / publisher"). Internal `atlas-data/` terminology stays unchanged — `source_id`, the `sources/` folder, ingest scripts, dbt models, the `raw.<source>` schema all keep "source". Only the *user-visible UI* (URLs, navbar labels, page copy, citation strings, Schema.org JSON-LD) and the *catalog generator's output* shift.

**Last Updated**: 2026-05-12

**Prerequisites**:
- ✅ PLAN-002 — sources catalog foundation (currently in this branch as PR #104).

**Blocks**: PLAN-003 (merchandising) — that PLAN should be drafted against the new vocabulary, not the old.

---

## What changes

### Public terminology

| Was (jargon) | Becomes (public) | Where |
|---|---|---|
| Source | Dataset | All UI copy, page titles, breadcrumbs |
| Source category | Topic | UI; companion YAML file `topics.yaml` |
| (no umbrella label) | Datasets | Navbar umbrella, breadcrumbs |

### URLs

| Was | Becomes |
|---|---|
| `/sources` | `/datasets` (umbrella; faceted browse-all moves here too) |
| `/sources/browse` | `/datasets` (the umbrella *is* the browse view) |
| `/sources/<id>` | `/datasets/<id>` |
| `/sources/category/<id>` | `/topics/<id>` |
| `/sources/by/<id>` | `/publishers/<id>` |
| (no index) | `/topics` (all-topics index) |
| (no index) | `/publishers` (all-publishers index) |

### Navbar

```
Datasets  ·  Topics  ·  Publishers  ·  Docs  ·  Lineage  ·  GitHub →
```

(Previous: `Sources · Docs · Lineage · GitHub`.)

### Companion files

- `atlas-data/ingest/src/sources/source-categories.yaml` → **rename** to `atlas-data/ingest/src/sources/topics.yaml`. The schema key stays `tags.topic` (matches); the file's renaming improves consistency.
- `atlas-data/ingest/src/sources/publishers.yaml` → **unchanged**.
- `atlas-data/ingest/src/sources/manifest.schema.json`, `validate-manifests.ts`, `check-manifests.sh` → **unchanged** (still validating `tags.topic` against the topics file, the validator code just loads a different filename).

### Folder rename

- `website/docs/sources/` → `website/docs/datasets/` for per-dataset MDX.
- Per-topic MDX moves to `website/docs/topics/<id>.mdx`.
- Per-publisher MDX moves to `website/docs/publishers/<id>.mdx`.
- The generator's clean-up logic scrubs each output dir on regenerate.

### What does NOT change

- `atlas-data/ingest/src/sources/` folder name — referenced by ingest scripts, dbt's lineage extractor, the `bootstrap-manifest` workflow. Internal-only; not user-facing. Stays.
- Every manifest's `source_id` field — schema key, foreign-key in dbt + Postgres, deeply coupled. Stays.
- The `raw.<source_id>` Postgres schema. Stays.
- React component class names (`SourceCard`, `SourceHero`, `SourceProvenance`, etc.). Internal code; a future small refactor can rename them but it's not blocking and adds churn to this PR. They consume the same data; the only thing that changes is what URL prefix they emit.
- The Schema.org `@type` — already `Dataset` (it was always correct).

---

## Phase 1: Generator + URL contract

### Tasks

- [ ] 1.1 In `website/scripts/generate-sources-registry.mjs`:
  - Replace every URL string `/sources/<id>` → `/datasets/<id>`.
  - Output paths: emit per-dataset MDX to `website/docs/datasets/<id>.mdx`, per-topic to `website/docs/topics/<id>.mdx`, per-publisher to `website/docs/publishers/<id>.mdx`.
  - Slugs in front-matter: `slug: /datasets/<id>` / `slug: /topics/<id>` / `slug: /publishers/<id>`.
  - Citation text: replace "Available in Atlas at https://atlas.sovereignsky.no/sources/<id>" with `/datasets/<id>`.
  - BibTeX `note:` field — same change.
  - Loaded companion file path: read `topics.yaml` (renamed) instead of `source-categories.yaml`.
  - Cleanup logic: now operates on three output dirs (`docs/datasets/`, `docs/topics/`, `docs/publishers/`). Drop the old `docs/sources/` cleanup logic; that dir will be removed in Phase 4.

- [ ] 1.2 In every React component under `website/src/components/sources/`:
  - Replace `to={`/sources/${id}`}` with `to={`/datasets/${id}`}` everywhere (SourceCard, RelatedSources, hero/citation links).
  - Replace `/sources/category/${id}` with `/topics/${id}`.
  - Replace `/sources/by/${id}` with `/publishers/${id}`.
  - GitHub issue templated body URL inside `SourceHero` — keep the description text but update the link.
  - `SchemaOrgDataset.tsx` `url` and `sameAs`: `/datasets/<id>`.
  - `SourceCitation.tsx` permalink display: `/datasets/<id>`.

- [ ] 1.3 In `website/src/pages/index.tsx` (the homepage):
  - "Browse sources" button label → **Browse datasets**, link → `/datasets`.
  - The "See all 41 sources →" line in the CTA section → "See all 41 datasets →", link → `/datasets`.
  - Both h2s ("Browse by topic", "Browse by publisher") stay verbatim — they already match.

### Validation

```bash
cd website && npm run sources:generate
# Expect: registry.json regenerated; per-dataset / per-topic / per-publisher
# MDX in the new dirs. Old docs/sources/ left for Phase 4 to delete.
grep -r '/sources/' src/components/ src/pages/ scripts/ | wc -l   # 0
```

User confirms phase is complete.

---

## Phase 2: Companion file + sidebar + navbar

### Tasks

- [ ] 2.1 Rename `atlas-data/ingest/src/sources/source-categories.yaml` to `atlas-data/ingest/src/sources/topics.yaml` (`git mv`).

- [ ] 2.2 Update `atlas-data/ingest/src/sources/validate-manifests.ts` — the constant pointing at `source-categories.yaml` becomes `topics.yaml`.

- [ ] 2.3 Update `website/scripts/generate-sources-registry.mjs` — same constant rename.

- [ ] 2.4 Update CI workflow path triggers in `.github/workflows/check-manifests.yml` — replace `source-categories.yaml` with `topics.yaml`.

- [ ] 2.5 Rewrite `website/sidebars.ts` Sources entry:
  - Top-level category label: **Datasets** (not "Sources").
  - Items: explicit links to `datasets/index`, `topics/<id>` × 7, `publishers/<id>` × 4 — using the new sub-folder paths.
  - Drop the "By category" / "By publisher" submenus if the explicit listing reads cleaner; or keep the submenus, contributor's call.

- [ ] 2.6 Update `website/docusaurus.config.ts` navbar — replace single "Sources" item with three items: Datasets (`/datasets`), Topics (`/topics`), Publishers (`/publishers`). Order them in this sequence; keep `activeBasePath` per item so each highlights across its subtree.

### Validation

```bash
cd website && npm run build
# Expect: build clean.
```

User visits localhost:3000 and confirms:
- Navbar shows Datasets · Topics · Publishers · Docs · Lineage.
- Each navbar item navigates to the correct umbrella page.

---

## Phase 3: Folder rename + cleanup

### Tasks

- [ ] 3.1 `git rm -r website/docs/sources/` — delete the old per-source MDX directory now that Phase 1's regeneration has emitted into the new dirs.

- [ ] 3.2 Create top-level index pages:
  - `website/docs/datasets/index.mdx` — slug `/datasets`. Renders SourcesBrowse (renamed mentally — same component) as the canonical browse-all view. Drops the separate `/sources/browse` route — the umbrella IS the browse view.
  - `website/docs/topics/index.mdx` — slug `/topics`. Renders SourceCategoryGrid + intro.
  - `website/docs/publishers/index.mdx` — slug `/publishers`. Renders PublisherStrip + intro.

- [ ] 3.3 Remove the obsolete `docs/sources/browse.mdx` if Phase 1 hasn't already.

- [ ] 3.4 Update `website/src/pages/index.tsx` homepage CTA: "See all 41 sources →" → "See all 41 datasets →", link `/datasets`.

### Validation

```bash
ls website/docs/sources 2>&1     # No such file or directory
ls website/docs/datasets/ | wc -l    # 41 + 1 (index) = 42
ls website/docs/topics/ | wc -l       # 7 + 1 = 8
ls website/docs/publishers/ | wc -l   # 4 + 1 = 5
cd website && npm run build
```

User confirms phase is complete.

---

## Phase 4: Contributor docs sync

Update every contributor-docs page that mentions the old terminology, URL prefix, or paths.

### Tasks

- [ ] 4.1 `website/docs/contributors/adding-a-source.md` — Step 4b: update the `npm run sources:generate` flow to mention the new output dirs. Update PR checklist.

- [ ] 4.2 `website/docs/contributors/sources-catalog.md` — rename to **`datasets-catalog.md`**. Update internal terminology to dataset / topic / publisher. Update path references throughout.

- [ ] 4.3 `website/docs/contributors/check-manifests.md` — small updates; the gate name stays.

- [ ] 4.4 Update `website/docs/contributors/index.md` if it lists the contributor docs and references the renamed file.

- [ ] 4.5 Update `atlas-data/ingest/src/sources/README.md` companion-files table — `source-categories.yaml` → `topics.yaml`.

- [ ] 4.6 PLAN docs: update the closed PLAN-002 outcome notes to mention the post-merge rename (one-line addendum). INVESTIGATE-sources-catalog-at-scale.md is history; leave its decisions intact, add a one-line note that public terminology evolved.

### Validation

```bash
grep -rn '/sources/' website/docs/contributors/ website/src/ website/scripts/ | grep -v 'atlas-data/ingest/src/sources' | wc -l   # 0
cd website && npm run build
```

User confirms phase is complete.

---

## Acceptance Criteria

- [ ] No public URL under `/sources/*` (404 OK or removed entirely; permalink consumers don't exist yet).
- [ ] `/datasets/<id>` renders the per-dataset page for all 41 datasets.
- [ ] `/topics/<id>` renders the per-topic page for all 7 topics.
- [ ] `/publishers/<id>` renders the per-publisher page for all 4 publishers.
- [ ] Navbar shows: Datasets · Topics · Publishers · Docs · Lineage · GitHub.
- [ ] Homepage CTAs link to `/datasets`, not `/sources`.
- [ ] Schema.org `Dataset` JSON-LD `url` is the new `/datasets/<id>`.
- [ ] Recommended citation text + BibTeX use `/datasets/<id>`.
- [ ] `atlas-data/ingest/src/sources/topics.yaml` exists; `source-categories.yaml` doesn't.
- [ ] `check-manifests` + `check-catalog` CI gates still pass on the renamed companion file.
- [ ] Contributor docs reflect the new terminology (one renamed file: `datasets-catalog.md`).
- [ ] Local build clean (`npm run build`).

---

## Implementation Notes

- **Why this lands before PR #104 merges** — `/sources/<id>` URLs aren't public yet (PR #104 unmerged). Once merged, the URLs become a contract that's expensive to break. Renaming pre-merge means no SEO redirects, no citation rot, no third-party breakage.

- **Why component class names stay** — `SourceCard`, `SourceHero` etc. are private code. Renaming them adds churn that doesn't change UX. A follow-up refactor can rename for consistency; it's not blocking.

- **Why `atlas-data/ingest/src/sources/` folder stays** — referenced by ingest scripts, dbt's `extract_lineage.py`, the contributor workflow, multiple READMEs. The folder name is data-engineering nomenclature ("ingestion sources"); civilians never see it. Leaving it alone saves a noisy cross-repo rename and keeps the technical/public terminology split clean.

- **`tags.topic` field name stays** — matches the new `topics.yaml` file id field, so consistency is already correct in the manifest schema.

- **Citation date semantics** — the citation generator embeds `Retrieved from <url>` and the BibTeX `note` with a permalink. None of these dates need rewriting; the URL prefix is what changes.

---

## Files to Modify

### Renamed

- `atlas-data/ingest/src/sources/source-categories.yaml` → `atlas-data/ingest/src/sources/topics.yaml`
- `website/docs/contributors/sources-catalog.md` → `website/docs/contributors/datasets-catalog.md`
- `website/docs/sources/` → `website/docs/datasets/` + new sibling `website/docs/topics/` + new sibling `website/docs/publishers/`

### Modified

- `website/scripts/generate-sources-registry.mjs`
- `website/src/pages/index.tsx`
- `website/src/components/sources/*.tsx` (URL prefix sweep)
- `website/sidebars.ts`
- `website/docusaurus.config.ts` (navbar)
- `atlas-data/ingest/src/sources/validate-manifests.ts` (companion-file path)
- `.github/workflows/check-manifests.yml` (trigger paths)
- `atlas-data/ingest/src/sources/README.md`
- `website/docs/contributors/adding-a-source.md`
- `website/docs/contributors/check-manifests.md`
- `website/docs/ai-developer/plans/completed/PLAN-002-sources-catalog-foundation.md` (one-line note)
