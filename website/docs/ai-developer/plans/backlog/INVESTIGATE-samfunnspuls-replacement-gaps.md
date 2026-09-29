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
