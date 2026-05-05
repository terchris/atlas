# Investigate: bufdir-barnefattigdom — `indicator_api_id` stability under workbook renames

> **IMPLEMENTATION RULES:** Before implementing any plan from this investigation, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Backlog

**Goal**: Decide a stable identity strategy for `indicators__bufdir_barnefattigdom.indicator_api_id` so consumers of the public API don't see indicators "disappear" and "reappear" when Bufdir renames or splits a workbook upstream. Output: a recommended strategy + scope of any code/data migration, **not** the implementation itself (a follow-up `PLAN-*` would do that if the recommendation is more invasive than the current scheme).

**Last Updated**: 2026-05-05

**Origin**: PR #60 landed Cursor BG / Composer-2's ZIP-based ingest with `indicator_api_id = "bf_zip_" + SHA-256(filename_stem)[:24]`. PR #67 hardened discovery + added golden-file tests. The post-merge audit on those two PRs flagged surrogate-id stability as the third (and last) open hardening point — Composer-2 explicitly deferred it. This investigation closes that thread.

---

## The problem in one paragraph

Bufdir's barnefattigdom ZIP exposes one workbook per indicator (`Indikator_<N>_<slug>.xlsx`). The XLSX export does not carry Bufdir's internal Strapi indicator ids. Atlas's current ingest derives `indicator_api_id` deterministically from the **full filename stem** via SHA-256:

```ts
function surrogateIndicatorApiId(workbookStem: string): string {
  return "bf_zip_" + sha256(workbookStem).slice(0, 24);
}
// "Indikator_5_barn_i_hush_..."     → bf_zip_<hash_A>
// "Indikator_5b_barn_i_hush_..."    → bf_zip_<hash_B>  (different! same indicator, renamed)
```

This means **any change to the filename — adding a year, fixing a typo, renumbering, splitting** — changes the id. To consumers of `api_v1.indicators_bufdir_barnefattigdom`, the old indicator vanishes and a new indicator appears. Cross-time series comparisons break.

We have already observed the failure shape upstream: Indikator 9 was split into 9a and 9b at some point (the bundle currently contains `Indikator_9a_…` and `Indikator_9b_…` but no `Indikator_9_…`). The `1..8, 9a, 9b, 11..22` numbering also tells us **Indikator_10 used to exist and was retired** — a real-world rename / consolidation event.

Strapi-API-flavored ingests are immune (Strapi keeps stable hex ids across renames). The ZIP path traded that for operational simplicity; this investigation decides what the right substitute is.

---

## What gets compared — the ID's job

`indicator_api_id` is the join key consumers use to:
1. Track an indicator's value series across years (`SELECT … WHERE indicator_api_id = X ORDER BY year`).
2. Cross-reference Atlas catalogue rows in `mart_meta_sources` / `mart_meta_dimensions` (Phase 3 of PLAN-007).
3. Build derived marts that join bufdir indicators to other sources.

So the strategy must answer: *is this id the same indicator as last year, or is it a new indicator?* Whatever is upstream-stable enough to anchor that answer.

---

## What's actually inside the workbook

Quick spike against the live ZIP — every workbook's `Data` sheet has a title block above the header:

| Workbook | Title in pre-header row 0 |
|---|---|
| `Indikator_17_…leier_bolig_kun_pers.xlsx` | `Tab. 17: Barn 0-5 år i husholdninger som leier bolig. Kun personer.` |
| `Indikator_4_…sosialhjelp_ila_året.xlsx` | `Tab. 4: Barn i husholdninger som har mottatt sosialhjelp i løpet av året.` |

So the workbook **does contain `Tab. <N>`** — the same indicator number as in the filename. Bufdir keeps two redundant copies of the number (filename + sheet body) but no separate stable id.

The only other stable thing inside the workbook is the **title text**, which Bufdir occasionally rewords (e.g. methodology footnotes, definition refinements) — less stable than the number.

---

## Options

### (a) Status quo: `bf_zip_<hash(full_filename_stem)>`

Atlas's current implementation. Survives nothing — every cosmetic filename change breaks every consumer's joins.

- **Pro**: Already shipped. No migration required if accepted.
- **Pro**: Hash collisions effectively impossible (24 hex chars = 96 bits).
- **Con**: Breaks on renames (`5` → `5b`), typo-fixes, year-suffix additions, slug overhauls.
- **Con**: Consumers cannot see "this is the same indicator, just renamed" — the old id orphans, the new id has no history.
- **Verdict**: Insufficient for production cross-year analysis.

