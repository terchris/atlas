/**
 * file: ingest/src/lib/http.ts
 * description: Polite HTTP with retry, robots.txt, per-host Crawl-delay and a page cache.
 *
 * Three practices adopted from Atlas's scraping infrastructure
 * (terchris/atlas `INVESTIGATE-ngo-scraping-infrastructure.md` §C-§D, `lib/scraping/`):
 *
 * 1. robots.txt is consulted for EVERY URL, and a Disallow is a hard failure, never a retry.
 * 2. The site's Crawl-delay is enforced per host, whatever delay the caller asked for. The
 *    callers' fixed delays had been the only politeness, and one of them ran 4h.no at five
 *    times the rate its robots.txt asks for.
 * 3. Every fetched body is cached on disk, gzip-compressed and verified lossless. With NGO_FROM_CACHE=1 the extractors re-parse
 *    the cache and touch no network - so a parser fix is a re-parse, not a re-crawl. The
 *    542 malformed N.K.S. names were unrepairable for exactly the want of this.
 *    The cache holds pages as published, contact blocks included; it lives under
 *    `ingest/.cache/` (gitignored) and never leaves the machine.
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync, gzipSync } from 'zlib';
import Logger from './logger';
import { groupFor, isAllowed, parseRobots, type RobotsRules } from './robots';

const CACHE_DIR = path.resolve(__dirname, '..', '..', '.cache', 'pages');

/**
 * ⚠️ The contact URL must RESOLVE. Its only job is to let a site operator work out who is
 * crawling them and reach us; pointing it at a host with no DNS fails that job silently,
 * and this one did for every request of this research - roughly 1 500 across 11 NGO sites.
 *
 * `atlas.helpers.no` does not resolve (checked again 2026-09-27, and the Atlas repo README
 * records the same on 2026-09-24). The verified hostnames are atlas.sovereignsky.no for the
 * public page and api-atlas.urbalurba.com for the API; `website/hosts.mjs` in the Atlas repo
 * is the source of truth. Check there before changing this.
 *
 * Like Atlas, a crawl refuses to run anonymously: the operator gets an address to write to.
 * Same variable as Atlas, so one .env serves both.
 */
export function userAgent(): string {
  const email = (process.env.ATLAS_SCRAPE_CONTACT_EMAIL ?? fromDotEnv('ATLAS_SCRAPE_CONTACT_EMAIL'))?.trim();
  if (!email) {
    throw new Error('ATLAS_SCRAPE_CONTACT_EMAIL is not set. Crawls refuse to run anonymously - '
      + 'a site operator must be able to reach whoever is fetching their pages. '
      + 'Set it in the environment, or use NGO_FROM_CACHE=1 to re-parse without fetching.');
  }
  return `atlas-ngo-ingest/0.1 (+https://atlas.sovereignsky.no; ${email})`;
}

/** A `KEY=value` line from `ingest/.env` (gitignored), for settings not in the environment. */
function fromDotEnv(key: string): string | undefined {
  const file = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[1] === key) return m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url} - not fetched, and not retried`);
    this.name = 'RobotsDisallowedError';
  }
}

export interface FetchOptions { attempts?: number; timeoutMs?: number; accept?: string; }

const robotsByHost = new Map<string, Promise<RobotsRules>>();
const lastRequestAt = new Map<string, number>();

async function robotsFor(host: string, ua: string): Promise<RobotsRules> {
  if (!robotsByHost.has(host)) {
    robotsByHost.set(host, (async () => {
      try {
        const res = await fetch(`https://${host}/robots.txt`, { headers: { 'User-Agent': ua } });
        // A missing robots.txt means no rules - the conventional reading, as in Atlas.
        return parseRobots(host, res.ok ? await res.text() : '');
      } catch {
        return parseRobots(host, '');
      }
    })());
  }
  return robotsByHost.get(host)!;
}

/** Wait until the host's Crawl-delay has passed since our last request to it. */
async function respectCrawlDelay(host: string, rules: RobotsRules, ua: string): Promise<void> {
  const delayMs = (groupFor(rules, ua)?.crawlDelay ?? 0) * 1000;
  const wait = (lastRequestAt.get(host) ?? 0) + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
}

