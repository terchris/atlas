---
mdx:
  format: md
title: Backlog — index
sidebar_label: Backlog (index)
sidebar_position: 0
---

# Backlog — index

What each open backlog item **is**, in one line. [`1PRIORITY.md`](1PRIORITY.md) says what to
**do next**. INVESTIGATEs stay here until every child PLAN ships; PLANs live in `active/` while
in progress.

| Item | What it does | Priority |
|---|---|---|
| [INVESTIGATE-atlas-data-as-deployable-application](INVESTIGATE-atlas-data-as-deployable-application.md) | Make atlas-data one installable UIS application that gathers the data and serves it queryable, so the frontend is a forkable example rather than a requirement | Tier 1 |
| [INVESTIGATE-ingest-freshness-visibility](INVESTIGATE-ingest-freshness-visibility.md) | A source can stop refreshing while every downstream signal stays green — decide what asserts freshness, where, and how sources with no cadence avoid alarming | Tier 1 |
| [PLAN-region-code-classification](PLAN-region-code-classification.md) | Classify SSB region codes against KLASS by date instead of failing an FK — the 17 standing warnings, where no code family is universally safe to exclude | Tier 2 |
| [PLAN-catalogue-api-v1-ordering](PLAN-catalogue-api-v1-ordering.md) | `/data` cannot see `api_v1` views added in the same cycle — the catalogue is built before the views are created, so a fresh database lists zero of them | Tier 2 |
| [PLAN-ingest-retry-budget](PLAN-ingest-retry-budget.md) | A short `Retry-After` overrides the backoff ladder and collapses the retry budget to ~4s; unify the three HTTP clients | Tier 1 |
| [PLAN-ingest-ci-gates](PLAN-ingest-ci-gates.md) | Phases 1–2 shipped; only the C12 move to Node 24 remains | Tier 1 |
| [INVESTIGATE-ssb-api-version-dependency](INVESTIGATE-ssb-api-version-dependency.md) | All SSB ingest depends on a beta API surface; decide stay, fall back, or move | Tier 1 |
| [INVESTIGATE-semantic-foundation-before-expansion](INVESTIGATE-semantic-foundation-before-expansion.md) | Decides the concept-catalogue format; freezes NGO-supply expansion until resolved | Tier 1 |
| [INVESTIGATE-mart-meta-dimensions-cardinality](INVESTIGATE-mart-meta-dimensions-cardinality.md) | Cardinality and example values so the catalogue can show what a column contains | Tier 1 |
| [INVESTIGATE-felles-datakatalog-classification](INVESTIGATE-felles-datakatalog-classification.md) | LOS-vocabulary mapping for one-line interop with data.norge.no | Tier 1 |
| [INVESTIGATE-transform-job-decomposition](INVESTIGATE-transform-job-decomposition.md) | Layer-splitting and a CI plan-size budget; parked pending the declarative-automation direction | Tier 2 |
| [INVESTIGATE-reports-and-indicators-from-catalogue](INVESTIGATE-reports-and-indicators-from-catalogue.md) | The grammar for deciding which sources to ingest next | Tier 2 |
| [INVESTIGATE-multi-ngo-supply-model-extensions](INVESTIGATE-multi-ngo-supply-model-extensions.md) | Small schema change that unblocks two deferred supply-side investigations | Tier 2 |
| [INVESTIGATE-developer-docs-surface](INVESTIGATE-developer-docs-surface.md) | The shape of external developer docs, before external developers arrive | Tier 2 |
| [INVESTIGATE-data-freshness-surface](INVESTIGATE-data-freshness-surface.md) | Reader-facing freshness — distinct from the operator-facing item above | Tier 2 |
| [INVESTIGATE-indicators-schema-coverage](INVESTIGATE-indicators-schema-coverage.md) | 249 of ~566 marts columns lack descriptions; hand-fill, generate, or punt | Tier 2 |
| [INVESTIGATE-sources-catalog-at-scale](INVESTIGATE-sources-catalog-at-scale.md) | How the catalogue behaves as the source count grows | Tier 2 |
| [PLAN-008-developer-discovery-surface](PLAN-008-developer-discovery-surface.md) | Scalar spec viewer, lineage panel, dbt docs hosting — ready to execute | Tier 2 |
| [PLAN-indicators-schema-generator](PLAN-indicators-schema-generator.md) | Generate indicator column docs from manifest dimensions | Tier 2 |
| [INVESTIGATE-new-norwegian-public-sources](INVESTIGATE-new-norwegian-public-sources.md) | The next tranche of public sources; waits on the report grammar | Tier 3 |
| [INVESTIGATE-supply-frontend-display](INVESTIGATE-supply-frontend-display.md) | Supply-side URL structure and viewing layers; waits on the schema change | Tier 3 |
| [INVESTIGATE-folkehjelp-supply](INVESTIGATE-folkehjelp-supply.md) | Second-NGO ingest that validates the supply schema | Tier 3 |
| [INVESTIGATE-data-discovery-surface](INVESTIGATE-data-discovery-surface.md) | Wider OpenMetadata adoption; the Atlas-native subset is PLAN-008 | Tier 3 |
| [INVESTIGATE-cloud-agent-source-onboarding](INVESTIGATE-cloud-agent-source-onboarding.md) | An agent that onboards sources; needs the source list first | Tier 3 |
| [INVESTIGATE-private-atlas-deployments](INVESTIGATE-private-atlas-deployments.md) | Per-tenant private deployments; needs a concrete first tenant | Tier 3 |
| [INVESTIGATE-deployment-pipeline](INVESTIGATE-deployment-pipeline.md) | CI/CD shape; premise may already be answered by the shipped deployment | Tier 3 |
| [INVESTIGATE-ssb-pseudo-regions](INVESTIGATE-ssb-pseudo-regions.md) | The 17 known WARNs; blocked on whether Atlas covers Svalbard | Blocked (Terje) |
| [PLAN-redcross-branches-private-input](PLAN-redcross-branches-private-input.md) | Red Cross branch ingest; parked on an API credential | Blocked (Terje) |
| [INVESTIGATE-ngo-events-and-minisites](INVESTIGATE-ngo-events-and-minisites.md) | Parked idea; re-evaluate once a second NGO is in flight | Tier 4 |
| [INVESTIGATE-tag-indicators-sdg-icnpo](INVESTIGATE-tag-indicators-sdg-icnpo.md) | SDG/ICNPO tagging; may be absorbed by the semantic foundation | Tier 4 |
| [INVESTIGATE-customer-frontend-data-display](INVESTIGATE-customer-frontend-data-display.md) | Recommendation accepted and PLAN-007 shipped; no fresh work needed | Closed |
