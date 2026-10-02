# ssb-12451

SSB table **12451** — *Bostedskommune- og kjønnsfordelt sykefravær (legemeldt) for lønnstakere*.
Physician-certified sick-leave percentage and lost workdays, per kommune of residence, quarterly.

This is the real kommune-level source for what the investigation originally called
"nav-sykefravaer" — NAV's own sykefravær/sykepenger statistics pages publish **no kommune-level
table at all** (checked live 2026-10-02: every downloadable table there is fylke-level or
coarser — residence, sector, industry, age, occupation, diagnosis, duration). SSB republishes
NAV's underlying register data at kommune resolution instead, through the same PXWebAPI mechanism
every other `ssb-*` source in this project already uses. See
[`PLAN-013-nav-sykefravaer.md`](../../../../../website/docs/ai-developer/plans/active/PLAN-013-nav-sykefravaer.md)
for the full Phase 1 research.

## What the script does

Fetches `https://data.ssb.no/api/pxwebapi/v2/tables/12451/data` with explicit filters
(`Region=*`, `Kjonn=0`, `ContentsCode=Sykefraversprosent,Sykefraversdagsverk`, `Tid=*`), unflattens
the JSON-stat2 response via the shared `lib/pxweb.ts` client, writes NDJSON locally, and (if
`DATABASE_URL` is set) upserts into `raw.ssb_12451`.

## Known quirks

### Filtering is required, not optional

The unfiltered cartesian product is 937 regions × 3 Kjonn × 9 ContentsCode × 105 Tid =
**2,655,315 cells** — well over PxWebAPI's 800,000-cell request limit (see `lib/pxweb.ts`'s own
header). The v1 scope (`Kjonn=0`, 2 of 9 ContentsCode values) brings this to 196,770 cells,
confirmed live.

### `Kjonn=0` is also the server's own elimination default

Confirmed live: a query that omits `Kjonn` entirely still returns `Begge kjønn` (code `0`) only —
it's flagged `elimination=true` in the table's metadata. Passed explicitly here anyway, for
robustness against a future default change, not because it's strictly required today.

### `period` stored as text, not parsed into year/quarter

Same convention as `ssb-12944`'s `period` column — `Tid` values come back as SSB's own codes
(`"2026K2"`), stored verbatim. If downstream needs year/quarter split out, do it in dbt, not here.

### Nine ContentsCode values exist; only two are ingested

`Sykefraversprosent` and `Sykefraversdagsverk` are the two headline measures. The table also has
`ArbeidstakereSykefra`/`ArbeidstakereSykePro` (a genuinely different metric — count/share of
employees with *any* sick-leave spell, not days-weighted) and four `*Endr*` variants that are pure
year-over-year deltas of the measures above — none ingested in v1. See
`PLAN-013-nav-sykefravaer.md` [Q2] for the full reasoning.

### No suppression observed, and no per-source tests either

Checked live against Utsira (Norway's smallest kommune by population) across four quarters — every
cell was a real number. Not a blanket claim that no cell in this table is ever suppressed, just
what the sampled cells showed.

⚠️ **Correction to this source's own Phase 1 research**: the plan's Phase 2 task list said to
"reuse `ssb-12944`'s test pattern" — checked while implementing, and that source (like every other
`ssb-*` PXWebAPI source in this repo, and `lib/pxweb.ts` itself) has **no `__tests__` directory at
all**. There is no existing test pattern to reuse. This source follows that same, unbroken
precedent rather than inventing one — the shared `lib/pxweb.ts` client is the thing that would
need unit coverage if any `ssb-*` source did, and none of them currently have it.

## References

- Statistikkbank table: https://www.ssb.no/statbank/table/12451
- Statistics page: https://www.ssb.no/sykefratot
- Licence: https://data.norge.no/nlod/no/2.0
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
- Plan: [`PLAN-013-nav-sykefravaer.md`](../../../../../website/docs/ai-developer/plans/active/PLAN-013-nav-sykefravaer.md)
