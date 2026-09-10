---
title: Installing Atlas on UIS
sidebar_position: 2
---

# Installing Atlas on UIS

Atlas installs as one UIS application: a PostgreSQL database, a Dagster code location that runs the
pipelines, and a PostgREST API over the curated `api_v1` views.

This guide is written for someone doing it for the first time. **It tells you what will look broken
and is not** — that section has cost more time than every real defect combined.

:::info Two things to know before you start

**Installing starts nothing.** The schedules ship stopped. No data is fetched and no external service
is contacted until you turn them on. That is a deliberate go-live decision.

**Loading the data and going live currently need GraphQL.** UIS has no `uis dagster run` verb yet, so
steps 3 and 4 below are copy-paste mutations rather than commands. The requests for those verbs are
filed; until they land, this guide gives you the exact calls.
:::

## Step 0 — see the plan without installing anything

```sh
uis template install atlas --dry-run
```

This pulls the definition and installs nothing. **Run it first.** (From UIS 1.6.52 `template list`
and `template info` point you at it too.) The plan it prints is exactly what
will happen:

```
1. uis deploy postgresql
2. uis configure postgresql --app atlas --database atlas --namespace dagster
                            --secret-name-prefix atlas-database --init-file -
3. uis configure postgrest --app atlas --database atlas --schemas api_v1 --url-prefix api-atlas
4. uis deploy postgrest --app atlas
5. uis deploy dagster
6. (write code location 'atlas-data' to .uis.extend/dagster-code-locations.yaml)
7. uis deploy dagster          # again, so the overlay picks it up
```

`uis template info atlas` prints what the application does once installed — cadence, volume, and the
external services it contacts.

### Before you install

- **Do not run `uis pull`, `uis stop` or `uis restart` while anything else is running.** All three
  stop the container that `uis template install` runs inside. Mid-install that leaves a database
  created, some services deployed, and nothing recording which — no UIS command repairs it.

  **From UIS 1.6.52 the tool refuses for you**, naming the command it found running, and tells you to
  wait. If you are certain it is safe, `UIS_FORCE=1 ./uis pull` overrides. On anything older there is
  no guard and the warning above is the whole protection.
- **`uis pull --check` before `uis pull`.** The version advertised as available is not always the
  version that installs; trust the installed version, not the advertised one.

## Step 1 — install

```sh
uis template install atlas
```

Expect roughly `ok=31 changed=4 failed=0`, three pods in the `dagster` namespace, two in `postgrest`,
one database, one role, two secrets and one IngressRoute.

The database is named **`atlas`**. (An install made without `--database` gets `atlas_db` instead —
if you are looking at an older install, that is why the name differs.)

## Step 2 — expect an empty API

Immediately after install the API answers and serves **zero endpoints**. `meta_sources`,
`meta_endpoints` and `meta_dimensions` return **404**.

**That is correct, not a failed install.** The schema and grants exist from install; the data arrives
on the first pipeline run, which you start next.

## Step 3 — load the data

Four jobs, **in this order**:

```
annual_sources_refresh  →  klass_refresh  →  seed_sources_refresh  →  transform_and_publish
```

:::warning The order is not arbitrary — run them serially

**`seed_sources_refresh` contains `raw/_migrations`**, and it runs third. The migrations are
idempotent, so applying them after two source jobs have already written is safe — but it is not what
anyone would design, and reordering these has not been tested. Run them in the order above, one at a
time, waiting for each to succeed.
:::

Takes about 11 minutes and loads roughly 2.9M rows.

### Running a job

Until `uis dagster run` exists, launch each job with a GraphQL mutation against the Dagster instance:

```graphql
mutation {
  launchPipelineExecution(executionParams: {
    selector: {
      repositoryLocationName: "atlas-data",
      repositoryName: "__repository__",
      jobName: "annual_sources_refresh"
    },
    mode: "default"
  }) {
    __typename
    ... on LaunchRunSuccess { run { runId } }
    ... on PythonError { message }
  }
}
```

Change `jobName` for each of the four. Poll `runOrError(runId:)` until the status is `SUCCESS` before
starting the next one.

The Dagster UI can do the same through a browser, but it is internal-only with no authentication, so
reaching it is a decision about your own cluster rather than something this guide can prescribe.

## Step 4 — go live

Enabling the schedules is what makes Atlas keep itself current. Until you do, it holds whatever you
loaded in step 3.

:::warning Enabling the schedules does not backfill

Every automation condition is `on_cron`, which means **next fire**, not catch-up. Enabling them on a
Thursday means the first automatic raw refresh is Sunday 02:00. That is why step 3 exists.
:::

`uis dagster automation` reports and asserts state but **cannot set it** — use `startSchedule` and
`startSensor` mutations. Note the return types differ: `startSchedule` returns `ScheduleStateResult`,
`startSensor` returns `Sensor`. Using the wrong one gives a bare HTTP 400.

Once enabled, Atlas polls on this cadence (Europe/Oslo):

| when | what |
|---|---|
| Sunday 02:00 | ~37 annual public-sector sources — SSB, FHI, Bufdir |
| 1st of month, 01:00 | SSB Klass classifications |
| Daily 05:00 | dbt transform and publish — no external calls |

