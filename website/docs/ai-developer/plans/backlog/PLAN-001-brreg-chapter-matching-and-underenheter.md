# Plan 001: Brreg chapter matching + brreg-underenheter

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Give every one of the 11 NGOs in `dim_ngo` a registry-sourced chapter row — the nine
federated NGOs from `dim_brreg_enhet` (already ingested, pure dbt derivation, no new ingest) and the
two unitary NGOs (Frelsesarmeen, Kirkens Bymisjon) from a new `brreg-underenheter` source — *before*
any NGO site is scraped. This is explicitly first in the build order per
[Q7](INVESTIGATE-ngo-research-handover.md#questions-to-answer) and lands P1 and P4 of
`atlas-model-proposals.md`.

**Last Updated**: 2026-10-04

**Investigation**: [INVESTIGATE-ngo-research-handover.md](INVESTIGATE-ngo-research-handover.md)
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

- [ ] 1.1 Add `structure` column to `atlas-data/dbt/seeds/dim_ngo.csv`: `unitary` for
      `frelsesarmeen` and `kirkens-bymisjon`, `federated` for the other 9.
- [ ] 1.2 `schema.yml`: `accepted_values` test (`federated`, `unitary`), `not_null`.
- [ ] 1.3 While touching this seed: correct `redcross`'s `chapter_data_shape` from `api_canonical`
      (wrong since [Q3] — Røde Kors is scraped like every other NGO now) to whatever the site-crawl
      PLAN will actually use (flag as a note for that PLAN if the value isn't decidable yet; don't
      guess a value this PLAN can't verify).

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

- [ ] 2.1 `ref_atlas_ngo_match_rule.csv`: one row per federated NGO —
      `ngo_orgnr, include_pattern, exclude_pattern, strong_pattern, website_host`, transcribed
      verbatim from `brreg-chapter-matching.md`'s per-NGO rule table (9 rows).
- [ ] 2.2 `int_ngo_chapter_registry_match.sql` over `dim_brreg_enhet` filtered to
      `registrert_i_frivillighetsregisteret = true`: fold Ø/Æ/Å before pattern matching (the spec's
      rule 1 — Atlas's existing `kommune` folding macro may already do this; check before writing a
      second one), apply include/exclude/strong per NGO, emit `chapter_level` from the
      DISTRIKT/FYLKESLAG/… keyword rule, `related_entity` for `organisasjonsform_kode` in
      (`AS`,`STI`), `confidence` per the spec's three-tier rule (never present `low` as fact — carry
      the column, let the consuming query decide what to trust).
- [ ] 2.3 Test: a parametrised `dbt_utils.accepted_range` or custom test per NGO against
      `acceptance-targets.csv`'s `enheter`/registered-chapters column, ±10% per [Q9] (or an explained
      gap in this PLAN's own notes — the register moves between the research's measurement and this
      build).
- [ ] 2.4 Confirm Ø/Æ/Å folding specifically on Røde Kors (the spec's own example of a silent
      all-zero match) and Sanitetskvinnene (N K S acronym variant).

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

### Tasks

- [ ] 3.1 New migration `raw.brreg_underenheter_*`, same shape/pattern as the existing
      `brreg-enheter-alle` migration — check that migration file first and mirror it field-for-field
      rather than redesigning.
- [ ] 3.2 New ingest module `atlas-data/ingest/src/sources/brreg-underenheter/` — bulk file +
      change feed, same pattern as `brreg-enheter-alle`'s own ingest module (copy its structure, this
      is explicitly "the same pattern" per the spec, not a novel design).
- [ ] 3.3 Register in Dagster (`raw_brreg.py` or wherever `brreg-enheter-alle` is registered —
      follow the exact pattern that broke silently for `ssb-10501`/`ssb-12891` earlier this session:
      **verify the new source is in a named job's selection, not just defined as an asset**, using
      `atlas-data/uis/lands-with.sh` before calling this done).
- [ ] 3.4 `int_ngo_chapter_subunits.sql`: filter `overordnet_enhet in (select orgnr from dim_ngo
      where structure = 'unitary')`, emit the parent entity as the national row (spec rule 2 — 723
      orphans in the research without this), split `<BRAND> <AREA> AVD <UNIT>` per spec rule 3
      (longest area first), classify owned companies (`FRETEX…AS`) as `related_entity` not chapter.
- [ ] 3.5 Same column shape as Phase 2's output, so a later `UNION ALL` needs no reshaping.

### Validation

```bash
dbt build --select brreg_underenheter+ int_ngo_chapter_subunits
dbt show --inline "select ngo_orgnr, count(*) from int_ngo_chapter_subunits group by 1"
```
Expect 175 (Frelsesarmeen) and 151 (Kirkens Bymisjon), per `acceptance-targets.csv` and
`brreg-underenheter.md`'s own table — a fresh run will differ somewhat; a large gap is the signal
per [Q9], not a number to force.

Separately: run `atlas-data/uis/lands-with.sh origin/main..HEAD` before this PLAN's PR and confirm
`brreg-underenheter` is named under a real Dagster job, not only `__ASSET_JOB` — the exact gap this
session caught for `ssb-10501`/`ssb-12891` on PR #550.

---

## ⚠️ Overlap with INVESTIGATE-all-brreg-organisations — check before starting Phase 3

`INVESTIGATE-all-brreg-organisations.md` is an **already-decided, larger, separate initiative**:
Terje decided 2026-09-11 to ingest the **full** Enhetsregisteret (1,174,098 `enheter`, already
shipped as `PLAN-001-brreg-bulk-snapshot`) **and** the full `underenheter` register (862,903 rows),
with `underenheter` explicitly named as "a named follow-on" — not yet spawned as its own PLAN at
the time of writing, but decided and scoped.

This PLAN's Phase 3 proposes a **narrower** `brreg-underenheter` source, filtered in practice to
two NGOs (~326 rows). Building it independently risks either duplicating that follow-on PLAN when
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

- `brreg-underenheter` benefits every unitary organisation in the register, not just these two —
  out of scope for this PLAN, noted for whoever next needs unitary-org data.
- Precision for the nine federated NGOs' registry match is only measured end-to-end for Røde Kors
  (93.6%/95.4%); the other eight are validated via `both` (confirmed by their own site) in the next
  PLAN, not by an independent precision figure here.
