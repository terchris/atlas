# PLAN-001: Sources manifest schema v2 — fields, JSON Schema, validation gate

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Completed**: 2026-05-12

**Branch**: `feature/sources-manifest-schema-v2`

**Goal**: Extend the per-source `manifest.yml` schema with the fields the sources catalog needs (lifecycle, time coverage, multi-label keywords, methodology notes, suggested joins, sample query, optional feedback URL), add `publishers.yaml` + `source-categories.yaml` companion files, ship a `manifest.schema.json` validator, and gate it in CI — so PLAN-002 / PLAN-003 can build the catalog on a stable contract.

**Last Updated**: 2026-05-12

**Investigation**: [INVESTIGATE-sources-catalog-at-scale.md](../backlog/INVESTIGATE-sources-catalog-at-scale.md) — see "Decisions resolved" section, especially **[Q11]**, **[Q13]**, **[Q14]**, **[Q15]**, **[Q30]**, **[Q31]**, **[Q41]**.

**Prerequisites**: None. All 41 manifests already exist at [`atlas-data/ingest/src/sources/*/manifest.yml`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources) and are hand-authored.

**Blocks**:
- `PLAN-002-sources-catalog-foundation` — cannot generate registry JSON without the schema.
- `PLAN-003-sources-catalog-merchandising` — depends on PLAN-002.

**Priority**: High (gating).

---

## Problem

The current v1 manifest schema (PLAN-007) is sufficient for ingest and `mart_meta_sources` but missing the fields the catalog UI promised by [INVESTIGATE-sources-catalog-at-scale.md](../backlog/INVESTIGATE-sources-catalog-at-scale.md) needs:

| Gap | Why catalog needs it | Decision in INVESTIGATE |
|---|---|---|
| No lifecycle / product-status indicator | Catalog renders a coloured badge ("In stock" / "Pre-order" / "Discontinued"); at 200 sources some will be deprecated, some beta | **[Q11]** new field `lifecycle: stable\|beta\|deprecated\|broken` |
| No time-coverage window | Catalog shows "Covers 1986–2025" in hero block; facet by recency | **[Q13]** new field `time_coverage: {start, end}` |
| Only single-valued `tags.topic` | Sources legitimately span multiple themes (`fhi-vgs-gjennomforing` is education + demographics) | **[Q2]** new field `keywords[]` (multi-label, free-form) |
| No methodology notes | Ola and Jonas bounce without source methodology context | **[Q30]** new optional field `methodology_notes` |
| No join-suggestions | "Frequently joined with" needs editorial input where natural-join inference is wrong | **[Q13]** new optional `suggested_joins[]` |
| No sample query | The hero buy-box "Get this data" panel needs a one-click PostgREST URL | **[Q13]** new optional `sample_query` |
| No "meld feil" routing | Inger and Magnus need a "report to upstream publisher" path | **[Q31]** new optional `feedback_url` per-source override |
| Publisher logo and feedback URL repeated 21× per FHI source | Property of the publisher, not the dataset | **[Q41]** new file `publishers.yaml`, not per-source field |
| Category metadata (description, order, emoji) lives nowhere | Front-page shop-window needs curated category cards | **[Q3]** new file `source-categories.yaml` |
| No schema validator | At 200 sources, manifest shape drifts silently; ingest works but downstream consumers break | **[Q15]** ship `manifest.schema.json` + CI gate mirroring [`check-osmosis.sh`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/check-osmosis.sh) |

**What this PLAN does NOT do:**
- Render anything on the website (PLAN-002).
- Introduce the generator that emits `sources-registry.json` (PLAN-002).
- Change any ingest code path or `raw.*` table.
- Touch the dbt models or `mart_meta_sources`.
- Add or remove sources.

---

## Phase 1: JSON Schema + validator — DONE

**Outcome (2026-05-12)**: Validator works against all 41 manifests. Schema reports the expected 41 × `lifecycle` + 41 × `time_coverage` gaps (these are Phase-2 scope). **Two pre-existing data-hygiene issues uncovered**, both being added to Phase 2 scope:
- 17 manifests have unquoted numeric `upstream_id` (e.g. `ssb-07459` had `upstream_id: 07459` parsed as integer `7459` — silent leading-zero loss).
- 5 FHI manifests have empty / placeholder `upstream_landing_page` values (literal `<TODO-...-slug>` or `""` with a TODO comment).

