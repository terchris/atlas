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

## ✅ Spawned PLANs — 2026-09-11

This investigation stays in `backlog/` until every child PLAN has shipped (`PLANS.md`).

| plan | state | delivers |
|---|---|---|
| [PLAN-001-brreg-bulk-snapshot](../active/PLAN-001-brreg-bulk-snapshot.md) | **Active** | the one-time load of 1,174,098 enheter into `raw`, streaming, no CSV stage |
| [PLAN-002-brreg-change-feed](PLAN-002-brreg-change-feed.md) | Backlog | the daily poller — `oppdateringsid` watermark in Postgres, append-only, `Sletting` as the deletion |
| [PLAN-003-brreg-dim-and-frivillig](PLAN-003-brreg-dim-and-frivillig.md) | Backlog | dbt incremental → `marts.dim_brreg_enhet`, Frivillighetsregisteret enrichment, `dim_ngo` derived |

**Three decisions taken by ops-dev on 2026-09-11** under Terje's delegation (#711), so they are
settled rather than open: **enheter only** in the first plan (underenheter a named follow-on),
**daily** cadence, and the versions table decided **by measurement** in PLAN-003 phase 1 rather than
by argument.

## ✅ Decided by Terje, 2026-09-11

| | |
|---|---|
| **Ingest scope** | **Everything — the full Enhetsregisteret, 1,174,098 organisations.** Not the voluntary subset. |
| **Publication** | **No new public endpoint.** The gain shows up in existing `api_v1` views getting better as the NGO population becomes derived rather than curated. |

🔴 **What the full-register choice changes, and it is not what I expected.** I had recommended the
voluntary subset partly because its dedicated API returns `icnpoKategorier` natively. Choosing
everything does **not** discard that — it makes the design use **two Brreg sources, not one**:

- **`/enhetsregisteret/api/enheter/lastned` + `/oppdateringer/enheter`** — the base: all 1,174,098
  organisations and the change feed that keeps them current. This is shadow-brreg's design.
- **`/frivillighetsregisteret/api/frivillige-organisasjoner`** — enrichment for the ~72,806 that are
  voluntary, adding `icnpoKategorier`, `grasrotandel`, `innfoertDato` and `vedtekter`, none of which
  Enhetsregisteret carries.

So **candidate #9 is not superseded by this decision — it becomes the enrichment half of it.** A PLAN
must cover both, and the join key is `organisasjonsnummer` in each.

⚠️ `registrert_i_frivillighetsregisteret` in Enhetsregisteret identifies *which* organisations are
voluntary, but only the dedicated register says *what they do*. Do not treat the flag as a substitute
for the second source.

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

> ✅ **Re-verified 2026-09-12, because imac reported this endpoint as 404.** It is not. Three
> consecutive requests from here returned **200**, with `icnpoKategorier`, `grasrotandel`,
> `innfoertDato`, `vedtekter` and `paategninger` on the record, and the single-organisation path
> (`/frivillige-organisasjoner/<orgnr>`) also returns 200.
>
> imac's four other paths do 404 from here too — `/frivillighetsregisteret/api`,
> `/frivillighetsregisteret/api/dokumentasjon`, `/frivillighetsregisteret/api/frivilligeOrganisasjoner`
> (camelCase) — but none of those is the endpoint named above. **The hyphenated
> `frivillige-organisasjoner` is the one that answers**, and the enrichment half of PLAN-003 stands as
> designed. Recorded here rather than only in the thread, so nobody redesigns it on the 404.
>
> 🟢 imac's independent point holds regardless and is the more useful half: **FRR *membership* needs no
> second source at all.** `registrertIFrivillighetsregisteret` is present on 100% of bulk records and
> true for 72,798 — against the ~72,806 quoted above. Only FRR-*specific attributes* need this API.

## 🔴 What "everything" means — and the part the decision did not cover

The decision above says the full Enhetsregisteret. **Enhetsregisteret is two registers, and this file
did not previously mention the second one:**

```
/enhetsregisteret/api/enheter         1,174,098    the legal entities
/enhetsregisteret/api/underenheter      862,903    their establishments — own register, own change feed
```

Underenheter are ~42% more rows on top of the decided scope, and this is **not academic for Atlas**:
some NGO local branches are registered as underenheter (`BEDR`) rather than as `FLI` enheter, so a
copy of enheter alone has a population gap exactly where Atlas cares.

**Recommendation, for confirmation rather than assumed:** **enheter only in the first PLAN**,
underenheter as a follow-on once the machinery is proven. The change-feed design is identical for
both — `/oppdateringer/underenheter` exists and behaves the same way — so adding them later is more of
the same rather than a redesign, and doing them together doubles the first thing that has to work.

⚠️ **Terje should confirm or correct this.** "Everything" was answered before this distinction was
put in front of him, so the decision recorded above is about enheter by default rather than by
choice.

## Where this file is still the right place to look

