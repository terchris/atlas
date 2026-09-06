# PLAN: Classify SSB region codes against KLASS, instead of failing an FK against them

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — **do not write the filter before Phase 1 is measured per dataset**

**Goal**: The 17 standing `relationships_indicators__ssb_*` warnings go to zero *honestly* — every
region code either resolves to a municipality, or is excluded for a documented reason keyed on a
national standard.

**Last Updated**: 2026-09-06

**Priority**: Medium. Nothing is broken; 17 WARNs have been tolerated for weeks. But they are the
oldest unexplained signal in the suite and they mask anything new in the same family.

**Origin**: `INVESTIGATE-ssb-pseudo-regions`, reframed twice in two days — first from "the Svalbard
question" into two questions, then by research showing both have published answers, then by
measurement showing the published answer is **dataset-dependent**.

---

## The finding that governs the design

**There is no code family that is universally safe to exclude.** Behaviour differs per dataset, and
only measurement distinguishes them.

Measured 2026-09-06 against a local warehouse re-ingested through the `/v2/` client:

| dataset | family | codes | rows | **non-zero** |
|---|---|---|---|---|
| `ssb_07459` (population, 1 period) | special `21`–`28` | 28 | 5,936 | **0** |
| | `uoppgitt XX99` | 19 | 4,028 | **0** |
| `ssb_06913` (population, 1951–2026) | special `21`–`28` | 14 | 8,512 | **0** |
| | historical kommune codes | 812 | 493,696 | **227,584** |
| `ssb_08487` (crime, 2007–2025) | **`uoppgitt XX99`** | 32 | 18,432 | **839** |
| | historical kommune codes | 487 | 280,512 | 93,998 |

🔴 **`uoppgitt` is empty in population data and populated in crime data.** Offences recorded without
a municipality are real offences:

```
1599 Uoppgitt kommune Møre og Romsdal   2,416      5099 Uoppgitt kommune Trøndelag   4,590
4299 Uoppgitt kommune, Agder            4,224      0299 Uoppgitt kommune Akershus    1,685
```

And they are inside the published national total. One slice of `08487`:

```
country row "Hele landet"   335,157
sum of current kommuner     332,759
sum of uoppgitt               1,446      <- lost if excluded
```

**Excluding `uoppgitt` would silently reduce a national crime total.** A rule written from
population data alone would have done exactly that.

## The reconciliation, measured 2026-09-06 — and two codes that break both predicates

`ssb_08487`, slice `2024-2025` / `1AAAAA-9ZZZZz` / `AnmeldteLovbrudd`. Every aggregate row named:

```
Ialt   I alt              345,009      <- = 00 + 99 exactly, residual 0
0      Hele landet        335,157
00     Alle fylker        334,118
0000   Alle kommuner      332,675
99     Uoppgitt fylke      10,891
       sum of 32 XX99       1,446
       sum of KLASS131      332,759    (356 non-null of 357 present)
```

🔴 **`Ialt` is the residual, and no predicate discussed so far can see it.** A **non-numeric**
region code, four characters wide. A width-based scan sweeps it in with historical kommuner; a
`not in KLASS 131` rule classifies it as an unknown code to exclude. It is neither — it is the
grand total, and `Ialt = 00 + 99` to the unit.

🔴 **`9999 Uoppgitt` is *inside* KLASS 131.** The kommune standard's single `*99` member is itself
a missingness bucket. So **"in KLASS 131" does not mean "is a municipality"** — the rule that looked
safest is the one that admits a non-place. Anything built from KLASS 131 without excluding `9999`,
including `dim_kommune`, inherits it.

⚠️ **The hierarchy does not decompose the way it looks.** `99 Uoppgitt fylke` is 10,891, far larger
than the ~1,039 needed for `0 = 00 + 99`, and `00 + 99` exceeds `Hele landet`. `99` is not a simple
additive child of the national total. **What it is has not been established, and Phase 1 must not
assume.**

