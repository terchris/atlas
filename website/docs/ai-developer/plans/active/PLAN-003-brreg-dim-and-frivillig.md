---
mdx:
  format: md
---

# PLAN-003: Brreg dimension and Frivillighetsregisteret enrichment

Turns the raw register and its change feed into a current-state marts dimension, enriched for the voluntary sector, so Atlas's NGO population becomes derived instead of a hand-curated list of eleven.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — phases 1-3 built, 4.1 and 4.3 closed as already-satisfied, 4.5 outstanding

Phases 1, 2 and 3 are implemented and running on the half-hourly cadence. Phase 4 is **deliberately
incomplete**, and on re-reading the code against this plan on 2026-09-13, **not for the reason it
said**.

⚠️ It used to read: *"rebuilding `dim_ngo` changes the upstream of four published `api_v1` views, and
the task that proves it improves them rather than breaking them needs a database this agent does not
have."* Two of those four views reference `dim_ngo` nowhere, a third joins it inwardly and cannot
change, and the gate on the one real risk (4.3) does still need imac. But the thing actually blocking
4.1 is **not** the missing database: it is that widening the NGO population can land in `dim_ngo` or
in the marts, the two cost different tests, and choosing between them decides what `api_v1.ngo_index`
is *for*. That is an editorial call, and this agent should not make it. See finding ② and the A/B
table in phase 4.

🔵 **The opening question is nonetheless answered.** `api_v1.brreg_enhet` already publishes the whole
register with `registrert_i_frivillighetsregisteret`, `icnpo_kategori` and `kommune_nr`, so *"which
voluntary organisations are active where"* is one filtered request today. Phase 4 is about the shape
of the NGO-specific views, not about whether Atlas holds the population.

**Goal**: `marts.dim_brreg_enhet` as reconciled current state, the NGO population derived rather than
curated, and the curated/derived boundary legible in the schema.

**Last Updated**: 2026-09-13

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

- [ ] 1.2 ⬜ **Open. Lowest priority. Do not commission a host for it.**

      ⚠️ **THE 2026-09-13 RE-SCOPE WAS WRONG AND IS RETRACTED.** It said `_log_node_timings()` already
      emits what this needs, making 1.2 a read rather than a build. **It does not.** imac: *"Item 1.2
      asks a WITHIN-model question. Per-model timings give that model's TOTAL. They cannot decompose
      one model into its CTEs, on any host, clean or not."* 🔴 **Per-node means one figure per dbt
      model, and the versions reconciliation is a CTE inside one node.** I re-scoped a task to fit an
      instrument without checking that the instrument answered the question.

      **The two methods that do answer it:**

      | | cost |
      |---|---|
      | build the model twice on a copy, reconciliation CTE removed | a second 1.17M-row lineage |
      | `dbt --log-level debug`, per-statement timings inside the model | a read — but needs a **clean** host |

      🔴 **And the indirect route is ruled out, not merely unattractive.** Fitting dim build time
      against change volume across many runs would produce a number on a host where every run since
      02:51 had a split `raw` and the three clean runs measured the withdrawn `527455e` predicate.
      imac declined to offer it: *"a contaminated measurement would be worse than the argument, because
      it would look like evidence."* ⚠️ **That is this task's own rule, applied to this task, by
      someone else.**

      **Pricing, since it is mine to set:** the debug-log method on a clean host, **whenever a clean
      host exists for another reason.** A clean host today means a fresh install plus a bootstrap, and
      a bootstrap is the one thing currently under a do-not-retry hold
      ([INVESTIGATE-brreg-bulk-download-reliability](../backlog/INVESTIGATE-brreg-bulk-download-reliability.md)).
      **Spending a bulk download to price a CTE is the wrong trade.**

      ⚠️ **What the number can and cannot do, so whoever prices it later is not misled by this task's
      framing.** 1.4's first reason is a **contract** — current-state-only upsert makes `marts`
      unrebuildable from `raw` — so a bad number does not reverse 1.4 by itself; it forces a
      conversation about that contract. 🔵 **The realistic action from a bad number is retention
      pruning, which 1.4 already schedules at 2 GB / ~12 months.** That is why this is lowest priority
      rather than merely unscheduled.

      🔴 **It is still NOT closable on reasoning.** The tempting argument — the reconciling join touches
      only the ~57 organisations the feed changed, so the share must be small — is structurally the
      argument imac falsified at +42 s per run on `527455e`. **Low value is a reason to defer a
      measurement, never a reason to assume its result.**

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
- ✅ **The model builds and tombstones are excluded.** `dim_brreg_enhet` has been built repeatedly on a
  cluster — 1,174,007 organisations at stage 4 — and imac confirmed on urb-agents #839 that the 286
  snapshot rows absent from the dimension are **all tombstoned, zero with no feed row**. The
  `tombstoned_organisations_leave_the_dimension` test also runs as an asset check on every transform.
