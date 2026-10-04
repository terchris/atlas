# Detecting that a lokallag changed something

Scrape Monday, scrape Friday, know that something moved — without storing what it was
before. Implemented in `ingest/src/sources/nks-chapters.ts` (originally Python, `code/extract_nks.py`) and tested against the live site
22 September 2026.

---

## 1. The design, given the constraint

"We don't need to know the previous values, just that there is a change" is the right
constraint and it simplifies everything. No history tables, no slowly-changing dimensions,
no diffing stored snapshots. Just:

> **one content hash per block, plus `changedAt` and `changeCount`**

The hash lives in `freshness.blocks.<block>` — the same per-block structure as
`data-freshness.md`, so freshness and change detection share one mechanism rather than two.

```json
"activities": {
  "volatility": "VOLATILE",
  "contentHash": "a3f2c81e9b4d7602",
  "firstSeenAt": "2026-09-21",
  "changedAt": "2026-09-25",
  "changeCount": 3,
  "isParseSuspect": false
}
```

Only the **current** hash is kept. `changedAt` answers "when did it last move",
`changeCount` answers "how often does this chapter churn" — and neither requires the old
value.

**Listing all changes** is then `data/<slug>/change-log.csv`, appended on every `npm run nks` (no change-log is currently on disk; the sample below is from the 22 Sep test run):

```
changedAt   chapterId                                   chapterName                block
2026-09-22  sanitetskvinnene:aalesund-sanitetsforening  Aalesund Sanitetsforening  activities
2026-09-22  sanitetskvinnene:egge-sanitetsforening      Egge Sanitetsforening      communication
2026-09-22  sanitetskvinnene:bjoa-sanitetsforening      Bjoa Sanitetsforening      location
```

---

## 2. The two decisions that make it work

### Hash the extracted values, never the page

Hashing the HTML gives a change on every cookie banner, CSRF token, rotated image URL,
build id or "printed on" footer — effectively a 100% false-positive rate. The hash is taken
over the **parsed, normalised** values only.

Normalisation before hashing:

| Step | Why |
|---|---|
| collapse whitespace, trim | reflowed markup is not a change |
| lowercase | case differences on a re-render are not a change |
| **sort arrays** | the order activities appear on a page is **not semantic** |
| sort object keys | serialisation order is not a change |
| exclude `fetchedAt` and friends | otherwise every run differs by construction |

### Hash per block, not per record

Five blocks on a chapter: `identity`, `location`, `contacts`, `activities`,
`communication`. A phone-number edit must not report as "activities changed" — and
activities are what the brief is actually about.

It also lets volatility differ per block: `activities` is `volatile`, `contacts` is
`annual`, `identity` is `structural`.

---

## 3. Tested against the live site

### False positives: none

Two consecutive real runs, nothing changed upstream:

```
RUN 1  12/12 parsed — no baseline yet
RUN 2  12/12 parsed — no changes vs previous run (12 chapters compared)

change_summary: { branches_changed: 0, blocks_changed: 0, share_changed: 0.0 }
```

**Zero false positives.** This is the whole test that matters — a change detector that
cries wolf is worse than none, because the change list stops being read.

### True positives: exact

Three edits planted in the stored baseline, then a real re-scrape:

| Simulated edit | Detected block |
|---|---|
| Aalesund — one activity removed | `activities` ✅ |
| Bjoa — different address | `location` ✅ |
| Egge — different Facebook URL | `communication` ✅ |

**3 changes, 3 chapters, correct block every time, nothing else flagged.**

---

## 4. 🔴 The two failure modes that would do real damage

Both are guarded, because both would quietly corrupt the dataset rather than error.

### A parser that breaks looks like a chapter deleting everything

If a selector stops matching, extraction yields zero activities — indistinguishable from a
chapter genuinely removing them. Blanking real data on a parser regression is the worst
outcome here.

**Guard:** a block that changes *and* is now empty is stamped `isParseSuspect: true` and
reported as suspect, never as a removal.

### A site redesign looks like every chapter changing at once

**Guard:** if more than **30%** of chapters change in one run, the run is refused
entirely — `run_suspect: true`, **exit code 2, output file not overwritten**, so the
baseline survives for inspection. `--force` overrides once a human has confirmed it is
genuine.

Verified:

```
RUN 4 (all 12 baselines poisoned)
  REFUSING TO WRITE: 100% of chapters changed in one run (12/12).
  That is a site change or a broken parser, not real churn.
  Inspect, then re-run with --force if it is genuine.
  exit 2 — file NOT overwritten

with --force: exit 0
```

This matters more than the detection itself. Norwegian NGO sites get redesigned; when
sanitetskvinnene.no next moves to a new template, this is what stops 552 bogus "changes"
landing in the log and the real activity data being overwritten with nothing.

---

## 5. Operational notes

- **Cadence.** Weekly is enough for `activities` and `communication`; `identity` and
  `location` change on registry timescales and are effectively free to carry along.
- **The baseline is the output file.** No separate state store — the previous
  `chapters.json` *is* the comparison baseline, which keeps the data self-describing and
  means a restored backup restores the baseline with it.
- **`changeCount` is a churn signal.** A chapter that edits its page monthly is
  maintaining it; one that has never changed since `firstSeenAt` may be abandoned. That
  bears directly on `volunteer-demand.md` — high churn is weak evidence a listing is live,
  and it is the only such signal available without asking anyone.
- **Hashes are truncated to 16 hex chars.** Collision risk is negligible at this scale and
  it keeps the JSON readable.

---

## 6. Open

- Should `added` vs `removed` be distinguished? It is achievable without storing values by
  keeping a per-item hash set instead of one block hash — slightly more storage, and it
  would let the log say *"Aalesund added Lesevenn"* rather than *"activities changed"*.
  **Cheap and probably worth it — your call.**
- The 30% batch threshold is a proposal, not a measured figure. It needs one real site
  redesign to calibrate.
- The same mechanism should be applied to `brreg-chapters.ts` (formerly `match_chapters.py`), so registry-side changes
  (a chapter dissolving, a name change) also produce log rows. Currently only the N.K.S.
  crawler has it.