Candidate #9 is one scored row in a catalogue of fourteen. This file is the design deep-dive for it,
plus two questions the catalogue does not cover:

- **The full Enhetsregisteret (1,174,098)** — Terje's original question, and what he chose. That is
  *not* candidate #9; #9 is the voluntary subset (**72,806**, 6.2% of the register), which is now the
  enrichment half rather than an alternative.
- **The implementation** — shadow-brreg's change-feed architecture, and the 2026 verification of it.

So candidate #9 is not a competing option: it is a component of the chosen design, and this file is
where that design lives.

## Why this came up

Atlas today holds **122 organisational units**. Enhetsregisteret holds **1,174,098**.

That is not a gap in the load — it is the design working as specified. But it bounded what Atlas could
answer, which is why Terje asked, and the answer is the decision recorded above.

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
3. **Deletions are handled.** shadow-brreg branches on all four `endringstype` values
   (`index.ts`): `Ny`, `Endring`, `Sletting`, `Fjernet`. A copy that kept serving a withdrawn entity
   would be publishing something the authoritative register has removed — this is what discharges that
   obligation.

   🔴 **Corrected 2026-09-11 — this file previously said the deletion value was `Fjernet`. It is
   `Sletting`.** A 500-change sample from the live feed contained `Endring` 351, `Ny` 100,
   **`Sletting` 49**, and **no `Fjernet` at all**. shadow-brreg's code is right; my description of it
   was wrong. **Anyone implementing from the earlier text would have matched on a value the API does
   not emit, never deleted anything, and produced exactly the stale-copy failure this section warns
   about.** Handle all four; treat `Sletting` as the deletion.

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
                                                              `Sletting` filtered out
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

This is not merely *better* than the date-based watermark shadow-brreg used. **It is the only thing
that works** — see the paging cap below.

- **no timestamp ties.** Several changes can share a millisecond; ids cannot collide.
- **exactly resumable.** Store the last processed id; ask for the next one.

#### 🔴 The page parameter is capped at 20, and the reachable pages are all `Ukjent`

