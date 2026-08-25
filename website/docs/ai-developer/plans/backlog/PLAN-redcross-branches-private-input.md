# PLAN: decide what `redcross-branches` does when its private input is absent

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — **decision made 2026-08-25 (option 1)**; blocked only on receiving the file

**Goal**: Stop `redcross-branches` hard-failing in the cluster, without silently publishing three permanently empty API views.

> ## ✅ Decision (Terje, via ops, 2026-08-25)
>
> **The Red Cross branches/organisations data is free, and Terje is its owner at Red
> Cross. `redcross-branches` is cleared for publication on public deployments.**
>
> This resolves the licensing/consent question that made option 1 a decision rather
> than a task. `frr` is unaffected and stays exactly as it is — Terje reviews it
> personally before it ever publishes, and its deliberately-empty-on-public behaviour
> remains the contract.
>
> **How** is Atlas's call. Recorded below.

**Last Updated**: 2026-08-25

**Origin**: F1 from the first full 41-source live run (`~/home/ai-developer/for-ops-atlas-data-run.md`). 39/41 sources succeeded; this was one of the two failures, and three of the thirteen published views are empty solely because of it.

---

## Problem Summary

`redcross-branches` throws `ENOENT` in the cluster because it reads

```
atlas-private-data-repo/redcross/organisations/api-getOrganizations-output-21apr26.json
```

and that directory is gitignored and deliberately absent from the polyglot image.

## ⚠️ Why "give it the frr treatment" is the wrong fix

The obvious move is what `frr` got: treat a missing private directory as "no data", materialise zero rows, exit 0. **For this source that would be worse than the crash.**

The two cases are not alike:

| | `frr` | `redcross-branches` |
|---|---|---|
| What the private repo provides | *All* of its data, and it is **private by design** — the contract in `private_marts/sources.yml` says public deployments hold an empty table | Its **primary input**, a Red Cross API dump, feeding data intended to be **public** |
| Zero rows on a public deployment | Correct, expected, documented | A silent, permanent outage of three public API views |

Degrading here would convert a loud failure into a quiet one — and the loud one is the correct signal, because something *is* missing that should not be. Atlas already has one alarm that can never fire (frr's absent freshness policy, deliberately); it does not need a second that fires never *and* hides three empty views.

## The actual decision (Terje's, not the implementer's)

1. **Ship the dump into the image.** Makes the source work in-cluster and fills the three views. The dump is a static export of a Red Cross internal API, gitignored for a reason — so this is a licensing/consent question about publishing that data, not a technical one.
2. **Accept it as local-only, like `frr`, and say so.** Remove it from cluster automation, mark the three views as expected-empty in the catalogue, and document that Red Cross chapter data needs the private repo. Honest, and cheap.
3. **Replace the input** with something public — scrape or request the chapter list from a public Red Cross source. Most work, best outcome, needs its own investigation.

**Until it is decided, leave the hard failure in place.** A failing source in the run report is visible; an empty view that nobody notices is not.

## Tasks (after the decision)

- [ ] 1.1 Terje picks 1, 2 or 3.
- [ ] 1.2 Implement, and either way make the *reason* legible at the failure site — the current `ENOENT` says nothing about the private repo, whereas `frr`'s equivalent logs `private_data_root_absent`.
- [ ] 1.3 If option 2, mark the three affected views as expected-empty rather than leaving them looking broken.

## Out of Scope

- `frr`'s behaviour, which is correct and contractual.


---

## Design decision (2026-08-25): commit the dump into the repo, alongside the source

**Chosen**: the dump becomes tracked repo data under `atlas-data/ingest/src/`, and the
source reads it from there. Nothing else changes.

**Why this and not the alternatives:**

- It is **the pattern Atlas already uses**. `frr` reads
  `src/seed-sources/atlas-ngo-landscape/landscape.json`, which is committed and ships
  in the image today. `COPY ingest/src` already exists in the Dockerfile, so this needs
  **no Dockerfile change and no new mechanism** — and this thread has just spent four
  rounds on what happens when a file is expected somewhere the image does not have it.
- **Fetching at runtime** would add a network dependency, a hosting responsibility and
  a fresh failure mode, for data that is a static dated snapshot. Wrong shape.
- **A cluster volume mount** reintroduces exactly the coupling being removed.
- **A Dockerfile `COPY` from the private repo** is impossible: it is outside the build
  context.

### ⚠️ One consequence worth designing for now, not discovering later

A committed snapshot **ages silently**. `redcross-branches` carries a `FreshnessPolicy`,
but that measures *when the ingest last ran*, not *how old the underlying data is* — so
a two-year-old dump re-ingested nightly would report perfectly fresh. That is precisely
the "alarm that is always green" failure this repo has argued against three times.

So the implementation should record the **snapshot date** (the filename already carries
`21apr26`) as `upstreamUpdatedAt` on the materialisation, which the Pipes metadata path
already supports. Then the age of the *data* is visible, not just the age of the run.

### 🚧 Blocked on one thing: the file is not on this machine

`atlas-private-data-repo/` here contains only the committed `sample-ngo/` fixtures. The
real `redcross/organisations/api-getOrganizations-output-21apr26.json` is gitignored and
absent, and the `sample-ngo/orgunits/` placeholder is an unrelated shape (4 fields, for a
different ingest that is not yet wired).

**Needed from whoever holds the private repo**: that JSON file. Requested via
`~/home/ai-developer/for-ops-atlas-redcross-dump-request.md`.

Two things will be checked on receipt, before it is committed:
1. **Size.** If it is large enough to be unpleasant in git, a compressed or reshaped form is better than a raw dump — decided on sight rather than guessed at.
2. **Contents.** "Cleared for publication" covers the branches/organisations dataset. If the dump also carries per-person contact details, that is worth raising with Terje before it goes into a public repo — the clearance was for the dataset, and a due-diligence read costs nothing.

## Tasks

- [x] 1.1 Terje picks 1, 2 or 3 → **option 1**, cleared for publication.
- [ ] 1.2 Obtain the dump (blocked; requested).
- [ ] 1.3 Check size and contents on receipt.
- [ ] 1.4 Commit under `atlas-data/ingest/src/`, repoint `DUMP_PATH`, drop the private-repo dependency.
- [ ] 1.5 Report the snapshot date as `upstreamUpdatedAt` so a stale dump cannot look fresh.
- [ ] 1.6 Document the refresh path — who re-exports it, and how a contributor would know it is due.
- [ ] 1.7 Verify locally: ingest runs with no private repo present; the 3 dependent views populate.

## Timing

Phase 2.2 of `PLAN-atlas-asgard-001-deployment` is a **fresh production ingest**. If this
lands first, production starts at **13/13 views populated** rather than 10/13. It is
therefore worth doing before that ingest, but it is not worth *delaying* the ingest for —
re-running one source later is cheap, and the pipeline is designed for exactly that.
