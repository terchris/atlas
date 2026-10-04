import React from 'react';
import { useLiveStats } from '../../utils/liveStats';
import styles from './styles.module.css';

function formatCount(n: number | null): string | null {
  if (n == null) return null;
  return n.toLocaleString('en-US');
}

/**
 * The homepage hero's live dataset/record counts (urb-agents #1837: visible
 * on the front page, not buried in a sub-page). Renders nothing while
 * loading or if the API is unreachable, rather than show a stale fallback.
 */
export default function LiveStatsHero() {
  const { datasetCount, recordCount, loading } = useLiveStats();
  const datasets = formatCount(datasetCount);
  const records = formatCount(recordCount);
  if (loading || datasets == null || records == null) return null;

  return (
    <div className={styles.liveStats}>
      <div className={styles.liveStat}>
        <span className={styles.liveStatValue}>{datasets}</span>
        <span className={styles.liveStatLabel}>datasets</span>
      </div>
      <div className={styles.liveStatDivider} aria-hidden="true" />
      <div className={styles.liveStat}>
        <span className={styles.liveStatValue}>{records}</span>
        <span className={styles.liveStatLabel}>records served</span>
      </div>
    </div>
  );
}

/**
 * The same counts as an inline phrase, for prose that used to carry a
 * hand-edited number (e.g. `docs/datasets/index.mdx`). Renders a neutral
 * placeholder rather than nothing, so the sentence around it still reads.
 */
export function LiveStatsInline() {
  const { datasetCount, recordCount, loading } = useLiveStats();
  const datasets = formatCount(datasetCount);
  const records = formatCount(recordCount);
  if (loading || datasets == null || records == null) {
    return <>its datasets</>;
  }
  return (
    <>
      {datasets} datasets and {records} records
    </>
  );
}
