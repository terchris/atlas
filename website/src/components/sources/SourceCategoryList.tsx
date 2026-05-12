import React from 'react';
import { sourcesByCategory } from '../../utils/sources';
import SourceCard from './SourceCard';
import styles from './styles.module.css';

interface Props {
  categoryId: string;
}

export default function SourceCategoryList({ categoryId }: Props) {
  const sources = sourcesByCategory(categoryId);
  if (sources.length === 0) {
    return <p>No sources in this category yet.</p>;
  }
  return (
    <div className={styles.cardGrid}>
      {sources.map((s) => <SourceCard key={s.source_id} source={s} />)}
    </div>
  );
}
