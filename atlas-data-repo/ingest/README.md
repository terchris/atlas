# atlas-data ingest

TypeScript ingestion modules for Atlas. Each file under `src/sources/` is a standalone data puller for one upstream source. Shared utilities live in `src/lib/`.

For now the modules run locally via `tsx` and write output to `./output/<source>.ndjson` for inspection. Later phases add a Postgres writer (raw landing) and a Dagster code-location that invokes each module via Dagster Pipes.

## Prerequisites

- Node.js ≥ 20 (uses built-in `fetch` and `import.meta.url`)
- pnpm (or npm — `package.json` is pnpm-conventioned but works with either)

## Install

```bash
cd atlas-data-repo/ingest
pnpm install
```

## Run one source

```bash
pnpm run ingest:ssb-08764
```

Output:

- Structured JSON logs to stdout (start, fetch, done)
- Full row dump at `./output/ssb-08764.ndjson` — one row per line, suitable for `jq` or Postgres `COPY`

Example log lines (pretty-printed):

```json
{ "ts": "2026-04-21T10:01:23.001Z", "level": "info", "msg": "source.start",
  "source_id": "ssb-08764", "table_id": "08764" }
{ "ts": "2026-04-21T10:01:23.012Z", "level": "info", "msg": "pxweb.fetch.start",
  "tableId": "08764",
  "url": "https://data.ssb.no/api/pxwebapi/v2-beta/tables/08764/data?lang=no&outputFormat=json-stat2" }
{ "ts": "2026-04-21T10:01:26.840Z", "level": "info", "msg": "pxweb.fetch.done",
  "tableId": "08764", "duration_ms": 3828,
  "updated": "2026-01-16T08:00:00Z", "cells": 103600 }
{ "ts": "2026-04-21T10:01:27.204Z", "level": "info", "msg": "source.done",
  "source_id": "ssb-08764", "row_count": 103600, "duration_ms": 4203,
  "region_count": 1036, "earliest_year": 2005, "latest_year": 2024,
  "contents_codes": ["Personer","EUskala50","EUskala60","OECDskala50","OECDskala60"],
  "sample_rows": [ … ] }
```

## What each row looks like

One line of `output/ssb-08764.ndjson`:

```json
{
  "source_id": "ssb-08764",
  "region_code": "0301",
  "year": 2023,
  "contents_code": "EUskala60",
  "contents_label": "Andel personer under 18 år i husholdninger med lavinntekt, EU-skala 60 prosent",
  "value": 18.7,
  "status": null
}
```

## Type-check only

```bash
pnpm run typecheck
```

## Layout

```
ingest/
├── src/
│   ├── lib/
│   │   ├── pxweb.ts          # SSB PxWebAPI v2 client + JSON-stat2 parser
│   │   ├── types.ts          # Shared types (JsonStat2Response, PxRow, IndicatorRow)
│   │   └── logger.ts         # Minimal structured JSON logger
│   └── sources/
│       ├── README.md         # Source index — table of all implemented sources
│       └── ssb-08764/        # One folder per upstream source
│           ├── index.ts      # Entry point — exports SOURCE_ID and run()
│           └── README.md     # Per-source implementation notes
├── output/                   # Local NDJSON dumps (git-ignored)
├── package.json
├── tsconfig.json
└── README.md                 # This file
```

See [`src/sources/README.md`](src/sources/README.md) for the current source inventory and the template for adding new sources.

## What's NOT here yet

Deliberately deferred:

- **Postgres write** — once migrations exist, the runner will `UPSERT` into `raw.<table>` instead of (or in addition to) NDJSON.
- **Dagster integration** — via Dagster Pipes; lets the existing `run()` function be called from a `@asset` without changing the source module.
- **CLI flags** — `--output`, `--dry-run`, `--year-filter`, etc. Add when a concrete need emerges.
- **Retry/rate-limit tuning** — current backoff is conservative (4 attempts, exponential 500 ms base). SSB has been reliable; revisit if we see 429s or 5xx in prod.

See `/docs/stack/data-journey-ssb-08764.md` in the parent Atlas repo for the full end-to-end flow this ingest module is one piece of.
