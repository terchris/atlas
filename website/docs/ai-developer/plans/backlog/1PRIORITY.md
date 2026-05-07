# INVESTIGATE backlog — priority view

**Purpose**: triage tool, not a roadmap. Decides *what to investigate next* — not *what to build next*. The 17 INVESTIGATE files in this folder were written at different times for different reasons; this doc separates the ones ready to be done from the ones that should wait, and orders the ready ones by what they unblock.

**Last updated**: 2026-05-07. Re-rank whenever an INVESTIGATE moves to `completed/` or a new one lands.

**How to read the tiers**: tier order is the order to *start* the investigation, not the order to *finish*. Tier 1 means "next on deck"; Tier 4 means "don't open this yet — wait for prereqs or product clarity."

---

## Tier 1 — do next (load-bearing or unblocks active work)

| # | Investigation | Effort | Why this tier |
|---|---|---|---|
| 1 | [semantic-foundation-before-expansion](INVESTIGATE-semantic-foundation-before-expansion.md) | L | Decides concept-catalogue format (dbt MCP / YAML generator / dbt Semantic Layer). Explicitly freezes NGO-supply expansion until resolved — i.e. blocks 4 other INVESTIGATEs (data-discovery, supply-frontend-display, folkehjelp, multi-ngo-extensions) from going past their own boundaries. Highest unblocking ratio. |
| 2 | [mart-meta-dimensions-cardinality](INVESTIGATE-mart-meta-dimensions-cardinality.md) | M | Directly feeds PLAN-007 phase 4 (the active customer-frontend rewrite) — the catalogue UX needs cardinality + example values to render "what each column actually contains". Investigation gap is small; ship-side gap is real. |
| 3 | [felles-datakatalog-classification](INVESTIGATE-felles-datakatalog-classification.md) | S | Already half-shipped (`eu_theme:` namespace landed in PLAN-007 phase 2.10). Closing this out is a few hours of LOS-vocabulary mapping work and gives Atlas one-line interop with data.norge.no — high payoff for the effort. |

## Tier 2 — do after Tier 1 (independent, ready, valuable)

| # | Investigation | Effort | Why this tier |
|---|---|---|---|
| 4 | [reports-and-indicators-from-catalogue](INVESTIGATE-reports-and-indicators-from-catalogue.md) | XL | Substrate for prioritising new sources. Without it, "what to ingest next" is gut feel. Big effort, but defines the grammar Atlas's data side aims at. Begin once Tier 1 settles the catalogue shape. |
| 5 | [multi-ngo-supply-model-extensions](INVESTIGATE-multi-ngo-supply-model-extensions.md) | M | Small schema change (`dim_chapter.source_url`, `chapter_subtype`, `chapter_kommune_coverage`) that unblocks both supply-frontend-display and folkehjelp-supply. Cheap; high downstream payoff. |
| 6 | [developer-docs-surface](INVESTIGATE-developer-docs-surface.md) | M | Once PLAN-007 lands and `marts.*` + `raw.*` are publicly queryable, external developers will arrive without docs. Investigate the shape of `developer-atlas.helpers.no` before users land, not after. |
| 7 | [data-freshness-surface](INVESTIGATE-data-freshness-surface.md) | M | Catalogue UX gap: non-technical personas can't tell "is this current?". Independent of other tiers; ships value to the customer-frontend on its own. |

## Tier 3 — defer until prereqs ship

These have known prerequisites that are still open. Don't open them yet — the prereq's outcome materially changes the investigation's scope.

