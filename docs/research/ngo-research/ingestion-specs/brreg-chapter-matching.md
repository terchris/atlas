# Ingestion spec — Brreg chapter matching (federated NGOs)

**Status · Atlas runs this.** Finds the registered chapters of the nine **federated** Tier A NGOs —
Røde Kors, Norsk Folkehjelp, Diabetesforbundet, Mental Helse, LHL, 4H Norge, Norges
Speiderforbund, Sanitetskvinnene, Nasjonalforeningen — among the ~72 800 organisations in
Frivillighetsregisteret, by name pattern plus two corroborating signals (website host, activity
text). In a federated NGO every chapter is its own legal entity in `enheter`, so a name search
finds it. Measured on Røde Kors against its public chapter directory: **precision 93.6%, recall
95.4%** (after excluding organisation-owned companies and one region whose directory lists no
chapters). The two **unitary** NGOs (Frelsesarmeen, Kirkens Bymisjon) are excluded here on
purpose — see `brreg-underenheter.md`.

In Atlas this is **not a new ingest**: the input already lives in `marts.dim_brreg_enhet`
(`brreg-enheter-alle` + `brreg-oppdateringer` + `brreg-frivillige`). The work is a dbt derivation.

## Sources and discovery

| | |
|---|---|
| Input | Atlas `dim_brreg_enhet` where `registrert_i_frivillighetsregisteret` is true (~72 800 rows). The research read it over Atlas's public API: `GET /brreg_enhet?registrert_i_frivillighetsregisteret=is.true&select=organisasjonsnummer,navn,kommune_nr,icnpo_nummer,naeringskode1_kode,antall_ansatte,is_active,organisasjonsform_kode,hjemmeside:doc->>hjemmeside,aktivitet:doc->>aktivitet&limit=10000&offset=…&order=organisasjonsnummer` |
| Fields used | `organisasjonsnummer`, `navn`, `kommune_nr`, `is_active`, `organisasjonsform_kode`, `doc->>hjemmeside`, `doc->>aktivitet` |
| Cadence | As fresh as `dim_brreg_enhet` (change feed every 30 min); re-derive on each dbt build |
| Licence | NLOD (Brønnøysundregistrene) |

## Politeness

No crawling: reads Atlas's own table. (The research's network fetch used a single paged pull of
10 000 rows per request.)

## What to read → Atlas columns

| Source | Atlas column | Rule |
|---|---|---|
| `organisasjonsnummer` | `chapter_orgnr`; `chapter_id` = `<slug>-<orgnr>` | |
| NGO rule (below) | `ngo_orgnr` | the NGO whose pattern matched |
| `navn` | `name` | verbatim, not normalised |
| orgnr = NGO's own orgnr | `chapter_level` = `national` | |
| name has DISTRIKT / FYLKESLAG / FYLKESSTYRET / FYLKESFORENING / FYLKE / KRETS / REGION, or the remainder is a county name | `chapter_level` = `regional` | |
| `organisasjonsform_kode` AS or STI (and not the NGO itself) | `chapter_level` = `related_entity` | an owned company or foundation, never a chapter |
| otherwise | `chapter_level` = `local` | |
| `kommune_nr` | `kommune_nr` | `location_precision` for any point from this address: `postal_code` at most |
| `is_active` | `is_active` | |
| `hjemmeside` | `web` | normalised URL |
| signals | `confidence` | see rules |
| — | `registration` = `legal_entity`, `reconciliation` = `registry_only` (until joined with a crawl) | |
| — | `parent_chapter_id` = the NGO's national row; `parent_method` NULL | the registry states no parent link |
| `https://data.brreg.no/enhetsregisteret/api/enheter/<orgnr>` | `source_url` | |

**Per-NGO rules** (folded names, `include` / `exclude` / `strong` / website host / brand in activity):

| NGO | include | exclude | strong | host |
|---|---|---|---|---|
| Røde Kors | `\bRODE KORS\b` | | `\bRODE KORS\b` | rodekors.no |
| Norsk Folkehjelp | `\bNORSK FOLKEHJELP\b` | | `^NORSK FOLKEHJELP\b` | folkehjelp.no |
| Diabetesforbundet | `\bDIABETESFORBUNDET\b` | | `^DIABETESFORBUNDET\b` | diabetes.no |
| Mental Helse | `\bMENTAL HELSE\b` | `\bMENTAL HELSE UNGDOM\b` | `\bMENTAL HELSE\b` | mentalhelse.no |
| LHL | `\bLHL\b` | | `^LHL\b` | lhl.no |
| 4H Norge | `\b4H\b` | | `\b4H$` | 4h.no |
| Norges Speiderforbund | `SPEIDER` | `\b(KFUK\|KFUM)\b` | `\b(SPEIDERGRUPPE\|SPEIDERGRUPPA)\b\|\bNSF\b` | speiding.no |
| Sanitetskvinnene | `SANITETSFORENING\|SANITETSKVINNER` | | `\bN K S\b\|SANITETSFORENING` | sanitetskvinnene.no |
| Nasjonalforeningen | `\bHELSELAG\b\|\bNASJONALFORENINGEN\b\|\bDEMENSFORENING\b` | | `\bNASJONALFORENINGEN\b` | nasjonalforeningen.no |

