import React from 'react';
import type { Source } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

/**
 * Renders the time coverage as a freshness signal. For sources with a known
 * end year, shows "Covers YYYY–YYYY · cadence". For irregular cadences with
 * null start/end, shows "Updated irregularly".
 *
 * PLAN-003 will replace the static time_coverage.end with live
 * mart_ingest_health data (last_ingested_at + next-expected calculation).
 * Until then this is the most honest signal we have without polling Postgres.
 */
export default function FreshnessBadge({ source }: Props) {
  const { time_coverage: tc, tags } = source;
  const cadenceText = tags.cadence === 'irregular' ? 'irregular' : tags.cadence;

  let coverage: string;
  if (tc.start && tc.end) {
    coverage = `Covers ${tc.start}–${tc.end}`;
  } else if (tc.end) {
    coverage = `Through ${tc.end}`;
  } else {
    coverage = 'No fixed time range';
  }

  return (
    <span className={styles.freshness}>
      <span className={styles.freshnessLabel}>{coverage}</span>
      <span>· {cadenceText}</span>
    </span>
  );
}