### (b) Number-prefix: `bf_zip_ind_<N>` derived from the filename's `Indikator_<N>` portion

Parse the leading `Indikator_<N>` (where `N` matches `\d+[a-z]?`) and use that as the id surrogate. The rest of the filename becomes display-only metadata in `indicator_slug`.

```ts
"Indikator_5_barn_i_hush_..."     → bf_zip_ind_5
"Indikator_5b_barn_i_hush_..."    → bf_zip_ind_5b   (same as 5? deliberately different.)
"Indikator_9a_..."                → bf_zip_ind_9a
"Indikator_22_..."                → bf_zip_ind_22
```

- **Pro**: Survives the most common upstream change — slug refinements, year-suffix additions, methodology footnote rewrites — that don't change the indicator number.
- **Pro**: Aligns with the inside-workbook `Tab. <N>` identifier (consistent with Bufdir's own convention).
- **Pro**: Trivial to implement; one regex change in `parse.ts:surrogateIndicatorApiId()`.
- **Pro**: Backwards-compatible mart-schema change; `indicator_api_id` is still text.
- **Con**: A genuine rename like `5` → `5b` is treated as a different indicator (which it might be — `5b` is a refinement, not a renumber).
- **Con**: Renumbering events (the kind that produced the `10 → 9a/9b` history) still appear as discontinuity. Needs an alias table to bridge.
- **Verdict**: Strong default. Covers ~80 % of real upstream changes at zero ongoing cost.

### (c) Title-hash: `bf_zip_<hash(workbook_title_text)>`

Use the `Tab. <N>:` title text from the workbook's row 0 instead of the filename.

- **Pro**: Survives filename-only changes (path moves, slug rewrites).
- **Con**: Bufdir occasionally rewords titles (e.g. *"Barn i …"* → *"Personer 0-17 i …"*); each reword breaks ids.
- **Con**: Norwegian Unicode normalisation, whitespace handling, em-dash variants — many subtle ways to produce non-deterministic hashes.
- **Con**: Titles are *less* stable than numbers in observed Bufdir history.
- **Verdict**: Weaker than (b). Don't pursue.

### (d) Number-prefix + alias seed: (b) + a tiny human-curated `bufdir_indicator_alias.csv`

(b) plus a hand-authored seed file that maps historical → canonical ids when Atlas observes a renumber:

```csv
historical_id,canonical_id,note
bf_zip_ind_9,bf_zip_ind_9a,Indikator 9 was split into 9a (innvandrerbakgrunn Afrika etc) and 9b (EU etc) ~2024; consumers joining on the old id should use 9a as the closest successor
bf_zip_ind_10,,Indikator 10 retired by Bufdir (no successor in the bundle as of 2026-05-04)
```

The alias seed lives at `atlas-data/dbt/seeds/sources/bufdir_indicator_alias.csv` and feeds a `marts.bufdir_indicator_alias` dbt model placed under `models/marts/api/` so the PLAN-004 generator auto-emits the `api_v1.bufdir_indicator_alias` wrapper. Consumers explicitly join on it when they want historical continuity; the default `indicator_api_id` join still works without it.

- **Pro**: Handles the real renumbering events (b) can't, while keeping the common-case clean.
- **Pro**: Human-curated — the editorial decision (*"is 9a the canonical successor of 9, or is the old 9 fully retired?"*) is captured per row, not invented by code.
- **Con**: Maintenance overhead — every new bufdir release needs a diff check ("did Bufdir add a new indicator number? rename one?").
- **Con**: Adds one seed table + a per-source maintenance ritual.
- **Verdict**: Right answer for production. Recommended.

### (e) Strapi/CMS direct lookup — query Bufdir's Strapi API for the canonical indicator id

Hit Bufdir's CMS (Strapi `/api/...`) instead of inferring from the workbook. The CMS does have stable hex ids.

- **Pro**: Bufdir's own canonical id; never invented.
- **Pro**: Survives filename changes by definition.
- **Con**: Re-introduces the live-API dependency that PR #60 deliberately removed for "operational simplicity."
- **Con**: Strapi API shape may not be public / documented; reverse-engineering required.
- **Con**: Adds an HTTP roundtrip per indicator (not just one for the ZIP).
- **Con**: Has its own brittleness (Strapi schema changes, auth requirements, rate limits).
- **Verdict**: Only worth pursuing if (b)+(d) prove insufficient in practice. Defer.

---

## Recommended outcome

**(d) — number-prefix + alias seed.** Specifically:

1. Change [`parse.ts:surrogateIndicatorApiId()`](../../../../atlas-data/ingest/src/sources/bufdir-barnefattigdom/parse.ts) to parse `Indikator_(\d+[a-z]?)` from the filename stem and emit `bf_zip_ind_<N>` (e.g. `bf_zip_ind_9a`). Filename-stem hashing falls away.
2. Add a fallback path: if the filename doesn't match `Indikator_<N>` (defensive — maybe Bufdir adds a non-numbered workbook), fall back to the current SHA-256-of-stem to keep ingest from throwing. Log a warn so the operator notices.
3. Add seed `atlas-data/dbt/seeds/sources/bufdir_indicator_alias.csv` with columns `historical_id, canonical_id, note`. Pre-populate the `9` → `9a` and the `10` → null entries from the existing observed history.
4. Add the dbt model at `atlas-data/dbt/models/marts/api/bufdir_indicator_alias.sql` (loads from the seed) + a `schema.yml` entry with descriptions for all four columns (`historical_id`, `canonical_id`, `note`, `source_id`). Placement under `models/marts/api/` means the next `./regenerate-api-v1.sh` run auto-emits `api_v1.bufdir_indicator_alias` — no per-source generator wiring. PostgREST's `marts.*` exposure (PLAN-007 Phase 1) will serve `GET /bufdir_indicator_alias` automatically once UIS lands the schema-list extension.
5. Document the consumer pattern in [`bufdir-barnefattigdom/README.md`](../../../../atlas-data/ingest/src/sources/bufdir-barnefattigdom/README.md) and the upcoming Phase 4 `/data` page so external developers know to use it for historical continuity.
6. Refresh `bufdir_indicator_alias.csv` as part of every new bufdir refresh — add to the maintenance checklist in the source README.

**Migration concern**: existing `indicator_api_id` values in `marts.indicators__bufdir_barnefattigdom` are `bf_zip_<24-char-hex>`. After this change they become `bf_zip_ind_<N>`. **This is a breaking change** for any consumer that has cached the old ids. The bufdir source has been live for less than a week and the public API for it has not been advertised, so the breaking-change cost is essentially zero today. Land before any external integration starts depending on the current id shape.

**Don't recommend (a)**: leaves the production gap.
**Don't recommend (b) alone**: doesn't handle renumbering; alias is the cheap completion.
**Don't recommend (c)**: title-hashing is weaker than number-hashing in observed Bufdir behavior.
**Don't recommend (e)**: re-introduces the live-API dependency PR #60 removed; revisit only on signal.

---

## Open questions

- **[Q1]** Should `bf_zip_ind_5` and `bf_zip_ind_5b` be the same id (under the assumption that `5b` is a refinement of `5`) or different (under the assumption that `5` is retired and `5b` is a separate indicator)? **Recommendation**: keep them different by default; let the alias seed bridge when an editorial decision says so. Conservative — code never claims continuity it can't prove.
- **[Q2]** Where does the alias seed live in the cluster — under `seeds/sources/` (alongside `_sources_manifest.csv`) or under `seeds/` (top-level)? **Recommendation**: `seeds/sources/` — same shape as the manifest seed, single seed-rebuilder script discovers everything in one directory.
- **[Q3]** Should the alias table be exposed via `api_v1.bufdir_indicator_alias` so external consumers can join on it? **Recommendation**: yes, auto-exposed via both surfaces. Place the dbt model at `atlas-data/dbt/models/marts/api/bufdir_indicator_alias.sql` so the existing PLAN-004 generator (`regenerate-api-v1.sh`) emits the `api_v1.*` wrapper without per-source code, and so PostgREST's `marts.*` schema serves it directly once PLAN-007 Phase 1 lands the schema-list extension. **Auto-exposure over per-source decisions** — see the architectural note below.
- **[Q4]** Should the same id-strategy apply to **other** ZIP-shaped sources Atlas might onboard later (DSB workbooks, Bufdir-barnevern XLSX exports, etc.)? **Recommendation**: yes by default. The `Indikator_<N>` *parsing rule* is bufdir-specific, but the convention "small alias seed in `seeds/sources/<source>_indicator_alias.csv` + dbt model under `models/marts/api/`" generalises trivially. Each future ZIP source can copy the pattern; no per-source INVESTIGATE required unless a source genuinely deviates (e.g. its own version-stable id baked into the workbook).

---

## Architectural principle: auto-exposure over per-source decisions

This INVESTIGATE's Q3/Q4 answers lean on a broader principle worth recording explicitly so future ZIP/alias work doesn't re-litigate:

> **New data should be served automatically.** Atlas already has two mechanisms that auto-expose data without per-source code:
>
> 1. **PostgREST schema-list extension** (PLAN-007 Phase 1, UIS-side, pending) — every new `marts.*` table is queryable as `GET /<table>` the moment it ships, no separate exposure step.
> 2. **`regenerate-api-v1.sh` generator** (PLAN-004) — every dbt model under `models/marts/api/` auto-emits an `api_v1.<name>` wrapper view.
>
> Together, the right design move for any new lookup / dim / fact / mart is to **drop it under `models/marts/api/`** so both surfaces pick it up for free. No "should we expose this?" decision per source. No opt-in flag. No maintenance ritual gating on whether someone remembered to wire it up.
>
> Reverse-direction: an `api_v1.*` wrapper is *not* a meaningful commitment for a small reference / alias table that Atlas controls end-to-end (we'd never break its column shape arbitrarily anyway). The wrapper layer's value is uniform discovery, not a separate stability tier.

This is the lens through which every future alias / lookup / catalogue artefact gets placed. Codified here so the next agent reading this INVESTIGATE doesn't re-debate "should the alias be in api_v1?" for whatever source comes after bufdir.

---

## What this INVESTIGATE explicitly does NOT decide

- **The implementation timing**. This is research-only. A follow-up `PLAN-bufdir-surrogate-id-migration.md` would sequence the migration (parse change → seed creation → backfill notes → consumer messaging) if the recommendation is accepted.
- **Whether the alias seed should also retroactively add entries for the (yet-unobserved) `Indikator_X` deprecations**. We add entries when we observe a deprecation — pre-populating speculative entries is wasted maintenance.
- **The rename-detection automation**. A future ingest could diff today's filenames against last week's `_sources_dimensions` seed and flag suspect renames. That's a hardening step, not part of this scope.

---

## Cross-references

- [`atlas-data/ingest/src/sources/bufdir-barnefattigdom/parse.ts`](../../../../atlas-data/ingest/src/sources/bufdir-barnefattigdom/parse.ts) — current `surrogateIndicatorApiId()` lives here; option (b) implementation lands here.
- [`atlas-data/ingest/src/sources/bufdir-barnefattigdom/README.md`](../../../../atlas-data/ingest/src/sources/bufdir-barnefattigdom/README.md) — Known-quirks line on surrogate id (added in PR #68) is the user-facing flag this investigation closes.
- [`INVESTIGATE-bufdir-barnefattigdom-zip-ingest.md`](./INVESTIGATE-bufdir-barnefattigdom-zip-ingest.md) — Composer-2's original investigation that flagged this question and deferred it.
- [PR #60](https://github.com/terchris/atlas/pull/60) — the streaming ingest that introduced the surrogate-id strategy.
- [PR #67](https://github.com/terchris/atlas/pull/67) — the `parse.ts` split + golden-file tests; covers the filename-derivation logic this INVESTIGATE proposes changing.
- [PLAN-007 Phase 3 — `mart_meta_dimensions`](../active/PLAN-007-data-display-open-by-default.md#phase-3) — when Phase 3 ships, the alias seed shape may want to be reflected in the catalogue's metadata views.

---

## Next steps

- [ ] User reviews + accepts (or refines) the recommended outcome **(d)**.
- [ ] If accepted, draft `PLAN-bufdir-surrogate-id-migration.md` with the parse change, the alias seed, the dbt model, and the consumer-doc update sequenced.
- [ ] If deferred (acceptable: bufdir is new, no external consumers yet), capture the decision + the trigger condition in this file.
- [ ] Move this INVESTIGATE backlog/ → active/ when the migration PLAN starts; active/ → completed/ when it ships.

— signed, the Atlas implementation team (via Claude Code agent), 2026-05-05
