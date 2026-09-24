# Backlog — priority view

**Purpose**: triage tool, not a roadmap. Orders *what to work on next* by what it unblocks. Covers
both PLANs and INVESTIGATEs — an earlier version of this doc covered only INVESTIGATEs, which left
the whole data-platform workstream invisible here for months.

**Last updated**: 2026-09-23. Re-rank whenever something moves to `completed/`, a new item lands,
or a blocker clears.

**State**: `active/` is **empty**, and that is honest — PLAN-007 and the asgard deployment plan both
closed. Everything below is backlog or parked.

**How to read the tiers**: tier order is the order to *start*, not to *finish*. Tier 1 is next on
deck; Tier 4 means "don't open this yet".

---

## 🔴 Waiting on Terje — not startable by atlas

These are decisions, not work. Listed first because they are the largest source of stalled items,
and several have been open for days. The remainder of the UIS-installability batch does not block Tier 1.

✅ **Two of these were answered on 2026-09-09, and how they got answered is the lesson.** The
`schemas:` posture (**A — the public API serves `api_v1` only**, Terje, urb-agents #350) and TPL-Q3
(**an application ships its install definition inside its published image**; the catalogue holds an
immutable pin and the pin PR is the review — #354, now `PLAN-templates-002`). Both had sat for days
looking owned because two agents each recorded "waiting on Terje" in a status file. **A status file
is not a queue**; only an `auth-required` hold reaches Terje's escalation. Filed as holds, both were
answered within hours.

| What | File | Since | Why it blocks |
|---|---|---|---|
| **The Svalbard question** — does Atlas *cover* Svalbard, or merely represent it? | [INVESTIGATE-ssb-pseudo-regions](INVESTIGATE-ssb-pseudo-regions.md) | 2026-08-25 | Decides whether pseudo-region data flows to marts and the map. **Neither suggested fix works as posed** until this is answered. Source of the 17 tolerated WARNs. |
| **F1 redcross data delivery** — blocked on an APIM credential | [PLAN-redcross-branches-private-input](PLAN-redcross-branches-private-input.md) | 2026-08-25 | Design settled; the blocker changed shape from a static dump to an API credential, which may reopen the design. Keeps 3 of 13 views empty. |
| **Phase 5 frontend** | asgard deployment plan (in `terchris/home`) | 2026-08-25 | Held at Terje's request while he reads the code himself. |
| 🔴 **Is GitOps the direction for UIS?** And should that investigation be opened? | [INVESTIGATE-atlas-as-a-uis-application](INVESTIGATE-atlas-as-a-uis-application.md) | 2026-09-07 | The discussion Terje asked for has happened and produced an answer for everything except this. UIS has **two deployment paths that do not meet** and Atlas straddles them. If GitOps is the direction, per-workload secrets become **prerequisites, not by-products**. The UIS maintainer declined to open a Tier 1 platform-direction investigation on one message without Terje in it. **Blocks nothing** — A proceeds regardless. |
| **Should imac's cluster start with its host?** | [INVESTIGATE-atlas-as-a-uis-application](INVESTIGATE-atlas-as-a-uis-application.md) | 2026-09-07 | The API **disappears silently on every reboot** and a frontend is about to be built against it. All cluster state survives; only the process does not. **One host setting, ~5 minutes** — Rancher Desktop autostart or k3s under systemd. Not platform work, queues behind nothing. |
| **NLOD attribution across everything Atlas publishes** | [INVESTIGATE-nlod-attribution](INVESTIGATE-nlod-attribution.md) | 2026-09-11 | Split out of the Brreg work at Terje's direction so it is not treated as Brreg-specific. Repo-wide: every upstream is NLOD and requires attribution. Machinery exists (`meta_sources` publishes licence and attribution); `seed-sources/brreg-enheter/` has no manifest at all. **Deliberately parked** — recorded so it is not lost, not being worked. |
| **Public-docs topology** — internal detail in a public repo | raised in `terchris/home` talk | 2026-08-26 | `asgard-performance-baseline.md` is world-readable and names infrastructure. Proposed a platform-facts-to-home split. **Still unanswered.** Recurs every time a doc mentions infrastructure. |
| 🔴 **Four decisions on the analytical surface** — publish Parquet at all ([Q1]), drop `doc` from responses ([Q4]), host on R2 ([Q5]), accept a prerelease `duckdb-wasm` tag ([Q8]) | [INVESTIGATE-parquet-duckdb-wasm-surface](INVESTIGATE-parquet-duckdb-wasm-surface.md) | 2026-09-23 | Decides whether Atlas gets a second, file-based query surface or stays single-surface. **Does not block the hardening half** — Option A (`db-max-rows`, `statement_timeout`, indexes) is correct regardless and needs no decision. [Q5] touches Terje's Cloudflare account, so it is his either way. |
| 🔴 **Does the public API stay pointed at imac?** | [INVESTIGATE-parquet-duckdb-wasm-surface](INVESTIGATE-parquet-duckdb-wasm-surface.md) [Q15] | 2026-09-23 | `api-atlas.urbalurba.com` is served from **imac (test)** today, while `PLAN-atlas-asgard-001` puts production on asgard against Odin pg and imac's charter is explicitly a place to try things *without* touching production. Inherited rather than chosen. Pairs with the reboot question two rows up — a public endpoint that vanishes on every reboot is the same decision seen from the other end. |

---

## 🔴 Fleet-wide constraint, recorded 2026-09-05

**No one can observe asgard.** `kubectl` is absent on tecMacDev and on the ops host; the ops host
has the kubeconfig but no client; huginn runs inside the cluster but is excluded pending login.
The tester's green Dagster verification of 2026-09-04 describes **its own cluster**, not ours.
**asgard's Dagster is unverified since 2026-08-30.** ~~The public API hostnames also do not resolve
from this machine, so the data cannot be probed from outside either.~~

✅ **The struck sentence is no longer true, corrected 2026-09-23.** `api-atlas.urbalurba.com`
resolves and answers from tecMacDev today, and was measured end to end — latency by query shape,
row counts, payload sizes, allowed methods and the Cloudflare edge configuration. See
[INVESTIGATE-parquet-duckdb-wasm-surface](INVESTIGATE-parquet-duckdb-wasm-surface.md). ⚠️ **The
rest of this constraint stands**: that hostname is served from **imac**, not asgard, so probing it
says nothing about asgard. The observability gap is unchanged.

This is not an Atlas defect and not something Atlas can fix. It is recorded here because it
bounds what any item below can claim: **no plan may treat "verified" as meaning verified on the
instance that serves data**, unless it names who ran the check and where.

## Tier 1 — do next

### Data platform (from the 2026-08-30 Sunday tick)

| # | Item | Effort | Why this tier |
|---|---|---|---|
| — | 🔴 **Brreg: all 1.17M organisations + automated updates** — [INVESTIGATE-all-brreg-organisations](INVESTIGATE-all-brreg-organisations.md) | L | **Decided by Terje 2026-09-11**: full Enhetsregisteret, no new public endpoint. Needs a PLAN. Architecture is settled — bulk snapshot + `/oppdateringer` change feed polled by `?oppdateringsid=`, append-only into `raw.*`, reconciled by a dbt incremental model. Two Brreg sources: Enhetsregisteret for the base, the dedicated Frivillighetsregisteret API to enrich the ~72,806 voluntary ones. ⚠️ **One question surfaced after the decision and needs Terje's confirmation**: Enhetsregisteret is two registers — `enheter` (1,174,098) and `underenheter` (862,903, own change feed). "Everything" was answered before that distinction was put to him. Recommendation in the file: enheter only in the first PLAN. |
| — | 🔴 **`lands-with.sh` has been wrong in BOTH directions, so no safety margin applies to it** | `atlas-data/uis/lands-with.sh` | 2026-09-24 | It under-reported `fhi-innvandrere` (urb-agents #1349) — a source that deployed silent — and on 2026-09-24 it over-reported twice in one range: it demanded a re-fetch of a **deleted** source, because it reads a path diff and cannot tell a deletion from a modification, and it demanded `brreg_bootstrap` for `brreg-enheter-alle` whose entire diff was **one metadata line** (`suggested_joins: - frr`). 🔴 **Acting on the second would have re-pulled 1.17M rows.** ops-dev's framing is the reason this is not cosmetic: *a tool that can be wrong in both directions is not one you can apply a safety margin to* — and over-reporting **re-enables** the under-reporting case, because a tool people learn to skim gets skimmed when it is right. ⚠️ ops-dev has now verified the file list by hand twice rather than trust it. **Fix: treat a path that no longer exists as a removal, and ignore manifest-only changes that touch no fetch logic.** Not done during the deploy run it was found in, deliberately — a deploy is not the place to repair the thing that describes deploys. |
| — | 🔴 **`navn` is unindexed, so name search and name sort scan 1.17M rows** — [INVESTIGATE-parquet-duckdb-wasm-surface](INVESTIGATE-parquet-duckdb-wasm-surface.md) | S (hardening) / M (Parquet) | **New 2026-09-23, measured from tecMacDev against the live host.** `order=navn.desc` takes 5.2–7.0 s, and an `ilike` matching nothing takes 8.96 s; concurrent scans saturate the origin (figures on urb-agents #1438, not here). ⚠️ **First diagnosis said "no indexes on `marts.*`" and was wrong** — it came from a case-sensitive `grep "CREATE INDEX"` that could see neither lowercase SQL nor dbt's declarative `indexes=` config. `dim_brreg_enhet` has **seven** indexes; an indexed lookup matching nothing returns in 0.32 s against the same query's 8.96 s unindexed. The real gap is **one column, `navn`** — btree plus `pg_trgm` GIN, added the way the existing seven were. Cloudflare reports **0.01% cached** (14 kB of 108 MB in 24 h); there are no Cache Rules and PostgREST sends no `Cache-Control`/`ETag`. ✅ **Split it**: the hardening half (`db-max-rows`, `statement_timeout`, indexes) needs **no decision from Terje** and removes a collapse mode anyone can trigger from a browser address bar — do that first. The Parquet half is the four decisions in the Terje table. 🔵 Directly downstream of the Brreg row above: the 1.17M decision is what makes this load-bearing. |
| 0 | [INVESTIGATE-atlas-as-a-uis-application](INVESTIGATE-atlas-as-a-uis-application.md) | L | 🔴 **The product's target shape (Terje, 2026-09-06).** Install Atlas on UIS with one command, using the Dagster/PostgreSQL/PostgREST it already ships and the config system it already has. Acceptance is stricter than anything before it: **the API answers from tecMacDev over the LAN**, because the frontend will be built against it from there. Two machines, one network — no public domain, no tunnel. Needs tor-agent — the platform may need an `Application` type it does not have. |
| 0 | [INVESTIGATE-atlas-data-as-deployable-application](INVESTIGATE-atlas-data-as-deployable-application.md) | L | 🔴 **The product's target shape (Terje, 2026-09-05).** One installable application that gathers the data and makes it queryable, with the frontend as a forkable example. The container already exists and runs on UIS; what is missing is the installer, the declared query surface, and a repo split blocked by a build-time coupling from the docs site. |
| 1 | [INVESTIGATE-ingest-freshness-visibility](INVESTIGATE-ingest-freshness-visibility.md) | M | 🔴 **Highest.** On 2026-08-30, 15 of 41 sources silently did not refresh and *every signal stayed green* — the check suite returned identical numbers. We cannot currently tell "refreshed and unchanged" from "never refreshed". Monitoring that cannot distinguish those is not monitoring. **The in-suite half now ships and has been seen to fail on-cluster (FAIL 28 → 24 → 2).** 2026-09-08: its single 8-day threshold was wrong for the two monthly-polled KLASS sources and was measured to go falsely red from 09-13 until 10-01 — thresholds now derive from a declared `meta.ingest_cadence`, and `brreg-enheter` became a Dagster asset rather than being exempted. The remaining gap is unchanged and is what this item is still open for: **if the daemon stalls, nothing runs, so nothing reports.** That needs a reader outside the pipeline. |
| 1b | [INVESTIGATE-failed-transform-leaves-the-api-dark](INVESTIGATE-failed-transform-leaves-the-api-dark.md) | M | 🔴 **Same family as #1, and filed 2026-09-21 after being promised three times.** When a model fails, `api_v1_surface` is skipped, so the wrappers are never re-applied — and `api_v1_rowcount_matches_marts` is an asset check *on `api_v1`*, so **the check that would notice is skipped too**. The failure mode is silence, not a red check. ⚠️ The mechanism that actually removed three relations on 2026-09-21 is **inferred, not measured**; the file names the one measurement that settles it. Every occurrence so far was caught within the hour only because a deploy was in flight and someone was watching. |
| 1c | **`meta_dimensions` has no catalog page** — the website enumerates Atlas views from `lineage.csv`, which maps models to *raw sources*; `mart_meta_dimensions` reads a seed, so it has no edge and has never appeared. 17 view pages exist and it is not one. ⚠️ **It is the relation whose undiscoverability produced urb-agents #1333, #1335 and #1344**, and the two catalogue pages that DID appear on 2026-09-21 (`meta_sources`, `meta_endpoints`) appeared by accident, as a side effect of an unrelated lineage change. Fix: enumerate views in `website/scripts/generate-sources-registry.mjs` from the generated `seeds/sources/api_v1_relations.csv` (added 2026-09-21) rather than inferring the set from lineage; lineage stays the input for *what feeds* a view, not for *whether it exists*. Expect views with an empty lineage section — the page should say so rather than be omitted. | S | Small, well-specified, and the correct input now exists. |
| 1d | **Six two-digit codes claim to be fylker and are not** — [INVESTIGATE-two-digit-codes-that-are-not-fylker](INVESTIGATE-two-digit-codes-that-are-not-fylker.md) | S-M | `classify_region_code` maps `^\d{2}$` to `fylke`; `21 Svalbard`, `22 Jan Mayen`, `23 Kontinentalsokkelen`, `25 Utlandet`, `26 Havområder`, `88 Ikke bosatt i Norge` are not fylker — measured against Klass 104 and SSB's own Region labels. 3,648 rows, failing `relationships` tests since the `ssb-06913` recovery. ⚠️ The classifier already handles `21xx/22xx/23xx` correctly, so `21` and `2100` disagree about the same place. Blocked only on a decision: the macro is used by 22 models and `ref_region_kind` is a gated closed vocabulary. Options and a recommendation are in the file. |
| 1e | **`ssb-12063` ingests one year and publishes as if it had all of them** — its filter is `Tid: "TOP(1)"`, so only the most recent year is ever fetched. `KOSfritidredleie0000` last carried a value in 2018 and has therefore never been ingested: **1,812 non-null cells exist at SSB across 2015-2018 (408 kommuner in 2018 alone, measured by ops-dev) and none are in the fact table.** ⚠️ Nothing is dropped between raw and fact — those years were never requested. It applies to the whole source, not one series. Decision: widen the filter and gain history for every series, or document the source as current-year-only. **Publishing a series that looks empty is not a third option** (urb-agents #1362). | S | Cause is known and one line; the choice is editorial. |
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
- **The asgard deployment** — Phase 2 complete (2.3: 649 checks, 629 dbt PASS, 17 known WARNs, 10/13 views, 0 orphans — ⚠️ those three figures do not subtract, and ops caught it on urb-agents #632. They reconcile only if 649 is the *combined* pre-split suite: 629 + 17 = 646 dbt checks, plus `api_v1_checks`' 3. **Today the split makes it 647 in `transform_checks` and 3 in `api_v1_checks`**, measured identically on two topologies. Cite the current figures, not these) and Phase 3.2's concurrency bound verified at 4 against a real weekly fan-out on 2026-08-30. ⚠️ The observed weekly cycle **failed** (15 SSB sources, HTTP 429), so the *bound* is proven but a clean end-to-end weekly cycle has not yet been observed.

---

## Cross-cutting notes

- 🔴 **One check outranks everything in this doc, and it is not a decision: does the public API
  accept writes?** Found while measuring the Parquet item, 2026-09-23. The live API advertises
  `Allow: OPTIONS,GET,HEAD,POST,PATCH,DELETE` on all 16 auto-updatable `api_v1` views; the 4
  aggregate views show `GET,HEAD` only — which is Postgres refusing to write through aggregates,
  **not** a privilege boundary. `api_v1_generated.sql` grants `SELECT` only, but inside
  a role-existence guard, so the grants can **silently never apply**. ⚠️ **No write was attempted**,
  and the mechanism is deliberately not spelled out in this public repo — it is on urb-agents
  #1438. It should be settled with `\du` and `\dp` on the host rather than by
  testing against a public endpoint. [Q14] in
  [INVESTIGATE-parquet-duckdb-wasm-surface](INVESTIGATE-parquet-duckdb-wasm-surface.md).
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
