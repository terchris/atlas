# sample-ngo/frr/ — synthetic FRR data

`sample-frr.json` contains 5 synthetic FRR (Felles Ressursregister) records,
one per `ressurstype` so every code path in `supply__frr_*.sql` and
`private_marts.frr_*` gets exercised:

| id        | ressurstype                 | Exercises                                 |
|-----------|-----------------------------|-------------------------------------------|
| SAMPLE-1  | organisatorisk enhet        | Root org unit (no morId)                  |
| SAMPLE-2  | organisatorisk enhet        | Sub-org with morId chain → SAMPLE-1       |
| SAMPLE-3  | kjøretøy                    | Vehicle, multi-row status + position history |
| SAMPLE-4  | personell - enkeltperson    | personnavn redaction + privat phone redaction |
| SAMPLE-5  | sentral                     | nødnett phone, root-attached              |

All kommune names (Oslo, Bergen) are post-2020-reform and stable in
`marts.dim_kommune`, so the kommune_nr / fylke_nr joins resolve cleanly.

## Schema

The file is a JSON array of FRR resource objects following the FRR OpenAPI
spec verbatim. See the spec under each NGO's private `docs/` folder; the
FRR is a Norwegian government standard.

## Extending

Add new objects to the array. Keep the data fictitious and parsimonious —
the goal is "every shape covered once," not realistic volume.

## Loading

The shared FRR ingest discovers this folder automatically:

```bash
npx tsx --env-file=atlas-data/ingest/.env \
  atlas-data/ingest/src/sources/frr/index.ts
```

The script scans `atlas-private-data-repo/*/frr/*.json`, looks up the orgnr
for each folder name, and upserts into `private_raw.frr_resources` with
`ngo_orgnr='999999999'` for sample-ngo.
