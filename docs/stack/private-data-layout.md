# Private data layout

How private per-NGO data sits alongside the public Atlas codebase. Codifies §G of [`INVESTIGATE-private-atlas-deployments.md`](../ai-developer/plans/backlog/INVESTIGATE-private-atlas-deployments.md).

---

## Why a separate sibling directory

Atlas's public side (this repo) is open source, organisation-neutral, and always read-only. Private per-NGO data — donations, equipment, members, etc. — must never end up in the public repo, but it does need to live alongside the public code so the same Next.js app and the same Postgres can render both layers in a private deployment.

The convention: a sibling directory `atlas-private-data-repo/<ngo-slug>/` that mirrors the shape of `atlas-data-repo/`. The sibling directory is gitignored at the public-repo level. Each NGO's subdirectory is its own private git repo, hosted on that NGO's own remote.

---

## Directory layout

```
atlas/                                   (this public repo)
├── app/                                 (Next.js — same code in public + private deployments)
├── src/
├── atlas-data-repo/                     (public + standards-based private code, committed)
│   ├── ingest/
│   │   ├── src/sources/frr/             (NGO-agnostic FRR ingest, scans atlas-private-data-repo/*/frr/)
│   │   └── scripts/{verify,validate}-frr.ts
│   ├── dbt/
│   │   └── models/private_marts/        (private_marts.frr_* — tagged 'private', empty on public deploy)
│   └── migrations/
│       ├── 026_private_schemas.sql
│       └── 027_private_raw_frr_resources.sql
├── atlas-private-data-repo/             (only sample-ngo/ is committed; per-NGO subdirs are gitignored)
│   ├── sample-ngo/                      (synthetic onboarding data — committed)
│   │   ├── frr/sample-frr.json          (~5 synthetic FRR records, exercises every code path)
│   │   ├── orgunits/sample-orgunits.json
│   │   └── README.md
│   ├── redcross/                        (Red Cross's private data + NGO-specific code; their own git repo, gitignored)
│   │   ├── frr/*.json                   (FRR snapshots — data only)
│   │   ├── orgunits/*.json              (org-unit snapshots — data only)
│   │   ├── docs/                        (private specs: FRR OpenAPI copy, payment-rail JSONs)
│   │   ├── dbt/                         (only NGO-specific Layer 3 dbt — private_marts_redcross.*)
│   │   ├── migrations/                  (only NGO-specific raw tables, not the FRR ones)
│   │   └── README.md
│   └── folkehjelp/                      (mirrors redcross/ when stood up)
└── docs/
```

**Standards-based vs NGO-specific split** (per the revised [Q-priv-18]):

- **FRR** is a Norwegian government-shared standard consumed by multiple NGOs in the same shape, so the FRR ingest, migrations, and dbt models live in `atlas-data-repo/`. Multi-NGO coexistence is via the `ngo_orgnr` column populated from each per-NGO subdirectory's data files.
- **NGO-specific sources** (e.g. Visma org-unit feeds, internal CRMs, payment integrations) keep their ingest + dbt code in the NGO's private repo at `atlas-private-data-repo/<ngo>/`.
- **Per-NGO data files** are always gitignored — never in the public repo. Synthetic stand-ins for those data files live in `sample-ngo/` so onboarding new contributors and CI can run end-to-end without any real NGO data.

---

## Conventions

### Symmetry with public

For the **NGO-specific Layer 3** code (`atlas-private-data-repo/<ngo>/{dbt,migrations}/`), the layout mirrors `atlas-data-repo/{dbt,migrations}/`. Anyone who knows the public layout can navigate the private one immediately. Same naming for source folders, same script-naming convention (`refresh:<source>`, `ingest:<source>`).

For **standards-based Layer 2** sources (e.g. FRR), the ingest/dbt/migrations all live in `atlas-data-repo/` and the per-NGO subdirectory contains data only (`atlas-private-data-repo/<ngo>/<source>/*.json`).

### Per-NGO subdirectory

One subdirectory per NGO under the umbrella `atlas-private-data-repo/`. Each NGO clones the public Atlas repo, then drops their own `<ngo>/` subdirectory alongside (cloned from their own private remote). The umbrella `atlas-private-data-repo/` directory itself has no git identity — it exists only on disk and only because each NGO's subdir + `sample-ngo/` live there.

### sample-ngo

`atlas-private-data-repo/sample-ngo/` is committed (under the public repo) and contains synthetic, fictitious data that exercises every standards-based ingest path. New contributors run the FRR ingest against `sample-ngo/frr/sample-frr.json` to verify their dev setup before any real NGO data is in play. CI can use it the same way (no real NGO data required to validate code changes).