### Tasks

- [x] 1.1 Create [`atlas-data/ingest/src/sources/manifest.schema.json`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources) covering **all existing v1 fields plus the new v2 fields**:
  - **Required**: `source_id`, `upstream_id`, `upstream_url`, `upstream_title`, `description`, `publisher`, `license`, `license_url`, `periodicity`, `eu_theme`, `attribution`, `tags{provider,topic,geo,cadence}`, `dimensions[]`, **`lifecycle`**, **`time_coverage{start,end}`**.
  - **Optional**: `upstream_landing_page`, `raw_tables[]`, **`keywords[]`**, **`suggested_joins[]`**, **`sample_query`**, **`methodology_notes`**, **`feedback_url`**.
  - Use JSON Schema draft 2020-12, with `$schema`, `$id` (`https://atlas.sovereignsky.no/schemas/manifest.schema.json`), and `title` so VS Code's YAML extension offers hover docs.
  - `lifecycle`: `enum: ["stable", "beta", "deprecated", "broken"]`.
  - `time_coverage.start` / `.end`: `["integer", "null"]` (4-digit year; null for irregular cadences).
  - `eu_theme`: enum of the 13 DCAT-AP codes (`AGRI ECON EDUC ENER ENVI GOVE HEAL INTR JUST REGI SOCI TECH TRAN`).
  - `periodicity`: regex matching ISO 8601 duration (`^P[0-9]+[YMWD]$`) or literal `irregular`.

- [x] 1.2 Create [`atlas-data/ingest/src/sources/validate-manifests.ts`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources) — Node script that:
  - Walks `atlas-data/ingest/src/sources/*/manifest.yml`.
  - Parses each with `js-yaml` (already a dependency).
  - Validates with `ajv` (new dependency in `atlas-data/ingest/package.json`).
  - On error, prints file path + JSONPath + message; exit code 1.
  - On success, prints `→ validated N manifests` and exits 0.
  - Also runs cross-file checks: every `tags.topic` resolves to a category id in `source-categories.yaml`; every `publisher` resolves to a publisher id in `publishers.yaml`.

- [x] 1.3 Create [`atlas-data/ingest/src/sources/check-manifests.sh`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources) — shell wrapper mirroring [`check-osmosis.sh`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/check-osmosis.sh):
  - `set -euo pipefail`
  - `cd "$(dirname "$0")"`
  - Invokes `npx tsx validate-manifests.ts` (or `npm run validate-manifests` if a script lands in `package.json`).
  - Same `--strict-only` / verbose mode shape as `check-osmosis.sh`.
  - Header comment points at the canonical contributor doc.

- [x] 1.4 Add `ajv` (latest stable, supports JSON Schema 2020-12) to `atlas-data/ingest/package.json` under `devDependencies`. Also added `ajv-formats` (enforces `format: "uri"`) and `js-yaml` + `@types/js-yaml` (the existing scripts hand-roll YAML parsing; the validator needs a real parser).

### Validation

```bash
cd atlas-data/ingest/src/sources
./check-manifests.sh
# Expected: schema parses, all 41 manifests parse, but cross-file checks fail
# because publishers.yaml and source-categories.yaml don't exist yet, and the
# new required fields (lifecycle, time_coverage) are not yet present.
# The validator should report exactly those gaps — no false positives on existing fields.
```

User confirms phase is complete.

---

## Phase 2: Backfill required new fields + fix data-hygiene issues uncovered by Phase 1 — DONE

**Outcome (2026-05-12)**: All 41 manifests pass schema-level validation. Cross-file checks correctly warn that companion files don't exist yet (Phase 3 scope). Done via one-off `/tmp/apply-phase2.mjs` for traceability — text-based edits, no YAML reformat. Diff: 41 files, +225/-26 lines.

### Tasks

- [x] 2.1 Added `lifecycle: stable` to all 41 manifests.

