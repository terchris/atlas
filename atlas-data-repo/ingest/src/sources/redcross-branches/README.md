# redcross-branches

First NGO-supply ingest. Reads Norges Røde Kors's Organizations API data and writes it to two `raw.*` tables — chapters and per-chapter activities.

## Source

Static JSON dump at [`docs/research/api-getOrganizations-output-21apr26.json`](../../../../../docs/research/api-getOrganizations-output-21apr26.json).

The dump was fetched once on 2026-04-21 from `api.redcross.no/nrx/v1/organizations` (subscription key required). Live API polling is **deferred to a separate workstream** — see [`INVESTIGATE-ngo-supply-data-model.md` Q39](../../../../docs/ai-developer/plans/backlog/INVESTIGATE-ngo-supply-data-model.md). When live access lands, the script will be updated to fetch the API directly with no other changes; the `raw.*` tables stay the same.

## Tables written

- `raw.redcross_branches` — one row per branch. 392 rows (1 Nasjonalkontoret + 18 Distrikt + 362 Lokalforening + 11 Ukjent).
- `raw.redcross_branch_activities` — one row per (branch, globalActivityName). ~2 400 rows. The PK is `(branch_id, global_activity_name)`; if a branch lists the same activity twice in the dump (rare data quirk), only the first is kept.

## Run

```bash
cd atlas-data-repo/ingest
npm run ingest:redcross-branches
```

Idempotent — re-runs upsert on `(branch_id)` for branches and `(branch_id, global_activity_name)` for activities.

## Downstream

Per [PLAN-002](../../../../docs/ai-developer/plans/active/PLAN-002-redcross-ingest.md):

- `supply__redcross_branches` reshapes `raw.redcross_branches` into `dim_chapter` shape (chapter_level, parent_chapter_id, kommune_nr resolved via dim_postnummer)
- `supply__redcross_branch_activities` reshapes `raw.redcross_branch_activities` and applies the 50-row CASE WHEN that maps Red Cross's `globalActivityName` to the 22-row `service_category_code` vocabulary (Appendix A of PLAN-002)
- `dim_chapter` UNIONs supply__*_branches across all NGOs
- `dim_activity` SELECT DISTINCTs from supply__*_branch_activities
- `fact_chapter_activities` joins them