## Step 5 — verify

```sql
-- structure
raw tables 47 · marts tables 64 · api_v1 views 13

-- the assertion to lead with
select count(*) from raw.brreg_enheter;   -- 122
```

**If `brreg_enheter` is 0, `seed_sources_refresh` did not run.** 122 is a fixed reference list, so it
is the one number worth remembering — everything else depends on upstream volumes.

For the rest, **assert properties rather than remembered totals**:

> Every raw source that declares `loaded_at` has loaded, except `redcross_branches` and
> `redcross_branch_activities`, which are parked pending a credential.

API checks:

```
GET /                  -> 200, 14 OpenAPI paths (13 views + `/`)
GET /meta_sources      -> 200
GET /meta_endpoints    -> 200
GET /meta_dimensions   -> 200
```

And:

```sh
uis dagster verify                        # A/B/C PASS, code location LOADED
uis dagster automation --expect running   # verify alone passes whether or not schedules are on
```

## Things that look like failure and are not

This section exists because every item in it has produced a wrong conclusion by someone experienced.

### `transform_checks` looks hung. It is slow.

The launch call may not return for **over 45 seconds**, and the run sits at `NOT_STARTED` for more
than a minute before succeeding in about 105 s.

All 647 dbt checks execute inside **one op**, so the two probes anyone reaches for — reading the
definition and building the execution plan — both return "1 op, 1 step" in a fraction of a second and
**cannot see the weight**. Two experienced testers concluded "hung" on different clusters, sixteen
days apart. Both were wrong.

**Judge it by polling the run, never by whether the launch call returns.** Anything that alerts on it
must poll the run, or it will report a false failure every night.

### 17 dbt checks do not pass, on a correct install

`transform_checks` succeeds while reporting **17 non-passing checks out of 647**. All 17 are
`relationships` tests from indicator models to `dim_kommune` / `dim_fylke`.

**They are configured `severity: warn` deliberately.** Historical SSB series carry kommune and fylke
codes retired in the 2020 reorganisation; the dimensions carry current Klass codes. The model schema
says so in place: *"Historical fylker (pre-2020 01-20 numbering) may appear — warn."*

They surface as non-passing asset checks in Dagster because a dbt warning is not a pass. **A run that
succeeds with exactly these 17 is a correct install.** The underlying question — whether Atlas covers
pseudo-regions or merely represents them — is open and tracked in
`INVESTIGATE-ssb-pseudo-regions`.

### `meta_endpoints` has 91 rows against 13 views

Not 78 phantom endpoints. The ratio has been 7 × views on every install measured. **Watch the ratio,
not the number** — a changed ratio is the signal.

### Row estimates read zero on a populated database

`pg_stat_user_tables.n_live_tup` is a **planner estimate** and can read 0 for every table while the
schema holds hundreds of megabytes. **Pair every estimate with one `count(*)`.**

### `kubectl get ingress` shows nothing

The route is a Traefik **IngressRoute CRD**. `kubectl get ingress` returns an empty result rather than
an error. Use `kubectl get ingressroute -n postgrest`.

### A path-prefixed URL returns a Traefik 404

The route matches on **hostname**, not a path prefix. `api-atlas.<your-domain>` must resolve to the
ingress. Reaching it from your own machine is a DNS or hosts-file question about your setup, not
something the install can do for you.

## Removing and reinstalling

**`uis template remove atlas` works for installs made by `uis template install`** — it reads the
record that install writes. An application put in place before the template path existed has no such
record and `remove` exits 1.

:::danger Do not hand-write a record to unlock removal
Per-app names derive from that record. A hand-written one that disagrees with reality can point a
removal at the wrong live application.
:::

**No UIS command drops a database, at any version.** `--purge` drops per-app roles and secrets; the
`atlas` and `dagster` databases survive every removal, so a reinstall lands on the existing schema.
Dropping is manual DDL and the order matters:

```sql
DROP DATABASE atlas;   -- or atlas_db on an older install
DROP ROLE atlas;       -- blocked until the database is gone
DROP DATABASE dagster;
```

Leave `atlas_web_anon` and `atlas_authenticator` — `configure postgrest` re-credentials them. Leave
the `dagster` role.

Use `uis undeploy dagster` rather than `helm uninstall`; the playbook waits for pods to terminate and
tells you what it preserves.

If you delete the `dagster` namespace, run `uis secrets generate && uis secrets apply` before
reinstalling — the Dagster setup reads a generated password from a secret in that namespace, and it
fails loudly with that instruction if it is missing. You are not expected to know that password.

## Known gaps

| gap | status |
|---|---|
| No `uis dagster run <job>` — loading data needs GraphQL | in `PLAN-cli-load-and-report-on-application-data`; both verbs are new CLI surface and wait on a decision, not on implementation |
| No `uis dagster automation --start` — going live needs GraphQL | as above |
| Job order is documented, not enforced | see step 3 |
| `transform_checks` start latency | tracked in `INVESTIGATE-transform-job-decomposition` |
