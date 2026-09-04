# Backlog — priority view

**Purpose**: triage tool, not a roadmap. Orders *what to work on next* by what it unblocks. Covers
both PLANs and INVESTIGATEs — an earlier version of this doc covered only INVESTIGATEs, which left
the whole data-platform workstream invisible here for months.

**Last updated**: 2026-08-30. Re-rank whenever something moves to `completed/`, a new item lands,
or a blocker clears.

**State**: `active/` is **empty**, and that is honest — PLAN-007 and the asgard deployment plan both
closed. Everything below is backlog or parked.

**How to read the tiers**: tier order is the order to *start*, not to *finish*. Tier 1 is next on
deck; Tier 4 means "don't open this yet".

---

## 🔴 Waiting on Terje — not startable by atlas

These are decisions, not work. Listed first because they are the largest source of stalled items,
and three of the four have been open for days.

| What | File | Since | Why it blocks |
|---|---|---|---|
| **The Svalbard question** — does Atlas *cover* Svalbard, or merely represent it? | [INVESTIGATE-ssb-pseudo-regions](INVESTIGATE-ssb-pseudo-regions.md) | 2026-08-25 | Decides whether pseudo-region data flows to marts and the map. **Neither suggested fix works as posed** until this is answered. Source of the 17 tolerated WARNs. |
| **F1 redcross data delivery** — blocked on an APIM credential | [PLAN-redcross-branches-private-input](PLAN-redcross-branches-private-input.md) | 2026-08-25 | Design settled; the blocker changed shape from a static dump to an API credential, which may reopen the design. Keeps 3 of 13 views empty. |
| **Phase 5 frontend** | asgard deployment plan (in `terchris/home`) | 2026-08-25 | Held at Terje's request while he reads the code himself. |
| **Public-docs topology** — internal detail in a public repo | raised in `terchris/home` talk | 2026-08-26 | `asgard-performance-baseline.md` is world-readable and names infrastructure. Proposed a platform-facts-to-home split. **Still unanswered.** Recurs every time a doc mentions infrastructure. |

---

## 🔴 Fleet-wide constraint, recorded 2026-09-05

**No one can observe asgard.** `kubectl` is absent on tecMacDev and on the ops host; the ops host
has the kubeconfig but no client; huginn runs inside the cluster but is excluded pending login.
The tester's green Dagster verification of 2026-09-04 describes **its own cluster**, not ours.
**asgard's Dagster is unverified since 2026-08-30.** The public API hostnames also do not resolve
from this machine, so the data cannot be probed from outside either.

This is not an Atlas defect and not something Atlas can fix. It is recorded here because it
bounds what any item below can claim: **no plan may treat "verified" as meaning verified on the
instance that serves data**, unless it names who ran the check and where.

## Tier 1 — do next

### Data platform (from the 2026-08-30 Sunday tick)

| # | Item | Effort | Why this tier |
|---|---|---|---|
| 1 | [INVESTIGATE-ingest-freshness-visibility](INVESTIGATE-ingest-freshness-visibility.md) | M | 🔴 **Highest.** On 2026-08-30, 15 of 41 sources silently did not refresh and *every signal stayed green* — the check suite returned identical numbers. We cannot currently tell "refreshed and unchanged" from "never refreshed". Monitoring that cannot distinguish those is not monitoring. |
| 2 | [PLAN-ingest-retry-budget](PLAN-ingest-retry-budget.md) | S-M | A short `Retry-After` **overrides** the backoff ladder and collapses the retry budget to ~4s; two of three HTTP clients ignore `Retry-After` entirely. Decides whether the next weekly tick survives a wobble. Does **not** help against a multi-hour outage. |
| 3 | [PLAN-ingest-ci-gates](PLAN-ingest-ci-gates.md) phase 3 | S | Phases 1–2 shipped 2026-08-25. Only the C12 move to Node 24 remains, and it needs a real Node 24 to validate rather than an assumption. |
| 4 | [INVESTIGATE-ssb-api-version-dependency](INVESTIGATE-ssb-api-version-dependency.md) | S-M | All SSB ingest depends on a **beta** API surface that was 503 for hours on 2026-08-30. `/v2/` has now shipped and serves data identical to `/v2-beta/`, so moving is a durable-reliability improvement, not a fix. ⚠️ A 2026-09-05 claim that beta served stale data was wrong and has been retracted. |

