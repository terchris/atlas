# `check-manifests.sh`: the source-manifest schema gate

[`atlas-data/ingest/src/sources/check-manifests.sh`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/check-manifests.sh) is the CI gate that fails a PR if any per-source `manifest.yml` is shape-invalid, or if a manifest references a `tags.topic` or `publisher` that isn't declared in the companion YAML files.

It is the sibling of [`check-osmosis.sh`](./check-osmosis.md) (which gates dbt `schema.yml` column documentation). Non-overlapping scopes; both gates must be green to merge a PR touching source manifests.

This page covers what the gate enforces, when it runs, what failure looks like, and how to fix it.

---

## What the gate enforces

Two layers, both run by default:

### 1. Schema validation

Each `manifest.yml` is validated against [`manifest.schema.json`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/manifest.schema.json) — a JSON Schema 2020-12 document covering required fields, types, enums, regex patterns, and URI format.

Catches:

- Missing required fields (`lifecycle`, `time_coverage`, `tags.topic`, `dimensions`, …)
- Wrong types (`upstream_id: 07459` silently parses as integer 7459 — schema requires string; quoting forces preservation)
- Invalid enum values (`lifecycle: maintained` — not in `[stable, beta, deprecated, broken]`)
- Malformed URLs in `upstream_url` / `upstream_landing_page` / `feedback_url`
- Malformed `periodicity` (must match ISO 8601 duration or literal `irregular`)

### 2. Cross-file resolution

Two further checks, separate from the per-manifest schema:

- Every manifest's `tags.topic` must resolve to a category `id` in [`source-categories.yaml`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/source-categories.yaml).
- Every manifest's `publisher` field must match a `display_name` in [`publishers.yaml`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/publishers.yaml).

These keep manifests consistent with the curated editorial files the catalog renders from.

---

## When the gate runs

- **Locally** — run it before any commit touching `atlas-data/ingest/src/sources/`:
  ```bash
  cd atlas-data/ingest/src/sources
  ./check-manifests.sh
  ```
  Or via the npm script wrapper:
  ```bash
  cd atlas-data/ingest
  npm run sources:check-manifests
  ```

- **In CI** — wired up as a required check on PRs and on push to `main` in [`.github/workflows/check-manifests.yml`](https://github.com/terchris/atlas/blob/main/.github/workflows/check-manifests.yml). Triggers only on changes to the manifests themselves, the schema, the validator, the companion files, or the workflow.

---

## What failure looks like

### Schema failure

```
→ schema check: 41 manifests under src/sources/
  ✗ ssb-07459/manifest.yml
      /upstream_id: must be string
      /: must have required property 'lifecycle'
...
✗ 1 schema failure(s), 0 cross-file failure(s)
exit=1
```

The error lines name the file and the JSONPath of the failing property. Most failures fall into:

- **Missing required field** — open the manifest, add it. See [adding-a-source.md § Step 4b](./adding-a-source.md#step-4b--source-manifest) for the v2 field reference.
- **Wrong type** — usually `upstream_id` parsed as integer. Wrap the value in double quotes: `upstream_id: "07459"`.
- **Bad enum** — typo. Allowed values for `lifecycle`: `stable | beta | deprecated | broken`. Allowed values for `eu_theme`: the 13 DCAT-AP codes.

### Cross-file failure

```
→ cross-file checks
  ✗ 1 manifest(s) have tags.topic not in source-categories.yaml:
      ssb-new-source/manifest.yml: topic 'demographics-and-housing'
```

The fix is one of:

1. **The topic was a typo** — correct it in the manifest.
2. **The category genuinely doesn't exist yet** — add an entry to [`source-categories.yaml`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/source-categories.yaml) with `id`, `name`, `description`, `emoji`, `order`. New categories are editorial choices — discuss in the PR.

Same pattern for publisher failures — either fix the typo in the manifest, or add an entry to [`publishers.yaml`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/publishers.yaml).

---

## How to fix a failure

### Case A — you added a new source

1. After `npm run sources:bootstrap-manifest -- <id>`, fill in the v2 fields the bootstrap leaves empty (`lifecycle`, `time_coverage`, `keywords`). See [adding-a-source.md § Step 4b](./adding-a-source.md#step-4b--source-manifest).
2. If the source is from a new publisher, add an entry to `publishers.yaml` + a placeholder logo SVG.
3. If the source is in a new editorial category, add an entry to `source-categories.yaml`.
4. Re-run `./check-manifests.sh`.

### Case B — you renamed a field or changed a value

If the schema rejects a value you believe is correct, the schema is the contract — either fix the value or, if the schema is genuinely too strict for a legitimate case, propose a schema change in the same PR. Schema changes need maintainer review; per-source workarounds do not.

### Case C — VS Code complains before you run the gate

Add this to your workspace `.vscode/settings.json` to get hover docs + autocomplete on manifest fields:

```json
{
  "yaml.schemas": {
    "atlas-data/ingest/src/sources/manifest.schema.json": "atlas-data/ingest/src/sources/*/manifest.yml"
  }
}
```

---

## Prerequisites

- Node ≥ 20.
- Dependencies installed under `atlas-data/ingest/` (`npm ci`).
- The script uses `ajv` (JSON Schema validator), `ajv-formats` (URI format), and `js-yaml` (YAML parser), all declared in `atlas-data/ingest/package.json`.

---

## Why a manifest gate matters

The per-source `manifest.yml` is the *editorial contract* between Atlas's ingest team and every downstream consumer: `mart_meta_sources`, the dbt docs at [`/lineage/`](https://atlas.sovereignsky.no/lineage/), the public sources catalogue under `/sources/`, and any future DCAT-AP-NO emitter for harvesting by `data.norge.no`.

Until this gate landed, manifest shape was conventional but unenforced — silent corruption was possible. The first run of this validator exposed 20 manifests whose `upstream_id` had silently lost a leading zero (`07459` → integer `7459`) and 6 manifests with empty / TODO `upstream_landing_page` values. Both bugs had been in production for months without anyone noticing.

At 200 sources, this kind of silent drift is not optional to catch.

See [INVESTIGATE-sources-catalog-at-scale.md](../ai-developer/plans/backlog/INVESTIGATE-sources-catalog-at-scale.md) for the design rationale.

---

## Cross-references

- [adding-a-source.md](./adding-a-source.md) — full contributor workflow; manifest fields documented in Step 4b
- [check-osmosis.md](./check-osmosis.md) — sibling gate (`check-osmosis.sh`) covering dbt schema.yml hygiene; non-overlapping scope
- [`atlas-data/ingest/src/sources/check-manifests.sh`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/check-manifests.sh) — the script itself
- [`atlas-data/ingest/src/sources/validate-manifests.ts`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/validate-manifests.ts) — the validator implementation
- [`atlas-data/ingest/src/sources/manifest.schema.json`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/manifest.schema.json) — the schema being validated against
- [PLAN-001-sources-manifest-schema-v2.md](../ai-developer/plans/completed/PLAN-001-sources-manifest-schema-v2.md) — the plan that shipped this gate