- [x] 2.2 Added `time_coverage: {start, end}` to all 41 manifests. Year ranges drawn from existing `dimensions[].Tid` / `dimensions[].AAR` notes. 7 manifests use `{null, null}` where the cadence is genuinely irregular or the range isn't stated (bufdir-barnefattigdom, fhi-prognose, fhi-vgs-gjennomforing, frr, redcross-branches, ssb-crime-tables, ssb-klass-fylker, ssb-klass-kommuner).

- [x] 2.3 Quoted 20 unquoted numeric `upstream_id` values across SSB + 4 FHI manifests. Leading zeros on SSB table IDs (`07459`, `06083`, etc.) now preserved as strings.

- [x] 2.4 Removed 6 placeholder `upstream_landing_page` values (5 empty `""` + comment, 1 with literal `<TODO-hasj-slug>`). Field falls back to `upstream_url` per the schema. Affected: fhi-hasj, fhi-mediebruk-some, fhi-mediebruk-underhold, fhi-mobbing, fhi-trangbodd, fhi-vgs-gjennomforing.

- [x] 2.5 Validator runs cleanly: `→ validated 41 manifests` with companion-file warnings (expected).

### Validation

```bash
./check-manifests.sh
# Expected: all 41 manifests pass schema-level checks. Cross-file checks
# (publisher / category resolution) still fail until Phase 3 ships the
# companion YAML files.
```

User confirms phase is complete.

---

## Phase 3: Companion files — `publishers.yaml` + `source-categories.yaml` — DONE

**Outcome (2026-05-12)**: All cross-file checks now pass — `→ validated 41 manifests` with no warnings. Logos are placeholders (text wordmarks) flagged with TODO comments inside each SVG; need replacement with official publisher logos before launch. Normalised `frr/manifest.yml` publisher field from "Norges Røde Kors (private FRR register)" to "Norges Røde Kors" to consolidate with redcross-branches under one publisher entry (the FRR qualifier remains in `attribution:`).

### Tasks

