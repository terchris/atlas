# Investigate: Adopt Felles datakatalog classification (DCAT-AP-NO, EU Data Theme, LOS)

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide how Atlas should align its source-classification scheme (PLAN-007 `manifest.yml` tags) with the controlled vocabularies used by [Felles datakatalog](https://data.norge.no/) (DCAT-AP-NO), so Atlas's catalogue is interoperable with national and EU dataset discovery without giving up the domain-precise vocabulary the contributor frontend benefits from.

**Last Updated**: 2026-05-01

**Origin**: PLAN-007 (Data display — open by default) introduces `manifest.yml` per source with four tag namespaces (`provider`, `topic`, `geo`, `cadence`). The user asked how Atlas should learn from data.norge.no's classification work — specifically *Utgiver*, *Tema*, *EU-tema*, and *modelldcat-ap-no* information models. This investigation evaluates each system, recommends an adoption path, and sequences the work behind PLAN-007 so it doesn't block delivery of the open-by-default frontend.

---

## What Felles datakatalog actually uses

Three distinct classification systems are surfaced as filter facets on data.norge.no, plus the metadata standard underneath:

| Their facet | What it is | Vocabulary | URI prefix |
|---|---|---|---|
| **Tema** | Norwegian topic taxonomy for public services | LOS — SKOS vocabulary maintained by Digdir | `https://psi.norge.no/los/` |
| **EU-tema** | EU's 13-bucket data-theme vocabulary | DCAT-AP `dcat:theme` (EU Publications Office) | `http://publications.europa.eu/resource/authority/data-theme/{CODE}` |
| **Utgiver** | Publisher organisation | DCAT-AP `dct:publisher` | Brreg orgnr |
| (the catalogue itself) | DCAT-AP-NO 2.0 — Norwegian profile of EU's DCAT-AP | RDF/Turtle/JSON-LD | n/a |

Separately, **modelldcat-ap-no** is the spec for *information models* (schemas, not datasets) — the URL the user linked points to one of these. It's an adjacent but distinct concern from dataset classification.

The 13 EU Data Theme codes:

| Code | Label (EN) | Norwegian gloss |
|---|---|---|
| AGRI | Agriculture, fisheries, forestry and food | Landbruk, fiske, skogbruk og mat |
| ECON | Economy and finance | Økonomi og finans |
| EDUC | Education, culture and sport | Utdanning, kultur og sport |
| ENER | Energy | Energi |
| ENVI | Environment | Miljø |
| GOVE | Government and public sector | Forvaltning og offentlig sektor |
| HEAL | Health | Helse |
| INTR | International issues | Internasjonale spørsmål |
| JUST | Justice, legal system and public safety | Justis, rettssystem og offentlig sikkerhet |
| REGI | Regions and cities | Regioner og byer |
| SOCI | Population and society | Befolkning og samfunn |
| TECH | Science and technology | Vitenskap og teknologi |
| TRAN | Transport | Transport |

---

## Questions to Answer

1. **Which Atlas topics map to which EU Data Theme?** How many Atlas topics fall outside the 13 buckets cleanly, and what do we do about them?
2. **Is LOS a useful classification for Atlas datasets, or only for service consumers?** LOS is a public-services taxonomy organised around life events (*å få barn*, *flytte*, etc.), not raw statistics — but Samfunnspuls services that *consume* Atlas data could be LOS-classified.
3. **Should Atlas publish its own DCAT-AP-NO catalogue?** This would make Atlas harvestable by data.norge.no and (transitively) by data.europa.eu. What's the minimum surface area — a single `/catalog.ttl` endpoint? A `mart_meta_dcat` model? When does this become worth doing?
4. **Should the contributor and customer frontends expose EU theme as a filter alongside Atlas's domain topic, or instead of it?** EU theme is coarser; UX may benefit from the finer-grained Atlas vocabulary; both is possible but adds chrome.
5. **Where does the mapping live?** Per-source `manifest.yml` field (`eu_theme: SOCI`)? Lookup seed (`eu_data_theme.csv`) joined into `mart_meta_sources`? Both?
6. **Where do `modelldcat-ap-no` information models fit, if at all?** Atlas's `api_v1.*` endpoints are in some sense information models — could `mart_meta_endpoints` eventually emit modelldcat-ap-no descriptions? Probably out of scope short-term but worth noting.

---

## Current state

After PLAN-007 Phase 2 lands, Atlas has:
- 21 `manifest.yml` files under [`atlas-data/ingest/src/sources/`](../../../../atlas-data/ingest/src/sources/) with 4 tag namespaces (`provider`, `topic`, `geo`, `cadence`).
- Atlas-domain topic vocabulary: `ngo-supply`, `reference`, `income`, `education`, `health`, `social`, `demographics`.
- Publisher field already keyed to Norwegian organisation names (SSB, FHI, Norges Røde Kors).
- No EU Data Theme tags. No LOS tags. No DCAT-AP-NO catalogue endpoint.

---

## Mapping Atlas topic → EU Data Theme (initial pass)

Speculative, to anchor discussion:

| Atlas `tags.topic` | EU Data Theme | Notes |
|---|---|---|
| `education` | `EDUC` | Clean fit. |
| `health` | `HEAL` | Clean fit. |
| `demographics` | `SOCI` | EU Data Theme SOCI is "Population and society" — explicit fit. |
| `social` | `SOCI` | Same bucket as demographics — collapses two Atlas topics. |
| `income` | `SOCI` or `ECON` | Lavinntekt is socioeconomic; ECON is "Economy and finance" (more macro). SOCI is the better fit because Atlas's income data is household-level inequality, not GDP/finance. |
| `reference` | (no fit) | Reference data (kommune codes, classifications) is structural, not domain. Could go to `GOVE` if forced. |
| `ngo-supply` | (no fit) | NGO/civil-society data has no dedicated EU theme. `SOCI` is closest; `GOVE` if framed as public-sector adjacent. |

Conclusion: **5 of 7 Atlas topics map cleanly; 2 don't.** The collapse (income+social+demographics → SOCI) is information loss for Atlas's UX, but acceptable for federated discovery where coarser is fine.

---

## Recommendation (provisional — to be confirmed in this investigation)

**Add `eu_theme` as a parallel namespace in `manifest.yml`. Keep `topic` as Atlas-domain.**

Rationale:
- EU Data Theme is the lingua franca for federated dataset discovery.
- Cost is ~1 line per manifest + a single seed CSV with 13 rows.
- Preserves Atlas's finer-grained `topic` for the `/data` UX (filter by `income` vs. `social` vs. `demographics` is more useful to a user than collapsing all three to SOCI).
- Unlocks two things later:
  1. A future `/catalog.ttl` (or `mart_meta_dcat`) endpoint that data.norge.no can harvest.
  2. Link-out from Atlas's per-source page to the same dataset's neighbours on data.europa.eu.

**Don't adopt LOS for dataset classification.** LOS is the wrong abstraction layer — it classifies *services* and *life events*, not raw data. If Atlas later describes Samfunnspuls services or other downstream consumers, LOS is the right vocabulary for *those entities*, not for the underlying datasets.

**Defer DCAT-AP-NO publishing as a separate workstream.** Material payoff (national catalogue inclusion → discoverability), but it's a meaningful chunk of work (RDF emission, harvest URL, conformance testing). Should land as its own PLAN after PLAN-007 ships.

**Defer modelldcat-ap-no entirely** unless and until Atlas has a use case for publishing schemas as RDF. The standard is real, but Atlas's `api_v1.*` is already self-describing via PostgREST/OpenAPI; the duplication isn't justified yet.

---

## Concrete shape if we go ahead

`manifest.yml` schema amendment (Phase 2 of PLAN-007 or a follow-up phase):

```yaml
source_id: ssb-08764
# ... existing fields ...
tags:
  provider: ssb
  topic: income            # Atlas-domain, unchanged
  geo: kommune
  cadence: annual
eu_theme: SOCI             # NEW — DCAT-AP data-theme code, single value
los_theme: null            # NEW — usually null; populated only where a clean LOS concept exists
```

Plus a seed at `atlas-data/dbt/seeds/eu_data_theme.csv`:

```csv
code,uri,label_en,label_no
AGRI,http://publications.europa.eu/resource/authority/data-theme/AGRI,Agriculture fisheries forestry and food,Landbruk fiske skogbruk og mat
…
SOCI,http://publications.europa.eu/resource/authority/data-theme/SOCI,Population and society,Befolkning og samfunn
…
```

Joined into `mart_meta_sources` so the customer frontend can render both Atlas-topic and EU-theme filters.

---

## Sequencing

This investigation produces a one-page outcome note + an amendment to PLAN-007 (add `eu_theme` field, add `eu_data_theme.csv` seed). It does NOT block PLAN-007 Phase 2.5+ — those phases land first, this amendment lands as a Phase 2.7 follow-up or a small standalone PLAN.

The DCAT-AP-NO publishing question becomes its own `INVESTIGATE-dcat-ap-no-publishing.md` once Atlas has at least one external user asking for harvestability.

---

## Open questions for the user

1. **EU theme cardinality**: single value per source (simplest), or array (more accurate when a source genuinely spans two themes — e.g. ssb-09429 educational attainment by kommune touches EDUC + SOCI)? Recommendation: single value, primary theme only, until proven insufficient.
2. **LOS confirmation**: agree that LOS doesn't fit Atlas dataset classification? (Or is there a use case I'm missing — e.g. "this dataset is relevant to the *Få barn* life event"?)
3. **DCAT-AP-NO publishing timing**: confirm this is a separate later PLAN, not PLAN-007 scope.

---

## Sources

- [Felles datakatalog Search API documentation](https://data.norge.no/en/technical/api/search)
- [DCAT-AP-NO 2.0 specification (Informasjonsforvaltning)](https://informasjonsforvaltning.github.io/dcat-ap-no/)
- [EU Publications Office Data Theme vocabulary](https://op.europa.eu/en/web/eu-vocabularies/dataset/-/resource?uri=http://publications.europa.eu/resource/dataset/data-theme)
- [LOS vocabulary documentation (Digdir)](https://data.norge.no/guide/los-dokumentasjon/files/los-dokumentasjon.pdf)
- [modelldcat-ap-no specification](https://github.com/Informasjonsforvaltning/modelldcat-ap-no)
- [DCAT-AP 3.0 (SEMIC EU)](https://semiceu.github.io/DCAT-AP/releases/3.0.0/)
