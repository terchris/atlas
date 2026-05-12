import React from 'react';
import type { Collection } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  collection: Collection;
}

/**
 * Editorial hero for a curated dataset collection. Shows the title, the
 * persona this collection serves, the named task, and the intro prose.
 * Per-dataset framing lives in CollectionDatasetList below.
 */
export default function CollectionHero({ collection }: Props) {
  return (
    <div className={styles.collectionHero}>
      <div className={styles.collectionHeroBadge}>For {collection.persona}</div>
      <h1 className={styles.collectionHeroTitle}>{collection.title}</h1>
      <div className={styles.collectionHeroTask}>
        <div className={styles.collectionHeroTaskLabel}>The task</div>
        <div style={{ whiteSpace: 'pre-line' }}>{collection.persona_task}</div>
      </div>
      <div style={{ whiteSpace: 'pre-line' }}>{collection.intro}</div>
    </div>
  );
}