## Rules and traps

From `reference-code/src/sources/brreg-chapters.ts`:

1. **Fold Ø/Æ/Å before matching brand tokens.** Under Unicode NFD they do not decompose:
   `RØDE KORS` becomes `RDE KORS` and a pattern for `RODE KORS` matches 0 of 383 units, silently
   (`reference-code/src/lib/text.ts`).
2. **Confidence:** the NGO's own orgnr, or a strong name corroborated by website host or activity
   text → `high`; strong name or corroboration alone → `medium`; neither → `low`. Name alone
   produces confidently wrong results; never present `low` as fact.
3. **Exclude a different organisation sharing a word.** A plain `SPEIDER` match returns 565 units,
   169 of them KFUK-KFUM-speiderne — nearly a third would be another organisation's chapters.
4. **Exclude support bodies** carrying the brand: FORELDREFORENING, VENNEFORENING, VENNER AV,
   STØTTEFORENING, STØTTEGRUPPE, BORETTSLAG, EIENDOM, HUS AS, SAMEIE.
5. **One orgnr can match two NGOs** (a sanitetsforening whose name contains HELSELAG). Keep the
   stronger claim, never both.
6. **Owned companies and foundations** (form AS/STI) are kept as `related_entity`, never chapters.
7. **The unit type comes from the name, by tier.** Write the NGO's own word where the name states
   it (`… AKERSHUS FYLKESLAG` → Fylkeslag); otherwise leave it NULL. One constant per NGO put
   "Lokallag" on 9 national offices and 116 regional bodies. Røde Kors local types: Hjelpekorps,
   Omsorg, Ungdom, Barnehjelp, Besøkstjeneste, else Lokalforening.
8. **Nasjonalforeningen's local units are often `<place> HELSELAG`** with no brand token: they land
   as `low` by design.
9. **Unitary NGOs are skipped.** Running the name search for them returns 1 and 3 rows and must not
   overwrite their sub-unit chapters.
10. **`assertedAt` stays empty.** The registry has no "last confirmed" date; never fill it with the
    fetch date.

## Personal data

None from this derivation. The registry's contact fields for a small chapter can be a board
member's own phone or e-mail — if Atlas carries them, they follow the private path, not public
tables (owner decision 2026-10-03/04). A registry address for a small chapter is often a
volunteer's home: place it at postal-code precision, never as an exact point.

## Acceptance targets

Measured on the research run of 26–27 Sep 2026 (`acceptance-targets.csv`). A fresh run will
differ somewhat as the register changes; a large gap is the signal.

| NGO | registered chapters (`legal_entity`) | of them confirmed by the NGO's site (`both`) |
|---|---:|---:|
| Røde Kors | 381 | — (not crawled yet) |
| Sanitetskvinnene | 463 | 439 |
| Nasjonalforeningen | 370 | 311 |
| 4H Norge | 494 | 359 |
| Norges Speiderforbund | 393 | — (not crawled) |
| LHL | 228 | 208 |
| Mental Helse | 188 | 88 |
| Diabetesforbundet | 117 | 86 |
| Norsk Folkehjelp | 107 | 92 |

A row joined with the NGO's own site (`both`) becomes `high` (`reconcile-chapters.ts`); the
registry-only remainder keeps the confidence this derivation gave it.

## Reference implementation

`reference-code/src/sources/brreg-chapters.ts` (with `reference-code/src/lib/text.ts` for
`normaliseName`). It runs as-is (see the package README). In Atlas: a dbt model
`int_ngo_chapter_registry_match` over `dim_brreg_enhet`, one CTE per NGO rule, emitting the columns
above plus `match_method` (`nameStrong+website+activity` etc.). The per-NGO rules belong in a
seed (`ref_atlas_ngo_match_rule`) so a new NGO is a row, not code.

## Open gaps

- Precision is measured for Røde Kors only; the other eight are confirmed through their sites
  instead (`both`), which is not the same as a precision figure.
- Speiderforbundet's kretser are not geographic; the registry gives no parent link.
- Registry-only rows (e.g. Mental Helse 100) may be dormant registrations or gaps in the site.
