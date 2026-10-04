# Ingestion spec — Brreg sub-units of the unitary NGOs

**Status · Atlas runs this.** Yields the local units of the two **unitary** Tier A NGOs —
Frelsesarmeen (938498318) and Stiftelsen Kirkens Bymisjon (944384448) — from Brønnøysund's
`underenheter` register. A unitary NGO is one legal entity; its korps, centres and services are
registered as sub-units (`organisasjonsform` BEDR) hanging off the parent through the declared
`overordnetEnhet` link. No name matching is involved, so **precision is 100% by construction**.

This is the one source in the NGO work that Atlas does **not** have today: Atlas ingests `enheter`
(`brreg-enheter-alle`, `brreg-oppdateringer`), not `underenheter`. It is proposal P1 in
`atlas-model-proposals.md`. The general form is a `brreg-underenheter` source for the whole
register; the NGO use below is a filter on it.

## Sources and discovery

| | |
|---|---|
| Endpoint (research) | `GET https://data.brreg.no/enhetsregisteret/api/underenheter?overordnetEnhet=<orgnr>&size=100&page=<n>` — pages until `page.totalElements` is reached; rows in `_embedded.underenheter` |
| Parent row | `GET https://data.brreg.no/enhetsregisteret/api/enheter/<orgnr>` — becomes the national row |
| For Atlas | Brreg publishes `underenheter` as a full bulk file and a change feed, like `enheter`: the same pattern as `brreg-enheter-alle` + `brreg-oppdateringer`, landing verbatim in `raw.brreg_underenheter_*` |
| Cadence | daily bulk / change feed, as `enheter` |
| Licence | NLOD |

## Politeness

Brreg's open API; the research paged at 100 rows per request with no throttling problems. Use
Atlas's User-Agent with contact (`lib/scraping/ua.ts`). Bulk file preferred over paging.

## What to read → Atlas columns

| Source field | Atlas column | Rule |
|---|---|---|
| `organisasjonsnummer` | `chapter_orgnr`; `chapter_id` = `<slug>-<orgnr>` | |
| `overordnetEnhet` | `ngo_orgnr`; `parent_chapter_id` = the NGO's national row | declared link: `parent_method` NULL, origin `source` |
| `navn` | `name` (display) + legal name kept | split brand / area / unit — see rules |
| area from the name | `chapter_type` | the registry's own service area ("Rusomsorg", "Seksjon for oppvekst") |
| name keywords | `chapter_level` | DIVISJON/REGION/REGIONKONTOR → `regional`; HOVEDKONTOR/ADMINISTRASJON/ADM/HOVEDKVARTER → `related_entity`; else `local` |
| `nedleggelsesdato` | `is_active` = false when set | |
| `oppstartsdato` | (proposed) `established_date` | |
| `beliggenhetsadresse` (else `postadresse`) | `postal_address_line1`, `postal_code`, `post_office` | first non-null address line |
| `beliggenhetsadresse.kommunenummer` | `kommune_nr` | |
| `telefon`, `epostadresse`, `hjemmeside` | `phone`, `email`, `web` | see Personal data |
| — | `registration` = `sub_unit`, `confidence` = `high`, `reconciliation` = `registry_only` until joined | |
| `https://data.brreg.no/enhetsregisteret/api/underenheter/<orgnr>` | `source_url` | |

## Rules and traps

From `reference-code/src/sources/brreg-subunits.ts`:

1. **Run it only for unitary NGOs.** For a federated NGO the sub-units are back offices and
   depots, not chapters: Røde Kors has 381 registered chapters in `enheter` but 20 sub-units;
   Sanitetskvinnene 463 and 6. Drive it from an explicit list of unitary NGOs (`structure = unitary` on `dim_ngo`).
2. **Emit the parent entity as the national row.** Without it every sub-unit's parent points at a
   row that does not exist; in the research 723 chapters came out as orphans before this was added.
3. **Split the registry name into service area and unit, learning the areas from the data.** Brreg
   writes `<BRAND> <AREA> AVD <UNIT>` (`FRELSESARMEENS RUSOMSORG AVD BAKKEGATEN`). Collect the
   areas from rows that use AVD, then strip them from rows that omit AVD
   (`FRELSESARMEENS SEKSJON FOR OPPVEKST HOME START DRAMMEN`); longest area first. Parsing only
   `<BRAND> AVD <UNIT>` matched 111 of 175 units to the NGO's site instead of 165.
4. **Strip both brand forms**, possessive and plain, with irregular spacing: `^FRELSESARMEENS?\s+`,
   `^(STIFTELSEN\s+)?KIRKENS\s+BYMISJON\s+`.
5. **Brreg pads the address array with nulls** — keep only real lines.
6. **A sub-unit has no termination of its own beyond `nedleggelsesdato`**; Brreg removes the row
   instead, so a disappearing row is a closure signal.
7. **Classify, never drop.** Divisions, head offices and service sites stay in the data with a
   level; consumers filter.
8. **Owned companies are not chapters.** Fretex outlets are run by Frelsesarmeen-owned limited
   companies (FRETEX MILJØ AS alone employs 449); they become `related_entity`
   (`reference-code/src/sources/classify-units.ts`).

## Personal data

`telefon` and `epostadresse` on a sub-unit are usually the unit's own, but can be a person's; a
Norwegian mobile number or a consumer e-mail domain follows the private path, never public tables
(owner decision). Addresses here are premises (`beliggenhetsadresse`), so `location_precision`
may be `exact`.

## Acceptance targets

Research run of 26 Sep 2026 (`acceptance-targets.csv`); a fresh run will differ somewhat.

| NGO | `enheter` | `underenheter` | after reconciliation with the NGO's site: chapters / both / registry_only / source_only |
|---|---:|---:|---|
| Frelsesarmeen | 1 | **175** | 302 / 134 / 41 / 127 (30 `related_entity`, 9 regional divisions) |
| Kirkens Bymisjon | 3 | **151** | 433 / 67 / 84 / 282 |

## Reference implementation

`reference-code/src/sources/brreg-subunits.ts`. In Atlas: the generic
`brreg-underenheter` ingest into `raw.*` verbatim; a dbt model filtering
`overordnet_enhet in (select orgnr from dim_ngo where structure = 'unitary')` and applying the
name split and classification above.

## Open gaps

- `structure` (federated / unitary) is not yet a column on Atlas's `dim_ngo`.
- Only two unitary NGOs today; other unitary organisations in the wider register benefit from the
  same source.
- 282 of Kirkens Bymisjon's units are unregistered services found only on its website
  (`source_only`): the registry is necessary, not sufficient.
