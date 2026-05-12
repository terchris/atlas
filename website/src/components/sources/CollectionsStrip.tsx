import React from 'react';
import Link from '@docusaurus/Link';
import { getRegistry } from '../../utils/sources';
import styles from './styles.module.css';

/**
 * Homepage strip of curated editorial collections. Renders one card per
 * shipped collection plus a "More coming soon" placeholder so the strip
 * never looks empty. Hidden entirely when no collections are defined.
 */
export default function CollectionsStrip() {
  const { collections } = getRegistry();
  if (!collections || collections.length === 0) return null;

  return (
    <div className={styles.collectionsStrip}>
      {collections.map((c) => (
        <Link
          key={c.id}
          to={`/datasets/collections/${c.id}`}
          className={styles.collectionCard}
        >
          <div className={styles.collectionCardPersona}>For {c.persona}</div>
          <h3 className={styles.collectionCardTitle}>{c.title}</h3>
          <p className={styles.collectionCardDescription}>{c.intro}</p>
          <div className={styles.collectionCardMeta}>
            {c.datasets.length} datasets · curated
          </div>
        </Link>
      ))}
      <div className={styles.collectionCardPlaceholder}>
        <p className={styles.collectionCardPlaceholderTitle}>More coming soon</p>
        <p style={{ margin: 0 }}>
          Each quarter we add one collection — built around a specific persona
          and task in NGO funding, advocacy, or programme design.
        </p>
      </div>
    </div>
  );
}
