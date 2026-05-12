import React from 'react';
import Link from '@docusaurus/Link';
import type { Source } from '../../types/sources';
import { viewsUsingSource } from '../../utils/sources';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

/**
 * "Used in Atlas views" — every Atlas view (api_v1.*) that includes this
 * upstream source in its `built_from`. Mirror of DatasetBuiltFrom on view
 * pages. Helps a researcher land on a source page and click through to a
 * queryable view that consumes it.
 */
export default function SourceUsedInViews({ source }: Props) {
  const views = viewsUsingSource(source.source_id);
  if (views.length === 0) {
    return (
      <p>
        <em>No Atlas views consume this dataset yet — it may be a reference table or recently added.</em>
      </p>
    );
  }
  return (
    <div className={styles.cardGrid}>
      {views.map((v) => (
        <Link key={v.view_id} to={`/datasets/${v.view_id}`} className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardCategory}>Atlas view</div>
          </div>
          <h3 className={styles.cardTitle}>{v.title}</h3>
          <p className={styles.cardDescription}>{v.description_short}</p>
          <div className={styles.cardFooter}>
            <code className={styles.cardSourceId}>api_v1.{v.api_v1_name}</code>
          </div>
        </Link>
      ))}
    </div>
  );
}
