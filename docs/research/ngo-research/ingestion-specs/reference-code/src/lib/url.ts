/**
 * file: ingest/src/lib/url.ts
 * description: URL normalisation at ingest.
 *
 * Registry data carries IRIs, not URIs: 'https://www.rodekors.no/sør-trøndelag' is valid
 * to a human and fails `format: uri`. It also carries structurally broken hosts like
 * 'https://facebook/...'. Both were found by the generated schema AFTER the data had
 * shipped, so normalise here rather than downstream.
 */

export interface UrlResult { url?: string; reason?: string; }

export function normaliseUrl(raw: string | undefined | null): UrlResult {
  if (!raw || typeof raw !== 'string') return {};
  let candidate = raw.trim();
  if (!candidate) return {};
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { reason: 'unparseable' };
  }
  // A host with no dot is not a real host — 'https://facebook/x' appears in real data.
  if (!u.hostname.includes('.')) return { reason: `host has no dot: ${u.hostname}` };
  // The URL constructor percent-encodes the path and punycodes the host for us.
  return { url: u.toString().replace(/\/$/, u.pathname === '/' ? '/' : '') };
}
