# ssb-06947

SSB statistikkbanktabell **06947** — *Personer i husholdninger med lavinntekt (EU- og OECD-skala)*. Whole-population complement to `ssb-08764` (children only).

## What the script does

Fetches latest year × all content codes × all regions, unflattens, upserts to `raw.ssb_06947`. Near-identical code to `ssb-08764`; the difference is the upstream table covers everyone, not just under-18s.

## References

- Sibling: [`../ssb-08764/`](../ssb-08764/) — child-only version of the same indicator family.
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
