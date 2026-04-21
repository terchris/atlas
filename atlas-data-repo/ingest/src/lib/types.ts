/**
 * JSON-stat2 response shape (https://json-stat.org/full/).
 *
 * SSB's PxWebAPI v2 returns this when `outputFormat=json-stat2`. The `value`
 * array is flat (row-major over the dimensions in `id`); unflatten with
 * `parseJsonStat2` in lib/pxweb.ts.
 */
export type JsonStat2Response = {
  class: "dataset";
  label: string;
  source: string;
  updated: string;
  /** Dimension names, in the order used to flatten `value` (row-major). */
  id: string[];
  /** Size of each dimension, aligned with `id`. */
  size: number[];
  /** Metadata per dimension. */
  dimension: Record<string, PxDimension>;
  /**
   * Flat array of values; length = product of sizes. JSON-stat2 allows
   * string markers (e.g. `":"`, `"."`) to appear inline in this array for
   * cells where a numeric value isn't available. SSB emits numbers and
   * nulls; FHI emits inline string markers. `parseJsonStat2` normalises
   * both forms into `{value: number|null, status?: string}`.
   */
  value: (number | string | null)[];
  /**
   * Sparse status codes (e.g. suppressed cells). Keys are stringified flat
   * indices into `value`.
   */
  status?: Record<string, string>;
  role?: {
    time?: string[];
    geo?: string[];
    metric?: string[];
  };
};

export type PxDimension = {
  label: string;
  category: {
    /**
     * JSON-stat2 allows `index` to be either a code→position object or a
     * position-ordered array of codes. SSB uses the object form, FHI uses
     * the array form. Both are spec-compliant; `parseJsonStat2` handles both.
     */
    index: Record<string, number> | string[];
    /** Code → human-readable label. */
    label: Record<string, string>;
    /** Optional unit info per content code. */
    unit?: Record<string, { base?: string; decimals?: number }>;
  };
};

/** One fully-expanded cell from a JSON-stat2 response. */
export type PxRow = {
  dimensions: Record<string, { code: string; label: string }>;
  value: number | null;
  status?: string;
};