- ⬜ **Still open: the count against live `totalElements` on the same day.** Nobody has taken that
  comparison. ⚠️ It is easy to think stage 4 closed it — 1,174,007 looks like the right number — but
  that is Atlas's own count, not a comparison against the register, and the two arithmetic paths do not
  quite reconcile: 1,173,878 in the bulk file, +361 new organisations, −286 tombstones leaves 1,173,953
  against a dimension of 1,174,007, a gap of 54 that nobody has explained. 🔵 Probably a day's churn
  between the measurements, which is exactly what "±the day's churn" allows — **but "probably" is what
  this line exists to replace.**

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
- ⬜ **Open, and nobody has looked.** Every organisation with
  `registrert_i_frivillighetsregisteret = true` has an `icnpo_kategori` or a recorded reason why not —
  needs a database.

  ⚠️ **This is the only PLAN-003 item that could show the enrichment is incomplete rather than merely
  unverified.** The Enhetsregister flag is on 100% of records and the FRR walk is a separate paged
  source with a size cap, so the two populations can disagree silently: an organisation flagged
  voluntary but missing from the FRR fetch would carry a null `icnpo_kategori` and nothing would say
  why. 🔵 It is a two-column read against `dim_brreg_enhet`
  (`count(*) filter (where registrert_i_frivillighetsregisteret and icnpo_nummer is null)`), not a
  rebuild — cheap, and it has simply never been asked for.

---

## Phase 4: Derive the NGO population, and retire the duplicate

### 🔴 Read this before 4.1 — three things changed, and two of them are corrections to this plan

Phases 1-3 shipped between the writing of this phase and now. Re-reading the code against what
this phase *says* found two claims here that the code does not support, and one that makes the
phase smaller than it looked. Corrected in place, with the original claim left visible, because a
retraction that does not travel with its claim is not a retraction.

**① ✅ The population question is already served — by `api_v1.brreg_enhet`, not by `dim_ngo`.**

The published view carries `navn`, `kommune_nr`, `naeringskode1_kode`, `is_active`,
`registrert_i_frivillighetsregisteret`, `icnpo_nummer` and `icnpo_kategori` across all ~1.17M
organisations. *"Which voluntary organisations in ICNPO category X are active in kommune Y"* is one
filtered request against an endpoint that exists today. So the opening question of
[INVESTIGATE-all-brreg-organisations](../backlog/INVESTIGATE-all-brreg-organisations.md) — how Atlas
could hold every organisation in Brønnøysundregistrene — **is answered by what has already shipped.**

⚠️ I told ops-dev on urb-agents #805 that we had *"built the foundation for the question and not yet
answered it."* That was too pessimistic by one endpoint. What remains unanswered is narrower and
worth stating exactly: **not whether Atlas holds the population, but whether the NGO-shaped views
should widen to it.** That is an editorial and contract decision, not a data-availability one, and
it is the whole of 4.1.

**② ❌ 4.3 named two views that cannot be affected, and missed one that can.**

As written, 4.3 gated on `ngo_index`, `ngo_overview`, `coverage_gap_barnefattigdom` and
`indicator_missing_kommuner`. The last two build on `fact_kommune_indicators` and `dim_kommune` and
reference `dim_ngo` nowhere. The actual `ref('dim_ngo')` consumers are three:

| consumer | how it joins | effect of a wider population |
|---|---|---|
| `mart_ngo_index` | `from dim_ngo` + left join | **11 → ~72,798 rows** |
| `mart_ngo_overview` | `from dim_ngo` + left join | **11 → ~72,798 rows**, all-zero counts for the new ones |
| `mart_kommune_local_chapters` | **inner** join, driven by `fact_chapter_activities` | 🔵 **none** — it cannot grow |

The third is the useful correction: an inner join onto a widened dimension adds no rows, so one of
the three published views was never at risk. A gate pointed at two views that cannot change, while
one that can went unwatched, is this project's recurring failure shape — a correct check attached to
the wrong object.

**③ ✅ `raw.brreg_enheter` has no consumers, so retiring it is not blocked on 4.1.**

