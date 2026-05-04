# Investigate: Cloud agents that onboard new ingest sources autonomously

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Set up an asynchronous cloud-agent pipeline that picks one candidate from [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md), runs the source-onboarding workflow documented in [`website/docs/contributors/ingest-modules.md`](../../../contributors/ingest-modules.md), and opens a PR — all without a human at the keyboard. Multiple agents must safely operate in parallel without picking the same candidate.

**Last Updated**: 2026-05-04

**Origin**: Atlas's catalogue grew from 21 to 38 sources in four days through tight human-driven loops (the user pastes a portal URL → Claude in the keyboard onboards it). [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md) currently lists 26 more candidates ready to ingest. The user has a Claude Max ($100/mo) + Cursor ($25/mo) subscription giving access to cloud-based background agents. The user asked: *"can we get an agent running in the cloud to read the INVESTIGATE-new-norwegian-public-sources.md and pick one from the list. create a feature branch. Then create the folder for it and write the code. Then write a PR for it."* This investigation scopes that pipeline and the coordination machinery (no two agents working on the same candidate). Implementation is a follow-up `PLAN-*`.

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

1. **Coordination**: how do agents claim a candidate atomically? GitHub Issues, a lock file in the repo, a Project board, a queue service?
2. **Tool choice**: Cursor Background Agents vs Claude Code in the cloud — which fits Atlas's workflow, and is one-of or both worthwhile?
3. **DB access**: does the agent get a database connection to run live ingest, or does the human do that post-merge?
4. **Migration-number conflicts**: today's `NNN_*.sql` scheme allocates sequentially. Two agents racing could both pick `046`. Renumber on merge, or switch the scheme?
5. **INVESTIGATE-doc drift**: the maintenance ritual ([`INVESTIGATE-reports-and-indicators-from-catalogue.md`](./INVESTIGATE-reports-and-indicators-from-catalogue.md) bumps the source count). Two parallel PRs both bumping 38→39 race; the merge-second loses. How is that resolved?
6. **Stuck-agent escalation**: agent encounters auth-walled API / weird upstream / typecheck error it can't fix — how does it surface that without burning hours of compute?
7. **Cost**: how much of the $125/mo budget does each candidate consume, and is that economical?

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
                        │   ├── #N: Onboard bufdir-barnefattigdom │ ◄── claim queue
                        │   ├── #N+1: Onboard nav-uforetrygd      │
                        │   ├── #N+2: Onboard ssb-10826           │
                        │   └── ... (26 issues)                   │
                        │                                         │
                        │  PRs (one per onboarding)               │
                        └────────┬───────────────┬────────────────┘
                                 │ poll          │ open PR
                       ┌─────────┴────────┐  ┌───┴────────────────┐
                       │ Cursor BG Agent  │  │ Claude Code Cloud  │ ◄── workers
                       │ (sandbox VM)     │  │ (sandbox VM)       │
                       │                  │  │                    │
                       │ - claim issue    │  │ - claim issue      │
                       │ - branch + code  │  │ - branch + code    │
                       │ - run gates      │  │ - run gates        │
                       │ - open PR        │  │ - open PR          │
                       └──────────────────┘  └────────────────────┘
                                 ▲                 ▲
                                 │ runbook         │ runbook
                       ┌─────────┴─────────────────┴─────────────┐
                       │ AGENT-RUNBOOK-onboard-source.md         │ ◄── single source-of-truth
                       │ (committed to atlas/.cursor/ or         │
                       │  atlas/website/docs/ai-developer/)      │
                       └─────────────────────────────────────────┘
                                 ▲
                                 │ review + merge + run ingest
                       ┌─────────┴────────────────────────────┐
                       │ Human + local Claude (this session)  │ ◄── reviewer
                       └──────────────────────────────────────┘
```

Three pieces in scope: **the queue**, **the workers**, **the runbook**.

### The queue: GitHub Issues with the `new-source` label

GitHub Issues is the right primitive: free, atomic-ish (single-writer assignment), already integrated with PRs (`Closes #N`), and visible to both humans and agents through the same `gh` CLI.

**Claim protocol** (the load-bearing race-handling):

```
1. gh issue list --state open --label new-source --search "no:assignee" --json number,title --limit 5
2. Pick the first → ISSUE_NUM
3. gh issue edit ISSUE_NUM --add-assignee @me
4. sleep 3   # let any concurrent claims settle
5. gh issue view ISSUE_NUM --json assignees -q '.assignees[0].login'
6. If assignee != $GITHUB_ACTOR: another agent won the race → release this and goto 1
7. Otherwise: claim is mine; proceed
```

The `gh issue edit --add-assignee` is overwriting on GitHub's side — last-write-wins. The 3-second sleep + re-check resolves the rare-but-possible double-add. In the unlikely case both still claim, two PRs land and the human picks one to merge. Cost of duplicate work: one wasted run; not catastrophic.

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

