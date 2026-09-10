---
mdx:
  format: md
---

# INVESTIGATE: all Brreg organisations in Atlas

## Status

**Open — 2026-09-10.** Raised by Terje, who asked how Atlas could hold every organisation in
Brønnøysundregistrene and pointed at his own earlier implementation,
[`terchris/shadow-brreg`](https://github.com/terchris/shadow-brreg), as the thing to analyse.

No child PLAN yet. **Three decisions below are Terje's and none of them are technical.**

## The question

Atlas today holds **122 organisational units**. Brreg's Enhetsregister holds roughly **1.1 million**.

That is not a gap in the load — it is the design working as specified. But it bounds what Atlas can
answer, and the question is whether that bound is still the one we want.

## What Atlas has today, and why

`raw.brreg_enheter` is not a register copy. It is a targeted pull driven by
`ingest/src/seed-sources/atlas-ngo-landscape/landscape.json`, which names **11 NGOs**:

> Norges Røde Kors · Norsk Folkehjelp · Nasjonalforeningen for folkehelsen · Norske Kvinners
> Sanitetsforening · Norges Speiderforbund · 4H Norge · Frelsesarmeen · Stiftelsen Kirkens Bymisjon ·
> Mental Helse · LHL · Diabetesforbundet

For each, `fetchNgoUnits()` runs a fuzzy `navn` query plus `organisasjonsform: FLI`, then an **exact
name-prefix post-filter** — because Brreg's `navn` parameter is compound-similarity-ranked, so
`navn=norsk+folkehjelp` also returns every FLI whose name merely contains "norsk".

Brreg's job here is narrow and it does it well: give each NGO and lokallag a **stable `orgnr`**, plus
the live `konkurs` / `under_avvikling` / `under_tvangsavvikling` flags that downstream "is this NGO
active?" queries filter on. **A dissolved lokallag reported as active is a wrong answer, not a stale
one** — which is why this is the only seed source declared to dbt with a `loaded_at_field`.

### 🔴 The limit that matters

**Atlas can only see NGOs someone has already named.** The landscape file is the population, so
Atlas cannot answer *"which organisations work on child poverty in Vestland"* — only *"which of these
eleven do"*. Every coverage question Atlas asks is scoped to a list a human wrote.

## What `shadow-brreg` did

Analysed from the repository, 2026-09-10. The architecture is two moves, and both are right.

### 1. Bulk snapshot, once

```sh
wget -O enheter_alle.json.gz 'https://data.brreg.no/enhetsregisteret/api/enheter/lastned'
gunzip enheter_alle.json.gz
awk '{gsub(/\|/,"")}1' enheter_alle.json > enheter_alle_nopipe.json     # ⚠️ see below
json2csv -i enheter_alle_nopipe.json -o enheter_alle.csv -d '|' -c json2csv-config.json
psql -c "\COPY brreg_enheter_alle FROM 'enheter_alle.csv' WITH DELIMITER '|' CSV HEADER;"
```

`json2csv-config.json` selects and flattens **44 fields** — `organisasjonsform.kode` becomes
`organisasjonsform_kode`, and so on — into a single flat table.

⚠️ **The README records the lesson that produced this**: *"Data now imported from json — importing
from M$ Excel resulted in incomplete data."* The bulk endpoint is the supported path; the spreadsheet
export is not.

### 2. Change feed, every minute

```
GET /enhetsregisteret/api/oppdateringer/enheter?dato=<watermark>&page=<n>&size=100
```

- a watermark table (`urbalurba_status`) holds `last_brreg_oppdateringsid` and `last_brreg_update_date`
- each change — `oppdateringsid`, `dato`, `organisasjonsnummer`, `endringstype` — lands in a queue
  table (`oppdaterteEnheter`) with `urb_processed` / `urb_processed_status`
- the queue is drained against `brreg_enheter_alle` as insert, update or delete
- every row carries its provenance: `urb_brreg_oppdateringsid`, `urb_brreg_update_date`,
  `urb_brreg_endringstype`, `urb_sync_date`
- `flock -x -n` so a slow run cannot be overlapped by the next minute's cron

**This is the correct shape and Atlas should keep it.** A monotonic `oppdateringsid` plus a durable
watermark means catch-up after downtime is the same code path as steady state — no separate backfill,
no "how far behind are we" guessing. The queue table makes a partially-processed batch resumable
rather than lost.

### 🔴 The one thing not to copy

```sh
awk '{gsub(/\|/,"")}1'
```

**This strips every `|` character from the source data before loading**, because `|` was chosen as the
CSV delimiter. Any organisation whose name or address legitimately contains a pipe silently loses it.
It is data mutated to fit a transport choice, and the corruption is invisible afterwards — there is no
record that a character was removed.

Atlas must not reproduce this. `COPY … FORMAT csv` handles quoting properly, and better still,
Postgres can ingest the JSON directly (`jsonb`) with no CSV stage at all — which also removes the
"TAKES TIME" conversion the script apologises for.

## Why this matters more to Atlas than it did to shadow-brreg

shadow-brreg's purpose was exploration — *"play with machine learning, data science… on your local
machine"*. Atlas has a narrower purpose and, because of it, **three specific payoffs that a general
company register does not obviously have**:

| Brreg field | what Atlas gains |
|---|---|
| `registrert_i_frivillighetsregisteret` | 🔴 **the whole voluntary sector, discovered rather than listed.** Atlas stops asking "which of these 11" and starts asking "which organisations" |
| `naeringskode1.kode` | maps to ICNPO through machinery Atlas already has — `brreg-icnpo` and `ref_brreg_icnpo` |
| `forretningsadresse.kommunenummer` | joins straight to `dim_kommune`; every organisation gets a geography without a new crosswalk |
| `antall_ansatte`, `konkurs`, `under_avvikling` | size and liveness signals that today exist only for the curated 122 |

**The strategic point:** `dim_ngo` is currently a hand-curated file. With the full register plus the
Frivillighetsregisteret flag, the NGO population becomes *derived* — and Atlas's coverage-gap analysis
stops being bounded by who someone remembered to add.

## 🔴 Three decisions, all Terje's

### 1. Ingest scope

| | what is loaded | rows | note |
|---|---|---|---|
| **A** | everything | ~1.1M | shadow-brreg's answer; maximum future optionality |
| **B** | Frivillighetsregisteret + relevant forms (FLI, STI, …) | tens of thousands | serves Atlas's stated purpose directly |
| **C** | keep the curated list, add NGOs to `landscape.json` | ~hundreds | no new machinery at all |

**C is not a straw man.** If the answer to "which organisations" is "these thirty", C is hours of work
and no new obligations.

### 2. 🔴 Personal data — this one is not a preference

Enhetsregisteret includes **enkeltpersonforetak (ENK)**, where the organisation name is frequently a
natural person's name, alongside their business address. There are several hundred thousand of them.

**Ingesting the full register means Atlas holds personal data at scale**, whatever it publishes. That
engages data-protection obligations Atlas does not currently have, because today's 122 units are
organisations rather than people.

This is a governance decision before it is a technical one, and it should be taken deliberately rather
than as a side effect of choosing option A. **If the answer is B, the question largely goes away** —
FLI and STI are organisations, not people.

### 3. What, if anything, is published

Terje's standing rule (urb-agents #350) is that **the public API serves `api_v1` only** — *"if a
consumer needs a mart, it gets an `api_v1` view of it."* That rule already does the work here: the
register can live in `raw` and `marts` without a single row reaching the public API until someone
writes a view and a human reviews it.

⚠️ But note the asymmetry: **ingest is reversible, publication is not.** A row nobody fetched can be
deleted; a row someone fetched cannot be un-fetched.

## What a PLAN would need to establish

Not answers — the things that would have to be measured before committing:

1. **Actual size on disk.** The 44-column flattened shape at ~1.1M rows, plus indexes, against the
   659 MB `raw` schema Atlas has today.
2. **Bulk-load duration**, and whether it fits inside a Dagster run pod's limits — the existing
   `transform_checks` startability work suggests Atlas's run pods have real bounds.
3. **Change-feed volume.** shadow-brreg polled every minute. Atlas's cadence discipline says poll no
   faster than the data changes; the right interval is an empirical question, and `MONTHLY_CRON`
   already exists for slow reference data.
4. **Whether `jsonb` beats the flattened 44 columns.** Storing the source document and typing views
   on top would preserve fields nobody selected — the ones the CSV config silently drops.
5. **Whether the existing `brreg-enheter` seed survives or is subsumed.** Two Brreg tables with
   different populations is exactly the "second place that must agree" failure this project keeps
   meeting.

## Falsification

The claim this investigation rests on is *"Atlas's questions are bounded by the curated list"*.

**It is falsifiable and someone should try**: take three coverage questions Atlas is actually asked,
and check whether the answer changes if the population is the whole Frivillighetsregisteret rather
than 11 NGOs. **If the answers do not move, option C is correct and the rest of this is expensive.**

## References

- [`terchris/shadow-brreg`](https://github.com/terchris/shadow-brreg) — analysed 2026-09-10
- `atlas-data/ingest/src/lib/brreg/` — the existing typed client, already built on Brreg's OpenAPI spec
- `atlas-data/ingest/src/seed-sources/atlas-ngo-landscape/landscape.json` — today's population
- urb-agents #350 — Terje's `schemas: api_v1` decision, which governs what could be published
