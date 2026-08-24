# PLAN: decide what `redcross-branches` does when its private input is absent

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — needs a decision from Terje before implementation

**Goal**: Stop `redcross-branches` hard-failing in the cluster, without silently publishing three permanently empty API views.

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
