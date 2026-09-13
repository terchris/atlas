---
mdx:
  format: md
---

# PLAN-003: Brreg dimension and Frivillighetsregisteret enrichment

Turns the raw register and its change feed into a current-state marts dimension, enriched for the voluntary sector, so Atlas's NGO population becomes derived instead of a hand-curated list of eleven.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — phases 1-3 built, phase 4 held on an editorial decision

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

### The decision 4.1 has to take, with its measured cost

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

- [ ] 4.1 ⬜ **Blocked on the A/B decision above, not on a database.** Rebuild the NGO population from
      `dim_brreg_enhet` filtered to `registrert_i_frivillighetsregisteret`, retaining the curated
      editorial fields for the 11 that have them via a left join on `orgnr`.

      `mart_ngo_index` already carries `has_supply` and `chapter_count` — 🔵 **the discriminator a
      wider population needs already exists and needs no new column.** A consumer wanting today's
      eleven asks for `has_supply = true`.

      ⚠️ **Previously recorded here as *"deliberately not built yet … that proof needs a database this
      agent does not have."*** Half of that stands: 4.3 still needs imac. The other half was wrong —
      what actually blocks 4.1 is that nobody has chosen A or B, and this agent should not choose,
      because the question is what the published view is for.
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
- [ ] 4.3 ⬜ **imac — the gate on 4.1.** Verify the three real `dim_ngo` consumers, not the four this
      task used to name (finding ② above): `api_v1.ngo_index` and `api_v1.ngo_overview` grow to the
      voluntary population with the eleven still present and `has_supply = true`;
      `api_v1.kommune_local_chapters` returns **byte-identical rows before and after**, because its
      inner join makes any change there a defect rather than an improvement.

      🔴 **That third check is the one worth running.** The first two confirm an intended change; only
      the unchanged view can reveal an unintended one.
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

      ⚠️ And the consequence that is not a build artefact: a dataset disappears from the public
      catalogue at `/data`. Retiring a source is a **published-surface change**, not only an internal
      cleanup, so it carries the same "wait for a human" weight as adding one. `installing-on-uis.md`
      mentions the table too and is hand-written, so it does not regenerate.

      ⚠️ The Dagster surface is smaller than it looks: `assets/dbt.py`, `schedules.py` and
      `raw_seeds.py` mention `brreg_enheter` mostly in **prose** — module docstrings explaining why the
      asset exists — and those explain a decision that stops being true here. Delete the wiring; read
      the comments before deleting them, because `raw_seeds.py` records that this was the first seed
      source wrapped in `recordIngestRun()` and that note applies to every future seed promotion, not
      to this table.

### Validation

`api_v1.ngo_index` and `api_v1.ngo_overview` return the voluntary population with the eleven curated
NGOs present and `has_supply = true`; `api_v1.kommune_local_chapters` returns byte-identical rows to
the run before; the other ten `api_v1` views still return 200 with unchanged column contracts;
`schemas: api_v1` unchanged in `template-info.yaml`; and after 4.5, `dbt build` passes with
`raw.brreg_enheter` gone from `sources.yml`.

⚠️ The previous validation line read *"`ngo_overview` returns more than 11 NGOs"*. Kept in substance,
but *"more than 11"* passes at 12 and at 72,798 alike — the row count is not the assertion worth
making. The assertion is that the eleven survive the widening **and** that the view which must not
change did not.

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
