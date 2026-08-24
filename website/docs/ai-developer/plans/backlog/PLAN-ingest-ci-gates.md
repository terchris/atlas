# PLAN: Make the ingest gates real — fix the ajv typecheck break, run typecheck + tests in CI

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Make `atlas-data/ingest`'s typecheck and test gates both *pass* and *actually run in CI*, so the PR gates named in `CLAUDE.md` mean something.

**Last Updated**: 2026-08-23

**Priority**: High — this is a conformance **C11 tier-1** gap (`~/home/ai-developer/platform-conformance.md`: "per-commit CI in the project repo (unit/dbt/image)"). Filed at ops's request after it surfaced during [PLAN-dagster-production-wiring](../completed/PLAN-dagster-production-wiring.md) phase 1.

---

## Problem Summary

Two defects, found while running the gates by hand during Dagster phase 1. The second is the serious one.

### 1. `npm run typecheck` fails on `main`

```
src/sources/validate-manifests.ts(121,19): error TS2351: This expression is not constructable.
  Type 'typeof import(".../ajv/dist/2020")' has no construct signatures.
src/sources/validate-manifests.ts(122,3): error TS2349: This expression is not callable.
  Type 'typeof import(".../ajv-formats/dist/index")' has no call signatures.
```

Confirmed pre-existing on a clean tree (changes stashed) — nothing recent introduced it. It is the standard ajv-v8-under-`NodeNext` interop break: `validate-manifests.ts:27-28` does

```ts
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
```

Under `"module": "NodeNext"` + `"type": "module"`, these CJS packages resolve to the module namespace object rather than the default export, so `new Ajv2020(...)` and `addFormats(ajv)` don't typecheck. The script still *runs* (tsx tolerates it at runtime), which is exactly why this went unnoticed.

### 2. The ingest gates never run in CI at all

The bigger finding. `CLAUDE.md` names typecheck and tests as PR gates, but auditing `.github/workflows/`:

| Workflow | What it actually runs |
|---|---|
| `website-build.yml` | `npm run typecheck` + `npm run build` — **for `website/`, not ingest** |
| `check-manifests.yml` | `npm ci` then `./src/sources/check-manifests.sh` in `atlas-data/ingest` — manifests only |
| `atlas-data-image.yml` | Docker build (and push on main) |

**No workflow runs `npm run typecheck` or `npm test` for `atlas-data/ingest`.** 99 unit tests across 9 files exist and pass, and nothing enforces them. A PR could break every one of them and go green. That also explains how defect 1 survived: the gate that would have caught it isn't wired up.

### 3. Node version floor is undocumented and CI is below it

`npm test` needs **Node ≥22**: vitest 4's rolldown imports `styleText` from `node:util`, absent in Node 20.11, so the suite dies at startup with a `SyntaxError` before running a single test. `check-manifests.yml` pins `node-version: '20'`, and `package.json` declares only `>=20`. Whatever workflow ends up running the tests must use 22, and the floor should be stated rather than rediscovered.

---

## Phase 1: Fix the typecheck break

### Tasks

- [ ] 1.1 Fix the ajv imports in `src/sources/validate-manifests.ts` — the `.default` interop dance (`import ajvModule from "ajv/dist/2020.js"; const Ajv2020 = ajvModule.default ?? ajvModule;`) or whatever the cleanest form is for ajv 8 under NodeNext. Verify the script still runs, not just that it compiles: `npm run sources:check-manifests`.
- [ ] 1.2 Confirm `npm run typecheck` is clean with zero errors.

### Validation

`npm run typecheck` exits 0; `npm run sources:check-manifests` behaves exactly as before.

---

## Phase 2: Wire the gates into CI

### Tasks

- [ ] 2.1 Add an `atlas-data/ingest` job — extend `check-manifests.yml` or add `ingest-ci.yml`, path-filtered to `atlas-data/ingest/**` — running `npm ci`, `npm run typecheck`, and `npm test`.
- [ ] 2.2 Pin that job to **Node 22** initially (see Problem Summary §3), then see phase 3 — the platform target is the latest LTS.
- [ ] 2.3 Raise the `engines.node` floor in `atlas-data/ingest/package.json` to `>=22` and note it in [`contributors/setup.md`](../../../contributors/setup.md), so a contributor on Node 20 gets a clear message instead of a rolldown `SyntaxError`.
- [ ] 2.4 Deliberately break a test locally and confirm the new job fails — an unverified gate is the thing this PLAN exists to fix.

### Validation

A PR that breaks a test or a type goes red. A clean PR goes green.

---

---

## Phase 3: Move to the platform Node target (conformance C12)

**Platform decision, 2026-08-23**: Terje set a new conformance rule **C12 — Node = latest LTS**, currently **Node 24 (Krypton)**. Atlas's `>=22` finding (Problem Summary §3) is what prompted it. The fleet machines' default moves to 24 once the active projects validate, so Atlas validating is a prerequisite, not a follow-on.

⚠️ Not to be done mid-phase of another plan — ops was explicit that runtimes don't change under active work.

### Tasks

- [ ] 3.1 Validate Atlas on Node 24: `npm ci`, `npm run typecheck`, `npm test`, and a representative `npm run ingest:<source>` against a real database. Vitest 4 / rolldown and the native bindings are the likely friction points, plus anything in the Crawlee stack used by `redcross-branches`.
- [ ] 3.2 Bump `engines.node` and the CI job to 24; update [`contributors/setup.md`](../../../contributors/setup.md).
- [ ] 3.3 Check the polyglot Dagster image — `atlas-data/deploy/Dockerfile` builds its Node stage on `node:20-slim`. Under C12 that becomes the LTS too, which means a rebuild and a new code-location image tag.
- [ ] 3.4 Report the result to ops so the machine default can move.

### Validation

Full gate suite green on Node 24, and the image builds and boots its gRPC server on the same runtime.

---

## Acceptance Criteria

- [ ] `npm run typecheck` passes on `main`.
- [ ] CI runs typecheck + the 99 unit tests on every PR touching `atlas-data/ingest/**`.
- [ ] The CI job runs on a declared Node version, the floor is declared in `package.json` and documented, and phase 3 has moved both to the C12 target (latest LTS).
- [ ] The gate is demonstrated failing on a deliberate break, not assumed to work.

## Out of Scope

- The dbt gates (`dbt build`, `check-osmosis.sh`) — they need a live database in CI, which is its own decision.
- The 194 Dependabot advisories GitHub reports on the default branch. Real, and separate.
