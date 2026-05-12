import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import type { View } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  view: View;
}

/**
 * "Built from" — the view's DIRECT dbt-graph parents (one hop). Two kinds
 * of parents render differently:
 *
 *  - Upstream source datasets — cards that link to /datasets/<source_id>.
 *  - Atlas internal models (fact_/dim_/indicators__/ref_) — labelled cards
 *    showing the model name, optional human title, and short description
 *    from dbt's schema.yml. No catalog page exists for internal models;
 *    the "View full lineage" link below leads to /lineage/.
 *
 * Showing direct refs (not the transitive source closure) avoids the
 * misleading "Built from 18 sources" result on narrow views like
 * mart_coverage_gap_barnefattigdom, which technically depends on 18 sources
 * via fact_kommune_indicators but only USES the Bufdir slice.
 */
export default function DatasetBuiltFrom({ view }: Props) {
  if (view.built_from.length === 0) {
    return <p><em>No direct dbt parents recorded.</em></p>;
  }
  return (
    <>
      <div className={styles.cardGrid}>
        {view.built_from.map((p) => {
          if (p.parent_kind === 'source') {
            return <SourceParentCard key={`source-${p.source_id}`} parent={p} />;
          }
          return <ModelParentCard key={`model-${p.model_name}`} parent={p} />;
        })}
      </div>
      <p className={styles.builtFromFootnote}>
        Showing direct dbt parents. <Link to={view.lineage_url}>See full lineage in /lineage/ →</Link>
      </p>
    </>
  );
}

function SourceParentCard({ parent }: { parent: Extract<View['built_from'][number], { parent_kind: 'source' }> }) {
  const logo = useBaseUrl(parent.publisher.logo);
  return (
    <Link to={`/datasets/${parent.source_id}`} className={styles.card}>
      <div className={styles.cardHeader}>
        <img src={logo} alt={`${parent.publisher.display_name} logo`} className={styles.cardLogo} loading="lazy" />
        <div className={styles.cardCategory}>
          {parent.category.emoji} {parent.category.name}
        </div>
      </div>
      <h3 className={styles.cardTitle}>{parent.upstream_title}</h3>
      <div className={styles.cardFooter}>
        <span className={styles.cardSourceId}>{parent.source_id}</span>
        <span className={styles.cardCategory}>Upstream source</span>
      </div>
    </Link>
  );
}

function ModelParentCard({ parent }: { parent: Extract<View['built_from'][number], { parent_kind: 'model' }> }) {
  const display = parent.title ?? parent.model_name;
  // Internal models aren't catalog entries, but they have a useful
  // destination: their node in /lineage/ (dbt-docs). The ↗ signals that
  // clicking leaves the catalog surface.
  const lineageHref = `pathname:///lineage/#!/model/model.atlas.${parent.model_name}`;
  return (
    <Link to={lineageHref} className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardCategory}>Atlas internal model ↗</div>
      </div>
      <h3 className={styles.cardTitle}>{display}</h3>
      {parent.description_short && (
        <p className={styles.cardDescription}>{parent.description_short}</p>
      )}
      <div className={styles.cardFooter}>
        <code className={styles.cardSourceId}>{parent.model_name}</code>
      </div>
    </Link>
  );
}
