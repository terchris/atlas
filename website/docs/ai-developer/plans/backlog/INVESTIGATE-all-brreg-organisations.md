---
mdx:
  format: md
---

# INVESTIGATE: all Brreg organisations in Atlas

## Status

**Open — 2026-09-10.** Raised by Terje, who asked how Atlas could hold every organisation in
Brønnøysundregistrene and pointed at his own earlier implementation,
[`terchris/shadow-brreg`](https://github.com/terchris/shadow-brreg), as the thing to analyse.

**Direction set by Terje, 2026-09-11:** *"focus now is taking the concept that i wrote in that repo many years ago and implementing it in atlas."* So this is no longer weighing whether to do it — it is establishing what a PLAN must contain.

The API was re-verified against the live service on 2026-09-11 rather than trusted from the 2023 code, at his instruction. **Both questions that would have blocked a PLAN are now answered** (no retention window; poll by `oppdateringsid`). NLOD attribution has moved to [INVESTIGATE-nlod-attribution](INVESTIGATE-nlod-attribution.md) so it is handled separately.

**Two decisions remain Terje's**: ingest scope, and what reaches `api_v1`.

## 🔴 Read this first — most of this was already decided, and I did not check

**Option B below is candidate #9 of
[INVESTIGATE-new-norwegian-public-sources](INVESTIGATE-new-norwegian-public-sources.md)**, scored
Tier 2 long before this file was written. I wrote this investigation without opening that one. The
duplication is mine, and this section exists so the next reader meets the catalogue rather than
re-deriving it.

**What candidate #9 already settled**, and this file now adopts rather than rediscovers:

| | |
|---|---|
| **Fit** | generalises **Report #7 (NGO Footprint vs Need)** from Red-Cross-only supply to all-Norwegian-NGO supply |
| **Licence / geo / cadence** | NLOD · per-orgnr, aggregates to kommune via registered address · continuous |
| **[Q24]** | **extend the existing Brreg ingest module**, do not spin up a new one |
| **[Q26]** | sequencing dependency on the SDG/ICNPO tagging investigation producing a settled crosswalk |

⚠️ **And it named the right endpoint, which I had wrong.** I was heading for Enhetsregisteret filtered
with `?registrertIFrivillighetsregisteret=true`. Candidate #9 names
`data.brreg.no/frivillighetsregisteret/`, and that is the better source — verified 2026-09-11:

```
GET /frivillighetsregisteret/api/frivillige-organisasjoner
  → organisasjonsnummer, frivilligOrganisasjonsstatus, kontonummer, innfoertDato,
    foersteGangInnfoert, grasrotandel, regnskapsrapportering, vedtekter,
    icnpoKategorier, paategninger
```

🟢 **`icnpoKategorier` arrives natively** — `{"icnpoNummer": "9100", "kategori":
"ICNPOKategori.internasjonaleOrganisasjoner"}`. **That materially reduces [Q26]**: Atlas does not have
to *derive* ICNPO codes, only map the register's own codes onto `ref_atlas_service_category`. The
source half of the crosswalk is solved by the upstream. Whether that removes the sequencing dependency
or merely shrinks it is for whoever picks up #9 to judge — **but it should be judged, not inherited.**

## Where this file is still the right place to look

Candidate #9 is one scored row in a catalogue of fourteen. This file is the design deep-dive for it,
plus two questions the catalogue does not cover:

- **Option A — the full Enhetsregisteret (~1.17M).** That is Terje's original question and is *not*
  candidate #9. #9 is the voluntary subset (**72,806**, 6.2% of the register).
- **The implementation** — shadow-brreg's change-feed architecture, and the 2026 verification of it.

So: **if the answer is B, this is not a new dataset — it is candidate #9 with a design attached.**
A and C remain genuinely open and are this file's own.

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

## The polling mechanism in detail, and how it maps onto Atlas's stack

Terje asked for this specifically. **shadow-brreg does poll automatically** — it is not a
re-download-and-diff, it is a proper change-feed consumer, and that is the part worth carrying over.

### What it actually does, per run

| | |
|---|---|
| `app/shadow/cronjobs.txt` | `*/1 * * * * …/shadow-cronjob.sh` — **every minute** |
| `shadow-init_json.sh:162` | `crontab "$GITHUBDIR/$CRONJOBSFILE"` installs it at container start |
| `shadow-cronjob.sh` | `flock -x -n` — a slow run cannot be overlapped by the next minute's tick |
| `index.ts:686` `main()` | three steps, below |

```
getLastDateWeStoredOpdatesFromBrregAPI()   → read watermark from urbalurba_status
getAllOppdaterteEnheterFromBrregAPI(...)   → GET /oppdateringer/enheter?dato=<watermark>&page&size=100
updateBrregShadowDatabaseWithChanges(...)  → drain the oppdaterteEnheter queue into brreg_enheter_alle
```

Three properties make this good, and Atlas should preserve all three:

1. **A durable watermark** (`urbalurba_status.last_brreg_oppdateringsid` / `last_brreg_update_date`,
   written back after each batch). Catch-up after downtime is *the same code path* as steady state —
   there is no separate backfill and no "how far behind are we" guessing.
2. **A queue table** (`oppdaterteEnheter`, with `urb_processed` / `urb_processed_status`) so a batch
   interrupted halfway is resumable rather than lost.
3. **Deletions are handled.** `endringstype: "Fjernet"` has its own branch (`index.ts:459, 571`) that
   marks the shadow record. A copy that kept serving a withdrawn entity would be publishing something
   the authoritative register has removed — this is what discharges that obligation.

### The mapping

| shadow-brreg | Atlas equivalent | note |
|---|---|---|
| `*/1 * * * *` cron | Dagster automation condition | `cadence.py` already has the pattern; the *interval* is an open question, below |
| `flock -x -n` | Dagster run coordinator + `ATLAS_MAX_CONCURRENT_INGESTS` | already in place, already bounded at 4 |
| `urbalurba_status` watermark | a `raw.*` watermark table | ⚠️ **not** a Dagster sensor cursor — see below |
| `oppdaterteEnheter` queue | `raw.brreg_oppdateringer`, append-only | it is data, not orchestration |
| the TypeScript update loop | **dbt incremental model** | 🔴 this is the real change — see below |

### ⚠️ Keep the watermark in Postgres, not in Dagster

Dagster offers cursors, and it would be the obvious place. **It is the wrong place here.** A cursor
lives in the Dagster instance database — the one that survives `uis undeploy dagster` by luck rather
than design, and that ops preserved on #591 specifically because it holds evidence. If it is lost or
rebuilt, Atlas silently restarts the feed from nowhere.

A watermark row in `raw` is backed up with the data it describes, inspectable with `psql`, and
consistent with `raw.ingest_runs`. shadow-brreg put it in Postgres and that was right.

### 🔴 The one thing that must change: raw is a landing layer, not a mutable table

shadow-brreg **mutates `brreg_enheter_alle` in place** — insert, update and delete against the single
table that is also the thing you query. That is correct for a shadow database whose only job is to
mirror.

It is wrong for Atlas, and not stylistically: **`raw.*` is a landing layer written by ingest and read
by dbt.** An in-place-mutated raw table breaks two things Atlas relies on —

- **marts can no longer be rebuilt from raw.** A `dbt run` after an UPDATE sees only the current
  state; the history that produced it is gone.
- **the change feed's own value is discarded.** Brreg tells us *what changed and when*; overwriting
  the row throws that away at the moment of receiving it.

The Atlas-native shape keeps ingest append-only and moves the reconciliation into dbt:

```
raw.brreg_enheter_snapshot    one bulk load, point-in-time          (ingest, rare)
raw.brreg_oppdateringer       append-only change feed               (ingest, polled)
raw.brreg_enheter_versions    each fetched version of a changed org (ingest, polled)
        │
        └── dbt incremental model ──► marts.dim_brreg_enhet   current state,
                                                              `Fjernet` filtered out
```

Deletions stop being a `DELETE` and become **a row that is filtered**, which means "what did this
organisation look like before it was removed" remains answerable. That is a capability shadow-brreg
gave up and Atlas would get for free.

⚠️ **This is a design sketch, not a decision.** Whether the versions table is worth its storage at
~1.1M organisations is exactly the kind of thing a PLAN must measure rather than assume.

### ✅ Verified against the live API, 2026-09-11 — and both open questions are answered

I checked rather than trusting the 2023 code, because Terje was right that Brreg may have moved. **It
has not, in shape — and two things are better than shadow-brreg could use.**

| | measured |
|---|---|
| `GET /enhetsregisteret/api/enheter/lastned` | **200**, `enheter_alle.json.gz`, **210 MB gzipped**, `last-modified` the same morning — **regenerated daily** |
| `GET /oppdateringer/enheter?dato=…` | **200**, same HAL shape: `_embedded.oppdaterteEnheter[]` with `oppdateringsid`, `dato`, `organisasjonsnummer`, `endringstype` |

#### 🟢 There is no retention window

```
?dato=2015-01-01  →  first result: oppdateringsid 1, dato 2018-04-23T06:03:29Z
?dato=2020-01-01  →  first result: oppdateringsid 6369376
```

A request for 2015 returns **the first update Brreg ever recorded**. The feed is the complete history
since April 2018.

**So cadence is a freshness choice, not a correctness one.** The risk I flagged — a slow poll silently
missing changes after an outage — does not exist. Atlas can poll daily, weekly or monthly and catch up
completely whenever it next runs. That removes the question that would otherwise have had to be
settled before choosing an interval.

#### 🟢 Poll by `oppdateringsid`, not by `dato`

The endpoint accepts `?oppdateringsid=` and returns from that id onward:

```
?oppdateringsid=25150890&size=2
  → 25150890, 25150892
  → page: {"totalElements": 23108, "totalPages": 11554}
```

This is strictly better than the date-based watermark shadow-brreg used, and it is what Atlas should
build on:

- **no timestamp ties.** Several changes can share a millisecond; ids cannot collide.
- **exactly resumable.** Store the last processed id; ask for the next one.
- 🔴 **`totalElements` is the backlog depth.** Atlas can answer *"how far behind are we"* with one
  request — a monitoring signal shadow-brreg had no way to produce.

#### Two smaller findings

- **`_links.enhet.href` is on every change**, pointing at the changed entity. shadow-brreg fetched the
  entity separately; the link is already there.
- **The bulk file is regenerated daily**, so a re-bootstrap is never more than a day stale — which
  makes "snapshot then catch up from the feed" cheap to redo if it is ever needed.

#### What remains open about cadence

Only the ordinary question: how fresh does Atlas want to be. `cadence.py` already carries the
argument that polling faster than data changes is discourteous, and the register moves slowly. **Daily
is defensible and so is weekly; nothing breaks either way.**

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

## Decisions, all Terje's

⚠️ **One of the three below was wrong when first written and is now marked as such.** Decision 2 is
not a blocker; it resolved into an attribution gap Atlas already has.

### 1. Ingest scope

| | what is loaded | rows | note |
|---|---|---|---|
| **A** | everything | ~1.1M | shadow-brreg's answer; maximum future optionality |
| **B** | Frivillighetsregisteret + relevant forms (FLI, STI, …) | tens of thousands | serves Atlas's stated purpose directly |
| **C** | keep the curated list, add NGOs to `landscape.json` | ~hundreds | no new machinery at all |

**C is not a straw man.** If the answer to "which organisations" is "these thirty", C is hours of work
and no new obligations.

### 2. ✅ Personal data — I overstated this, and Terje corrected it

**This section originally said Atlas holding Brreg's enkeltpersonforetak was "a governance decision
before a technical one" and implied it could block the wider ingest. That was wrong.**

Terje, 2026-09-10: *"the persons in brreg are public because they are related to companies. by that
the law says that they should be in the register."*

He is right, and it is not a small correction. **The persons are in Enhetsregisteret because the law
requires them to be, and the register is public for exactly that reason** — transparency about who
stands behind a legal entity is the register's purpose, not a side effect of it. Brreg publishes the
whole thing as open data under **NLOD**. Re-use, including republication, is what the licence is for.

So there is no lawful-basis question to settle before ingesting, and I should not have framed one.

#### What survives, and it has moved out of this investigation

**Attribution is a repo-wide obligation, not a Brreg one**, and it is now
[INVESTIGATE-nlod-attribution](INVESTIGATE-nlod-attribution.md) at Terje's direction — so it does not
sit here looking Brreg-specific and get closed along with this. `seed-sources/brreg-enheter/` having
no manifest is recorded there as the one concrete known gap.

⚠️ **One thing stays here because it is a design constraint rather than a licence question.** If Brreg
corrects or removes an entry, Atlas's copy must follow it — a stale copy serving a withdrawn record is
worse than not holding one. That is an argument **for** the change feed, and shadow-brreg's
`endringstype: "Fjernet"` handling is what discharges it.

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
3. **Change-feed volume at the chosen interval.** Retention is no longer a question — the feed goes
   back to 2018 — so this is only "how many changes per day, and does draining them fit in a run".
4. **Whether the append-only versions table earns its storage** at ~1.1M organisations, or whether
   the current-state-only shape is enough. This is the main cost of the dbt-incremental design above.
5. **Whether `jsonb` beats the flattened 44 columns.** Storing the source document and typing views
   on top would preserve fields nobody selected — the ones the CSV config silently drops.
6. **Whether the existing `brreg-enheter` seed survives or is subsumed.** Two Brreg tables with
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
