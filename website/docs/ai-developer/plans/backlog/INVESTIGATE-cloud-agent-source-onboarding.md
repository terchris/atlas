# Investigate: Cloud agents that onboard new ingest sources autonomously

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Set up an asynchronous cloud-agent pipeline that picks one candidate from [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md), runs the source-onboarding workflow documented in [`website/docs/contributors/ingest-modules.md`](../../../contributors/ingest-modules.md), and opens a PR — all without a human at the keyboard. **Single agent at a time** to keep the design simple: only one Cursor Background Agent runs at a time, eliminating concurrent-pick coordination from scope.

**Last Updated**: 2026-05-04 (rev 2: collapsed to single-agent / Cursor-only design — drops two-worker race-handling, migration-number-conflict logic, and parallel-PR INVESTIGATE-drift handling per user direction)

**Origin**: Atlas's catalogue grew from 21 to 38 sources in four days through tight human-driven loops (the user pastes a portal URL → Claude in the keyboard onboards it). [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md) currently lists 26 more candidates ready to ingest. The user has a Cursor ($25/mo) subscription with Background Agents that runs in cloud sandboxes — under-utilised on the user's machine, well-suited to async source onboarding. (The Claude Max $100/mo subscription stays at the keyboard for review + ingest work.) The user asked: *"can we get an agent running in the cloud to read the INVESTIGATE-new-norwegian-public-sources.md and pick one from the list. create a feature branch. Then create the folder for it and write the code. Then write a PR for it."* This investigation scopes that pipeline. **Concurrency constraint** (per user, 2026-05-04 rev 2): only one Cursor agent runs at a time — eliminates the entire double-pick / migration-collision / parallel-INVESTIGATE-drift problem class. Implementation is a follow-up `PLAN-*`.

---

## What "agent in the cloud" needs to do

Per-candidate, the agent's contract is:

1. **Claim** one entry from the candidate queue (race-safe — no double-claim).
2. **Branch** from `main` as `feat/onboard-<source-id>`.
3. **Onboard** the source per [`contributors/ingest-modules.md`](../../../contributors/ingest-modules.md) steps 1–7:
   - Folder, `index.ts`, prose-only README, manifest.yml (with hand-authored `dimensions:` block), npm script, regenerate seed, refresh the reports INVESTIGATE.
4. **Pass quality gates** locally inside the cloud sandbox: typecheck, vitest, fill-manifest-todos idempotency, build_sources_seed.py validation, dbt parse + osmosis check.
5. **Open a PR** with `Closes #<issue>` linkage and a tight description of what the agent did + what it couldn't do (any TODOs left for the human).
6. **Stop** — the agent does not run live ingest, does not apply migrations, does not merge.

Atlas's local Claude (i.e. me, paired with terje at the keyboard) takes over from there: review PR, run `npm run migrate` + `npm run ingest:<source-id>` against the live DB, verify row counts + `upstream_updated_at`, merge. That split keeps DB-write authority with the human, and keeps the agent's failure modes bounded to "open a PR that doesn't pass review."

---

## Questions to Answer

1. **Issue queue**: GitHub Issues is the natural primitive — one issue per candidate, agent picks the first unassigned one. With single-agent concurrency, no atomicity machinery is needed beyond `gh issue edit --add-assignee @me`. Confirm this is the right shape vs alternatives (Project board, in-repo TODO file).
2. **DB access**: does the agent get a database connection to run live ingest, or does the human do that post-merge?
3. **Stuck-agent escalation**: agent encounters auth-walled API / weird upstream / typecheck error it can't fix — how does it surface that without burning hours of compute?
4. **Cost**: how much of the $25/mo Cursor budget does each candidate consume, and is that economical?
5. **Trigger model**: agent runs on a schedule (cron-like), on-demand (user fires off a session), or on issue-creation (webhook)?

---

## Current state

What we have today that this builds on:

- **38 ingested sources** following a uniform pattern (`atlas-data/ingest/src/sources/<id>/{index.ts, README.md, manifest.yml}`) + paired `atlas-data/migrations/NNN_raw_<id>.sql`.
- **Bootstrap toolchain** that's already mostly self-driving:
  - `npm run sources:bootstrap-manifest -- <id>` — skeleton manifest
  - `npm run sources:fill-manifest-todos` — auto-fills description, attribution, eu_theme, tags from the README
  - `cd atlas-data/dbt && uv run python scripts/build_sources_seed.py --readme` — regenerates seeds + the auto-table
- **Validation gates** that already run dry (no DB):
  - `npm run typecheck` (TypeScript)
  - `npm test` (vitest, 49 tests)
  - `build_sources_seed.py` validates required fields + EU-theme allowlist + dimensions shape
  - `uv run dbt parse` (dbt project well-formed)
