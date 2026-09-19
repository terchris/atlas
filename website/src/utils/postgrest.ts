/**
 * Host-aware PostgREST base URL.
 *
 * The catalog's static MDX bakes in the deployed API URL — that is the canonical
 * citation target and matches the Schema.org JSON-LD. A visitor browsing locally
 * wants their copy-clickable sample queries to hit the local UIS PostgREST
 * instead, or curl errors with "Could not resolve host".
 *
 * 🔴 THE PRODUCTION BASE IS READ FROM THE GENERATED REGISTRY, NOT DECLARED HERE.
 *
 * It used to be a second literal copy of the generator's POSTGREST_BASE_URL, and
 * the two had to stay byte-identical for a reason that is easy to miss:
 * `rewriteToBase` does a STRING REPLACE of this value inside the baked URL. If
 * they ever drifted, `.replace()` would match nothing, silently return the
 * production URL unchanged, and a local visitor would be handed a copy-clickable
 * query pointing at the wrong cluster — no error, no warning, just the wrong host.
 *
 * ⚠️ Both copies said `api-atlas.sovereignsky.no`, which has been NXDOMAIN since
 * the generator was written (urb-agents #1245). They agreed with each other and
 * were both wrong, which is exactly what a duplicated constant buys you.
 *
 * Reading it from the registry means there is one value, produced where the
 * sample queries are produced, and the rewrite cannot miss.
 */
import { useEffect, useState } from 'react';

import registryData from '../data/sources-registry.json';

/** The deployed API base the MDX was generated against. Single source of truth. */
export const POSTGREST_PROD_BASE: string = registryData.postgrest_base_url;

// A local convention rather than a domain: UIS serves every app at
// <service>.localhost, so this needs no configuration.
export const POSTGREST_LOCAL_BASE = 'http://api-atlas.localhost';

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost')
  );
}

export function usePostgrestBaseUrl(): string {
  const [base, setBase] = useState<string>(POSTGREST_PROD_BASE);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isLocalHost(window.location.hostname)) {
      setBase(POSTGREST_LOCAL_BASE);
    }
  }, []);
  return base;
}

/** Rewrite a baked-in production PostgREST URL to use the active base. */
export function rewriteToBase(prodUrl: string, base: string): string {
  if (base === POSTGREST_PROD_BASE) return prodUrl;
  return prodUrl.replace(POSTGREST_PROD_BASE, base);
}
