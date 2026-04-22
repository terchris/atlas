# Data-source metadata schema

For every upstream data source behind a Samfunnspuls report (and, by extension, every data source Atlas itself considers consuming), we answer a small set of questions in the same order, in the same shape. The goal is *not* to capture every technical detail of every source up front — we don't yet know what most of them contain — but to make it obvious, at a glance, what each source is **for**: which Atlas features it could power, which user-facing questions it answers, and why we'd bother.

The technical mechanics (granularity, cadence, protocol, licence, etc.) get filled in progressively, as we actually touch each source. Missing optional fields are expected and fine; missing required fields are not.

This schema is defined for the Samfunnspuls research and is intended to replace the looser bold-field style in `docs/research/data-sources.md` once proven — see "Promotion" at the bottom.

---

## Core — required for every source

This is the minimum a source entry must have. Without these, we don't know enough to decide whether to use it.

### Identity

| Field | Description |
|---|---|
| `id` | Our internal key. Format: `{provider-slug}-{table-id-or-short-name}`. Examples: `ssb-08764`, `udir-elevundersokelsen`, `rk-internal-members`, `kartverket-boundaries`. Slugs: `ssb`, `fhi`, `bufdir`, `husbanken`, `helsedir`, `helfo`, `skde`, `udir`, `imdi`, `nav`, `kartverket`, `rk` (Røde Kors internal), `other`. |
| `provider` | Organisation name, Norwegian form with parenthetical abbreviation. Example: `Statistisk sentralbyrå (SSB)`. |
| `kind` | What type of source this is. One of: `measurement` (numeric indicators — the usual case), `content` (news feeds, prose, archival text), `map_service` (WMS / WFS / vector tiles), `platform` (multi-endpoint API hub like IFRC GO or Brreg), `tooling` (clients, SDKs, design systems — non-data dependencies), `reference` (join keys, code schemes, classifications like ISO-3166 or SSB Klass). Determines which optional fields are meaningful. |
| `title_no` | Formal Norwegian title of the dataset. Verbatim from Samfunnspuls `Statistikkens navn` where available; otherwise the provider's own table header. For non-Norwegian sources, use the provider's own title. |
| `what_it_is` | One sentence describing the dataset in plain English. Not the bureaucratic title — the thing itself. Example: *"Count of children under 18 living in households below the EU-60 low-income threshold, per kommune, annual since 2013."* |
| `provider_table_id` | Provider's own identifier if one exists. Required when `kind = measurement` and the provider uses table ids (e.g. SSB `08764`, FHI indicator slugs). Optional otherwise — registry APIs, map services, and platforms usually have none; use `endpoint` as the locator. |

### Use cases — what Atlas can do with this

This is the core of each entry. Two subfields:

| Field | Description |
|---|---|
| `use_cases` | A short list of Atlas features this source could power, each with a one-sentence reason. Reference named features from `goal.md` (`coverage_gap_explorer`, `chapter_detail`, `tilskuddsmatcher`, `compare_organisations`, `for_bedrifter`, `om_appen`) or note `exploratory` with a short rationale. Each entry should make clear *why this source for this feature* — not just "general relevance". |
| `questions_answered` | Concrete user-facing questions this dataset can answer. One question per line, phrased the way a user (Kari, Jonas, Signe, Lisa, Ola) might actually ask it. These become test queries when we're designing features and sanity checks when evaluating whether a data source is paying its keep. |

If this section is thin — or we can't name a single feature or user question this source supports — that is itself a useful signal: the source probably isn't worth cataloguing further yet.

### Access — enough to find it again

| Field | Description |
|---|---|
| `endpoint` | Machine-addressable URL if there is one; otherwise the human-facing page. The point is "where do I go to fetch this?" |
| `auth` | `none` / `api_key` / `registration` / `other`. If anything other than `none`, one short line on how to obtain. |

### Samfunnspuls link

| Field | Description |
|---|---|
| `samfunnspuls_reports` | List of Samfunnspuls report titles that use this source, or `none` if Atlas is adopting the source independently of Samfunnspuls. |
| `om_tallene_kilde` | Verbatim `Kilde:` line from Samfunnspuls "Om tallene" for the first report listed above. Short — the full Om tallene block lives in `desktop-field-notes.md`. Omit if `samfunnspuls_reports: none`. |