### Unresolved, named rather than absorbed

`sum(KLASS 131 codes) = 332,759` against `0000 Alle kommuner = 332,675` — **a difference of 84**.

⚠️ **This is upstream, not ours.** Reproduced independently straight from PxWeb, without touching
this warehouse: the codes present in the table intersected with KLASS 131 @2026 sum to **332,759**,
against SSB's own published `0000 Alle kommuner` of **332,675**. **SSB's published aggregate does
not equal the sum of SSB's own municipality rows in the same slice.**

So Phase 0 must **not** look for a warehouse bug. The open questions are whether `0000` is
reproducible from source rows at all, whether it is computed over a different kommune vintage, and
whether `1151 Utsira` being null — Norway's smallest municipality, ~200 people — indicates a
suppression rule `0000` treats differently.

## The discriminator: a correspondence table, not a code list

KLASS 131 exposes **no flag** separating the missingness bucket from a municipality — `9999
Uoppgitt`, `3101 Halden` and `0301 Oslo` all sit at level 1 with no parent and no validity marker.
The only distinguishing field is the *name*, and matching on `name = 'Uoppgitt'` is prose-matching.
**Do not.**

The tell is that a municipality belongs to exactly one county and the bucket does not. Verified
live against KLASS rather than taken on trust:

```
ct 1017  Fylkesinndeling 2024 - Kommuneinndeling 2024   358 maps   99 Uoppgitt -> 9999
ct  975  Fylkesinndeling 2020 - Kommuneinndeling 2020   356 maps   9999 ABSENT ENTIRELY
```

🔴 **The representation is not stable across versions.** In 2024 the bucket is present and mapped to
`99`; in 2020 it is missing from the correspondence altogether. A rule written only as *"maps to
`99`"* silently reclassifies `9999` as a municipality for every pre-2024 vintage.

**The rule that holds in both**, and the one to implement:

> A code is a municipality **iff**, at the row's own date, it maps to a fylke **other than `99`** —
> where *absent from the correspondence* counts as **not** qualifying.

Width-independent, format-independent, date-aware, derived rather than listed, and it catches any
future bucket SSB adds without editing a constant.

### 🔴 Present-tense consequence, measured in this warehouse

`raw.ssb_klass_kommuner` contains `9999 Uoppgitt`, and `dim_kommune` is built straight from it with
no exclusion:

```
raw.ssb_klass_kommuner:  0301 Oslo · 3101 Halden · 9999 Uoppgitt
```

**So `dim_kommune` contains a non-place today** — and the FK test that has warned for weeks is
complaining that nineteen `XX99` buckets are *missing* from a dimension that already admits an
identical bucket. `dim_fylke` is built the same way from `ssb_klass_fylker`, and KLASS 104 carries
`99 Uoppgitt` beside the real counties, so it has the same exposure one level up.

## The four cases, and what each requires

| the code is… | what it is | do |
|---|---|---|
| in **KLASS 131 at the row's own date** | a municipality, then and now | keep, join directly |
| in KLASS 131 at **some** date, not the row's | renumbered or merged | **keep** and resolve forward through the correspondence chain |
| never in 131, present in **KLASS 4** | Svalbard, Jan Mayen, shelf, airspace, abroad, sea, biland | **measure first.** Exclude only where empty for that dataset |
| in **neither** standard (`XX99`, `99`) | `uoppgitt` — missingness, not a place | **measure first.** Empty in population, populated in crime |

⚠️ **The predicate must be date-aware.** `not in KLASS 131` evaluated at today's date is two
populations wearing one predicate: it catches Svalbard *and* every municipality abolished since the
row was written. Applied naively it deletes 227,584 real rows from `ssb_06913` alone.

⚠️ **Date-awareness alone is not enough.** With historical rows retained but unmapped, **Halden is
three municipalities** — `0101`, then `3001` (2020 reform), then `3101` (2024 reform) — in any series
crossing those years. A national total still reconciles while attribution is wrong.

