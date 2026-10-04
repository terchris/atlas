/**
 * file: ingest/src/lib/io.ts
 * description: Writing collections, and the omit-empty rule.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Collection } from './types';

/** Where `data/` lives. Defaults to this repo's `ngo/`; set NGO_ROOT to run the extractors elsewhere. */
export const NGO_ROOT = process.env.NGO_ROOT
  ? path.resolve(process.env.NGO_ROOT)
  : path.resolve(__dirname, '..', '..', '..');
export const DATA_DIR = path.join(NGO_ROOT, 'data');

/**
 * The API standard omits empty values rather than sending null. Applying it here means a
 * producer cannot accidentally emit `"county": null` and fail validation downstream.
 */
export function omitEmpty<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(omitEmpty).filter((v) => v !== undefined) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null || v === undefined || v === '') continue;
      if (Array.isArray(v) && v.length === 0) continue;
      const cleaned = omitEmpty(v);
      if (cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned)
          && Object.keys(cleaned).length === 0) continue;
      out[k] = cleaned;
    }
    return out as T;
  }
  return value;
}

export function writeCollection<T>(file: string, collection: Collection<T>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(omitEmpty(collection), null, 2)}\n`);
}

export function readCollection<T>(file: string): Collection<T> | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Collection<T>;
  } catch {
    return undefined;
  }
}

export const today = (): string => new Date().toISOString().slice(0, 10);
export const nowIso = (): string => `${new Date().toISOString().slice(0, 19)}Z`;
