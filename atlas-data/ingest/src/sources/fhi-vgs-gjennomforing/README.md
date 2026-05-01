# fhi-vgs-gjennomforing

FHI Folkehelsestatistikk table **360** — *Gjennomforing i videregående skole (utdann_3)*. Upper-secondary completion rate per region × sex × parents' education × immigration category.

**Why Atlas uses this**: substitute for Samfunnspuls's `udir-sluttet-vgs` (dropout). Udir publishes only in HTML; FHI publishes cleanly via JSON. Dropout rate is derivable from completion (100 − RATE).

## References

- Catalogue substitute for `udir-sluttet-vgs`.
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
