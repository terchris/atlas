# ssb-08764

Ingestion module for SSB statistikkbanktabell **08764** — *Personer under 18 år i husholdninger med lavinntekt (EU- og OECD-skala)*.

The strategic metadata for this source (Atlas use cases, priority, Samfunnspuls citation, etc.) lives in [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md) in the parent Atlas repo. This README covers the **implementation-level** notes: how the script works, what we've observed, and known issues.

## What the script does

Fetches the full current response from SSB's PxWebAPI v2, parses the JSON-stat2 payload, flattens it into `IndicatorRow` records, and writes one NDJSON line per cell to `output/ssb-08764.ndjson` at the `ingest/` root.

Postgres write and Dagster orchestration are downstream phases — not in this module.

## Upstream

| Field | Value |
|---|---|
| Provider | Statistisk sentralbyrå (SSB) |
| Table id | `08764` |
| Table URL | https://data.ssb.no/api/pxwebapi/v2-beta/tables/08764 |
| Data URL | `https://data.ssb.no/api/pxwebapi/v2-beta/tables/08764/data?lang=no&outputFormat=json-stat2` |
| Auth | None |
| Format | JSON-stat2 |
| Rate limits | 30 req/min/IP, 800 000 cells/request (PxWebAPI default) |
| Licence | NLOD 2.0 |
| Attribution | *Kilde: Statistisk sentralbyrå, tabell 08764* |

## Response shape (observed 2026-04-21)

Three dimensions, order matters for JSON-stat2 unflattening:

| Dimension | Size | Values |
|---|---|---|
| `Region` | 1 036 codes when pulling full range | National aggregate (`0`), fylker (`01`, `02`, …), kommuner (`0301`, `3101`, …), historical variants |
| `ContentsCode` | 5 codes | `Personer`, `EUskala50`, `EUskala60`, `OECDskala50`, `OECDskala60` |
| `Tid` | 20 years available (`2005` … `2024`) | Annual series |

### ContentsCode meanings

- `Personer` — count of persons under 18 in low-income households (unit: persons)
- `EUskala50` — % under 18 in households below **50%** of median, EU scale
- `EUskala60` — % under 18 in households below **60%** of median, EU scale ← Samfunnspuls uses this
- `OECDskala50` — same with OECD scale, 50%
- `OECDskala60` — same with OECD scale, 60%

## Row shape emitted

One `IndicatorRow` per (Region, ContentsCode, Tid) cell:

```json
{
  "source_id": "ssb-08764",
  "region_code": "3101",
  "year": 2024,
  "contents_code": "EUskala60",
  "contents_label": "EU-skala 60 prosent",
  "value": 14.6,
  "status": null
}
```

Suppressed cells preserve the upstream marker:

```json
{
  "source_id": "ssb-08764", "region_code": "9999", "year": 2024,
  "contents_code": "EUskala60", "contents_label": "EU-skala 60 prosent",
  "value": null, "status": "."
}
```

## How to run locally

From the `ingest/` directory:

```bash
npm install          # once
npm run ingest:ssb-08764
```

Expected timing: ~1–2 seconds end-to-end.

Expected output:

- Structured JSON log lines to stdout (`source.start`, `pxweb.fetch.start`, `pxweb.fetch.done`, `source.done`)
- Full rows written to `output/ssb-08764.ndjson` (one JSON object per line)

## Known quirks and gotchas

### PxWebAPI v2-beta returns only the latest year by default

Calling `/data?lang=no&outputFormat=json-stat2` without an explicit `Tid` filter returns **only the most recent year** (currently 2024), not the full 2005–2024 series. An unfiltered pull returns ~1 790 cells (≈ 358 regions × 5 contents × 1 year), not the ~103 600 one might expect.

**Implication for Atlas:** for the Coverage-gap explorer's current-year view this is enough. If we want the historical series (for trend visualisations), add an explicit time filter to the fetch call. Exact v2-beta query-param syntax for "all years" is unverified — left open until we need it.

### The v2 API is served under `/v2-beta/`

SSB's documentation says "v2" but the live endpoint (as of 2026-04-21) is at `https://data.ssb.no/api/pxwebapi/v2-beta/…`. Our client (`src/lib/pxweb.ts`) points at `v2-beta` for now. Re-check annually; move to `/v2/` when the beta flag is dropped.

### Region code `9999` appears with suppressed values

Observed in the live response: `region_code: "9999"` with `value: null, status: "."`. This is a catch-all code used by SSB for unassignable or confidential aggregates. Handling: the dbt `kommune_dim` join will simply drop rows whose `region_code` isn't in the authoritative kommune classification, so this is harmless downstream.

### `contents_label` for `Personer` is abbreviated

The label for `contents_code: "Personer"` comes back as just *"Personer under 18 år"* — it does not restate "i husholdninger med lavinntekt". This is SSB's own label; we record it verbatim. Any user-facing UI should use the full table title (already captured in the Samfunnspuls catalogue entry as `title_no`).

## Known issues / TODOs

- **`run()` is invoked unconditionally at the bottom of `index.ts`.** Fine when run directly via `tsx`; will fire as a side effect if anything ever imports the module. Add an `import.meta.url === …` entry-point guard when we wire Dagster Pipes.
- **No time-range filter.** Current implementation pulls whatever the default response shape gives us (latest year only). Add filter support in `lib/pxweb.ts` when we need historical data.
- **No Postgres write.** Output is NDJSON on disk. Writer that upserts into `raw.ssb_08764` is a future phase once the migration for that table exists.

## References

- Catalogue entry: [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md) — ssb-08764 block with use cases, questions answered, Samfunnspuls linkage
- End-to-end journey: [`website/docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md`](../../../../../website/docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md) — source → browser walkthrough (completed design investigation)
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) — the PxWebAPI v2 client and JSON-stat2 parser used here
