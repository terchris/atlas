# brreg-enheter

Generic cross-NGO Brreg Enhetsregister ingest. One table (`raw.brreg_enheter`), one script (`refresh:brreg-enheter`), parameterised per NGO via `landscape.json`.

## How it works

1. Read [`../atlas-ngo-landscape/landscape.json`](../atlas-ngo-landscape/landscape.json).
2. For each NGO whose entry has a `brreg_query` object, call `fetchNgoUnits({ navn, organisasjonsform, nameStartsWith })` from the shared typed client.
3. Upsert every matched `Enhet` into `raw.brreg_enheter` on `orgnr`.

No per-NGO table. No per-NGO script. Adding a new NGO is a JSON edit.

## Adding a new NGO

In [`landscape.json`](../atlas-ngo-landscape/landscape.json), add a `brreg_query` block to the NGO's entry:

```jsonc
{
  "orgnr": "864139442",
  "slug": "redcross",
  "name": "Norges Røde Kors",
  // … existing fields …
  "brreg_query": {
    "navn": "røde kors",
    "organisasjonsform": "FLI",
    "nameStartsWith": "Røde Kors"
  }
}
```

Fields:

- **`navn`** — Brreg's fuzzy `navn` search term. Use the lower-cased NGO name (`"norsk folkehjelp"`, `"røde kors"`).
- **`organisasjonsform`** — Brreg organisasjonsform kode. `"FLI"` for NGO foreninger.
- **`nameStartsWith`** — case-insensitive exact-prefix post-filter. Brreg's `navn` param is score-matched (not exact), so a query for `norsk folkehjelp` also returns ~3 300 unrelated "Norsk X" foreninger. The prefix filter trims back to the real Folkehjelp rows. Omit only if you want every row Brreg returns.

Run `npm run refresh:brreg-enheter`. The new NGO's enheter land in the shared table; nothing else changes.

## What goes in the table

One row per Brreg orgnr. All NGOs, same columns — the `navn` and orgnr self-identify which NGO owns a row. Schema: see [`migrations/025_raw_brreg_enheter.sql`](../../../../migrations/025_raw_brreg_enheter.sql).

## Deletion / termination

We don't delete rows from `raw.brreg_enheter` when an NGO's lokallag is wound down. Brreg itself carries three flags that represent the equivalent:

- `konkurs` — bankruptcy.
- `under_avvikling` — under voluntary dissolution.
- `under_tvangsavvikling` — under forced dissolution.

Downstream "active NGO?" queries filter on these instead of expecting a synthetic `is_active` on our side. If Brreg flips a flag on a unit's next refresh, we pick it up via the upsert.

## Refresh cadence

Manual. Brreg-side churn is slow (a few new Folkehjelp lokallag per year, occasional konkurs or dissolution flag flips). Add a cron when Atlas has a job-runner.

## Implementation

- **Typed client**: [`../../lib/brreg/`](../../lib/brreg/) — openapi-typescript + openapi-fetch against the official `brreg/openAPI` spec.
- **Generic fetch**: [`../../lib/brreg/ngo-units.ts`](../../lib/brreg/ngo-units.ts) — walks Brreg pagination, applies the nameStartsWith post-filter.
- **This ingest**: reads the landscape, iterates NGOs, writes to Postgres. Keeps the ~122 Folkehjelp rows as a first proof; adds more when `brreg_query` blocks are added to other NGOs.
