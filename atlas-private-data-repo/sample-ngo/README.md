# sample-ngo — synthetic onboarding data

A fictitious NGO used to:

- Show new contributors the data layout each NGO uses without exposing real
  member or operational data.
- Exercise every code path in the FRR ingest, dbt staging, and validation
  scripts (committed to the public repo, runs in CI eventually).
- Give the dbt models data to materialize against in clean dev environments
  where no real NGO data has been ingested yet.

The orgnr `999999999` is a deliberately fake Brreg number (fails MOD-11) so
it cannot collide with a real NGO. Folder names map to the NGO slug, which
the FRR ingest joins to orgnr via `atlas-data-repo/ingest/src/seed-sources/atlas-ngo-landscape/landscape.json`
(plus a hardcoded `sample-ngo → 999999999` entry in the ingest itself).

## Layout

```
sample-ngo/
├── README.md             ← you are here
├── frr/
│   ├── README.md         ← FRR data layout + how to extend the sample
│   └── sample-frr.json   ← 5 synthetic FRR resources
└── orgunits/
    ├── README.md         ← orgunits layout
    └── sample-orgunits.json
```

## Real-NGO layout

Real NGOs follow the same convention but their entire subdirectory is
gitignored (`atlas-private-data-repo/<ngo>/` is added to `.gitignore`):

```
atlas-private-data-repo/
├── sample-ngo/           ← committed
└── redcross/             ← gitignored, mirrors sample-ngo's layout
    ├── frr/
    ├── orgunits/
    └── docs/             ← per-NGO API specs, payment configs, etc.
```
