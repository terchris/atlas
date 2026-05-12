import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { getAllPublishers } from '../../utils/sources';
import styles from './styles.module.css';

export default function PublisherStrip() {
  const publishers = getAllPublishers();
  return (
    <div className={styles.publisherStrip}>
      {publishers.map((p) => {
        const logo = useBaseUrl(p.logo);
        return (
          <Link key={p.id} to={`/sources/by/${p.id}`} className={styles.publisherCard}>
            <img
              src={logo}
              alt={`${p.display_name} logo`}
              className={styles.publisherLogo}
              loading="lazy"
            />
            <div className={styles.publisherMeta}>
              <span className={styles.publisherName}>{p.display_name}</span>
              <span className={styles.publisherCount}>
                {p.source_count} {p.source_count === 1 ? 'source' : 'sources'}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
