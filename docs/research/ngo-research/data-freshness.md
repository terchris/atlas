# Freshness: three clocks, not one

Every record in this dataset mixes facts that go stale at wildly different rates. A single
"last updated" label on such a record is not a simplification — it is a false statement.

Measured 22 September 2026.

---

## 1. The problem, on one real row

`brreg_enhet` for organisation `989707787`:

| Field | Value | What it says |
|---|---|---|
| `last_seen_at` | 2026-09-14 | ingest ran 8 days ago |
| `reconciled_at` | 2026-09-14 | transform ran 8 days ago |
| `frivillig_innfoert_dato` | **2009-04-28** | its ICNPO classification is **17 years old** |

**Both clocks say "fresh". The classification is from 2009.** Anyone reading
`last_seen_at` as the age of the data is wrong by seventeen years — and Atlas's own column
documentation already warns to *"read both clocks"*, which is right but insufficient,
because neither clock is about the fact.

---

## 2. Measured staleness, by layer

| Layer | Source | Refresh | **Content staleness** |
|---|---|---|---|
| Org existence, name, address | `brreg-frivillige` | daily | ~1 day ✅ |
| Grasrotandel flag | `brreg-frivillige` | daily | ~1 day ✅ |
| **ICNPO classification** | `brreg-frivillige` | daily | 🔴 **median 9.6 years** |
| Chapter affiliation | derived here | on demand | as of run |
| Activity catalogue + descriptions | N.K.S. website | on demand | as of crawl |
| Org profile / purposes | frivillig.no | snapshot | median 483 days |
| **Volunteer demand** | frivillig.no | snapshot | 🔴 **median 609 days, 33% > 3 yrs** |
| **Røde Kors branches + activities** | NRX API | — | 🔴 **never — `total_runs: 0`** |

**The ICNPO figure is the one to absorb.** Same daily pull, same row, but:

| Years since ICNPO was set | Orgs | |
|---|---|---|
| <1 yr | 2 012 | 2.8% |
| 1–3 yrs | 6 359 | 8.7% |
| 3–5 yrs | 7 166 | 9.8% |
| 5–10 yrs | 22 566 | **31.0%** |
| 10–15 yrs | 15 671 | 21.5% |
| **>15 yrs** | **19 053** | **26.2%** |

Median **9.6 years**. A quarter over fifteen. Organisations self-assign at registration and
never revisit, and **the register has no "last confirmed" field** — `innfoert_dato` is when
they joined, not when anyone last checked the classification was right.

This does not make ICNPO bad. Its **coverage** is genuinely 100% and refreshed daily; what
is a decade old is the **content**. But it means ICNPO should not be presented as current
fact, and it is a strong argument for corroborating it against text — the `aktivitet`
field, activity descriptions, frivillig.no `purposes` — rather than treating it as ground
truth.

---

## 3. Three clocks

| Clock | Field | Answers | Used for |
|---|---|---|---|
| 1 | `fetchedAt` | when did Atlas retrieve it? | pipeline health |
| 2 | `sourceUpdatedAt` | when did the source last change it? | upstream churn |
| **3** | **`assertedAt`** | **when was the fact last confirmed true by its owner?** | **trust** |

Atlas has 1 and 2 (`last_seen_at`, `reconciled_at`). **Clock 3 is missing**, and it is the
only one a user cares about.

⚠️ **`assertedAt` must be nullable and must stay null when unknown.** For ICNPO on almost
every Norwegian organisation the honest answer is "never confirmed". Backfilling it with
`fetchedAt` would convert a known unknown into a confident lie, which is the single easiest
way to wreck this dataset's credibility.

✅ **Fixed 3 Oct 2026.** The data had broken this rule: of 8 546 `assertedAt` values in
`chapters.json` and `organizations.json`, **6 936 equalled the fetch date** — every crawled
block for Sanitetskvinnene, Frelsesarmeen, Nasjonalforeningen and LHL, and most of the rest,
because the extractors stamped the crawl date where the page carried no date of its own. The
six extractors now omit it, the 6 936 values were removed (2 755 N.K.S. blocks that called
themselves FRESH on that basis are now UNKNOWN), and `check:integrity` fails on any value
equal to the fetch date that the source did not state. The **1 610** that remain are page
dates the source publishes: Kirkens Bymisjon's `modified` and 4H's `og:article:modified_time`.

---

## 4. Volatility classes — why per-block, not per-record

`freshness.blocks` in the Chapter schema (`schemas/schemas/v1/freshness.yaml`, generated to `dist/schema/Freshness.schema.json`) stamps each block separately,
because they decay at different speeds:

| Class | Goes wrong in | Blocks | An old `assertedAt` is… |
|---|---|---|---|
| `structural` | decades | identity — orgnr, legal form, founding date | harmless |
| `slow` | years | location, **classification** | worth flagging |
| `annual` | yearly | contacts, chapter counts | worth flagging |
| `volatile` | weeks | **demand**, activity currency | **disqualifying** |

**The rule: a record's usable freshness is the freshness of the most volatile block actually
being displayed — never the ingest date.**

So a chapter page showing name + kommune + ICNPO can honestly say "updated daily". The same
page showing "needs volunteers" cannot, and must carry the demand block's own date. (The
`demand` block is designed but not yet in the public contract — no producer fills it; see
`volunteer-demand.md` §2.)

---

## 5. Display rules

1. **Never one "last updated" per record.** Stamp the claim, not the row.
2. **Same thresholds mean different things per class.** A 2-year-old `structural` fact is
   fine; a 2-year-old `volatile` one is noise.
3. **`unknown` ≠ `fresh`.** Null `assertedAt` renders as "not confirmed", never as current.
4. **Volatile blocks expire.** Demand reverts to `unknown` after 90 days
   (`volunteer-demand.md` §2). Nothing else keeps a volunteer-facing surface honest without
   per-record human effort.
5. **State the source per block.** Identity from Brreg, activities from the NGO's site,
   demand from frivillig.no — three different trust levels on one screen.

---

## 6. Compliance

⚠️ Bestemmelse 7 — *kommunikasjon skal være troverdig og ekte*. Presenting a 2009
classification or a 6-year-old volunteer request as current is a credibility problem
before it is a technical one, and it is about **other organisations'** data published under
a Røde Kors name. The freshness apparatus here is the mechanism for satisfying that rule,
not decoration.

The same argument supports showing each NGO its own rows before publication: they are the
only ones who can say "that has not been true since 2014".

---

## 7. What to fix, in order

1. ✅ **Populate `assertedAt` only where a source genuinely provides it** — frivillig.no
   `updatedAt`, a page's own modified timestamp (4H's `og:article:modified_time`). **Not**
   the crawl date: that is `fetchedAt`. Done 3 Oct 2026: the 6 936 crawl-date values were
   removed and the extractors fixed (see §3). Nasjonalforeningen's WordPress API carries a
   `modified` date the extractor does not yet read — a candidate for a real source date.
2. **Add clock 3 to Atlas.** `last_seen_at` and `reconciled_at` cannot answer the question
   users ask, and no amount of documentation fixes that.
3. **Ask Brreg whether a classification review date exists** anywhere internally. If it
   does, the 9.6-year median becomes measurable per organisation rather than assumed.
4. **Expire demand by default**, before any volunteer-facing surface ships.
5. **Do not fix the NRX gap by interpolation.** `total_runs: 0` means no data, and an empty
   activity list must render as "unknown", never "none".
