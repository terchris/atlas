import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { getRegistry } from '../../utils/sources';
import type { Source } from '../../types/sources';
import LifecycleBadge from './LifecycleBadge';
import styles from './styles.module.css';

interface Props {
  /** How many cards to render. Default 4. */
  limit?: number;
}

function relativeDay(isoTimestamp: string, now: Date): string {
  const then = new Date(isoTimestamp);
  if (Number.isNaN(then.getTime())) return '';
  const diffMs = now.getTime() - then.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

function PublisherLogo({ source }: { source: Source }) {
  const logoUrl = useBaseUrl(source.publisher.logo);
  return (
    <img
      src={logoUrl}
      alt={`${source.publisher.display_name} logo`}
      className={styles.cardLogo}
      loading="lazy"
    />
  );
}

/**
 * Top-N most recently ingested datasets, sorted by last_ingested_at desc.
 * Reads from the registry's snapshot-derived freshness fields. When the
 * snapshot is missing or every source lacks a timestamp, renders nothing —
 * the homepage just skips this strip instead of showing an empty section.
 */
export default function RecentlyRefreshedStrip({ limit = 4 }: Props) {
  const registry = getRegistry();
  const snapshotAt = registry.meta_sources_snapshot_at;
  if (!snapshotAt) return null;

  const fresh = registry.sources
    .filter((s): s is Source & { last_ingested_at: string } => Boolean(s.last_ingested_at))
    .sort((a, b) => b.last_ingested_at.localeCompare(a.last_ingested_at))
    .slice(0, limit);
  if (fresh.length === 0) return null;

  const now = new Date(snapshotAt);
  return (
    <div className={styles.recentlyRefreshedStrip}>
      {fresh.map((source) => (
        <Link
          key={source.source_id}
          to={`/datasets/${source.source_id}`}
          className={styles.recentlyRefreshedCard}
        >
          <div className={styles.recentlyRefreshedHeader}>
            <PublisherLogo source={source} />
            <span className={styles.recentlyRefreshedTimestamp}>
              Updated {relativeDay(source.last_ingested_at, now)}
            </span>
          </div>
          <h3 className={styles.recentlyRefreshedTitle}>{source.upstream_title}</h3>
          <div className={styles.recentlyRefreshedFooter}>
            <span className={styles.recentlyRefreshedPublisher}>
              {source.publisher.display_name}
            </span>
            <LifecycleBadge lifecycle={source.lifecycle} />
          </div>
        </Link>
      ))}
    </div>
  );
}
