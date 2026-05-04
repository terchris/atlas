# ssb-klass-fylker

SSB Klass classification **104 — Fylker**. The canonical active-fylker list. Feeds `dim_fylke`.

## What the script does

Fetches a snapshot of currently-active fylke codes from `https://data.ssb.no/api/klass/v1/classifications/104/codesAt.json`, maps each code to a flat row, writes NDJSON, and (with `DATABASE_URL`) upserts to `raw.ssb_klass_fylker`.

Structurally identical to [`ssb-klass-kommuner`](../ssb-klass-kommuner/); differs only in the classification id.

## Known quirks

- **Multi-variant Sámi names.** Fylker in northern Norway carry multiple official language variants separated by " - ": `"Troms - Romsa - Tromssa"` (Norwegian + North Sámi + Kven), `"Finnmark - Finnmárku - Finmarkku"`. The `dim_fylke` model extracts the first part as `fylke_name` and collects the rest into `fylke_name_alt`.
- **Residual code `"99" Uoppgitt` is included.** Consumers filtering to real fylker should add `where fylke_nr != '99'` explicitly; `dim_fylke` keeps it so that rows citing `"99"` upstream still resolve via the FK.
- **Active-only snapshot.** Historical fylke codes (01–20 numbering used before 2020) are not in this dim. Sources like ssb-07459 with 1986-based region dimensions will have 2-digit codes not in `dim_fylke`; same warn-severity pattern as `dim_kommune`.

## Known issues / TODOs

- Sámi-name parsing is naive — takes the first " - " split as Norwegian. For most fylker this is correct; verify as we see issues.
- No historical fylker. Extending via Klass `/codes.json?from=1960` is tracked alongside the dim_kommune history extension.

## References

- Downstream: [`../../../../dbt/models/dimensions/dim_fylke.sql`](../../../../dbt/models/dimensions/dim_fylke.sql)
- Shared client: [`../../lib/klass.ts`](../../lib/klass.ts)
- Sibling source: [`../ssb-klass-kommuner/`](../ssb-klass-kommuner/)
