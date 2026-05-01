# ssb-06083

SSB statistikkbanktabell **06083** — *Familier, etter familietype*. Family counts by type per region and year.

## Known quirks

- Single-parent families correspond to specific FamilieType codes (map in dbt layer when building the "single-parent share" feature view).
- Bydeler (6-digit region codes) are included — filter to 4-digit for kommune-level views.

## References

- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
