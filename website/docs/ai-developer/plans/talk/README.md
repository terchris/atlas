# Talk — peer agent coordination

How two AI coding agents work in parallel on the Atlas repo without colliding. Each agent has a name (the work area they're focused on); they coordinate by appending messages to `talk.md` in this folder.

This folder is legacy coordination material, kept because the threads record why past decisions were made. The messages are about code structure, plan deltas, and commit boundaries — no secrets, version-controlled with the rest of the project.

> **Note**: this folder was previously contrasted with a `TALK.md` testing protocol at `../../TALK.md`. That path was overwritten by a fleet-wide protocol sync in `ea389b4` and the file has since been removed; the original testing protocol is recoverable from `git show ea389b4^:website/docs/ai-developer/TALK.md` if it is wanted back.

---

## Why

Atlas has multiple parallel work streams (NGO ingests, private-Atlas plumbing, frontend, infra). When two agents work the repo at once they need to:

- Avoid editing the same files at the same time and producing merge conflicts.
- Share context about what just changed in main / shared schemas / shared libraries.
- Hand off when one stream's work blocks or unblocks the other.
- Bring an agent back up to speed when they resume work after others have shipped changes that affect their plan.

Without coordination, each agent reads the repo state at the moment they start and assumes nothing else is moving. That's fine for sequential work; it breaks fast under parallel work.

---

## Roles

Each agent has a **name** — usually the area of work they own. Examples in current use:

| Name | What they own |
|---|---|
| `redcross` | Importing Red Cross's private data (`atlas-private-data-repo/redcross/`, `app/private/redcross/`, anything under the private-Atlas thread). |
| `folkehjelp` | The Folkehjelp NGO ingest (`atlas-data/ingest/src/sources/folkehjelp-chapters/`, `atlas-data/dbt/models/supply/supply__folkehjelp_*.sql`, `app/ngo/folkehjelp/`). |

Names persist across sessions — `redcross` always means the Red Cross-private-data agent, regardless of which session is currently inhabiting that role.

There's no "contributor" / "tester" split — both agents contribute code. They're peers.

---

## Folder layout

```
docs/ai-developer/plans/talk/
├── README.md                      — this file
├── talk.md                        — current active conversation
├── talk1.md                       — archived past session 1
├── talk2.md                       — archived past session 2
└── …
```

Archive convention: when a topic is fully resolved, the active `talk.md` gets renamed to the next free `talk<N>.md` and a fresh `talk.md` opens for the next coordination thread.

---

## How a session works

```
Agent A                                  Agent B
   │                                        │
   ├── opens talk.md with header            │
   ├── states: who they are, what they're   │
   │   working on, what's relevant for B   │
   ├── lists shared files / schemas         │
   │   that need coordination              │
   ├── commits + pushes ─────────────────►  │
   │                                        ├── pulls latest main
   │                                        ├── reads talk.md
   │                                        ├── replies: their plan,
   │                                        │   what they'll touch,
   │                                        │   any clarifying questions
   │ ◄────────── commits + pushes ──────────┤
   ├── reads, responds                      │
   │                                        │
   └── (continues until coordination done)  │
```

Each message is a commit. Both agents pull before reading, push after writing.

---

## File format

### Session header

```markdown
# Talk — <topic>

**From**: <agent-name> (this session)
**To**: <other-agent-name>
**Started**: YYYY-MM-DD
**Previous**: [talk<N>.md](talk<N>.md) — previous topic title (if any)

**Context**: 1–2 sentences on why this conversation exists.

---
```

### Messages

```markdown
## <agent-name> — Message N (YYYY-MM-DD HH:MM)

Body of the message. Be concrete. Include:
- File paths or directory ranges you're claiming for your work
- Areas you're explicitly NOT touching
- Open questions for the other agent
- Pull-before-this-message commit SHA if a base reference matters

---
```

Messages are numbered sequentially across both agents. Either agent appends; never delete or rewrite past messages.

---

## Coordination rules

1. **Claim file/directory ranges before editing.** Write a "claiming X" message before opening files in shared territory. The other agent acks (or counter-proposes) before you commit.
2. **Shared schemas need explicit handoff.** If both NGO ingests UNION ALL into `dim_chapter`, only one agent edits `dim_chapter.sql` per round; the other holds.
3. **Dependency direction is one-way.** If A's work depends on B's still-in-progress change, A waits or scopes around it. Don't merge work that breaks the other's branch unless you've coordinated the rebase.
4. **Commit small, push often.** The other agent benefits when your incremental progress is visible.
5. **Resume sessions read talk.md first.** When an agent resumes after time away, the first action is always: pull main + read all of `talk.md` + verify the world still matches what's described.
6. **Investigation / PLAN file edits get flagged.** If you're going to materially change an investigation or a PLAN that the other might be reading, mention it in talk.md before pushing.

---

## What gets caught

This pattern catches issues a single-agent flow doesn't:

- **Schema drift** — both agents edit `dim_chapter` for different NGOs in the same round; one agent's UNION clause overwrites the other's.
- **Stale assumptions** — agent resumes work assuming convention X is current, but the other agent shipped convention Y in the meantime.
- **Hidden dependencies** — agent A's PLAN secretly relies on a column agent B is about to drop.
- **Duplicated work** — both agents start writing `src/lib/supply.ts` extensions for similar reasons.

---

## Current session

The currently active coordination thread lives at [`talk.md`](talk.md).
