import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import type { Source } from '../../types/sources';
import LifecycleBadge from './LifecycleBadge';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

export default function SourceCard({ source }: Props) {
  const logoUrl = useBaseUrl(source.publisher.logo);
  return (
    <Link to={`/sources/${source.source_id}`} className={styles.card}>
      <div className={styles.cardHeader}>
        <img
          src={logoUrl}
          alt={`${source.publisher.display_name} logo`}
          className={styles.cardLogo}
          loading="lazy"
        />
        <div className={styles.cardCategory}>
          {source.category.emoji} {source.category.name}
        </div>
      </div>
      <h3 className={styles.cardTitle}>{source.upstream_title}</h3>
      <p className={styles.cardDescription}>{source.description}</p>
      <div className={styles.cardFooter}>
        <span className={styles.cardSourceId}>{source.source_id}</span>
        <LifecycleBadge lifecycle={source.lifecycle} />
      </div>
    </Link>
  );
}
