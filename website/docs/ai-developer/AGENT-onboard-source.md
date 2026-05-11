# AGENT runbook — onboard a new data source

This is the **autonomous-agent runbook** for adding one upstream data source to Atlas's ingest pipeline. It is written to be read by a Cursor Background Agent (or similar cloud agent) running in a sandbox VM with a fresh repo clone. Humans should read [`contributors/adding-a-source.md`](../contributors/adding-a-source.md) instead — that is the canonical 11-step workflow, written for humans. This file is the agent-shaped projection of the same workflow, with explicit invariants, gates, and escalation paths.

> **Invariant zero**: never run `git push` or `gh pr merge` against a branch the human did not explicitly ask you to. You only ever push your own `feat/onboard-<source-id>` branch and open a PR. You never touch `main`. You never enable auto-merge.

---

## Inputs you receive

The user kicks the agent off in one of two modes:

1. **Queue mode (preferred after the first pilot)**: the prompt says to pick the
   first open GitHub issue labelled `new-source` in `terchris/atlas`. Each issue
   represents exactly one candidate from
   [`plans/backlog/INVESTIGATE-new-norwegian-public-sources.md`](./plans/backlog/INVESTIGATE-new-norwegian-public-sources.md).
2. **Named-candidate mode**: the prompt names **one candidate** directly — for
   example "Onboard ssb-10826 (Tier-1 [Q48])".

In both modes, read the candidate's entry in
[`plans/backlog/INVESTIGATE-new-norwegian-public-sources.md`](./plans/backlog/INVESTIGATE-new-norwegian-public-sources.md)
end-to-end before doing anything else. That document holds the per-candidate
rationale, geographic resolution, access mechanism, licence, cadence, and any
open questions. It will tell you the source's quirks and the editorial decisions
the human has already made.

If the prompt neither tells you to use the queue nor names a candidate, **stop and
ask** — do not pick one yourself.

---

## Queue mode — claim one GitHub issue

Use this section only when the prompt explicitly tells you to use the
`new-source` issue queue.

The issue queue is the source of truth for "what data is next". A merged PR with
`Closes #<issue-number>` closes the issue automatically, so completed sources are
not picked again. Atlas intentionally runs **one Cursor Cloud Agent at a time**;
there is no distributed lock beyond the assignee marker.

Pick and claim:

```bash
gh issue list --state open --label new-source --search "no:assignee" \
  --json number,title,url --limit 1

# If the list is empty: nothing to do; stop cleanly.
# Otherwise:
gh issue edit <issue-number> --add-assignee @me
gh issue view <issue-number>
```

Then:

- Treat the issue body as the task brief.
- Identify the referenced candidate / `[Q<N>]` entry in
  `INVESTIGATE-new-norwegian-public-sources.md`.
- Create branch `feat/onboard-<source-id>`.
- Include `Closes #<issue-number>` in the PR body so GitHub closes the queue
  item when the human merges the PR.

If an issue is already assigned, do not touch it. If all open `new-source` issues
are assigned, stop and report that no unassigned source work is available.

---

## Read before you write

Read these files in this order. They form the entire mental model you need.