Found by imac (urb-agents #711), reproduced here on 2026-09-12:

```
size=500, page 0-19      →  200
size=500, page 20+       →  HTTP 400     (the cap applies inside a ?dato= window too)
advertised totalPages    →  32,835       of which 32,815 are unreachable by page
page 0, 500 records      →  endringstype: Ukjent × 500, all dated 2018-04-23
?dato=2026-09-10, 500    →  Endring 314, Ny 133, Sletting 53
```

⚠️ **A loader that walks the feed by incrementing `page` gets twenty pages of `Ukjent`, then HTTP 400,
and never sees a single `Sletting`.** It would look perfectly healthy and delete nothing. Matching
`Sletting` correctly does not save it, because the feed is never walked at all — a test that only
checks the enum passes.

So **PLAN-002 designs for the cursor and leaves no page-based fallback in**, because the fallback is
the broken path. And `Ukjent` gets a deliberate branch: counted and surfaced, never crashed on, never
silently skipped, and **never treated as a deletion**.

#### ⚠️ `totalElements` — claimed, retracted, and then the retraction withdrawn. It stands.

This section said `totalElements` gives the backlog depth. On 2026-09-12 I **struck** that on imac's
measurement, relayed by ops-dev as *"mutually inconsistent"*:

```
unfiltered                16,417,370
at oppdateringsid=1000000 15,751,321
at oppdateringsid=16417000  7,815,236
```

I reproduced the numbers and agreed. **I should not have.** They look inconsistent only if
`oppdateringsid` is a record ordinal — a cursor at 16,417,000 of 16,417,370 records "should" leave
370. It is not an ordinal: ids are sparse and the id space runs to ~25.18M against 16.4M records, so
7.8M records genuinely remain.

Measured two ways on 2026-09-12. The three segments sum **exactly** to the unfiltered total
(666,049 + 7,936,085 + 7,815,236 = 16,417,370), and an enumerated window matches its prediction
exactly:

```
totalElements at 25,000,000   141,187
totalElements at 25,100,000    58,526
predicted in [25.0M, 25.1M)    82,661
actually enumerated            82,661   ← exact
```

🟢 **So the capability is real**: one request with `size=1` gives the number of records remaining from
the watermark, and it decreases monotonically as the watermark advances.

🔴 **What is true from imac's finding is narrower, and still matters:** *id arithmetic* measures
nothing. Asking for `16,417,000` returns a first record of `16,427,801` — a 10,801-id gap containing
zero records. Count records with `totalElements`; never subtract ids.

⚠️ Left at this length deliberately. Within one day I claimed more than I had measured, then withdrew
something true on someone else's reading of the same numbers. Neither error was caught by argument;
both were settled by enumerating the window. **When a number is disputed, count it.**

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
| `naeringskode1.kode` | an ICNPO route for the ~1.1M that are **not** in Frivillighetsregisteret, via `brreg-icnpo` / `ref_brreg_icnpo`. ⚠️ For the 72,806 that *are*, prefer `icnpoKategorier` from the dedicated register — it is the registrant's own classification rather than one derived from an industry code |
| `forretningsadresse.kommunenummer` | joins straight to `dim_kommune`; every organisation gets a geography without a new crosswalk |
| `antall_ansatte`, `konkurs`, `under_avvikling` | size and liveness signals that today exist only for the curated 122 |

**The strategic point:** `dim_ngo` is currently a hand-curated file. With the full register plus the
Frivillighetsregisteret flag, the NGO population becomes *derived* — and Atlas's coverage-gap analysis
stops being bounded by who someone remembered to add.

## How the decisions were reached

**All three are settled.** Kept because the reasoning is why the design looks as it does, and because
one of them was a mistake of mine that a later reader should meet rather than repeat.

### 1. Ingest scope — ✅ decided: everything

The options that were weighed, for the record:

| | what is loaded | rows | outcome |
|---|---|---|---|
| **A** | everything | **1,174,098** | ✅ **chosen** — shadow-brreg's answer; maximum future optionality |
| **B** | Frivillighetsregisteret only | 72,806 | not chosen as the scope — **became the enrichment half** |
| **C** | keep the curated list, extend `landscape.json` | ~hundreds | not chosen |

I recommended **B** and Terje chose **A**. Recording that plainly: the case for A is optionality, and
it is the design he originally built.

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
worse than not holding one. That is an argument **for** the change feed, and shadow-brreg's handling of
all four `endringstype` values — `Ny`, `Endring`, **`Sletting`**, `Fjernet` — is what discharges it.

### 3. What is published — ✅ decided: no new endpoint

Terje's standing rule (urb-agents #350) is that **the public API serves `api_v1` only** — *"if a
consumer needs a mart, it gets an `api_v1` view of it."* That rule already does the work here: the
register can live in `raw` and `marts` without a single row reaching the public API until someone
writes a view and a human reviews it.

⚠️ But note the asymmetry: **ingest is reversible, publication is not.** A row nobody fetched can be
deleted; a row someone fetched cannot be un-fetched.

## What a PLAN would need to establish

Not answers — the things that would have to be measured before committing:

1. **Actual size on disk.** The 44-column flattened shape at 1,174,098 rows, plus indexes, against the
   659 MB `raw` schema Atlas has today.
2. **Bulk-load duration**, and whether it fits inside a Dagster run pod's limits — the existing
   `transform_checks` startability work suggests Atlas's run pods have real bounds.
3. **Change-feed volume at the chosen interval.** Retention is no longer a question — the feed goes
   back to 2018 — so this is only "how many changes per day, and does draining them fit in a run".
4. **Whether the append-only versions table earns its storage** at 1,174,098 organisations, or whether
   the current-state-only shape is enough. This is the main cost of the dbt-incremental design above.
5. **Whether `jsonb` beats the flattened 44 columns.** Storing the source document and typing views
   on top would preserve fields nobody selected — the ones the CSV config silently drops.
6. **Whether the existing `brreg-enheter` seed survives or is subsumed.** Two Brreg tables with
   different populations is exactly the "second place that must agree" failure this project keeps
   meeting.

## Falsification

⚠️ **This section previously tested whether the curated list was sufficient — i.e. whether option C was
right. That test is now incoherent: if it passed it would contradict the decision recorded at the top
of this file.** Replaced with one that tests the thing which can actually fail.

**The claim the design rests on is: *the change feed keeps Atlas's copy identical to Brreg.*** The
bulk load is easy to get right and easy to verify. **Drift appears in the feed**, silently, and a
copy that has quietly stopped applying changes looks exactly like one that is working.

**The test:**

1. Let the automated poll run for **at least a week** — not immediately after the bulk load, which
   proves only that the snapshot imported.
2. Take **50 random `organisasjonsnummer`** from Atlas's copy. Fetch each from
   `/enhetsregisteret/api/enheter/{orgnr}` live.
3. Diff every field. **Any mismatch is a defect.**
4. Separately, take 50 orgnr that the feed reported as `Sletting` during that week and confirm **none
   of them is still being served** by Atlas.

**One mismatch falsifies it.** Step 4 is the one that matters most: an implementation that applies
`Ny` and `Endring` but silently drops `Sletting` passes steps 1–3 perfectly and is still wrong —
which is exactly the bug the earlier `Fjernet` error in this file would have produced.

⚠️ **Do not substitute a row count.** `count(*)` matching Brreg's `totalElements` is consistent with
having missed a deletion and an insertion in the same window.

## References

- [`terchris/shadow-brreg`](https://github.com/terchris/shadow-brreg) — analysed 2026-09-10
- `atlas-data/ingest/src/lib/brreg/` — the existing typed client, already built on Brreg's OpenAPI spec
- `atlas-data/ingest/src/seed-sources/atlas-ngo-landscape/landscape.json` — today's population
- urb-agents #350 — Terje's `schemas: api_v1` decision, which governs what could be published
