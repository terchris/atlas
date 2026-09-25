# For external developers building on Atlas

This section is for **anyone consuming Atlas's public PostgREST API** to build their own thing — frontends, CLIs, agent integrations, mobile apps, scripts. If you're contributing *to* Atlas itself (writing dbt models, adding ingest sources), see [`/contributors/`](../contributors/) instead.

> **Status: stub.** Real content (getting-started walkthrough, embedded API reference, versioning policy, examples) is being designed in [INVESTIGATE-developer-docs-surface.md](../ai-developer/plans/backlog/INVESTIGATE-developer-docs-surface.md). For now, the pointers below are the canonical entry points.

<!-- BEGIN holdings (generated) -->

**43 upstream sources** from **5 publishers**, served as **80 read-only relations**.

| publisher | sources | broadly |
|---|---|---|
| Folkehelseinstituttet | 21 | public health, and the Ungdata youth surveys |
| Statistisk sentralbyrå | 17 | population, income, families, housing, education, crime |
| Brønnøysundregistrene | 3 | the company and voluntary-organisation registers |
| Barne-, ungdoms- og familiedirektoratet | 1 | child poverty |
| Norges Røde Kors | 1 | local chapters and their activities |

By EU data theme: **SOCI** 20 (society) · **HEAL** 12 (health) · **GOVE** 5 (government) · **EDUC** 5 (education) · **JUST** 1 (justice).

Licences: **NLOD** for 42 of 43 — Norwegian public data, free to reuse with attribution. The exceptions are `redcross-branches` (permissive) — Red Cross's own data rather than the state's.

### What you can query

