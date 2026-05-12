import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { getAllPublishers } from '../../utils/sources';
import styles from './styles.module.css';

export default function PublisherStrip() {
  const publishers = getAllPublishers();
  return (
    <div className={styles.publisherGrid}>
      {publishers.map((p) => {
        const logo = useBaseUrl(p.logo);
        return (
          <Link key={p.id} to={`/publishers/${p.id}`} className={styles.publisherCard}>
            <img
              src={logo}
              alt={`${p.display_name} logo`}
              className={styles.publisherCardLogo}
              loading="lazy"
            />
            <h3 className={styles.publisherCardName}>{p.display_name}</h3>
            <p className={styles.publisherCardDescription}>{p.notes}</p>
            <div className={styles.publisherCardCount}>
              {p.source_count} {p.source_count === 1 ? 'dataset' : 'datasets'}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
