# ssb-klass-endring

SSB Klass's **correspondence/change log** for kommune (131) and fylke (104) codes. urb-agents
#2098/#2099 (R6). Sibling to `ssb-klass-kommuner`/`ssb-klass-fylker`, which cover each code's own
validity window — this covers the actual transitions *between* codes.

## What the script does

Calls Klass's `/changes.json` endpoint for both classifications over the full 1950-2100 range,
tags each row with which classification it came from, and upserts into `raw.ssb_klass_endring`
verbatim.

## Known quirks

- **"The kind" of change is not a field Klass gives.** `/changes.json` returns `oldCode`,
  `oldName`, `newCode`, `newName`, `changeOccurred` — nothing resembling renamed/renumbered/merged/
  split/border. That classification is derived in dbt
  (`models/dimensions/dim_ssb_klass_endring.sql`), from the shape of same-date transitions, not
  computed here — raw stays verbatim.
- **A row's `old_code` is not unique, even within one date.** Measured 2026-11-08: 199 of 1,285
  kommune transitions since 1950 are part of BOTH a split (their own `old_code` also maps to a
  different `new_code` on the same date) and a merger (their own `new_code` is also fed by a
  different `old_code` on the same date) — a genuine boundary reorganisation, e.g. part of one
  kommune splitting off to merge into a different one while the rest keeps the original code.
- **`language=sme` is not a thing for this classification, checked directly.** If a future field
  list asks for Sami names via a separate language fetch the way this request's own wording
  suggested, don't build it — SSB's API returns HTTP 400 for it, and the combined Sami/Kven form
  (where one exists) is already inside the plain `name` field Klass serves in `nb`.

## References

- Changes endpoint (kommuner): `https://data.ssb.no/api/klass/v1/classifications/131/changes.json`
- Changes endpoint (fylker): `https://data.ssb.no/api/klass/v1/classifications/104/changes.json`
- Derivation method: see `atlas-data/dbt/models/dimensions/dim_ssb_klass_endring.sql`'s header
