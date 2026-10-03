"""
@asset wrappers for ingest sources that don't fit the SSB/FHI families.

See _factory.make_raw_ingest_asset. Currently:

- bufdir-barnefattigdom: zip download from Bufdir's child poverty surface.
- bufdir-barnevern: zip download from Bufdir's child welfare surface. Same
  delivery mechanism as the sibling above, different internal workbook shape
  — see atlas-data/ingest/src/sources/bufdir-barnevern/README.md.
- nav-uforetrygd: one xlsx download from NAV's PST302 uføretrygd monthly
  statistics page. Atlas's first monthly-polled source outside SSB/KLASS —
  see atlas-data/ingest/src/sources/nav-uforetrygd/README.md.
- nav-aap: one xlsx download from NAV's AAP155 arbeidsavklaringspenger
  monthly statistics page. Same mechanism as nav-uforetrygd (same NAV
  statistics section, same monthly_sources_refresh job) — see
  atlas-data/ingest/src/sources/nav-aap/README.md.
- nav-helt-ledige: one xlsx download from NAV's HL060 helt-ledige (fully
  unemployed) monthly statistics page. Same mechanism and job as nav-aap/
  nav-uforetrygd — see atlas-data/ingest/src/sources/nav-helt-ledige/README.md.
- imdi-bosetting: static HTML scrape of IMDi's bosettingstall hub + one page
  per discovered year. Annual data, polled weekly like the Bufdir sources —
  see atlas-data/ingest/src/sources/imdi-bosetting/README.md.
- udir-gsi: real JSON API (statistikkportalen.udir.no/api/rapportering —
  Udir's own public docs name a dead hostname for this). Annual data, polled
  weekly like the sources above — see
  atlas-data/ingest/src/sources/udir-gsi/README.md.
- udir-elevundersokelsen-mobbing: same API/client as udir-gsi, a genuinely
  different response shape (geography is a filter/column dimension here,
  not a row dimension — see that source's own README). Annual data, polled
  weekly like the sources above.

  ⚠️ **A real outlier in request count and wall time, not memory.** This
  report has no bulk-kommune query shape — building a full kommune-grain
  dataset costs one HTTP call per kommune-equivalent region node per grade
  (~702 calls for one run, confirmed live 2026-10-03, PLAN-015's own [Q1]),
  against every other source here making single digits of requests. Observed
  per-call latency varies wildly (tens of ms to ~5s, no clean pattern found)
  — total run time is measured in tens of minutes, not seconds. This does
  not change the weekly cadence or `ATLAS_MAX_CONCURRENT_INGESTS` (still one
  subprocess, same as every HTTP-based source above), but a weekly poll that
  looks "stuck" on this asset specifically for 20-40 minutes is this source
  behaving normally, not a hang — see its own README before treating that as
  an incident.
- udir-nasjonale-prover: same API/client as udir-gsi/udir-elevundersokelsen-mobbing,
  but this report's own shape matches udir-gsi's (EnhetID is the row
  hierarchy) — cheap, ~18 HTTP calls for one run, not an outlier like
  udir-elevundersokelsen-mobbing. See
  atlas-data/ingest/src/sources/udir-nasjonale-prover/README.md.
- udir-fravar: same API/client and shape as udir-gsi/udir-nasjonale-prover
  (EnhetID is the row hierarchy) — cheap, ~22 HTTP calls for one run
  (backfills all 11 available years, unlike udir-nasjonale-prover's
  latest-year-only). See atlas-data/ingest/src/sources/udir-fravar/README.md.
- husbanken-bostotte: Qlik Engine API (WebSocket JSON-RPC) against Husbanken's
  public "Statistikkbank" app — Atlas's first WebSocket-based ingest. Still
  one subprocess per run, same as every HTTP-based source above; the
  WebSocket session opens and closes entirely inside that one process. Annual
  data, polled weekly like the sources above — see
  atlas-data/ingest/src/sources/husbanken-bostotte/README.md.
- redcross-branches: Crawlee-based scraper of Red Cross chapter pages.
  Heavier resource profile (per UIS Dagster INVESTIGATE — headless browser
  state, ~512MiB working set).

  ⚠️ This used to say a per-asset `dagster-k8s/config` override was "future
  work, after the first materialisation in production reveals what's actually
  needed". The materialisations have happened (imac, urb-agents #1011) and they
  revealed that the override is the wrong instrument: the ingest run pod peaked
  at 590 MiB and 551 MiB, and that figure belongs to `ATLAS_MAX_CONCURRENT_INGESTS`
  — up to four ingests in their own subprocesses at once — rather than to any
  single asset. See the note on `_ingest_executor` in schedules.py.

  🔵 A per-asset override would still be the right tool for an asset that is an
  outlier ON ITS OWN. This one is not measured to be: `redcross-branches` is in
  UNSCHEDULED_SOURCES and did not run in any of those samples, so its ~512MiB is
  still an estimate from the investigation and not an observation.
"""

from atlas_data.assets._factory import make_raw_ingest_assets
from atlas_data import cadence

OTHER_SOURCES = [
    "bufdir-barnefattigdom",
    "bufdir-barnevern",
    "husbanken-bostotte",
    "imdi-bosetting",
    "nav-aap",
    "nav-helt-ledige",
    "nav-uforetrygd",
    "redcross-branches",
    "udir-elevundersokelsen-mobbing",
    "udir-fravar",
    "udir-gsi",
    "udir-nasjonale-prover",
]

# redcross-branches is absent from the scheduled list on purpose — it has no
# cadence and no freshness policy. See cadence.UNSCHEDULED_SOURCES for why.
assets = [
    *make_raw_ingest_assets(
        [
            "bufdir-barnefattigdom",
            "bufdir-barnevern",
            "husbanken-bostotte",
            "imdi-bosetting",
            "udir-elevundersokelsen-mobbing",
            "udir-fravar",
            "udir-gsi",
            "udir-nasjonale-prover",
        ],
        group_name="raw_other",
        automation_condition=cadence.weekly_polled(),
        freshness_policy=cadence.WEEKLY_FRESHNESS,
    ),
    # nav-uforetrygd, nav-aap and nav-helt-ledige republish monthly, not
    # weekly — polled to match.
    *make_raw_ingest_assets(
        ["nav-aap", "nav-helt-ledige", "nav-uforetrygd"],
        group_name="raw_other",
        automation_condition=cadence.monthly_polled(),
        freshness_policy=cadence.MONTHLY_FRESHNESS,
    ),
    # No condition, no freshness policy: redcross-branches is parked pending
    # its credential. It may not self-trigger and stays runnable by hand.
    # See cadence.UNSCHEDULED_SOURCES.
    *make_raw_ingest_assets(
        sorted(cadence.UNSCHEDULED_SOURCES),
        group_name="raw_other",
    ),
]
