# Investigate: Parquet + DuckDB-WASM as the analytical surface

Whether Atlas should publish its large tables as Parquet snapshots that consumers query in the browser with DuckDB-WASM, instead of serving every analytical query from PostgREST.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide whether a published-file analytical surface (Parquet + client-side DuckDB) should sit beside PostgREST, and if so what it contains, where it is hosted, and how it is produced.

**Last Updated**: 2026-09-23

**Related**: [INVESTIGATE-all-brreg-organisations](INVESTIGATE-all-brreg-organisations.md) (the 1.17M-row decision that makes this urgent) · [INVESTIGATE-developer-docs-surface](INVESTIGATE-developer-docs-surface.md) · [PLAN-008-developer-discovery-surface](PLAN-008-developer-discovery-surface.md) · [INVESTIGATE-public-api-surface](../completed/INVESTIGATE-public-api-surface.md) (resolved **[Q9] cache: none in v1** and **[Q11] rate limiting: none in v1** — this investigation is the trigger those deferrals were waiting for)

---

## Provenance of the numbers in this file

⚠️ **Read this before citing anything below.** Everything in "Current state" was **measured by
tecMacDev on 2026-09-23**, from outside, against the live `api-atlas.urbalurba.com`, which is
served from **imac (test)**, not from asgard. Figures will differ on asgard against Odin pg.

🔵 **This also corrects a standing claim in [1PRIORITY.md](1PRIORITY.md)**: "The public API
hostnames also do not resolve from this machine, so the data cannot be probed from outside either"
(recorded 2026-09-05). That is **no longer true** — `api-atlas.urbalurba.com` resolves and answers
from tecMacDev today. The fleet-wide "no one can observe asgard" constraint still stands for
*asgard*; it does not stand for this hostname.

**Not measured, and deliberately not attempted**: whether a write verb actually succeeds against
the public API (see [Q14]). The origin *advertises* `POST,PATCH,DELETE`; that was read from
`OPTIONS`, not exercised.

---

## Questions to Answer

1. **[Q1]** Should Atlas publish a file-based analytical surface at all, or keep every query on PostgREST and solve the load problem purely with caching and limits?
2. **[Q2]** Which file format — Parquet, newline-delimited JSON, CSV, or SQLite/DuckDB database files?
3. **[Q3]** Which tables get published, and at what granularity (whole table, per-kommune shards, per-year partitions)?
4. **[Q4]** Does the `doc` JSONB column ship in the published files, in the live API, in both, or in neither?
5. **[Q5]** Where are the files hosted — Cloudflare R2, GitHub Pages (where the Docusaurus site already goes), or the cluster behind the existing tunnel?
6. **[Q6]** How are files produced and scheduled — a Dagster asset at the end of the dbt run, a separate job, or on demand?
7. **[Q7]** How are they versioned and cached — date-stamped immutable filenames plus a manifest, or a stable `latest` URL?
8. **[Q8]** Is DuckDB-WASM healthy enough to build a public developer story on?
9. **[Q9]** What is the contract? Are published files a supported interface with the same stability promise as `api_v1`, or explicitly best-effort?
10. **[Q10]** Does Atlas ship a worked-examples gallery against this surface, and does the Atlas frontend itself dogfood it?

---

## Current state

### What the API does today, measured

`api_v1` is PostgREST over `marts.*`, anonymous read, no cache, no row cap, no statement timeout.
21 paths. The largest table is `brreg_enhet` at **1,174,337 rows**.

**Latency by query shape** (median of 3, from tecMacDev, 2026-09-23):