- [x] 3.1 Created [`atlas-data/ingest/src/sources/publishers.yaml`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources) listing each current publisher with:
  - `id` (URL slug — `ssb`, `fhi`, `bufdir`, `redcross`, `folkehjelp` once it arrives).
  - `display_name` (the canonical name used in the existing `publisher:` field, e.g. `Statistisk sentralbyrå`).
  - `homepage` (the publisher's own portal — `https://www.ssb.no/`, etc.).
  - `logo` (path under `website/static/img/publishers/<id>.svg`).
  - `feedback_url` (default upstream feedback channel, used by **[Q31]** "Meld feil → Report to publisher" button when the per-source `feedback_url` is not set).
  - `notes` (one short paragraph, editorial — appears on the brand page).

- [x] 3.2 Add publisher logos to `website/static/img/publishers/{ssb,fhi,bufdir,redcross}.svg`. Each publisher publishes its own logo with public-sector attribution terms (NLOD or equivalent). Verify license terms per logo before commit.

- [x] 3.3 Created [`atlas-data/ingest/src/sources/source-categories.yaml`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources). Seed from current `tags.topic` distribution (health 12, demographics 10, income 5, education 5, social 4, ngo-supply 3, reference 2). Each category:
  - `id` (slug — matches `tags.topic` values exactly).
  - `name` (display title — e.g. `Health`).
  - `description` (one-paragraph editorial framing for the category landing page).
  - `emoji` (single Unicode emoji for visual cues).
  - `order` (sort key for the front-page category grid).

- [x] 3.4 Cross-file checks are part of `validate-manifests.ts` from Phase 1 to:
  - Fail if any manifest's `tags.topic` is not a key in `source-categories.yaml`.
  - Fail if any manifest's `publisher` does not match a `display_name` in `publishers.yaml`.

- [x] 3.5 Validator pass: `→ validated 41 manifests` with no warnings.

### Validation

```bash
./check-manifests.sh
# Expected: → validated 41 manifests, all cross-references resolved.
```

User confirms phase is complete.

---

## Phase 4: Optional fields — sweep for high-value populations — DONE

**Outcome (2026-05-12)**: All 41 manifests now carry curated `keywords[]`; the top-5 also carry `methodology_notes`; 14 carry `suggested_joins[]`. Sweep done via `/tmp/apply-phase4.mjs` for traceability. Validator still passes 41/41.

### Tasks

- [x] 4.1 Added `keywords[]` (3–6 per source) to all 41 manifests. Drawn from titles, descriptions, and dimension notes; biased toward terms a researcher would actually search for (e.g. `ungdata` appears on 10 FHI youth surveys; `kommune` on all kommune-resolution sources).

- [x] 4.2 Added `methodology_notes` for 5 sources: `ssb-08764`, `fhi-mobbing`, `bufdir-barnefattigdom`, `fhi-vgs-gjennomforing`, `ssb-07459`. Remaining 36 left empty (catalog will render an honest placeholder per **[Q30]**).

- [x] 4.3 Added `suggested_joins[]` for 14 sources covering the natural-pair groups: kommune↔bydel age-sex (`ssb-07459`/`10826`), youth education (`fhi-mobbing`/`vgs-gjennomforing`/`neet`), household composition (`ssb-06083`/`fhi-bor-alene`), income chain (`ssb-06944`/`06947`/`08764`/`12944`/`bufdir-barnefattigdom`), geography reference (`ssb-klass-kommuner`/`fylker`).

- [x] 4.4 `sample_query` and `feedback_url` left empty on all 41. Defaults derived at catalog build time (PLAN-002) and from `publishers.yaml` respectively.

### Validation

- [ ] All 41 manifests still validate.
- [ ] Manual review: at least 5 randomly-chosen sources have keywords that pass a "would I search for this?" smell test.
- [ ] User confirms phase is complete.

---

## Phase 5: Tooling and contributor docs — DONE

**Outcome (2026-05-12)**: Bootstrap emits the new v2 fields for new sources (`lifecycle: beta`, `time_coverage: {null, null}`, `keywords: []`). The filler script round-trips the v2 trailing block so re-running it on a populated manifest never strips edits, and emits a soft warning when `lifecycle: stable + cadence: annual/…` ships with `null` time_coverage (4 such warnings currently — all editorial honest-null cases). CI gate wired via a new dedicated workflow (`check-manifests.yml`) — no overlap with existing workflows. Contributor docs updated end-to-end.

### Tasks

- [x] 5.1 Update [`atlas-data/ingest/scripts/bootstrap-manifest.ts`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/scripts/bootstrap-manifest.ts) to emit the new fields with sensible defaults for *new* sources:
  - `lifecycle: beta` (new sources start beta; promoted to stable after first review).
  - `time_coverage: {start: null, end: null}` (filled in by the contributor).
  - `keywords: []`, `suggested_joins: []`, `methodology_notes: ""`, `sample_query: ""`, `feedback_url: ""` — all empty.
  - Order new fields *after* `dimensions:` to match the existing aesthetic of the file.

- [x] 5.2 Update [`atlas-data/ingest/scripts/fill-manifest-todos.ts`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/scripts/fill-manifest-todos.ts) to handle the new fields:
  - Warn (not fail) if `lifecycle: stable` but `time_coverage.start` is null.
  - No automatic fill for `keywords`, `suggested_joins`, `methodology_notes` — these are intentionally editorial.

- [x] 5.3 Wired `check-manifests.sh` into CI via a new dedicated [`.github/workflows/check-manifests.yml`](https://github.com/terchris/atlas/blob/main/.github/workflows/check-manifests.yml). Considered extending `atlas-data-image.yml` (option a in the plan), but that workflow is a Docker image build with no Node runtime — a dedicated, manifest-only workflow keeps triggers precise and the gate fast. Triggers on changes to manifests, schema, validator, wrapper, or companion files. The closest existing precedent is [`check-osmosis.sh`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/check-osmosis.sh) — but `check-osmosis.sh` is invoked from a workflow that needs to be located. Three options:
  - **(a)** Extend `.github/workflows/atlas-data-image.yml` to run `check-manifests.sh` on PRs touching `atlas-data/ingest/src/sources/**`.
  - **(b)** Extend `.github/workflows/website-build.yml` similarly (since the catalog consumes manifests).
  - **(c)** Add a dedicated `.github/workflows/check-manifests.yml` keyed only to manifest changes.

  Lean: **(a)** — keeps the gate next to the data that owns the manifests, matches the `check-osmosis.sh` precedent. Confirm during implementation by reading the existing workflow file.

- [x] 5.4 Updated [`website/docs/contributors/adding-a-source.md`](https://github.com/terchris/atlas/blob/main/website/docs/contributors/adding-a-source.md) — the canonical contributor guide. Document:
  - The new fields (with `[required]` / `[optional]` markers).
  - Pointer to `manifest.schema.json` (VS Code hover docs).
  - Pointer to `publishers.yaml` (when to add a new publisher).
  - Pointer to `source-categories.yaml` (when to propose a new category).
  - The CI gate — what fails and how to fix locally.

- [x] 5.5 Updated [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md) — the in-repo sources README also has a `manifest.yml schema` table that lists every field. Add rows for the new fields. Brief — full reference stays in `adding-a-source.md`.

- [x] 5.6 Created [`website/docs/contributors/check-manifests.md`](https://github.com/terchris/atlas/blob/main/website/docs/contributors) — sister to [`check-osmosis.md`](https://github.com/terchris/atlas/blob/main/website/docs/contributors/check-osmosis.md). Documents the gate's purpose, how to run locally, common failures and fixes.

### Validation

```bash
# Bootstrap a new dummy source; confirm new fields are present.
cd atlas-data/ingest
npx tsx scripts/bootstrap-manifest.ts test-dummy
cat src/sources/test-dummy/manifest.yml | grep -E '^(lifecycle|time_coverage|keywords|suggested_joins|methodology_notes):'
# Expected: all six lines present with default/empty values.
rm -rf src/sources/test-dummy

# CI gate triggers correctly.
git checkout -b test-schema-break
sed -i.bak 's/lifecycle: stable/lifecycle: invalid_value/' src/sources/ssb-07459/manifest.yml
./check-manifests.sh
# Expected: exit code 1 with a clear error referencing ssb-07459.
mv src/sources/ssb-07459/manifest.yml.bak src/sources/ssb-07459/manifest.yml
git checkout main
```

User confirms phase is complete.

---

## Acceptance Criteria

- [ ] `manifest.schema.json` exists at `atlas-data/ingest/src/sources/manifest.schema.json` and validates all 41 manifests.
- [ ] `validate-manifests.ts` + `check-manifests.sh` exist and run cleanly on `main`.
- [ ] `check-manifests.sh` runs in CI on PRs touching `atlas-data/ingest/src/sources/**`; a manifest-shape violation fails the build.
- [ ] All 41 manifests carry `lifecycle: stable` (or other appropriate value where authored).
- [ ] All 41 manifests carry `time_coverage` (with null start/end where the cadence is genuinely irregular).
- [ ] `publishers.yaml` exists, lists every current publisher, and resolves cleanly against every manifest's `publisher:` field. Publisher logos exist as SVGs under `website/static/img/publishers/`.
- [ ] `source-categories.yaml` exists, lists every category currently used as `tags.topic`, and resolves cleanly.
- [ ] At least 5 sources have populated `methodology_notes` (the top-5 most likely to be cited).
- [ ] At least 20 sources have populated `keywords[]` (representative sample; full coverage is a Phase-4 stretch goal).
- [ ] `bootstrap-manifest.ts` emits the new fields in the correct shape for new sources.
- [ ] [`website/docs/contributors/adding-a-source.md`](https://github.com/terchris/atlas/blob/main/website/docs/contributors/adding-a-source.md) documents the new fields, pointers to companion files, and the CI gate.
- [ ] [`website/docs/contributors/check-manifests.md`](https://github.com/terchris/atlas/blob/main/website/docs/contributors) exists, mirroring `check-osmosis.md`.
- [ ] [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md) schema table updated with new fields.

---

## Implementation Notes

- **Why `keywords[]` not `tags[]`** — the INVESTIGATE Q2 resolution loosely called this *"tags[]"*, but the existing v1 manifest already uses `tags:` as a structured object (`{provider, topic, geo, cadence}`). Renaming would be a breaking change to ingest tooling that reads `tags.provider`. The new free-form multi-label array is therefore named `keywords[]` to avoid collision. Document this back-mapping in `adding-a-source.md`.

- **Why publisher metadata lives in `publishers.yaml`, not in each manifest** — 21 of 41 manifests would otherwise repeat the same FHI logo path and feedback URL. Centralising in `publishers.yaml` makes a publisher-side change a one-file edit. The per-source `feedback_url` field stays in the schema as an *override* for rare cases where a specific dataset routes feedback differently than the publisher's default.

- **Why `lifecycle: stable` as the backfill default** — all 41 current sources are in production, so `stable` is correct now. New sources default to `beta` via the `bootstrap-manifest.ts` change in Phase 5; the contributor flips to `stable` after first review.

- **Why `ajv` over alternatives** — `ajv` is the industry-standard JS JSON Schema validator, supports draft 2020-12, has good error messages, and is a single small dev dependency. Alternatives considered: `zod` (TypeScript-native but requires hand-coded schemas, not JSON Schema interop) and `joi` (no JSON Schema 2020-12 support).

- **Schema as a contract for future consumers** — once `manifest.schema.json` ships, PLAN-002's generator, a future DCAT-AP-NO emitter (per [INVESTIGATE-felles-datakatalog-classification.md](../backlog/INVESTIGATE-felles-datakatalog-classification.md)), and `mart_meta_sources` all read the same shape. Changing the schema later is a breaking change for all consumers — over-spec now beats under-spec.

- **Schema location** — `atlas-data/ingest/src/sources/manifest.schema.json` (alongside the manifests it validates). VS Code's YAML extension picks up the schema via a `# yaml-language-server: $schema=...` directive that `bootstrap-manifest.ts` can emit at the top of each file in Phase 5; existing manifests pick it up via a workspace setting in `.vscode/settings.json` (out of scope for this PLAN — document in `adding-a-source.md` as an optional contributor convenience).

- **Cross-file checks** — `validate-manifests.ts` does **schema validation** (per-manifest) *and* **cross-file resolution** (`tags.topic` ↔ `source-categories.yaml`, `publisher` ↔ `publishers.yaml`). Both checks are part of the gate; both kinds of failure produce actionable error messages.

- **CI workflow placement** — the existing `check-osmosis.sh` is wired into [`atlas-data-image.yml`](https://github.com/terchris/atlas/blob/main/.github/workflows/atlas-data-image.yml). Confirm by reading the file at implementation time; mirror the trigger predicate (`paths:` filter on `atlas-data/ingest/src/sources/**` + the schema and YAML files).

---

## Files to Modify or Create

### New files

- `atlas-data/ingest/src/sources/manifest.schema.json` — JSON Schema v2 (Phase 1).
- `atlas-data/ingest/src/sources/validate-manifests.ts` — Node validator (Phase 1).
- `atlas-data/ingest/src/sources/check-manifests.sh` — CI shell wrapper (Phase 1).
- `atlas-data/ingest/src/sources/publishers.yaml` — per-publisher metadata (Phase 3).
- `atlas-data/ingest/src/sources/source-categories.yaml` — curated category list (Phase 3).
- `website/static/img/publishers/ssb.svg` — publisher logo (Phase 3).
- `website/static/img/publishers/fhi.svg` — publisher logo (Phase 3).
- `website/static/img/publishers/bufdir.svg` — publisher logo (Phase 3).
- `website/static/img/publishers/redcross.svg` — publisher logo (Phase 3).
- `website/docs/contributors/check-manifests.md` — contributor guide for the gate (Phase 5).

### Modified files

- All 41 `atlas-data/ingest/src/sources/<id>/manifest.yml` — backfill `lifecycle` + `time_coverage` (Phase 2); selective `keywords`, `methodology_notes`, `suggested_joins` (Phase 4).
- `atlas-data/ingest/scripts/bootstrap-manifest.ts` — emit new fields (Phase 5).
- `atlas-data/ingest/scripts/fill-manifest-todos.ts` — handle new fields (Phase 5).
- `atlas-data/ingest/package.json` — add `ajv` dependency (Phase 1).
- `atlas-data/ingest/src/sources/README.md` — extend manifest schema table (Phase 5).
- `.github/workflows/atlas-data-image.yml` (or sibling) — wire `check-manifests.sh` (Phase 5).
- `website/docs/contributors/adding-a-source.md` — document new fields + companion files + gate (Phase 5).