4.2 below says the curated table *"survives only until `dim_ngo` is rebuilt on the snapshot … **not
before**, because `dim_ngo` reads it today."* **`dim_ngo` does not read it.** `dim_ngo` is a seed CSV
(`seeds/dim_ngo.csv`, 11 rows); `raw.brreg_enheter` is referenced by **no dbt model at all** — only by
its own `sources.yml` declaration, a monthly Dagster seed asset, and the freshness test that watches
it. It is a monthly ingest job and a freshness clock maintaining a table nothing reads. The ordering
constraint 4.2 invents does not exist, and the retirement is now its own task (4.5) that can ship
without 4.1.

### ✅ The decision 4.1 had to take — settled 2026-09-13, reading 2 (see 4.1)

*"Derived rather than curated"* (Terje, 2026-09-11) is a statement about the **NGO population**. It
does not say which relation holds it, and the two readings cost different things. `dim_ngo` today
carries **nine tests** — `not_null` on `slug`, `name`, `website_url`, `tier`, `chapter_data_shape`,
`has_chapters`, `primary_focus`; `unique` on `orgnr` and `slug`; and `accepted_values` on `tier` and
`primary_focus` — and **six inbound `relationships` tests** point at `dim_ngo.orgnr` from
`dim_chapter`, `dim_activity`, `fact_chapter_activities` and two supply models.

🔵 The inbound six are safe under every option: a referential test against a **superset** still
passes. The cost is entirely in the outbound contract.

| | **A — `dim_ngo` becomes the population** | **B — the marts derive, `dim_ngo` stays editorial** |
|---|---|---|
| what holds ~72,798 rows | `dim_ngo` itself | `mart_ngo_index` / `mart_ngo_overview`, from `dim_brreg_enhet` |
| `unique(slug)` | 🔴 must invent a unique slug for 72,787 orgs; Brreg `navn` is **not** unique, so collisions are certain | ✅ untouched |
| `accepted_values(tier, primary_focus)` | 🔴 closed vocabularies from `ngo-landscape.md` with no register equivalent and no `unknown` member — needs a sentinel in each | ✅ untouched |
| `not_null` on editorial columns | 🔴 six break | ⚠️ five relax to nullable **in the mart** |
| `relationships(mart_ngo_overview.orgnr → dim_ngo)` | ✅ holds | ⚠️ must repoint to `dim_brreg_enhet` |
| the six inbound FK tests | ⚠️ still pass, but **silently weaken**: *"a chapter belongs to a curated NGO"* becomes *"…to any voluntary organisation"* | ✅ keep their meaning |
| tests touched | **9** | **6** |

⚠️ **Both options change a published contract the same way**, and that is the part no option avoids:
a consumer reading `tier` or `slug` from `api_v1.ngo_index` gets `null` for 99.98% of rows the day
this ships. Widening a view is not a backward-compatible act just because no column is removed.

**Recommendation: B.** It costs three fewer tests, it keeps the curated/derived boundary legible in
the schema rather than hidden behind sentinel values, and it leaves the six inbound FK tests saying
what they were written to say. 🔴 **It is a recommendation, not a decision** — the choice is
editorial (what `api_v1.ngo_index` is *for*), so it belongs to ops-dev or Terje, not to this agent.

### Tasks