| Query shape | Single request | 3 concurrent |
|---|---|---|
| Point lookup / `eq` filter | 0.08–0.15 s | no degradation — it is an index lookup |
| `navn=ilike.*hjelp*` | 0.7–1.1 s | collapses (figures on urb-agents #1438) |
| `order=navn.desc&limit=10` | 5.2–7.0 s | not attempted |

🔴 **Concurrent unindexed scans saturate the origin well below any normal load level**, and the
recovery afterwards was clean — this is saturation, not damage. ⚠️ **The concurrency figures are
deliberately not in this public file**; they are on urb-agents #1438. A precise saturation
threshold against a live public endpoint, published next to the note that the mitigation is not
yet applied, is a recipe and not a finding.

### Why it is that shape

⚠️ **An earlier version of this section said there are no indexes on `marts.*`. That is wrong, and
the correction changes what needs building.** It was based on `grep -rn "CREATE INDEX"` returning
two hits on private `raw` tables. That grep was **case-sensitive and looked only for literal
SQL**, and it could not see either of the two ways this repo actually creates indexes:

```
grep -rn  "CREATE INDEX"   *.sql   ->  2 hits
grep -rni "create index"   *.sql   ->  5 hits   (three were lowercase)
grep -rn  "indexes=["      models/ -> 10 models  (dbt declarative config — no SQL to find)
```

`dim_brreg_enhet` — the table behind the slow queries — carries **seven** indexes: six declared
through dbt's `indexes=` config, plus a partial `dim_brreg_enhet_voluntary_active_idx` created in a
`post_hook` in lowercase. The model file documents them at length, with before/after measurements
from 2026-09-13 (`max(last_oppdateringsid)` 6,063 ms → 1.4 ms).

**What is actually true:** indexes exist and work. There is simply **no index on `navn`**, which is
the column both slow shapes use.

Measured from tecMacDev, 2026-09-23, sequentially — both queries below return **zero rows**, so
payload size is not the variable and the index is the only difference:

| Query | Time |
|---|---|
| `organisasjonsnummer=eq.000000000` (indexed, matches nothing) | **0.32 s** |
| `navn=ilike.*zzqxjw*` (unindexed, matches nothing, no early exit) | **8.96 s** |

🔴 **This disproves the "every query is a full scan" reading directly.** A sequential scan of this
relation costs ~6–9 s on this host; 0.32 s is not a warm-cache version of that, it is a different
plan. The fast point lookups are *real index lookups*, not misleading ones.

⚠️ **And `limit` hides the problem.** `navn=ilike.*hjelp*&limit=10` returns in 0.10 s because a
scan can stop once it has ten matches. The same predicate matching nothing takes 8.96 s. A
benchmark that only uses common search terms will not see this.

🔵 **So the remedy stands but the work is smaller and the design question is already answered.**
What is needed is an index on `navn` — a btree for `order=navn.*` and prefix matches, a `pg_trgm`
GIN for `ilike.*…*` — added the same way the existing seven were, in the model's `indexes=` config
and `post_hook`. [Q11] asked *where* index definitions should live; the repo already answers it,
with a worked precedent in the same file.

### The edge is doing nothing

Cloudflare zone `urbalurba.com`, free plan, read from the dashboard on 2026-09-23:

- **Cache Rules: none.** Overview reports `Percent Cached 0.01%` — **14 kB cached of 108 MB served**
  in 24 h across 5.38k requests. Every one of those reached imac.
- PostgREST emits no `Cache-Control`, no `ETag`, no `Last-Modified`, so nothing caches by default
  and conditional requests cannot help either.
- Brotli **is** applied by Cloudflare (`content-encoding: br`), so wire size is already compressed.
- Exactly one rule exists on the whole zone: a Response Header Transform named "CORS for api services".

### The `doc` column dominates the payload

`api_v1.brreg_enhet` has 21 columns. The 21st, `doc`, is the full raw upstream JSON document per row.

Measured on a real 5,000-row sample:

| | 5,000 rows | Projected to 1,174,337 rows |
|---|---|---|
| JSON from the API, **with** `doc` | 10.0 MB | **2.30 GB** |
| JSON from the API, **without** `doc` | 3.0 MB | 0.68 GB |

⚠️ **Correction, 2026-09-23: `doc` is ~2.3× the rest, not ~6.5×, and dropping it makes responses
~3.3× lighter, not ~7×.** The sample above is sound — an independent 2,000-row sample from the live
API gives 4.14 MB with `doc` and 1.26 MB without, projecting to 2.43 GB / 0.74 GB against the 2.30
GB / 0.68 GB above. Only the ratio sentence was wrong: 10.0 / 3.0 is 3.3, and `doc` at **69.6% of
payload** is 2.3× the other twenty columns combined. The decision does not change — this is still
the cheapest single change available — but it should be decided on 3.3×.

🔴 **`doc` is 69.6% of the response**, and it *duplicates already-flattened
columns* — `doc.navn` is `navn`, `doc.organisasjonsnummer` is `organisasjonsnummer`. In the
Parquet column breakdown, `doc.aktivitet` alone is 23.2% of the file and
`doc.vedtektsfestetFormaal` a further 11.2%.

---

## What Parquet actually buys, measured

Converted the same real 5,000-row sample with DuckDB 1.5.5 and projected:

| Variant | Codec | Full-table size | vs JSON |
|---|---|---|---|
| with `doc` | zstd | 151 MB | 15.6× |
| with `doc` | snappy | 232 MB | 10.2× |
| **without `doc`** | **zstd** | **22 MB** | **30.2×** |
| without `doc` | snappy | 34 MB | 20.5× |

✅ **The entire Norwegian business register is 22 MB as zstd Parquet.** That is a single
edge-cacheable object.

### Query timings

Against a full-size (1,175,000-row) Parquet on an M1 laptop:

| Query | DuckDB | Same query on imac/PostgREST |
|---|---|---|
| `ORDER BY navn DESC LIMIT 10` | **9 ms** | 5.2–7.0 s |
| `ILIKE '%hjelp%'` count | **73 ms** | 0.9 s single; collapses concurrently |
| `GROUP BY kommune_nr` | **5 ms** | not attempted |
| `count(*)` | **1 ms** | not attempted |
| filter + group by `naeringskode1_kode` | **4 ms** | not attempted |

⚠️ **Caveat on that table**: the 1,175,000-row file was built by replicating the real 5,000-row
sample 235× with randomised `navn` and `organisasjonsnummer`. Cardinality is therefore *roughly*
right but the data repeats, so **the size of that synthetic file is not citable** — the 22 MB
figure from the real sample is the honest one. The **timings** are the point, and they are
order-of-magnitude robust: the sort is ~600× faster and does not degrade with concurrent users,
because each user runs their own engine on their own machine.

### Column pruning is the mechanism, not full download

Parquet is columnar with a footer index, and DuckDB issues HTTP **Range** requests for only the
column chunks a query touches. Real per-column sizes from the no-`doc` sample, projected to the
full table (22 MB total):

| Column | Full-table MB | % of file |
|---|---|---|
| `navn` | 12.12 | 55.2% |
| `organisasjonsnummer` | 3.40 | 15.5% |
| `naeringskode1_kode` | 1.47 | 6.7% |
| `kommune_nr` | 1.38 | 6.3% |
| `last_seen_at` | 0.99 | 4.5% |
| `registrert_dato` | 0.66 | 3.0% |

So a choropleth coloured by municipality reads **1.38 MB**; "active orgs by sector" reads
**1.53 MB**; only free-text search over `navn` pays the 12 MB. Cloudflare caches range requests,
so the second visitor costs the origin nothing.

---

## [Q8] Is DuckDB-WASM healthy? — verified 2026-09-23

Checked against the npm registry and GitHub API rather than from memory, per PLANS.md.

| Signal | DuckDB core | `@duckdb/duckdb-wasm` |
|---|---|---|
| Latest release | **v1.5.5**, 2026-07-22 | `1.33.1-dev57.0`, 2026-06-22 (`next`: `1.33.1-dev64.0`, 2026-07-28) |
| Repo last pushed | **2026-09-23** (today) | 2026-07-28 |
| Stars | 41,667 | 2,127 |
| Licence | MIT | MIT |
| Downloads/month | — | **1,726,863** |
| Commits in last 90 days | — | **8** |
| Archived | no | no |

✅ **Adoption is not in doubt** — 1.73M downloads a month, MIT, five years of releases (449
versions since 2021-10-06), and it tracks core (last commits bump it to v1.5.5).

⚠️ **Two caveats worth recording honestly.** First, the npm `latest` dist-tag is a **`-dev`
prerelease** and always has been — after 449 versions there is still no stable semver release on
`latest`. Second, **8 commits in 90 days** and no push since 2026-07-28. For a thin binding layer
that tracks a core project this is defensible, but it is not the cadence of core, and it means
Atlas would be pinning a prerelease tag in public documentation. **[Q8] should be answered
explicitly rather than assumed**, and the decision recorded.

---

## Options

### Option A — do nothing new; fix PostgREST and the edge only

Cache Rule at the edge, `db-max-rows`, `statement_timeout`, indexes on the hot columns.

**Pros:**
- Smallest change; no new artefact, no new hosting, no new contract to maintain.
- Fixes the collapse mode outright — a statement timeout converts the pile-up into fast failures.
- Caching alone removes most of the 108 MB/day from the origin.

**Cons:**
- Does not make analytical queries *possible*, only survivable. `ORDER BY navn` stays a 5 s query; it just fails faster when contended.
- Cross-table joins remain inexpressible in PostgREST regardless of how fast the origin gets.
- A playground where the interesting queries are the forbidden ones is not a playground.

### Option B — publish Parquet snapshots; consumers query client-side (DuckDB-WASM)

**Pros:**
- Origin load for analytical use goes to **zero**; the export is one scheduled sequential scan per day at a time Atlas chooses, replacing unbounded scans from the public at times it does not.
- Gives consumers strictly *more* power than the API: joins across `brreg_enhet`, `indicator_latest_values` and `dim_kommune` in one query.
- 22 MB for the largest table; range requests mean most queries move 1–2 MB.
- Scales to every consumer at once — there is no shared server to contend for.
- Serves AI-assisted development well: an agent can be handed a URL and a schema and generate working code without touching the origin.

**Cons:**
- A second surface to document, version and keep honest against `api_v1`.
- Freshness is the last export (daily), not live.
- First load costs a few MB of WASM; wrong for a page that must paint immediately.
- Mobile browsers have less memory; fine at 22 MB, not fine at 151 MB.
- The multi-threaded bundle needs COOP/COEP headers; the single-threaded one works anywhere and is slower.
- Depends on a prerelease npm tag — see [Q8].

### Option C — publish files, but as SQLite/DuckDB database files rather than Parquet

**Pros:**
- Single file carries indexes and multiple tables; `sql.js`/DuckDB can open it directly.
- Better for point lookups than Parquet.

**Cons:**
- Larger than columnar Parquet for analytical scans, and no column pruning over HTTP.
- Parquet is the format the wider open-data ecosystem already reads (pandas, Polars, R/arrow, BigQuery, Observable); a `.duckdb` file is portable to far fewer tools.
- ⚠️ DuckDB's own on-disk format has not historically guaranteed cross-version stability the way Parquet does. Publishing one as a public contract inherits that.

### Option D — serve Parquet, but query it server-side

Keep the single query endpoint; swap Postgres for DuckDB reading Parquet on the origin.

**Pros:**
- Consumers keep one HTTP interface; no client bundle.
- Much faster than the current PostgREST path.

**Cons:**
- Puts the load back on imac. Faster per query, but still one shared machine and still contended.
- A new query service to build, secure and rate-limit — exactly the surface [Q11] deferred.

---

## Recommendation

**[Q1] Yes — Option B, but strictly *beside* Option A, not instead of it.**

The two answer different questions and the sequencing matters:

- **Option A is not optional.** Whatever else happens, `statement_timeout` and `db-max-rows` must land — they remove a collapse mode that anyone can trigger from a browser address bar today. Do these first; they are two configuration lines.
- **Option B is what makes Atlas a playground** rather than a fragile read-only API. It moves the entire analytical class of work off the origin permanently.

PostgREST stays the right tool for point lookups, small views, aggregates and freshness. Parquet
takes the scans, sorts, aggregates and joins. Neither replaces the other, and the docs must say
which is for what — otherwise consumers will pick wrongly and blame whichever they picked.

### Proposed answers to the remaining questions

- **[Q2] Parquet, zstd.** 30× over JSON, universally readable, column pruning over HTTP.
- **[Q3]** Start with `brreg_enhet` alone — it is the only table where this is *needed* (the next largest, `indicator_latest_values`, is 83,895 rows). Whole table, no sharding; 22 MB does not justify partitions. Revisit if `underenheter` (862,903 rows, see [INVESTIGATE-all-brreg-organisations](INVESTIGATE-all-brreg-organisations.md)) lands.
- **[Q4] Exclude `doc` from the published Parquet, and propose excluding it from the default API response too.** 🔵 **This is the cheapest single performance change available to Atlas and is independent of everything else in this file** — it makes the live API ~7× lighter per row today, with no new infrastructure. It should probably be its own PLAN regardless of what happens to the rest of this investigation.
- **[Q5] Cloudflare R2.** Same account as the existing zone, free egress, 10 GB free tier (the whole Atlas corpus fits many times over), custom domain, and Range support. GitHub Pages is the fallback and is where the Docusaurus site already goes, but its bandwidth terms are not written for dataset hosting.
- **[Q6]** A Dagster asset downstream of the dbt run. DuckDB reads Postgres directly, so the export is one statement — no intermediate dump.
- **[Q7]** Date-stamped immutable filenames (`brreg_enhet-2026-09-23.parquet`) plus a small `latest.json` manifest. Immutable files can be cached forever; the manifest is the only thing that needs a short TTL. This avoids purge logic entirely.
- **[Q9]** Best-effort in v1, stated plainly in the docs, with the intent to promote to a supported contract once a real external consumer depends on it. Do not promise stability before anyone needs it.
- **[Q10]** Yes — and the examples gallery is the actual deliverable for developers, not the files. A Parquet URL with no worked example is not a playground.

### Sketch of the export

```sql
ATTACH 'postgres://…' AS pg (TYPE POSTGRES, READ_ONLY);
COPY (SELECT * EXCLUDE (doc) FROM pg.api_v1.brreg_enhet)
  TO 'brreg_enhet-2026-09-23.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
```

### Sketch of the consumer side

```js
import * as duckdb from '@duckdb/duckdb-wasm';

const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
const db = new duckdb.AsyncDuckDB(
  new duckdb.ConsoleLogger(),
  await duckdb.createWorker(bundle.mainWorker)
);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
const conn = await db.connect();

await conn.query(`
  SELECT kommune_nr, count(*) AS orgs
  FROM 'https://data.atlas.urbalurba.com/brreg_enhet-2026-09-23.parquet'
  WHERE is_active AND NOT konkurs
  GROUP BY 1 ORDER BY orgs DESC
`);
```

---

## Open questions

1. **[Q11]** Which hostname does the file surface live on, and does it belong to the same Cloudflare zone? `data.atlas.urbalurba.com` is a guess in this file, not a decision.
2. **[Q12]** Does the Atlas Next.js frontend dogfood the Parquet surface, or stay on `api_v1`? The dogfood argument from [INVESTIGATE-public-api-surface](../completed/INVESTIGATE-public-api-surface.md) says the surface consumers use should be the one Atlas uses — but that argument was made about one surface, and there are now two.
3. **[Q13]** Is the published-file surface in scope for the NLOD attribution work ([INVESTIGATE-nlod-attribution](INVESTIGATE-nlod-attribution.md))? A Parquet file has nowhere obvious to carry an attribution string. Parquet key-value metadata is the candidate; nobody reads it by default.
4. **[Q14]** 🔴 **A security question about the anon role's grants, found while measuring this and more urgent than anything in this file.** ⚠️ **The details are deliberately not in this public repo** — they are on urb-agents #1438. It is unverified, it concerns a live public endpoint, and an unverified write-exposure hypothesis published with its mechanism is an invitation rather than a report. It must be settled with `\du` and `\dp` on the host, not by probing the API. **No write was attempted and none should be.**
5. **[Q15]** Does the public API stay pointed at imac? `PLAN-atlas-asgard-001` puts production on asgard against Odin pg, and imac's charter is explicitly a place to try things *without* touching production. Today `api-atlas.urbalurba.com` is imac. Worth deciding rather than inheriting.
6. **[Q16]** The OpenAPI document PostgREST serves at `/` is **312 kB**. For AI-assisted consumers that is a context window spent before a line is written. Does Atlas publish a compact schema summary (`llms.txt` or similar) beside it? Overlaps [PLAN-008-developer-discovery-surface](PLAN-008-developer-discovery-surface.md) — check there before opening anything new.

---

## Next Steps

- [ ] Terje answers [Q1], [Q4], [Q5], [Q8] — the four that change what gets built.
- [ ] Resolve [Q14] before anything else here; it is a security question wearing a performance question's clothes. Details on urb-agents #1438, not in this repo.
- [ ] Create `PLAN-nnn-api-hardening.md` — Option A, independent of this investigation's outcome: `db-max-rows`, `statement_timeout` on the anon role, indexes on `navn` and the sort columns, `db-pool` cap. Smallest change with the largest effect on the collapse mode.
- [ ] Create `PLAN-nnn-drop-doc-from-api-response.md` — [Q4]'s independent half. ~7× lighter responses, no new infrastructure.
- [ ] Create `PLAN-nnn-parquet-export-asset.md` — the Dagster asset, R2 bucket, manifest and cache headers.
- [ ] Create `PLAN-nnn-duckdb-wasm-examples.md` — the worked-examples gallery, and the decision on [Q12].
- [ ] Update [1PRIORITY.md](1PRIORITY.md) when the first child PLAN is drafted.
