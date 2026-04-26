# ssb-12063

SSB KOSTRA **12063** — *Kommunale fritidstilbud*. Municipal leisure services for children/youth and counts of volunteer youth associations receiving public support.

## Upstream

| Field | Value |
|---|---|
| Table id | `12063` |
| URL | https://data.ssb.no/api/pxwebapi/v2-beta/tables/12063 |
| Provider | SSB (KOSTRA) |
| Licence | NLOD 2.0 |
| Attribution | *Kilde: Statistisk sentralbyrå, tabell 12063* |

## Response shape

KOSTRA pattern — same shape as `ssb-12292`. 15 content codes covering youth-centre count + capacity + voluntary-association counts.

## How to run

```bash
npm run ingest:ssb-12063
```

## References

- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
