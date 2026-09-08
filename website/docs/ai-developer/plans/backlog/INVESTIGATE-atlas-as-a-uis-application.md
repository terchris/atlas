# INVESTIGATE: Install Atlas on UIS the way a service is installed

## Status: Backlog

**Question**: What has to exist — in UIS and in this repo — for someone to install Atlas on a UIS
cluster with a single command, using the Dagster, PostgreSQL and PostgREST that UIS already ships
and the configuration system UIS already has?

**Last Updated**: 2026-09-06

**Priority**: 🔴 **Tier 0.** It is the shape the product is aimed at, and it now has a dated,
external consumer — see the end state.

**Origin**: Terje, 2026-09-06: *"my goal is that we can install atlas on uis just like we install a
service. atlas must use the dagster and postgres services that are in UIS and set these up. it must
use the config system that we already have in UIS."*

---

## ✅ The end state, ACHIEVED 2026-09-07

> **Atlas is installed on the imac cluster, and its API answers from tecMacDev.**

Measured from tecMacDev, the machine the frontend will be built on:

```
GET  /                              HTTP 200   PostgREST 14.10 OpenAPI, 82,746 b
GET  /indicator_summary?limit=2     HTTP 200   real rows —
       fhi-bor-alene · RATE · latest_year 2025 · 357 kommuner · upstream_updated 2026-09-06
POST /indicator_summary             HTTP 401   Postgres 42501, permission denied
```

**Atlas data, over the network, from another machine.** That had never been done before this date.
Any hostname beginning `api-atlas.` reaches it — the route matches `HostRegexp(api-atlas\..+)` — so a
single hosts-file line on the client is all a browser needs. **Use `http` on port 80**: 443 is bound
but the IngressRoute carries no TLS section and returns 404 for this host.

**The read-only contract holds across the network.** The `401` is Postgres `42501`, the database
refusing — not the ingress. Crossing a network weakens nothing.

### 🔴 It breaks on every reboot of the host, silently

`application.autoStart: false`, `startInBackground: false`, and Rancher Desktop is a GUI app that
needs a display. **When that machine restarts, nothing serves the API until someone starts it by
hand** — about 90 seconds, with Traefik needing one restart to go Ready.

⚠️ **There is no error when this happens.** The host still answers ping; nothing serves HTTP. That
signature is *identical* to a loopback-only binding, and this investigation misdiagnosed it as
exactly that on 2026-09-06 — concluding "no hosts entry can fix this" when the binding had always
been on all interfaces and the cluster was simply down. **Establish the thing is running before
explaining how it behaves.**

Whether that host should auto-start its cluster is a human decision. It is the difference between
an API a frontend can rely on and one that disappears without notice.

**Answered 2026-09-07 by the UIS maintainer, and it is smaller than it looks:**

- **All cluster state survives a host reboot** — Deployments, Services, IngressRoutes, Secrets and
  the Postgres roles are persisted. When the cluster comes back the kubelet restarts the pods and
  the API answers again. **Nothing needs re-deploying and no declaration needs re-applying.**
- **Only the cluster process does not survive.**
- ⚠️ **UIS's "autostart" is not a boot mechanism.** `.uis.extend/enabled-services.conf` controls
  *which services `./uis deploy` deploys when run with no arguments*. It is a list for a manual
  command. **Nothing in UIS runs at boot**, and the name misleads.
- So the fix is **neither `uis deploy` at boot nor GitOps** — it is making the cluster start with
  the host. Rancher Desktop is installed at OS level, deliberately outside UIS's control, so this
  is one autostart setting or k3s under systemd. **Installation implementation, five minutes, not
  platform work** — it does not queue behind any platform decision.

🔴 **GitOps cannot fix this, and it would be a wrong premise to carry.** ArgoCD is itself a pod in
the cluster it reconciles. If the cluster is down, ArgoCD is down with it and nothing reconciles
anything. **This is the one problem GitOps structurally cannot solve.** Recorded because the
opposite was suggested — by this agent, in passing — and a throwaway line is exactly how a wrong
premise enters an investigation and gets built on.

⚠️ **Do not put host addresses in this repository.** It is public. Name the machine, not its
address — see [SECURITY.md](../../SECURITY.md).

## What is already true, so nobody re-solves it

| | state |
|---|---|
| Container image | ✅ built and published by CI, immutable tags, running on two clusters |
| Ingest + transform | ✅ 41 sources, declarative cadence, dbt → `marts` → `api_v1` |
| Query surface | ✅ **the platform's own PostgREST** — multi-instance by design, Atlas is the worked example in its docs |
| Read-only contract | ✅ proven by attempted writes: DELETE/PATCH/POST → 401, Postgres `42501` |
| Route | ✅ Traefik `IngressRoute`, `HostRegexp(api-atlas\..+)`, verified answering |
| Freshness signal | ✅ shipped and proven red-on-stale |

