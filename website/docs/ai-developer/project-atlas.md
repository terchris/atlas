# project-atlas

The authoritative description of **this** repository. Framework docs (`WORKFLOW.md`, `GIT.md`, …)
yield to this file when they disagree.

**Last verified**: 2026-08-31.

## What this repo is

Atlas is an open semantic layer over Norwegian public data and NGO supply data, published through
a public PostgREST API. It ingests ~41 public-sector sources (SSB, FHI, Bufdir, Brreg, KLASS and
others), transforms them with dbt into a documented `marts.*` layer, and exposes a curated
`api_v1` view contract that anyone can query without a database role.

This repo is not the organisation and not the platform. It is the data product plus the two
frontends and the documentation site that sit on top of it.

## What it builds / does not build

- **Builds**: the ingest modules (`raw.*`), the dbt project (`marts.*`, `api_v1`), a customer web
  app, a contributor diagnostics app, and the public documentation site.
- **Does not build**: the platform it runs on. Postgres, the orchestrator, PostgREST deployment,
  networking and observability belong to the infrastructure and are operated by another agent.
  This repo *declares* what must be deployed; it never deploys.

## Layout

```
atlas/
├── atlas-data/                  — the data product
│   ├── ingest/                  — TypeScript, one folder per source, writes raw.*
│   ├── dbt/                     — staging → marts.* → api_v1 views
│   ├── dagster/                 — assets, schedules, sensors, automation conditions
│   └── migrations/              — raw.* schema SQL
├── atlas-frontend/              — customer app; PostgREST consumer, no DB role (port 3001)
├── atlas-contributor-frontend/  — diagnostics app; direct Postgres, dev/staging only (port 4000)
└── website/                     — Docusaurus site (installed and building)
    └── docs/ai-developer/       — THIS folder. There is no second copy.
```

## Commands

Node **≥22** is required for the ingest tests — the machine default may be older, and Vitest 4
dies at *startup* on Node 20 in a way that looks like a broken repo rather than an unsupported
runtime.

```bash
cd atlas-data/ingest
npm install
npm run migrate               # apply ../migrations/ against $DATABASE_URL
npm run ingest:<source-id>
npm run typecheck
npm test

cd atlas-data/dbt             # dbt runs through uv, never a bare `dbt`
uv run --env-file ../ingest/.env dbt build
uv run --env-file ../ingest/.env dbt test

cd website && npm run build   # Docusaurus; onBrokenLinks is 'throw'
```

## Git host

GitHub. `origin` is `https://github.com/terchris/atlas`. [GIT.md](GIT.md) applies;
[AZURE-DEVOPS.md](AZURE-DEVOPS.md) does not.

## Devcontainer

**No.** There is no `.devcontainer` in this repo and [DEVCONTAINER.md](DEVCONTAINER.md) does not
apply. Run commands on the host. Do not invent a cage.

## Contracts (non-negotiable)

- 🔴 **This repository is public.** Internal topology, addresses, capacity figures and runtime
  identifiers must not be committed here. See [SECURITY.md](SECURITY.md) — this is the constraint
  most easily broken while writing something otherwise sensible.
- **`api_v1` is a published contract.** Adding to it is public exposure and waits for a human.
  `private_marts.*` (Red Cross personal data) stays gated.
- **The frontend dogfoods the public API.** `atlas-frontend` has no database role and reads only
  what an external consumer can read. Do not give it one to make something easier.
- **Every marts column is documented.** The dbt-osmosis gate enforces it repo-wide; a new column
  without a description fails the gate.
- **Prefer a build-time assertion over a rule people must remember** — and make the guard fail on
  purpose once before trusting it. This repo has shipped a guard that protected nothing, and a
  green uniqueness test once masked a real fan-out bug.
- **A retraction must travel with the claim it retracts.** On 2026-09-05 a claim was measured,
  found wrong and retracted in a PR thread and an investigation file. Four days later the same
  number was recycled — into a commit message, a PR body, and an acceptance criterion sent to
  another agent — because the retraction lived in one place and the number moved to another. When
  withdrawing something, put the withdrawal where the claim will next be read, not only where it was
  made.
