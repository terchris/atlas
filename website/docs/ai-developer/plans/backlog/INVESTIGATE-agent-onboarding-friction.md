# Investigate: what an AI agent hits in its first ten minutes on Atlas, from a report by one that had never seen it

What stops a capable outside consumer — specifically an AI coding agent with no prior knowledge — from going from the API root to working output, and which of the nine findings it filed are real, already solved, or wrong.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active

**Goal**: Turn a single outside consumer's onboarding report into verified findings, shipped fixes and named open decisions — so the parts that were not shipped immediately do not survive only in a chat log.

**Last Updated**: 2026-09-29

**Origin**: Terje started a fresh Claude Code on a Windows machine, gave it only two URLs — `api-atlas.urbalurba.com` and `atlas.sovereignsky.no` — and told it to build something. It did, then wrote a report on what could have been better. The report is input, not audit: it says so itself. Every claim below was re-measured before being acted on.

⚠️ **This file was written AFTER two of its findings had already shipped (#478, #479).** That is the wrong order and it is recorded rather than tidied away. The risk it creates is the one this repo already has a rule about: work that reaches no written record is invisible from every direction. Five of the nine findings existed only in a conversation until this file.

---

## What the consumer achieved, which is the part not to skip past

**Four minutes**, from "never heard of Atlas" to a dashboard joining three endpoints across all 357 kommuner. 🔵 It also **repeated Atlas's own caveats to its user** — "a row here is not evidence of low need", the 9999 sentinel, the ~10% of organisations with no kommune.

That is the first outside evidence that writing warnings **into the data** rather than into documentation actually works. It is expensive to write that way. It paid.

⚠️ **Design consequence, and it bit us immediately:** caveats belong in `description`, not in `summary`. Several relations opened with a warning as their first line, which is what a catalogue listing shows. See F3.

---

## The findings, re-measured

| id | finding | measured? | status |
|---|---|---|---|
| F1 | No short entry point for agents (`llms.txt`, quick start) | ✅ both 404; `info.description` 16 697 chars | **open** — [Q1] |
| F2 | 40 `indicators__*` have opaque names and identical boilerplate | ✅ confirmed; the agent skipped all 40 | **open** — [Q2] |
| F3 | Summaries cut off mid-sentence | ✅ **worse than reported**: only 10 of 80 were well-formed | ✅ **shipped** — PR #478 |
| F4 | Empty relations are not visible from the endpoint list | ✅ 10 empty, all Røde Kors | ✅ **shipped** with F3 |
| F5 | No geometry, so no maps | ✅ confirmed | ✅ **shipped** — PR #479 |
| F6 | `served_as` looks too broad | ✅ confirmed | **open** — [Q3] |
| F7 | Mixed years across sources are not flagged | not yet measured | **open** — [Q4] |
| F8 | Small conveniences (fylke aggregates, `/openapi.json` alias, content-type) | partly | **open** — [Q5] |
| F9 | Praise: root spec, open CORS, consumer-shaped views, honest caveats, consistent join key | ✅ | **keep** |

🔵 The report's precision was unusual. Its two most checkable numbers — `info.description` "~16,700 chars" and "17 summaries cut off" — were **exact**.

---

## ✅ F3 — shipped. The first line of a COMMENT is a published field

PostgREST splits `COMMENT ON` at the **first newline**: line 1 becomes `summary`, the rest becomes `description`.

```
17  stopped mid-sentence
53  had no line break at all -> the WHOLE comment became the summary
    (up to 784 chars) and `description` was served EMPTY
10  were well-formed
```

⚠️ **Invisible from inside the repo.** We author YAML hard-wrapped at ~100 columns for review and had never read what PostgREST *serves*. Same class as [SERVING-A-SOURCE.md §13](../../SERVING-A-SOURCE.md) — validate the input, never look at the output.

🔵 The two YAML styles failed differently and both are fixed the same way: `|` keeps newlines so line 1 is a wrap fragment; `>-` eats them so the whole comment is line 1. One sentence, a blank line, then detail works for both.

**Gated by** `check-served-summaries-are-sentences.sh`, reading the committed SQL. Result: empty descriptions 53 → 0; summary length min 36, median 89, max 108.

## ✅ F5 — shipped as a file, not an endpoint

`atlas.sovereignsky.no/geo/kommuner.geojson` — 357 kommuner, 1.69 MB (430 KB gzipped), EPSG:4326, `properties.kommune_nr` joining straight onto `dim_kommune`.

Douglas–Peucker at 0.0003° (~33 m) keeps **8.5%** of points: 997 962 → 84 521, turning 38.6 MB into 1.69 MB. 🔴 The first geometry Atlas ships that is **not** the upstream's own, so the file carries its own `atlas` block saying what it is not fit for.

⚠️ **The kommune list comes from `dim_kommune`, not Kartverket.** If they disagree the build fails and writes nothing — a kommune missing from a map looks exactly like a kommune with no data.

---

## Open questions

### [Q1] What is the agent entry point, and is it generated?

`llms.txt` and `llms-full.txt` both 404. The root description is 16 697 chars, and what sits at the top decides what gets used — today that is *"raw tables are never public"*, at 5%, above `THE CATALOGUE` at 16%.

⚠️ **That ordering is self-inflicted**, added 2026-09-26 for item 5 of #1547. Actionable content now sits below explanatory content.

🔴 **Recommendation: if we ship `llms.txt` it must be GENERATED** from `atlas_inventory` and `meta_endpoints` in CI, never hand-written. A curated "top 10 datasets with row counts" is a stale claim waiting to happen — precisely the README that said *"No code yet"* for five months (#477) and the marketing slide whose exact figure was already 283 rows out of date (#1729).

**Decision needed:** ship a generated `llms.txt`, reorder `info.description`, or both.

### [Q2] How do the 40 indicator relations get a readable topic?

40 of 80 endpoints are `indicators__ssb_06913`-shaped with identical opening boilerplate. **The agent skipped all 40** — half the catalogue unused because of naming.

⚠️ `meta_sources.upstream_title` helps for SSB but not FHI, where it is often an internal code (`NEET_UTDANN`, `Trangbodd_UTDANN`). So this needs **human-written titles**, which is editorial work and needs a steer on tone.

🔵 **Rejected for now: aliases** (`indicators__fhi_trangbodd` → `crowded_housing_fhi`). `api_v1` is a published contract; a second name doubles the surface permanently. The report ranks aliases lower too.

### [Q3] Does `served_as` mean what its name promises?

Confirmed: `fhi-neet`, `fhi-trangbodd`, `ssb-06913` and `ssb-12292` all list `coverage_gap_barnefattigdom`, which is SSB 08764 child poverty only.

Not a data bug — DAG reachability through the shared indicator union, and urb-agents #1426 already found that *"served_as records intent, not origin"*. 🔴 But this is the **second independent consumer** to read it as "NEET data feeds the child-poverty map". The field's name promises what its derivation does not deliver, like `downstream_model_count` and `info.version` before it.

**Decision needed:** rename, or document the semantics on the column.

### [Q4] Should a consumer be able to see coverage years in one request?

Child poverty is 2024, population 2026, organisation counts current. A consumer joining them must find each year separately. Candidate: `latest_year` / `period_covered` in `atlas_inventory` or `meta_sources`. **Not yet measured** — unknown how many relations have a well-defined single year.

### [Q5] Which small conveniences are worth the contract surface?

- **fylke-level aggregates** — aggregates are disabled, so county totals are computed client-side. `fylke_*` variants of `coverage_gap_barnefattigdom` and `kommune_ngo_totals` would help; each is a new published relation.
- **`/openapi.json` → `/` redirect** — a Cloudflare change, not Atlas's to make.
- **content-type** — `application/openapi+json` confused PowerShell 5.1. The report calls it as much a client issue; agreed, lowest value.

---

## What this investigation says about process, not product

🔴 Two fixes shipped before this file existed. The findings that shipped are the ones that were **easy to measure and mechanical to fix**. The five still open are the ones needing a decision — and those are exactly the ones that would have been lost.

⚠️ That is the same shape as the eight FHI sources ingested weekly and modelled nowhere: nobody decided not to do them. **A consumer report is an ingest. If it reaches no plan file, it is invisible.**
