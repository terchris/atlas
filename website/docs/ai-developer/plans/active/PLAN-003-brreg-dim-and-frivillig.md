---
mdx:
  format: md
---

# PLAN-003: Brreg dimension and Frivillighetsregisteret enrichment

Turns the raw register and its change feed into a current-state marts dimension, enriched for the voluntary sector, so Atlas's NGO population becomes derived instead of a hand-curated list of eleven.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — phases 1-3 built, phase 4 held on a database

Phases 1, 2 and 3 are implemented. Phase 4 is **deliberately incomplete**: its decisions are made and
written down, but rebuilding `dim_ngo` changes the upstream of four published `api_v1` views, and the
task that proves it improves them rather than breaking them needs a database this agent does not have.
Building it blind would be changing a public surface on an argument instead of a test.

**Goal**: `marts.dim_brreg_enhet` as reconciled current state, `marts.dim_ngo` derived rather than curated, and no new public endpoint.

**Last Updated**: 2026-09-12

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

> ✅ **Endpoint re-verified 2026-09-12, after imac reported it as 404** (urb-agents #711). It is not
> 404: three consecutive requests returned **200** with `icnpoKategorier`, `grasrotandel`,
> `innfoertDato`, `vedtekter` and `paategninger` on the record, and the single-organisation path
> `/frivillige-organisasjoner/<orgnr>` returns 200 as well.
>
> The four paths imac listed do 404 from here too — `/frivillighetsregisteret/api`, its
> `/dokumentasjon`, and the camelCase `/frivilligeOrganisasjoner` — but none of them is the endpoint
> above. **The hyphenated `frivillige-organisasjoner` is the one that answers.** Phase 3 stands as
> designed; do not redesign it around the 404.
>
> 🟢 **imac's underlying point holds and is the more useful half.** FRR *membership* needs no second
> source: `registrertIFrivillighetsregisteret` is on 100% of bulk records and true for **72,798**,
> against the ~72,806 this plan quotes. So phase 2's `dim_brreg_enhet` can carry membership on day one
> from the snapshot alone, and **phase 3 is only ever about the FRR-specific attributes** —
> `icnpoKategorier`, `grasrotandel`, `innfoertDato`, `vedtekter`. If this endpoint does disappear
> later, the membership half survives and only the enrichment half needs a rethink. That split is
> worth having designed in before it is needed.

## Phase 1: The measured decision ops-dev would not let me assume

🔴 **Whether the versions table earns its storage is a measurement, not a design preference**
(ops-dev, #711). Answer it with a number before building on either shape.

### Tasks

- [x] 1.1 ~~After PLAN-002 has run a week~~ — **no wait was needed, and the measurement is better than
      the one planned.** Daily volume is computable exactly from the feed itself: changes on day *D*
      equals `totalElements(from D)` minus `totalElements(from D+1)`. That is a count, not a sample,
      and it works on history. **Thirty days, measured 2026-09-12:**

      ```
      min             163      (a Sunday)
      median        2,704
      mean          3,022
      max          26,469      2026-08-12 — 8.8× the median
      30-day total 90,679
      annualised    1,103,261
      ```

      ⚠️ **The outlier is the interesting number.** One day carried 26,469 changes, nearly nine times
      the median. PLAN-002's 50,000-change run cap is therefore only **1.9× the worst observed day** —
      it holds, and a bulk registry event plus a two-day stall would reach it. That is the cap
      behaving correctly (it stops, reports, and the next run resumes), but nobody should be surprised
      by it.

- [x] 1.3 **What the versions shape costs, and what it buys.** Change mix over seven days (13,611
      changes):

      | | share |
      |---|---|
      | `Endring` | 75.9% |
      | `Ny` | 16.1% |
      | `Sletting` | 7.3% |
      | `Fjernet` | 0.7% |
      | **deletions combined** | **8.0%** |

      At the measured 1,708 bytes per document (PLAN-001 phase 1) and 1.10M changes a year:

      | | per year |
      |---|---|
      | change log **without** `doc` (~60 B/row) | **66 MB** |
      | versions **with** `doc` | **1.87 GB** |

      Against a 2.60 GB snapshot, so full-document history adds ~72% of the register's own size every
      year, and the change log alone is free.

      🔵 **And this explains the `Fjernet` mistake exactly.** `Fjernet` is 0.7% of traffic. The sample
      that produced "zero `Fjernet`" was the first 500 records of a 2,062-change day — 24% of the day,
      with an expected count of about four. Three agents generalised from it. **The fix was not more
      sampling; it was counting.**

- [x] 1.4 **Decision: keep `raw.brreg_enheter_versions` append-only, with documents.** Three reasons,
      in order of weight:

      1. 🔴 **The alternative breaks a stated contract.** Current-state-only upsert makes `marts`
         unrebuildable from `raw`, and "raw is a landing layer you can rebuild marts from" is not a
         preference in this repo.
      2. **The asymmetry.** Storage kept can be pruned later; history not kept is gone. At 1.87 GB in
         year one this is affordable, and the reversible direction is the one to take first.
      3. Deletions are **only** expressible here — 8.0% of changes — so some version row is required
         regardless. The question was only whether to carry `doc`, and dropping it would mean
         re-fetching every changed entity to rebuild current state.

      ⚠️ **The number that would change this: 2 GB.** The measurement says the table reaches it in
      about twelve months. Revisit retention then — with a count, not an estimate — rather than when a
      disk fills.

- [ ] 1.2 ⬜ **Needs a database — imac.** Build the model both ways on a copy and compare storage and
      `dbt run` duration. The storage half is estimated above from measured inputs; the `dbt run`
      duration is not, and cannot be from here. **If the reconciling model turns out materially slower
      than a current-state upsert, 1.4 is worth re-opening** — that is the one input I could not get.

### Validation

A decision recorded with measured numbers beside it. ✅ Done for storage and churn; ⬜ the duration
comparison is imac's, and is named as the thing that could reverse it.

---

## Phase 2: The current-state dimension

### Tasks

- [x] 2.1 dbt model → `marts.dim_brreg_enhet`, keyed on `organisasjonsnummer`.
- [x] 2.2 🔴 **`Sletting` is a filter, not a `DELETE`.** A tombstoned organisation is excluded from
      current state and remains in the version history.
- [x] 2.3 Type the fields Atlas actually uses out of `doc jsonb` — `navn`, `organisasjonsform.kode`,
      `naeringskode1.kode`, `forretningsadresse.kommunenummer`, `antall_ansatte`, `konkurs`,
      `under_avvikling`, `registrert_i_frivillighetsregisteret`. **Leave the rest in `jsonb`** rather
      than flattening all 44 — the fields nobody selected stay available.
- [x] 2.4 `schema.yml` with a description per column. The dbt-osmosis gate enforces it repo-wide and
      will fail otherwise.
- [x] 2.5 Join `forretningsadresse.kommunenummer` to `dim_kommune`. ⚠️ Expect misses: this is the same
      family as the 47 non-kommune codes in
      [INVESTIGATE-ssb-pseudo-regions](../backlog/INVESTIGATE-ssb-pseudo-regions.md) — configure
      `severity: warn`, do not fail the build, and do not invent an answer to a question that is open
      with Terje (#700).

### One field that would have been flattened wrongly

⚠️ `antallAnsatte` is on only **~4%** of records (13 of 300 sampled live), while
`harRegistrertAntallAnsatte` is on **100%**. So NULL means *"not reported"*, not zero — and a coverage
analysis reading NULL as 0 understates staffed organisations badly. Both columns are kept so the
distinction survives. Found by counting key frequency across 300 live records instead of reading one
and generalising, which is the same discipline that the `Fjernet` mistake was missing.

### Validation

- ✅ `dbt parse` resolves the model, its sources and the whole DAG; every column carries a description
  for the osmosis gate.
- ⬜ **Needs a database — imac.** `dbt compile` and `dbt run` cannot execute from here (no Postgres, no
  container runtime). Row count equals live `totalElements` minus tombstones, ±the day's churn, and no
  tombstoned orgnr appears in current state.

---

## Phase 3: Frivillighetsregisteret enrichment

### Tasks

- [x] 3.1 Ingest module for `/frivillighetsregisteret/api/frivillige-organisasjoner`, paged,
      extending `lib/brreg/` (**[Q24]**). `manifest.yml` with NLOD licence and attribution.
- [x] 3.2 Land in `raw.brreg_frivillige`. **Check whether this register has its own
      change feed** — if it does, it belongs in PLAN-002's shape; if not, a daily full re-page of
      ~72,806 is cheap.
- [x] 3.3 `marts.dim_brreg_enhet` LEFT JOIN the enrichment on `organisasjonsnummer` — adding
      `icnpo_kategori`, `grasrotandel`, `innfoert_dato`.
- [x] 3.4 🔵 **Re-judge [Q26] with the evidence, do not inherit it.** Candidate #9 records a
      sequencing dependency on the SDG/ICNPO tagging investigation producing a crosswalk. The register
      supplying ICNPO natively **may shrink that to a mapping table**. Whoever does this decides and
      writes down which — the dependency is not automatically discharged.

### 🔴 The two Brreg APIs are opposites, and the opposite mistake is available in each

Measured 2026-09-12, and this is the finding phase 3 turns on:

| | `oppdateringer/enheter` | `frivillige-organisasjoner` |
|---|---|---|
| `page=` | works, **capped at 20** — the trap | **rejected, HTTP 400 even at `page=0`** |
| `_links.next` | built with `page=` — the trap | **`searchAfter=`, the only way to walk** |
| `size` max | ≥ 10,000 | **100** (101 → 400) |
| `page` block | present, `totalElements` usable | **absent — no backlog signal at all** |

So PLAN-002's poller must **never** follow `_links.next`, and this source must do **nothing else**. A
house rule of either *"always follow next"* or *"never follow next"* would be wrong for exactly one of
the two. Each module states its own reason and carries its own absence-guard rather than inheriting a
rule — this is the **third** such guard, and the first that guards the opposite property to its
neighbour.

**3.2 answered:** the register has **no change feed and no bulk download** — `/oppdateringer`,
`/oppdateringer/frivillige-organisasjoner` and `/frivillige-organisasjoner/lastned` all 404. A full
re-walk is the only option: ~727 requests at the size cap, a few minutes, upserting. Daily is cheap,
as the plan guessed — now measured rather than guessed.

**3.4 judged, not inherited:** the register supplies ICNPO natively, so **[Q26]'s dependency shrinks to
a mapping table** — `icnpo_nummer` → `ref_atlas_service_category` — rather than a derivation. It does
**not** discharge entirely: the ~1.1M organisations *not* in Frivillighetsregisteret still need the
NACE route, and that is where the crosswalk investigation still applies. Half discharged, and which
half is now written down.

### Validation

- ✅ Model, tests and manifest in place; 10 unit tests including the pagination absence-guard.
- ⬜ Every organisation with `registrert_i_frivillighetsregisteret = true` has an `icnpo_kategori` or a
  recorded reason why not — needs a database.

---

## Phase 4: Derive `dim_ngo`, and retire the duplicate

### Tasks

- [ ] 4.1 ⬜ **Deliberately not built yet.** Rebuild `dim_ngo` from `dim_brreg_enhet` filtered to the
      voluntary sector, retaining the Atlas-curated editorial fields (`tier`, `primary_focus`,
      `chapter_data_shape`) for the 11 that have them.

      🔴 **Why it is not built:** `dim_ngo` is the upstream of four **published** `api_v1` views, and
      4.3 below is the task that proves a rewrite improves them rather than breaking them. That proof
      needs a database this agent does not have. Writing the rewrite anyway would mean changing four
      public API surfaces on an argument rather than a test — which is exactly what the
      declare / apply / verify split exists to stop. **Phases 1-3 are usable without it**; `dim_ngo`
      keeps working as it does today until someone can run 4.3.
- [x] 4.2 🔴 **The two-table problem, resolved in writing: `raw.brreg_enheter` is subsumed, not kept.**

      The two tables hold Brreg data with different populations — the 122-row curated landing from a
      list of 11 NGOs, and the 1.17M-row register — and *"a second place that must agree"* is the
      failure this project keeps meeting.

      **`brreg_enheter_snapshot` ⊃ `brreg_enheter`**: every one of the 122 is in the 1.17M, with more
      fields and fresher data, plus the change feed keeping it current where the seed source is a
      monthly poll. The curated table has no column the snapshot lacks. So it survives only until
      `dim_ngo` is rebuilt on the snapshot, and it is retired in the same change — **not before**,
      because `dim_ngo` reads it today.

      ⚠️ Recorded as a decision now, executed with 4.1, because the order matters: retiring the table
      first breaks the dimension, and building the dimension first without retiring the table leaves
      exactly the duplication this task exists to prevent. Whoever does 4.1 does both.
- [ ] 4.3 ⬜ **imac.** Verify existing `api_v1` views improve rather than break: `ngo_index`,
      `ngo_overview`, `coverage_gap_barnefattigdom`, `indicator_missing_kommuner`. This is the gate on
      4.1, not a follow-up to it.
- [x] 4.4 ⚠️ **SUPERSEDED — Terje reversed this on 2026-09-12 and a new `api_v1` view now exists.**

      This task used to read, and was correct when written: *"No new `api_v1` view and no `schemas:`
      change. Terje decided no new public endpoint; the gain shows up in existing views getting
      better. Adding one is a separate reviewed act, and this plan is not it."*

      🔴 **It became a separate reviewed act.** Terje instructed directly that the whole register be
      published, explicitly including ENK, and reaffirmed it when the sole-proprietor point was put to
      him. His reason, verbatim: *"by norwegian law the info about ENK and other compenies are public
      information"* and *"the norwegian law outranks any rules in the kingdom of norway."*

      **What shipped:** `marts.mart_brreg_enhet` → `api_v1.brreg_enhet`, ~1.17M organisations, typed
      columns plus the full upstream `doc`. `schemas:` is unchanged — it was already `api_v1`, which
      is precisely why adding a view to that schema is publication rather than preparation.

      ⚠️ **Left as a superseded record rather than rewritten.** The contract in `project-atlas.md` is
      that `api_v1` additions are public exposure and wait for a named human. The value of that rule
      is entirely in the audit trail it leaves, so the reversal is recorded where the original
      decision lived — not tidied into looking as though the plan always said this.

      🔵 **One thing the publication triggered rather than deferred:** NLOD 2.0 requires attribution to
      accompany redistributed data. It had been parked in
      [INVESTIGATE-nlod-attribution](../backlog/INVESTIGATE-nlod-attribution.md) as a repo-wide gap,
      and parking it stopped being an option the moment Atlas republished Brreg openly. The attribution
      now rides in the view's own `COMMENT ON VIEW`, where PostgREST surfaces it in the OpenAPI output
      — a consumer querying the endpoint has no reason to go and find `meta_sources`, and a view
      comment costs nothing per row where a repeated column across 1.17M records would not.

### Validation

`ngo_overview` returns more than 11 NGOs; the 13 existing `api_v1` views still return 200 with the
same column contracts; `schemas: api_v1` unchanged in `template-info.yaml`.

---

## Out of scope

- **Underenheter** — follow-on plan (ops-dev, #711).
- **A public endpoint for the register** — Terje's decision, 2026-09-11.
- **NLOD attribution across Atlas** — [INVESTIGATE-nlod-attribution](../backlog/INVESTIGATE-nlod-attribution.md).
