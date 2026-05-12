/**
 * Host-aware PostgREST base URL.
 *
 * The catalog's static MDX bakes in the production URL
 * (https://api-atlas.sovereignsky.no/...) — that's the canonical citation
 * target and matches the Schema.org JSON-LD. But a visitor browsing
 * locally at localhost:3000 wants their copy-clickable sample queries to
 * hit the local UIS PostgREST at http://api-atlas.localhost — otherwise
 * curl errors with "Could not resolve host" or hits a different cluster.
 *
 * The hook returns the production base by default (SSR-safe) and swaps
 * to the local base on client mount when the visitor is on a localhost
 * hostname. A one-frame flash of the production URL is acceptable since
 * the sample queries are informational, not action-blocking.
 */

import { useEffect, useState } from 'react';

export const POSTGREST_PROD_BASE = 'https://api-atlas.sovereignsky.no';
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
