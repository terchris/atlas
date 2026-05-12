import React from 'react';
import Link from '@docusaurus/Link';
import type { Source } from '../../types/sources';
import { sourceById } from '../../utils/sources';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

/**
 * Datasets that co-occur with this one in the same dbt models — the
 * datasets you'd typically combine with this one in a real Atlas query.
 * Derived from atlas-data/dbt/seeds/sources/lineage.csv, capped at 8 per
 * dataset by the generator.
 *
 * The "shared_models" list is the join-context evidence: which Atlas mart
 * or fact pulls both datasets together.
 */
export default function DatasetJoinedWith({ source }: Props) {
  if (source.joined_with.length === 0) {
    return (
      <p>
        <em>No co-occurring datasets in Atlas yet.</em>
      </p>
    );
  }
  return (
    <div className={styles.joinedStrip}>
      {source.joined_with.map((entry) => {
        const other = sourceById(entry.source_id);
        if (!other) return null;
        return (
          <Link
            key={entry.source_id}
            to={`/datasets/${entry.source_id}`}
            className={styles.joinedCard}
          >
            <div className={styles.joinedHeader}>
              <span className={styles.joinedCategory}>
                {other.category.emoji} {other.category.name}
              </span>
            </div>
            <div className={styles.joinedTitle}>{other.upstream_title}</div>
            <div className={styles.joinedSubtitle}>
              {other.publisher.display_name} ·{' '}
              <code className={styles.joinedSourceId}>{other.source_id}</code>
            </div>
            <div className={styles.joinedShared}>
              <span className={styles.joinedSharedLabel}>
                Joined in {entry.shared_models.length} {entry.shared_models.length === 1 ? 'model' : 'models'}:
              </span>{' '}
              {entry.shared_models.slice(0, 3).map((m) => (
                <code key={m} className={styles.joinedSharedModel}>{m}</code>
              ))}
              {entry.shared_models.length > 3 && (
                <span className={styles.joinedSharedMore}>
                  {' '}+ {entry.shared_models.length - 3} more
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