### Status

| Field | Description |
|---|---|
| `atlas_decision` | One of: `adopt_v1_core`, `adopt_v1_extension`, `evaluate_later`, `reject`. `evaluate_later` is the default for anything we haven't seriously looked at yet — it's legal and common. `reject` means we looked and decided not to use it; requires a one-line reason so we don't re-evaluate the same source later. |
| `verified_on` | ISO date when Claude Code last confirmed the endpoint responds and the identity fields match what the provider publishes. Format: `YYYY-MM-DD`. |

---

## Optional — fill in as we learn

Everything below is nice to have but shouldn't block capturing a source at all. Fill in progressively, as actually touching each source reveals the answers.

### Temporal

- `first_year` — earliest year in the currently published series
- `latest_year` — most recent year published
- `cadence` — `annual` / `biennial` / `quarterly` / `monthly` / `event_driven` / `irregular` / `frozen`
- `telletidspunkt` — reference point in time, verbatim from Samfunnspuls where given

### Geographic

- `finest_granularity` — `grunnkrets` / `delbydel` / `bydel` / `kommune` / `fylke` / `nasjon` / `helseregion`
- `granularities_available` — all granularities offered
- `code_scheme` — which code system keys the geographic units (e.g. `ssb-kommune-2024`, `oslo-bydel-codes`)
- `coverage` — `full_norway` / `selected_kommuner` / `largest_cities` / `single_kommune`; if not `full_norway`, a one-line note

### Measurement (only when `kind = measurement`)

- `unit` — `count` / `percent` / `rate_per_1000` / `currency_nok` / `index` / `year` / `boolean` / other
- `reference_population` — the denominator (essential for reading `percent` and `rate_*`)
- `data_type` — `register` / `survey` / `administrative` / `census` / `derived`
- `caveats` — small-cell suppression rules, known biases, discontinuities in the series

### Platform structure (only when `kind = platform`)

- `sub_components` — list of the platform's key endpoints or sub-datasets. Each entry: `name`, `endpoint`, one-line purpose. Example: for IFRC GO, enumerate `/country/`, `/appeal/`, `/event/`, `/surge_alert/` rather than treating the entire platform as opaque. Keep to the endpoints Atlas plausibly cares about; a platform with 70 endpoints doesn't need 70 lines if only five are in scope.

### Technical access

- `protocol` — `pxwebapi_v2` / `rest_json` / `csv_download` / `html_scrape` / `bespoke_extract` / `wms` / `wfs` / `sparql` / `rss` / `sdmx` / other
- `example_query` — one concrete working query (curl one-liner, URL with params, etc.) that actually returns data
- `response_format` — `json_stat2` / `json` / `csv` / `xlsx` / `html` / `geojson` / `xml` / other
- `rate_limits` — verbatim from provider docs
- `bulk_download_url` — if the provider ships a bulk dump
- `previous_endpoints` — list of URLs this source has moved from, with dates where known. Example: `api.sehavniva.no → vannstand.kartverket.no (Sep 2024)`. Keep so we can match legacy references across the repo when updating downstream code.

### Licence

- `licence` — `nlod_2.0` / `cc_by_4.0` / `cc_zero` / `public_domain` / `proprietary_permitted` / `proprietary_restricted` / `unknown`
- `citation` — required attribution string for Atlas's "Om appen" page and per-indicator footers
- `terms_url` — link to the provider's terms of use

### Atlas integration

- `dependencies` — other `id`s this source depends on (e.g. a Kartverket boundary set for rendering)
- `samfunnspuls_transformation` — anything Samfunnspuls does on top of the raw source (default `none`)
- `open_questions` — anything that blocks moving from `evaluate_later` to an adopt decision

---

## Format on disk

Each source is one `###` entry in `data-sources.md`. Required fields render as a YAML-style block; optional fields that we *have* filled in join the same block; prose follows if needed.

