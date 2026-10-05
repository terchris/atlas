import React from 'react';
import { viewsByPublisher } from '../../utils/sources';
import ViewCard from './ViewCard';
import styles from './styles.module.css';

interface Props {
  publisherId: string;
}

export default function ViewPublisherList({ publisherId }: Props) {
  const views = viewsByPublisher(publisherId);
  if (views.length === 0) {
    return <p>No Atlas-authored relations credited to this publisher yet.</p>;
  }
  return (
    <div className={styles.cardGrid}>
      {views.map((v) => <ViewCard key={v.view_id} view={v} />)}
    </div>
  );
}
