# ssb-06947

SSB statistikkbanktabell **06947** — *Personer i husholdninger med lavinntekt (EU- og OECD-skala)*. Whole-population complement to `ssb-08764` (children only).

## What the script does

Fetches latest year × all content codes × all regions, unflattens, upserts to `raw.ssb_06947`. Near-identical code to `ssb-08764`; the difference is the upstream table covers everyone, not just under-18s.

## Upstream

| Field | Value |
|---|---|
| Provider | Statistisk sentralbyrå (SSB) |
| Table id | `06947` |
| URL | https://data.ssb.no/api/pxwebapi/v2-beta/tables/06947 |
| Auth | None |
| Format | JSON-stat2 |
| Licence | NLOD 2.0 |
| Attribution | *Kilde: Statistisk sentralbyrå, tabell 06947* |

## Response shape

Three dimensions; ContentsCode + Tid marked `elimination=false` (explicit filters used).

| Dimension | Codes |
|---|---|
| `Region` | ~1 036 (kommune + fylke + nasjon + bydeler for 4 big cities + historical) |
| `ContentsCode` | 5 — `Personer`, `EUskala50`, `EUskala60`, `OECDskala50`, `OECDskala60` |
| `Tid` | 2005–2024 |

Same 5 content codes as ssb-08764.

## Row shape emitted

```json
{
  "region_code": "0301",
  "year": 2024,
  "contents_code": "EUskala60",
  "contents_label": "Andel personer i husholdninger med lavinntekt, EU-skala 60 prosent",
  "value": 10.5,
  "status": null
}
```

## How to run locally

```bash
npm run ingest:ssb-06947
```

## References

- Sibling: [`../ssb-08764/`](../ssb-08764/) — child-only version of the same indicator family.
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
