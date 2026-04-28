# Investigate: Contributor docs consolidation — single source of truth on the public site

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Complete — 2026-04-28 (implemented in PLAN-003, PR #27)

**Goal**: Make the docs that a new contributor needs (how to add a data source, what dbt-osmosis does and why, what `check-osmosis.sh` enforces, plus closely-related onboarding) reachable from the public Docusaurus site at one canonical URL each — and **move** the existing in-repo content into that canonical location, leaving short pointer stubs at the old paths so there is exactly one source of truth.

**Last Updated**: 2026-04-28

**Origin**: After PLAN-001 + PLAN-002 landed (9 mart_* views + dbt-osmosis CI gate + 180 column descriptions filled), the strongest contributor docs are scattered across the atlas repo: [`atlas-data/CONTRIBUTING.md`](../../../../../atlas-data/CONTRIBUTING.md), [`atlas-data/ingest/src/sources/README.md`](../../../../../atlas-data/ingest/src/sources/README.md), [`atlas-data/dbt/README.md`](../../../../../atlas-data/dbt/README.md), the top-of-file comment in [`atlas-data/dbt/check-osmosis.sh`](../../../../../atlas-data/dbt/check-osmosis.sh), and [INVESTIGATE-data-journey-pattern.md](../completed/INVESTIGATE-data-journey-pattern.md). The Docusaurus site at `website/docs/` has no Contributing section — only About, Sector, Getting Started (1 page), Concepts, Measurements, Sources (mostly placeholders).

A new contributor today has to know to look in three different `README.md` files inside the cloned repo. A new *developer* (someone who wants to consume Atlas data, not modify it) has nowhere obvious to land. Conflating these two audiences in scattered in-repo docs is the symptom; the fix is to separate them and make Contributing first-class on the public site.

---

## Vocabulary used in this investigation

To remove ambiguity (these words are easy to confuse):

- **Contributor** — someone who develops the Atlas system itself: writes ingest modules, edits dbt models, fixes bugs, opens PRs against this repo. Internal or external — doesn't matter; the distinguishing feature is that they **change Atlas code or data shape**.
- **Developer** — someone who *consumes* what Atlas provides: queries the public API, builds an application on top of `marts.*`, points an LLM at the dbt MCP server. They do **not** modify Atlas code; they read Atlas data.

This investigation is about contributor docs. Developer docs (API reference, OpenAPI spec at `api.atlas.helpers.no/docs`, etc.) are scoped by [INVESTIGATE-public-api-surface.md](INVESTIGATE-public-api-surface.md) and downstream PLAN-F.

---

## What exists today (inventory)

### Public site (`website/docs/`)
- **About** — `what-is-atlas.md`, `personas.md`. Audience: everyone.
- **Sector** — `ngo-landscape.md`, `sector-research.md`. Audience: developers / readers.
- **Getting Started** — `reading-a-row.md` (one worked example). Audience: developers.
- **Concepts** — placeholder.
- **Measurements** — placeholder.
- **Sources** — placeholder ("one page per upstream source").
- **No Contributing section.**

The site is currently plain markdown — Docusaurus install/config is **not yet done** (no `docusaurus.config.ts`, no `sidebars.ts`). Sister projects (`urbalurba-infrastructure/website/`) have full Docusaurus setups. This is **[Q7]** below.

### In-repo contributor docs (canonical content lives here today)

| File | Audience | Content |
|---|---|---|
| [`atlas-data/CONTRIBUTING.md`](../../../../../atlas-data/CONTRIBUTING.md) | Contributor | 11-step "add a data source" workflow with completion criteria |
| [`atlas-data/ingest/src/sources/README.md`](../../../../../atlas-data/ingest/src/sources/README.md) | Contributor | Ingest-module template + 19 examples + planned-sources catalogue |
| [`atlas-data/dbt/README.md`](../../../../../atlas-data/dbt/README.md) | Contributor | dbt project layout, commands, schema.yml hygiene section |
| [`atlas-data/dbt/check-osmosis.sh`](../../../../../atlas-data/dbt/check-osmosis.sh) (top-of-file comment) | Contributor | What the strict + lenient checks do, when to run |
| [INVESTIGATE-data-journey-pattern.md](../completed/INVESTIGATE-data-journey-pattern.md) | Contributor (pedagogical) | Full end-to-end SSB 08764 example: raw → indicators → marts |
| [`docs/ai-developer/GIT.md`](../../GIT.md) | Contributor | Branch / commit / PR conventions |
| [`docs/ai-developer/WORKTREE.md`](../../WORKTREE.md) | Contributor | git worktree usage |

### Other in-repo docs

- `docs/ai-developer/` (agent-oriented planning incl. this very file) — **moves to `website/docs/ai-developer/`** per the devcontainer-toolbox precedent. Once moved, this INVESTIGATE's own path becomes `website/docs/ai-developer/plans/backlog/INVESTIGATE-contributor-docs-consolidation.md`.
- `docs/research/` — sector research. Mostly developer/reader-facing; out of scope for this PLAN but a likely follow-up move under `website/docs/research/`.
- `docs/stack/` — stack architecture (suggested-stack, naming-conventions, ERD). Mixed audience; partly contributor-relevant. Decide per-file in Q2.
- `docs/ideas/` — exploratory chat-fragments. Stays where it is (or moves with research). Out of scope.

---

## Sister-project conventions (Helpers stack)

Two sibling projects already run public Docusaurus sites with contributor docs. Atlas should match where the convention is clear; the sister patterns resolve several of the open questions below.

| Topic | [`urbalurba-infrastructure/website/`](../../../../../../urbalurba-infrastructure/website/) | [`devcontainer-toolbox/website/`](../../../../../devcontainer-toolbox/website/) | Atlas should adopt |
|---|---|---|---|
| Sidebar section name | **"Contributors"** (plural), explicit sidebar item near the bottom | "Contributors", auto-generated from filesystem structure | **"Contributors"** (plural) — matches both |
| In-repo `/docs/` folder | Metadata-only — `README.md` + `CLAUDE.md`, points to website | `docs/README.md` (45 lines) — points to website, no canonical content | **Metadata-only**, point to website |
| Where does `ai-developer/` (agent-oriented planning) live? | Under `website/docs/` | **Under `website/docs/ai-developer/`** (with PLANS.md, WORKFLOW.md, `plans/`, `_category_.json`) | **Move `docs/ai-developer/` → `website/docs/ai-developer/`** — matches devcontainer-toolbox pattern. Even agent-oriented planning is served by Docusaurus alongside contributor + user docs. |
| Repo-root `CLAUDE.md` pointing the agent at `ai-developer/` | Yes — `CLAUDE.md` references `website/docs/ai-developer/PLANS.md`, `WORKFLOW.md`, `plans/` | Yes — same | **Create `CLAUDE.md` at Atlas's repo root** following the same pattern. Atlas currently has no CLAUDE.md; agents work from in-conversation context. With docs moved to `website/docs/ai-developer/`, a CLAUDE.md gives every new agent invocation the same canonical pointers the sister projects use. |
| Single-source-of-truth pattern | **Move-and-reference**: canonical lives on public site; in-repo `/docs/` is pointer + AI context only | **Move-and-reference**: same | **Move-and-reference** — confirms Q4 |
| Sidebar config | Explicit `sidebars.ts`, hand-curated structure with subcategories | Auto-generated: `{ type: 'autogenerated', dirName: '.' }` | **Explicit** for Atlas — Atlas's IA is curated (About / Sector / Concepts / Sources / Contributors) |
| Contributor onboarding entry page | `/docs/contributors/index.md` (73 lines) — task-driven options ("Add a service") | `/docs/contributors/index.md` (170 lines) — quick-start inlined, task-driven options ("Add a tool") | Index page mirroring this shape (`adding-a-source` is Atlas's "Add a service" equivalent) |

### Docusaurus config conventions to copy

All three Helpers projects share the same plugin stack and config shape:

1. **Env-injected GitHub URL** — `GITHUB_ORG` / `GITHUB_REPO` from env (with defaults), used in `editUrl` and navbar GitHub link. Enables fork compatibility without config edits.
2. **Plugins** — `docusaurus-plugin-image-zoom`, `@easyops-cn/docusaurus-search-local` (with `hashed: true`, `highlightSearchTermsOnTargetPage: true`), `@docusaurus/theme-mermaid`. (No Algolia.)
3. **Markdown** — `markdown.mermaid: true`, Prism with bash/yaml/json/typescript/python.
4. **`editUrl`** — points to `main/website/` so reader-suggested edits land in the right path.

When Atlas stands up Docusaurus, copy these from `urbalurba-infrastructure/website/docusaurus.config.ts` rather than reinventing.

### Two onboarding-page styles to choose between

- **urbalurba** — separates: Guides (3 pages) / Rules & Standards (8 pages) / Architecture (4 pages). Index page is short and routes you to the right family.
- **devcontainer-toolbox** — flatter: index inlines the quick-start + commit conventions + testing notes; task pages link out for depth.

For Atlas's volume (~9 contributor pages), **devcontainer-toolbox's flatter shape fits better** — Atlas doesn't yet have enough Rules-and-Standards material to justify a separate subcategory.

---

## The proposal

### Move not copy

For each contributor doc:
1. The **content** moves to `website/docs/contributing/<page>.md`.
2. The **old location** keeps a short pointer stub: 1–3 lines, "this guide has moved to https://atlas.helpers.no/docs/contributing/<page>", plus any *operational* content that doesn't fit a public guide (e.g. `atlas-data/dbt/README.md` keeps its raw command cheatsheet; the "what is dbt-osmosis and why" prose moves).
3. **One source of truth.** Updates land on the public site; the in-repo stubs are stable pointers.

### Proposed Contributors section structure

```
website/docs/contributors/
├── _category_.json         (label: "Contributors", position: 7)
├── index.md                (welcome / quick-start / task-driven options — devcontainer-toolbox shape)
├── setup.md                (clone, devcontainer / local install, env file, first dbt run)
├── adding-a-source.md      (CONTRIBUTING.md's 11-step workflow, polished for public)
├── ingest-modules.md       (template + how the source layer is shaped — from ingest/README.md)
├── dbt-osmosis.md          (what it is, why we use it, propagation, OpenAPI tie-in)
├── check-osmosis.md        (the gate, when it runs, what failures mean, how to fix)
├── data-journey.md         (the SSB 08764 worked example, distilled)
├── git-workflow.md         (from GIT.md — branch / PR / merge / cleanup)
└── testing.md              (npm typecheck, dbt parse, dbt test, check-osmosis.sh)
```

Naming + flat structure follow `devcontainer-toolbox/website/docs/contributors/`. The exact page count is **[Q3]**.

### Pointer-stub example

```markdown
# atlas-data/dbt/ — schema.yml hygiene

> **The contributor guide for dbt-osmosis and `check-osmosis.sh` lives on the public docs site:**
> - https://atlas.helpers.no/docs/contributing/dbt-osmosis
> - https://atlas.helpers.no/docs/contributing/check-osmosis
>
> The day-to-day commands stay below for quick reference.

## Day-to-day commands
[command cheatsheet stays here]
```

The exact wording / link style is **[Q4]**.

---

## Decisions to resolve before implementation

- **[Q1] Section path + sidebar label.** `contributors/` directory → "Contributors" sidebar label, **resolved by sister-project convention** — both `urbalurba-infrastructure` and `devcontainer-toolbox` use this exact name.

- **[Q2] Inventory of files to move.** The seven canonical sources listed above are the obvious set. Open questions:
  - Does the full `atlas-data/CONTRIBUTING.md` move, or only the "add a data source" parts? (CONTRIBUTING.md may carry repo-policy items like contributor agreement that GitHub renders specially at `<repo>/CONTRIBUTING.md`. **Likely keep a thin top-level CONTRIBUTING.md** with the legal/process bits + link to the public guide for the workflow.)
  - Does `atlas-data/ingest/src/sources/README.md` move, or stay as a "developer reference for the source layer" alongside the canonical contributor doc? (It's a hybrid: per-source examples are reference, the template is contributor-onboarding.)
  - Does any of `docs/stack/` move? (`naming-conventions.md` is contributor-relevant; `suggested-stack.md` is mixed; `erd.md` is auto-generated.)

- **[Q3] Page set.** The proposed 9 pages above is one defensible cut. Smaller cut: skip `setup.md` (link to existing in-repo READMEs), `git-workflow.md` (link to GIT.md), and `testing.md` (mention in each page). Larger cut: add `architecture.md` summarising suggested-stack for contributors, `troubleshooting.md` for common failures.

- **[Q4] Pointer-stub wording.** Sister-project pattern is consistent: in-repo `/docs/` becomes metadata-only with a short pointer to the website. Two flavours to pick between for in-source READMEs (e.g. `atlas-data/dbt/README.md`):
  - **(a) Minimal** — one-line redirect, no inline content: "This guide has moved to <URL>."
  - **(b) Pointer + operational tail** — link at top, day-to-day commands kept inline (recommended for `atlas-data/dbt/README.md` because it's used while-coding).
  - **Recommendation: (b) for source-tree READMEs** (developers want commands at hand while coding), **(a) for `docs/README.md`** (metadata-only, mirroring sister projects).

- **[Q5] Pilot first or move everything in one PR.** PLAN-001/002 set a precedent for "small phased PRs that each reduce a counter." Pilot one doc (suggest: `dbt-osmosis.md`, smallest scope, recently fresh in-context) to validate the pattern; then move the rest. Alternative: do it all in one PR for atomicity since each move is small.

- **[Q6] Public/private split for `docs/ai-developer/`.** **Resolved by sister-project precedent**: devcontainer-toolbox moves the entire `ai-developer/` tree (PLANS.md, WORKFLOW.md, plans/, `_category_.json`) into `website/docs/ai-developer/`. Atlas should match: move the whole `docs/ai-developer/` to `website/docs/ai-developer/` — it gets served by Docusaurus alongside contributor + user docs. The agent-oriented framing stays (PLANS.md / WORKFLOW.md still narrate the planning method) but the content is reachable from the public site for transparency. GIT.md and WORKTREE.md ride along.

- **[Q7] Docusaurus install timing.** Today `website/docs/` is plain markdown — no Docusaurus install. Two paths:
  - **(a) Stand up Docusaurus first**, then this work writes pages into a real site. Brings sidebar config, build, deploy at the same time.
  - **(b) Land the contributor pages as plain markdown now**, Docusaurus install is a separate later effort. Pages are still readable on GitHub; the URL story (`atlas.helpers.no/docs/contributors/...`) just isn't live yet.
  - **Revised recommendation: (a) — stand up Docusaurus as part of this PLAN.** The sister-project survey shows the install is a small, well-trodden effort: copy `docusaurus.config.ts` + `sidebars.ts` from `urbalurba-infrastructure/website/`, swap `GITHUB_REPO` env default, install the same three plugins (image-zoom, search-local, theme-mermaid). Doing it now means pointer stubs link to live URLs instead of GitHub paths that have to migrate later. A follow-up INVESTIGATE for deploy (CI / Cloudflare / DNS for `atlas.helpers.no`) is still needed but doesn't block this PLAN.

- **[Q8] Audience tone.** Internal contributors (already cloned repo, comfortable with dbt) vs external (haven't seen the code yet). Both sister projects write for the external case. **Recommendation confirmed: write for external** — internal-only nuance stays in the existing planning files.

- **[Q9] Maintenance commitment.** Once docs are public-site canonical, drift between code and docs becomes more visible. Define: who updates `dbt-osmosis.md` when osmosis behaviour changes? Today the answer is "whoever changes the script." Consider making it a sub-step of the plan that introduces the change, not a follow-up.

---

## Acceptance criteria (preview — finalised in the PLAN)

- [ ] Docusaurus installed at `website/` (config copied from `urbalurba-infrastructure/website/`, with the three Helpers-stack plugins: image-zoom, search-local, theme-mermaid).
- [ ] `website/docs/contributors/` exists with the agreed-on page set + sidebar entry "Contributors".
- [ ] Each moved doc's old location is a 1–3 line pointer to the new docs URL.
- [ ] In-repo `/docs/` becomes metadata-only — single `README.md` pointing to the website (matches devcontainer-toolbox's repo-root `docs/`).
- [ ] `docs/ai-developer/` moved to `website/docs/ai-developer/` (whole subtree — PLANS.md, WORKFLOW.md, GIT.md, WORKTREE.md, `plans/active/`, `plans/backlog/`, `plans/completed/`).
- [ ] Repo-root `CLAUDE.md` exists, points agents at `website/docs/ai-developer/PLANS.md`, `WORKFLOW.md`, `plans/`, and the contributor docs. Format mirrors `devcontainer-toolbox/CLAUDE.md`.
- [ ] No content lives in two places.
- [ ] A new contributor reading the public Contributors section, never having seen the repo, can: clone → set up env → understand what dbt-osmosis is → add a trivial new source end-to-end without reading any in-repo `README.md` directly.
- [ ] Internal links inside the moved docs are rewritten to use the new URLs / paths consistently.

---

## What this investigation does NOT do

- Stand up Docusaurus build/deploy (separate effort — see Q7).
- Write developer-facing API docs (PLAN-F territory).
- Move sector research, persona, or measurement docs (different audience).
- Move `docs/research/` to the website (separate effort — its audience is developers / readers, not contributors).
- Add new contributor content beyond consolidating what already exists. New material (e.g. a troubleshooting guide we don't have yet) is an explicit follow-up if the gap shows up after the move.

---

## Cross-references

- [PLAN-001-api-mart-views.md](../completed/PLAN-001-api-mart-views.md) — introduced dbt-osmosis + `check-osmosis.sh`, now needing to be explained for contributors.
- [PLAN-002-fill-schema-yml-description-gaps.md](../completed/PLAN-002-fill-schema-yml-description-gaps.md) — closed the 180-column backlog and tightened the gate; the *why* needs a contributor-facing home.
- [INVESTIGATE-data-journey-pattern.md](../completed/INVESTIGATE-data-journey-pattern.md) — the SSB 08764 worked example; candidate for `data-journey.md`.
- [INVESTIGATE-public-api-surface.md](INVESTIGATE-public-api-surface.md) — the developer-facing API plan; deliberately separate audience.
