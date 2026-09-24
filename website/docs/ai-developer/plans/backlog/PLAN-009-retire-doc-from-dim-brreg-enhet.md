# PLAN-009 — Retire `doc` from dim_brreg_enhet

Rewrites the Brreg incremental merge so it reconciles 61 columns instead of one JSON document, which is what "extract all fields and there is no need for doc" requires — and the reason it is a plan rather than a commit.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — awaiting a decision from Terje

**Goal**: Remove `doc` from `marts.dim_brreg_enhet` without changing a single value any consumer already reads.

**Last Updated**: 2026-09-24

---

## 🔴 Read this part first: what goes wrong, and what it looks like

Today the merge reconciles **one thing**: a whole JSON document. Either the change feed's document wins or the snapshot's does.

After the rewrite it reconciles **61 columns**, and a wrong decision on any one of them is **invisible**:

- the row count is unchanged
- every type is right
- every existing test passes
- the floor test in `tests/extracted_columns_are_still_populated.sql` still passes, because the column *is* populated

It is simply populated **from the snapshot when it should have come from the change feed**, or the reverse. Nothing in the pipeline can see that, because both values are plausible values of the same column.

⚠️ **A consumer would see it as an organisation whose name, address or bankruptcy date is quietly out of date** — not as an error. There is no symptom to alert on. That is the failure this plan exists to be designed against, and it is why the work is not a refactor.

## 🔴 And the mechanism does NOT translate the obvious way

The natural rewrite is wrong:

```sql
-- TODAY (document-level)
coalesce(c.changed_doc, s.doc) as doc

-- THE OBVIOUS REWRITE — WRONG
coalesce(c.navn, s.navn) as navn,
coalesce(c.konkursdato, s.konkursdato) as konkursdato, ...
```

**Document-level precedence is not column-level coalesce.** When the change feed supplies a document, that document wins **including its absences**. If the feed says an organisation no longer has an email address, today the row's email becomes null. Column-wise `coalesce` would fall back to the snapshot and **resurrect a deleted value** — permanently, because the snapshot is never re-read.

The correct shape is a **row-level selector**, not 61 column-level ones:

```sql
case when <the feed supplied this row> then c.<col> else s.<col> end
```

### ⚠️ And that condition cannot be reconstructed after `doc` is gone

Today the discriminator is `c.changed_doc is not null`. A feed row whose document is null currently falls back to the snapshot. Once `doc` is deleted there is nothing left to test, so **the extraction must carry a boolean recording which source the row came from**. That column does not exist yet and is a prerequisite, not an implementation detail.

---

## Decisions for Terje

### 1. `respons_klasse` — extract it, or record that it is being dropped

It is `'Enhet'` on all 1 175 415 rows, counted. It is a type discriminator for a Brreg endpoint that can also return `Underenhet`; Atlas ingests only `Enhet`, so it is constant here **by construction**.

- **Extract it** — one useless column, costs nothing, and it stops being a question.
- **Drop it** — one fewer column, and the fact that Brreg sends it is no longer recorded anywhere.

🔴 **Only one of these is reversible once `doc` is gone.** Dropping it is a decision that cannot be revisited from the data.

### 2. Go / no-go on the whole thing

What retiring `doc` buys: the heap shrinks from ~1 983 MB to roughly 600 MB, and every unindexed scan on this table gets proportionately faster.

🔵 **There is a cheaper way to get most of that** and it is on the table as an alternative: leave `doc` in the dimension and set `toast_tuple_target` so it moves out of line. Scans stop reading it, the merge is untouched, and nothing above needs to be got right. It gives up reclaiming the disk, not the speed.

---

## How long the table is unavailable

**About 24 minutes**, and that figure has a scope attached because the last one did not:

```
   256 s   the dimension alone
 1 438 s   `dbt build --full-refresh --select dim_brreg_enhet+`   <- the documented command
```

⚠️ The `+` also builds 58 data tests, 4 view models and 1 table model — about 5.6× the work the 256 s describes. **Book the window off 1 438 s.** Measured by imac on 2026-09-24.

🔴 **Run the refresh as the `atlas` database user, not as a superuser.** `--full-refresh` drops and recreates, so the tables take the running user's ownership; doing it as `postgres` leaves the next Dagster run failing with `permission denied`.

---

## Phases

### Phase 1 — Prerequisite: record the row's source

- [ ] 1.1 Add a column to the merge recording which side supplied the row, derived from `c.changed_doc is not null` **while `doc` still exists**.
- [ ] 1.2 Ship and deploy it. It is additive and harmless on its own.

🔵 This must land **before** anything is deleted, because it is the only moment the information is still available.

### Phase 2 — Rewrite the merge against the new discriminator

- [ ] 2.1 Replace `coalesce(c.changed_doc, s.doc)` with a row-level selector over all 61 columns.
- [ ] 2.2 Replace the post-hook `delete from {{ this }} where doc is null`. It currently removes rows where neither source supplied a document; the equivalent condition after extraction is "neither source supplied this row", which the Phase 1 column answers directly.
- [ ] 2.3 Do **not** delete `doc` yet.

### Phase 3 — Prove equivalence before deleting anything

🔴 **This is the phase the plan exists for.** Run the rewritten merge alongside the current one and compare, on the real table:

- [ ] 3.1 Build the rewritten dimension into a scratch schema from the same sources.
- [ ] 3.2 `EXCEPT` in both directions on all 61 columns against the live dimension. **Expect zero rows both ways.** Any row returned is a precedence defect, named by column.
- [ ] 3.3 Repeat after a change-feed run has touched rows, so the comparison covers the case the selector exists for. A comparison taken when the feed has changed nothing proves only that the snapshot path works.
- [ ] 3.4 Record both results in the PR.

⚠️ **A single `EXCEPT` returning zero rows is not the proof.** It has to be taken across a window where the feed actually overwrote something, or it tests half the logic.

### Phase 4 — Delete `doc`

- [ ] 4.1 Drop `doc` from `dim_brreg_enhet` and from the published view.
- [ ] 4.2 Full refresh, as `atlas`, in a booked window.
- [ ] 4.3 Confirm the heap and the scan time, and record both.

---

## Dependencies

**Prerequisite**: [#457](https://github.com/terchris/atlas/pull/457) must land first — it records the `links`/`_links` boundary of 14 September, and once `doc` stops being published that is the only evidence the seam ever existed. The seam also **moves**: the `links` cohort is converting to `_links` continuously, so the record cannot be reconstructed later.

**Not blocked by**: the `toast_tuple_target` alternative, which is a substitute for this plan rather than a step in it.

## What this plan deliberately does not do

- It does not change which values a consumer reads. Every column keeps its current value; only the mechanism that computes it changes.
- It does not touch `raw`. The verbatim upstream document stays there regardless, so nothing is lost from Atlas — only from the published surface and the dimension.
