# brreg-underenheter

The **complete underenheter register** — every sub-unit registered under a parent organisation in
Norway (~867,000) — streamed from Brønnøysundregistrene's daily bulk export into
`raw.brreg_underenheter_snapshot`.

Sibling to [`brreg-enheter-alle`](../brreg-enheter-alle/README.md), which this mirrors field for
field. Named as a follow-on when that source shipped; built once its bulk+change-feed machinery
had run in production (see `atlas-data/migrations/072_raw_brreg_underenheter_snapshot.sql`'s
header). This is the bootstrap load; keeping the register current is
[`brreg-underenheter-oppdateringer`](../brreg-underenheter-oppdateringer/README.md)'s job.

## What the script does

1. `GET https://data.brreg.no/enhetsregisteret/api/underenheter/lastned` — one gzipped,
   pretty-printed JSON array, regenerated daily. `Last-Modified` becomes `snapshot_file_date`.
2. Gunzip in flight, decode UTF-8 across chunk boundaries, frame one top-level array element at a
   time with the same depth-aware scanner as `brreg-enheter-alle` ([`parse.ts`](./parse.ts)).
3. `JSON.parse` each element, read `organisasjonsnummer`, keep the rest verbatim as `doc`.
4. Upsert in batches of 2,000 on `organisasjonsnummer`. **Never truncates, never deletes.**

Use `npm run ingest:brreg-underenheter -- --sample 5` to see records without touching the database.

## Measured (2026-10-04)

| | |
|---|---|
| live record count | 867,024 (`?size=1`'s `page.totalElements`) |
| bulk download | ~85 MB gzipped (`content-length: 89059481`) |
| `Last-Modified` shape | `Sat Oct 03 04:30:43 CEST 2026` — Java's `Date.toString()`, same as enheter's file |
| Accept header | `application/vnd.brreg.enhetsregisteret.underenhet.v2+gzip` |

## Things that are easy to get wrong

Everything in [`brreg-enheter-alle`'s README](../brreg-enheter-alle/README.md#things-that-are-easy-to-get-wrong)
applies here unchanged — the file is not newline-delimited, no delimited format anywhere in the
path, `organisasjonsnummer` is text not a number, deletions cannot arrive through a bulk file. Two
things specific to this register:

- **The sub-unit's own `organisasjonsnummer` is not its parent's.** The parent lives inside `doc`
  as `overordnetEnhet` — a plain string field (verified live 2026-10-04), not a nested object
  carrying its own `organisasjonsnummer` key the way some other Brreg responses nest things. Reading
  the wrong field here would silently key every row on the parent, collapsing hundreds of sub-units
  onto one row.
- **This register and `enheter` are not the same id space.** A `brreg-underenheter` organisasjonsnummer
  and a `brreg-enheter-alle` one can overlap only by the kind of coincidence a 9-digit space allows —
  they are assigned from the same national range but mean different things (a sub-unit vs. a legal
  entity). Never assume a hit in one table says anything about the other; join through
  `overordnetEnhet` explicitly.

## Running it

```bash
cd atlas-data/ingest
npm run migrate                                 # applies 072_raw_brreg_underenheter_snapshot.sql
npm run ingest:brreg-underenheter               # the full load; needs DATABASE_URL
npm run ingest:brreg-underenheter -- --sample 5 # first 5 records to stdout, no writes
```

Re-running is safe on a populated table: every batch is `INSERT … ON CONFLICT
(organisasjonsnummer) DO UPDATE`, so a second run replaces rows in place and an interrupted run
leaves a register that is partially fresh rather than partially empty.

## Validation

`select count(*) from raw.brreg_underenheter_snapshot` should equal the `totalElements` reported by
`https://data.brreg.no/enhetsregisteret/api/underenheter?size=1` on the same day, ± that day's churn.