const cacheFile = (url: string) => {
  const u = new URL(url);
  return path.join(CACHE_DIR, u.host, createHash('sha256').update(url).digest('hex').slice(0, 32));
};

/**
 * The cache is gzip-compressed: about 100 KB of HTML per page becomes about 10 KB, so a crawl of
 * every NGO (~8 000 pages) costs ~0.1 GB instead of ~0.8 GB. Gzip is lossless, and that is not
 * taken on trust: every page is decompressed straight after writing and compared byte for byte
 * with what was fetched. If the two ever differ, the page is stored uncompressed instead.
 * Uncompressed `.body` files from before this change are still read.
 */
export function readCache(url: string): string | undefined {
  const f = cacheFile(url);
  if (fs.existsSync(`${f}.body.gz`)) return gunzipSync(fs.readFileSync(`${f}.body.gz`)).toString('utf8');
  if (fs.existsSync(`${f}.body`)) return fs.readFileSync(`${f}.body`, 'utf8');
  return undefined;
}

export function writeCache(url: string, body: string, status: number): void {
  const f = cacheFile(url);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const raw = Buffer.from(body, 'utf8');
  const packed = gzipSync(raw, { level: 9 });
  let stored = 'gzip';
  if (gunzipSync(packed).equals(raw)) {
    fs.writeFileSync(`${f}.body.gz`, packed);
    if (fs.existsSync(`${f}.body`)) fs.unlinkSync(`${f}.body`);
  } else {
    // Never expected; kept so that compression can never cost a byte of the page.
    Logger.warn(`  cache: gzip round-trip differed for ${url} - stored uncompressed`);
    fs.writeFileSync(`${f}.body`, body);
    stored = 'raw';
  }
  fs.writeFileSync(`${f}.json`, `${JSON.stringify({
    url, status, fetchedAt: new Date().toISOString(), bytes: raw.length,
    sha256: createHash('sha256').update(raw).digest('hex'), stored,
  })}\n`);
}

export async function getText(url: string, opts: FetchOptions = {}): Promise<string> {
  if (process.env.NGO_FROM_CACHE === '1') {
    const cached = readCache(url);
    if (cached !== undefined) return cached;
    throw new Error(`${url}: not in the page cache (NGO_FROM_CACHE=1 fetches nothing)`);
  }

  const ua = userAgent();
  const { host } = new URL(url);
  const rules = await robotsFor(host, ua);
  if (!isAllowed(rules, url, ua)) throw new RobotsDisallowedError(url);

  const { attempts = 3, timeoutMs = 30_000, accept } = opts;
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    await respectCrawlDelay(host, rules, ua);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': ua, ...(accept ? { Accept: accept } : {}) },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      writeCache(url, body, res.status);
      return body;
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await sleep(2 ** i * 1000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${url}: ${lastError instanceof Error ? lastError.message : lastError}`);
}

export async function getJson<T = any>(url: string, opts: FetchOptions = {}): Promise<T> {
  return JSON.parse(await getText(url, { accept: 'application/json', ...opts })) as T;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run tasks with a fixed delay between them — politeness, not throughput. */
export async function paced<T, R>(
  items: T[], delayMs: number, fn: (item: T, index: number) => Promise<R>,
): Promise<{ results: R[]; failures: { item: T; error: string }[] }> {
  const results: R[] = [];
  const failures: { item: T; error: string }[] = [];
  for (let i = 0; i < items.length; i += 1) {
    try {
      results.push(await fn(items[i], i));
    } catch (e) {
      failures.push({ item: items[i], error: e instanceof Error ? e.message : String(e) });
    }
    if ((i + 1) % 50 === 0) Logger.info(`    ${i + 1}/${items.length}`);
    // A re-parse from cache has no one to be polite to.
    if (delayMs && process.env.NGO_FROM_CACHE !== '1') await sleep(delayMs);
  }
  return { results, failures };
}