### The workers: Cursor Background Agents (primary), Claude Code Cloud (secondary)

| Platform | Cost (existing) | Strengths | Weaknesses |
|---|---|---|---|
| **Cursor Background Agents** | $25/mo (already paid) | Mature for "claim a GitHub issue → submit PR" workflows. Sandbox VM with full repo clone. Triggers via issue label or on-demand. | Less personalised than Claude — no project-memory continuity with the keyboard sessions. |
| **Claude Code Cloud** | included in $100 Max | Same model that drives the keyboard work; CLAUDE.md + memory naturally shared. Excellent at long context. | Newer; cloud-agent UX is still evolving. |

**Recommendation**: pilot with **Cursor Background Agents first** because the $25 cost is already incurred and Cursor's BG agent UX for "issue → PR" is more mature today. Add Claude Code Cloud as a second worker once the runbook is stable — both can poll the same queue safely (the claim protocol guarantees no double-pick regardless of which platform an agent runs on).

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

## Coordination concerns

### No double-pick

Solved by the claim protocol above. **Stronger guarantees** if needed (overkill for 26-candidate scale): a tiny Postgres lock table, or use GitHub's GraphQL with `If-Match` headers. Not needed at this volume.

### Migration-number conflicts

Two agents on parallel branches both pick `046_…sql` based on the same `main` HEAD. Mitigation paths:

- **Soft**: agents poll `git ls-remote` for other open `feat/onboard-*` branches and pick a number above any reservations. Fragile.
- **Hard, status quo**: human bumps the second-merging migration number in the PR review. Cheap; happens after merge of the first.
- **Hard, schema change**: switch the migration filename scheme to `YYYY-MM-DD-HHMMSS_<id>.sql` so collisions are vanishingly rare. Bigger change; defer.

**Recommendation**: status quo + a one-line note in the agent runbook ("if your migration number collides at merge time, the human renumbers; don't worry about it during your run").

### INVESTIGATE-doc drift

The Maintenance ritual in [`INVESTIGATE-reports-and-indicators-from-catalogue.md`](./INVESTIGATE-reports-and-indicators-from-catalogue.md) requires the source count to bump on every onboarding. Two parallel PRs both go from 38→39 in the same file. Standard merge-conflict territory.

**Mitigation**: agents always run the maintenance ritual against `main` HEAD at branch time. The merging human resolves the count when bringing the second PR up to date — a 5-second rebase fix. Not worth automating.

### Concurrent ingest_runs

Not an issue at this stage because agents don't run live ingest. If we later allow that: the `IngestInProgressError` lock in `lib/scraping/ingest_runs.ts` already prevents concurrent ingests of the same source.

---

## DB access — the security boundary

**Recommendation**: agents do NOT have a database connection. They operate purely on the typecheck + dbt-parse + seed-validation gates, all of which run dry.

This keeps the failure mode of any cloud agent bounded: at worst, a bad PR. The human running `npm run ingest:<source-id>` after merge is the gate that touches `raw.*`. That's a 30-second extra step per merged source — completely worth it for the safety property.

A future optimisation could give agents a read-only role on a sandbox database to verify their dbt model parses without running it. Not on the critical path.

---

## Cost & operational considerations

