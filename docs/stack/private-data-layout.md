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
├── atlas-data-repo/                     (public ingest + dbt, committed)
│   ├── ingest/
│   ├── dbt/
│   └── migrations/
├── atlas-private-data-repo/             (gitignored at this repo level)
│   ├── redcross/                        (Red Cross's private code; their own git repo)
│   │   ├── ingest/                      (mirrors atlas-data-repo/ingest layout)
│   │   ├── dbt/                         (cross-refs marts.* via shared dbt project)
│   │   ├── migrations/
│   │   ├── docs/                        (private specs: FRR OpenAPI, payment-rail JSONs)
│   │   └── README.md
│   └── folkehjelp/                      (would exist when Folkehjelp stands up theirs)
└── docs/
```

---

## Conventions

### Symmetry with public

`atlas-private-data-repo/<ngo>/{ingest,dbt,migrations,docs}/` mirrors `atlas-data-repo/{ingest,dbt,migrations}/`. Anyone who knows the public layout can navigate the private one immediately. Same naming for source folders, same script-naming convention (`refresh:<source>`, `ingest:<source>`).

### Per-NGO subdirectory

One subdirectory per NGO under the umbrella `atlas-private-data-repo/`. Each NGO clones the public Atlas repo, then drops their own `<ngo>/` subdirectory alongside (cloned from their own private remote). The umbrella `atlas-private-data-repo/` directory itself has no git identity — it exists only on disk and only because each NGO's subdir lives there.

### Gitignore

A single block in the public repo's `.gitignore` covers it:

```
atlas-private-data-repo/
docs/research/*-internal/
```

The first ignores the umbrella directory entirely. The second is belt-and-suspenders for pre-existing private specs that lived under `docs/research/<ngo>-internal/` before this convention; those should migrate into `atlas-private-data-repo/<ngo>/docs/`.

### Cross-project dbt: marts is a `source`, not a `ref`

Per Option B (see [`private-marts-shapes.md`](./private-marts-shapes.md)) each NGO's private dbt project is **fully separate** from the public Atlas dbt project — they are not merged or extended. The private project lives at `atlas-private-data-repo/<ngo>/dbt/` with its own `dbt_project.yml`.

The private project does **not** rebuild `marts.*` — those tables arrive in the private deployment's Postgres via the nightly restore from atlas.helpers.no. From the private dbt project's perspective, `marts.*` is an **external data source**, declared in `sources.yml`:

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

Private models then reference public tables as `{{ source('marts', 'dim_chapter') }}` — never `{{ ref('dim_chapter') }}` (which would fail; the model doesn't exist in this project).

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
3. `mkdir -p atlas-private-data-repo/<ngo>` and clone the private repo into it.
4. Create the `{ingest,dbt,migrations,docs}` subdirectories + a `README.md` describing the NGO's setup.
5. Move any pre-existing private specs from `docs/research/<ngo>-internal/` (in the public repo working tree) into `atlas-private-data-repo/<ngo>/docs/`.
6. Add the first row to `atlas-private-data-repo/<ngo>/docs/data-inventory.md`.

After Phase 0, subsequent private PLANs add ingest scripts, dbt models, and UI views following the public repo's conventions.

---

## Companion documents

- [`INVESTIGATE-private-atlas-deployments.md`](../ai-developer/plans/backlog/INVESTIGATE-private-atlas-deployments.md) — full architectural rationale.
- [`docs/stack/private-marts-shapes.md`](./private-marts-shapes.md) — canonical shapes for `private_marts.*` tables (resources, org units, …); per-NGO ingest authors map their source into these.
- [`docs/stack/data-inventory.md`](./data-inventory.md) (planned, PLAN-A of the private investigation) — single source of truth listing every ingested source. Shared format definition; per-NGO inventories inherit it.
- [`docs/stack/public-data-contract.md`](./public-data-contract.md) (planned, PLAN-A of the private investigation) — what the public Atlas exports for downstream private instances to consume.