- **A documented contributor workflow** — `contributors/ingest-modules.md` step-by-step is the agent's runbook.
- **The candidate queue** — [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md) holds 26 entries, each with URL, format, auth, licence, geo, cadence, provider, eu_theme, plus per-candidate quirks ([Q*] open questions).

What's missing:

- A **claim mechanism** preventing two agents from picking the same candidate.
- An **agent runbook** that says: read this file, do these steps, open a PR with this template.
- **Wiring** of one or both cloud-agent platforms (Cursor / Claude) to the queue.
- A **post-merge runbook** for the human (apply migration, run ingest, verify) — already implicit in the workflow but not collected as a checklist.

---

## Proposed architecture

```
                        ┌─────────────────────────────────────────┐
                        │  GitHub: atlas repo                     │
                        │                                         │
                        │  Issues (label: new-source)             │
                        │   ├── #N: Onboard bufdir-barnefattigdom │ ◄── work queue
                        │   ├── #N+1: Onboard nav-uforetrygd      │
                        │   ├── #N+2: Onboard ssb-10826           │
                        │   └── ... (26 issues)                   │
                        │                                         │
                        │  PRs (one per onboarding)               │
                        └────────┬──────────────┬─────────────────┘
                                 │ poll         │ open PR
                       ┌─────────┴──────────────┴────────┐
                       │ Cursor BG Agent (sandbox VM)    │ ◄── single worker
                       │                                 │
                       │ - pick first unassigned issue   │
                       │ - assign self                   │
                       │ - branch + write code           │
                       │ - run quality gates             │
                       │ - open PR                       │
                       │ - stop                          │
                       └─────────────────────────────────┘
                                 ▲
                                 │ runbook
                       ┌─────────┴──────────────────────────┐
                       │ AGENT-onboard-source.md (+         │ ◄── single source-of-truth
                       │ .cursor/rules/onboard-source.mdc)  │
                       └────────────────────────────────────┘
                                 ▲
                                 │ review + merge + run ingest
                       ┌─────────┴────────────────────────────┐
                       │ Human + local Claude (this session)  │ ◄── reviewer
                       └──────────────────────────────────────┘
```

Three pieces in scope: **the queue**, **the worker**, **the runbook**. Single-agent concurrency keeps every piece simple.

### The queue: GitHub Issues with the `new-source` label

GitHub Issues is the right primitive: free, integrates with PRs (`Closes #N`), and visible to both human and agent through the same `gh` CLI. With one agent running at a time, the assignment is just a "this one is in flight, don't redo it on the next run" marker — no race protection needed.

**Pick protocol**:

```
1. gh issue list --state open --label new-source --search "no:assignee" \
       --json number,title --limit 1
2. If empty → nothing to do; exit cleanly.
3. Otherwise pick that issue → ISSUE_NUM
4. gh issue edit ISSUE_NUM --add-assignee @me
5. Proceed with onboarding
```

