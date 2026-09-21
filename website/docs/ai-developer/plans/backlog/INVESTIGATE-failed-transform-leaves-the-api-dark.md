---
mdx:
  format: md
---

# INVESTIGATE: a failed transform can leave published relations missing, and the check that would notice is downstream of the failure

## Status

**Open — 2026-09-21.** Filed by atlas after saying three times on urb-agents #1328 and #1331 that it
would be filed and not doing it.

On 2026-09-21 the same three published relations went dark **twice in one day**. The second cause
was a comment block in `dim_brreg_enhet` whose `--` covered only its first line — that specific
defect is now caught by `check-models-compile.sh` (urb-agents #1328). **This investigation is about
the other half, which is not fixed: what happens to the published surface when any model fails.**

## The mechanism

Verified by reading `atlas-data/dagster/atlas_data/assets/api_v1.py` and `schedules.py` on
2026-09-21:

- `api_v1_surface` declares `deps=_api_model_asset_keys()` — every model in `models/marts/api/`.
- Dagster **skips** a downstream asset when an upstream one fails. A dbt build that fails at model
  1 of 90 therefore means `api_v1_surface` never runs, so `api_v1_generated.sql` is never applied.
- `publish_api_v1` and `api_v1_checks` exist as separate jobs and can be run on demand. **No sensor
  and no schedule connects them to a failed transform.**

So after a failed run the wrapper views are whatever the last successful run left, and nothing
re-applies them until someone runs a job by hand.

🔴 **The part that makes this worth a file:** `api_v1_rowcount_matches_marts` is an *asset check on
`api_v1`*. When `api_v1` is skipped, its checks are skipped too. **The check that would notice the
surface is wrong is downstream of the thing that went wrong**, so the failure mode is silence, not
a red check. This is the same shape as urb-agents #1039 (`check-osmosis.sh` passing on an empty
introspection) and #1328 (a verifier branch that could not fail).

## ⚠️ What is inference and what is measured

**Measured:** the dependency structure above, and that three published relations were missing after
the failed runs.

**Inferred, not measured:** *why* they were missing. The reading is that a `drop ... cascade` during
the partial run removed a relation together with its dependent views, and the skipped `api_v1`
asset then never rebuilt them. ⚠️ **That has not been confirmed against the run records.** dbt's
table materialization builds the replacement before dropping the original, so a failure at model 1
should leave models 2–90 untouched — which does *not* obviously produce a missing wrapper.

**The one measurement that decides it:** pull the Dagster run records and the Postgres logs for the
two 2026-09-21 failures and establish whether any `drop ... cascade` executed, and against what.
Until that is done, the remedy below is aimed at a mechanism that is only probable.

## What a PLAN would have to decide

1. **Detection that is not downstream of the failure.** A reader that answers "does every relation
   in `api_v1_state.json` exist and answer?" without depending on the transform having succeeded.
   The live equivalent a consumer can already run is a `GET` per relation; `verify-release.py`
   does exactly this and runs outside the pipeline entirely.
2. **Whether recovery should be automatic.** `publish_api_v1` is idempotent and cheap. Re-applying
   the wrappers after a failed transform would restore the surface — but over **stale marts**, and
   a wrapper answering with last week's numbers may be worse than one that 404s, because a
   consumer cannot tell. ⚠️ This is the trade-off the PLAN exists to settle, and it should not be
   settled by whoever finds it convenient.
3. **Whether `api_v1_surface` should be allowed to run on partial upstream success at all**, which
   is a Dagster-level question about failure policy, not an Atlas one.

## Why it is not urgent

Every occurrence so far was noticed within the hour, because a deploy was in flight and someone was
watching. ⚠️ **That is the reason to file it rather than the reason to close it** — the failure mode
is invisible precisely when nobody is watching, which is the normal state.

## Related

- urb-agents #1328 — the comment that broke the build; `check-models-compile.sh` came out of it
- urb-agents #1039 — a gate that passed by checking nothing
- [SERVING-A-SOURCE](../../SERVING-A-SOURCE.md) trap 10, "merging is not shipping", and trap 11
