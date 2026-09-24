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
   - [SERVING-A-SOURCE.md](website/docs/ai-developer/SERVING-A-SOURCE.md) — **read before
     modelling or publishing a source.** What goes wrong between ingest and a consumer trusting
     the result, written from defects that happened, with which gate catches each one and which
     are only documented
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
  source does not reach a published `api_v1` relation and is not declared. ⚠️ It asked "does a
  model exist" until 2026-09-21 and reported 0 deferred while four sources were unreachable —
  *having a model* and *reaching a consumer* are different claims, and only the second is the rule. Deferring is allowed and requires putting the
  name in `BACKLOG` with your reason — a decision, not a way to silence the check. The live
  equivalent a consumer can run is `GET /meta_sources?served_as=eq.{}`. ⚠️ It was
  `downstream_model_count=eq.0` until 2026-09-21, which found ONE source while four more
  were built and served nothing — that field counts models, and a source with an indicator
  model and nothing downstream reports 1. `served_as` is empty exactly when nothing
  published depends on the source (urb-agents #1351).

  🔴 **AND A DEPLOY IS NOT SUCCESSFUL UNTIL THE DATA ARRIVES.** Terje, 2026-09-21:
  *"if the data did not arrive after the deploy then i would say it is a not sucessful
  deploy."* A release that adds or fixes a source is not landed until that source returns
  **rows** through a published relation.

  ⚠️ Two releases passed every check without delivering. `fhi-innvandrere`: 32,720 rows
  ingested, one model, zero published — reported as one of "the eight FHI sources served"
  when it was seven. `ssb-06913`: 783,104 rows ingested, four relations wired to it, zero
  arriving, undetected for weeks. Both had `transform_and_publish` SUCCESS, no test
  failures, `api_v1_checks` shortfall 0 and 19 of 19 relations answering.

  **In practice:** every deploy request names, per source, the relation it should appear in
  and an expected row count. 🔵 *"I cannot predict the count"* is a valid and preferred
  answer; omitting the source is not. `atlas-data/uis/lands-with.sh` derives that list from
  the git range and flags a source that would **deploy silent** — run it on `b5bb530` and it
  names `fhi-innvandrere` (urb-agents #1349).

  ⚠️ One source is excluded because no deploy can fix it: `redcross-branches` has no data
  to arrive.

  **And "deployed" is not "works".** A release is not finished until a deploy request has been sent
  *and* its acceptance checks reported back. ⚠️ `transform_and_publish` runs
  `dbt build --exclude-resource-type test`, so its green PASS count contains **no tests at all** —
  the checks live in `transform_checks` and `api_v1_checks`. Ask for those results by name. On
  2026-09-21 both this agent and ops-dev quoted `PASS=82 WARN=0 ERROR=0` as evidence a release
  worked; the suite had not run, and when it did it failed ten tests.
- **This agent has no cluster access.** It declares; another agent applies; a third verifies.

## The public hosts — measured 2026-09-22, not inferred

| what | host | verified |
|---|---|---|
| documentation site | `atlas.sovereignsky.no` | 200, GitHub Pages, Docusaurus 3.10.1 |
| **public API** | **`api-atlas.urbalurba.com`** | 200, `application/openapi+json`, 19 definitions |

🔴 **`api-atlas.sovereignsky.no` DOES NOT EXIST and never did.** It is NXDOMAIN. It was
inferred by analogy from the site hostname, and the two are not symmetrical.
`atlas.urbalurba.com` is a UIS platform placeholder, not Atlas.

🔵 **This agent CAN reach the public API** — read-only, over the internet, no cluster access
needed. `curl https://api-atlas.urbalurba.com/` returns the OpenAPI document.
⚠️ Cloudflare fronts it and rejects some default user agents: python `urllib` gets **403**
where `curl` gets **200**. A 403 here means your client, not the API.

⚠️ **Do not re-derive these. Read them:**
```
grep -n 'ATLAS_API_BASE_URL' website/hosts.mjs
jq -r .postgrest_base_url website/src/data/sources-registry.json
```
`website/hosts.mjs` is the single source of truth and says so in its own header; it exists
because these values were previously declared in three places and agreed with each other
while the API one was NXDOMAIN for four months.

🔴 **WHY THIS BLOCK IS WORTH ITS LENGTH.** Until 2026-09-22 these four lines said, marked
*"Unverified"*, that the public hosts were `atlas.sovereignsky.no` and
`api-atlas.sovereignsky.no`, and asked a human to confirm. Nobody did, for four months. This
agent then read that name out of its own instruction file every session, curled it, got
nothing, and told three other agents and a deploy thread that it **could not reach the API
and needed someone else to measure for it** — while the real host answered in 0.85 s.

**A stale line in a context file outlives the code it describes, and it is read as
background rather than as a claim.** `⚠️ Unverified` did not help: it marked the doubt and
then nothing resolved it, which is indistinguishable from an assertion to whoever reads it
next. If a note here cannot be verified now, verify it now or delete it.
