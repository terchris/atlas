# Plan: Lottstift momskompensasjon — VAT compensation to voluntary organisations

Ingests Lotteri- og stiftelsestilsynet's (Lottstift) annual VAT-compensation allocations to
voluntary organisations — which organisation received how much, per year — resolved to kommune
and ICNPO category by joining the recipient's organisasjonsnummer against Atlas's own,
already-shipped `dim_brreg_enhet`. The Lottstift half of investigation candidate #9 (the
Frivillighetsregisteret/ICNPO half of that candidate turned out to already be shipped — see
Phase 1.1).

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — Phases 1-3 DONE, Phase 4 (deploy) submitted, awaiting imac + ops-dev

**Goal**: Add `lottstift-momskompensasjon` as a served Atlas source — per-kommune, per-year state
grant totals to voluntary organisations, completing the "Norwegian NGO sector at organisational +
financial resolution" framing investigation §9 described, now that its ICNPO half is confirmed
already shipped.

**Last Updated**: 2026-10-04

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §9 [Q24]/[Q25]

**Prerequisites**: None remaining. [Q26]'s sequencing dependency on the SDG/ICNPO tagging
investigation does not block this candidate — confirmed in Phase 1.1, Brreg's own
Frivillighetsregisteret already supplies ICNPO codes directly and Atlas already joins them into
`dim_brreg_enhet`; this PLAN only needs to join against that existing dimension, not derive ICNPO
from scratch.

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-04)

### Tasks