**Atlas already uses UIS's services rather than bringing its own.** That question was settled on
2026-09-05: an application that declares its own PostgREST is fighting the platform. Nothing here
should reopen it.

## ✅ Ruled 2026-09-06 by the UIS maintainer: **option A**, and my gap description was wrong

**B — a UIS `Application` type — is not new work awaiting a decision. It is deferred work with a
written reason.** UIS's own `ANALYSIS-nais-uis.md` ranks it **#13 of 13** adoptable ideas from NAIS,
effort L, marked *"New investigation — and it should be explicitly deferred"*, with the note that it
is *"the most seductive, and also the one most likely to produce a half-built abstraction"*. Its
stated preconditions — per-workload named secrets, default-deny NetworkPolicy, OTEL
auto-instrumentation — have not landed. Being the first real tenant is an argument for A now, not
for jumping that queue.

### My "four steps across two mechanisms" was wrong on three of the four

Corrected against the UIS source, and this makes A much smaller than this file first claimed:

| step | what I claimed | what is true |
|---|---|---|
| database + owning role | *"nothing defines this"* | ❌ wrong — `configure-postgresql.sh` creates a per-app database and role, grants it, and applies migrations from stdin with rollback |
| secrets | *"UIS explicitly does not"* | ❌ wrong — `configure.sh` takes `--namespace` and `--secret-name-prefix`; UIS writes the Secret idempotently. It is the mechanism `env_secrets` consumes |
| code location | declarative, hand-edited | ✅ correct, and **the only genuinely undefined step** — nothing writes `dagster-code-locations.yaml` |
| PostgREST | imperative | ✅ correct, and already app-shaped (`--app`, multi-instance since it shipped) |

**The real gap: three commands already exist, one file is hand-edited, and nothing names the four as
one application.**

### The sub-question answered itself, and it argues against B

I asked whether an `Application` type would *remove* the declarative/imperative split or merely
*wrap* it, and said only removal survives. The maintainer reframed it as **where the state lives**:
the code location is installation configuration and contains nothing secret, so it can live in a
file; the PostgREST app config contains a generated password that UIS deliberately does not store.
An `Application` could never move the second into a file without breaking that rule — so it could
only ever wrap. **By my own test, B fails.**

### Resolved without a change: the database URL

The maintainer flagged that UIS injects the secret key as `DATABASE_URL`, not `ATLAS_DATABASE_URL`,
and offered a `--secret-key` flag if Atlas needed the prefixed name. **It does not.**

```python
database_url = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get("DATABASE_URL")
```

The ingest reads `DATABASE_URL` directly. **Both halves already accept what UIS supplies** — no flag,
no shim. Only the comment in UIS's own `.default` template is wrong, and that is being fixed there.

⚠️ **The Secret is named `<prefix>-db`, not `<prefix>`.** `--secret-name-prefix atlas-database`
produces `atlas-database-db`. An `env_secrets:` entry that does not match exactly leaves the pod
starting **silently without the variable** — a failure with no error, which is this project's
recurring shape.

## The declaration Atlas wants — a requirements statement, not an implementation

The mechanism is `uis template install`, which already implements a unit above a service:
`template-info.yaml` with `install_type: stack`, a `provides:` list of services each with optional
`config:`, and `params:` substitution. This is what Atlas would need it to express.

```yaml
install_type: stack
params:
  app_name: atlas

provides:
  - service: postgresql
    config:
      database: "{{ params.app_name }}"
      namespace: dagster
      secret_name_prefix: "{{ params.app_name }}-database"
      init: migrations/          # raw.* schema, applied with rollback on failure

  - service: dagster
    config:
      code_location:
        name: "{{ params.app_name }}-data"
        image: ghcr.io/terchris/atlas-data
        tag: <immutable, never :latest>
        module: atlas_data.definitions
        why: "Atlas ingest and dbt transforms; without it marts.* and api_v1 stop refreshing"
        env_secrets: ["{{ params.app_name }}-database-db"]   # note the -db suffix

  - service: postgrest
    config:
      app: "{{ params.app_name }}"
      schemas: api_v1            # ⚠️ pending: PLAN-007 shipped api_v1,marts,raw
      url_prefix: api-atlas
```

