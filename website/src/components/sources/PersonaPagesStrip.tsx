import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

/**
 * Hand-authored persona landing pages. Unlike collections (which are
 * generated from collections.yaml), persona pages are small enough that
 * a YAML+generator round-trip would be over-engineering — the page IS
 * the editorial artefact. New persona pages land as a new MDX under
 * `docs/datasets/for/` and a new entry in this list + the sidebar.
 *
 * Quarterly cadence per PLAN-003 / INVESTIGATE-sources-catalog-at-scale.
 */
const PERSONA_PAGES = [
  {
    slug: 'grant-officers',
    persona: 'Tilskuddsansvarlig',
    title: 'For grant officers',
    description:
      "Back your child-poverty grant application with kommune-level evidence. Scope coverage gaps. Benchmark a kommune against its neighbours.",
  },
];

export default function PersonaPagesStrip() {
  return (
    <div className={styles.collectionsStrip}>
      {PERSONA_PAGES.map((p) => (
        <Link
          key={p.slug}
          to={`/datasets/for/${p.slug}`}
          className={styles.collectionCard}
        >
          <div className={styles.collectionCardPersona}>{p.persona}</div>
          <h3 className={styles.collectionCardTitle}>{p.title}</h3>
          <p className={styles.collectionCardDescription}>{p.description}</p>
          <div className={styles.collectionCardMeta}>Use-case landing</div>
        </Link>
      ))}
      <div className={styles.collectionCardPlaceholder}>
        <p className={styles.collectionCardPlaceholderTitle}>More coming soon</p>
        <p style={{ margin: 0 }}>
          One new persona landing per quarter — journalists, donors, kommune
          planners, chapter leaders.
        </p>
      </div>
    </div>
  );
}
