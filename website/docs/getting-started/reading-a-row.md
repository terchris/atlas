# How to read a row

A reader landing on a single record in `marts.fact_kommune_indicators` for the first time often has the same reaction: *"what does this actually mean?"*

This page walks through one concrete row end-to-end — from the upstream source SSB publishes, through the layers Atlas adds, to a final interpretation. The example is `ssb-08764`, the simplest indicator source Atlas ingests.

## The row in question

```text
source_id: ssb-08764
kommune_nr: 0301
kommune_name: Oslo
year: 2023
contents_code: EUskala50
contents_label: Personer i husholdninger med inntekt etter skatt per forbruksenhet, under 50 prosent av median EU-skala
value: 9.1
status: null
kommune_is_active: true
updated_at: 2026-04-25 …
```

What does this say? In plain language:

> **9.1% of children under 18 in Oslo lived in households with income (after tax, per consumption unit, EU equivalence scale) below 50% of the national median income, in 2023.**

Getting from the row to that sentence requires knowing four things the row doesn't fully say on its own. This page explains each one and where the answer comes from in the platform today.

## Stage 1 — The upstream source

`source_id = 'ssb-08764'` identifies the upstream as **Statistics Norway (SSB) statistikkbanktabell 08764**, served from `https://data.ssb.no/api/pxwebapi/v2/tables/08764`. The table's title is *"Personer under 18 år i husholdninger med lavinntekt (EU- og OECD-skala)"* — children under 18 in low-income households (EU and OECD scale).

So **the population is implicit**: every row from `ssb-08764` is about under-18s. The row itself doesn't say "children" — it's part of the source's contract.

Provenance for the source lives in [`atlas-data-repo/ingest/src/sources/ssb-08764/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data-repo/ingest/src/sources/ssb-08764) and the source-level description in [`atlas-data-repo/dbt/models/indicators/sources.yml`](https://github.com/terchris/atlas/blob/main/atlas-data-repo/dbt/models/indicators/sources.yml).

## Stage 2 — Geography

`kommune_nr = '0301'` and `kommune_name = 'Oslo'` are joined onto the row from `dim_kommune`, which is sourced from SSB Klass classification 131 (the canonical list of Norwegian municipalities). `kommune_nr` is the 4-digit zero-padded SSB code; it is the universal join key across every kommune-resolved table in the platform.

`kommune_is_active = true` confirms Oslo is a current kommune (not a pre-2020-reform code that has since been merged away). Atlas keeps historical kommune codes in `dim_kommune` for audit, but most consumer queries filter to `kommune_is_active = true`.

## Stage 3 — The metric (`contents_code`)

`contents_code = 'EUskala50'` is SSB's own code for one of five measures published in table 08764:

| `contents_code` | What it measures |
|---|---|
| `Personer` | Count of children under 18 in low-income households |
| `EUskala50` | **Share** under 50% of median income, EU equivalence scale |
| `EUskala60` | Share under 60% of median income, EU equivalence scale |
| `OECDskala50` | Share under 50% of median income, OECD equivalence scale |
| `OECDskala60` | Share under 60% of median income, OECD equivalence scale |

The row carries `contents_label` — Norwegian prose that explains the code in long form. For `EUskala50`: *"Personer i husholdninger med inntekt etter skatt per forbruksenhet, under 50 prosent av median EU-skala"*.

The unit is **percent** (the "50" / "60" denote thresholds, not the values themselves). Other indicator sources use other units — counts (`Personer` in `ssb-06913`), NOK (`SamletInntekt` in `ssb-06944`), rates per 1000 (FHI sources). The unit-per-`contents_code` rule is documented today in the per-source `schema.yml`; the planned [Measurements](../measurements/) section will give it a single home.

## Stage 4 — The value and its caveats

`value = 9.1` is the numeric measurement. Combined with the unit understanding from Stage 3, this means **9.1 percent**.

`status = null` means the cell is a real published value. When SSB suppresses a cell (typically for small kommuner where individuals could be re-identified), `value` is `null` and `status` carries SSB's suppression marker (e.g. `"."`). Always check `status` before reading `value`.

`updated_at` records when Atlas last fetched this row from upstream. It is **not** the date SSB published the data — for that, see the source's metadata page on SSB's site.

## Putting it together

Combine the four stages:

| From | What we learn |
|---|---|
| `source_id` → SSB table 08764 metadata | Population is children under 18 |
| `kommune_nr` + `dim_kommune` | Geographic unit is the Oslo kommune (currently active) |
| `contents_code` + `contents_label` | Metric is share below 50% of median income (EU scale, post-tax, per consumption unit) |
| `value` + `status` | 9.1 percent, real measurement (not suppressed) |

Hence the plain-language reading:

> 9.1% of children under 18 in Oslo lived in households below 50% of the national median income (EU equivalence scale, after tax) in 2023.

## Why this is harder than it should be (today)

To assemble that interpretation, a reader has to consult at least:

1. The per-source ingest README ([`atlas-data-repo/ingest/src/sources/ssb-08764/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data-repo/ingest/src/sources/ssb-08764)).
2. The dbt source description ([`atlas-data-repo/dbt/models/indicators/sources.yml`](https://github.com/terchris/atlas/blob/main/atlas-data-repo/dbt/models/indicators/sources.yml)).
3. The dbt model description for unit/suppression notes ([`atlas-data-repo/dbt/models/indicators/schema.yml`](https://github.com/terchris/atlas/blob/main/atlas-data-repo/dbt/models/indicators/schema.yml)).
4. The `contents_label` text on the row itself.
5. SSB's own metadata page for the table.

Five places to assemble one row's meaning. That's the gap the planned [Concepts](../concepts/) and [Measurements](../measurements/) reference sections will close — by giving every concept and every measurement a single page where definition, unit, source-of-truth, and worked examples live together.

## Querying patterns this page implies

Once you understand the row shape, the common queries become straightforward:

```sql
-- Everything we know about Oslo in 2023, regardless of source
select source_id, contents_code, contents_label, value, status
from marts.fact_kommune_indicators
where kommune_nr = '0301' and year = 2023
order by source_id, contents_code;

-- Child poverty (EU 50% measure) across all kommuner, latest year per kommune
select kommune_nr, kommune_name, year, value
from marts.fact_kommune_indicators
where source_id = 'ssb-08764'
  and contents_code = 'EUskala50'
  and value is not null
order by value desc;

-- Cross-source comparison: child poverty vs. social-assistance rate, by kommune
select
  cp.kommune_nr, cp.kommune_name, cp.year,
  cp.value as child_poverty_pct,
  sa.value as social_assistance_rate
from marts.fact_kommune_indicators cp
join marts.fact_kommune_indicators sa using (kommune_nr, year)
where cp.source_id = 'ssb-08764' and cp.contents_code = 'EUskala50'
  and sa.source_id = 'ssb-12131';
```

Same shape, same canonical IDs, same join key. That's the payoff of doing the canonical-`kommune_nr` work upstream.