**Ordering is not incidental**: postgresql before dagster, because the code-location pod will not
start without the Secret. ~~dagster before postgrest, because `api_v1` does not exist until the
transform has run at least once.~~ **Corrected 2026-09-08 (urb-agents #323):** the second clause was
wrong twice over. `uis deploy dagster` only *registers* a code location — it runs nothing, so no
ordering makes a transform happen at install. And `api_v1` is now created empty by
[`migrations/050`](../../../../../atlas-data/migrations/050_create_api_v1_schema.sql), so the schema
exists before PostgREST is configured. **Required order is postgresql first, then dagster and
postgrest in either order** — which the existing priorities already satisfy.

### `schemas:` — the mechanics, so the decision is made with them in hand

- `configure-postgrest.sh` emits, **per schema**: `GRANT USAGE ON SCHEMA`, `GRANT SELECT ON ALL
  TABLES`, and `ALTER DEFAULT PRIVILEGES … GRANT SELECT ON TABLES` to the anon role. The last is why
  newly-created views become readable without a re-grant.
- ⚠️ **…but only if UIS runs that statement as the role that later creates the views.**
  `ALTER DEFAULT PRIVILEGES` without `FOR ROLE` records an entry keyed to `current_user`
  (`pg_default_acl.defaclrole`), and it applies *only* to objects that role goes on to create.
  Verified on Postgres 15.18, 2026-09-08: grants emitted as the admin role, view then created by
  the app role → `has_table_privilege(anon, view, 'SELECT')` = **`f`**. Emitted as the app role, or
  as admin with `FOR ROLE <app>` → `t`. Which role UIS connects as lives in its
  `lib/pg-connection.sh` and is **not visible from this repo** — raised with tor-agent on
  urb-agents #323. If it is the admin role, the empty-schema install still yields a permanently
  empty API and the auto-grant never fires.
- The list is stored on the per-app secret as `PGRST_DB_SCHEMAS` and read by the Deployment via
  `secretKeyRef`. **`deploy` does not accept `--schemas`** — one source of truth, deliberately.
- Widening is therefore `./uis configure postgrest --app atlas --schemas api_v1,marts,raw`, then a
  pod restart to pick up the changed secret. **A re-configure, not a flag.**
- ✅ **Widening needs no further migration.** `raw` and `marts` are both created by
  [`migrations/001`](../../../../../atlas-data/migrations/001_create_schemas.sql), so all three
  schemas in the widened list already exist at install time. (The migrations README used to say the
  scope was "raw landing tables only", which is what suggested otherwise; corrected.)

⚠️ **The forward-looking consequence, which is the part that matters for the decision.** Those
default-privileges grants cut both ways: with `marts` and `raw` exposed, the anon role can read
**everything in them, including tables added later** — no future review, no per-table opt-in. That
is what makes this a posture rather than a configuration value, and why three schemas is *Atlas's*
answer rather than a default any tenant should copy.

### 🔴 What the declaration found, 2026-09-07 — two blockers, both the platform's

Writing it down as a requirements statement surfaced two defects in an afternoon that designing
against an imagined tenant would not have.

> ✅ **TPL-F8 no longer blocks Atlas (2026-09-08, urb-agents #323).** tor-agent retracted the
> diagnosis below: ordering was the symptom, not the cause, and reordering would have failed one
> step later. The fix is one line in Atlas's own migrations —
> [`050_create_api_v1_schema.sql`](../../../../../atlas-data/migrations/050_create_api_v1_schema.sql)
> creates `api_v1` empty so `configure postgrest` finds it. TPL-F8 remains a **latent platform
> defect** for a future application with a genuine cross-surface dependency, but it is off Atlas's
> critical path. The analysis is kept below as written, because the retraction is the useful part.

**TPL-F8 — the install order is impossible today.** UIS service priorities are
`postgresql 30 → postgrest 50 → dagster 56`. Atlas needs `postgresql → dagster → postgrest`, so
**the last two are inverted**. And it is a hard failure rather than an inefficiency:
`configure-postgrest.sh` refuses a schema that does not exist —

> *"Schema '<s>' does not exist in database '<db>'. Create it first (typically via the consuming
> app's migration), then retry"*

— and `api_v1` does not exist until a transform has run once. So `uis template install atlas` would
deploy PostgreSQL, **fail** on PostgREST, and never reach Dagster. **The first real application
cannot be installed in priority order at all.**

⚠️ **The declaration is not to be restructured around this.** Service priority is *platform boot
order*, a global property; bending it for one tenant would satisfy Atlas and mis-state the platform.
What is needed is ordering *within* a declaration. Promoted upstream to
`PLAN-templates-000-install-ordering` because it changes what `config:` must mean.

**TPL-F7 — `init:` takes one file, not a directory.** `template.sh` resolves `init` to a single
file and `cat`s it; Atlas's `migrations/` is 49 numbered DDL files and fails outright. Whatever
fixes it must preserve **apply order** — a partial apply is exactly what `configure-postgresql`'s
rollback exists to undo. **Keep `migrations/` in the declaration**: it states the requirement
correctly, and the defect is the platform's.

### Two things the declaration settled

- ✅ **No `--secret-key` will be built.** Atlas reads `DATABASE_URL` with a fallback, so the
  hardcoded key is accepted. An option removed by a fact rather than a preference.
- ✅ **Writing `atlas-database-db` out literally was right** — templating it would have hidden the
  suffix whose mismatch starts a pod silently without the variable.

### Verify vs monitor: the first-install paradox dissolves

I argued the tenant half must be able to fail a verify, then found that on a **first install it
legitimately fails** because no ingest has run. Both true — and together they are the tell that the
assertion is in the wrong place.

**"The install worked" and "data is flowing" are different claims and should not be one command.**
A verify that reds on a correct install teaches people to ignore it, which is the same failure as an
install that looks healthy with zero rows, pointed the other way.

So the provisional answer is that **freshness is a monitor, not a verify** — and UIS has that
convention in flight (`.uis.extend/monitors.yaml`). A monitor red between install and first ingest
is *correct and visible*; a verify red there is a bug. **Nothing about the freshness check changes** —
only which command asserts it. Deliberately not settled yet, to avoid becoming the third consumer of
an undecided convention.

### What this declaration cannot yet express

- **A code-location entry.** Nothing writes `dagster-code-locations.yaml`; it is hand-edited by
  design, and its `.default` template already carries Atlas as the worked example.
- **`--app` on a deploy call**, which multi-instance PostgREST needs.
- **Whether an application may ship its own template from its own repository** — the difference
  between UIS carrying a template per tenant and a tenant carrying its own.

### Verify: two halves, no third

`./uis verify atlas` should **not** exist. The boundary is **the platform verifies the pipe, the
tenant verifies the data**:

- `./uis verify postgrest --app atlas` already proves the whole path using a probe row it owns —
  so it cannot be fooled by an empty Atlas nor corrupt a full one.
- The **ingest freshness check** proves the data is arriving, and is already shipped and proven
  red-then-green.

A template's verify step should **call both** rather than invent a third. That closes the failure
this project keeps meeting — a code location LOADED, an API answering, and zero rows.

## Questions to resolve

1. **A or B** — and if B, is `Application` a UIS concept or a convention over existing files?
2. **Who provisions the database and role?** Today nobody. A stranger has no hand to use.
3. **Where do secrets come from?** `env_secrets` names secrets that must already exist; UIS does not
   create them. Something must, without putting a credential in a repo.
4. **Does the declarative/imperative split get fixed or wrapped?** An `Application` type that hides
   the difference is not the same as one that removes it, and only one of those survives contact
   with the third surface.
5. 🔴 **What makes the API answer from the other machine on the LAN?** Traefik matches on the
   `Host` header and routes `<prefix>.*`, so the question is only how a request from tecMacDev
   reaches imac's Traefik with a matching host — a hosts entry, a LAN-resolvable name, or an
   explicit `Host` header against imac's address. **This is the acceptance test and it has never
   been done for Atlas.** It is also the smallest of the open questions, and it is the one with a
   person waiting on it.
6. **What does `./uis verify atlas` assert?** A service verify has meaning; an application's should
   too — probably that the code location is LOADED, the API answers, and the data is fresh.
7. **What is the minimum viable install?** Probably not 41 sources. A stranger evaluating this wants
   something that works in minutes.
8. **What happens to `atlas-private-data-repo`?** `frr` reads a private tree absent on any public
   deployment. A stranger's install must not fail for a source they cannot have.

## Falsifications

- **The install is not one command** — if it still takes four steps in a documented order, nothing
  has been solved, only written down.
- **It works only on the machine running the cluster.** A request issued on tecMacDev must return
  Atlas rows. `localhost` under any name does not satisfy this, and neither does a tunnel nobody
  has to run — the LAN path either works unattended or it does not.
- **A second installation is impossible or collides.** Multi-instance is the platform's design; an
  Atlas that can only exist once has hardcoded something.
- ⚠️ **The install reports success while the data is empty.** The freshness check exists precisely
  because green signals over stale data are this project's recurring failure. A verify that passes
  on an install that ingested nothing is not a verify.

## Related

- [INVESTIGATE-atlas-data-as-deployable-application](INVESTIGATE-atlas-data-as-deployable-application.md)
  — the predecessor. Its design question is settled (use the platform's services); this one is about
  the missing unit of installation and the cross-machine requirement it did not have.
