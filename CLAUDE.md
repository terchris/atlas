# CLAUDE.md

This repo (`atlas`) is an open semantic layer over Norwegian public data and NGO supply data,
published through a public PostgREST API.

The repo uses the URB AI-developer workflow. **Before doing anything else, read the docs in
[`website/docs/ai-developer/`](website/docs/ai-developer/).**

## Start here (in order)

1. **[`website/docs/ai-developer/project-atlas.md`](website/docs/ai-developer/project-atlas.md)** —
   the authoritative description of *this* repo: what it is, where code lives, which commands to
   run, which framework docs apply, and the non-negotiable contracts. **Read this first.**
2. **[`website/docs/ai-developer/README.md`](website/docs/ai-developer/README.md)** — how the
   AI-developer system works and the full reading order.
3. Reference these as needed — only if `project-atlas.md` says they apply:
   - [WORKFLOW.md](website/docs/ai-developer/WORKFLOW.md) — idea → plan → implementation
   - [PLANS.md](website/docs/ai-developer/PLANS.md) — plan/investigation structure
   - [GIT.md](website/docs/ai-developer/GIT.md) — git safety; this repo is GitHub, so `gh` applies
   - [WORKTREE.md](website/docs/ai-developer/WORKTREE.md) — multi-agent worktree safety
   - [SECURITY.md](website/docs/ai-developer/SECURITY.md) — **read before writing anything into
     this repo or the published site; the repo is public**
   - [AZURE-DEVOPS.md](website/docs/ai-developer/AZURE-DEVOPS.md) — not applicable here
   - [DEVCONTAINER.md](website/docs/ai-developer/DEVCONTAINER.md) — not applicable; there is no
     devcontainer

**Fleet coordination is not in this repo.** The protocol lives in `terchris/urb-agents`
(`protocol/communication.md`), read remotely — do not clone urb-agents and do not copy `protocol/`
here. This agent's mailbox is `mailboxes/atlas/inbox/`. Do not revive `talk/` or `TALK.md` as a
fleet bus.

Plans live in [`website/docs/ai-developer/plans/`](website/docs/ai-developer/plans/) (`backlog/`,
`active/`, `completed/`). Current triage is
[`plans/backlog/1PRIORITY.md`](website/docs/ai-developer/plans/backlog/1PRIORITY.md). Keep it true
on a change, not on a timer.

## The three surfaces

- **Data** — [`atlas-data/`](atlas-data/): TypeScript ingest writes `raw.*`; dbt transforms to
  `marts.*` and the `api_v1` view contract; Dagster orchestrates.
- **Customer frontend** — [`atlas-frontend/`](atlas-frontend/): consumes the public PostgREST API
  with **no database role**, introspection-driven catalog at `/data`, forkable as a reference
  implementation. Default port `3001`.
- **Contributor frontend** — [`atlas-contributor-frontend/`](atlas-contributor-frontend/):
  diagnostics over direct Postgres, dev/staging only. Default port `4000`.

## Always-critical rules

- 🔴 **This repository is public.** No internal topology, addresses, capacity figures or runtime
  identifiers. A Docusaurus `exclude` hides a page from the site, never from github.com.
- **`api_v1` is a published contract.** Adding to it is public exposure and waits for a human.
- **Never commit to `main`** — feature branch, PR, squash-merge.
- **Every marts column is documented**; the `check-osmosis.sh` gate enforces it repo-wide.
- **This agent has no cluster access.** It declares; another agent applies; a third verifies.

⚠️ **Unverified**: `website/docusaurus.config.ts` and the generated sources registry both give the
public hosts as `atlas.sovereignsky.no` and `api-atlas.sovereignsky.no`. An earlier version of this
file said `atlas.helpers.no` / `api-atlas.helpers.no`. The code-derived values are used above; a
human should confirm which is current.
