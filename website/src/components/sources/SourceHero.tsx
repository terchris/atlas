import React, { useState } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import type { Source } from '../../types/sources';
import LifecycleBadge from './LifecycleBadge';
import FreshnessBadge from './FreshnessBadge';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

function pythonSnippet(source: Source): string {
  return [
    'import requests',
    `r = requests.get(${JSON.stringify(source.sample_query)})`,
    'r.raise_for_status()',
    'print(r.json())',
  ].join('\n');
}

function curlSnippet(source: Source): string {
  return `curl -sS '${source.sample_query}'`;
}

export default function SourceHero({ source }: Props) {
  const logoUrl = useBaseUrl(source.publisher.logo);
  const [showPanel, setShowPanel] = useState(false);

  const upstreamLink = source.upstream_landing_page || source.upstream_url;
  const githubIssueUrl =
    'https://github.com/terchris/atlas/issues/new?' +
    `title=${encodeURIComponent(`Data issue: ${source.source_id}`)}` +
    `&body=${encodeURIComponent(`Source: \`${source.source_id}\`\nIssue: \n\nPage: https://atlas.sovereignsky.no/sources/${source.source_id}\n`)}`;

  return (
    <div className={styles.hero}>
      <img
        src={logoUrl}
        alt={`${source.publisher.display_name} logo`}
        className={styles.heroLogo}
      />
      <div className={styles.heroBody}>
        <div className={styles.heroBadges}>
          <LifecycleBadge lifecycle={source.lifecycle} />
          <span className={`${styles.badge} ${styles.licenseBadge}`}>{source.license}</span>
          <FreshnessBadge source={source} />
        </div>
        <h1 className={styles.heroTitle}>{source.upstream_title}</h1>
        <span className={styles.heroPublisher}>
          {source.publisher.display_name} · <code>{source.source_id}</code>
        </span>
        <p>{source.description}</p>

        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setShowPanel((v) => !v)}
          >
            {showPanel ? 'Hide query' : 'Get this data'}
          </button>
          <a href="#citation" className={styles.secondaryButton}>Cite this source</a>
          <a href={upstreamLink} className={styles.secondaryButton} target="_blank" rel="noopener noreferrer">
            View upstream ↗
          </a>
          <a href={githubIssueUrl} className={styles.secondaryButton} target="_blank" rel="noopener noreferrer">
            Report a data issue
          </a>
        </div>

        {showPanel && (
          <div className={styles.getDataPanel}>
            <div className={styles.getDataLabel}>HTTP</div>
            <pre><code>{source.sample_query}</code></pre>

            <div className={styles.getDataLabel}>curl</div>
            <pre><code>{curlSnippet(source)}</code></pre>

            <div className={styles.getDataLabel}>Python (requests)</div>
            <pre><code>{pythonSnippet(source)}</code></pre>
          </div>
        )}
      </div>
    </div>
  );
}