- [x] 1.1 **Correction to the investigation's own framing**: §9 lists this candidate as two
  halves, both unshipped. **Checked live — the Frivillighetsregisteret/ICNPO half is already
  shipped.** `raw.brreg_frivillige` (migration `054_raw_brreg_frivillige.sql`) and the
  `brreg-frivillige` Dagster asset already exist, already daily-polled, and already joined into
  `dim_brreg_enhet` ("Frivillighetsregisteret enrichment (PLAN-003 phase 3)" — an older,
  pre-renumbering PLAN-003, not this session's `bufdir-barnevern`). This PLAN covers ONLY the
  remaining, genuinely unshipped Lottstift half.
- [x] 1.2 Find the real mechanism. **Not what the investigation assumed.** `tilskudd.lottstift.no`
  is a real Next.js/GraphQL-backed search app (confirmed live: server-rendered pages embed a
  `dehydratedState` with React-Query-shaped `SimpleRecipients`/`AllocationSummary` queries,
  `cursor`/`edges`/`pageInfo` — genuinely paginated, 183 of one small scheme's recipients behind
  10-per-page cursors) — but **no public GraphQL endpoint was found** after checking the page's
  own JS chunks and probing likely paths; reverse-engineering it further was not pursued. **The
  real, working mechanism is simpler and already what the investigation's "Format" line named**:
  Lottstift's own `lottstift.no/nb/om-oss/apne-data/` page lists direct, static XLSX downloads at
  predictable `lottstift.no/app/uploads/YYYY/MM/<filename>.xlsx` URLs — no Cloudflare wall, no
  auth, confirmed live (`HTTP/2 200`, real `.xlsx` content-type, 1.3 MB for the 2024 file).
- [x] 1.3 Confirm the real column shape, per year — **genuinely different every year, more so
  than any prior source this session.** Downloaded and inspected 9 years (2016-2024) directly:
  - **2016, 2017, 2018 — NO recipient organisasjonsnummer column at all.** Only an applicant
    orgnr (`Org.nr. søkar`) and a recipient NAME (`Namn på mottakar`) — umbrella organisations
    (`Sentralledd`/`Regionalledd`, e.g. "4H NORGE" applying on behalf of "4H ØSTFOLD") report
    each sub-unit as a name-only row with no orgnr of its own. **v1 decision: defer these three
    years** — matching a recipient to Brreg by name alone would be the exact kind of unreliable
    guess this project avoids (see `imdi-bosetting`'s own name-crosswalk caution).
  - **2019, 2020, 2021, 2022, 2023, 2024 — a real recipient orgnr column present in every one**,
    confirmed by checking for duplicate-orgnr-within-year counts and 9-digit format on live data,
    not assumed. Column names and positions differ every year (see Implementation Notes for the
    full per-year map); some years also carry their own `Kommune`/`Kategori` text columns, but
    these are NOT used — kommune and ICNPO category are resolved by joining the recipient orgnr
    against `dim_brreg_enhet`, which already has both, more reliably than re-parsing each year's
    own free-text columns (2022/2023's Kommune is upper-case town name only, no code; 2020 has no
    Kommune column at all).
  - **A small number of organisations receive more than one case/grant in the same year** —
    confirmed live: 30 duplicate recipient-orgnr rows in 2022, 30 in 2023, 14 in 2020 (out of
    ~20-24k rows each year). **v1 decision: sum amounts per (orgnr, year)** rather than keep one
    row per case — Atlas's own grain question here is "how much did this org receive this year,"
    not "how many separate administrative cases existed."
  - **The "amount" column's real meaning differs by year** (requested vs. approved vs. awarded
    vs. paid), confirmed by reading each year's own header text, not assumed uniform. v1 picks
    the most-final available figure per year (paid/"utbetalt" when present, else
    awarded-after-reduction) — documented per year, not silently normalized away.
- [x] 1.4 Confirm licence. **NLOD 2.0, confirmed directly** — the registered
  `data.norge.no` catalogue entry for "Åpne datasett fra Lotteri- og stiftelsestilsynet" states
  NLOD 2.0 explicitly and its own description names the momskompensasjon scheme specifically, not
  inferred from the investigation's unverified claim.

### Validation

✅ Confirmed 2026-10-04. 9 real XLSX files downloaded and inspected directly (not assumed from
one sample year), real column names, real duplicate-row counts, real format checks on live data.

---

## Open Questions

- **[Q1] Scope — 6 years (2019-2024) now, revisit 2016-2018 later?** **Recommendation: yes,
  ship 2019-2024 now.** The three undated years have a genuinely different, harder problem
  (no recipient identifier at all) that a future PLAN can tackle on its own if a name-matching
  approach is ever authorized — not a reason to withhold six years of real, cleanly-identified
  data now.
- **[Q2] Backfill convention — all 6 years, or latest only?** Per this session's corrected
  understanding (see `PLAN-017`'s own correction: `udir-gsi` backfills fully when cheap), and
  since all 6 years are equally one static file each (6 total HTTP calls, trivial cost): **ship
  all 6 years.**
- **[Q3] Orgs absent from `dim_brreg_enhet`.** A recipient orgnr with no match (deleted,
  never captured by a bulk/feed cycle) resolves to NULL kommune_nr/icnpo via LEFT JOIN, same
  convention `dim_brreg_enhet`'s own Frivillighetsregisteret join already uses — not inner-joined
  away.
- **[Q4] Presentation sensitivity.** Per-organisation grant amounts are public by NLOD but
  per-kommune aggregates could read as "which kommune's NGOs get the most state money" —
  flagging the same `presentation_policy` consideration raised for every per-kommune source this
  session.

---

## Phase 2: Ingest module + raw table — DONE (verified 2026-10-04)

### Tasks

- [x] 2.1 Created `atlas-data/ingest/src/sources/lottstift-momskompensasjon/`: `manifest.yml`
  (`source_id: lottstift-momskompensasjon`, `provider: lottstift`, `periodicity: P1Y`,
  `license: NLOD`), `index.ts`, `parse.ts`, `fetch_retry.ts` (copied), `README.md`, `__tests__/`
  with real, trimmed-but-genuine fixtures for all 6 shipped years (2019-2024) — each XLSX built
  from the real downloaded file's own header plus its first ~15 real data rows, plus every real
  duplicate-recipient case found live (2020, 2022, 2023). 14 tests, all passing.
- [x] 2.2 `parse.ts` — a per-year `YEAR_CONFIGS` table (`{year, url, sheetName, orgnrCol,
  amountCol, amountLabel}`, the real values found in Phase 1.3), one generic row extractor
  (`parseYearRows`) reused across years. Sums amounts for duplicate orgnr-within-year rows
  (confirmed real in 2020/2022/2023); a missing amount cell is treated as 0, not an error
  (confirmed real on at least one row per affected year).
- [x] 2.3 Migration `067_raw_lottstift_momskompensasjon.sql`:
  `raw.lottstift_momskompensasjon(organisasjonsnummer, year, amount_nok, amount_label,
  loaded_at)` — one row per org/year (post-aggregation), as planned.
- [x] 2.4 Dagster registration — `raw_other.py`/`schedules.py`, annual cadence. Added
  `lottstift` to `publishers.yaml` (with a real logo verified live from `lottstift.no`'s own
  site, `lottstift.svg`) and confirmed `ngo-supply`/`SOCI` are already valid
  `topic`/`eu_theme` values (reused from `redcross-branches`'s own precedent) — no schema bump
  needed.
- [x] 2.5 Added `ingest:lottstift-momskompensasjon` npm script FIRST, verified via
  `check-every-source-has-an-ingest-script.sh` (✓ all 55 covered) and the real
  `npm run ingest:lottstift-momskompensasjon` invocation before any other Phase 2 work.

### Validation

✅ Confirmed 2026-10-04. Real run against the live files into local scratch Postgres: **6 HTTP
calls, 5.2s wall time, 116,074 rows written, zero rows silently dropped.** Norges Røde Kors
(`864139442`) confirmed present with real, plausible, varying amounts across all 6 years.

---

## Phase 3: dbt staging and marts — DONE (verified 2026-10-04)

### Tasks

- [x] 3.1 Added `raw.lottstift_momskompensasjon` to `models/indicators/sources.yml`.
- [x] 3.2 `indicators__lottstift_momskompensasjon.sql` — LEFT JOIN `{{ ref('dim_brreg_enhet') }}`
  on `organisasjonsnummer`. ⚠️ **A real correction to this plan's own Phase 3.2 assumption**:
  `dim_brreg_enhet.kommune_nr` is NOT already resolved through `classify_region_code` — checked
  its own SQL directly and found it is Brreg's raw `forretningsadresse.kommunenummer` field,
  verbatim, same as every other source's own raw region code. This model applies
  `classify_region_code`/`region_code_to_kommune_nr` itself, exactly like every other
  kommune-grain source — not a special case.
- [x] 3.3 Documented columns in `schema.yml`; `mart_indicators__lottstift_momskompensasjon.sql`
  api passthrough + `marts/api/schema.yml` entry. `mart_atlas_inventory.sql` depends_on +
  relation list updated — confirmed its own `contributing_sources` correctly names the full
  Brreg lineage chain (`brreg-enheter-alle`, `brreg-frivillige`, `brreg-oppdateringer`) alongside
  `lottstift-momskompensasjon` itself. `generate_api_v1.py`'s `SCHEMA_COMMENT` bumped (51→52
  total, new `lottstift (1)` provider group).
- [x] 3.4 `dbt build` against real loaded data — clean (14/14 for the targeted build;
  `mart_atlas_inventory` and its full upstream dependency tree also rebuilt clean). Full
  17-script `atlas-data/dbt/check-*.sh` suite — all 17 pass clean. Full ingest test suite (405
  tests) and `tsc --noEmit` both pass clean. `website/npm run build` completes clean (after
  fixing this plan's own `active/` cross-reference links, broken by the backlog→active move).

### Validation

⚠️ **A real, honest limitation, not a false-positive pass**: this local scratch Postgres's
`dim_brreg_enhet` has **zero rows** (the full ~1.17M-row Brreg bulk load has never been run in
this environment) — every recipient in the local build resolves to `region_kind='unknown'`,
`kommune_nr`/`icnpo_*` all NULL, confirmed directly via query, not silently accepted. This is the
expected, correct behaviour of a LEFT JOIN against an empty table, not a defect — but it means
the real kommune_nr/ICNPO resolution for real recipients is **not yet verified against real
Brreg data** and can only be confirmed after a real production deploy, where `dim_brreg_enhet`
is actually populated. Flagged explicitly for Phase 4's verification step, not glossed over.

---

## Phase 4: Deploy and verify arrival — IN PROGRESS (submitted 2026-10-03)

PR #541 (Phases 2-3) merged to main as `37769d0`. Image build (run 37159513743) completed and
published:

```
artifact_digest  sha256:c93b25499370d521fb490ae69cc6f83fb7f03c287ca5b9f4655726d4eb0d7903  ghcr.io/terchris/atlas-data/uis:v20261003-37769d0
image_digest     sha256:19a24a104ae864e3e1729400b4ff82b82092999b197eed4524783dc557be07be  ghcr.io/terchris/atlas-data:v20261003-37769d0
```

Both copied verbatim from the release's own `uis-artifact.json`. `render-template-info.sh
v20261003-37769d0` confirmed clean (64 raw = migrations, 94 marts stated once, 55 automated
sources covered).

**Sent:**
- [urb-agents#1830](https://github.com/terchris/urb-agents/issues/1830) → imac: Dagster deploy
  request, row-count prediction 116,074 for `raw.lottstift_momskompensasjon`/
  `indicators__lottstift_momskompensasjon`. Explicitly flagged the one thing this agent could
  not verify locally (Phase 3's own caveat) — asked imac to spot-check that a well-known
  recipient (Norges Røde Kors, `864139442`) resolves to a real, non-null `kommune_nr` in
  production, not just locally-untestable NULLs.
- [urb-agents#1829](https://github.com/terchris/urb-agents/issues/1829) → ops-dev: template-info
  pin nomination for the same tag.

**Only predict `indicators__lottstift_momskompensasjon` as a served relation.** Awaiting both
reports. Independently re-verify against the live public API before closing either deploy
task — do not take a deploy report alone as sufficient, and do not accept "the join works" on
imac's say-so alone either, given the specific thing this agent flagged as unverified.

---

## Acceptance Criteria

- [x] **The mechanism is verified live** — direct static XLSX downloads from `lottstift.no`,
  confirmed by downloading and inspecting all 9 available years, not assumed from the
  investigation's own framing (which named the right format but the wrong exact shape).
- [x] **The already-shipped half of this investigation candidate is identified and not
  re-implemented** — `brreg-frivillige`/ICNPO confirmed already live.
- [x] **Licence independently confirmed** — NLOD 2.0, on the registered `data.norge.no`
  catalogue entry, naming this scheme specifically.
- [ ] `lottstift-momskompensasjon` ingests cleanly with zero rows silently dropped across all 6
  years, duplicate-orgnr-within-year cases summed and confirmed against real data.
- [ ] `indicators__lottstift_momskompensasjon` and its mart build and test clean against real
  loaded data, with the `dim_brreg_enhet` join resolving real kommune/ICNPO values.
- [ ] `lottstift-momskompensasjon` appears in `meta_sources.served_as` after a real deploy,
  independently verified via live `curl`.
- [ ] Golden-file tests cover each of the 6 shipped years' distinct column layout, plus a
  duplicate-orgnr-summed case.
- [ ] The investigation and `1PRIORITY.md` are updated to mark both halves of §9 — the
  already-shipped ICNPO half and this newly-shipped Lottstift half.

---

## Implementation Notes

**Per-year column map (0-indexed, header row 1 unless noted; all confirmed live 2026-10-04):**

| Year | Sheet | Recipient orgnr column | Amount column | Amount meaning |
|---|---|---|---|---|
| 2019 | `2019` | `Org.nr. mottakar` | `Tildelt etter avkorting (NOK)` | awarded after reduction |
| 2020 | `2020` | `Org.nr. søkar` | `Utbetalt Beløp` | paid |
| 2021 | `2021` | `Org.nr. mottakar` | `Utbetalt beløp ink. administrasjonsgebyr (NOK)` | paid, incl. admin fee |
| 2022 | `Uttrekk_moms` | `Org.nr` | `Tildelt beløp` | awarded |
| 2023 | `Uttrekk_moms` | `Org.nr` | `Tildelt beløp` | awarded |
| 2024 | `Tildelinger` | `Organisasjonsnummer` | `Tildelt` | awarded |

**Real source URLs (all confirmed HTTP 200, real `.xlsx` content, 2026-10-04):**
```
2019: https://lottstift.no/app/uploads/2021/07/Oversikt-over-alle-mottakarar_2019-1.xlsx
2020: https://lottstift.no/app/uploads/2021/06/Oversikt-over-alle-sokarar_2020_moms.xlsx
2021: https://lottstift.no/app/uploads/2023/01/Oversikt-over-alle-mottakarar_2021_moms.xlsx
2022: https://lottstift.no/app/uploads/2022/12/Oversikt-over-mottakere-og-tildelt-belop-2022.xlsx
2023: https://lottstift.no/app/uploads/2023/12/Oversikt-over-mottakere-og-tildelt-belop-2023.xlsx
2024: https://lottstift.no/app/uploads/2026/06/Oversikt-over-tildelinger-momskompensasjon-2024.xlsx
```

**Deliberately deferred, not silently dropped**: 2016, 2017, 2018 — no recipient orgnr column,
only a recipient name under an umbrella applicant. 2010-2015 are PDF only (per
`lottstift.no/nb/om-oss/apne-data/`'s own listing) — not even attempted, matching the established
"no PDF parser" convention.

**Geography and ICNPO come from `dim_brreg_enhet`, not from each file's own text columns** —
deliberate, because the file's own `Kommune`/`Kategori` columns are inconsistent in presence and
shape year to year, while `dim_brreg_enhet` already has both, resolved once, for every
organisation regardless of which year's file is being read.

---

## Files to Modify

- `atlas-data/ingest/src/sources/lottstift-momskompensasjon/manifest.yml` (new)
- `atlas-data/ingest/src/sources/lottstift-momskompensasjon/index.ts` (new)
- `atlas-data/ingest/src/sources/lottstift-momskompensasjon/parse.ts` (new)
- `atlas-data/ingest/src/sources/lottstift-momskompensasjon/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/lottstift-momskompensasjon/README.md` (new)
- `atlas-data/ingest/src/sources/lottstift-momskompensasjon/__tests__/` (new, 6 years of fixtures)
- `atlas-data/ingest/src/sources/publishers.yaml` (new `lottstift` provider)
- `atlas-data/ingest/package.json` (`ingest:lottstift-momskompensasjon` script — add FIRST)
- `atlas-data/migrations/<next>_raw_lottstift_momskompensasjon.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (registration — annual
  cadence, existing weekly-polled job pattern)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__lottstift_momskompensasjon.sql`
  (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__lottstift_momskompensasjon.sql` (new),
  `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s listing — bump the count, new
  `lottstift` provider group)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  both halves of §9 shipped)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
