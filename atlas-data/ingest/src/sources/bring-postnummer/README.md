# bring-postnummer

Posten Bring's **Postnummerregister**, verbatim, including the `kategori` column the existing
`dim_postnummer` seed drops. urb-agents #2098/#2099 (R2).

## Why this exists alongside `dim_postnummer`

`seeds/dim_postnummer.csv` (refreshed by `npm run refresh:bring-postnummer`, a separate script
under `src/seed-sources/`) is the **same upstream file**, but:

- it drops `kategori` (needed to tell a street address from a post box),
- it has no `meta_sources` row and no recorded licence,
- it is only as fresh as the last time someone ran the refresh script, with no visible date.

This source is the properly-provenanced, scheduled sibling. See
`atlas-data/migrations/075_raw_bring_postnummer.sql` for the full reasoning, and
`dim_postnummer`'s own published description for the pointer back.

**Not a replacement.** Two existing models (`mart_dim_postnummer`, `supply__redcross_branches`)
depend on the seed's exact shape; this table changes nothing about it.

## What the script does

Fetches `https://www.bring.no/postnummerregister-ansi.txt` directly (tab-separated, no header,
~5,100 rows, Windows-1252 encoded — the UTF-8 `.txt` variant 404s), and upserts into
`raw.bring_postnummer`.

## Known quirks

- **No `Last-Modified` header.** Checked 2026-11-08 — the HTTP response carries only its own
  `Date`, not a publication date for the file. `loaded_at` is a fetch date, not an upstream date.
- **A sixth `kategori` letter is a loud error, not a silent default.** Bring documents five:
  G (gateadresse), P (postboks), B (both), S (service), F (flere). If a new one appears, the
  ingest fails rather than passing it through unexamined.
- **The seed and this table will not match exactly, and that's expected.** A 2026-11-08 diff
  against the committed `dim_postnummer.csv` found 13 postcodes only in the seed and 3 only in
  this fresh download — the exact counts urb-agents #2098 cited. Checked by name (MESNALI, LALM,
  NYKIRKE, STORFOSNA and others for the seed-only set; SOLBERG/ÅS, FANA, HELLEFJORD for the
  live-only set) — real, plausible Norwegian postnummer, consistent with ordinary closures and
  additions between the seed's last refresh and today. Not a defect in either source.

## References

- Upstream: https://www.bring.no/postnummerregister-ansi.txt
- Sibling seed script: [`../../seed-sources/bring-postnummer/index.ts`](../../seed-sources/bring-postnummer/index.ts)
- Migration: [`atlas-data/migrations/075_raw_bring_postnummer.sql`](../../../../migrations/075_raw_bring_postnummer.sql)
