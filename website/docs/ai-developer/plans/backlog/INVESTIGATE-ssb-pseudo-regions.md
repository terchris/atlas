# INVESTIGATE: SSB's non-kommune regions — 17 permanent referential WARNs

> **IMPLEMENTATION RULES:** Before implementing, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## 🔴 The authoritative code list, 2026-09-06 — and this is two decisions, not one

Measured by the tester by **executing dbt's own compiled predicate**, not by re-deriving the join.
That distinction matters here: a hand-written version disagreed with dbt's count because the
`relationships` test carries `where kommune_nr is not null`, and the NULLs are large — 9,116 null
`kommune_nr` and 202,036 null `fylke_nr`. Those NULLs are invisible to the warning and were nearly
reported as part of it.

The largest warning, `ssb_07459` on `kommune_nr`: **9,964 rows across 47 distinct codes.**

| family | codes | count |
|---|---|---|
| **`XX99` "uoppgitt kommune"** — unspecified municipality within a county | `0199 0299 0399 … 2099` | **19** |
| Svalbard | `2101 … 2131`, `2199` | 21 |
| Jan Mayen | `2211`, `2299` | 2 |
| Continental shelf | `2300`, `2311`, `2321`, `2399` | 4 |

Fylke side adds `21 22 23 25 26 88`.

### Why this reframes the blocked question

This investigation has been described — by me, repeatedly — as *"the Svalbard question"*, and the
decision waiting on a human as *"does Atlas cover Svalbard"*. **The largest single family is not
Svalbard.** Nineteen of the 47 codes are `XX99`, meaning *the municipality was not specified* for a
row SSB does attribute to a county.

Those are two different questions with potentially different answers:

1. **Territorial coverage** — Svalbard, Jan Mayen, the shelf. Places outside the kommune system.
   Answering it decides whether they get dim rows and appear on the map.
2. **Unattributed rows** — `XX99`. Not a place at all; a row SSB could not or would not assign to a
   municipality. The question is whether an unattributed value is dropped, aggregated to its county,
   or surfaced as a distinct "unspecified" bucket. **A decision about Svalbard says nothing about
   this**, and a fix that adds dim rows for the 27 territorial codes would leave 19 codes still
   warning.

⚠️ Anyone answering this should be asked both questions explicitly. Asking only about Svalbard and
applying the answer to all 47 codes would be a fair reading of how this file was previously written,
and it would be wrong.


## Status: Backlog

**Goal**: Get Atlas to **zero permanent WARNs**, by deciding what Svalbard, Jan Mayen, the continental shelf and "unspecified" *are* in the Atlas data model.

**Last Updated**: 2026-08-25

**Origin**: The first full 645-check run against real data (`~/home/ai-developer/for-ops-atlas-data-run.md`, FOLLOW-UP 2). 629 passed, **17 WARNed** — every one a `relationships_*` referential test on `indicators__*` staging models. This is the first genuine data-quality signal Atlas has ever produced.

---

## The finding

`kommune_nr` and `fylke_nr` values appear in the staging models that have no match in `dim_kommune` / `dim_fylke`:

| Codes | What they are |
|---|---|
| `2101`–`2131` | **Svalbard** (Longyearbyen and other settlements) |
| `2211` | **Jan Mayen** |
| `2300`–`2321` | **Continental shelf** — oil and gas fields |
| fylke `21`, `22`, `23`, `25`, `26` | The pseudo-fylker those sit under |
| `88` | **"Uoppgitt"** — region not stated |

**They are not corruption.** They are SSB's own codes for places and categories that exist outside the kommune system.

**The published data is clean.** `fact_kommune_indicators` has 617,834 rows and **zero orphans**, because it joins to active kommuner and drops the rest. So this is confined to staging — nothing wrong has been served to anyone.

## Why this still matters, and it is not the WARNs themselves

17 WARNs that fire on every single run are worse than they look. **An alarm that is always on is not an alarm.** Atlas has now made this argument twice — for `frr`'s deliberately-absent freshness policy, and for why `redcross-branches` should keep failing loudly — and the same logic applies here. The imac tester reached it independently: *"17 permanent WARNs is where a real regression hides."*

The 18th WARN, the one that means something, arrives into a list nobody reads.

## Why neither obvious fix is right

**Exclude them in staging** silently discards two different things:
- **Real data about real places.** Svalbard has population, activity and — worth confirming — likely NGO presence in Longyearbyen. Dropping it at the door means Atlas can never answer a Svalbard question, and nobody would know the data had ever been there.
- **The "unspecified" bucket.** Code `88` is not a place, it is *"we do not know the region"*. Dropping it makes national totals quietly understate reality, which is a worse data-quality problem than the WARN it silences.

**Add them to `dim_kommune`** is not available as stated. `dim_kommune` is built from SSB Klass 131 (Kommuner), and **Klass 131 contains none of these codes** — verified: zero rows matching `^(21|22|23)`. Adding them means inventing kommuner that SSB does not consider kommuner, in the dimension whose whole job is to say what a kommune is. Coverage marts count kommuner; Svalbard becoming the 358th would make those numbers wrong in a way far harder to notice than a WARN.

## The shape of a real answer

Two separate problems wearing one costume:

1. **Places outside the kommune system** (Svalbard, Jan Mayen, shelf). Representable, real, and arguably interesting. They want to *exist* in the model without *being kommuner* — likely a documented seed of non-kommune regions carrying a `region_kind`, in the style of Atlas's existing `ref_*` seeds, with marts continuing to filter to real kommuner.
2. **The "unspecified" bucket** (`88`). Not a place; a data-quality category. It should probably be an explicit "unknown" member so that unattributed values stay *visible and countable* rather than silently vanishing.

Either way the referential tests would pass because referential integrity would actually hold — rather than passing because the awkward rows were deleted.

## ⚠️ The product question underneath — Terje's, not the implementer's

**Does Atlas cover Svalbard?**

This is not a modelling detail. It decides whether Svalbard data flows through to marts and appears on the map and in coverage statistics, or whether it is merely *representable* so the tests can be honest while the product stays mainland-only. Atlas's stated scope is Norwegian kommuner; Svalbard is Norwegian and is not a kommune.

Worth answering before anyone writes the seed, because the two answers produce different models.

## To find out

- [ ] Confirm the exact code sets from SSB rather than inferring from the orphan lists — including whether `88` has siblings (`99`, `9999`) used by other sources.
- [ ] Does any Tier A NGO have chapters or activity on Svalbard? (Red Cross Longyearbyen is the likely case.) That largely answers the product question.
- [ ] How many rows and how much signal sit behind `88` per source — is it a rounding error or a material share?
- [ ] Which of the 12 affected staging models would change shape, and does `mart_indicator_missing_kommuner` need to know about non-kommune regions at all?
- [ ] Confirm the `dim_postnummer` WARN is the same family or genuinely separate — it predates this and is on the known-not-broken list.

## Out of scope

- Anything that changes what `fact_kommune_indicators` publishes today. It is clean, and this investigation should not make it dirtier while trying to tidy staging.