### Semantics and catalogue

| # | Item | Effort | Why this tier |
|---|---|---|---|
| 5 | [INVESTIGATE-semantic-foundation-before-expansion](INVESTIGATE-semantic-foundation-before-expansion.md) | L | Highest unblocking ratio in the doc. Decides the concept-catalogue format and explicitly freezes NGO-supply expansion until resolved — blocks 4 other INVESTIGATEs from passing their own boundaries. |
| 6 | [INVESTIGATE-mart-meta-dimensions-cardinality](INVESTIGATE-mart-meta-dimensions-cardinality.md) | M | Catalogue UX needs cardinality + example values to render "what each column actually contains". Small investigation gap, real ship-side gap. ⚠️ Its original justification was feeding PLAN-007 phase 4 — **PLAN-007 has since shipped**, so re-check that the need survives before starting. |
| 7 | [INVESTIGATE-felles-datakatalog-classification](INVESTIGATE-felles-datakatalog-classification.md) | S | Already half-shipped (`eu_theme:` landed in PLAN-007 phase 2.10). A few hours of LOS-vocabulary mapping buys one-line interop with data.norge.no. |

## Tier 2 — after Tier 1 (independent, ready, valuable)

| # | Item | Effort | Why this tier |
|---|---|---|---|
| 8 | [INVESTIGATE-transform-job-decomposition](INVESTIGATE-transform-job-decomposition.md) | M | Re-scoped 2026-08-24. The tactical unblock shipped; layer-splitting and the CI plan-size budget (~400) are **deliberately parked** pending the declarative-automation direction. Reopen when that direction settles — the durable fix, not the bump. |
| 9 | [INVESTIGATE-reports-and-indicators-from-catalogue](INVESTIGATE-reports-and-indicators-from-catalogue.md) | XL | Substrate for prioritising new sources; without it "what to ingest next" is gut feel. Begin once Tier 1's catalogue shape settles. |
| 10 | [INVESTIGATE-multi-ngo-supply-model-extensions](INVESTIGATE-multi-ngo-supply-model-extensions.md) | M | Small schema change that unblocks two Tier-3 items together. Cheap, high downstream payoff. |
| 11 | [INVESTIGATE-developer-docs-surface](INVESTIGATE-developer-docs-surface.md) | M | External developers will arrive at a public API without docs. Investigate the shape before users land, not after. |
| 12 | [INVESTIGATE-data-freshness-surface](INVESTIGATE-data-freshness-surface.md) | M | **Reader-facing** freshness — deliberately distinct from #1, which is operator-facing. The two may share a `max(loaded_at)` per-source model; keep them separate. |
| 13 | [INVESTIGATE-indicators-schema-coverage](INVESTIGATE-indicators-schema-coverage.md) | S-M | 249 of ~566 marts columns lack descriptions (25 % coverage), mostly `indicators__*` pass-throughs. Settles hand-fill vs generate-from-manifest vs punt. Related: [PLAN-indicators-schema-generator](PLAN-indicators-schema-generator.md). |
| 14 | [INVESTIGATE-sources-catalog-at-scale](INVESTIGATE-sources-catalog-at-scale.md) | M | Was missing from this doc entirely. Catalogue behaviour as source count grows. |
| 15 | [PLAN-008-developer-discovery-surface](PLAN-008-developer-discovery-surface.md) | M | Ready to execute — the Atlas-native subset of data-discovery (Scalar spec viewer, lineage panel, dbt docs hosting). |

## Tier 3 — defer until prereqs ship

