---
mdx:
  format: md
---

# INVESTIGATE: NLOD attribution across everything Atlas publishes

## Status

**Open — 2026-09-11.** Split out of
[INVESTIGATE-all-brreg-organisations](INVESTIGATE-all-brreg-organisations.md) at Terje's direction:
*"the NLOD marking goes for all data in atlas. write that as a separate thing that we need to handle.
so that we dont focus on that now."*

**Deliberately not being worked on.** This file exists so the obligation is recorded rather than
carried as a footnote inside a Brreg investigation, where it would have looked Brreg-specific and
would have been closed with it.

## The obligation

Atlas republishes Norwegian public-sector open data. Every upstream it uses is **NLOD**-licensed, and
NLOD requires attribution. That applies to **all of it** — SSB, FHI, Bufdir, Brønnøysundregistrene —
not to any one source.

## What already exists

The machinery is built and mostly used:

- every module under `ingest/src/sources/` declares `publisher`, `license`, `license_url` and
  `attribution` in its `manifest.yml`
- `api_v1.meta_sources` publishes `publisher`, `license`, `license_url`, `attribution` per source
- so a consumer *can* already retrieve the attribution for any source they query

## The gaps, as far as they are known

1. 🔴 **`seed-sources/brreg-enheter/` has no manifest.** Only `README.md` and `index.ts` — no
   `publisher`, no `license`, no `attribution`. Atlas serves Brreg-derived data today with nothing
   recorded. This is live at 122 rows and does not depend on any decision about scale.
2. **Other seed sources are unexamined.** `seed-sources/` holds nine modules; only `brreg-enheter` has
   been looked at. The rest may have the same gap.
3. **Derived data is unresolved.** `marts.*` and `api_v1.*` views combine several upstreams. Nothing
   currently says which attributions a given view inherits, and a consumer reading one endpoint has no
   way to know it is touching four licensors.

## Open questions — why this is an INVESTIGATE and not a PLAN

- **Where must attribution appear?** Per-source in `meta_sources` only, or also in the OpenAPI `info`
  block, the docs site, and HTTP responses?
- **How does it compose?** If `api_v1.indicator_summary` derives from SSB and FHI, is listing both
  sufficient, and where?
- **Does the frontend carry it?** `atlas-frontend` consumes the public API as a reference
  implementation — if attribution is an obligation on republication, the reference implementation
  should demonstrate discharging it.

## First step whenever this is picked up

Audit, before designing: for every source in `meta_sources`, does it declare a licence and an
attribution, and does any published surface show them. **The answer for `brreg-enheter` is already
known to be no**, which is one concrete thing to fix regardless of how the rest is answered.
