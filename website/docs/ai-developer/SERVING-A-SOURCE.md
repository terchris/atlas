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

Then it happened a second time the same day, in the opposite direction: a
consumer shipped the caption «Mobbetallene er fra 2022» for a 2022–2024
window. Two readers, one prose warning, two wrong years.

🔴 **The remedy this section used to give was the defect.** It said the window
was stated in the description, and told the reader to check
`period_start_year != period_end_year`. Neither is performable where the
mistake is made: a PostgREST consumer rendering a caption sees
`indicator_summary`, which had no period columns, and parsing the prose is
worse than useless — the consumer's own workaround, matching `/1-year/i`
against the description, false-positives on `fhi-kpr-1aar`, whose title
contains "KPR 1-year" and which is annual anyway (urb-agents #1331).

Since 2026-09-21 the number is a column: `window_years` on
`fact_kommune_indicators` and `indicator_latest_values`,
`latest_year_window_years` on `indicator_summary`. The covered span is
`year` to `year + window_years - 1`. It is **derived** from the source's own
period string by the `window_years()` macro, not declared.

> **A property a consumer must read in order to render a value correctly
> belongs in a column, not in a description.** Prose is for why; columns are
> for what. If the only way to render your data correctly is to parse an
> English sentence, you have shipped a trap, however well the sentence is
> written.

⚠️ `window_years = 1` means "one year", not "unknown". Eleven CTEs get the
literal 1 because their source publishes no period columns. A genuinely
windowed source that shipped no period columns would read 1 and be wrong.

🔴 **And the fact was already published, in a relation nobody opened.**
`api_v1.meta_dimensions` — 228 rows, live for weeks — records what each
upstream dimension means. It has said `fhi-selvmord AAR = "5-year rolling
window"` the whole time, and `fhi-kpr-1aar = "single-year despite the range
form"`, which is exactly the disambiguation that defeated the regex. **Three
parties derived the windowing independently while it sat there**, and the
claim "exactly two FHI sources are windowed" — used as evidence in the design
of this column — was wrong. The catalogue named a third,
`fhi-vgs-gjennomforing` ("3-year rolling cohort"), whose `2023` was rendering
on a consumer's front page as a point vintage. A fourth, `ssb-12944`
("3-year rolling period"), is still in the serving BACKLOG and is the next
one to get a wrong `1`.

> **Before deriving a fact about an upstream dimension, query
> `meta_dimensions` for it.** Reading all 21 source descriptions by hand is
> thorough and structurally incapable of finding a window, because
> `meta_sources.description` does not carry one.

**Caught by:** `check-window-agrees-with-the-catalogue.sh` cross-checks every
fact source's windowing against `meta_dimensions` in CI, with no database —
a source the catalogue calls windowed may not publish `window_years = 1`, and
a source in the fact with no catalogue row fails rather than being skipped.
⚠️ Both sides are hand-authored, so two claims agreeing is weaker than a
measurement; it cannot tell you the derived number is right.
Also `window_is_uniform_within_an_indicator_year` (a singular test,
so it runs in `transform_checks`, not in `transform_and_publish`) asserts the
window does not vary across kommuner within one indicator-year — which is what
makes the `max()` in `indicator_summary` lossless. Nothing checks that a
literal 1 is truthful.

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


🔴 **And a deploy is not successful until the data arrives.** Terje's rule, 2026-09-21:
a release that adds or fixes a source is not landed until that source returns **rows**
through a published relation.

Two releases passed everything and delivered nothing:

```
fhi-innvandrere   32 720 ingested · 1 model · 0 published
                  reported as one of "the eight FHI sources served" — it was seven
ssb-06913        783 104 ingested · 4 relations wired · 0 arriving · weeks undetected
```

Both had `transform_and_publish` SUCCESS, no test failures, `api_v1_checks` shortfall 0,
and 19 of 19 relations answering. **Job status cannot distinguish "the release ran" from
"the release delivered."**

> **Name every source the release touches, with the relation it should appear in and an
> expected row count. "I cannot predict the count" is a valid answer; leaving the source
> off the list is not.**

**Caught by:** `atlas-data/uis/lands-with.sh` derives the per-source list from a git range
and flags any source with no published relation as one that will *deploy silent*. Run on
`b5bb530` it names `fhi-innvandrere` — the release that produced the rule. ⚠️ It reads the
lineage seed, so it tells you what SHOULD arrive, never what did; only the post-deploy
count does that.
---

## 11. Green CI is not a model that compiles

On 2026-09-21 a comment block in `dim_brreg_enhet` carried `--` on its **first
line only**. Everything after it was prose sitting in the middle of a select.
`dbt parse` passed. Every gate in this repo passed. CI was green. The model
failed at model 1 of 90 in production, and `drop ... cascade` took three
published relations dark — the second time that day the same three went dark.

`dbt parse` renders Jinja and builds the manifest. **It never looks at whether
the SQL it produced is SQL.** And `dbt compile` exits 0 on unparseable output,
so it does not catch it either. Measured by reintroducing the real defect:

```
dbt compile   exit 0
dbt parse     exit 0
the new gate  exit 1
```

> **A gate that reads the model source is not checking what reaches the
> database. Check the compiled output.**

**Caught by:** `check-models-compile.sh` — parses every compiled model as
Postgres with sqlglot, after verifying the parser against a known-bad and a
known-good statement so it cannot pass by accepting everything. Runs in CI
with an empty postgres, because `dbt compile` needs a connection even though
it reads nothing.

⚠️ It catches syntax, not semantics. A model that parses can still reference a
column that does not exist.

---

## 12. One upstream dimension can carry two vocabularies, and half of them are dead

`ssb-crime-tables` published **32 series, 18 of them with zero coverage**. Three parties
measured that number — a consumer, ops-dev and this agent — and none could explain it for a
day. It is not a defect in Atlas.

SSB's table 08487 changed its crime classification around 2015 and **kept both code sets in
the same `LovbruddKrim` dimension**:

```
16 codes = 7 current + 9 legacy      x 2 ContentsCode = 32 series
                                       14 populated · 18 empty

current   1AAAAA-9ZZZZz  4AAAAA-4ZZZZz  6AAAAA-6ZZZZz  7AAAAA-7ZZZZz
          8AAAAA-8ZZZZz  1AAAAA-1ZZZZz  2AAAAA-3-5-9ZZZZz
legacy    0-999  1  0  01  11  12  14  18  45
```

⚠️ **The legacy codes are not empty — they stopped.** All nine last carry a value at
`2013-2014`; the current ones run to `2024-2025`. A dimension member that has been retired
does not disappear from the metadata, so it keeps producing a series forever.

> **Before calling a series empty, ask whether its code is discontinued. Query the upstream
> dimension for its full history, not just the latest year.**

**Caught by:** nothing, and it would be hard to. What made it *visible* was
`latest_year_agg()` — a discontinued series now reports the last year it had data instead of
the newest year a row exists, so `2013-2014` with real coverage rather than `2025` with
zero. ⚠️ That also means such a source is legitimately **mixed**: some series current, some
frozen years back. An acceptance check asserting one `latest_year` per source will read that
as a regression.

🔵 The general form, and it cost three investigations: **a code list is not a vocabulary.**
Two vocabularies in one dimension look identical through an API that returns codes, and the
only thing distinguishing them is which years carry values.

## 13. CI builds from an empty database, so state defects are invisible to it

🔴 **A whole class of defect exists only where state already lives — and that is
the one place CI is designed not to be.** Two shipped on 2026-09-25, both green
through every gate, both failing in production on the same day:

| what changed | why no gate could see it |
|---|---|
| a seed gained a column (`api_v1_relations` + `stability`) | dbt will not alter an existing seed table's schema. With no table there is nothing to conflict with, so CI simply creates the new shape and passes. In production it failed at node 44 of 143 and SKIPped four dependants, so the publish never ran. |
| `not_null` on a column that is empty in its seed (`ref_brreg_icnpo.label_en`) | no rows exist to violate the constraint. In production it failed with 46 of 46 rows. |

⚠️ **They are one class, not two incidents.** Both are claims about a
*transition from a prior state*, and CI only ever exercises the transition from
nothing. Adding a gate that builds from scratch cannot catch either — it will
pass, which is worse than not having it.

**Where the check belongs instead:**

- **What a deploy needs** — `atlas-data/uis/lands-with.sh` derives the extra
  step from the git range. It already flagged the one other change no scheduled
  job lands (a changed `indexes=` on an incremental model); the seed-header
  detector is its sibling, and prints the `--full-refresh` command with the
  environment it has to run in.
- **A claim about committed files** — `atlas-data/dbt/check-seed-not-null-matches-the-csv.sh`
  compares every `not_null` on a seed-backed published column against the CSV in
  the repo. No database, no dbt parse, no warehouse: the claim is about two
  files that are already checked in, so it is checkable where they are.

🔵 **The question to ask** when a change touches anything with persistent state —
a seed's columns, an incremental model, an index, a constraint:
**"what does this look like where the old version already ran?"**

⚠️ And one more from the same day, about the checks themselves: a **control that
silently does not run is indistinguishable from a control that passed.** A
known-bad control broken by a quoting error printed green on an unmodified file;
a wait loop polling a truncated run id printed success having measured nothing.
After breaking something deliberately, verify the breakage *took* before reading
the result.

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
