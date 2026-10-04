/**
 * Live dataset and record counts, read from the published API instead of
 * hand-edited text (urb-agents #1837 — the /datasets page's dataset count
 * went stale and nobody noticed until Terje asked directly).
 *
 * `datasetCount` is PostgREST's own `Content-Range` total for `meta_sources`
 * (one row per ingested source) — a `Range: 0-0` request costs one row, not
 * the whole catalogue. `recordCount` sums `atlas_inventory.row_count` across
 * every published relation, the same model built for "ingested means served,
 * and verified" (urb-agents #1433).
 *
 * Fails soft: a network error, a renamed column, or an unreachable API leaves
 * both counts `null` rather than falling back to a guess — callers render
 * nothing rather than show a number nobody can stand behind.
 */
import { useEffect, useState } from 'react';
import { usePostgrestBaseUrl } from './postgrest';

export interface LiveStats {
  datasetCount: number | null;
  recordCount: number | null;
  loading: boolean;
}

function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const match = header.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function useLiveStats(): LiveStats {
  const base = usePostgrestBaseUrl();
  const [datasetCount, setDatasetCount] = useState<number | null>(null);
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const [sourcesRes, inventoryRes] = await Promise.all([
          fetch(`${base}/meta_sources?select=source_id`, {
            headers: { Prefer: 'count=exact', Range: '0-0' },
          }),
          fetch(`${base}/atlas_inventory?select=row_count`),
        ]);
        if (!sourcesRes.ok || !inventoryRes.ok) {
          throw new Error('live stats fetch failed');
        }

        const total = parseContentRangeTotal(sourcesRes.headers.get('content-range'));
        const rows: Array<{ row_count: number | null }> = await inventoryRes.json();
        const sum = rows.reduce((acc, r) => acc + (r.row_count ?? 0), 0);

        if (!cancelled) {
          setDatasetCount(total);
          setRecordCount(sum);
        }
      } catch {
        if (!cancelled) {
          setDatasetCount(null);
          setRecordCount(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [base]);

  return { datasetCount, recordCount, loading };
}
