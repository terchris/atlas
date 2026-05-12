import React from 'react';
import type { Source } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

function formatIsoDay(ts: string | null): string | null {
  if (!ts) return null;
  // Render the YYYY-MM-DD portion; full timestamp lives in the provenance row.
  return ts.slice(0, 10);
}

/**
 * Renders the freshness signal: time coverage from manifest +
 * last-ingested date from the meta_sources snapshot (when available).
 *
 * Time coverage = what years the upstream data covers.
 * Last ingested = when Atlas last pulled it. Different signals; both shown.
 *
 * The snapshot is refreshed manually via `npm run sources:snapshot-freshness`.
 * If absent, only time-coverage shows.
 */
export default function FreshnessBadge({ source }: Props) {
  const { time_coverage: tc, tags, last_ingested_at } = source;
  const cadenceText = tags.cadence === 'irregular' ? 'irregular' : tags.cadence;

  let coverage: string;
  if (tc.start && tc.end) {
    coverage = `Covers ${tc.start}–${tc.end}`;
  } else if (tc.end) {
    coverage = `Through ${tc.end}`;
  } else {
    coverage = 'No fixed time range';
  }

  const lastIngestDay = formatIsoDay(last_ingested_at);

  return (
    <span className={styles.freshness}>
      <span className={styles.freshnessLabel}>{coverage}</span>
      <span>· {cadenceText}</span>
      {lastIngestDay && (
        <span> · last ingested {lastIngestDay}</span>
      )}
    </span>
  );
}
