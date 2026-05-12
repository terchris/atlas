import React from 'react';
import type { Source, View } from '../../types/sources';
import styles from './styles.module.css';

interface SourceProps {
  kind: 'source';
  source: Source;
}

interface ViewProps {
  kind: 'view';
  view: View;
}

type Props = (SourceProps | ViewProps) & {
  /** When true, render with the small inline card-footer styling (no link). */
  compact?: boolean;
};

/**
 * Derived social-proof signal:
 *  - Sources: "Powers N views" — count from consuming_marts (transitive lineage).
 *  - Views: "Built from N upstream datasets" — count of source parents in built_from.
 *
 * On hero placements, the badge is a link that scrolls to the matching block on
 * the same page (#in-atlas for sources, #built-from for views). On cards
 * (compact mode), it renders as a plain pill — the whole card is already a
 * link to the dataset page.
 *
 * Returns null when the count is 0 (avoids "Powers 0 views" / "Built from 0
 * datasets" empty-state noise).
 */
export default function SocialProofBadge(props: Props) {
  if (props.kind === 'source') {
    const count = props.source.consuming_marts.length;
    if (count === 0) return null;
    const label = `Powers ${count} ${count === 1 ? 'view' : 'views'}`;
    if (props.compact) {
      return <span className={`${styles.badge} ${styles.badgeSocialProof}`}>{label}</span>;
    }
    return (
      <a href="#in-atlas" className={`${styles.badge} ${styles.badgeSocialProof} ${styles.badgeSocialProofLink}`}>
        {label}
      </a>
    );
  }

  const sourceParentCount = props.view.built_from.filter((p) => p.parent_kind === 'source').length;
  if (sourceParentCount === 0) return null;
  const label = `Built from ${sourceParentCount} upstream ${sourceParentCount === 1 ? 'dataset' : 'datasets'}`;
  if (props.compact) {
    return <span className={`${styles.badge} ${styles.badgeSocialProof}`}>{label}</span>;
  }
  return (
    <a href="#built-from" className={`${styles.badge} ${styles.badgeSocialProof} ${styles.badgeSocialProofLink}`}>
      {label}
    </a>
  );
}
