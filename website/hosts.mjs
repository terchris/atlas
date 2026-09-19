/**
 * The public hostnames, in ONE place, read from the environment.
 *
 * 🔴 These are deployment choices, not properties of the code (Terje,
 * urb-agents #1245): Traefik matches `HostRegexp(api-atlas\..+)`, so any domain
 * pointed at the cluster routes. Nothing here should need a commit to change.
 *
 * ⚠️ This file exists because the values were previously declared in THREE
 * places — the generator, the Docusaurus config, and src/utils/postgrest.ts —
 * and the API one was NXDOMAIN for four months while agreeing with itself.
 * Duplicated constants agree with each other; they do not agree with reality.
 *
 * ⚠️ ATLAS_API_BASE_URL is NOT ATLAS_POSTGREST_URL. That one is the in-cluster
 * service address atlas-status.py reads inside the code-location pod; this is
 * the public name a reader's browser types. Two correct answers to one
 * question has cost this project a round before (urb-agents #1149).
 */

/** Where the documentation site is published. */
export const ATLAS_SITE_BASE_URL =
  process.env.ATLAS_SITE_BASE_URL || 'https://atlas.sovereignsky.no';

/**
 * Where the published PostgREST API answers.
 *
 * Default is what works TODAY, measured — not what looks symmetrical with the
 * site URL. The previous value was inferred by analogy from the line above and
 * never resolved.
 */
export const ATLAS_API_BASE_URL =
  process.env.ATLAS_API_BASE_URL || 'https://api-atlas.urbalurba.com';
