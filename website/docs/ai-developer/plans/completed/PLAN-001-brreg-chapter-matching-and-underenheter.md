# Plan 001: Brreg chapter matching + brreg-underenheter

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed 2026-10-05 (#557, #558). All three deliverables shipped: `dim_ngo.structure`,
`int_ngo_chapter_registry_match`, `brreg-underenheter` + `int_ngo_chapter_subunits`.
`int_ngo_chapter_reconciled` (joining against each NGO's own site crawl) was explicitly out of
scope for this PLAN and is a separate, not-yet-started PLAN.

**Goal**: Give every one of the 11 NGOs in `dim_ngo` a registry-sourced chapter row — the nine
federated NGOs from `dim_brreg_enhet` (already ingested, pure dbt derivation, no new ingest) and the
two unitary NGOs (Frelsesarmeen, Kirkens Bymisjon) from a new `brreg-underenheter` source — *before*
any NGO site is scraped. This is explicitly first in the build order per
[Q7](INVESTIGATE-ngo-research-handover.md#questions-to-answer) and lands P1 and P4 of
`atlas-model-proposals.md`.

**Last Updated**: 2026-10-04

**Investigation**: [INVESTIGATE-ngo-research-handover.md](../backlog/INVESTIGATE-ngo-research-handover.md)
(method: `docs/research/ngo-research/ingestion-specs/brreg-chapter-matching.md` and
`brreg-underenheter.md`)
**Prerequisites**: None — `dim_brreg_enhet` is live today; `brreg-underenheter` is new NLOD data,
no scraping involved.
**Blocks**: Every per-NGO site PLAN (reconciliation needs registry rows to join against) and P8's
`chapter_data_shape` correction for `redcross` (needs the NGO's structure column this plan adds).
**Priority**: High — first item in the handover's Next Steps.

⚠️ **Check before starting**: `INVESTIGATE-semantic-foundation-before-expansion.md` (backlog,
last updated 2026-04-25, never decided) proposes freezing NGO supply-source expansion beyond
Folkehjelp until cross-NGO activity taxonomy, `chapter_subtype` vocabulary and dbt contract scope
are settled — its own [Q4] is the cross-NGO taxonomy question the now-merged taxonomy PR (#555)
answers. This PLAN (pure Brreg registry derivation, no site crawl, no `chapter_subtype`
promotion, no taxonomy adoption) does not touch any of the frozen decisions directly, so it should
be safe regardless — but the freeze proposal itself was never resolved one way or the other, and
Terje's own instruction to incorporate PRs #553–555 is the kind of event that investigation's
[Q2] asked about. Flagged to Terje directly in the #1844 report rather than resolved here.

---

## Overview

Three deliverables, each independently testable before the next starts:

1. **`dim_ngo.structure`** (`federated` / `unitary`) — a one-column seed addition. Drives which path
   a given NGO takes in steps 2 and 3. Federated: Røde Kors, Folkehjelp, Diabetesforbundet, Mental
   Helse, LHL, 4H Norge, Speiderforbundet, Sanitetskvinnene, Nasjonalforeningen. Unitary:
   Frelsesarmeen, Kirkens Bymisjon.
2. **`int_ngo_chapter_registry_match`** (dbt model, no new ingest) — the nine federated NGOs' chapters
   out of `dim_brreg_enhet`, by the per-NGO name rule in `ref_atlas_ngo_match_rule` (a new seed, one
   row per NGO so adding NGO #12 is a seed row, not code — per the spec's own recommendation).
3. **`brreg-underenheter`** (new ingest source, same shape as `brreg-enheter-alle`) +
   `int_ngo_chapter_subunits` (dbt model filtering to the two unitary NGOs via `dim_ngo.structure`).

Both (2) and (3) emit the same column shape (`chapter_orgnr`, `ngo_orgnr`, `name`, `chapter_level`,
`chapter_type`, `kommune_nr`, `is_active`, `confidence`, `registration`, `reconciliation`,
`parent_chapter_id`, `source_url`) so a later `int_ngo_chapter_reconciled` (next PLAN, joins against
each NGO's own site crawl) can `UNION ALL` them without per-source special-casing.

**Not built in this PLAN** (deferred, each to its own later PLAN per the investigation's Next
Steps): any site crawl, `description-redaction`, geocoding, `dim_chapter_contact`. `dim_chapter`
itself keeps its current Red-Cross-only wrapper until the first site-crawl PLAN reconciles against
these registry rows — this PLAN populates `int_` models only, nothing public-facing changes.

**Decision-points specific to this PLAN**:

- **[P001.Q1]** `ref_atlas_ngo_match_rule` as a seed vs. hardcoded CTEs. Recommendation: seed —
  the spec's own reasoning (a new NGO is a row) matches this repo's existing preference for
  data-driven over code-driven per-entity rules (e.g. `_sources_manifest.csv`).
- **[P001.Q2]** Where `brreg-underenheter`'s raw table(s) land. Recommendation: mirror
  `brreg-enheter-alle` exactly — same migration pattern, same `raw.brreg_underenheter_*` naming,
  same bulk-file-preferred-over-paging approach — so this is boring, not novel.
- **[P001.Q3]** Confidence values are stated by the spec (`high`/`medium`/`low` by corroboration
  signal) — implement as written, don't re-derive a scoring function.

---

## Phase 1: `dim_ngo.structure` seed column

### Tasks

- [x] 1.1 Add `structure` column to `atlas-data/dbt/seeds/dim_ngo.csv`: `unitary` for
      `frelsesarmeen` and `kirkens-bymisjon`, `federated` for the other 9.
- [x] 1.2 `schema.yml`: `accepted_values` test (`federated`, `unitary`), `not_null`.
- [x] 1.3 While touching this seed: corrected `redcross`'s AND `nasjonalforeningen`'s
      `chapter_data_shape` to `cms_bins` (both are scraped, not API-sourced, per [Q3]/P8).

### Validation

```bash
cd atlas-data/dbt
dbt build --select dim_ngo
dbt show --inline "select slug, structure from dim_ngo order by structure, slug"
```
Confirms 9 `federated` / 2 `unitary`, matching the NGO list above exactly.

---

## Phase 2: `ref_atlas_ngo_match_rule` seed + `int_ngo_chapter_registry_match`

### Tasks

- [x] 2.1 `ref_atlas_ngo_match_rule.csv`: one row per federated NGO —
      `ngo_orgnr, ngo_slug, include_pattern, exclude_pattern, strong_pattern, website_host`,
      transcribed verbatim from `brreg-chapter-matching.md`'s per-NGO rule table (9 rows).
- [x] 2.2 `int_ngo_chapter_registry_match.sql` over `dim_brreg_enhet` filtered to
      `registrert_i_frivillighetsregisteret = true`: folds Ø/Æ/Å via a new
      `fold_norwegian_for_matching` macro (no existing one did this for matching keys), applies
      include/exclude/strong per NGO, emits `chapter_level` from the DISTRIKT/FYLKESLAG/… keyword
      rule, `related_entity` for `organisasjonsform_kode` in (`AS`,`STI`), `confidence` per the
      spec's three-tier rule.
      ⚠️ Two real bugs found building this, both against live data not fixtures: Postgres's `~`
      uses Tcl ARE, where `\b` is not a word boundary (`\y` is) — silently zeroed 8 of 9 NGOs'
      matches until translated in a `patterns_pg` CTE. And dbt's seed loader reads an empty CSV
      field as `NULL`, not `''` — `exclude_pattern != ''` was `NULL` (not `false`) for the 7 NGOs
      with no exclude pattern, and `WHERE NULL` drops the row exactly like `WHERE false`; fixed
      with `coalesce(exclude_pattern, '')`.
- [x] 2.3 `ngo_chapter_registry_counts_match_acceptance_targets.sql`: a singular test per NGO
      against the spec's targets, ±10% per [Q9].
- [x] 2.4 Confirmed Ø/Æ/Å folding on Røde Kors and Sanitetskvinnene — both land within 1 of target
      (382/381, 465/463) once the two bugs above were fixed; before the fix both were zero.

### Validation

```bash
dbt build --select int_ngo_chapter_registry_match
dbt show --inline "select ngo_orgnr, count(*) from int_ngo_chapter_registry_match group by 1"
```
Compare each count against `acceptance-targets.csv`'s `enheter` column (Sanitetskvinnene 463+,
Nasjonalforeningen 370, 4H 494, LHL 228, Mental Helse 188, Diabetesforbundet 117, Folkehjelp 107 —
Røde Kors and Speiderforbundet not given a registry-only count in that spec; use its
`brreg-chapter-matching.md` table instead, 381 / 393).

---

## Phase 3: `brreg-underenheter` ingest + `int_ngo_chapter_subunits`

**3.1–3.3 done 2026-10-04/05** (atlas) — the ingest half, ahead of Phase 1/2 at Terje's explicit
instruction ("do the underenheter... you must also create a job that updates it, just like the
other"). 3.4–3.5 (the actual reconciliation model) wait on Phase 1's `dim_ngo.structure` column,
not yet built.

### Tasks

- [x] 3.1 New migrations `072_raw_brreg_underenheter_snapshot.sql` +
      `073_raw_brreg_underenheter_change_feed.sql`, mirroring `brreg-enheter-alle`'s 052/053 field for
      field (snapshot table, feed watermark, oppdateringer log, versions history — all as separate
      tables from enheter's own, independent id space).
- [x] 3.2 New ingest modules `brreg-underenheter/` (bootstrap) and
      `brreg-underenheter-oppdateringer/` (change feed poller), mirroring `brreg-enheter-alle`'s and
      `brreg-oppdateringer`'s structure. One real finding beyond the mirror: a `Fjernet` entity can
      answer HTTP 410 rather than the HTTP-200 stub documented for `Sletting` — confirmed live, and
      the SAME is true for the existing enheter feed (its own "not 404 or 410" claim was wrong,
      corrected in `brreg-oppdateringer/parse.ts` while building this).
- [x] 3.3 Registered in Dagster — added to the EXISTING `BRREG_BULK_SOURCES` / `BRREG_DAILY_SOURCES`
      / `BRREG_FEED_SOURCES` lists in `raw_brreg.py`, so both sources ride the already-named
      `brreg_bootstrap` / `brreg_change_feed` jobs rather than needing a new job name. Verified, not
      assumed: `render-template-info.sh` reports "first_data covers all 59 automated sources" and
      `lands-with.sh` (once committed) names the right job — the exact gap that bit
      `ssb-10501`/`ssb-12891` on PR #550 does not recur here.
- [x] 3.4 `int_ngo_chapter_subunits.sql`: filters `raw.brreg_underenheter_snapshot` by
      `overordnetEnhet` to the two unitary NGOs (via `dim_ngo.structure`), emits the parent entity
      (from `dim_brreg_enhet`, since the national row is an ENHET not an UNDERENHET) as the
      national row, classifies `organisasjonsform_kode = 'AS'` (checked first, for Fretex) and
      HOVEDKONTOR/ADM-type names as `related_entity`, DIVISJON/REGION-type names as `regional`,
      else `local`. Lands within 1 of target (176/175 Frelsesarmeen, 151/151 Kirkens Bymisjon).
      **Two deliberate, documented gaps, deferred not silent**: no incremental reconciliation yet
      (reads the bootstrap snapshot only — deletions via the change feed aren't reflected here);
      area-splitting from spec rule 3 is simplified to literal `AVD`-suffix extraction, since
      nothing downstream renders chapter service areas yet.
- [x] 3.5 Same column shape as Phase 2's output — verified by construction (both models' final
      `select` lists match column-for-column) and by the acceptance tests passing identically.

### Validation — 3.1–3.3, done for real against live data, not simulated

- `npm run migrate` against a real local Postgres: all 73 migrations apply, `073` idempotent.
- `npm run ingest:brreg-underenheter` (no `--sample`): **867,000 rows** upserted from the real
  bulk file, matching the live API's `page.totalElements` exactly; watermark seeded at
  oppdateringsid 21,390,729. Re-run: identical row count, watermark correctly left alone
  ("a feed already ahead of this snapshot must not be moved").
- `npm run ingest:brreg-underenheter-oppdateringer`: caught up from the seeded watermark to the
  live feed's head in one run, **671 real changes** (Endring 441, Ny 127, Sletting 93, Fjernet 10),
  correctly reached the absent-`_embedded` caught-up state. Re-run: 0 changes, correctly caught up,
  no error. 10 of 671 entity fetches failed with HTTP 410 (all `Fjernet`) — handled as designed
  (`doc = null`, `classify(endringstype)` unaffected).
- `npx vitest run` on both new source directories: 29/29 pass.
- `render-template-info.sh`: fully green, "table counts agree (70 raw = migrations, 96 marts
  stated once)", "first_data covers all 59 automated sources".

Phase 3's own remaining validation (3.4/3.5, once built):

```bash
dbt build --select brreg_underenheter+ int_ngo_chapter_subunits
dbt show --inline "select ngo_orgnr, count(*) from int_ngo_chapter_subunits group by 1"
```
Expect 175 (Frelsesarmeen) and 151 (Kirkens Bymisjon), per `acceptance-targets.csv` and
`brreg-underenheter.md`'s own table — a fresh run will differ somewhat; a large gap is the signal
per [Q9], not a number to force.

---

## Overlap with INVESTIGATE-all-brreg-organisations — resolved 2026-10-04/05

`INVESTIGATE-all-brreg-organisations.md`'s own "underenheter, a named follow-on" is this: Phase
3.1–3.3 ingests the **full** underenheter register (867,024 rows, measured live), not a filtered
subset — `raw.brreg_underenheter_snapshot` holds every sub-unit in the country, and the NGO-specific
filter (`structure = 'unitary'`) only ever applies downstream, in the not-yet-built
`int_ngo_chapter_subunits` (3.4). That investigation's own follow-on is satisfied by this ingest;
its own doc has been updated to point here rather than naming a separate, still-to-be-spawned PLAN.

Original note, kept for the reasoning that shaped the design above:

This PLAN's Phase 3 proposed a **narrower** `brreg-underenheter` source, filtered in practice to
two NGOs (~326 rows). Building it independently risked either duplicating that follow-on PLAN when
it lands, or needing to be torn out and replaced by it. **Before starting Phase 3**, check whether
`INVESTIGATE-all-brreg-organisations.md`'s underenheter follow-on has a PLAN number yet:

- If it does, or lands first: skip this PLAN's Phase 3 entirely and filter the full-register model
  down to `dim_ngo`'s two unitary NGOs instead — same column shape, less to build.
- If it doesn't, and this PLAN needs to go first: build Phase 3 to the full-register shape (not an
  NGO-specific filter baked into the ingest), so the later full-register PLAN can absorb it rather
  than duplicate it — i.e., ingest `raw.brreg_underenheter_*` unfiltered, and do the two-NGO filter
  only in `int_ngo_chapter_subunits`, exactly as Phase 3's current task list already describes. This
  ordering is why Phase 3 is written the way it is above — confirm it still holds before starting.

---

## Open questions carried from the investigation

- `raw.brreg_underenheter_snapshot` already holds every unitary organisation in the register, not
  just the two NGOs this PLAN cares about — the ingest is unfiltered by design (see the overlap
  note above). Whoever next needs unitary-org data for a different purpose has the raw table
  already; only a new downstream model is needed, not a new ingest.
- Precision for the nine federated NGOs' registry match is only measured end-to-end for Røde Kors
  (93.6%/95.4%); the other eight are validated via `both` (confirmed by their own site) in the next
  PLAN, not by an independent precision figure here.
