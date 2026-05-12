import React from 'react';
import { sourcesByPublisher } from '../../utils/sources';
import SourceCard from './SourceCard';
import styles from './styles.module.css';

interface Props {
  publisherId: string;
}

export default function SourcePublisherList({ publisherId }: Props) {
  const sources = sourcesByPublisher(publisherId);
  if (sources.length === 0) {
    return <p>No sources from this publisher yet.</p>;
  }
  return (
    <div className={styles.cardGrid}>
      {sources.map((s) => <SourceCard key={s.source_id} source={s} />)}
    </div>
  );
}
