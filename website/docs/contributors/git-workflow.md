# Git workflow

Atlas follows a simple feature-branch + squash-merge flow. The agent-oriented detail (the safety rules an AI agent should follow before running `git` commands, multi-agent coordination) lives separately:

- **For humans contributing manually** — read this page; it covers the day-to-day commands.
- **For AI agents working on the repo** — read [`/website/docs/ai-developer/GIT.md`](../ai-developer/GIT.md) (safety rules, confirmation requirements) and [`/website/docs/ai-developer/WORKTREE.md`](../ai-developer/WORKTREE.md) (multi-agent worktree usage).

---

## The flow

```
main ──○──○──○──○──○──○────────────────  (production)
        │
        └─ feature/<short-slug> ──○──○─→  PR → review → squash-merge → main
```

1. **Create a feature branch off main** for every change.
2. **Commit incrementally** as you work; commit messages should be descriptive.
3. **Push, open a PR** when the change is testable.
4. **Squash-merge** once the PR is approved (single tidy commit lands on main).
5. **Delete the feature branch** after merge.

```bash
git checkout main
git pull --ff-only
git checkout -b feature/add-ssb-12345
# ... make changes, commit, push, open PR ...
gh pr merge <num> --squash --delete-branch
git pull --ff-only
git fetch --prune
```

Atlas's `gh pr merge --squash --delete-branch` handles the merge and remote-branch cleanup; the local-branch cleanup happens via `gh`'s checkout-back-to-main side effect. After merging always run `git fetch --prune` to drop the stale remote-tracking refs.

---

## Branch naming

- `feature/<slug>` — new feature or substantive change. Slug is short and kebab-case.
- `fix/<slug>` — bug fix.
- `docs/<slug>` — docs-only change.
- For multi-phase plans: `feature/plan-NNN-phase-N-<slug>` works (e.g. `feature/plan-003-phase-1-foundation`).

There is no enforced convention beyond "descriptive enough that a reviewer can guess what's in the branch from the name."

---

## Commit messages

The first line is a short imperative summary; the body explains the *why* (or what the diff doesn't make obvious).

- `Add ssb-12345 (population by age and sex)`
- `Fix dbt-osmosis double-pass on first install`
- `PLAN-002 phase 4: document 34 FRR columns in private_marts/schema.yml`

For PLAN-driven work, prefix the subject with `PLAN-NNN phase M:`. The body of the commit is a good place for verification notes (`dbt test` output, count diffs, etc.) — a reviewer can see what was actually checked.

Atlas uses a `Co-Authored-By` line for commits assisted by Claude Code:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## PR conventions

- **Title** — one line, ≤70 chars, imperative ("PLAN-002 phase 4: ...").
- **Body** — short Summary section + Test plan section with a checklist of what passed locally.
- **Squash-merge** — preserves a tidy linear `main` history; the squashed commit message becomes the merge commit.
- **One PLAN, one PR** is the default. Phase-by-phase PRs are fine for large PLANs (PLAN-001 used 7 PRs; PLAN-003 uses 1 with multiple commits).

Open PRs against `main`. Atlas does not use a `develop` branch.

---

## Multi-agent safety (humans, read this too)

Atlas is worked on **concurrently** by multiple Claude agents and a human. This means:

- Always run `git status` and `git branch --show-current` before any git op — verify you're on the branch you expect.
- Always `git pull --ff-only` before starting new work — the remote may have moved.
- Avoid long-running uncommitted state — commit often, push often.
- If you find unexpected files in `git status`, **investigate before deleting**. They may be in-progress work from another agent or the human.

For agent-specific safety rules (confirmation requirements before destructive ops), see [`/website/docs/ai-developer/GIT.md`](../ai-developer/GIT.md).

For the worktree-based pattern that lets multiple agents work on the same repo without colliding on the working tree, see [`/website/docs/ai-developer/WORKTREE.md`](../ai-developer/WORKTREE.md).

---

## What you must not do

- **Never push to `main` directly.** Always go through a PR.
- **Never `--force` push to `main`.** Force-pushing a feature branch is acceptable only if you own that branch and reviewers haven't started reviewing.
- **Never skip hooks (`--no-verify`).** If a hook fails, fix the underlying issue.
- **Never amend a published commit.** Add a new commit instead.
- **Never `git reset --hard` on a branch with uncommitted work** without confirming the work is recoverable.

---

## Cross-references

- [`/website/docs/ai-developer/GIT.md`](../ai-developer/GIT.md) — agent-specific git safety rules (confirmation requirements, what AI must not do without approval)
- [`/website/docs/ai-developer/WORKTREE.md`](../ai-developer/WORKTREE.md) — git worktree usage for multi-agent / parallel work
- [testing.md](./testing.md) — what to run locally before opening a PR
- [adding-a-source.md § PR checklist](./adding-a-source.md#pr-checklist) — the full pre-merge checklist for data-source PRs
