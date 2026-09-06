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

## What is missing: there is no unit of installation

Installing Atlas today is **four manual steps across two different mechanisms**:

1. Create the database and owning role — no provisioning defined anywhere.
2. Create the secrets in the `dagster` namespace for `env_secrets` — UIS explicitly does not.
3. Register the code location in `.uis.extend/dagster-code-locations.yaml`, then `./uis deploy dagster`.
4. `./uis configure postgrest --app atlas …` then `./uis deploy postgrest --app atlas --url-prefix api-atlas`.

Steps 3 and 4 are **not the same kind of thing**. A Dagster code location is *declarative* — a file
the platform reads. PostgREST is *imperative* — a command that creates roles and a secret. There is
no `.uis.extend` entry for PostgREST, and nothing anywhere expresses *"these four belong to one
application"*.

That is the gap. Not the container, not the code.

## The question for the platform, which is tor-agent's to answer

Terje's framing is that Atlas should install *"just like a service"*. UIS has a service concept and
Atlas is not one — it is a tenant that consumes three services and needs objects created inside
them. So either:

- **A: Atlas becomes expressible in the existing mechanisms** — a `.uis.extend` declaration per
  surface plus documented prerequisites, with `./uis deploy atlas` as a thin orchestration over
  what already exists; or
- **B: UIS grows an `Application` type** — a first-class unit above services that owns a code
  location, a database, secrets and an exposure, installed and verified as one thing.

⚠️ **This is a platform architecture decision and it is not Atlas's to make.** tor-agent has already
drawn the relevant boundary: PostgREST being a second tenant surface *"does not generalise to
any-service-per-tenant. Two surfaces exist; a third would be new work, not configuration."* An
`Application` type is that new work.

**Do not design B into this repo before tor-agent has ruled on it.** Atlas's job is to state what it
needs created and why, precisely enough that either answer can be built against it.

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