(If a previous agent run was interrupted mid-flight without opening a PR, the issue stays assigned to the agent's handle but with no PR link. The human un-assigns it on next review pass and the agent re-picks it on next run. Self-correcting on a single-day cadence.)

**One-time bootstrap**: convert the 26 candidates in [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md) into 26 GitHub Issues. Suggested issue body template:

```
**Source**: <source-id>  (e.g. nav-uforetrygd)
**Provider**: <provider-tag>
**Tier**: 1 / 2 / 3
**Reports unlocked / extended**: #5, #8 (per INVESTIGATE-reports-and-indicators)
**URL**: <upstream URL>
**Format / Auth / Licence**: <as captured in INVESTIGATE-new-norwegian-public-sources>
**Cadence**: <P1Y / P3M / P1M / etc.>
**Per-source quirks**: <any [Q*] notes from the backlog>

---
Open this issue with `gh issue create --label new-source --body @body.md`.
The agent runbook lives at [path]. The agent will assign itself, branch,
write code, run gates, open a PR with `Closes #<this>`, and stop.
```

A small one-off Python script can generate all 26 from the markdown source.

### The worker: Cursor Background Agent (single instance)

Cursor BG Agents fit the workflow well: sandbox VM, full repo clone, GitHub-integrated PR flow, triggered on demand or on-schedule. Single instance — at any moment either zero or one agent is running. The Cursor $25/mo subscription is already paid and underused on the user's machine, so this is essentially free capacity.

**Why not Claude Code Cloud as a second worker** (initial design proposed both — collapsed in rev 2 per user direction): adding a second worker brings concurrent-pick coordination back into scope (sleep + re-check protocol, migration-number races, parallel INVESTIGATE-doc drift). The single-agent constraint deletes all of that. If throughput later becomes a bottleneck — at the projected 4–8 candidates per day per agent, the 26-candidate backlog clears in 3–6 calendar days, which doesn't seem to need parallelism — the Claude Code Cloud worker can join later by re-introducing the race-protected claim protocol from rev 1 of this doc.

### The runbook: one markdown file the agent reads

Lives at `website/docs/ai-developer/AGENT-onboard-source.md` (loaded into the agent's context at session start) and at `.cursor/rules/onboard-source.mdc` for Cursor-specific config. Both reference each other so the source of truth doesn't fork. Contents:

1. **Claim protocol** (above).
2. **Workflow steps**: pointer to `contributors/ingest-modules.md` + clarifications:
   - Migration number = `MAX(existing migration numbers) + 1` at branch time.
   - Source ID prefix matches the provider's tag (`bufdir-…`, `nav-…`).
   - Author the `dimensions:` block by reading the upstream's `/query` endpoint and walking each dimension.
3. **Quality gates the agent must pass**:
   - `npm run typecheck` clean
   - `npm test` passes
   - `npm run sources:fill-manifest-todos` is a no-op on second run (idempotency)
   - `cd atlas-data/dbt && uv run python scripts/build_sources_seed.py --readme` validates and emits cleanly
   - `uv run dbt parse` (no DB needed) succeeds
   - All TODO markers are resolved in the manifest
4. **PR template** — title `Add <source-id> — <one-line>`; body sections: What landed, Cell budget, Filters chosen + why, Live-test commands the human runs (migrate + ingest + dbt seed), Known TODOs left.
5. **Escalation**: if any of {auth-walled API, opaque upstream slug, dimension fingerprint mismatches multiple tables, typecheck error after 3 attempts}: open the PR as **draft**, label it `needs-human`, comment on the issue with the blocking question, and stop. The human triages.
6. **What NOT to touch**: never write to the database, never run `npm run migrate`, never run `npm run ingest:*`, never `git push --force`, never close issues directly (the merging human's `Closes #N` does that).

---

## Coordination — what's *not* a problem (and what is)

The single-agent design eliminates every concurrent-PR coordination problem the rev-1 design had to handle: no double-pick (only one agent picks at a time), no migration-number conflicts (sequential), no parallel INVESTIGATE-doc drift (one PR per cycle merges before the next agent run starts). Documented here for completeness in case throughput pressure ever justifies a second worker.

What *does* need handling even with one agent:

- **Stale claim from interrupted run**: the agent crashes mid-flight after assigning itself but before opening a PR. Resolution: human-driven. On next review pass, an issue assigned to the agent for >24h with no linked PR gets un-assigned by the human; the agent re-picks it next run. No machinery; just hygiene.
- **Bad PR**: the agent opens a PR that fails review. Resolution: PR comments + close-don't-merge; the agent re-reads the runbook + the PR feedback in its next session. Standard PR review loop.
- **Stuck mid-run** (auth wall, opaque upstream slug, typecheck error after retries): the agent opens a **draft** PR, labels it `needs-human`, comments on the issue with the blocker, and stops. The human triages.

---

## DB access — the security boundary

**Recommendation**: agents do NOT have a database connection. They operate purely on the typecheck + dbt-parse + seed-validation gates, all of which run dry.

This keeps the failure mode of any cloud agent bounded: at worst, a bad PR. The human running `npm run ingest:<source-id>` after merge is the gate that touches `raw.*`. That's a 30-second extra step per merged source — completely worth it for the safety property.

A future optimisation could give agents a read-only role on a sandbox database to verify their dbt model parses without running it. Not on the critical path.

---

## Cost & operational considerations

**Per-candidate token estimate** (from the keyboard work I've been doing): ~150k tokens for a typical FHI Ungdata-shape source, ~250k for a structurally novel source (KPR-1aar, Selvmord). Across 26 candidates: ~5M tokens. Cursor's BG-agent allocation in the $25 plan accommodates this comfortably.

**Per-run wall-clock**: ~10–15 minutes per candidate end-to-end.

**Throughput at one agent**: 4–8 candidates per day if the human reviews promptly. Full backlog (26 candidates) clears in ~3–6 calendar days of low human attention. Throughput is bounded by *human review pace*, not agent runtime — which is the right bottleneck for an unsupervised pipeline.

**Failure cost**: a stuck agent burns ~30 minutes of compute before it gives up and labels `needs-human`. Bounded; not expensive.

---

## Open questions for decision

1. **DB access for the agent**: dry-only forever, or eventually a sandbox?
   *Recommendation: dry-only for v1. Reconsider if dbt-model-parse coverage isn't catching schema mistakes that ingest would catch immediately.*

2. **Issue body content**: just the candidate's URL + tier, or full embedded INVESTIGATE-new-norwegian-public-sources entry?
   *Recommendation: full embedded (the [Q*] questions matter for the agent's choices); the issue is self-contained so the agent doesn't need to re-read 492 lines of INVESTIGATE.*

3. **`needs-human` escalation**: how does the agent communicate? PR comment, issue comment, or both?
   *Recommendation: both; PR draft + issue comment with `Stuck: <reason>`. Keeps the issue queue clean.*

4. **Trigger model**: how does the agent start a run? Cron-like schedule (e.g. once a day), on-demand (the user fires off a Cursor session), or webhook on issue-creation?
   *Recommendation: on-demand for v1 — the user kicks off the agent when they want progress; review pace is the throughput bottleneck anyway. Schedule it later if review starts catching up.*

5. **Auto-merge**: never. The PR review remains the human's quality gate. (Assert explicitly in the runbook; don't let the agent enable GitHub auto-merge.)

---

## Sequencing recommendation

**Phase 0 — pilot infrastructure (1–2 hours, blocking)**

1. Bootstrap script: convert the 26 candidates in [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md) → 26 GitHub Issues with label `new-source`.
2. Author the runbook at `website/docs/ai-developer/AGENT-onboard-source.md` + `.cursor/rules/onboard-source.mdc`.
3. Configure the Cursor Background Agent against the runbook.

**Phase 1 — pilot one end-to-end (1 candidate, agent-to-merge)**

4. Pick a low-risk candidate (suggestion: `ssb-10826` bydel population — well-understood SSB shape, no auth, kommune-resolved). The agent claims it on its first run.
5. Watch the run. Read the PR. Address whatever the agent stumbled on (likely: dimension semantics, attribution string, eu_theme guess).
6. Update the runbook based on the lessons.
7. Merge. Run migrate + ingest + dbt test locally. Verify catalogue grew 38→39, dim count grew, the maintenance ritual fired correctly.

**Phase 2 — drain the backlog (3–6 calendar days)**

8. Trigger the agent on demand (or on a daily schedule) — it picks the next unassigned issue, opens a PR, stops.
9. Human reviews + merges + runs live ingest after each merge.
10. Triage `needs-human` PRs as they appear — these are the candidates that have actual quirks (auth, weird upstream shape) and need keyboard-Claude pairing.
11. Capture per-candidate lessons in the runbook for future similar shapes.

**Phase 3 — only if throughput pressure justifies it (defer)**

12. If 4–8 candidates/day proves too slow once review catches up, re-introduce the rev-1 race-protected claim protocol and add Claude Code Cloud as a second worker. The 26-candidate backlog at one-agent throughput is unlikely to need this.

---

## What this investigation does NOT cover

- **The PLAN that actually wires this up** — separate `PLAN-008-cloud-agent-onboarding.md` once decisions on the open questions land.
- **CI/CD for the agent's PRs** — Atlas already runs typecheck + tests + dbt parse on PRs (or should). Confirming that's wired is a follow-up.
- **Multi-repo agents** — UIS coordination etc. is out of scope; this investigation is single-repo (atlas).
- **Agents picking from non-onboarding queues** — a generic Atlas agent that does *anything* labelled `agent-ok` is overscoped; one queue, one task type.
- **Deep ingestion of structurally novel sources** — sources that need new ingest-lib code (a new HTML scraper, a new auth-flow client) are outside what an agent can do reliably; flag those as `needs-human` from the start. Only Tier-1-style FHI/SSB shape sources are agent-friendly.
- **Multi-agent parallelism** — the single-agent constraint is a deliberate scope choice; reintroducing a second worker means resurrecting the rev-1 race-handling design (claim re-check, migration-number reservation, parallel INVESTIGATE-drift handling) and isn't justified at the 26-candidate backlog size.

---

## Cross-references

- [INVESTIGATE-new-norwegian-public-sources.md](./INVESTIGATE-new-norwegian-public-sources.md) — the 26-candidate queue this pipeline drains.
- [INVESTIGATE-reports-and-indicators-from-catalogue.md](./INVESTIGATE-reports-and-indicators-from-catalogue.md) — the maintenance ritual the agent must execute (step 7 in `contributors/ingest-modules.md`).
- [PLAN-007-data-display-open-by-default.md](../active/PLAN-007-data-display-open-by-default.md) — the catalogue plumbing that every onboarded source feeds into.
- [`website/docs/contributors/ingest-modules.md`](../../../contributors/ingest-modules.md) — the 7-step adding-a-source workflow that is the agent's runbook.
- [`feedback_reports-investigate-stays-current.md`](../../../../../../.claude/projects/-Users-terje-christensen-learn-helpers-atlas/memory/feedback_reports-investigate-stays-current.md) — the memory that codifies the maintenance ritual; the agent will be running into the same bar.
- [WORKTREE.md](../../WORKTREE.md), [GIT.md](../../GIT.md) — multi-agent / multi-branch hygiene that becomes load-bearing once agents push concurrently.