1. [`/CLAUDE.md`](https://github.com/terchris/atlas/blob/main/CLAUDE.md) — repo-wide agent instructions.
2. [`contributors/adding-a-source.md`](../contributors/adding-a-source.md) — the 11-step human workflow this runbook tracks.
3. [`contributors/ingest-modules.md`](../contributors/ingest-modules.md) — the per-source folder contract (`index.ts`, `README.md`, `manifest.yml`, schema).
4. [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/README.md) — the implemented-sources catalogue + the manifest.yml schema.
5. [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) — canonical column vocabulary; rule #5 is enforced by the osmosis gate.
6. [`atlas-data/ingest/src/sources/ssb-08764/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/ssb-08764/) — the canonical SSB-style template you copy from. Read all three files.

For an FHI-shape source, also read one of [`fhi-livskvalitet/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/fhi-livskvalitet/) or [`fhi-mediebruk-some/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/fhi-mediebruk-some/) — FHI's PxWebAPI helper lives at [`lib/fhi.ts`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/lib/fhi.ts), not [`lib/pxweb.ts`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/lib/pxweb.ts).

For a candidate with no obvious template (a brand-new provider, an HTML scrape), **stop and ask** — flag `needs-human` (see Escalation below). Do not improvise scraper plumbing; the [`lib/scraping/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/lib/scraping/) toolkit has rules and a separate workflow.

---

## Branch + workspace setup

```
git checkout main
git pull --ff-only
git checkout -b feat/onboard-<source-id>
cd atlas-data/ingest && npm ci
```

Do not `npm install` — use `npm ci` so the lockfile is honoured. Do not modify `package-lock.json` outside the npm-script entry you add in step 5.

---

## The work, in order

Steps mirror [`contributors/adding-a-source.md`](../contributors/adding-a-source.md). Numbers match. Anything Atlas-specific or agent-specific is called out below.

### Step 1 — Skip catalogue entry

The catalogue entry in [`docs/research/samfunnspuls/data-sources.md`](https://github.com/terchris/atlas/tree/main/docs/research/samfunnspuls/data-sources.md) is *human-curated*. Do not edit it. The candidate's row in [`plans/backlog/INVESTIGATE-new-norwegian-public-sources.md`](./plans/backlog/INVESTIGATE-new-norwegian-public-sources.md) substitutes for this step in the agent path.

### Step 2 — Investigate the upstream

Issue one or two `curl` calls against the upstream to confirm:
- the table / endpoint actually returns data with the filters you intend to use;
- dimension names and code-format (`region_code` vs prefixed `K_0301` vs alphanumeric);
- approximate row count for a small probe;
- the `updated` / `last_modified` field shape (you will pass this to `recordIngestRun` later).

Record what you learn in your own scratch notes — the README's "Known quirks" section is where the durable bits land.

If the endpoint requires authentication, hits a captcha, returns HTML instead of JSON, or is otherwise not a clean machine-readable surface — **stop and escalate** as `needs-human`.

### Step 3 — Migration

Run `ls atlas-data/migrations/ | sort -n | tail` to find the highest existing number. Add `+1` (zero-padded to 3 digits) and create `atlas-data/migrations/NNN_raw_<source_id_with_underscores>.sql`.

Hyphens in folder names (`ssb-10826/`), underscores in SQL identifiers (`raw.ssb_10826`).

The migration **MUST**:
- `create table if not exists raw.<source_id>(…)` — never `drop` or `alter` an existing table.
- carry the upstream column shape verbatim — no renaming at the raw layer.
- declare a composite `primary key` on every dimension column.
- include `loaded_at timestamptz not null default now()`.
- include a `comment on table` describing the source in one sentence.
- include a `comment on column` for any non-obvious column (prefix codes, suppression markers, degenerate-dimension single-code columns).

Migration files are append-only across the repo. Never edit a previously-merged migration.

### Step 4 — Ingest module folder

Create `atlas-data/ingest/src/sources/<source-id>/` and write three files:

- **`index.ts`** — copy [`ssb-08764/index.ts`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/ssb-08764/index.ts) (or the FHI template) and adapt. Required shape:
  - `import { recordIngestRun } from "../../lib/ingest_run.js";` and wrap your work inside `recordIngestRun(SOURCE_ID, async () => { … })`. Do **not** call `closeSql()` yourself.
  - declare the row type **inline** — never edit `lib/types.ts`.
  - `export const SOURCE_ID = "<source-id>";` matching the catalogue id exactly.
  - module-level constants: `TABLE_ID`, `TARGET_TABLE`, `OUTPUT_PATH`, `WRITE_COLUMNS`, `CONFLICT_KEYS`.
  - `export async function run(): Promise<<Source>Summary>` with `recordIngestRun(...)` inside.
  - end with `run().catch(err => { logger.error(…); process.exit(1); })`.
  - return `{ output, record: { rowsScraped, rowsParsed, upstreamUpdatedAt } }` from the inner work fn so `recordIngestRun` can finish the run row.
- **`README.md`** — *prose-only*. Five sections in order: title + one-line description, "What the script does", "Known quirks", "Known issues / TODOs", "References". No structured tables. No fields that belong in `manifest.yml`.
- **`manifest.yml`** — bootstrap it with the script (see step 4b), then hand-author the `dimensions:` block.

Forbidden in `index.ts`:
- inline `writeNdjson` — use [`lib/output.ts`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/lib/output.ts).
- inline Postgres clients — use [`lib/postgres.ts`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/lib/postgres.ts).
- hard-coded credentials.

#### Step 4b — Bootstrap the manifest, then hand-author dimensions

```
cd atlas-data/ingest
npm run sources:bootstrap-manifest -- <source-id>
npm run sources:fill-manifest-todos
```

Then **read the generated `manifest.yml`** — these scripts are mechanical. They will:
- set `eu_theme` from a regex on `tags.topic`. **Verify it.** Allowlist of 13 codes is in [`atlas-data/dbt/seeds/sources/eu_data_theme.csv`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/sources/eu_data_theme.csv).
- set `attribution` from a `provider`-aware template. **Verify the institution name and table id are correct.**
- leave the `dimensions:` block empty or under-specified. **You hand-author this.** See the [manifest.yml schema](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/README.md#manifestyml-schema) for required fields per dimension; `code` and `meaning` are required, `value_format` and `notes` may be empty strings but are usually informative.
- skip `upstream_landing_page` if the candidate is FHI / Brreg / Red Cross. Hand-edit it in if you have a human-browsable landing URL — paste the *exact URL the user used to get there*, including filter query strings (do not strip them; they help humans reproduce the slice the source represents).

`tags:` has four required namespaces (`provider`, `topic`, `geo`, `cadence`); each takes one value from the allowlist in the schema. The fill script's regex is first-match-wins — verify the topic is the most accurate one for *this* source, not the regex's first hit.

### Step 5 — npm script

Add `"ingest:<source-id>": "tsx --env-file=.env src/sources/<source-id>/index.ts"` to [`atlas-data/ingest/package.json`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/package.json), alphabetically among the other `ingest:*` entries. Do not run `npm install`; the script entry is a one-line change.

### Step 6 — Regenerate the implemented-sources index

```
cd atlas-data/dbt
uv run python scripts/build_sources_seed.py --readme ../ingest/src/sources/README.md
```

This rewrites the auto-generated section of [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/README.md) and updates the seed CSVs at [`atlas-data/dbt/seeds/sources/_sources_manifest.csv`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/sources/_sources_manifest.csv) and [`_sources_dimensions.csv`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/sources/_sources_dimensions.csv). If this script reports validation errors (missing fields, bad eu_theme, malformed `dimensions:`) — **fix the manifest, don't bypass the validator**.

### Steps 7–9 — dbt source declaration + per-source mart + schema.yml

Follow [`contributors/adding-a-source.md`](../contributors/adding-a-source.md) Steps 7, 8, 9 verbatim. Key Atlas invariants:
- The mart's first column is `source_id` as a hard-coded literal — `select '<source-id>'::text as source_id, …`.
- Every column in `schema.yml` has a `description`. The osmosis gate enforces this — see Step 10's `./check-osmosis.sh`.
- Add `relationships:` tests for `kommune_nr` → `ref('dim_kommune')`, `fylke_nr` → `ref('dim_fylke')`, `orgnr` → `ref('dim_ngo')` whenever those columns appear.
- Use canonical column names per [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md). No upstream names leak into `marts.*` (no `Region`, `Tid`, `KOKkommuneregion0000`).
- For sources where `dim_kommune` is joined by name (rare), add `is_active = true` to the join — see the [`is_active` filter memory](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md#kommune-joining) and prior incidents. If you join by `kommune_nr`, the dim's PK already filters this; nothing extra needed.

Step 9b (regenerate `api_v1`) **only applies if your model lives under `models/marts/api/`**. New per-source ingest marts live under `models/indicators/`, not `marts/api/` — so you skip Step 9b for almost every source. If unsure, do not run `regenerate-api-v1.sh`.

### Step 9c — Refresh the reports / indicators investigation

Open [`plans/backlog/INVESTIGATE-reports-and-indicators-from-catalogue.md`](./plans/backlog/INVESTIGATE-reports-and-indicators-from-catalogue.md) and follow its **Maintenance** checklist at the bottom of the file. Concretely:
- bump the source count in the goal paragraph (e.g. 38 → 39);
- slot the new source into one of the 10 (or 16) reports it informs — usually the new source plugs a column-gap noted in a "Planned additions" sub-section, in which case you mention that the gap is now closed;
- if the source introduces a new `dim_*`, `crosswalk_*`, or `ref_*` row, add it to the corresponding table further down;
- if the source genuinely opens a brand-new analytical axis the existing reports don't cover, *propose* a new report inline, but do **not** define one without flagging it for human review.

This refresh **must land in the same commit / PR** as the source itself. The doc is the menu; the menu has to match what the catalogue actually serves.

### Step 10 — Run all gates

In this order, in this directory layout. Every command must exit 0 and produce no warnings.

```
# from atlas-data/ingest/
npm run typecheck

# from atlas-data/dbt/
uv run --env-file ../ingest/.env dbt parse
./check-osmosis.sh
```

You **do not** run `npm run migrate`, `npm run ingest:<source-id>`, `dbt run`, or `dbt test`. These need a live database the agent does not have. They are the human's responsibility post-merge.

If `dbt parse` fails because your model references an unknown ref, fix the model — don't add the ref-target. If `check-osmosis.sh` reports a non-zero TOTAL, fix the schema.yml — every column needs a description. Do not bypass either gate.

### Step 11 — Commit + push + open PR

Single commit. Commit message format:

```
Add <source-id> — <one-line summary>

<2-3 sentence description: what the source is, what column gap it closes, any
unusual quirks reviewers should look at>
```

Push the branch, open a PR titled `Add <source-id> — <one-line summary>`, body:

```markdown
## Summary
- Add <source-id> ingest module + raw landing table + dbt mart.
- Closes column gap on Report #<N> (<report name>).
- <any new dim/crosswalk/ref seed introduced, or "no new conformed dimensions">

## Verification gates run
- [x] npm run typecheck
- [x] dbt parse
- [x] check-osmosis.sh

## Gates not run (require live DB; human runs post-merge)
- [ ] npm run migrate
- [ ] npm run ingest:<source-id>
- [ ] dbt run --select indicators__<source_id_with_underscores>
- [ ] dbt test --select indicators__<source_id_with_underscores>

## Sources / decisions
- Candidate entry: [`INVESTIGATE-new-norwegian-public-sources.md` [Q<N>]](../blob/main/website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md)
- Reports refreshed: [`INVESTIGATE-reports-and-indicators-from-catalogue.md`](../blob/main/website/docs/ai-developer/plans/backlog/INVESTIGATE-reports-and-indicators-from-catalogue.md)

🤖 Onboarded by Cursor Background Agent per [`AGENT-onboard-source.md`](../blob/main/website/docs/ai-developer/AGENT-onboard-source.md).
```

Do NOT request the user enable GitHub auto-merge on this PR. Do NOT comment-tag reviewers.

After opening the PR, **stop**. Your run is complete.

---

## Escalation — when to flag `needs-human`

Open the PR as a **draft**, add the `needs-human` label, comment on the PR with `Stuck: <one-paragraph reason>`, and stop. Trigger conditions:

- upstream API requires authentication, captcha, or returns HTML where JSON was expected;
- you've burned >2 retries on a typecheck error you cannot resolve;
- the candidate is a brand-new shape (no analogous template exists in [`atlas-data/ingest/src/sources/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/)) — do not invent scraper plumbing;
- `check-osmosis.sh` reports an issue you've tried to fix twice and still fails;
- the manifest.yml `eu_theme` derivation looks wrong and you can't find a defensible one in the [allowlist of 13 codes](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/sources/eu_data_theme.csv);
- any step 9c update would require you to invent an editorial decision (a new report, a new `dim_*`, a new methodology choice) — leave a note in the PR body explaining what you'd propose, and stop.

A draft PR with `needs-human` and a clear `Stuck:` note is a successful run. Burning compute thrashing on an unsolvable problem is a failed run.

---

## Hard rules (never break)

1. Never push to `main`. Always `feat/onboard-<source-id>`.
2. Never enable auto-merge on the PR.
3. Never run `npm run migrate`, `npm run ingest:*`, `dbt run`, or `dbt test`. The agent has no database.
4. Never edit a previously-merged migration file. Add a new one.
5. Never let an upstream column name leak into a `marts.*` model.
6. Never commit `.env`, `.env.local`, secrets, or anything in `.crawlee-cache/`.
7. Never edit [`docs/research/samfunnspuls/data-sources.md`](https://github.com/terchris/atlas/tree/main/docs/research/samfunnspuls/data-sources.md) — that's human-curated.
8. Never edit a previously-committed `manifest.yml` belonging to a different source. You only write the manifest for *your* candidate.
9. Never bypass `check-osmosis.sh` or the seed-builder validator. They exist to keep the catalogue clean.
10. Never invent a new `eu_theme` value. Pick one from the [13-code allowlist](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/sources/eu_data_theme.csv).
11. If you genuinely cannot determine an editorial decision (which dimension is degenerate, what the right `meaning:` is, which report this fills), leave a `# TODO: human-review` comment in the YAML and flag in the PR body. Do not guess.

---

## Cross-references

- [`contributors/adding-a-source.md`](../contributors/adding-a-source.md) — canonical 11-step workflow (humans).
- [`contributors/ingest-modules.md`](../contributors/ingest-modules.md) — per-source folder template.
- [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/README.md) — implemented-sources catalogue + manifest.yml schema.
- [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) — canonical vocabulary.
- [`plans/backlog/INVESTIGATE-cloud-agent-source-onboarding.md`](./plans/backlog/INVESTIGATE-cloud-agent-source-onboarding.md) — design rationale for this pipeline.
- [`plans/backlog/INVESTIGATE-new-norwegian-public-sources.md`](./plans/backlog/INVESTIGATE-new-norwegian-public-sources.md) — the work queue (26 candidates).
- [`plans/backlog/INVESTIGATE-reports-and-indicators-from-catalogue.md`](./plans/backlog/INVESTIGATE-reports-and-indicators-from-catalogue.md) — the report menu refreshed in step 9c.

---

## Example prompts

Named-candidate pilot:

```text
Onboard ssb-10826 to Atlas per
website/docs/ai-developer/AGENT-onboard-source.md. Read [Q48] in
INVESTIGATE-new-norwegian-public-sources.md, use ssb-07459 as the template,
open one PR, and stop.
```

Queue mode:

```text
Pick the first open GitHub issue labelled new-source in terchris/atlas.
Assign it to yourself. Read the issue body and the referenced candidate entry in
website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md.
Onboard exactly that one source per
website/docs/ai-developer/AGENT-onboard-source.md.
Open a PR with Closes #<issue-number>, then stop.
```
