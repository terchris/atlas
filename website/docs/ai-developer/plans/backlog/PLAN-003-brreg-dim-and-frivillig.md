---
mdx:
  format: md
---

# PLAN-003: Brreg dimension and Frivillighetsregisteret enrichment

Turns the raw register and its change feed into a current-state marts dimension, enriched for the voluntary sector, so Atlas's NGO population becomes derived instead of a hand-curated list of eleven.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: `marts.dim_brreg_enhet` as reconciled current state, `marts.dim_ngo` derived rather than curated, and no new public endpoint.

**Last Updated**: 2026-09-11

**Investigation**: [INVESTIGATE-all-brreg-organisations](../backlog/INVESTIGATE-all-brreg-organisations.md)
**Prerequisites**: PLAN-001 and PLAN-002 — there is nothing to reconcile without a snapshot and a feed
**Priority**: High

## Problem Summary

PLAN-001 and PLAN-002 leave `raw` holding three append-only tables: a snapshot, a change log, and a
version per changed organisation. **None of them is queryable as "the register as it stands today."**

This plan builds that, and then uses it for the thing the whole exercise is for: **`dim_ngo` is
currently a hand-written file of 11 NGOs**, so every coverage question Atlas asks is bounded by who
someone remembered to add. Atlas cannot answer *"which organisations work on child poverty in
Vestland"* — only *"which of these eleven do."*

### The second source

Terje chose the full register, which does **not** discard the voluntary-sector work — it makes the
design use **two** Brreg sources. Verified live 2026-09-11:

```
GET /frivillighetsregisteret/api/frivillige-organisasjoner
  → organisasjonsnummer, frivilligOrganisasjonsstatus, kontonummer, innfoertDato,
    foersteGangInnfoert, grasrotandel, regnskapsrapportering, vedtekter,
    icnpoKategorier, paategninger
```

🟢 **`icnpoKategorier` arrives natively** — `{"icnpoNummer": "9100", "kategori":
"ICNPOKategori.internasjonaleOrganisasjoner"}`. Enhetsregisteret does not carry it. This is
**candidate #9** of
[INVESTIGATE-new-norwegian-public-sources](../backlog/INVESTIGATE-new-norwegian-public-sources.md),
which is not superseded by Terje's decision — it is the enrichment half of it.

⚠️ `registrert_i_frivillighetsregisteret` in Enhetsregisteret says **which** organisations are
voluntary. Only the dedicated register says **what they do**. The flag is not a substitute.

## Phase 1: The measured decision ops-dev would not let me assume

🔴 **Whether the versions table earns its storage is a measurement, not a design preference**
(ops-dev, #711). Answer it with a number before building on either shape.

### Tasks

- [ ] 1.1 After PLAN-002 has run a week, measure `raw.brreg_enheter_versions` growth per day and
      extrapolate to 12 months.
- [ ] 1.2 Build the dbt incremental model **both ways** on a copy: reconciling from versions, and
      current-state-only with in-place upsert. Compare storage and `dbt run` duration.
- [ ] 1.3 Record what the versions shape buys that the other does not — *"what did this organisation
      look like before it was removed"* — and what it costs, in GB.
- [ ] 1.4 **Decide, with the numbers in the plan.** If versions lose, say so and drop them; do not
      keep them because this plan proposed them.

### Validation

A decision recorded with two measured numbers beside it, and the losing option deleted rather than
left as a comment.

---

## Phase 2: The current-state dimension

### Tasks

- [ ] 2.1 dbt incremental model → `marts.dim_brreg_enhet`, keyed on `organisasjonsnummer`.
- [ ] 2.2 🔴 **`Sletting` is a filter, not a `DELETE`.** A tombstoned organisation is excluded from
      current state and remains in the version history.
- [ ] 2.3 Type the fields Atlas actually uses out of `doc jsonb` — `navn`, `organisasjonsform.kode`,
      `naeringskode1.kode`, `forretningsadresse.kommunenummer`, `antall_ansatte`, `konkurs`,
      `under_avvikling`, `registrert_i_frivillighetsregisteret`. **Leave the rest in `jsonb`** rather
      than flattening all 44 — the fields nobody selected stay available.
- [ ] 2.4 `schema.yml` with a description per column. The dbt-osmosis gate enforces it repo-wide and
      will fail otherwise.
- [ ] 2.5 Join `forretningsadresse.kommunenummer` to `dim_kommune`. ⚠️ Expect misses: this is the same
      family as the 47 non-kommune codes in
      [INVESTIGATE-ssb-pseudo-regions](../backlog/INVESTIGATE-ssb-pseudo-regions.md) — configure
      `severity: warn`, do not fail the build, and do not invent an answer to a question that is open
      with Terje (#700).

### Validation

`dim_brreg_enhet` row count equals live `totalElements` minus tombstones, ±the day's churn. No
tombstoned orgnr appears in current state.

---

## Phase 3: Frivillighetsregisteret enrichment

### Tasks

- [ ] 3.1 Ingest module for `/frivillighetsregisteret/api/frivillige-organisasjoner`, paged,
      extending `lib/brreg/` (**[Q24]**). `manifest.yml` with NLOD licence and attribution.
- [ ] 3.2 Land append-only in `raw.brreg_frivillige`. **Check whether this register has its own
      change feed** — if it does, it belongs in PLAN-002's shape; if not, a daily full re-page of
      ~72,806 is cheap.
- [ ] 3.3 `marts.dim_brreg_enhet` LEFT JOIN the enrichment on `organisasjonsnummer` — adding
      `icnpo_kategori`, `grasrotandel`, `innfoert_dato`.
- [ ] 3.4 🔵 **Re-judge [Q26] with the evidence, do not inherit it.** Candidate #9 records a
      sequencing dependency on the SDG/ICNPO tagging investigation producing a crosswalk. The register
      supplying ICNPO natively **may shrink that to a mapping table**. Whoever does this decides and
      writes down which — the dependency is not automatically discharged.

### Validation

Every organisation with `registrert_i_frivillighetsregisteret = true` has an `icnpo_kategori` or a
recorded reason why not.

---

## Phase 4: Derive `dim_ngo`, and retire the duplicate

### Tasks

- [ ] 4.1 Rebuild `dim_ngo` from `dim_brreg_enhet` filtered to the voluntary sector, retaining the
      Atlas-curated editorial fields (`tier`, `primary_focus`, `chapter_data_shape`) for the 11 that
      have them.
- [ ] 4.2 🔴 **Resolve the two-table problem.** `raw.brreg_enheter` (the existing 122-row curated
      landing) and `raw.brreg_enheter_snapshot` would both hold Brreg data with different
      populations — *"the second place that must agree"* failure this project keeps meeting. Either
      subsume the old one or state in writing why both survive.
- [ ] 4.3 Verify existing `api_v1` views improve rather than break: `ngo_index`, `ngo_overview`,
      `coverage_gap_barnefattigdom`, `indicator_missing_kommuner`.
- [ ] 4.4 🔴 **No new `api_v1` view and no `schemas:` change.** Terje decided no new public endpoint;
      the gain shows up in existing views getting better. Adding one is a separate reviewed act.

### Validation

`ngo_overview` returns more than 11 NGOs; the 13 existing `api_v1` views still return 200 with the
same column contracts; `schemas: api_v1` unchanged in `template-info.yaml`.

---

## Out of scope

- **Underenheter** — follow-on plan (ops-dev, #711).
- **A public endpoint for the register** — Terje's decision, 2026-09-11.
- **NLOD attribution across Atlas** — [INVESTIGATE-nlod-attribution](../backlog/INVESTIGATE-nlod-attribution.md).