| # | Investigation | Waits on | Why defer |
|---|---|---|---|
| 8 | [new-norwegian-public-sources](INVESTIGATE-new-norwegian-public-sources.md) | reports-and-indicators-from-catalogue (Tier 2) | The 26-source pick is much cheaper once the report grammar tells us *what gaps to fill*. Sequencing this first risks ingesting sources we then deprioritise. |
| 9 | [supply-frontend-display](INVESTIGATE-supply-frontend-display.md) | multi-ngo-supply-model-extensions (Tier 2) | URL structure and viewing layers depend on the schema shape. Investigating UX before schema = rework. |
| 10 | [folkehjelp-supply](INVESTIGATE-folkehjelp-supply.md) | multi-ngo-supply-model-extensions (Tier 2) | Same reason — schema decisions land first, then the second-NGO ingest validates them. |
| 11 | [data-discovery-surface](INVESTIGATE-data-discovery-surface.md) — **partially-spawned 2026-05-07** | semantic-foundation-before-expansion (Tier 1) for the OpenMetadata path; **PLAN-008** for the Atlas-native near-term path is ready to execute now | The Atlas-native subset (Scalar spec viewer + lineage panel + dbt docs hosting) is ready to ship via [PLAN-008-developer-discovery-surface.md](PLAN-008-developer-discovery-surface.md). The wider OpenMetadata adoption stays deferred per the original Tier-3 reason. |
| 12 | [cloud-agent-source-onboarding](INVESTIGATE-cloud-agent-source-onboarding.md) | new-norwegian-public-sources | "Autonomous agent that onboards sources" needs a clear list of *what* sources to onboard before the orchestration design is meaningful. |
| 13 | [private-atlas-deployments](INVESTIGATE-private-atlas-deployments.md) | product clarity (which NGO drives this?) | L-effort and architecturally significant. Worth doing only when there's a concrete first private tenant to design against; speculative architecture rots fast. |
| 14 | [deployment-pipeline](INVESTIGATE-deployment-pipeline.md) | UIS / dagster decision (external) | External-blocked. The CI/CD shape depends on what UIS lands; investigating now risks designing against the wrong substrate. Revisit when UIS signals dagster direction. |

## Tier 4 — ideas, not investigations

These are sketches / parking-lot entries, not concrete research targets. Don't open them as INVESTIGATEs — let the surrounding context resolve, then either promote to a real INVESTIGATE or delete.

| # | Item | What to do |
|---|---|---|
| 15 | [ngo-events-and-minisites](INVESTIGATE-ngo-events-and-minisites.md) | Explicitly parked in the file itself. Re-evaluate after Folkehjelp ships and a second NGO is in flight — by then the actual gap will be visible, not speculated. |
| 16 | [tag-indicators-sdg-icnpo](INVESTIGATE-tag-indicators-sdg-icnpo.md) | Overlaps with semantic-foundation's ICNPO tagging on the supply side. Hold until Tier 1 #1 resolves; the answer there may absorb this entirely. |

## Tier 0 — already in flight

| # | Investigation | State |
|---|---|---|
| — | [customer-frontend-data-display](INVESTIGATE-customer-frontend-data-display.md) | Recommendation accepted; child PLAN-007 active in `../active/`. No fresh investigation work needed. |

---

## Cross-cutting notes

- **Two natural workstreams**: data-platform (Tier 1 #1, Tier 2 #4–5) and frontend/UX (Tier 1 #2, Tier 2 #6–7). They can run in parallel — different files, different agents, no merge contention.
- **Supply-side cluster**: #5 → (#9, #10) is a tight chain. Resolving #5 unblocks two Tier-3 investigations together.
- **Catalogue cluster**: #1 → (#11, #15 #16, plus parts of #4) is the other tight chain. Resolving #1 collapses the most uncertainty.
- **External blocker**: only #14 (deployment-pipeline) waits on someone outside Atlas. The other 16 are agency-of-the-team-only.
- **Idea-vs-investigation ratio**: 2 of 17 are still ideas (Tier 4). Healthy — most of the backlog is concrete work, not brainstorm residue.

## How to use this doc

1. Pick the top unstarted item from Tier 1; if all of Tier 1 is in flight or done, move to Tier 2.
2. When starting an INVESTIGATE, leave it in this folder (per the lifecycle rule — INVESTIGATEs stay in `backlog/` until every child PLAN ships). Update its `Status:` line to note the work is in flight.
3. When an INVESTIGATE produces a recommendation and a child PLAN is drafted, update this doc: strike the row, note the PLAN it spawned.
4. When a Tier-3 prereq lands, promote its dependents up to Tier 2 in the next refresh.
5. Re-rank quarterly or after every 3 INVESTIGATEs ship — whichever comes first.
