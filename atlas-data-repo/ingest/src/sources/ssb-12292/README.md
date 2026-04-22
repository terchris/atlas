# ssb-12292

SSB KOSTRA **12292** — *Omsorgstjenester (supplerende grunnlagstall)*. Nursing-home and home-care service indicators per kommune.

## Upstream

| Field | Value |
|---|---|
| Provider | SSB (KOSTRA) |
| Table id | `12292` |
| URL | https://data.ssb.no/api/pxwebapi/v2-beta/tables/12292 |
| Licence | NLOD 2.0 |
| Attribution | *Kilde: Statistisk sentralbyrå, tabell 12292* |

## Response shape

Three dimensions, all `elimination=false`.

| Dim | Codes |
|---|---|
| `KOKkommuneregion0000` | ~891 (KOSTRA region) |
| `ContentsCode` | 49 (care-service indicators) |
| `Tid` | 2015–2024 |

## Known quirks

- Mirrors the `ssb-13995` pattern (KOSTRA). Region dim mapped to `region_code` at ingest.
- Big content-code set (49). Fact-layer takes kommune-level rows without filtering further; consumers pick which code to visualise.

## How to run

```bash
npm run ingest:ssb-12292
```

## References

- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