| relation | what it holds |
|---|---|
| `activity_catalog` | 🔵 EXPECTED EMPTY TODAY, AND THAT IS NOT A DEFECT. |
| `atlas_inventory` | What Atlas publishes, one row per queryable endpoint: how many records it serves, when its data last arrived, and where those rows came from. |
| `brreg_enhet` | Every organisation registered in Norway — the whole of Brønnøysundregistrene's Enhetsregisteret, around 1.17 million rows, current as of the last change-feed run. |
| `bufdir_indicator_alias` | Cross-release alias table for `bufdir-barnefattigdom` `indicator_api_id` renumbers. |
| `chapter_kommune_coverage` | Per-kommune rollup of which chapters cover it — Atlas's shape, built so coverage questions do not require walking branch addresses. |
| `coverage_gap_barnefattigdom` | One row per active kommune for the latest year of SSB 08764 child poverty data, combining the EUskala60 share (% of children in low-income households) with the Personer count (number of children). |
| `dim_activity` | Atlas's canonical activity dimension, each row pointing at a ref_atlas_service_category code. |
| `dim_chapter` | Atlas's canonical local-chapter dimension. |
| `dim_fylke` | The county dimension — the sibling of dim_kommune that was not published, so a consumer joining at fylke level was rebuilding this mapping, each slightly differently. |
| `dim_kommune` | The canonical municipality registry — SSB Klass 131, with fylke name joined. |
| `dim_postnummer` | Norwegian postal codes resolved to a primary kommune, 5 122 rows — the lookup that turns an address into a kommune_nr without the municipal-merger ambiguity that names carry. |
| `distrikt_summary` | 🔵 EXPECTED EMPTY TODAY, AND THAT IS NOT A DEFECT. |
| `fact_chapter_activities` | The analytical grain for chapter activity: one row per chapter × activity, joined to Atlas's dimensions so it reconciles with the rest of the supply layer. |
| `indicator_latest_values` | One row per (source_id, contents_code, kommune_nr) at each indicator's latest_year, restricted to active kommuner. |
| `indicator_missing_kommuner` | 🔴 A ROW HERE IS NOT EVIDENCE OF LOW NEED. |
| `indicator_summary` | One row per (source_id, contents_code) summarising the latest-year coverage and value range for every indicator in fact_kommune_indicators. |
| `indicators__bufdir_barnefattigdom` | Per-source indicator relation for `bufdir-barnefattigdom` (Barne-, ungdoms- og familiedirektoratet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_alkohol` | Per-source indicator relation for `fhi-alkohol` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_befolkning` | Per-source indicator relation for `fhi-befolkning` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_befolkningsvekst` | Per-source indicator relation for `fhi-befolkningsvekst` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_bor_alene` | Per-source indicator relation for `fhi-bor-alene` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_depresjon` | Per-source indicator relation for `fhi-depresjon` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_fortrolig_venn` | Per-source indicator relation for `fhi-fortrolig-venn` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_hasj` | Per-source indicator relation for `fhi-hasj` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_innvandrere` | Per-source indicator relation for `fhi-innvandrere` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_innvkat` | Per-source indicator relation for `fhi-innvkat` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_kpr_1aar` | Per-source indicator relation for `fhi-kpr-1aar` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_livskvalitet` | Per-source indicator relation for `fhi-livskvalitet` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_mediebruk_some` | Per-source indicator relation for `fhi-mediebruk-some` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_mediebruk_spill` | Per-source indicator relation for `fhi-mediebruk-spill` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_mediebruk_underhold` | Per-source indicator relation for `fhi-mediebruk-underhold` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_mobbing` | Per-source indicator relation for `fhi-mobbing` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_neet` | Per-source indicator relation for `fhi-neet` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_prognose` | Per-source indicator relation for `fhi-prognose` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_selvmord` | Per-source indicator relation for `fhi-selvmord` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_smertestillende` | Per-source indicator relation for `fhi-smertestillende` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_trangbodd` | Per-source indicator relation for `fhi-trangbodd` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__fhi_vgs_gjennomforing` | Per-source indicator relation for `fhi-vgs-gjennomforing` (Folkehelseinstituttet), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_06083` | Per-source indicator relation for `ssb-06083` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_06913` | Per-source indicator relation for `ssb-06913` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_06944` | Per-source indicator relation for `ssb-06944` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_06947` | Per-source indicator relation for `ssb-06947` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_07459` | Per-source indicator relation for `ssb-07459` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_08484` | Per-source indicator relation for `ssb-08484`, published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_08487` | Per-source indicator relation for `ssb-08487`, published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_08764` | Per-source indicator relation for `ssb-08764` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_09405` | Per-source indicator relation for `ssb-09405`, published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_09406` | Per-source indicator relation for `ssb-09406`, published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_09429` | Per-source indicator relation for `ssb-09429` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_10826` | Per-source indicator relation for `ssb-10826` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_12063` | Per-source indicator relation for `ssb-12063` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_12131` | Per-source indicator relation for `ssb-12131` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_12132` | Per-source indicator relation for `ssb-12132` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_12292` | Per-source indicator relation for `ssb-12292` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_12944` | Per-source indicator relation for `ssb-12944` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `indicators__ssb_13995` | Per-source indicator relation for `ssb-13995` (Statistisk sentralbyrå), published at the grain the publisher actually uses rather than flattened into the cross-source views. |
| `ingest_health` | Per-source ingest-run health. |
| `kommune_befolkning_alder` | Population by kommune, year and age band — the denominator layer. |
| `kommune_local_chapters` | 🔵 EXPECTED EMPTY TODAY, AND THAT IS NOT A DEFECT. |
| `kommune_ngo_summary` | Active voluntary organisations per kommune and ICNPO category — the number a consumer previously had to download the whole register to compute. |
| `kommune_ngo_totals` | One row per kommune: how many active voluntary organisations are registered there. |
| `meta_dimensions` | Per-source × per-dimension catalogue. |
| `meta_endpoints` | One row per queryable Atlas endpoint, with tags inherited from upstream sources via the lineage graph and a `layer:<schema>` tag from the schema. |
| `meta_sources` | Per-source catalogue row — one per ingest source in `_sources_manifest`, joined to `raw.ingest_runs` aggregates so consumers see freshness alongside the static metadata. |
| `ngo_index` | 🔴 WHAT THIS RELATION DELIBERATELY DOES NOT CARRY. |
| `ngo_overview` | One row per NGO in dim_ngo with the six count metrics shown on the per-NGO landing page (atlas-frontend /ngo/[slug]). |
| `ref_atlas_service_category` | ⚠️ ATLAS'S OWN VOCABULARY, NOT AN UPSTREAM STANDARD — the only list here that is Atlas's editorial judgement rather than another body's published standard. |
| `ref_brreg_icnpo` | ICNPO categories from Brreg's Frivillighetsregister: 14 main groups + 32 subgroups = 46 rows. |
| `ref_fhi_innvkat` | 🔴 ONE ROW — code '0', 'totalt' — and that is correct. |
| `ref_fhi_utdann` | FHI UTDANN (education-level) labels. |
| `ref_region_kind` | What kind of region a region_code denotes — the decoder for the `region_kind` column that several indicator relations already expose. |
| `ref_ssb_family_type` | SSB family-type codes. |
| `ref_ssb_household_type` | SSB household-type codes. |
| `ref_ssb_nivaa` | SSB NUS2000 education-level labels for table 09429. |
| `ref_un_sdg` | The 17 UN Sustainable Development Goals. |
| `source_freshness` | One row per raw source table that declares a `loaded_at_field`, saying whether it is inside the window its own declared cadence allows. |
| `supply__redcross_branch_activities` | What each Røde Kors branch does, one row per branch × activity. |
| `supply__redcross_branches` | Norges Røde Kors's own branch list — national office, districts and local chapters — typed out of the Red Cross Organizations API export. |
| `supply__redcross_chapter_kommune_coverage` | Which kommuner each Røde Kors chapter covers, resolved from the branch's postal address through dim_postnummer. |
| `unattributed_totals` | The part of a published quantity that belongs to no municipality. |

Every relation, with its columns and their descriptions:

```bash
curl -s $ATLAS/meta_endpoints        # what is queryable
curl -s $ATLAS/meta_sources          # every upstream, with freshness
curl -s $ATLAS/indicator_summary     # every published series
```

:::warning `downstream_model_count` says a source has a model, not that you can reach it

A source can have `downstream_model_count > 0` and still produce nothing you can query — the model exists and feeds no published relation. `fhi-innvandrere` is in that state today: one model, 32 720 rows ingested, absent from `indicator_summary` and from every `api_v1` relation.

**The measure that answers "can I use it" is whether the source appears in `indicator_summary`, or whether some `api_v1` relation carries it.** Subtracting those from `meta_sources` gives what Atlas holds and does not yet serve.

:::

⚠️ Those three are the live answer. The numbers above are regenerated on release; coverage, row counts and freshness change between releases and are only true in the catalogue.

<!-- END holdings (generated) -->

## Open by default

Atlas's posture: **anything not explicitly gated is queryable**. The public PostgREST API exposes three schemas, all anonymous-read:

| Schema | What's in it | When you'd query it |
|---|---|---|
| `api_v1` | Curated wrapper views — the production-stable contract surface | When you want guaranteed-stable column shapes for a published product |
| `marts` | Every dbt-built mart (dim, fact, indicator, supply, ref) | When you want the working dataset that hasn't been frozen into an `api_v1` view yet |
| `raw` | Verbatim ingest landings — every row Atlas pulled from upstream | When you want full provenance or are debugging a transformation |

Private schemas (`private_marts`, `private_raw`) carry personal data and stay outside the schema list — `atlas_web_anon` has no grants on them; PostgREST returns 404 even with explicit `Accept-Profile: private_marts`.

### Reaching non-default schemas

PostgREST routes header-less requests to the **first** schema in `--schemas`, which Atlas configures as `api_v1`. To reach `marts.*` or `raw.*`, send `Accept-Profile: <schema>` per request:

```bash
# Default (api_v1) — header omitted
curl -s "$ATLAS/distrikt_summary?limit=2"

# marts schema — explicit Accept-Profile
curl -s -H 'Accept-Profile: marts' "$ATLAS/dim_kommune?limit=2"

# raw schema — same pattern
curl -s -H 'Accept-Profile: raw' "$ATLAS/ssb_08764?limit=2&region_code=eq.0301"
```

Naive `curl /dim_kommune` (without the header) returns 404 because PostgREST resolves it as `api_v1.dim_kommune` which doesn't exist. That's correct routing, not a misconfiguration.

### Catalog as a queryable endpoint

The catalog itself is exposed as a queryable endpoint — no separate scraping or hand-rolled discovery needed:

```bash
# Every endpoint Atlas serves, with provider/topic/geo/cadence/eu_theme/layer tags
curl -s "$ATLAS/meta_endpoints" | jq '.[0]'

# Every upstream Atlas ingests, with freshness signals
curl -s "$ATLAS/meta_sources?provider=eq.ssb" | jq '.[0]'

# Per-source × per-upstream-dimension editorial pass-through
curl -s "$ATLAS/meta_dimensions?source_id=eq.ssb-08764"
```

These are the same endpoints the customer frontend at <https://atlas.helpers.no/data> reads — your app gets the same introspection surface for free.

### Tag-filter URL pattern (for the human catalog)

The customer app at `atlas.helpers.no/data` is fully URL-driven. External developers can deep-link to filtered views:

| URL | What it shows |
|---|---|
| `/data` | Every endpoint, no filter |
| `/data?tag=topic:income` | Every income-related endpoint |
| `/data?tag=topic:income&tag=geo:kommune` | AND across namespaces — income AND kommune-level |
| `/data?tag=topic:income&tag=topic:education` | OR within a namespace — income OR education |
| `/data?tag=provider:ssb&tag=cadence:annual` | SSB tables published annually |
| `/data?tag=layer:api_v1` | Only the curated public-API surface |
| `/data?q=oslo` | Free-text search across endpoint names + tags |

Same logic at the catalog-data layer — the URL params translate to filter passes against `meta_endpoints.tags`. Useful if you want to embed a "show me Atlas data about my topic" link in your own product.

## Where to start today

### 1. Read the API spec directly

PostgREST self-describes. The full schema (every endpoint, every column type, every description) is at the API root:

```bash
curl https://api-atlas.helpers.no/             # Swagger 2.0 spec — human and machine readable
curl http://api-atlas.localhost/               # local dev (UIS rancher-desktop)
```

Pretty-print it with `jq`:

```bash
curl -s http://api-atlas.localhost/ | jq '.paths | keys[]'                    # list every endpoint
curl -s http://api-atlas.localhost/ | jq '.definitions.indicator_summary'     # one view's columns + descriptions
```

Per-endpoint row counts without fetching the data:

```bash
curl -sI -H "Prefer: count=exact" http://api-atlas.localhost/indicator_summary?limit=0 | grep -i content-range
# → Content-Range: */163
```

:::danger Use `count=exact`, not `count=estimated`

`count=estimated` is accurate on most endpoints and badly wrong on a few, and
**you cannot tell which from the API.** Every `api_v1` relation is a view, so
"is it a view?" does not distinguish them.

**Two relations are wildly over.** `kommune_ngo_summary` and `kommune_ngo_totals`
are views that `GROUP BY`, so the planner has to guess how many groups the query
will produce. Measured 2026-09-20:

| endpoint | exact | estimated | |
|---|---|---|---|
| `kommune_ngo_summary` | 5,435 | 69,462 | 12.8× |
| `kommune_ngo_totals` | 357 | 6,946 | 19.5× |

Every other endpoint reads from a pre-built table, so its rows were counted when
it was built and the estimate is accurate — including heavily aggregated ones
like `indicator_summary`, because that aggregating happened before the planner
saw it.

**Separately, `estimated = 1` does not mean one row.** It is the planner's floor,
so an **empty** relation reports 1. Three endpoints currently hold zero rows and
all three report `estimated = 1` — so "is there any data here?" asked cheaply
answers yes when the answer is no.

The largest published relation here is ~72,000 rows and an exact count is cheap,
so the estimate saves nothing worth being wrong about.

:::

:::warning The spec advertises `post`, `patch` and `delete`. They do not work, and this will not change.

15 of 17 relations list write methods in the OpenAPI document. **Every one of
them is refused by the database** — the anonymous role is granted `SELECT` and
nothing else, so a write returns `401 / 42501 permission denied`.

**The API is read-only.** The grant is one statement, in
`atlas-data/dbt/api_v1_generated.sql`, and it says `GRANT SELECT`.

**Why the document says otherwise.** PostgREST advertises write methods for any
view Postgres considers *auto-updatable*, independently of who may actually
write it. The only two relations that do **not** advertise writes —
`kommune_ngo_summary` and `kommune_ngo_totals` — are the only two that
`GROUP BY`, which is what makes a view non-auto-updatable. It is the same
structural line that decides whether `count=estimated` is accurate.

This is a property of PostgREST v14.10, not a misconfiguration, and it is not
going to be fixed here. **Treat the method list as a claim about the document,
not about the database.** If you generate a client from the spec, delete the
write methods.

:::

### No row cap — and how to tell if that ever changes

PostgREST can be configured with `db-max-rows`, which silently truncates a
response to N rows. **Atlas does not set it.** Measured against the live API:

```
GET /brreg_enhet?limit=100000   ->  206, 100,000 rows of 1,174,770
GET /brreg_enhet?limit=200000   ->  206, 200,000 rows
```

⚠️ **That is a measurement of behaviour, not a reading of configuration.**
PostgREST exposes no endpoint that reports its effective settings, so "unset"
and "set above 200,000" are indistinguishable from outside. Nobody can hand you
the value — including us.

**So do not trust it, detect it.** Send `Prefer: count=exact` and compare the
total in `Content-Range` against the rows you actually received:

```bash
curl -sD- -H "Prefer: count=exact" "$ATLAS/brreg_enhet?limit=200000" -o body.json \
  | grep -i content-range
# Content-Range: 0-199999/1174770   <- you got 200,000 of 1,174,770
```

`Content-Range` is exposed cross-origin (`access-control-expose-headers`), so
this works from a browser app as well as from curl. A cap can only ever be
discovered by exceeding it and noticing the discrepancy — that check is the
right pattern, not a workaround, and it keeps working whatever the cap is.

If Atlas ever does set `db-max-rows`, it will be treated as a **contract
change** and announced, even though nothing in the schema moves.

### Request-size ceiling

Long `or=()` filters run into a **48 KiB URL limit**, binary-searched against the
live API:

```
48.91 KiB  → 200
49.89 KiB  → 400 Bad Request     (3 runs each side, no flapping)
~78 KiB+   → connection refused before any HTTP response
```

Consistent with a 49,152-byte buffer. For scale: a 44-series `or=()` filter is
about 1,000 characters, so there is roughly 48× headroom. Past the ceiling,
split the request or filter server-side with `in.()`.

⚠️ Not attributable from outside whether the limit is the CDN's, a proxy's or
PostgREST's, so treat 48 KiB as observed behaviour rather than a guaranteed
contract.

### 2. Fork the customer app as a starting template

[`atlas-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-frontend) is Atlas's public-facing Next.js app, deployed at `atlas.helpers.no`. It's also positioned as a **forkable reference implementation** — clone the folder, change `NEXT_PUBLIC_API_URL`, and you have a working starting point for your own UI on Atlas's API. Its README has the fork-me walkthrough.

The customer app demonstrates the patterns this docs surface will eventually formalise: typed fetch helpers (`src/lib/api.ts` — note the `acceptProfile` option for non-default schemas), OpenAPI codegen for types (`src/lib/api-types.ts`), a tag-filtered catalog page driven by `meta_endpoints` (`app/data/page.tsx`), per-endpoint table viewer with multi-schema dispatch (`app/data/[schema]/[table]/page.tsx`), and the no-DB-driver / no-`postgres.js` discipline.

## What's coming

Per [INVESTIGATE-developer-docs-surface.md](../ai-developer/plans/backlog/INVESTIGATE-developer-docs-surface.md), the planned full content for this section:

- **Getting started** — first `curl` walkthrough with real responses.
- **API reference** — embedded Swagger UI live-pointed at `api-atlas.helpers.no/`.
- **Concepts** — canonical conventions (`kommune_nr`, `fylke_nr`, `orgnr`) framed for API consumers.
- **Forking the customer app** — full guide; the `atlas-frontend/README.md` becomes a teaser pointing here.
- **Versioning** — the `api_v1` ↔ `api_v2` deprecation policy.
- **Changelog** — version-bump and breaking-change record.
- **Agent integration** — wiring the API into LLM agents / MCP servers.

The follow-on PLAN-006 ships these. Until it does, this index page + the customer app's README + the live spec are the entry points.

## See also

- [`atlas-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-frontend) — the canonical fork-me reference implementation.
- [`api-atlas.helpers.no/`](https://api-atlas.helpers.no/) — the live API + spec.
- [`/contributors/`](../contributors/) — internal docs for people contributing to Atlas itself.
- [PLAN-004-postgrest-api-v1-wrapper.md](../ai-developer/plans/completed/PLAN-004-postgrest-api-v1-wrapper.md) — how the `api_v1` schema is generated and validated. Useful background if you want to understand the contract guarantees.
