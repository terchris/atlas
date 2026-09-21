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
- **Every marts column is documented.** ⚠️ Nothing enforces this automatically — `check-osmosis.sh`
  is a script you run, not a gate: it is wired into no workflow and no image build. It also needs a
  **reachable database holding the marts.\* relations**, because dbt-osmosis learns a model's columns
  by introspecting the warehouse. Without one it discovers zero columns and, until 2026-09-16,
  reported `✓ all columns documented` on the strength of having checked nothing (urb-agents #1039).
  It now refuses instead (exit 2). This line previously claimed the gate "enforces it repo-wide".
- 🔴 **Atlas never alters or removes source data.** Values are published as the upstream publishes
  them. `raw.*` is verbatim. Transformations are derivations recorded beside the source columns,
  never edits in place.

  This is the whole reason Atlas is worth anything: a consumer can check a figure against SSB, FHI
  or Brreg and get the same number. Most of what Atlas carries is Norwegian public data, defined and
  published by the state under NLOD — **not ours to edit, and not ours to curate.**

  ⚠️ **That includes omission.** If a column or a row looks like it should not be published, say so
  to whoever owns the data and report what is actually there. Do not pre-emptively drop it. On
  2026-09-21 this agent proposed excluding two columns from a Red Cross source on the hypothesis
  that they *might* contain personal data, before the source had ever loaded. Terje stopped it. The
  hypothesis was untested, and the source was not Atlas's to edit whatever the answer turned out to
  be.

  🔵 The three `delete` statements in `dim_brreg_enhet` are not exceptions — they apply Brreg's OWN
  change feed (`Sletting` / `Fjernet`) and the incremental strategy's key swap. Deleting a row
  because upstream says the unit is deleted is fidelity, not editing.

  🔵 Correcting a DERIVATION is also not editing. `classify_region_code` made `kommune_nr` null for
  Svalbard and the shelf, because Atlas had been computing that column wrongly. `region_code` and
  `value` are untouched. The distinction to hold: upstream's values are theirs, Atlas's derived
  columns are Atlas's to get right.
- 🔴 **If a dataset is ingested, it must be served — and verified after deploy.**
  Terje's standing rule, 2026-09-21.

  On that date Atlas held 44 ingested sources and served 30. Eight FHI sources had been pulled
  weekly for months and modelled nowhere, including `fhi-neet` — 108,220 rows of *young people not
  in employment, education or training* — while an external consumer built a youth-need index
  without it. ⚠️ **Nobody decided not to serve them.** The ingest landed, the modelling never
  followed, and an ingest that reaches no model is invisible from every direction: green pipelines,
  a healthy `meta_sources` row, rows piling up in `raw`, and no symptom except an absence.

  **Enforced, not remembered:** `atlas-data/dbt/check-every-source-is-served.sh` fails CI when a
  source has no downstream model and is not declared. Deferring is allowed and requires putting the
  name in `BACKLOG` with your reason — a decision, not a way to silence the check. The live
  equivalent a consumer can run is `GET /meta_sources?downstream_model_count=eq.0`.

  **And "deployed" is not "works".** A release is not finished until a deploy request has been sent
  *and* its acceptance checks reported back. ⚠️ `transform_and_publish` runs
  `dbt build --exclude-resource-type test`, so its green PASS count contains **no tests at all** —
  the checks live in `transform_checks` and `api_v1_checks`. Ask for those results by name. On
  2026-09-21 both this agent and ops-dev quoted `PASS=82 WARN=0 ERROR=0` as evidence a release
  worked; the suite had not run, and when it did it failed ten tests.
- **This agent has no cluster access.** It declares; another agent applies; a third verifies.

⚠️ **Unverified**: `website/docusaurus.config.ts` and the generated sources registry both give the
public hosts as `atlas.sovereignsky.no` and `api-atlas.sovereignsky.no`. An earlier version of this
file said `atlas.helpers.no` / `api-atlas.helpers.no`. The code-derived values are used above; a
human should confirm which is current.
