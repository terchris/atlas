# What goes wrong between ingesting a source and a consumer trusting it

[`AGENT-onboard-source.md`](./AGENT-onboard-source.md) covers getting bytes into
`raw`. This covers everything after: modelling, publishing, deploying and
verifying — and it is written from **defects that actually happened**, mostly on
2026-09-21, when Atlas went from 15 served sources to 31 in a day and produced
roughly one published-contract defect per source.

Every entry says what bit, and **whether anything catches it now**. That second
column is the point: a lesson that is only written down is a lesson waiting to
recur, and several of these were already written down somewhere when they
recurred.

---

## 1. A row count says nothing about coverage

`fhi-neet` has 108,220 rows and covers 345 of 357 kommuner. `fhi-hasj` has
34,356 and covers 66. `fhi-selvmord` covers **21**. And
`indicator_latest_values` returns ~357 rows per series either way, because a row
exists wherever the source publishes at all — including where `value` is null.

A consumer reading row count as coverage overstates it by up to five times, and
an external one nearly built a need index that way.

> **Always quote `indicator_summary.kommuner_with_value`. Never quote
> `latest_row_count` when the question is "can I use this".**

**Caught by:** nothing automatic. The descriptions say it; `verify-release.py`
asserts coverage > 0 but cannot know what number is *enough*.

---

## 2. `year` is the first year of a window, not the year of the data

`fhi-selvmord` publishes 5-year rolling windows. Its newest row reads
`year = 2020` and covers 2020–2024. A careful reader called it "six years
stale" and was one message from telling a consumer so. `fhi-mobbing` has the
same shape with 3-year windows.

`fact_kommune_indicators` **cannot express a window** — its grain has one
`year`. The indicator models keep `period`, `period_start_year` and
`period_end_year`; those are lost in the fact.

> **When a source's `AAR` is a range, say so in the description and check
> whether `period_start_year != period_end_year` before quoting a year.**

**Caught by:** nothing. Documented on `fact_kommune_indicators.year`.

---

## 3. The manifest advertises the upstream's coverage, not Atlas's

`fhi-depresjon` advertised `2012–2025` and held four years, because the ingest
requests `AAR=bottom(4)` against FHI's 50,000-cell cap. `fhi-selvmord`
advertised `1990–2024` and held three windows. **`time_coverage` is published in
the sources registry**, so this is a claim to the public.

**Eleven other FHI sources still have this.**

> **`time_coverage` states what Atlas holds. If the ingest windows, the manifest
> says the window.**

**Caught by:** nothing. Two fixed by hand; the rest are outstanding.

---

## 4. Summing over a dimension that contains its own total

SSB's `Kjonn` codes `'0'` as **all**. Summing every sex row doubles the
population of every kommune in Norway. FHI's `INNVKAT` `'23'` is 1st-gen **plus**
2nd-gen — the sum of `'2'` and `'3'`. FHI's age bands overlap: `0_120` is
everyone *and* `0_4`, `5_9` … are also present. `KODEGRUPPE`
`P01_P29ogP70_P99` is a combined chapter the manifest explicitly says to exclude
from disjoint sums.

> **Before summing or filtering any upstream dimension, find out whether it has
> an "all" member. Assume it does until the manifest says otherwise.**

**Caught by:** nothing generic. `mart_kommune_befolkning_alder` filters sexes
explicitly and says why; the singular test there checks the bands sum to the
total, which would catch a *gap* but not a double-count.

---

## 5. A survey is not an enumeration

Ungdata tables carry `SMR` (standardised ratio, 100 = national) and `MEIS` (a
smoothed estimate). **No `TELLER`, no `RATE`.** These cannot be summed, and
multiplying one by a population does not give a number of young people — which
is the `personer` defect with nine fresh chances to happen.

> **Check `MEASURE_TYPE` before treating a value as a count.**

**Caught by:** nothing. Said in all nine descriptions.

---

## 6. Not every region code is a kommune

`case when region_code ~ '^[0-9]{4}$' then region_code end as kommune_nr` called
Svalbard, Jan Mayen, the continental shelf and 19 "uoppgitt" codes
municipalities. FHI's `GEO` mixes kommune, fylke, **bydel** and nasjon. SSB's
`9999` is a *current* code that is not a municipality, so `is_active` does not
exclude it — and it reached three published surfaces before anyone named it.

> **Derive `kommune_nr` through `region_code_to_kommune_nr`, never a bare
> four-digit regex.**

**Caught by:** `check-classifier-vocabulary.sh` (every value the classifier can
emit exists in `ref_region_kind`) and
`check-kommune-marts-exclude-sentinels.sh` (every published per-kommune relation
excludes `9999`, list derived from the manifest so a new mart is covered).

---

## 7. "Has a model" is not "reaches a consumer"

Both directions happened in one day. `brreg-oppdateringer` reported
`downstream_model_count = 0` while feeding five marts — a served source looking
unserved, which reads as honest understatement and nobody audits. Then
`fhi-innvandrere` reported `1` while producing nothing any consumer can query —
and **the standing-rule gate passed**, because it was counting models rather
than reachability.

> **The measure is whether the source reaches an `api_v1` relation. A model that
> feeds nothing is not served.**

**Caught by:** `check-every-source-is-served.sh`, now testing reachability, with
deferrals declared by name and reason.

---

## 8. A test existing is not a test running

An `accepted_values` test would have caught four `source_id` literals with
underscores that joined to nothing. It never ran: catching it needs `dbt build`
against a database, and `transform_and_publish` runs
`dbt build --exclude-resource-type test`. **A green `PASS=82 WARN=0 ERROR=0`
contains no tests at all** — two agents quoted it as evidence a release worked.

A singular dbt test also needs **exactly one `ref()`**, or dagster-dbt cannot
attach it and nothing runs it.

> **Ask for `transform_checks` and `api_v1_checks` by name. The transform's own
> status answers a different question.**

**Caught by:** a smoke assertion in the image build (unreachable singular
tests), and `check-source-ids-are-real.sh` (static, no database).

---

## 9. Anything that counts things should be generated

The marts table count in `template-info.yaml` went stale three times in one day
— 63, 72, 80 — each time caught by a gate that *computed the right answer in
order to tell me I was wrong*. The holdings summary, the relation list and those
counts are now generated, with `--check` failing CI on drift.

> **A number a gate can compute is a number nobody should be typing.**

**Caught by:** `generate-holdings.py --check` and `render-template-info.sh`,
deliberately two independent implementations so they check each other.

---

## 10. Merging is not shipping, and a green transform is not a working release

Eleven commits once sat undeployed for two days because deploy requests were
written as observations rather than sent as tasks. `template-info.yaml` changes
reach a catalogue reader through a **pin**, which no Dagster job carries.

> **decide → gate → merge → send the deploy task → run `verify-release.py` →
> ask for `transform_checks` and `api_v1_checks` by name.**

**Caught by:** `lands-with.sh` derives which job (or pin) a range needs.
`verify-release.py` gives the deployer a pass/fail per dataset with no domain
judgement required.

---

## The shape behind most of these

Nearly every defect above was **wrong in a setting that corroborated it**. The
`source_id` underscores agreed with the lineage, the tests and the fact's
`accepted_values` — everything except the data. The missing lineage edge made a
served source look modest rather than broken. The verifier's path had all its
inputs sitting there without the script. `time_coverage` was a real field with a
real value that described the wrong system.

> **A claim whose surroundings look right is worse than one that fails
> obviously.** When adding a source, the question that catches most of this is
> not "is this right?" but **"what would this look like if it were wrong?"** —
> and then going to look.