**Per-candidate token estimate** (from the keyboard work I've been doing): ~150k tokens for a typical FHI Ungdata-shape source, ~250k for a structurally novel source (KPR-1aar, Selvmord). Across 26 candidates: ~5M tokens. At Claude Max billing rates, easily covered by the $100/mo quota — and with Cursor running in parallel, the per-candidate cost is closer to half that on each platform.

**Per-run wall-clock**: ~10–15 minutes per candidate end-to-end (an agent doing one).

**Throughput at 2 parallel agents**: 8–12 candidates per day if the human reviews promptly. Full backlog cleared in ~3 calendar days of low human attention.

**Failure cost**: a stuck agent burns ~30 minutes of compute before it gives up and labels `needs-human`. Bounded; not expensive.

---

## Open questions for decision

1. **Scope of the v1 pilot**: one agent on one candidate end-to-end before we wire the second worker, or wire both at once and let them race for the second candidate?
   *Recommendation: one first. The runbook will need a few corrections after the pilot; cheaper to learn from one run than two.*

2. **Cursor vs Claude as primary**: is the user's Cursor BG-agent setup more familiar, or is "Claude in cloud" closer to the keyboard workflow?
   *Recommendation: Cursor first because the GitHub-integration plumbing for BG agents is more mature; revisit after pilot.*

3. **Migration-number scheme change**: do we accept the current sequential scheme + manual renumber on merge, or invest in a timestamp-based scheme now?
   *Recommendation: defer; manual renumber is a 5-second fix and only happens on actual collisions, which at 26-candidate scale will be rare.*

4. **DB access for agents**: dry-only forever, or eventually a sandbox?
   *Recommendation: dry-only for v1. Reconsider if dbt-model-parse coverage isn't catching schema mistakes that ingest would catch immediately.*

5. **Issue body content**: just the candidate's URL + tier, or full embedded INVESTIGATE-new-norwegian-public-sources entry?
   *Recommendation: full embedded (the [Q*] questions matter for the agent's choices); the issue is self-contained so the agent doesn't need to re-read 492 lines of INVESTIGATE.*

6. **`needs-human` escalation**: how does the agent communicate? PR comment, issue comment, or both?
   *Recommendation: both; PR draft + issue comment with `Stuck: <reason>`. Keeps the issue queue clean.*

7. **Auto-merge**: never. The PR review remains the human's quality gate. (Assert explicitly in the runbook; don't let an agent enable GitHub auto-merge.)

---

## Sequencing recommendation

**Phase 0 — pilot infrastructure (1–2 hours, blocking)**

1. Bootstrap script: convert the 26 candidates in [`INVESTIGATE-new-norwegian-public-sources.md`](./INVESTIGATE-new-norwegian-public-sources.md) → 26 GitHub Issues with label `new-source`.
2. Author the runbook at `website/docs/ai-developer/AGENT-onboard-source.md` + `.cursor/rules/onboard-source.mdc`.
3. Configure one Cursor Background Agent against the runbook.

**Phase 1 — pilot one end-to-end (1 candidate, agent-to-merge)**

4. Pick a low-risk candidate (suggestion: `ssb-10826` bydel population — well-understood SSB shape, no auth, kommune-resolved). Issue gets pre-claimed by the pilot agent.
5. Watch the run. Read the PR. Address whatever the agent stumbled on (likely: dimension semantics, attribution string, eu_theme guess).
6. Update the runbook based on the lessons.
7. Merge. Run migrate + ingest + dbt test locally. Verify catalogue grew 38→39, dim count grew, the maintenance ritual fired correctly.

**Phase 2 — scale to two parallel agents (1 day)**

8. Add Claude Code Cloud as a second worker against the same queue.
9. Watch for race conditions in the claim protocol. Confirm no double-pick.
10. Throughput: should clear 6–10 candidates with light human supervision.

**Phase 3 — parallelism + escalation handling (1 week)**

11. Triage `needs-human` PRs — these are the candidates that have actual quirks (auth, weird upstream shape).
12. The remainder of the 26 candidates land as PRs over the week.
13. Capture per-candidate lessons in the runbook for future similar shapes.

---

## What this investigation does NOT cover

- **The PLAN that actually wires this up** — separate `PLAN-008-cloud-agent-onboarding.md` once decisions on the open questions land.
- **CI/CD for the agent's PRs** — Atlas already runs typecheck + tests + dbt parse on PRs (or should). Confirming that's wired is a follow-up.
- **Multi-repo agents** — UIS coordination etc. is out of scope; this investigation is single-repo (atlas).
- **Agents picking from non-onboarding queues** — a generic Atlas agent that does *anything* labelled `agent-ok` is overscoped; one queue, one task type.
- **Deep ingestion of structurally novel sources** — sources that need new ingest-lib code (a new HTML scraper, a new auth-flow client) are outside what an agent can do reliably; flag those as `needs-human` from the start. Only Tier-1-style FHI/SSB shape sources are agent-friendly.

---

## Cross-references

- [INVESTIGATE-new-norwegian-public-sources.md](./INVESTIGATE-new-norwegian-public-sources.md) — the 26-candidate queue this pipeline drains.
- [INVESTIGATE-reports-and-indicators-from-catalogue.md](./INVESTIGATE-reports-and-indicators-from-catalogue.md) — the maintenance ritual the agent must execute (step 7 in `contributors/ingest-modules.md`).
- [PLAN-007-data-display-open-by-default.md](../active/PLAN-007-data-display-open-by-default.md) — the catalogue plumbing that every onboarded source feeds into.
- [`website/docs/contributors/ingest-modules.md`](../../../contributors/ingest-modules.md) — the 7-step adding-a-source workflow that is the agent's runbook.
- [`feedback_reports-investigate-stays-current.md`](../../../../../../.claude/projects/-Users-terje-christensen-learn-helpers-atlas/memory/feedback_reports-investigate-stays-current.md) — the memory that codifies the maintenance ritual; the agent will be running into the same bar.
- [WORKTREE.md](../../WORKTREE.md), [GIT.md](../../GIT.md) — multi-agent / multi-branch hygiene that becomes load-bearing once agents push concurrently.