## KLASS publishes the mapping

`klass.ts` already speaks to this API, and it is the one client that did not break in the `v2-beta`
retirement.

```
KLASS 131  Standard for kommuneinndeling      358 codes @2026-01-01, 141 versions
KLASS 4    Standard for regionale spesialkoder 42 codes @2026-01-01
correspondence 1008   Kommuneinndeling 2020 - 2019   317 mappings   3001 Halden -> 0101 Halden
correspondence 2490   Kommuneinndeling 2024 - 2023
GET /api/klass/v1/classifications/131/codesAt?date=YYYY-MM-DD
```

## Phases

### Phase 0 — reproduce the totals before classifying anything
- [ ] For one slice of each relation, **reproduce the published national total exactly**, naming
      every component. Not "a national total is unchanged" — *every row accounted for by exactly
      one family*.
- [ ] Close the 84 discrepancy above, or explain it.
- [ ] Establish what `99 Uoppgitt fylke` actually is. Do not assume it is additive.

### Phase 1 — measure, per dataset, before designing
- [ ] Run the family breakdown across **all** SSB relations, not the four measured here.
- [ ] **Scan predicate: any code not in KLASS 131 at the row's own date, whatever its width or
      format.** Width-independence is the point — `99` is two characters and `Ialt` is not numeric,
      and both were invisible to the first scan.
- [ ] Record, per dataset, whether `21`–`28` and `XX99` are empty or populated.
- [ ] ⚠️ Do not generalise a per-dataset result into a global rule. That is the mistake this plan
      exists because of — twice.

### Phase 2 — classify rather than filter
- [ ] Add a `region_type` discriminator sourced from KLASS 131 + KLASS 4: `kommune` | `spesialkode`
      | `uoppgitt`, resolved **at the row's own date**.
- [ ] Resolve historical kommune codes forward through the correspondence chain.
- [ ] Scope the FK test to `where region_type = 'kommune'` — honest, not silenced.
- [ ] Exclude a family only where Phase 1 shows it empty **for that dataset**.

### Phase 3 — prove it, with red cases
- [ ] **National total unchanged** after any exclusion. Necessary, insufficient.
- [ ] 🔴 **Halden continuous across 2019/2020 and 2023/2024.** If Halden appears as three entities,
      the mapping is not applied. `0706 Sandefjord` across 2016/2017 is a second probe with a
      different reform year. **This is the one a reconciling total will not catch.**
- [ ] 🔴 **`uoppgitt` retained where populated**: `08487`'s 1,446-per-slice must still be present and
      attributed to `region_type = 'uoppgitt'`, not dropped and not redistributed into counties.
- [ ] 🔴 **The decomposition closes to the unit** — against a total **we can derive**, not against
      SSB's published aggregate. `0000 Alle kommuner` is 84 off the sum of its own constituent rows,
      so a red case keyed on the published figure would fail for an upstream reason. Document the
      upstream gap; do not chase it. Every row in the derived total is attributed to exactly one
      family, with no residual. This is the case that catches all three errors found
      while writing this plan — a rule keyed on an undated classification, a scan keyed on code
      width, and a total that reconciles while rows sit unattributed. A national total being
      *unchanged* passes while 1,036 offences are unaccounted for; closing *to the unit* does not.
- [ ] Make each red case fail on purpose before trusting the green.

## Acceptance

- The 17 warnings are zero, and the reason each code is excluded is traceable to a KLASS
  classification and a date — not to a hardcoded list.
- No national total moves.
- Halden is one municipality across both reforms.
- No dataset loses a populated `uoppgitt` bucket.

## Verified against

`raw.*` in a **local warehouse**, four SSB relations, re-ingested 2026-09-06 through the `/v2/`
client. **Not** the cluster, and **not** `marts.*` — the FK warning fires one transform downstream.
Phase 1 must confirm the same shape at the layer the test actually runs on.
