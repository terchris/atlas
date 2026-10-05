import React from 'react';
import Link from '@docusaurus/Link';
import type { View } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  view: View;
}

/**
 * A view's own publisher page already identifies the publisher, so unlike
 * SourceCard this never repeats a logo — every card on one listing shares
 * the same attribution.
 */
export default function ViewCard({ view }: Props) {
  return (
    <Link to={`/datasets/${view.view_id}`} className={styles.card}>
      <h3 className={styles.cardTitle}>{view.title}</h3>
      <p className={styles.cardDescription}>{view.description_short}</p>
      <div className={styles.cardFooter}>
        <span className={styles.cardSourceId}>api_v1.{view.api_v1_name}</span>
      </div>
    </Link>
  );
}
