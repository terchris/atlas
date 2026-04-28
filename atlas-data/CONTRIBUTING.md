# Contributing to atlas-data

The full contributor guide for adding, changing, and reviewing data pipelines lives on the public docs site:

- **Adding a new data source** → [website/docs/contributors/adding-a-source.md](../website/docs/contributors/adding-a-source.md) — the 11-step workflow, PR checklist, and "MUST NOT" rules.
- **Ingest-module template** → [website/docs/contributors/ingest-modules.md](../website/docs/contributors/ingest-modules.md) — `index.ts` shape, README structure, scraping convention.
- **Schema.yml hygiene** → [website/docs/contributors/dbt-osmosis.md](../website/docs/contributors/dbt-osmosis.md) and [check-osmosis.md](../website/docs/contributors/check-osmosis.md) — the description-propagation tool and the gate that enforces it.
- **Dev environment setup** → [website/docs/contributors/setup.md](../website/docs/contributors/setup.md) (forthcoming — PLAN-003 phase 4).
- **End-to-end data journey** → [website/docs/contributors/data-journey.md](../website/docs/contributors/data-journey.md) (forthcoming — PLAN-003 phase 4) walks SSB 08764 from upstream to browser.

GitHub renders this file at `<repo>/CONTRIBUTING.md` when someone clicks "Contributing" on the repo page. Everything that used to live here moved to the public guides above so there's a single source of truth.

If you're an AI agent working on the repo, also see [`/CLAUDE.md`](../CLAUDE.md) for the agent-specific reading order (PLANS.md, WORKFLOW.md, GIT.md, WORKTREE.md).
