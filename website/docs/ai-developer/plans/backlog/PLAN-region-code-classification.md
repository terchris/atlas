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

### Phase 1 — measure, per dataset, before designing
- [ ] Run the family breakdown across **all** SSB relations, not the four measured here.
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
