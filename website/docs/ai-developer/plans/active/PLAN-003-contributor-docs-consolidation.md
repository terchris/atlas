# PLAN-003 — Contributor docs consolidation

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog

**Goal**: Make the public Docusaurus site at `website/docs/` the single source of truth for contributor onboarding (how to add a data source, what dbt-osmosis is, what `check-osmosis.sh` enforces, the data-journey worked example, plus dev-environment setup). Move canonical content out of in-repo READMEs into `website/docs/contributors/`, leaving short pointer stubs. Move `docs/ai-developer/` to `website/docs/ai-developer/` so agent-oriented planning lives alongside everything else (matching the devcontainer-toolbox convention). Create a repo-root `CLAUDE.md` so every new agent invocation lands in the same canonical context as the sister projects.

**Last Updated**: 2026-04-28

**Investigation**: [INVESTIGATE-contributor-docs-consolidation.md](INVESTIGATE-contributor-docs-consolidation.md)

**Prerequisites**: None. PLAN-001 + PLAN-002 are complete (mart_* views + dbt-osmosis CI gate are stable, so the docs we move accurately describe today's behaviour).

---

## Problem

Today's contributor-onboarding content is scattered across:

- [`atlas-data/CONTRIBUTING.md`](../../../../../atlas-data/CONTRIBUTING.md) — 11-step "add a data source" workflow
- [`atlas-data/ingest/src/sources/README.md`](../../../../../atlas-data/ingest/src/sources/README.md) — ingest-module template + 19 examples + planned-sources catalogue
- [`atlas-data/dbt/README.md`](../../../../../atlas-data/dbt/README.md) — dbt commands + the "schema.yml hygiene — dbt-osmosis + check-osmosis.sh" prose
- [`atlas-data/dbt/check-osmosis.sh`](../../../../../atlas-data/dbt/check-osmosis.sh) — top-of-file comment explains the strict + lenient checks
- [`docs/ai-developer/GIT.md`](../../GIT.md), [`WORKTREE.md`](../../WORKTREE.md) — git workflow conventions
- [`INVESTIGATE-data-journey-pattern.md`](../completed/INVESTIGATE-data-journey-pattern.md) — full SSB 08764 worked example

A new contributor has to know to look in three different `README.md` files inside the cloned repo. The public site (`website/docs/`) has no Contributors section at all. Sister Helpers projects (`urbalurba-infrastructure`, `devcontainer-toolbox`) consolidate everything — including agent planning docs — under `website/docs/`, and a repo-root `CLAUDE.md` points the agent at `website/docs/ai-developer/`. Atlas should match.

## Decisions resolved (2026-04-28)

All nine decision points from the INVESTIGATE settled before implementation.

- ~~**[Q1]**~~ Section path + sidebar label → **`contributors/`, "Contributors" label** (plural). Matches both sister projects exactly. **Resolved.**
- ~~**[Q2]**~~ Inventory of files to move → **decided in this PLAN, reviewed during pilot phase, adjusted before phases 3–4.** See "What moves and how" table below. **Resolved.**
- ~~**[Q3]**~~ Final page count → **9 pages** as proposed in the INVESTIGATE. May shrink during phases 3–4 if a page proves redundant. **Resolved.**
- ~~**[Q4]**~~ Pointer-stub style → **option (b): pointer at top + day-to-day commands kept inline** for in-source READMEs (developers want commands at hand while coding). **Option (a): one-line redirect** for the repo-root `docs/README.md`. **Resolved.**
- ~~**[Q5]**~~ Pilot vs all-at-once → **pilot one page first** (`dbt-osmosis.md` — smallest, freshest in mind), user reviews pattern, then phases 3–4 mechanically apply it. **Resolved.**
- ~~**[Q6]**~~ Public/private split for `docs/ai-developer/` → **move the entire subtree** (PLANS.md, WORKFLOW.md, GIT.md, WORKTREE.md, `plans/active/`, `plans/backlog/`, `plans/completed/`) to `website/docs/ai-developer/`. Matches devcontainer-toolbox. **Resolved.**
- ~~**[Q7]**~~ Docusaurus install timing → **prepare-only in this PLAN**. Pages land as Docusaurus-friendly markdown (frontmatter + `_category_.json` files where useful) but no `npm install` / `docusaurus.config.ts` / build pipeline yet. Real install + deploy is a separate effort, likely with its own INVESTIGATE referencing `urbalurba-infrastructure/website/`. **Resolved.**
- ~~**[Q8]**~~ Audience tone → **external** (assume the reader has not seen the codebase). Both sister sites do this. Internal-only nuance stays in `website/docs/ai-developer/`. **Resolved.**
- ~~**[Q9]**~~ Drift-prevention → **make doc updates a sub-step of code-change plans.** Add a rule to `naming-conventions.md` (similar in spirit to rule #5 from PLAN-002) and a paragraph in `PLANS.md` saying that PRs touching documented behaviour MUST update the corresponding `website/docs/contributors/*.md` page in the same PR. No tooling beyond review culture in v1; revisit if drift happens. **Resolved.**

---

## What moves and how

| Source location | Destination | Move type | Stub style |
|---|---|---|---|
| `atlas-data/CONTRIBUTING.md` (11-step workflow) | `website/docs/contributors/adding-a-source.md` | Full move | (b) Pointer + brief overview kept (so GitHub's auto-render at `<repo>/CONTRIBUTING.md` still gives newcomers something useful) |
| `atlas-data/ingest/src/sources/README.md` (template + how-to) | `website/docs/contributors/ingest-modules.md` | Split | Per-source examples + planned-sources catalogue stay in the in-source README; contributor-onboarding template moves out |
| `atlas-data/dbt/README.md` "schema.yml hygiene" section | `website/docs/contributors/dbt-osmosis.md` + `check-osmosis.md` | Split (one section into two pages) | (b) Pointer + day-to-day commands cheatsheet kept inline |
| `atlas-data/dbt/check-osmosis.sh` top-of-file comment | (folded into `check-osmosis.md`) | Move | Keep a 3-line comment in the script pointing at the page |
| `docs/ai-developer/GIT.md` | `website/docs/ai-developer/GIT.md` (in Phase 1) → also referenced from `website/docs/contributors/git-workflow.md` | Move + reference | New file in `contributors/` is a brief "if you came here to make a PR" landing that links to the canonical `ai-developer/GIT.md` |
| `INVESTIGATE-data-journey-pattern.md` | `website/docs/contributors/data-journey.md` (distilled) | Distill | INVESTIGATE stays in `completed/` as historical record |
| (new content) | `website/docs/contributors/setup.md` | Net-new | Clone, devcontainer/local install, env file, first `dbt run` |
| (new content) | `website/docs/contributors/testing.md` | Net-new | `npm typecheck`, `dbt parse`, `dbt test`, `check-osmosis.sh`, PR checklist |
| (new content) | `website/docs/contributors/index.md` | Net-new | Welcome / quick-start / task-driven options (mirrors devcontainer-toolbox shape) |
| `docs/ai-developer/` (whole subtree) | `website/docs/ai-developer/` | Bulk move | Repo-root `docs/README.md` becomes a 1-line pointer |
| (new) repo-root `CLAUDE.md` | (new) `/CLAUDE.md` | Net-new | Mirrors `devcontainer-toolbox/CLAUDE.md` shape |

---

## Phase 1: Foundation move + repo-root `CLAUDE.md`

Pure structural change. No new contributor pages yet — just relocate the agent docs and create the entry point so subsequent phases have a stable base.

### Tasks

- [ ] 1.1 `git mv docs/ai-developer/` → `website/docs/ai-developer/`. The whole subtree (PLANS.md, WORKFLOW.md, GIT.md, WORKTREE.md, `plans/active/`, `plans/backlog/`, `plans/completed/`, `plans/talk/`, `project-atlas.md`).
- [ ] 1.2 **Rewrite cross-references** in 16 external files that point INTO `docs/ai-developer/`. Strategy: use absolute-style `website/docs/ai-developer/...` (easier to grep/audit than depth-counting `../../../../`). Files (per the pre-execution scan):
  - `atlas-data/CONTRIBUTING.md`
  - `atlas-data/README.md`
  - `atlas-data/dbt/README.md` (×2 refs)
  - `atlas-data/dbt/models/marts/api/README.md`
  - `atlas-data/dbt/seeds/README.md`
  - `atlas-data/ingest/README.md` (×2)
  - `atlas-data/ingest/src/lib/brreg/README.md`
  - `atlas-data/ingest/src/lib/scraping/index.ts` (one TypeScript comment)
  - `atlas-data/ingest/src/sources/README.md`
  - `atlas-data/ingest/src/sources/redcross-branches/README.md`
  - `atlas-data/ingest/src/sources/ssb-08764/README.md`
  - `docs/stack/naming-conventions.md`
  - `docs/stack/suggested-stack.md` (×2)
  - `website/README.md`
  - `website/docs/index.md`
  
  **Verification**: `grep -rn "docs/ai-developer" atlas/ | grep -v website/docs/ai-developer | grep -v atlas-private-data-repo` returns 0 matches.
- [ ] 1.3 **Verify cross-tree references INSIDE `website/docs/ai-developer/`** still resolve. After the depth change, links from `website/docs/ai-developer/plans/backlog/X.md` to `docs/stack/Y.md` need rewriting (they were `../../../../docs/stack/Y.md`, now need `../../../../../docs/stack/Y.md` or absolute `docs/stack/Y.md` from repo root). Use the same absolute-style strategy as 1.2 — replace `../../../../docs/stack/` and similar patterns with paths anchored at `docs/stack/` from repo root, or rewrite to `https://github.com/...` permalinks if the link points to non-public infrastructure (e.g. `urbalurba-infrastructure/website/`). Sweep with `grep -rn "\.\./\.\./" website/docs/ai-developer/`.
- [ ] 1.4 **Create** `docs/README.md` (does not currently exist) — 5–10 lines mirroring `devcontainer-toolbox/docs/README.md`: "Documentation lives in `website/docs/` — see [website/README.md] for build instructions. Live site forthcoming at https://atlas.helpers.no." Other in-repo `docs/` subfolders (`research/`, `stack/`, `ideas/`) stay for this PLAN — moving them is a follow-up.
- [ ] 1.5 **Create repo-root `CLAUDE.md`**, mirroring `devcontainer-toolbox/CLAUDE.md`'s shape. Atlas-specific content sketch:

  ```markdown
  # Atlas — Norwegian civic-tech data platform
  
  Atlas builds an open semantic layer over Norwegian public data (SSB, FHI, Brreg) and NGO supply data, exposed via a public PostgREST API. Data side: `atlas-data/`. Frontend: `atlas-frontend/`.
  
  ## Reading order for AI agents
  
  Before implementing any non-trivial change, read in order:
  - `website/docs/ai-developer/PLANS.md` — plan structure, templates, conventions
  - `website/docs/ai-developer/WORKFLOW.md` — implementation workflow
  - `website/docs/ai-developer/GIT.md` — branch / commit / PR conventions
  - `website/docs/ai-developer/WORKTREE.md` — git worktree usage (multi-agent safety)
  
  ## Multi-agent repo warning
  
  Atlas is worked on concurrently by multiple agents + the human. **Always verify branch / cwd / state before any git op** — see GIT.md and WORKTREE.md.
  
  ## Implementing a plan
  
  1. Read the plan in `website/docs/ai-developer/plans/active/` or `plans/backlog/`.
  2. Follow phase order; pause for review where the plan says.
  3. Move PLAN file from `backlog/` → `active/` when starting, `active/` → `completed/` when done.
  
  ## Contributing
  
  Public contributor docs at `website/docs/contributors/` (added in PLAN-003 phases 2–4).
  ```
  
  Refine wording during implementation; this is the structural target.
- [ ] 1.6 Add a "Contributors" placeholder folder: `website/docs/contributors/_category_.json` (`{"label": "Contributors", "position": 7}`) and a one-line `index.md` ("Contributor docs — coming in PLAN-003 phases 2–4"). Subsequent phases fill it.
- [ ] 1.7 **Update `.claude/settings.json`** — replace the `docs/ai-developer/...` allow-list paths with `website/docs/ai-developer/...`; remove stale `atlas-public-docs/...` entries (the directory doesn't exist on this machine). Lines affected: 16, 29–30, 34–35.
- [ ] 1.8 **Update auto-memory** — the user's project-decisions-location memory references `docs/ai-developer/`. Edit `~/.claude/projects/-Users-terje-christensen-learn-helpers-atlas/memory/feedback_project-decisions-location.md` to point at `website/docs/ai-developer/`. (Memory updates are local to the user's machine — flag the change, do not commit anything in `~/.claude/`.)
- [ ] 1.9 Add a 5–10 line "Documentation IA" section to `website/README.md` (or create one if absent) explaining the layout: `website/docs/` is Docusaurus-bound; `contributors/`, `ai-developer/`, etc. live under it; in-repo `/docs/` is a thin pointer.

### Validation

- `find docs/ai-developer -type f 2>/dev/null` returns nothing (folder gone).
- `find website/docs/ai-developer -type f | wc -l` matches the pre-move count.
- `grep -rn "docs/ai-developer" atlas/ | grep -v website/docs/ai-developer | grep -v atlas-private-data-repo` returns 0 lines.
- `grep -rn "\.\./\.\./" website/docs/ai-developer/` returns no broken links — every `../` chain still resolves to an existing file.
- `docs/README.md` exists with the thin-pointer content.
- Repo-root `CLAUDE.md` exists and reads cleanly when the next agent invocation auto-loads it.
- `website/docs/contributors/_category_.json` + placeholder `index.md` exist.
- `.claude/settings.json` has no `docs/ai-developer/` paths and no `atlas-public-docs/` paths.

---

## Phase 2: Pilot — `dbt-osmosis.md` + `check-osmosis.md`

Build the pattern end-to-end on the smallest, freshest content. User reviews; phases 3–4 mechanically apply.

### Tasks

- [ ] 2.1 Create `website/docs/contributors/dbt-osmosis.md`. Move the "schema.yml hygiene — dbt-osmosis + check-osmosis.sh" prose from `atlas-data/dbt/README.md`. Expand for an external reader: explain *what* dbt-osmosis is (description-propagation across lineage), *why* Atlas uses it (the OpenAPI tie-in via PostgREST), and *what behaviour to expect* (description cascade, two-pass convergence quirk seen in PLAN-001).
- [ ] 2.2 Create `website/docs/contributors/check-osmosis.md`. Lift the top-of-file comment from `atlas-data/dbt/check-osmosis.sh`. Cover: what the strict gate enforces (every column described, repo-wide), what failure means, how to fix (add the description, re-run osmosis writer, verify exit 0). Show the typical CI failure output.
- [ ] 2.3 Replace the corresponding section in `atlas-data/dbt/README.md` with pointer + day-to-day commands cheatsheet (style b). Specifically: 4 lines of "what is this?" with a link, then the existing command list as a quick reference for someone already in the dbt directory.
- [ ] 2.4 Replace the long top-of-file comment in `atlas-data/dbt/check-osmosis.sh` with a 3-line pointer: "See website/docs/contributors/check-osmosis.md for the canonical guide."
- [ ] 2.5 Cross-link: `dbt-osmosis.md` and `check-osmosis.md` reference each other; both link out to the dbt README cheatsheet for "how do I run this locally."
- [ ] 2.6 Open PR with these two pages + the in-source pointer changes. Pause for user review of the pattern before Phase 3.

### Validation

User confirms: the pages read clearly to an external reader; the in-source pointer-stubs feel right (not too thin, not redundant); the cross-links work; nothing in `atlas-data/` was duplicated.

---

## Phase 3: Adding-a-source workflow + ingest modules

Apply the Phase 2 pattern to the two largest contributor docs.

### Tasks

- [ ] 3.1 `website/docs/contributors/adding-a-source.md` — port the 11-step workflow from `atlas-data/CONTRIBUTING.md`. Polish for external reader: assume no prior repo knowledge, link out to `setup.md` for env, `dbt-osmosis.md` for schema.yml step, `data-journey.md` for the worked example.
- [ ] 3.2 Replace `atlas-data/CONTRIBUTING.md` with a stub that GitHub still auto-renders nicely: 1-paragraph summary + link to the public guide. (GitHub renders this file at `<repo>/CONTRIBUTING.md` when someone clicks "Contributing" on the repo page, so it stays useful as an entry point.)
- [ ] 3.3 `website/docs/contributors/ingest-modules.md` — port the contributor-onboarding template from `atlas-data/ingest/src/sources/README.md`. Just the *how-to-write-a-module* parts, not the per-source catalogue.
- [ ] 3.4 In `atlas-data/ingest/src/sources/README.md`, leave the per-source examples (one per existing source) and the planned-sources catalogue. Replace the contributor-template section with a pointer to `ingest-modules.md`. The remaining content is reference, not onboarding.
- [ ] 3.5 Open PR.

### Validation

A reviewer who hasn't touched the codebase can read `adding-a-source.md` and `ingest-modules.md` end-to-end and understand what they'd do for a new SSB-style source. No content lives in two places.

---

## Phase 4: Worked example + remaining pages

Net-new pages plus the data-journey distillation.

### Tasks

- [ ] 4.1 `website/docs/contributors/data-journey.md` — distill `INVESTIGATE-data-journey-pattern.md` into a contributor-readable walkthrough. Keep the SSB 08764 example (it's the fully-described one). Move from "investigation note" tone to "tutorial" tone. Original INVESTIGATE stays in `completed/` as historical record.
- [ ] 4.2 `website/docs/contributors/setup.md` — net-new. Cover: clone, devcontainer (link to devcontainer-toolbox project for the "what is this" explanation), local-install fallback (uv + Postgres), `ingest/.env` setup, `dbt deps` + first `dbt run`, smoke test.
- [ ] 4.3 `website/docs/contributors/testing.md` — net-new. Cover: when to run what (`tsc`, `dbt parse`, `dbt test`, `check-osmosis.sh`), the description-only-PR shortcut (per the memory note from PLAN-002 phase 3), PR checklist, what CI runs.
- [ ] 4.4 `website/docs/contributors/git-workflow.md` — short bridge page. 1 paragraph "if you came here to open a PR" + link to the canonical `website/docs/ai-developer/GIT.md`. Mirrors how devcontainer-toolbox handles this.
- [ ] 4.5 `website/docs/contributors/index.md` — replace the Phase 1 placeholder with the real welcome page. Mirror devcontainer-toolbox's shape: 1-paragraph mission, quick-start (clone → setup → first PR), task-driven options ("Add a data source" → adding-a-source; "Set up dev env" → setup; "Understand schema.yml hygiene" → dbt-osmosis).
- [ ] 4.6 Open PR.

### Validation

A new contributor reading only the public Contributors section can: clone → set up env → run the project → understand dbt-osmosis → add a trivial new source. Internal links resolve. No in-repo README has to be opened directly except as deep reference.

---

## Phase 5: Drift-prevention rules

Add the consistency-enforcement rules so the docs stay in sync with the code.

### Tasks

- [ ] 5.1 Add a rule to `docs/stack/naming-conventions.md` (now at `website/docs/.../naming-conventions.md` if that move happened in scope; otherwise its current location): "PRs that change behaviour described in a `website/docs/contributors/*.md` page MUST update that page in the same PR. Reviewer responsibility to flag." Number the rule (likely #6, after the description rule from PLAN-002).
- [ ] 5.2 Add a paragraph to `website/docs/ai-developer/PLANS.md` "Implementation rules" or equivalent section saying the same thing — agents drafting a PLAN should include any docs updates as a sub-step of the relevant phase, not a separate follow-up. Cross-reference the naming-conventions rule.
- [ ] 5.3 Update the `feedback_dbt-test-skip-for-description-only.md` memory note (or add a new one) capturing this convention so the rule survives future agent context resets.
- [ ] 5.4 Decide whether tooling is warranted now or later. **Recommendation: later.** The Atlas codebase is small enough that reviewer culture catches drift; over-investing in a `check-docs.sh` before we have evidence of drift adds friction. Revisit after first 3 docs-updating PRs.

### Validation

`naming-conventions.md` and `PLANS.md` both carry the rule. The next PR that changes documented behaviour visibly updates both code and the relevant contributor doc in the same change.

---

## Phase 6: Verification + closeout

### Tasks

- [ ] 6.1 Walk every link in `website/docs/contributors/` and verify it resolves (relative links to `ai-developer/`, cross-links between contributor pages, links into `atlas-data/`).
- [ ] 6.2 Cold-read the contributors section as if you've never seen the repo. Note any "wait, where do I look for X?" moments. Fix or note as follow-up if minor.
- [ ] 6.3 Update `INVESTIGATE-contributor-docs-consolidation.md` status to Complete, mark with PR numbers.
- [ ] 6.4 Move this PLAN from `backlog/` → `completed/`. Add a final outcome note summarising what landed across the 5 (or 6) PRs.
- [ ] 6.5 Update memory: add a project memory note on where contributor docs live so future agent sessions don't re-investigate.

### Validation

User reads the Contributors section end-to-end and confirms: this is what a new contributor needs. No surprises, no dead links.

---

## Acceptance Criteria

- [ ] `website/docs/ai-developer/` exists with the full subtree from `docs/ai-developer/`. Old location is empty (or absent).
- [ ] Repo-root `CLAUDE.md` exists, points the agent at `website/docs/ai-developer/PLANS.md`, `WORKFLOW.md`, `plans/`, `GIT.md`, `WORKTREE.md`. Format mirrors `devcontainer-toolbox/CLAUDE.md`.
- [ ] `website/docs/contributors/` exists with the agreed-on pages + `_category_.json`. Sidebar entry "Contributors" (when Docusaurus is later installed).
- [ ] Each moved doc's old location is a stub (style b for in-source READMEs, style a for `docs/README.md`).
- [ ] No content lives in two places.
- [ ] A new contributor reading the public Contributors section, never having seen the repo, can: clone → set up env → understand what dbt-osmosis is → add a trivial new source end-to-end without reading any in-repo `README.md` directly.
- [ ] `naming-conventions.md` carries a rule requiring PR-time docs updates; `PLANS.md` echoes it.
- [ ] All internal cross-references resolve.

---

## Files to Modify

### Phase 1 (foundation)
- `docs/ai-developer/` → `website/docs/ai-developer/` (whole subtree, `git mv`)
- 16 external files referencing `docs/ai-developer/` (rewrite to `website/docs/ai-developer/...`) — see task 1.2 for the list
- Cross-tree links inside the moved tree (rewrite parent-relative `../../../...` paths to repo-root anchored paths) — task 1.3
- `docs/README.md` (new — thin pointer)
- `CLAUDE.md` (new, repo root — content sketched in task 1.5)
- `website/docs/contributors/_category_.json` (new) + `website/docs/contributors/index.md` (placeholder)
- `.claude/settings.json` (rewrite allow-list paths)
- `~/.claude/projects/.../memory/feedback_project-decisions-location.md` (local-only; flag, don't commit)
- `website/README.md` (add Documentation IA section — light touch)

### Phase 2 (pilot)
- `website/docs/contributors/dbt-osmosis.md` (new)
- `website/docs/contributors/check-osmosis.md` (new)
- `atlas-data/dbt/README.md` (replace section with pointer + cheatsheet)
- `atlas-data/dbt/check-osmosis.sh` (replace top-of-file comment with pointer)

### Phase 3 (adding-a-source + ingest)
- `website/docs/contributors/adding-a-source.md` (new)
- `website/docs/contributors/ingest-modules.md` (new)
- `atlas-data/CONTRIBUTING.md` (rewrite to GitHub-friendly stub)
- `atlas-data/ingest/src/sources/README.md` (split — keep reference, move template)

### Phase 4 (remaining pages)
- `website/docs/contributors/data-journey.md` (new)
- `website/docs/contributors/setup.md` (new)
- `website/docs/contributors/testing.md` (new)
- `website/docs/contributors/git-workflow.md` (new)
- `website/docs/contributors/index.md` (replace placeholder)

### Phase 5 (rules)
- `docs/stack/naming-conventions.md` (add rule #6)
- `website/docs/ai-developer/PLANS.md` (add docs-update paragraph)

### Phase 6 (closeout)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-contributor-docs-consolidation.md` (status → Complete)
- `website/docs/ai-developer/plans/backlog/PLAN-003-contributor-docs-consolidation.md` → `…/completed/`

## Files NOT modified

- Anything under `atlas-frontend/` — frontend stays out of scope (it has its own README and audience).
- `docs/research/`, `docs/stack/`, `docs/ideas/` — separate moves are likely follow-ups, not in this PLAN.
- Anything that would actually install or build Docusaurus — explicit out of scope per [Q7]. Pages are Docusaurus-friendly markdown; the install/deploy is a separate effort.
- Any planning files inside `plans/active/` or `plans/completed/` — they're history; only the location moves in Phase 1.

---

## What's next after this PLAN

- **Docusaurus install + deploy** — separate INVESTIGATE + PLAN to actually `npm install` Docusaurus, copy `docusaurus.config.ts` from `urbalurba-infrastructure/website/`, set up CI deploy to `atlas.helpers.no`. Once live, the pointer stubs link to real URLs instead of GitHub-rendered markdown.
- **`docs/research/` + `docs/stack/` migration** — these have a developer/reader audience (not contributors), so they belong in `website/docs/sources/` / `website/docs/concepts/` / `website/docs/architecture/`. Likely needs its own structure decision.
- **Developer (consumer) docs** — once PostgREST is up (PLAN-D.2), the API reference at `api.atlas.helpers.no/docs` becomes the centerpiece for *developers* (people consuming Atlas data, not building it). PLAN-F territory.
