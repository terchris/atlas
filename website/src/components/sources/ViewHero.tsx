import React, { useState } from 'react';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import type { View } from '../../types/sources';
import { usePostgrestBaseUrl, rewriteToBase } from '../../utils/postgrest';
import SocialProofBadge from './SocialProofBadge';
import styles from './styles.module.css';

interface Props {
  view: View;
}

function curlSnippet(url: string): string {
  return `curl -sS '${url}'`;
}

function pythonSnippet(url: string): string {
  return [
    'import requests',
    `r = requests.get(${JSON.stringify(url)})`,
    'r.raise_for_status()',
    'print(r.json())',
  ].join('\n');
}

/**
 * Hero / buy-box for a view dataset (api_v1.* PostgREST view).
 * Mirrors SourceHero's structure but no provenance/lifecycle — views are
 * Atlas-built, not upstream-published. Always-stable in v1 (no beta marts).
 */
export default function ViewHero({ view }: Props) {
  const [showPanel, setShowPanel] = useState(false);
  const postgrestBase = usePostgrestBaseUrl();
  const liveQuery = rewriteToBase(view.sample_query, postgrestBase);

  const githubIssueUrl =
    'https://github.com/terchris/atlas/issues/new?' +
    `title=${encodeURIComponent(`Data issue: api_v1.${view.api_v1_name}`)}` +
    `&body=${encodeURIComponent(`Atlas view: \`api_v1.${view.api_v1_name}\`\nIssue: \n\nPage: https://atlas.sovereignsky.no/datasets/${view.api_v1_name}\n`)}`;

  return (
    <div className={styles.hero}>
      <div className={styles.heroBody}>
        <div className={styles.heroBadges}>
          <span className={`${styles.badge} ${styles.badgeStable}`}>Atlas view</span>
          <SocialProofBadge kind="view" view={view} />
        </div>
        <h1 className={styles.heroTitle}>{view.title}</h1>
        <span className={styles.heroPublisher}>
          <code>api_v1.{view.api_v1_name}</code>
        </span>
        <p>{view.description_short}</p>

        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setShowPanel((v) => !v)}
          >
            {showPanel ? 'Hide query' : 'Get this data'}
          </button>
          <Link to="/api" className={styles.secondaryButton}>
            Try at /api ↗
          </Link>
          <Link to={view.lineage_url} className={styles.secondaryButton}>
            View in lineage ↗
          </Link>
          <a href={githubIssueUrl} className={styles.secondaryButton} target="_blank" rel="noopener noreferrer">
            Report a data issue
          </a>
        </div>

        {showPanel && (
          <div className={styles.getDataPanel}>
            <div className={styles.getDataLabel}>HTTP</div>
            <CodeBlock language="text">{liveQuery}</CodeBlock>

            <div className={styles.getDataLabel}>curl</div>
            <CodeBlock language="bash">{curlSnippet(liveQuery)}</CodeBlock>

            <div className={styles.getDataLabel}>Python (requests)</div>
            <CodeBlock language="python">{pythonSnippet(liveQuery)}</CodeBlock>
          </div>
        )}
      </div>
    </div>
  );
}
