# Investigate: what Atlas is missing before it can replace Samfunnspuls

What a consumer needs from Atlas's DATA and API — not its documentation — to rebuild samfunnspuls.rodekors.no from Atlas alone, established by an outside agent that got 8 minutes from a standing start to a working prototype and then listed what stopped it going further.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Turn the second outside-consumer report into verified gaps, sized decisions and a sequence — separating what Atlas can decide alone from what needs Terje, and what is blocked on data that has not arrived.

**Last Updated**: 2026-09-29

**Origin**: Terje asked the same fresh Claude Code agent that filed [INVESTIGATE-agent-onboarding-friction](INVESTIGATE-agent-onboarding-friction.md) to recreate [samfunnspuls.rodekors.no](https://samfunnspuls.rodekors.no/) using **only** Atlas. It built a working single-file prototype in ~8 minutes, then reported what a *full* replacement would need. The Samfunnspuls inventory comes from that project's own `RKS-PBI-reports-overview.xlsx`.

⚠️ **The report is input, not audit** — it says so, and it notes the graph-to-Atlas matching was done by title rather than by opening each Power BI file. The "partial" ratings are a starting point. Every claim used below was re-measured against the live API on 2026-09-29.

---

## 🔵 What already works, and why it is the important half

**~8 minutes to a tested prototype**, with a front page, per-indicator statistics pages, a searchable catalogue of all 235 indicators, CSV export and favourites — reading live from Atlas with **no backend**.

It worked because three earlier decisions happened to be right:

- **`indicator_summary` + `indicator_latest_values` let ONE generic page serve every indicator.** Samfunnspuls needs one Power BI report per graph. This is the single biggest structural advantage Atlas has over the thing it would replace.
- **Open CORS** — no backend, no key, no proxy.
- **`kommune_nr` joins cleanly everywhere**, and the "missing is not low need" caveats could be passed straight through to end users.

🔴 **Hold on to that framing.** The gaps below are real, but the prototype exists. The question is not "can Atlas do this" — it is "which five things make the numbers trustworthy without caveats".

---

## Verified before use

| claim | measured 2026-09-29 | verdict |
|---|---|---|
| ~234 indicators | `indicator_summary` = **235** | ✅ |
| median 12.3% vs national 11.4% for child poverty | median **12.30%**, count-weighted **11.36%** (124 669 / 1 097 107) | ✅ **exact** |
| `kommune_ngo_totals` has no fylke | columns are `kommune_nr, kommune_name, active_count` | ✅ |
| `contents_label` cannot identify a unit | `"Andel eller rate"` covers `fhi-befolkningsvekst` (percent), `fhi-kpr-1aar` (values 96–249, **not** percent) and `fhi-neet` (percent) | ✅ |
| `contents_label` cannot identify a topic | `"FHI-glattet estimat (andel)"` is shared by **9 sources** — alcohol, depression, loneliness, cannabis, life quality, … | ✅ |
| an indicator with no values | exactly **1**: `ssb-12063` / `KOSfritidredleie0000` | ✅ |
| stray `¬` in labels | **12** labels, all crime tables | ✅ |
| `ssb-07459` absent from `indicator_summary` | confirmed — reachable only via `kommune_befolkning_alder` | ✅ |

---

## The gaps

| # | gap | status |
|---|---|---|
| G1 | No time series in a uniform shape | **open** — [Q1] |
| G2 | No official fylke or national values | **open** — [Q2] |
| G3 | No unit / value-type metadata | **open** — [Q3] |
| G4 | 15 of 33 Samfunnspuls graphs have no Atlas data | **open** — [Q4] |
| G5 | No readable titles, descriptions or topics | **open** — [Q5], overlaps onboarding [Q2] |
| G6 | No kommune boundaries | ✅ **shipped** — PR #479 |
| G7 | Red Cross chapter tables empty | **blocked** — credential, not code |
| G8 | Small data-quality items | **planned** — [PLAN-010](PLAN-010-indicator-catalogue-data-quality.md) |

🔴 **One of G8's suggestions is wrong, and acting on it would have caused a worse defect than the one reported.** See [Q6].

---

### [Q1] A long-format endpoint covering all years

**Today** `indicator_latest_values` returns only the latest year. History exists, but only inside the 40 per-source relations, each with its own columns and dimensions — so a generic page cannot draw a trend without source-specific code.

**Consequence:** the prototype has **no trend charts at all**, and "is it getting worse here?" is the question Samfunnspuls exists to answer.

**Asked for:** `indicator_values`, same columns as `indicator_latest_values` but every year.

⚠️ **Open sub-question, and it is the hard part:** which kommune set does history use? Municipalities merged in 2020 and 2024. A trend line that silently switches denominators is worse than no trend line. Options: resolve through `dim_kommune` to today's codes, or return the historical code and flag it. **Not decidable without a look at how many series actually cross a merger.**

### [Q2] Official fylke and national values

**Today** values are per-kommune only and PostgREST aggregates are disabled. Counts can be summed by a consumer. **Rates and shares cannot.**

🔴 **Measured, and this is the sharpest single finding in the report:**

```
child poverty (ssb-08764 / EUskala60)
  median of the 357 kommune shares   12.30 %
  count-weighted national rate       11.36 %
  difference                          0.94 pp
```

The prototype therefore shows *"Median for kommunene"* where the original says *"Norge"* — a different number, correctly labelled, and not the one a reader wants.

**Options:** (a) publish the publisher's own fylke/national rows — SSB and FHI both publish "hele landet"; (b) a sibling relation `indicator_latest_values_region` keyed by `region_kind` (`ref_region_kind` already exists); (c) where only numerator and denominator exist, an Atlas-weighted figure marked `derived`.

🔵 (a) is most consistent with Atlas's rule that values are the publisher's. ⚠️ But it needs checking per source whether the aggregate is actually ingested today — several sources request `GEO=0`, which **is** the national row.

### [Q3] Unit and value-type metadata — cheapest high-value item

**Today** nothing says what a `value` is. The consumer inferred units from label text **and got one wrong**, catching it only by checking against SSB counts.

**Asked for, on `indicator_summary`:** `unit` (`persons`/`percent`/`per_1000`/`nok`/`index_100`/`boolean`/`years`), `value_type` (`count` = summable, `share`/`rate` = not summable, `amount`, `boolean`), `decimals`, and optionally `polarity` (`higher_is_worse` / `higher_is_better` / `neutral`).

🔵 `value_type` is the one that prevents wrong arithmetic; `polarity` is the one that prevents a UI colouring "more volunteers" red.

⚠️ **This is 235 editorial judgements**, not a code change. It is cheap per row and cannot be derived from the labels — that is the whole finding.

### [Q4] The missing sources

**12 of 33** Samfunnspuls graphs are covered, **6 partial**, **15 not covered at all**: DSB (3), IMDi (2), NAV (1), Udir (4), Ungdata (3), SSB 10137 (1). Further SSB tables used by Samfunnspuls and absent from Atlas: **10137, 10539, 11042, 12203, 12767, 13006**.

🔴 **Correction, 2026-10-01 — `13006` is wrong; it does not exist.** I filed it here without checking, from the same source the report did. [`INVESTIGATE-new-norwegian-public-sources.md` §C.1 \[Q38\]](INVESTIGATE-new-norwegian-public-sources.md) resolved this in **May**: `13006` returns nothing from SSB's PxWebApi in any version, and the data it would hold is already in `ssb-13995`'s `ContentsCode` dimension (`KOSsosgjantmnd0000` and five age-banded siblings). **A second consumer — the Lovable-built UI — made the identical wrong claim independently**, which is why this is worth stating plainly rather than quietly fixing: the number is a tooling-side artefact (likely from the same Power BI dataset list both consumers read), not a real SSB table, and will keep surfacing until Samfunnspuls's own source list is corrected.

🔵 **And G4 is mostly already answered.** [`INVESTIGATE-new-norwegian-public-sources.md`](INVESTIGATE-new-norwegian-public-sources.md) fully specified NAV, IMDi and Udir as Tier-1 candidates in May 2026 — verified URLs, licences, open questions, a PLAN sequence. 🔴 **None of it was built.** Of ~14 Tier-1 candidates, only `bufdir-barnefattigdom` and `ssb-10826` shipped; not even the schema-prep PLAN that unblocks the rest was started. **The acquisition path for G4 is "execute that investigation", not "write a new one."**

🔴 **This is the only gap that leaves whole topics empty** — "Beredskap" (DSB) has nothing, "Flyktninger og asylsøkere" has one total.

**Suggested order from the report, which matches Atlas's own cost curve:** the SSB tables first (same ingest pattern Atlas already runs), then IMDi and NAV (open APIs), then Udir, then DSB.

⚠️ Each source is its own ingest with its own manifest, licence and cadence. This is a programme, not a task, and sizing it belongs in its own investigation.

### [Q5] Titles, descriptions and topics per indicator

The consumer **hand-wrote 35 titles, one-line descriptions and topic assignments**. Every Atlas consumer will repeat that work, slightly differently each time.

**Asked for:** `title_nb`, `description_nb`, `topics` (array from a controlled list), optional `featured`.

🔵 Samfunnspuls's own taxonomy is a proven starting point: *Barn og unge, Beredskap, Demografi og boforhold, Eldre, Flyktninger og innvandring, Frivillige, Helse, Økonomi, Trygghet*. The prototype's hand-written mapping can seed it.

⚠️ **Same underlying gap as [Q2] in the onboarding investigation**, reached from a different direction — there it was "an agent skipped all 40 indicator relations", here it is "a consumer wrote 35 titles by hand". Two independent consumers, one cause. **Decide it once.**

---

## What this changes about sequencing

🔵 [Q3] and [Q5] are both **metadata on `indicator_summary`**, both editorial rather than technical, and both block a generic client from rendering correctly. They are the cheapest per unit of consumer value and should be decided together.

🔴 [Q1] and [Q2] decide whether **the numbers can be shown without caveats**. [Q4] decides **how much of Samfunnspuls is covered at all**. Those are different kinds of question and should not be traded against each other.

---

### [Q6] 🔴 The stray `¬` is SSB's hierarchy marker. Do NOT strip it.

The report suggests *"Strip `¬` from labels"* as a cosmetic fix. **It is not cosmetic.**

Measured on `indicators__ssb_08484`, 37 distinct labels:

```
0 ¬   "Alle lovbruddsgrupper"                    code 1AAAAA-9ZZZZz   <- the TOTAL
1 ¬   "Eiendomstyveri"                           code 1AAAAA-1ZZZZz
2 ¬   "Forseelse mot arbeidsmiljøloven"          code BIZZZ
3 ¬   "Hjemmebrenning (forseelse)"               code BHBZZ
4 ¬   "Mindre tyveri fra butikk"                 code 1AAAZZ
5 ¬   "Tyveri fra fritidsbolig"                  code 1ABEBZ          <- a leaf
```

It is `U+00AC`, correctly encoded (`\xc2\xac`) — **not mojibake** — and the leading count is the
node's **depth in SSB's offence classification**. The codes corroborate it: Z-padding shrinks as
depth grows.

🔴 **Stripping it would do three things, in rising order of harm:**

1. destroy information Atlas did not create and is not entitled to remove;
2. **edit source data**, which this repository's first rule forbids;
3. **remove the only signal that separates a total from its own components.** A consumer summing
   every `contents_code` in a crime table today would already over-count several times over —
   the `¬` prefix is what tells them not to.

🔵 **The correct fix is the opposite of the one requested:** keep the label verbatim and publish
the depth as a DERIVED column beside it — `hierarchy_level`, the count of leading `¬` — plus a
warning on the relation that rows of different depth must not be added together. That is a
derivation recorded beside the source column, which the rule allows.

⚠️ **This is why a consumer report is verified before it is implemented.** The suggestion was
reasonable from outside — the character looks like an encoding fault, and nothing published says
otherwise. That it is not one is a gap in ATLAS's documentation, not an error by the consumer:
`meta_dimensions` does not explain it, and neither did any relation description until now.

---

## [Q7] RESOLVED — not an ingest gap. The mart reporting it has been stale since before the
data arrived, for every source, not just these two

A third consumer (a Lovable-built UI) reported FHI tables 175/932 as *"registered as loaded but
return no rows when queried"*. I measured the same thing and concluded worse — *"never ingested,
total_runs=0, confirmed"* — and filed it to ops-dev as urb-agents #1787 assuming a job-registration
bug. 🔴 **That conclusion was wrong, and the real cause is more interesting than either guess.**

ops-dev checked Dagster's event log directly, then the raw Postgres tables themselves, bypassing
`api_v1`/`marts` entirely:

```
raw.fhi_innvandrere   1 materialization, 2026-09-30T14:04:34Z,  123,680 rows — exact match in Postgres
raw.fhi_innvkat       1 materialization, 2026-09-30T14:04:39Z,  139,140 rows — exact match in Postgres
```

**Both ingested successfully, once, the afternoon before I checked.** The `meta_sources` row
reading `total_runs=0` is a **stale dbt mart**, not an ingest gap — proven by comparing against
`fhi-neet`, a working sibling that materialized *twice* that day (12:11 and again at 14:05 in the
same run as these two) while the mart still shows only the first. **The mart has not rebuilt since
before 12:11 UTC on 2026-09-30, for every source it covers, not only these two.**

🔴 **The actual cause: every Dagster schedule and sensor on the cluster is currently stopped** —
suspected side effect of a `rdctl reset --vm` the day before. Nothing is running on autopilot.
ops-dev correctly did not re-enable schedules themselves (a cluster action, held pending the
talk) and filed it as its own item.

⚠️ **Practical consequence for everything else in this file and its sibling investigation**: any
claim here measured through `api_v1`/`marts` **on or after 2026-09-30** is reading whatever state
existed at the last successful build, not necessarily current `raw`. The `ssb-13995` year-coverage
finding below is flagged accordingly. Claims about *structure* (column names, label text, schema)
are unaffected; claims about *row content* measured during this window are not yet verified fresh.

## [Q8] The bespoke extract: resolved — no public table substitutes, order is necessary

The original ask behind this whole report — *"Aldersgrupper og bosted (barn og unge)"*, children
0–18 by age band × tettbygd/spredtbygd × household type — is `ssb-spesialbestilt-bosted-husholdning`
in [`INVESTIGATE-new-norwegian-public-sources.md` §C.5 [Q46]](INVESTIGATE-new-norwegian-public-sources.md),
which had proposed two public tables as possible substitutes and left them unchecked. **Checked
2026-10-01: neither works.** `17376` does not exist (matches a deliberately-bogus table id's error
signature); `12578` exists but is vehicle mileage by fuel type. A keyword search against SSB's own
statbank surfaces only discontinued series from over a decade ago.

**So this one cannot be self-served.** Røde Kors needs to supply the data — either by locating the
original SSB order (the live Samfunnspuls page states *"Innhenting: spesialbestilt fra SSB"*, so
one already exists) or placing a new one via `bestilling@ssb.no`. The exact specification is in
the linked file's §C.5. Once a file exists, Atlas ingests it the same way `redcross-branches` was
ingested: a private, dated, static extract, documented as such.

## [Q9] Two corrections to the report's own claims

- **Housing crowding is FHI, not Bufdir.** The report says *"Atlas har bare «bor trangt» fra
  Bufdir"*. Atlas's `fhi-trangbodd` (FHI table 794) carries it, not Bufdir — `bufdir-barnefattigdom`
  is child poverty, a different source entirely. 🔴 **And "romslig" does not exist to add**: the
  manifest's own dimension notes say `BODD` is *"2 codes: trangt (overcrowded), uoppgitt
  (unknown)"* — FHI table 794 does not publish a third, spacious category. A genuine
  trangt/romslig/uoppgitt split needs a different source (SSB housing/ownership — see
  [Q46]/11042 in the sibling investigation), not a change to this one.
- **`ssb-13995` (sosialhjelpsmottakere) is not "2022–2024 only" — the SERVED relation shows
  2025 only.** Measured: 30,294 rows, every one `year = 2025`. The manifest declares
  `time_coverage: 2022–2025`.

  🔴 **⚠️ UNVERIFIED as of 2026-10-01, do not treat as settled.** ops-dev found (urb-agents #1787,
  checking the [Q7] finding below) that `mart_meta_sources` — and by the same mechanism, every
  dbt mart including this one — has not rebuilt since before 2026-09-30 12:11 UTC: every Dagster
  schedule and sensor on the cluster is currently stopped. **What I measured through `api_v1` is
  whatever `raw.ssb_13995` looked like as of that last successful build, not necessarily what is in
  `raw` right now.** The gap (one year served vs. four declared) may be real, or may close itself
  once the mart rebuilds. Re-measure after schedules resume before acting on this.
- **Confirmed, not new: no volunteer/member count field.** `ngo_overview`'s columns are
  `chapter_count, national_count, regional_count, local_count, activity_count, kommune_count` —
  no people-count of any kind. Matches [`INVESTIGATE-new-norwegian-public-sources.md` §C.5
  [Q47]](INVESTIGATE-new-norwegian-public-sources.md), already correctly scoped there as internal
  Røde Kors data belonging to the multi-NGO supply investigation, not a public-data gap.
