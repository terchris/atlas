# Investigate: Private Atlas deployments

> **IMPLEMENTATION RULES:** Before implementing any plan from this investigation, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog

**Goal**: Define how an NGO can run a private, authenticated Atlas instance inside its own infrastructure that combines the public Atlas data (mirrored from `atlas.helpers.no`) with the NGO's own sensitive data — without compromising the public Atlas's organisation-neutral, no-auth, read-only posture. Red Cross is the first concrete case (private donation transactions, equipment inventory); the pattern should generalise to any Tier A NGO.

**Last Updated**: 2026-04-24 (revised after the private-data discussion: 4 payment rails, FRR is OpenAPI'd, repo layout decided, marts-only export confirmed)

---

## Scope

**In scope:**
- Architectural model: public Atlas vs. private per-NGO Atlas, and the data contract between them.
- Schema separation (public mirror vs. private per-NGO data) inside the private instance's database.
- Data distribution mechanism from `atlas.helpers.no` to downstream private instances (what ships, how often, in what format).
- UI feature-gating so the same Next.js codebase renders public mode on `atlas.helpers.no` and private mode on `atlas.redcross.no` (or equivalent).
- Ownership and trust boundary: who operates what, who sees what.
- Design consequences for `atlas.helpers.no`'s public schema — what becomes a backward-compatibility concern once there are downstream consumers.
- Example private data surfaces (Vipps donation transactions, equipment inventory) as shape-tests for the architecture.

**Out of scope:**
- Per-NGO private-data ingestion specifics (each NGO's private sources get their own investigation owned by that NGO, not by Atlas).
- Authentication provider choice for private instances (each NGO picks — e.g., Red Cross's own SSO, Mitt Røde Kors, or Authentik).
- Legal / DPA framing between Helpers and each NGO for running the mirror.
- The tilskuddsmatcher feature (separate investigation) — although Lisa-the-tilskuddsansvarlig is a natural private-instance user once it exists.

---

## Why this exists

`atlas.helpers.no` is by design a public, organisation-neutral, read-only portal with no auth (see [`goal.md`](../../../research/goal.md) — "Non-goals for v1" and "Stance on what we'll do to build this"). Two recent use cases put pressure on that frame:

1. **Vipps donation transactions to Røde Kors** — per-donor, per-transaction records. Clearly PII / financial data. Belongs to Red Cross. Some internal Red Cross staff need to see it alongside chapter and activity context from Atlas.
2. **Equipment inventory for Røde Kors** — beredskap equipment locations, counts, readiness status. Operational-security sensitive. Belongs to Red Cross. Mette-the-emergency-response-coordinator and Arne-the-district-coordinator need it alongside the public chapter map.

Two wrong ways to handle this:

- **Add auth + tenant gating to `atlas.helpers.no` itself** — breaks the "no auth", "organisation-neutral" and "read-only public data" commitments in `goal.md`. Forces every future Atlas decision to consider "but what about the private tenant?" Contaminates the primary flow for Kari / Amira / Ola.
- **Fork Atlas into a Red Cross-specific app** — duplicates the ~70-90% of functionality that Red Cross would get for free by consuming public Atlas data (chapter model, maps, activity taxonomy, Digdir Designsystemet chrome, coverage-gap infra).

The right way, proposed here, is a **three-tier deployment model** with a clean data contract between public and private. (Note: distinct from the three *schema layers* within the private deployment, covered in §C.1 — those are different concepts. "Tier" = deployment unit; "Layer" = schema namespace.)

---

## Section A — The three-tier deployment architecture

### A.1 Tier 1: `atlas.helpers.no` (public)

- Owned and operated by Helpers.
- Runs all public-data ingestion: NGO scrapers, SSB / FHI / Brreg / Bufdir / Kartverket / etc. APIs.
- Populates `raw.*` and `marts.*` per the existing naming conventions.
- Next.js UI renders public pages only. No auth, no private data, ever.
- Publishes a versioned data export (see §B) that downstream private instances consume.

### A.2 Tier 2: the public data contract

- A periodic export of `marts.*` (per [Q1] — marts only, no `raw.*`).
- Consumed by downstream private instances on a schedule.
- Versioned enough that a schema change on `atlas.helpers.no` doesn't silently break downstream consumers.

### A.3 Tier 3: `atlas.redcross.no` (private, per-NGO)

- Owned and operated by Red Cross (or whichever NGO).
- Hosted inside Red Cross's infrastructure — their K8s, their Postgres, their network.
- Runs a **restore job** that pulls the public export from Tier 2 into the local `marts.*` schema (per [Q1] — marts only, no `raw.*`).
- Runs Red Cross's own ingestion for private sources into separate schemas (see §C).
- Runs the same Next.js codebase as `atlas.helpers.no` but in `private` mode with auth enabled (see §D).
- Red Cross staff authenticate; Red Cross's private data is rendered alongside the mirrored public data.

**Atlas is a viewer, not the aggregator.** Every NGO already has its own CRM / fundraising platform / equipment registry / etc. that is the source of truth for their private data. The private Atlas instance pulls *aggregated views* from those existing systems and displays them with the public chapter context layered on. Atlas never:

- Receives transactional records (no individual donations, no donor identifiers).
- Holds historical state the source system doesn't already keep — if NGO's source system disagrees with Atlas, source wins.
- Has any write-back path. Read-only displays only.
- Acts as a reconciliation point between sources — that's the NGO's CRM's job.

**The important property:** Red Cross's private data never leaves Red Cross's infrastructure. Helpers never sees it. The public data flows one-way, helpers → red cross. No data flows red cross → helpers.

**Each NGO runs their own private instance.** No multi-tenant private hosting. The Atlas codebase ships the framework (restore + auth + feature-gating); each NGO assembles their own private deployment against their own data and operates it themselves.

---

## Section B — The public data contract

### B.1 What ships — **[Q1] Resolved**

**`marts.*` only.** Every `marts.*` table is in the contract; nothing else is. Per Q1 (resolved 2026-04-24): private instances don't need `raw.*` — their own dbt builds against the conformed marts dimensions and facts. This keeps the dump small and the contract surface narrow.

Explicitly **not** shipped: anything outside `marts.*` — `raw.*`, `raw.ingest_runs`, `raw.sitemap_log`, internal observability tables, auth tables. Those are operational to `atlas.helpers.no` and not part of the public contract. If a downstream private instance ever needs raw-level data, that's a v2 conversation; for v1 the answer is no.

### B.2 Distribution mechanism — **[Q2]**

Three candidates:

**B.2a Nightly `pg_dump` → restore.** `atlas.helpers.no` runs `pg_dump --schema=marts` nightly, uploads to an object store or makes it available over HTTPS. Red Cross runs a scheduled job that `pg_restore`s into its own database, truncating and repopulating the `marts.*` schema. (Per Q1: marts-only — no `raw.*` in the dump.)

- Simplest. Matches what the user proposed ("restore the public tables").
- Latency: 24 hours. Fine for this use case — public data changes daily at most.
- No coupling between live systems. Helpers outage doesn't take Red Cross down; Red Cross serves last successful restore.

**B.2b Logical replication** (Postgres publications/subscriptions). Red Cross's Postgres subscribes to `atlas.helpers.no`'s `marts.*` publication.

- Near-real-time.
- Tighter coupling: Red Cross's DB reaches across the network to Helpers' DB. Security review territory.
- Overkill for daily-refresh public data.

**B.2c Versioned JSON / Parquet export over HTTPS.** `atlas.helpers.no` publishes `https://atlas.helpers.no/export/marts/v1/fact_kommune_indicators.parquet` (and friends). Red Cross runs an ingest job that reads them and loads its own Postgres.

- No Postgres-to-Postgres dependency; any private instance can consume without being on Postgres.
- More plumbing to build on both sides.
- Useful if downstream consumers want to sit on a different DB or a data-lake stack.

Recommend **B.2a** for v1. Upgrade to B.2c if a second NGO wants to consume and isn't on Postgres. Skip B.2b unless freshness requirements demand it.

### B.3 Versioning discipline — **[Q3]**

Once there's a downstream consumer, `marts.*` schema changes on `atlas.helpers.no` become breaking changes for that consumer. Options:

- **Version the export** (e.g., `/export/marts/v1/...` → `/export/marts/v2/...` when breaking). Dual-publish during transition. Adds overhead on helpers.no.
- **Forward-only schema discipline** — additive changes (new tables, new nullable columns) are fine; renames/drops require coordination. Cheaper but relies on convention.

Recommend forward-only for v1. Revisit when there's a second NGO on the other end.

---

## Section C — Schema separation inside the private instance

Red Cross's Postgres holds both the mirrored public data and Red Cross's private data. They must not collide, and the restore must never touch private tables.

### C.1 Schema layout — three layers — **[Q4] Resolved**

The private deployment's Postgres holds three classes of data, each with its own schema namespace and ownership:

| Layer | Schema | Shape owned by | Data ingested by | Example tables |
|---|---|---|---|---|
| **L1 — Public open data** | `marts.*` | atlas.helpers.no | atlas.helpers.no (restored via [Q1] data contract) | `dim_kommune`, `dim_chapter`, `fact_kommune_indicators` |
| **L2 — Conformed private** | `private_marts.*` | atlas.helpers.no (shape contract in [`private-marts-shapes.md`](../../../stack/private-marts-shapes.md)) | The NGO from their own systems | `fact_resources` (FRR-aligned, includes org units as `ressurstype='organisatorisk enhet'`), `fact_resource_position`, `fact_resource_status`, `dim_resource_phone` |
| **L3 — NGO-specific private** | `private_marts_<ngo>.*` (e.g. `private_marts_redcross.*`) | The NGO | The NGO from their own systems | `private_marts_redcross.fact_beredskap_excercises` |

Plus one staging schema:

- `private_raw.*` — owned by the NGO, populated by the NGO's ingest scripts. Both L2 stagings (`supply__<ngo>_resources.sql`) and L3 stagings consume from `private_raw.*` and write to their respective marts. No per-NGO suffix on `private_raw` because each private deployment is single-tenant per [Q-priv-5] — there's only one NGO writing here.

The restore job runs `TRUNCATE ... RESTART IDENTITY CASCADE` on `marts.*` then reloads — nothing else. It never references `private_*`. Conversely, the NGO's own ingest writes only to `private_*`. There is **no `raw.*`** in a private instance — only `marts.*` arrives via restore.

### C.2 Joining across the boundary

`private_marts.fact_donations_by_chapter` carries a `chapter_id` that references `marts.dim_chapter.chapter_id`. Queries in the Red Cross UI `JOIN private_marts.x USING (chapter_id)` against `marts.dim_chapter`. Public IDs are the join keys.

**Rule:** private tables reference public IDs, never the other way around. Helpers' `atlas.helpers.no` database has no knowledge of `private_*` — it doesn't even exist there.

### C.3 Schema churn and FK integrity — **[Q5]**

If a restore drops and recreates `marts.dim_chapter`, any `private_marts.*` FK to `chapter_id` is a problem. Two mitigations:

- Don't use hard FKs across the boundary. Rely on convention + dbt tests (`relationships` test) instead of Postgres-level foreign keys.
- Soft-reference by business key (`chapter_org_number`) rather than surrogate `chapter_id`, so restores that regenerate IDs don't break private rows.

Recommend: no hard FKs across schemas; prefer business-key joins. Adds a tiny bit of query complexity; avoids a large operational headache.

---

## Section D — UI feature-gating

One Next.js codebase, two deployments. The code needs to know which mode it's in.

### D.1 Mode signal — **[Q6]**

A single env var, e.g., `ATLAS_MODE=public | private`, read at startup.

- `public`: no auth, no private routes, no private panels. Exactly today's `atlas.helpers.no`.
- `private`: auth required for any route; private routes and panels mounted; query layer may read `private_*` schemas.

Alternative: detect by presence of `private_marts.*` at startup. More implicit, more fragile. Recommend explicit env var.

### D.2 Private-only pages and panels — **[Q7]**

Some views are meaningful only in private mode:

- Donation dashboard (reads `private_marts.fact_donations_by_chapter`)
- Equipment readiness map (reads `private_marts.fact_equipment_readiness`)
- Per-donor history, per-piece-of-equipment history

Three patterns for where they live in the codebase:

**D.2a Same repo, feature-gated.** Routes live in `app/private/` and are only mounted when `ATLAS_MODE=private`. Tables read from `private_*` schemas.
- Pro: one codebase, easy to share chrome and components.
- Con: `helpers/atlas` repo carries Red Cross-specific code. If a second NGO wants a different private view, it grows messy.

**D.2b Plugin package.** Private code ships as an npm/Python package that the Atlas runtime loads if present.
- Pro: clean separation; each NGO maintains its own plugin.
- Con: runtime-loaded code is heavier to design correctly.

**D.2c Companion app.** Red Cross runs a separate Next.js app for private views, reading from the same database. Atlas chrome is reused via a shared component library.
- Pro: total autonomy for Red Cross.
- Con: chrome drifts, two apps to keep aligned.

Recommend **D.2a** for the first private instance (Red Cross) under a `private/redcross/` namespace, with a clear exit plan to D.2b or D.2c if a second NGO arrives. Don't over-design for a multi-tenant scenario that doesn't exist yet.

### D.3 Auth — **[Q8]**

In private mode, all routes require authentication. The provider is the NGO's choice:

- Red Cross: likely their existing SSO / Mitt Røde Kors OIDC.
- Other NGOs: Authentik (already in the Urbalurba / UIS stack) or whatever they run.

The Atlas app speaks OIDC generically; the NGO configures the issuer at deploy time. Role mapping (who sees donation data vs. equipment data) is per-NGO config, not hardcoded.

---

## Section E — Ownership and trust boundary

| Concern | Helpers owns | NGO owns |
|---|---|---|
| `atlas.helpers.no` hosting, uptime, security | ✅ | |
| Public scrapers + ingest | ✅ | |
| Public data quality | ✅ | |
| Public data contract versioning | ✅ | |
| `atlas.<ngo>.no` hosting, uptime, security | | ✅ |
| Restore job operation | | ✅ |
| Private data sources (Vipps, equipment, CRM, etc.) | | ✅ |
| Private data GDPR / DPA | | ✅ |
| Private auth + role mapping | | ✅ |
| Atlas codebase (frontend + ingest framework) | ✅ (as open source) | Consumes |
| NGO-specific private views (if using D.2a) | Accepts contributions | Authors |

**No private data ever flows to Helpers.** If Helpers needs to debug the NGO's private instance, Red Cross provides logs / DB snapshots on their terms. This is the load-bearing property that makes the whole model work.

---

## Section F — Concrete private-data examples (Red Cross, current inventory)

These are the private sources Red Cross has documented as of 2026-04-24. Sources accrete over time — the architecture is **additive**: each new source is one more `private_raw.<source>_*` table + a UNION ALL into the existing aggregate marts. The list below is a snapshot, not a fixed contract.

### F.1 Donations — four payment rails, one aggregate mart

Red Cross receives donations via four distinct payment processors, each with its own API:

| Rail | Source spec | What we ingest |
|---|---|---|
| Vipps eCommerce (one-off) | `vipps-epayment` | Aggregated counts/sums per recipient_org_number per period |
| Vipps Recurring (faste givere) | `vipps-recurring` | Same shape |
| Mastercard Avtalegiro (bank direct debit) | `mastercard-avtalegiro-onboarding` | Same shape |
| Nets Easy (card processor) | `nets-easy-payments` | Same shape |

**Ingest rule** (per Q-priv-4): the ingest function aggregates at write-time. Atlas never persists individual transactions or donor identifiers — even transiently in raw. The raw table per rail looks like:

```
private_raw.donations_<rail> (
  rail              text   not null,        -- 'vipps_epayment' / 'vipps_recurring' / 'mastercard_avtalegiro' / 'nets_easy'
  recipient_org_number text not null,
  period            date   not null,        -- aggregation bucket, e.g. month-start
  campaign_ref      text,
  txn_count         int    not null,
  total_nok         numeric not null,
  loaded_at         timestamptz not null
)
```

dbt transform UNIONs all four rails and joins to `marts.dim_chapter` on `recipient_org_number`:

```
private_marts.fact_donations_by_chapter (
  chapter_id        text not null,
  period            date not null,
  rail              text not null,            -- preserves provenance
  txn_count         int  not null,
  total_nok         numeric not null,
  updated_at        timestamptz not null,
  primary key (chapter_id, period, rail)
)
```

UI view: map of chapters coloured by incoming donations over last 30/90/365 days, filterable by rail and campaign. Users: Signe (national planner), Arne (district), fundraising team.

**Atlas is not the source of truth.** Red Cross's CRM / fundraising platform already holds the canonical donation data. Atlas pulls aggregates and displays them with public chapter context. If the CRM disagrees with Atlas, the CRM wins — Atlas is just a join-and-display surface.

### F.2 Equipment / resources — FRR (Felles Ressursregister)

- Source: Red Cross's FRR — exposed via OpenAPI (spec lives in the private data repo per §G).
- **Ingest model** (per Q-priv-3): nightly mirror into `private_raw.frr_*`. Mirror approach (a) from the earlier discussion — same pattern as donations. Live API queries from server components are explicitly rejected to keep the dependency one-way and to avoid Atlas-availability getting tangled with FRR-availability.
- Probable shape:
  ```
  private_raw.frr_resources (
    resource_id          text not null,
    resource_type        text not null,
    quantity             int,
    condition            text,
    owner_org_number     text not null,
    last_inspected_at    date,
    loaded_at            timestamptz not null
  )
  ```
- dbt transform joins to `marts.dim_chapter` on `owner_org_number`, aggregates to `private_marts.fact_equipment_readiness`. UI view: chapter map coloured by readiness; click-through to per-chapter resource list. Users: Mette (emergency response), Arne (district), beredskap coordinators.

### F.3 Future sources

Any new private source for Red Cross (member system, kursdeltakere, intern-tildeling, etc.) follows the same pattern:

1. Add `private_raw.<source>_*` migration.
2. Write an ingest script under `atlas-private-data-repo/redcross/ingest/src/sources/<source>/` (see §G).
3. Write a dbt model that aggregates and joins to `marts.dim_chapter` on a public business key.
4. Add a row to `docs/stack/data-inventory.md` (see §H) marking it private + owned by Red Cross.
5. Surface in the UI under `app/private/redcross/...` per §D.2a.

No PLAN per source needed once the framework is in place — they're variations of the same recipe.

---

## Section G — Repo organisation for private code — **[Q-priv-13] Resolved**

The Atlas repo at root contains the public Next.js app + the public data repo. Private code mirrors that structure under a sibling directory that is **gitignored at the public-repo level**.

```
atlas/                                   (public, this repo)
├── app/                                 (Next.js — same code in public + private deployments)
├── src/
├── atlas-data-repo/                     (public ingest + dbt, committed)
│   ├── ingest/
│   ├── dbt/
│   └── migrations/
├── atlas-private-data-repo/             (gitignored at public-repo level)
│   ├── redcross/                        (Red Cross's private code; their own git repo)
│   │   ├── ingest/                      (mirrors atlas-data-repo/ingest layout)
│   │   ├── dbt/                         (cross-refs marts.* via dbt project ref)
│   │   ├── migrations/
│   │   ├── docs/                        (private specs: FRR OpenAPI, payment-rail JSONs)
│   │   └── README.md
│   └── folkehjelp/                      (would exist on Folkehjelp's clone, when they stand up theirs)
└── docs/
```

**Conventions:**

- **Symmetry**: `atlas-private-data-repo/<ngo>/{ingest,dbt,migrations,docs}` mirrors `atlas-data-repo/{ingest,dbt,migrations}`. Anyone who knows the public layout can navigate the private one immediately.
- **Per-NGO subdir** under the umbrella `atlas-private-data-repo/`. Each NGO clones the public repo, drops their own private repo as a subdir alongside.
- **Each `<ngo>/` is its own git repo**, hosted privately by that NGO. Never pushed to a public remote. The umbrella `atlas-private-data-repo/` directory exists only on disk — it has no git identity itself.
- **Private specs live in `<ngo>/docs/`**, not in the public Atlas's `docs/research/`. The current `docs/research/redcross-internal/` (FRR OpenAPI spec) and `terchris/{vipps-epayment,vipps-recurring,mastercard-avtalegiro-onboarding,nets-easy-payments}.json` should move into `atlas-private-data-repo/redcross/docs/` as Phase 0 of any private PLAN. `terchris/keys.tst` is a different concern — secrets stay in env files / a secrets manager, never in version control even private.
- **Cross-repo dbt refs**: private dbt models reference public marts via `{{ ref('dim_chapter') }}` in the same dbt project, materialised against the same Postgres in the private deployment. dbt project config under `<ngo>/dbt/dbt_project.yml` extends the public one. No separate dbt project; one project, two source trees.
- **Gitignore**: a single line in the public repo's `.gitignore`:
  ```
  atlas-private-data-repo/
  ```
  Belt-and-suspenders: also ignore `docs/research/*-internal/` so any pre-existing private specs in the old location don't get committed accidentally during the migration.
- **A short layout doc** lives at `docs/stack/private-data-layout.md` describing this convention so anyone who lands on the public repo and needs to stand up a private instance has a map.

---

## Section I — Layer 2: Conformed private mart shapes — **[Q-priv-16] Resolved**

This section covers **Layer 2 only** (per the §C.1 three-layer table). Layer 3 (NGO-specific private marts) gets its own treatment in §J.

Some categories of private data exist at every operational NGO: equipment registries (FRR for Red Cross; analogous systems at Folkehjelp, NKS, Frelsesarmeen, etc.), internal org units (committees / working groups / divisions), and likely future categories (member systems, training records, donor segments). The data shape is the same across NGOs; only the source system varies.

**Decision**: Atlas defines the canonical `private_marts.*` shape **once**, in a long-lived contract document — [`docs/stack/private-marts-shapes.md`](../../../stack/private-marts-shapes.md). Each NGO's private repo ships a per-NGO `supply__<ngo>_<entity>.sql` staging that maps their source into the canonical shape. The `private_marts.*` table is a UNION ALL of all per-NGO stagings — same pattern as the public side (`dim_chapter` UNIONs `supply__<ngo>_branches.sql`).

**Why a separate contract doc and not inline schema in this investigation**: investigations capture decisions and freeze in time; contract docs are kept current and frequently consulted. Per-NGO ingest authors need a 200-line scannable reference, not a 600-line investigation.

**Initial shape catalog** (in the contract doc, expanded as new categories emerge):

- **Resources — FRR-aligned**: Atlas adopts FRR's schema verbatim (it's a Norwegian government standard the FORF NGOs all use). Tables: `private_marts.fact_resources` (one row per FRR resource, denormalised current state — *includes org units as `ressurstype='organisatorisk enhet'`*), `fact_resource_position` (history), `fact_resource_status` (history), `dim_resource_phone` (PII-redacted in place).
- **Org units** are NOT a separate Layer 2 shape — for FRR-participating NGOs they're already in `fact_resources`. NGOs not in FRR who want internal-org-unit display surfaces use Layer 3 (`private_marts_<ngo>.*`); no Atlas Layer 2 contract for it.

**Doctrine for new shapes** (codified in [`private-marts-shapes.md`](../../../stack/private-marts-shapes.md) "Adding new shapes"): always check for an external standard first. Adopt verbatim if it exists. Invent an Atlas-defined shape only when no external standard does the job.

**Where the dbt files live — [Q-priv-18] Resolved (Option B)**: all Layer 2 dbt files (per-NGO stagings, the `private_marts.*` UNION-ALL models, `schema.yml` tests, vocabulary seed CSVs) live **entirely in the NGO's private repo** under `atlas-private-data-repo/<ngo>/dbt/`. Nothing lives in `atlas-data-repo/`. The Atlas-owned thing is the **shape** (in the contract doc), not the SQL. Reasons: each NGO's private dbt project stays self-contained and runnable; the public dbt build never has to gate or skip private models; the UNION-ALL files are tiny boilerplate (~5 lines per shape) that NGOs copy from the contract doc. Alternatives (UNION-ALL files in `atlas-data-repo/dbt/models/private_marts/` gated by `var()`; a shared `atlas-private-marts` dbt package) were considered and rejected for v1.

UI components for the conformed shapes live in the public Atlas repo (`src/components/private/`) so every NGO benefits without re-implementing.

---

## Section J — Layer 3: NGO-specific private marts — **[Q-priv-17] partial**

§I covers shapes that **every NGO has** (resources, org units, …). Each NGO will also have data that doesn't fit a shared shape — operational details, custom metrics, NGO-specific workflows. For these, the NGO defines their own schema, owns the ingest, and writes the UI.

### J.1 Schema namespace

`private_marts_<ngo>.*` — e.g. `private_marts_redcross.fact_beredskap_excercises`. The `_<ngo>` suffix makes ownership unambiguous and avoids collisions if a future cross-NGO operational analysis ever needs to UNION across them.

The corresponding raw stays in `private_raw.*` — no per-NGO suffix needed because each private deployment is single-tenant per [Q-priv-5].

### J.2 Where the dbt files live

All Layer 3 dbt code lives in **the NGO's private repo** (same as Layer 2 per [Q-priv-18]):

- `atlas-private-data-repo/<ngo>/dbt/models/private_marts_<ngo>/` — model SQL
- `atlas-private-data-repo/<ngo>/dbt/seeds/<ngo>/` — any NGO-specific vocabulary seeds
- `atlas-private-data-repo/<ngo>/migrations/` — `private_raw.*` migrations specific to the NGO source
- `atlas-private-data-repo/<ngo>/dbt/models/private_marts_<ngo>/schema.yml` — tests

Atlas's public repo never sees Layer 3 schema definitions or dbt code — Layer 3 is opaque to Helpers by design.

### J.3 Where the UI lives — **[Q-priv-17] open**

Layer 3 UI components serve only one NGO. Two options:

- **(a) `app/private/<ngo>/...` in the public Atlas repo** — route definition and React components live alongside Layer 1 and Layer 2 UI. Reuses Atlas's chrome, build infrastructure, design system. Each Layer-3 view becomes a PR to the public repo. Code is public; data is not.
- **(b) `atlas-private-data-repo/<ngo>/app/private/<ngo>/` in the private repo** — route files live in the private repo, symlinked or overlaid into the Atlas tree at deploy time. Cleaner separation, more deploy machinery.

Recommendation: **(a) for v1**. Layer 3 views are still React components reading from Postgres — the SQL queries reference `private_marts_<ngo>.*` table names that only exist in the NGO's deployment, so the public build is unaffected. The leak surface is data (which never reaches the public repo) not view templates. If an NGO has a strong policy reason to keep view templates private, swap to (b) for that NGO via deploy-time overlay.

### J.4 When to use Layer 3 vs propose a new Layer 2 shape

Default: try Layer 2 first. If 2+ NGOs have a similar concept (e.g., "training records") that fits a conformed shape with NGO-specific code mappings, propose extending [`private-marts-shapes.md`](../../../stack/private-marts-shapes.md) with a new shape.

Use Layer 3 when:

- The data category is unique to one NGO (Red Cross's beredskap framework specifics; Folkehjelp's solidaritetsungdom-specific organising metrics).
- A conformed shape would force fitting square pegs into round holes.
- The view is genuinely one-off and isn't expected to generalise.

A Layer 3 table can be **promoted to Layer 2** later if a second NGO wants similar data — it's not a one-way decision. The promotion is: write a migration to rename the schema, propose the shape in [`private-marts-shapes.md`](../../../stack/private-marts-shapes.md), update the per-NGO staging to map to the canonical column names.

---

## Section H — Data inventory deliverable — **[Q-priv-6] Resolved**

A new doc at **`docs/stack/data-inventory.md`** is the single source of truth listing every ingested source.

Per row:

| Column | Example |
|---|---|
| `source_id` | `redcross-branches` |
| `name` | Red Cross branches |
| `visibility` | `public` / `private` |
| `owner_ngo` | (blank if public) `redcross` |
| `cadence` | `nightly` / `manual` / `weekly` |
| `raw_schema` | `raw.redcross_*` |
| `populating_script` | `atlas-data-repo/ingest/src/sources/redcross-branches/index.ts` |
| `notes` | "API ingest, no scrape" |

**Maintenance rule**: every ingest PLAN (public or private) adds its row to this table as part of acceptance criteria. The doc is hand-maintained for v1; eventually it can be generated from `raw.ingest_runs` + a scan of the source folders.

For private deployments, the doc lives in **the private repo** (`atlas-private-data-repo/redcross/docs/data-inventory.md`) — not the public one. The public Atlas's inventory only lists public sources; the private inventory adds the NGO's private rows.

---

---

## Decisions resolved during planning (2026-04-24)

These were initially Open Questions; resolved during the discussion that produced §F, §G, §H.

- ~~**[Q-priv-1]**~~ Source inventory up-front? **No** — sources accrete as we go. Architecture must be additive (one new `private_raw.*` table + UNION ALL into the existing aggregate marts). §F is a snapshot, not a contract.
- ~~**[Q-priv-2]**~~ Is Atlas the source of truth for private data? **No** — every NGO already has their CRM / fundraising platform / equipment registry. Atlas is a **viewer**: pulls aggregates, joins to public chapter context, displays. No write-back, no historical retention beyond source, no reconciliation. See §A.3.
- ~~**[Q-priv-3]**~~ FRR architecture? **Nightly mirror into `private_raw.frr_*`** (same pattern as donations). Live API queries from server components rejected to keep dependency one-way.
- ~~**[Q-priv-4]**~~ Per-donor identity in `private_marts`? **No** — ingest aggregates at write-time. Atlas never persists donor identifiers or transaction IDs, even in raw. GDPR scope reduces to operational metrics.
- ~~**[Q-priv-5]**~~ Multi-tenant private hosting? **No** — each NGO runs their own instance. Atlas codebase ships the framework; no shared sandbox.
- ~~**[Q-priv-6]**~~ Data inventory doc? **Yes** — `docs/stack/data-inventory.md` as the single source of truth listing every ingested source with `(source_id, name, visibility, owner_ngo, cadence, raw_schema, populating_script)`. See §H.
- ~~**[Q-priv-13]**~~ Repo organisation for private code? **Sibling directory `atlas-private-data-repo/<ngo>/` mirroring `atlas-data-repo/`'s shape**, gitignored at the public-repo level. Each NGO subdirectory is its own private git repo. See §G.
- ~~**[Q1]**~~ Public export ships `raw.*` too? **No** — `marts.*` only. Private instances don't need raw; their own dbt builds against the conformed marts dimensions / facts. Drops dump size and contract surface considerably. **Resolved 2026-04-24.**
- ~~**[Q-priv-16]**~~ Conformed private mart shapes (Layer 2)? **Yes** — Atlas defines the shape once in [`docs/stack/private-marts-shapes.md`](../../../stack/private-marts-shapes.md); per-NGO stagings map their source into the canonical shape; `private_marts.*` is a UNION ALL. See §I. **Resolved 2026-04-24.**
- ~~**[Q-priv-18]**~~ Where do Layer 2 + Layer 3 dbt files live? **Option B** — entirely in the NGO's private repo (`atlas-private-data-repo/<ngo>/dbt/`). Nothing in `atlas-data-repo/`. Atlas owns the shape contract; each NGO owns the SQL. Alternatives (var-gated models in atlas-data-repo; shared dbt package) rejected for v1 — revisit at 3+ NGOs or if shape drift appears. See §I + §J. **Resolved 2026-04-24.**

---

## Open Questions

- **[Q2]** `pg_dump` vs. logical replication vs. versioned JSON/Parquet export? Recommend `pg_dump` for v1.
- **[Q3]** How do we version the public data contract so downstream instances don't break on schema churn? Recommend forward-only discipline for v1.
- **[Q4]** Schema naming: `private_raw.*` / `private_marts.*` vs. a per-NGO prefix (`rc_raw.*` / `rc_marts.*`)? Q-priv-5 (each NGO runs their own instance) makes the per-NGO prefix unnecessary — the database itself is single-tenant. Recommend `private_raw.*` / `private_marts.*`.
- **[Q5]** Hard FKs across schemas or business-key joins? Recommend business-key joins + dbt `relationships` tests.
- **[Q6]** `ATLAS_MODE` env var vs. implicit schema detection? Recommend explicit env var.
- **[Q7]** Where do private views live in the codebase? Recommend `app/private/<ngo>/` in the main Atlas repo, source files committed to the per-NGO private git repo and symlinked / overlaid into `app/private/<ngo>/` at deploy time. Revisit if symlinking proves brittle.
- **[Q8]** Auth provider contract — OIDC generic vs. per-NGO adapter? Recommend OIDC generic.
- **[Q9]** What does the private instance look like during the nightly restore window? Recommend: restore into a staging schema, swap on completion.
- **[Q10]** Is there a case for *multiple* private instances per NGO (dev/staging)? Yes — `pg_dump` over HTTPS supports pull-from-anywhere.
- **[Q11]** How does a private instance report errors / anomalies in the public data back to Helpers? Reuse the public "Meld feil" flow; never leak private context.
- **[Q12]** Minimum viable "private Atlas" for Red Cross — mirrored public instance behind auth, no private data yet — as a proof of the restore + auth + feature-gating pieces? Recommend: ship this first; private-data views follow.
- **[Q-priv-14]** Atlas's read role in the private deployment — does it need access to `private_*` schemas, or is there a separate role per visibility? Recommend a single read role with access to both `marts.*` and `private_*` (it's the same single-tenant Postgres). The auth gate is at the Next.js layer, not the DB layer.
- **[Q-priv-15]** Private data inventory doc lives in the private repo (`atlas-private-data-repo/redcross/docs/data-inventory.md`) — but the **format** is shared with the public inventory. Document the format once, in `docs/stack/data-inventory.md`'s preamble, and reference it from each private inventory.
- **[Q-priv-17]** Where do Layer 3 (NGO-specific) **UI files** live? Recommend `app/private/<ngo>/...` in the public Atlas repo for v1 (recommendation in §J.3). Open until an NGO has a strong reason to require deploy-time overlay from their private repo instead.

---

## Recommendation — phased PLANs

Five PLANs total. PLAN-0 is foundational scaffolding; A/B/C are the original three; D documents the shared inventory format.

- **PLAN-0 — Repo layout + private-data convention.** Create the `atlas-private-data-repo/redcross/` skeleton (locally; the directory itself is gitignored). Move `docs/research/redcross-internal/felles-ressursregister-frr-openapi-spec.md` and the four payment-API specs from `terchris/` into `atlas-private-data-repo/redcross/docs/`. Add the `atlas-private-data-repo/` and `docs/research/*-internal/` lines to the public repo's `.gitignore`. Write `docs/stack/private-data-layout.md` documenting the §G convention. Stand up the empty `<ngo>/` git repo on RC's private remote. ~1–2h, no code.

- **PLAN-A — Public data contract.** `atlas.helpers.no` produces a nightly `pg_dump --schema=marts` to an HTTPS-reachable object store. Document the contract + forward-only schema discipline. Add the data-inventory doc shell at `docs/stack/data-inventory.md` (per §H) and backfill rows for every public source already shipping. No downstream consumer yet — this is the supply side.

- **PLAN-B — Private instance skeleton.** Stand up a second deployment of the same Next.js codebase in `ATLAS_MODE=private`, pulling the PLAN-A dump nightly into its own Postgres, with OIDC auth in front. No private data yet. Initially Helpers-operated as a proof; eventually moved into Red Cross's infra. Proves the restore + auth + feature-gating mechanics. Per Q-priv-12, this is the minimum-viable private Atlas.

- **PLAN-C — First private source.** Red Cross picks one rail (e.g. Vipps Recurring) and authors the full path: ingest under `atlas-private-data-repo/redcross/ingest/src/sources/donations-vipps-recurring/`, migration under `atlas-private-data-repo/redcross/migrations/`, dbt model under `atlas-private-data-repo/redcross/dbt/`, UI view under `app/private/redcross/donations/`, row added to the private data-inventory doc. Shows the whole pattern end to end. Subsequent rails / FRR / future sources are variations of this recipe.

- **PLAN-D — Data-inventory format definition.** A short doc at `docs/stack/data-inventory.md` defining the row format (per §H), maintained as part of every ingest PLAN's acceptance criteria. Could be folded into PLAN-A's deliverables; calling it out separately so it doesn't get dropped.

If any of the three middle PLANs gets stuck (contract versioning, OIDC integration, FRR access), the others can proceed — they're loosely coupled. PLAN-0 is the prerequisite for any private-side work; PLAN-A is the prerequisite for PLAN-B; PLAN-B is the prerequisite for PLAN-C.

---

## Next Steps

- [ ] Confirm this architectural direction is the one to pursue (vs. auth-on-helpers.no, vs. full fork). This investigation argues for the three-layer model; capture any alternate view here before drafting PLAN-A.
- [ ] Walk the current `marts.*` surface and identify which tables are ready to ship as part of the public contract today vs. which need stabilising first.
- [ ] Sketch the `pg_dump`-and-restore job shape (who runs it, where artefacts live, how long they're retained).
- [ ] Talk with Red Cross about whether they want to operate a private Atlas at all, on what timeline, against which private data source first (Vipps vs. equipment vs. something else).
- [ ] Decide Q7 (private views layout) once a second NGO is actively interested — don't over-design before then.

---

## Files this investigation will produce

**Repo + convention scaffolding (PLAN-0):**
- `.gitignore` additions: `atlas-private-data-repo/` and `docs/research/*-internal/`.
- `docs/stack/private-data-layout.md` — codifies §G.
- `atlas-private-data-repo/redcross/{ingest,dbt,migrations,docs}/` skeleton + `README.md` (created locally; the directory is gitignored at the public repo level).
- File moves into `atlas-private-data-repo/redcross/docs/`: FRR OpenAPI spec + 4 payment-rail JSON specs.

**New infrastructure (PLAN-A):**
- `atlas-data-repo/ingest/src/export/` — job that runs `pg_dump --schema=marts` on a schedule and publishes the artefact. Or a dbt post-build hook.
- Dagster asset: `public_export_marts` that produces the artefact as its materialisation.

**New documentation (PLAN-A + PLAN-D):**
- `docs/stack/public-data-contract.md` — what ships (marts only), versioning rules, how to consume, example restore script.
- `docs/stack/data-inventory.md` — every public ingest's row + the format definition referenced by private inventories.
- [`docs/stack/private-marts-shapes.md`](../../../stack/private-marts-shapes.md) ✅ **already created** — canonical shapes for `private_marts.*` tables; per-NGO ingest authors map their source into these.
- Extension to [`docs/ai-developer/project-atlas.md`](../../project-atlas.md) covering `ATLAS_MODE` and the public/private split.

**New Next.js surface (PLAN-B):**
- Auth middleware, OIDC client config.
- `app/private/` route namespace with conditional mounting.
- Deployment manifest variants for `public` vs. `private` mode.

**Private side (PLAN-C, lives in the private repo):**
- `atlas-private-data-repo/redcross/migrations/NNN_private_raw_donations_vipps_recurring.sql`
- `atlas-private-data-repo/redcross/ingest/src/sources/donations-vipps-recurring/index.ts`
- `atlas-private-data-repo/redcross/dbt/models/private_marts/fact_donations_by_chapter.sql`
- `atlas-private-data-repo/redcross/docs/data-inventory.md` — first private row added.
- `app/private/redcross/donations/page.tsx` — the UI view (lives in the public repo per [Q7]; gets mounted only when `ATLAS_MODE=private`).

---

## Companion investigations

- [`INVESTIGATE-deployment-pipeline.md`](./INVESTIGATE-deployment-pipeline.md) — the CI/release flow for `atlas.helpers.no`. The public-export job is a new artefact type that pipeline would build and publish; PLAN-A of this investigation depends on that pipeline being further along.
- [`INVESTIGATE-ngo-scraping-infrastructure.md`](./INVESTIGATE-ngo-scraping-infrastructure.md) — the public-side ingestion that populates the `marts.*` tables this investigation exports.
- [`INVESTIGATE-data-freshness-surface.md`](./INVESTIGATE-data-freshness-surface.md) — the freshness contract (`updated_at`, `source_published_at`) is part of what every exported mart carries; private instances render it the same way the public instance does.