| # | Item | Waits on | Why defer |
|---|---|---|---|
| 16 | [INVESTIGATE-new-norwegian-public-sources](INVESTIGATE-new-norwegian-public-sources.md) | #9 | The 26-source pick is far cheaper once the report grammar says which gaps to fill. |
| 17 | [INVESTIGATE-supply-frontend-display](INVESTIGATE-supply-frontend-display.md) | #10 | URL structure and viewing layers depend on schema shape. UX before schema = rework. |
| 18 | [INVESTIGATE-folkehjelp-supply](INVESTIGATE-folkehjelp-supply.md) | #10 | Schema lands first; the second-NGO ingest then validates it. |
| 19 | [INVESTIGATE-data-discovery-surface](INVESTIGATE-data-discovery-surface.md) | #5 for the OpenMetadata path | The Atlas-native near-term path is split out as #15 and is ready now. Wider OpenMetadata adoption stays deferred. |
| 20 | [INVESTIGATE-cloud-agent-source-onboarding](INVESTIGATE-cloud-agent-source-onboarding.md) | #16 | An agent that onboards sources needs a list of *which* sources first. |
| 21 | [INVESTIGATE-private-atlas-deployments](INVESTIGATE-private-atlas-deployments.md) | product clarity | Worth doing only against a concrete first private tenant. Speculative architecture rots fast. |
| 22 | [INVESTIGATE-deployment-pipeline](INVESTIGATE-deployment-pipeline.md) | UIS/dagster direction (external) | ⚠️ **Partly overtaken**: the asgard deployment shipped and dagster is live with automation running. Re-read before opening — its premise may already be answered. |

## Tier 4 — ideas, not investigations

| # | Item | What to do |
|---|---|---|
| 23 | [INVESTIGATE-ngo-events-and-minisites](INVESTIGATE-ngo-events-and-minisites.md) | Parked in the file itself. Re-evaluate once a second NGO is in flight and the gap is visible rather than speculated. |
| 24 | [INVESTIGATE-tag-indicators-sdg-icnpo](INVESTIGATE-tag-indicators-sdg-icnpo.md) | Overlaps #5's ICNPO tagging. Hold — #5's answer may absorb it entirely. |

## Recently closed

- **PLAN-007** (customer-frontend data display) — shipped; `INVESTIGATE-customer-frontend-data-display` needs no further investigation work.
- **The asgard deployment** — Phase 2 complete (2.3: 649 checks, 629 dbt PASS, 17 known WARNs, 10/13 views, 0 orphans) and Phase 3.2's concurrency bound verified at 4 against a real weekly fan-out on 2026-08-30. ⚠️ The observed weekly cycle **failed** (15 SSB sources, HTTP 429), so the *bound* is proven but a clean end-to-end weekly cycle has not yet been observed.

---

## Cross-cutting notes

- **The data-platform cluster (#1–#4) is new and currently the most urgent**, all of it from one
  night's evidence. #1 is the one with teeth: #2 and #4 are about *preventing* a missed refresh,
  #1 is about *noticing* one.
- **Two long-standing workstreams** still run in parallel: semantics/catalogue (#5, #9, #10) and
  frontend/UX (#6, #11, #12). Different files, different agents, no merge contention.
- **Supply-side chain**: #10 → (#17, #18). **Catalogue chain**: #5 → (#19, #23, #24, parts of #9).
- **External blockers**: only #22, and it may already be resolved by the deployment shipping.
- **Terje's queue is the real bottleneck**, not the backlog — four items, three of them ≥4 days old.

## How to use this doc

1. Take the top unstarted Tier-1 item; if Tier 1 is in flight or done, drop to Tier 2.
2. INVESTIGATEs stay in `backlog/` until every child PLAN ships — update their `Status:` line
   rather than moving the file.
3. When an INVESTIGATE spawns a PLAN, strike the row here and note the PLAN.
4. When a Tier-3 prereq lands, promote its dependents at the next refresh.
5. Re-rank after every 3 items ship, or whenever a blocker clears.
