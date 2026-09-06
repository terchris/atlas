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

## The end state, stated so it can fail

> **Atlas is installed on the imac cluster, and its API answers from tecMacDev over the LAN.**

That is the acceptance test. The frontend will be built from tecMacDev against this API, so "it
works" means *from the other machine on the same network* — not from inside the cluster, which is
all any previous check has shown.

**Scope, deliberately narrow**: this is two machines on one LAN. No public domain, no DNS records,
no tunnel, nothing internet-facing. Traefik already routes `<prefix>.*`, and `api-atlas` is the
confirmed prefix, so the missing piece is only that a request from the other machine arrives at
imac's Traefik with a matching `Host` header.

⚠️ **Today this is unverified.** The route answers on the cluster host; nobody has issued a request
from tecMacDev and got rows back. Until someone has, the frontend has nothing to build against.

⚠️ **Do not put host addresses in this repository.** It is public. Name the machine, not its address
— see [SECURITY.md](../../SECURITY.md).

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
start without the Secret; dagster before postgrest, because `api_v1` does not exist until the
transform has run at least once.

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
