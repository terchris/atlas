# ssb-09429

SSB statistikkbanktabell **09429** — *Utdanningsnivå, etter kommune og kjønn*. Educational attainment distribution per kommune × education level × sex × year.

## Known quirks

- `Kjonn` uses SSB's numeric codes; dbt layer maps to `male`/`female`/`all` canonical values where needed.
- `Nivaa` codes are NUS2000-based education-level identifiers; map to human labels at the feature layer.

## References

- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