- **Never commit to `main`.** Feature branch, then a PR, squash-merged.
- **⏳ Standing authorization to merge your own PRs (Terje, urb-agents #338, condition confirmed
  #364).** From #364, verbatim: *"keep merging your own PRs on terchris/atlas until 'uis template
  install atlas' works end to end. Silence from me is not a change."*

  So **merge your own PRs on `terchris/atlas` without waiting for Terje** — do not stop to ask,
  which is the whole reason this note exists. It removes the wait for his click, **not the test**:
  deployable work is still declared with acceptance criteria and falsifications a stranger can run,
  imac still tests it, and this agent still does not grade its own work.

  **It ends when either is true, and not before:**
  1. **Terje says so** — anywhere; a bus task, a comment, a message. His word ends it immediately.
  2. **`uis template install atlas` installs Atlas end to end on a clean cluster**, with no manual
     `.uis.extend` edit.
     - ✅ **No platform blocker remains** (2026-09-09). TPL-F5 shipped in UIS 1.6.19 and was
       cluster-verified — a `provides` entry may declare a `code_location` and UIS writes
       `.uis.extend/` itself (#367, #480). TPL-F7 left Atlas's path earlier: per #362 the definition
       uses a **single-file** `init:` and Dagster owns the migrations. **The remaining work is
       Atlas's own**, and the critical path is: publish the artifact → install it from a local
       registry → imac falsifies it on a cluster.
     - ⚠️ Note how this was found. Atlas held TPL-F5 as a blocker for hours *after it had shipped*,
       because the UIS CLI reference still said a code location "remains a manual edit". A stale doc
       kept a condition open on a standing authorization from Terje. **When a blocker is load-bearing
       for something Terje granted, confirm it against the code or the maintainer before pacing off
       it.**

  **What does *not* end it:** #214 shipping, `uis verify postgrest` going green, or the atlas
  instance running. The instance was already deployed *before* the grant was given (#263), so none
  of those can be what "deployed" meant. That ambiguity is settled — do not re-litigate it.

  **Two things this note used to say, both now superseded — recorded so their absence looks
  deliberate rather than lost:**
  - It warned that Terje's silence was "not agreement" and told you to ask before relying on this.
    #364 reverses that explicitly: *silence from me is not a change.* Do not go back to him on a
    schedule.
  - It carried a self-imposed one-month expiry (2026-10-09), added as a guard against a grant with
    no clock. #364 supersedes it by naming the real condition. **Removed rather than kept quietly**,
    because enforcing my own timer over his stated condition would substitute my judgement for his
    on something that is his.

  The one genuine gap left: if the one-command-install goal is **abandoned or redefined**, condition
  2 becomes undefined and this grant has no end. Ask then — that is a change in the goal, not
  silence.
- **This agent has no cluster access.** No `kubectl`, no `docker`, no cluster shell. It declares;
  another agent applies; a third verifies. Do not write a plan that assumes otherwise.

## Always-loaded files

- Repo-root [`CLAUDE.md`](https://github.com/terchris/atlas/blob/main/CLAUDE.md)
- Repo-root [`AGENTS.md`](https://github.com/terchris/atlas/blob/main/AGENTS.md)

## URB fleet

- Agent id: `atlas`
- Mailbox: `mailboxes/atlas/inbox/` in `terchris/urb-agents`
- Read `protocol/communication.md` remotely. Do not clone urb-agents. Do not copy `protocol/` here.
- Fleet status is published to `fleet/status/atlas.md` with `scripts/publish-status.sh`.

## Other documentation

- [`AGENT-onboard-source.md`](AGENT-onboard-source.md) — the procedure for adding a data source.
- [`asgard-performance-baseline.md`](asgard-performance-baseline.md) and
  [`baseline-2026-04-28.md`](baseline-2026-04-28.md) — measured baselines. ⚠️ These predate the
  public-repo constraint above and are part of the open question named in SECURITY.md.
- [`plans/talk/`](https://github.com/terchris/atlas/tree/main/website/docs/ai-developer/plans/talk) — legacy in-repo coordination threads. **Not** a fleet bus; kept
  because the threads record why past decisions were made.
- Product documentation for consumers lives in `website/docs/` (concepts, sources, measurements).

## Known-stale claims corrected on 2026-08-31

The previous version of this file said Atlas had 19 sources, that Docusaurus was not yet
installed, that this folder lived at `docs/ai-developer/`, that orchestration was a future "v2",
and that there was no repo-root `CLAUDE.md`. All five were out of date. If something here reads as
surprising, verify it against the code before repeating it.
