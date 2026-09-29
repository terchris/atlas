# Plan 010: the indicator-catalogue fixes that need no decision

The four items from the Samfunnspuls gap report that are unambiguous — a missing fylke key, an indicator with no values, a hidden classification hierarchy, and a population table absent from the catalogue.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Depends on**: nothing. Deliberately carved out of
[INVESTIGATE-samfunnspuls-replacement-gaps](INVESTIGATE-samfunnspuls-replacement-gaps.md) so it is
not held behind [Q1]–[Q5], which all need Terje.

**Last Updated**: 2026-09-29

## Problem Summary

An outside consumer rebuilt Samfunnspuls on Atlas and listed eight gaps. Five need a decision.
**These four do not** — they are defects or omissions with one obviously correct answer, and each
cost that consumer real work.

⚠️ **One of them is the opposite of what the report asked for**, and is the most valuable item
here. See Phase 2.

## Phase 1: `kommune_ngo_totals` gains its fylke keys

### Tasks
- Add `fylke_nr` and `fylke_name` to `mart_kommune_ngo_totals`, joined from `dim_kommune`, matching
  the shape the indicator relations already have.
- Document both columns.

🔵 The consumer had to join `kommune_ngo_totals` against `kommune_befolkning_alder` purely to get a
fylke name — joining a supply relation to a population table to obtain geography neither owns.

### Validation
- `GET /kommune_ngo_totals?select=kommune_nr,fylke_nr,fylke_name&limit=1` returns all three.
- Row count unchanged at 357.
- `fylke_nr` is null for no active kommune.

## Phase 2: 🔴 publish the classification depth that `¬` encodes

### Tasks
- Add `hierarchy_level` to the crime indicator relations: the count of leading `U+00AC` in
  `contents_label`, as a **derived column beside** the verbatim label.
- **Leave `contents_label` exactly as SSB publishes it.**
- State on the relation that rows of differing `hierarchy_level` are a hierarchy and **must not be
  summed**.
- Explain the marker in `meta_dimensions` for the crime sources.

🔴 **Do not strip the character.** Measured on `indicators__ssb_08484`: 0 `¬` is
"Alle lovbruddsgrupper" (the total), 5 `¬` is "Tyveri fra fritidsbolig" (a leaf). It is correctly
encoded `U+00AC`, not mojibake, and it is the **only** thing distinguishing a total from its own
components. Removing it would edit source data *and* make silent over-counting easier.

### Validation
- `hierarchy_level` is 0 for `1AAAAA-9ZZZZz__*` and 5 for `1ABEBZ__*`.
- `contents_label` is byte-identical to before the change for all 37 distinct labels.
- A test asserts that no crime `contents_label` has had characters removed.

## Phase 3: the empty indicator and the absent population table

### Tasks
- `ssb-12063` / `KOSfritidredleie0000` has `kommuner_with_value = 0` — exactly one such indicator.
  Decide between excluding it from `indicator_summary` and flagging it; **flag, do not delete**,
  so its absence stays visible rather than becoming another silent omission.
- `ssb-07459` is absent from `indicator_summary` and reachable only through
  `kommune_befolkning_alder`. Say so in the catalogue, so a generic client is not left concluding
  Atlas has no population data.

### Validation
- A generic client reading only `indicator_summary` can tell that `KOSfritidredleie0000` has no
  values without querying it.
- Searching the catalogue for population finds a pointer to `kommune_befolkning_alder`.

## Phase 4: the discontinued crime code system

### Tasks
- `ssb-crime-tables` carries 2014-era codes (`01__…`, covering 64–83 kommuner) alongside 2025 codes
  (`1AAAAA-9ZZZZz__…`, 283–356 kommuner).
- Mark the older series `discontinued` rather than removing it — old series remain correct for the
  years they cover, and a consumer joining historical data needs them.

⚠️ The kommune counts are the tell: a 2025 series covering 64 kommuner would look like a coverage
defect. It is a retired classification.

### Validation
- Every crime indicator carries an explicit era marker.
- No row is deleted.

## Acceptance Criteria

- [ ] `kommune_ngo_totals` exposes `fylke_nr` and `fylke_name`; 357 rows unchanged
- [ ] `hierarchy_level` published; `contents_label` byte-identical; a test enforces that
- [ ] The relation says that differing levels must not be summed
- [ ] The one valueless indicator is flagged, not deleted
- [ ] `indicator_summary` points at `kommune_befolkning_alder` for population
- [ ] Retired crime codes are marked `discontinued`, none removed
- [ ] Every new column documented; all gates green
- [ ] 🔴 Deploy request names, per relation, what should appear and the expected count

## ⚠️ Not in this plan, on purpose

[Q1] time series · [Q2] fylke and national values · [Q3] unit metadata · [Q4] the 15 missing
sources · [Q5] titles and topics. All need Terje. Carving them out is what lets this plan ship
without waiting.