```markdown
### ssb-08764 — Barn under 18 år i lavinntektshusholdning (EU-60)

```yaml
id: ssb-08764
provider: Statistisk sentralbyrå (SSB)
kind: measurement
provider_table_id: "08764"
title_no: Antall barn og unge under 18 år som tilhører husholdninger med lavinntekt (EU-60)
what_it_is: >
  Count of children under 18 living in households with equivalised income
  below 60% of the national median, per kommune, annual since 2013.

use_cases:
  - coverage_gap_explorer: primary need signal for child-welfare activities —
    overlay with NGO chapter presence to surface kommuner with high need and
    low organisational coverage.
  - tilskuddsmatcher: need-weighting input when matching grant calls that target
    child welfare to specific kommuner.
  - compare_organisations: lets Jonas see how different NGOs' chapter footprints
    correlate with regional need.

questions_answered:
  - What share of children in kommune X live in EU-60 low-income households?
  - Which kommuner have the highest child poverty rates?
  - Has child poverty in kommune X improved or worsened over the last decade?
  - Which kommuner combine high child poverty with low NGO presence?

endpoint: https://data.ssb.no/api/pxwebapi/v2/tables/08764
auth: none

samfunnspuls_reports: ["Barnefattigdom (child poverty map)"]
om_tallene_kilde: "Statistisk sentralbyrå (SSB), statistikkbanktabell 08764"

atlas_decision: adopt_v1_core
verified_on: 2026-04-21

# optional, filled in as we learn:
first_year: 2013
latest_year: 2023
cadence: annual
telletidspunkt: 31. desember
finest_granularity: kommune
granularities_available: [nasjon, fylke, kommune]
code_scheme: ssb-kommune-2024
coverage: full_norway
unit: count
data_type: register
protocol: pxwebapi_v2
response_format: json_stat2
licence: nlod_2.0
citation: "Kilde: Statistisk sentralbyrå, tabell 08764"
samfunnspuls_transformation: none
```

Prose commentary if useful — methodology subtleties, how Atlas will combine this with other sources, reasons for the decision. Optional.
```

The YAML fence is presentation; it isn't executed. Atlas can parse it with a small script later if we want machine access.

---

## What belongs here vs. `desktop-field-notes.md`

`desktop-field-notes.md` is the raw evidence — what the live Samfunnspuls site actually showed, verbatim. It is authoritative for "what Samfunnspuls claims".

The schema's output in `data-sources.md` is the synthesised map — what Atlas will actually consume. It pulls from field notes but adds Claude Code's upstream verification (does the endpoint respond? what's the latest year now?) and, crucially, Atlas's own integration decisions (the `use_cases`, `questions_answered`, and `atlas_decision` fields).

If field notes and upstream disagree, the schema entry records both and flags it in `open_questions`.

---

## How this evolves

This is a **minimum schema**, not a comprehensive one. It will almost certainly prove incomplete for some sources we haven't touched yet — a bespoke extract from the Red Cross that has no public endpoint, a Kartverket vector-tile service that isn't a "dataset" in the usual sense, a city-level open-data portal with a completely different access model. When we hit a case the schema can't describe, we extend it here first, then backfill the affected entries.

The short list of extension rules:

1. **Never make a new field required retroactively.** Optional, discoverable-as-we-go.
2. **Required fields can only be added if they can be filled in for every existing entry without research.** In practice this means almost never.
3. **Prefer splitting an overloaded field over adding a new one.** If `use_cases` turns out to be doing two different jobs, split it before enriching it.
4. **Enums grow by necessity, not preference.** If a source doesn't fit any existing `protocol` value, add one — don't mash it into `other`.

---

## Promotion

Once this schema has been filled in for the ~20 sources Samfunnspuls surfaces, we evaluate:

1. Does the schema capture the questions Atlas actually needs to answer about each source? If yes, adopt it as the canonical per-source format across the repo.
2. Backfill the existing entries in `docs/research/data-sources.md` (Red Cross API, Kartverket, Brreg, FHI Folkehelsestatistikk, etc.) into this format.
3. The old loose bold-field style is retired.

If evaluation reveals gaps, extend the schema here first, then promote.
