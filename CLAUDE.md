# Claude Code Instructions

Project-specific instructions for Claude Code when working on Atlas.

## What is Atlas

Atlas builds an open semantic layer over Norwegian public data (SSB, FHI, Brreg) and NGO supply data, exposed via a public PostgREST API.

- **Data side**: [`atlas-data/`](atlas-data/) — TypeScript ingest modules write `raw.*`; dbt transforms to `marts.*`.
- **Frontend**: [`atlas-frontend/`](atlas-frontend/) — Next.js app reading `marts.*` (today directly; via PostgREST after PLAN-E migration).
- **Public docs**: [`website/docs/`](website/docs/) — Docusaurus-bound markdown (build/deploy pending).

## Multi-agent repo — read first

Atlas is worked on concurrently by multiple agents + the human. **Always verify branch / cwd / state before any git op.** See [`website/docs/ai-developer/WORKTREE.md`](website/docs/ai-developer/WORKTREE.md) and [`website/docs/ai-developer/GIT.md`](website/docs/ai-developer/GIT.md).

## Plan Workflow

**BEFORE implementing any plan, read these files for context:**

- [`website/docs/ai-developer/PLANS.md`](website/docs/ai-developer/PLANS.md) — plan structure, templates, conventions
- [`website/docs/ai-developer/WORKFLOW.md`](website/docs/ai-developer/WORKFLOW.md) — implementation workflow and process
- [`website/docs/ai-developer/GIT.md`](website/docs/ai-developer/GIT.md) — branch / commit / PR conventions
- [`website/docs/ai-developer/WORKTREE.md`](website/docs/ai-developer/WORKTREE.md) — git worktree usage (multi-agent safety)

When implementing a plan from [`website/docs/ai-developer/plans/`](website/docs/ai-developer/plans/):

1. **Read the full plan first** — understand all phases before starting.
2. **Work phase by phase** — never skip ahead. Pause for user review where the plan says.
3. **Move PLAN file** from `backlog/` → `active/` when starting; `active/` → `completed/` when done.
4. **Update the plan file as you go**: mark phase status, check off tasks, add an outcome note at the close of each phase.
5. **One feature branch per PLAN** (or per phase for large PLANs). PR per phase or per PLAN, depending on scope.

## Creating Plans

When user requests a new feature or fix:

1. If the problem is clear and the approach is known → create a `PLAN-*.md` directly in [`website/docs/ai-developer/plans/backlog/`](website/docs/ai-developer/plans/backlog/).
2. If the problem needs research → create an `INVESTIGATE-*.md` first; the PLAN follows once decisions are resolved.
3. Always ask the user to review the plan before starting implementation.

## Git Commits

- Ask for confirmation before running git commands (add, commit, push) when the task involves committing.
- Use feature branches for multi-phase work. Squash-merge via `gh pr merge --squash --delete-branch`.
- Never push to `main` directly.

## Documentation

All public docs live under [`website/docs/`](website/docs/):

- User-facing docs: `website/docs/` (about, sector, getting-started, concepts, sources, measurements)
- Contributor docs: `website/docs/contributors/` (added in PLAN-003 phases 2–4)
- AI-developer docs: `website/docs/ai-developer/`
- Plans: `website/docs/ai-developer/plans/{active,backlog,completed}/`

In-repo `docs/` is a thin pointer; new documentation goes under `website/docs/`.

## Key Folders

- [`atlas-data/`](atlas-data/) — ingest + dbt; canonical data side. See `atlas-data/README.md`.
- [`atlas-data/dbt/`](atlas-data/dbt/) — dbt project; the `check-osmosis.sh` gate enforces "every column documented" repo-wide.
- [`atlas-data/ingest/`](atlas-data/ingest/) — TypeScript ingest modules writing `raw.*`.
- [`atlas-frontend/`](atlas-frontend/) — Next.js app.
- [`website/`](website/) — Docusaurus-bound docs source (install pending).