The synthetic NGO uses orgnr `999999999` (deliberately fails Brreg's MOD-11) so it never collides with a real NGO.

### Gitignore

The public repo's `.gitignore` ignores **per-NGO subdirectories individually**, not the umbrella, so `sample-ngo/` can be committed:

```
atlas-private-data-repo/redcross/
atlas-private-data-repo/folkehjelp/
docs/research/*-internal/
```

(Add a new line for each NGO that stands up a private deployment.)

The `docs/research/*-internal/` rule is belt-and-suspenders for pre-existing private specs that lived under `docs/research/<ngo>-internal/` before this convention; those should migrate into `atlas-private-data-repo/<ngo>/docs/`.

### Cross-project dbt: marts is a `source`, not a `ref` — only for Layer 3

For **standards-based shapes** like FRR, the dbt models live in the public `atlas-data-repo/dbt/` project and reference `marts.*` via normal `{{ ref('dim_kommune') }}` (same project, same DAG). Models are tagged `private` so operators can `dbt build --exclude tag:private` if needed.

For **NGO-specific Layer 3 code** (`atlas-private-data-repo/<ngo>/dbt/`) the private dbt project is fully separate from the public Atlas project — they are not merged or extended. The private project does **not** rebuild `marts.*` — those tables arrive in the private deployment's Postgres via the nightly restore from atlas.helpers.no. From the private dbt project's perspective, `marts.*` is an **external data source**, declared in `sources.yml`:

```yaml
# atlas-private-data-repo/<ngo>/dbt/models/sources.yml
sources:
  - name: marts
    schema: marts
    tables:
      - name: dim_chapter
      - name: dim_kommune
      - name: dim_ngo
      - name: ref_atlas_service_category
      # …whatever public marts tables this private project queries
```

Private Layer-3 models then reference public tables as `{{ source('marts', 'dim_chapter') }}` — never `{{ ref('dim_chapter') }}` (which would fail; the model doesn't exist in this project).

### Schema namespace

Private migrations write to `private_raw.*` and `private_marts.*` schemas. The public side never sees these — they only exist in the private deployment's Postgres. The public side ships only `marts.*` via the data contract; the private deployment receives `marts.*` via restore, declares them as dbt sources, and builds `private_marts.*` on top via the private dbt project. There is **no `raw.*`** in a private deployment.

### Schema separation rules

- Restore job touches only `marts.*`. Never references `private_*`.
- Private ingest writes only to `private_raw.*`. Never references `marts.*` for write.
- Private dbt joins across the boundary using **business keys** (e.g., `recipient_org_number`, `chapter_org_number`), not surrogate IDs that may regenerate on restore.
- No hard FKs across schemas. Use dbt `relationships` tests instead.

### Specs and docs

Private OpenAPI specs, payment-rail integration docs, internal ER diagrams, etc. live in `atlas-private-data-repo/<ngo>/docs/`. They never live in the public Atlas's `docs/` directory.

### Secrets

Secrets — API keys, OAuth client secrets, DB passwords — live in env files (`.env.local`) or a secrets manager. Never in version control, even private. Not in `<ngo>/docs/`. Not in `terchris/keys.tst`-style scratch files for any contributor other than for personal local notes that never get committed.

### App routes

Per-NGO private UI routes (`/private/<ngo>/donations`, `/private/<ngo>/equipment`, etc.) live in **the public Atlas repo** under `app/private/<ngo>/`. They are mounted only when `ATLAS_MODE=private`. Source files are committed to the public repo (so the build is reproducible) but never visible in public-mode deployments. See [Q7] of the investigation for the rationale and the open question about deploy-time overlay vs in-repo.

---

## Phase 0 (when standing up a private instance for an NGO)

1. Create the NGO's private git repo on their own remote (e.g., `git@gitlab.redcross.no:atlas/private-data-repo.git`).
2. Clone the public Atlas repo locally.
3. Add `atlas-private-data-repo/<ngo>/` to `.gitignore` in the public repo (one line per NGO, alongside the existing `redcross/`).
4. `mkdir -p atlas-private-data-repo/<ngo>` and clone the private repo into it.
5. Create the per-source data subdirectories the NGO uses (`frr/`, `orgunits/`, plus any NGO-specific source folders) + `docs/` (private specs) + `README.md`. Add `dbt/` and `migrations/` only if the NGO has Layer-3 NGO-specific data sources.
6. Add the NGO to `atlas-data-repo/ingest/src/seed-sources/atlas-ngo-landscape/landscape.json` (slug + orgnr) so the standards-based ingests can resolve `<ngo-slug>` → orgnr.
7. Drop the NGO's first FRR snapshot into `atlas-private-data-repo/<ngo>/frr/` and run `npx tsx atlas-data-repo/ingest/src/sources/frr/index.ts`. The shared ingest auto-discovers the new folder.
8. Move any pre-existing private specs from `docs/research/<ngo>-internal/` (in the public repo working tree) into `atlas-private-data-repo/<ngo>/docs/`.
9. Add the first row to `atlas-private-data-repo/<ngo>/docs/data-inventory.md`.

After Phase 0, subsequent private PLANs add NGO-specific (Layer 3) ingest scripts, dbt models, and UI views following the public repo's conventions.

---

## Companion documents

- [`INVESTIGATE-private-atlas-deployments.md`](../ai-developer/plans/backlog/INVESTIGATE-private-atlas-deployments.md) — full architectural rationale.
- [`docs/stack/private-marts-shapes.md`](./private-marts-shapes.md) — canonical shapes for `private_marts.*` tables (resources, org units, …); per-NGO ingest authors map their source into these.
- [`docs/stack/data-inventory.md`](./data-inventory.md) (planned, PLAN-A of the private investigation) — single source of truth listing every ingested source. Shared format definition; per-NGO inventories inherit it.
- [`docs/stack/public-data-contract.md`](./public-data-contract.md) (planned, PLAN-A of the private investigation) — what the public Atlas exports for downstream private instances to consume.
