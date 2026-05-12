import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import type { Collection, Source, View } from '../../types/sources';
import LifecycleBadge from './LifecycleBadge';
import styles from './styles.module.css';

interface Props {
  collection: Collection;
}

function isSource(d: Source | View): d is Source {
  return d.kind === 'source';
}

function datasetSlug(d: Source | View): string {
  return isSource(d) ? d.source_id : d.view_id;
}

function datasetTitle(d: Source | View): string {
  return isSource(d) ? d.upstream_title : d.title;
}

function datasetSubtitle(d: Source | View): string {
  return isSource(d)
    ? `${d.publisher.display_name} · ${d.category.emoji} ${d.category.name}`
    : 'Atlas view (api_v1.*)';
}

function PublisherLogo({ dataset }: { dataset: Source }) {
  const logoUrl = useBaseUrl(dataset.publisher.logo);
  return (
    <img
      src={logoUrl}
      alt={`${dataset.publisher.display_name} logo`}
      className={styles.collectionDatasetLogo}
      loading="lazy"
    />
  );
}

/**
 * Ordered list of datasets in a collection, each with its editorial "why
 * this one" annotation. Renders the collection's `datasets` array in the
 * order specified by the YAML — the order is the editorial argument, so
 * preserve it.
 */
export default function CollectionDatasetList({ collection }: Props) {
  return (
    <ol className={styles.collectionDatasetList}>
      {collection.datasets.map(({ dataset, why }, idx) => (
        <li key={datasetSlug(dataset)} className={styles.collectionDatasetItem}>
          <div className={styles.collectionDatasetNumber}>{idx + 1}</div>
          <div className={styles.collectionDatasetBody}>
            <div className={styles.collectionDatasetHeader}>
              {isSource(dataset) && <PublisherLogo dataset={dataset} />}
              <div className={styles.collectionDatasetTitleBlock}>
                <Link
                  to={`/datasets/${datasetSlug(dataset)}`}
                  className={styles.collectionDatasetTitle}
                >
                  {datasetTitle(dataset)}
                </Link>
                <div className={styles.collectionDatasetSubtitle}>
                  {datasetSubtitle(dataset)}
                </div>
              </div>
              {isSource(dataset) && (
                <LifecycleBadge lifecycle={dataset.lifecycle} />
              )}
            </div>
            <div className={styles.collectionDatasetWhy} style={{ whiteSpace: 'pre-line' }}>
              {why}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
