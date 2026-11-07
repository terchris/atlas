---
mdx:
  format: md
---

# Plan: six datasets atlas-scraper needs, served from Atlas

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active, started 2026-11-08. R1 in progress.

**Goal**: `atlas-scraper` (`terchris/atlas-scraper`, building API v2 for the new rodekors.no)
currently fetches six datasets directly from their upstreams instead of through Atlas, because
Atlas doesn't serve them yet. Once Atlas serves them, atlas-scraper reads Atlas first and the
upstream only as a fallback — one copy of each, kept by Atlas, same pattern as the four sources it
already reads this way (`brreg_enhet`, `kommune_befolkning_alder`, `meta_sources`, `dim_kommune`).

**Origin**: urb-agents #2098 (Terje, full spec) → #2099 (ops-dev, split to atlas) → this plan.
Terje, 2026-11-07, on why Atlas should hold these rather than atlas-scraper fetching them itself:
*"We own all services on urbalurba domains .no/.com/.eu so we should use the data there. And if
there is something that atlas-scraper needs we can ask the atlas agent to set it up."*

**Last Updated**: 2026-11-08

**Prerequisites**: None between phases — the six datasets are independent of each other (no phase
depends on another's output). Sequenced here only because I'm working through them one at a time;
any phase could ship first.

---

## Decisions and corrections (not re-litigated per phase)

- **No tor-agent/UIS or separate imac task needed.** Answered on #2099: all six are the same
  shape as every existing Atlas source (ingest raw → dbt model → `api_v1` → PostgREST) on
  infrastructure that already exists. `imac` verifying each deploy is the existing standing
  pattern for every Atlas release, not new work to carve out.
- **R1 scope correction (posted on #2099, 2026-11-08).** The request says Atlas "already holds a
  raw snapshot" of `brreg_underenhet` and R1 is just typing it. Checked exhaustively — no
  migration, no dagster asset, no ingest source, no manifest entry anywhere in `atlas-data`
  mentions underenheter except inside `schema.ts` (generated Brreg OpenAPI client types, not
  ingested data). `brreg-enheter-alle`'s own manifest says explicitly: "Underenheter (~863k
  sub-units) are a separate follow-on." R1 is therefore a full new bootstrap ingest, same shape and
  size as `brreg-enheter-alle` was, not a quick type-and-serve.
- **Bulk files vs PostgREST paging**: the spec allows either ("ordered paging... or a bulk file per
  dataset. Say which."). Default for every phase here is PostgREST paging (stable `order=` on the
  key + `Range`/`limit`/`offset`) — Atlas has no existing bulk-file/static-asset hosting, and
  paging needs no new infrastructure. Will flag explicitly per-phase if a dataset's shape (R5's
  2.6M-row address file; R3/R4's simplified-geometry variant) turns out to need bulk-file serving
  instead, before building anything new for it.
- **Open questions for Terje, not blocking start**: R2's postcode-count mismatch (13 in
  `dim_postnummer` only, 3 in Bring's file only — "say which is right, or serve both") and the
  `meta_sources` SSB licence correction (NLOD → CC BY 4.0) are both answerable without research;
  will resolve them when I reach R2 / do the sweep, not wait on them now.

---

## What every phase delivers (applies to R1–R6, per the request's own "what every dataset needs")

- Served by PostgREST in `api_v1`, readable without a login.
- Provenance in `meta_sources`: upstream URL, licence, fetch date.
- Whole, not sampled: every row, upstream's own columns, nothing altered (per this repo's standing
  rule — raw is verbatim, Atlas never edits source data).
- Refreshed on a stated schedule, last-refresh visible.
- Stable ordered paging (see Decisions above).
- Tested: row count against the upstream file of the same date; 5 rows checked field-by-field;
  geometry valid as GeoJSON EPSG:4258 where relevant.
- Reported back per #2098's "how to report back": table name, row count, test result, anything
  that differs from the request — posted on #2099 as each phase lands.

---

## Phase R1: Brønnøysund sub-units (`brreg_underenhet`)

