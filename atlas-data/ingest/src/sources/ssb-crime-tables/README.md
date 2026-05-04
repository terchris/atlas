# ssb-crime-tables

SSB statistikkbanktabellene **08484**, **08487**, **09405** og **09406** — statistikk om **anmeldte og etterforskede lovbrudd** (Politidirektoratets register, publisert av SSB).

## What the script does

Ett kjøreopptak mot PxWebAPI v2-beta henter fire tabeller i sekvens og skriver NDJSON-filer under `atlas-data/ingest/output/`, og ved satt `DATABASE_URL` upsertes rader til `raw.ssb_08484`, `raw.ssb_08487`, `raw.ssb_09405` og `raw.ssb_09406`. Alle dimensjoner som krever eksplisitte filtre, får `valuecodes[...]=*` slik at full tidsserie og alle offence-typer tas med der API-et tillater det.

## Known quirks

- **08484** og **09405** / **09406** er **nasjonale** (ingen regiondimensjon i Px-fila). **08487** har **gjerningssted** (kommune, fylke, land, historiske koder) og **toårige intervaller** i stedet for enkeltår.
- **Mindre tall grupperes** i SSB-visningen (cell status / prikking); `value` kan være tom med status satt, som for øvrige Atlas SSB-kilder.
- **08487** er bevisst begrenset til utvalgte lovbruddsgrupper og toårsgjennomsnitt; metadata i SSB forklarer småcelleproblematikk for kommuner med få hendelser.

## Known issues / TODOs

- Ingen TODO i kodebasis; rapport- og produkttekst bør bruke nøytral formulering («anmeldte lovbrudd», «etterforskede lovbrudd») jf. backlog Q18.

## References

- Tabell 08484: https://www.ssb.no/statbank/table/08484  
- Tabell 08487: https://www.ssb.no/statbank/table/08487  
- Tabell 09405: https://www.ssb.no/statbank/table/09405  
- Tabell 09406: https://www.ssb.no/statbank/table/09406  
- PxWebAPI: https://www.ssb.no/api/pxwebapi/
