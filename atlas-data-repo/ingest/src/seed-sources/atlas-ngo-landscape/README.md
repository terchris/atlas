# atlas-ngo-landscape

Atlas-curated source for `marts.dim_ngo`. The JSON pipeline:

```
docs/research/ngo-landscape.md   ← human research (markdown tables)
        │
        │  hand-curated extraction
        ▼
landscape.json                   ← source-of-truth (this folder)
        │
        │  npm run refresh:atlas-ngo-landscape
        ▼
dbt/seeds/dim_ngo.csv            ← what dbt loads
        │
        │  dbt seed
        ▼
marts.dim_ngo                    ← the table consumers query
```

## Workflow

When you add or update an NGO:

1. Edit `landscape.json` (this folder).
2. From `atlas-data-repo/ingest/`, run `npm run refresh:atlas-ngo-landscape`. The script validates each entry and rewrites `dbt/seeds/dim_ngo.csv`.
3. Review `git diff` for both `landscape.json` and `dim_ngo.csv` — they should agree.
4. Commit both files.

The CSV is committed (not gitignored) so dbt can load it without running this script first. The script is the source-of-truth refresh tool, not a build step.

## Schema

`landscape.json` shape:

```json
{
  "ngos": [
    {
      "orgnr": "864139442",        // 9-digit Brreg, primary key
      "slug": "redcross",          // kebab-case, unique, URL-friendly
      "name": "Norges Røde Kors",  // legal name from Brreg
      "brand_name": "Røde Kors",   // optional; null if same as legal name
      "website_url": "https://www.rodekors.no",
      "tier": "A",                 // A / B / B-minus / C-donor / C-petition / C-industry / C-quasigovernmental
      "chapter_data_shape": "api_canonical",  // api_canonical / cms_bins / programme_only / no_structure
      "has_chapters": true,
      "primary_focus": "humanitarian",  // humanitarian / health / social / youth / environment / civic / patient_support / faith_adjacent / service_club
      "icnpo_code_1": null,        // optional Brreg ICNPO codes (up to 3, ranked)
      "icnpo_code_2": null,
      "icnpo_code_3": null
    }
  ]
}
```

The script enforces the enum values for `tier`, `chapter_data_shape`, and `primary_focus` and rejects duplicates of `orgnr` or `slug`.

## ICNPO codes

Currently null for all v1 entries. Brreg's Frivillighetsregister API exposes the up-to-3 ICNPO codes per registered NGO; a future `refresh:brreg-frivillighet` script (separate plan) will enrich these from upstream. For now, leave null and add manually if the curator already knows them from their research.

## Refresh cadence

Curated bucket (per the convention in `naming-conventions.md`). Refreshed when the team decides to add an NGO or update an entry. No external API; nothing to drift against.