**Upstream**: `data.brreg.no/enhetsregisteret/api/underenheter/lastned` (full gzipped JSON
download, same shape as `brreg-enheter-alle`'s `/enheter/lastned`). **Licence**: NLOD 2.0.

### Tasks

- [ ] 1.1 New ingest source `atlas-data/ingest/src/sources/brreg-underenheter-alle/` — manifest.yml
      (mirror `brreg-enheter-alle`'s: source_id, upstream_url, licence, dimensions for
      `organisasjonsnummer`/`overordnet_enhet`/`doc`/`snapshot_file_date`/`loaded_at`), index.ts,
      parse.ts, README.md, tests. Stream-parse the same way (depth-aware scanner, not
      newline-delimited) — reuse `atlas-data/ingest/src/lib/brreg/client.ts` and `schema.ts`'s
      existing `Underenhet` types rather than re-deriving them.
- [ ] 1.2 New migration: `raw.brreg_underenheter_snapshot` — `organisasjonsnummer` PK,
      `overordnet_enhet`, `doc` jsonb, `snapshot_file_date`, `loaded_at`. Same shape as
      `052_raw_brreg_enheter_snapshot.sql`, no GIN index on `doc` (same measured-cost reasoning as
      the parent table).
- [ ] 1.3 New dagster asset in `atlas_data/assets/raw_brreg.py` (or a sibling module) for the
      underenheter bulk load, wired into `schedules.py` alongside the existing Brreg assets.
- [ ] 1.4 dbt dimension model `dim_brreg_underenhet` (typed columns: `organisasjonsnummer`,
      `navn`, `overordnet_enhet`, `organisasjonsform_kode`, `naeringskode1_kode`,
      `antall_ansatte`, `oppstartsdato`, `nedleggelsesdato`, `kommune_nr`, `beliggenhetsadresse`,
      `postadresse` — each address as the spec's `adresse`/`postnummer`/`poststed`/
      `kommunenummer`/`land`/`landkode`), FK-style relationship test against
      `dim_brreg_enhet.organisasjonsnummer` via `overordnet_enhet` (materialize as a table if that
      test is expensive the way `dim_brreg_enhet`'s own self-join was).
- [ ] 1.5 `mart_brreg_underenhet` → `api_v1` (lookups: by `organisasjonsnummer`; all sub-units of
      one `overordnet_enhet` — index/filter accordingly).
- [ ] 1.6 `meta_sources` entry: upstream URL, NLOD 2.0 + Brønnøysundregistrene attribution line,
      daily refresh.
- [ ] 1.7 Tests: row count vs the upstream `/lastned` file's count that day; 5 rows field-by-field
      against the live API; CI gates this repo already runs (`check-every-source-is-served.sh`,
      `check-raw-read-only`, osmosis docs coverage).
- [ ] 1.8 PR, deploy request naming the relation and an expected row count (per this repo's
      "deploy is not successful until the data arrives" rule), imac verification, report back on
      #2099.

## Phase R2: Posten Bring's postcode register with categories (`bring_postnummer`)

**Upstream**: Posten Bring `postnummerregister-ansi.txt`. **Licence**: NLOD 2.0.

- [ ] 2.1 Resolve the postcode-count mismatch question with Terje before or alongside building (not
      a hard blocker — can serve both `dim_postnummer` and the new table and let the mismatch be
      visible, then correct whichever is wrong once he answers).
- [ ] 2.2 Ingest source, raw table, dagster asset, dbt model, `api_v1` relation, `meta_sources`
      entry — same shape as Phase R1's tasks 1.1–1.6, fields: `postnummer`, `poststed`,
      `kommune_nr`, `kommune_navn`, `kategori` (G/P/B/S/F), file date.
- [ ] 2.3 Tests + PR + deploy + verify + report, same as R1.

## Phase R3: Postcode areas (`kartverket_postnummeromrade`)

**Upstream**: Kartverket *Postnummerområder* (Geonorge). **Licence**: CC BY 4.0.

- [ ] 3.1 Decide full-vs-simplified geometry serving shape (two columns on one row vs two
      relations) before building; check whether PostGIS simplification (`ST_SimplifyPreserveTopology`
      at a stated tolerance, atlas-scraper uses 50m) is already used anywhere in this repo as
      precedent, or needs introducing.
- [ ] 3.2 Ingest, raw table, dagster asset, dbt model (fields: `postnummer`, `poststed`,
      `kommunenummer[]`, `geometry` GeoJSON EPSG:4258, `oppdateringsdato`), `api_v1`, `meta_sources`.
- [ ] 3.3 Tests (including the geometry-validity test) + PR + deploy + verify + report.

## Phase R4: Municipality and county boundaries (`kartverket_kommune`, `kartverket_fylke`)

**Upstream**: Kartverket *Administrative enheter kommuner/fylker* (Geonorge). **Licence**: CC BY 4.0.

- [ ] 4.1 Same full+simplified geometry pattern as R3 (reuse whatever R3 establishes).
- [ ] 4.2 Ingest, raw tables, dagster assets, dbt models (fields: `nummer`, `navn` incl. Sami/Kven
      forms where official, `gyldigFra`, `gyldigTil`, `geometry` full+simplified), `api_v1` ×2,
      `meta_sources` ×2.
- [ ] 4.3 Tests + PR + deploy + verify + report.

## Phase R5: Kartverket's official addresses (`matrikkel_adresse`)

**Upstream**: Kartverket *Matrikkelen – Adresse* (national CSV, EPSG:4258). 2,604,785 rows / 152MB
zip / 46 columns on 2026-11-07. **Licence**: CC BY 4.0.

- [ ] 5.1 Decide index-per-lookup vs bulk file atlas-scraper matches locally (spec explicitly asks
      to say which) — default to PostgREST paging/filtering per this plan's Decisions section
      unless the three lookup patterns (kommunenummer+adressenavn+nummer+bokstav[+postnummer];
      gardsnummer+bruksnummer) don't perform acceptably as indexed filters at 2.6M rows, in which
      case flag back before building bulk-file infrastructure.
- [ ] 5.2 Ingest, raw table, dagster asset, dbt model (fields: `adresseId`, `kommunenummer`,
      `adressetype`, `adressenavn`, `nummer`, `bokstav`, `gardsnummer`, `bruksnummer`,
      `postnummer`, `poststed`, point lat/lon EPSG:4258, `oppdateringsdato`), indexes matching the
      three lookup patterns, `api_v1`, `meta_sources`.
- [ ] 5.3 Tests + PR + deploy + verify + report.

## Phase R6: Municipality and county history (`ssb_klass_kommune`, `ssb_klass_fylke`, `ssb_klass_endring`)

**Upstream**: SSB KLASS classifications 131 (municipalities) and 104 (counties). **Licence**:
CC BY 4.0 per SSB's own licence page (see also the `meta_sources` SSB licence correction below —
same upstream, same correction applies here).

- [ ] 6.1 Ingest, raw tables, dagster assets, dbt models — `ssb_klass_kommune`/`ssb_klass_fylke`
      (every version: `code`, `name` incl. Sami forms, `valid_from`, `valid_to`, KLASS version id)
      and `ssb_klass_endring` (`old_code`, `new_code`, `change_occurred`, kind: renamed/
      renumbered/merged/split/border).
- [ ] 6.2 `api_v1` ×3, `meta_sources` ×1 (or ×3, matching however granular the other phases'
      provenance entries are).
- [ ] 6.3 Tests + PR + deploy + verify + report.

## Sweep: `meta_sources` SSB licence correction

- [ ] S.1 Correct every `meta_sources` row sourced from SSB: licence field NLOD → CC BY 4.0, citing
      https://www.ssb.no/en/diverse/lisens. Enumerate every SSB-sourced row first (don't hand-list
      — grep/query, per this repo's own standing rule about enumeration over hand lists) rather
      than only fixing the ones R6 touches.
- [ ] S.2 One PR, one deploy, one verify — this is a correction to existing published data, not
      new ingest, so it can land independently of R1–R6's sequencing.