- [x] 4.1 ✅ **CLOSED as already-satisfied — nothing to build.** ops-dev ruled **reading 2** on
      urb-agents #815 after their own A/B ruling turned out to be internally inconsistent, in their
      words: *"I rejected A for a property B-as-built shares, then asserted B did not have it."*

      🔴 **The reason it is satisfied rather than abandoned.** The opening question asked how Atlas
      could hold every organisation in Brønnøysundregistrene. It does — `api_v1.brreg_enhet` publishes
      all ~1.17M with `registrert_i_frivillighetsregisteret`, `icnpo_kategori`, `kommune_nr` and
      `is_active`, reconciled every half hour. **The NGO population IS derived; it is derived into its
      own endpoint rather than into this one.** Terje's stated gain — *"the NGO population becomes
      derived rather than curated"* — is delivered by the surface that carries it, not by making the
      curated index stop being curated.

      ⚠️ **Pointing `mart_ngo_index` at the same ~72,798 rows adds no capability.** It moves mechanical
      rows into the endpoint whose entire distinguishing feature is the editorial columns they would be
      null in. The ICNPO measurement is the argument and not a preference: 46 categories over ~72,798
      organisations is ~1,580 per category at the mean — a fine instrument for *"which sector"*, a
      blunt one for *"works on child poverty"*. Population problem solved mechanically; classification
      problem stays editorial; two surfaces, not one wide one.

      🔵 **A — widening `dim_ngo` itself — remains available to Terje as a product decision.** It is
      **not pending** and nobody is waiting on it. Its cost is the table in the section above.

      ✅ **What survives the closure, because it was right independently of the decision:** the two
      things found while building B are recorded in `mart_ngo_index.sql`'s header, where anyone
      proposing the widening again will read them before they start — that `has_supply` is an ingest
      outcome and not the curated/derived discriminator, and that a derived population here would sit
      up to 24 hours behind the half-hourly register. Neither is live today; both are exact.

      ⚠️ **What did NOT survive, and should not:** the built implementation (PR #266, closed unmerged),
      `is_curated`, and the `dim_brreg_enhet` dependency. They existed only to serve the widening.
- [x] 4.2 🔴 **The two-table problem, resolved in writing: `raw.brreg_enheter` is subsumed, not kept.**

      The two tables hold Brreg data with different populations — the 122-row curated landing from a
      list of 11 NGOs, and the 1.17M-row register — and *"a second place that must agree"* is the
      failure this project keeps meeting.

      **`brreg_enheter_snapshot` ⊃ `brreg_enheter`**: every one of the 122 is in the 1.17M, with more
      fields and fresher data, plus the change feed keeping it current where the seed source is a
      monthly poll. The curated table has no column the snapshot lacks.

      ⚠️ **Correction, 2026-09-13.** This task used to continue: *"So it survives only until `dim_ngo`
      is rebuilt on the snapshot, and it is retired in the same change — **not before**, because
      `dim_ngo` reads it today. … Whoever does 4.1 does both."* **`dim_ngo` does not read it, and no
      dbt model does** (finding ③ above). The decision to retire stands; the claimed dependency on
      4.1 does not, and the work moves to **4.5**, which can ship on its own.
- [x] 4.3 ✅ **Nothing left to gate — closed with 4.1.** This was the gate on a widening that is not
      happening: with `dim_ngo` unchanged, `mart_ngo_index`, `mart_ngo_overview` and
      `mart_kommune_local_chapters` are byte-identical to what they were, so there is no before/after
      to compare and no imac round to run.

      🔵 **The finding that produced it outlives it.** As written, this task gated on four `api_v1`
      views, two of which reference `dim_ngo` nowhere, while the one real consumer that joins it
      **inner** — `kommune_local_chapters` — was not named. If the widening is ever revisited, that is
      the check to run and the other two are noise: *the view that must not change is the only one that
      can fail informatively.* Recorded here rather than in a closed task's memory.
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

- [ ] 4.5 ⬜ **Retire `raw.brreg_enheter` — independent of 4.1.** Remove the `sources.yml` declaration,
      the monthly Dagster seed asset in `assets/raw_seeds.py`, its entry in `schedules.py`, and the
      seed source at `ingest/src/seed-sources/brreg-enheter/`; drop the table in a migration. The
      freshness test `raw_sources_were_refreshed_recently` stops watching it as a consequence of the
      `sources.yml` removal, not as a separate edit.

      ⚠️ **Verify before dropping, not after**: confirm on a cluster with data that
      `select count(*) from raw.brreg_enheter where orgnr not in (select organisasjonsnummer from
      raw.brreg_enheter_snapshot)` returns **0**. The superset claim in 4.2 is an argument from how
      the two sources are populated; this makes it a measurement. A table with no readers is safe to
      stop *maintaining* today and safe to *drop* only once that returns zero.

      🔴 **Two surfaces this task did not name when it was written, one of them CI-enforced.** A
      full-repo sweep — not a grep of `models/` — finds the source reaches the **public website** as
      well as the pipeline:

      - `website/src/data/sources-registry.json` and the generated pages under `website/docs/datasets/`.
        `.github/workflows/check-manifests.yml` regenerates both and **fails on any diff**, so removing
        the `sources.yml` entry without regenerating breaks CI rather than silently drifting. 🔵 That is
        the good case: the gate catches it.
      - `website/static/lineage/index.html`, generated via `docusaurus.config.ts`.

      ⚠️ **RETRACTED 2026-09-13: this is NOT externally visible, and the claim that it was is mine.**
      This task used to say *"a dataset disappears from the public catalogue at `/data`. Retiring a
      source is a published-surface change … the same 'wait for a human' weight as adding one."*
      **Measured, three ways, and all three say no:**

      | | |
      |---|---|
      | `source_id` in `website/src/data/sources-registry.json` | **absent** (44 sources; the brreg ones are `-alle`, `-frivillige`, `-oppdateringer`) |
      | page under `website/docs/datasets/` | **none** |
      | references in `api_v1_generated.sql` | **0** |

      🔴 **Why the claim was wrong, because the reasoning is the reusable part:** the registry is
      generated from **per-source ingest manifests** (`ingest/src/sources/<id>/manifest.yml`) plus the
      marts schema files — not from `dbt/models/shared/sources.yml`. `raw.brreg_enheter` is a *seed*
      source under `ingest/src/seed-sources/`, and it has **no manifest**. I had correctly established
      that dbt files feed the site generator and then assumed this source was among them without
      checking which generator input it belonged to.

      ✅ **So "catalogue" here means the dbt/UIS-internal source list. The count is sufficient and this
      is an engineering decision, not Terje's.** ⚠️ `installing-on-uis.md` mentions the table and is
      hand-written, so it still needs editing by hand.

      ⚠️ The Dagster surface is smaller than it looks: `assets/dbt.py`, `schedules.py` and
      `raw_seeds.py` mention `brreg_enheter` mostly in **prose** — module docstrings explaining why the
      asset exists — and those explain a decision that stops being true here. Delete the wiring; read
      the comments before deleting them, because `raw_seeds.py` records that this was the first seed
      source wrapped in `recordIngestRun()` and that note applies to every future seed promotion, not
      to this table.

### Validation

With 4.1 closed as already-satisfied, what remains to validate is **4.5 only**: `dbt build` passes
with `raw.brreg_enheter` gone from `sources.yml`, the superset count returns 0 before the table is
dropped, `schemas: api_v1` unchanged in `template-info.yaml`, and the catalogue regenerates cleanly
with the source removed.

🔵 **The thirteen `api_v1` views are not in this list, and that is the point of reading 2.** Nothing
in phase 4 changes them — `ngo_index`, `ngo_overview` and `kommune_local_chapters` are byte-identical
to what they were before this plan started. A phase that ends with no published view altered is the
outcome the decision chose, not a phase that failed to deliver.

⚠️ **Two earlier validation lines are superseded and left here as the record.** The first read
*"`ngo_overview` returns more than 11 NGOs"* — which passes at 12 and at 72,798 alike, so the row
count was never the assertion worth making. The second replaced it with the widened expectation (the
eleven surviving, `kommune_local_chapters` byte-identical). Both described a widening that reading 2
declined. The `kommune_local_chapters` check is preserved in 4.3 for whoever revisits it.

---

## 🔴 The upgrade path is invisible to everyone except imac

**Written down at ops-dev's instruction (urb-agents #784) rather than remembered, because it is a
property of how this project tests rather than a fact about one bug.**

On 2026-09-12 two defects shipped in `v20260912-2616c9c` and took `api_v1` to **zero views** on any
cluster that already held data. Neither was a careless mistake and neither was visible to the people
who wrote or reviewed them:

| | why it could not see the defect |
|---|---|
| **a fresh install** | there is no old table to preserve, so a schema-change defect cannot occur |
| **atlas (this agent)** | no database and no cluster — cannot run the upgrade at all |
| **CI** | builds and parses; never materialises a model over existing data |
| **imac** | installed onto a cluster with data — **the only party who could see it** |

⚠️ **So the install path everyone tests first is precisely the path that hides this class of defect.**

### What this means for any future change

🔴 **Anything that changes a model's SHAPE — a new column, a renamed one, a changed materialisation or
incremental strategy — is untestable by atlas and untestable by CI.** It must go to imac as an
**upgrade** test on a cluster with existing data, not as an install test.

**Concretely, the two that shipped:**

- **`on_schema_change` was unset**, so dbt's default `ignore` applied. Adding `reconciled_at` meant an
  existing table silently never gained it; the incremental run then succeeded into the old shape and
  everything downstream that read the column died. ⚠️ **The error surfaced two models away from the
  config that caused it**, so the natural place to start debugging was the wrong one. Now
  `on_schema_change='fail'` — see the model for why the obvious alternative is worse.
- **A repair by `--full-refresh` re-owns the objects.** It drops and recreates, so the tables take the
  running user's ownership. Run it as `atlas`; running it as a superuser leaves the next Dagster run
  with `permission denied`.

🔵 **And the reason the staged handoff caught it is not the one it was designed for.** It was justified
as *external blast radius* — a public surface deserves a verification step. The sharper reason, in
ops-dev's words, is that **"our entire test method is fresh-install, and an upgrade is a different
program."** The blast radius argument would not have applied to a purely internal model shape change;
this one does, and it is the reason worth keeping.

---

## Out of scope

- **Underenheter** — follow-on plan (ops-dev, #711).
- **A public endpoint for the register** — ~~Terje's decision, 2026-09-11~~ **reversed 2026-09-12**;
  see phase 4 task 4.4. `api_v1.brreg_enhet` is published.
- **NLOD attribution across Atlas** — [INVESTIGATE-nlod-attribution](../backlog/INVESTIGATE-nlod-attribution.md).
