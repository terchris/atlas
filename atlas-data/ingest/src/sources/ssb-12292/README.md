# ssb-12292

SSB KOSTRA **12292** — *Omsorgstjenester (supplerende grunnlagstall)*. Nursing-home and home-care service indicators per kommune.

## Known quirks

- Mirrors the `ssb-13995` pattern (KOSTRA). Region dim mapped to `region_code` at ingest.
- Big content-code set (49). Fact-layer takes kommune-level rows without filtering further; consumers pick which code to visualise.

## References

- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
