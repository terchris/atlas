import React from 'react';
import type { Source } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

export default function SourceCitation({ source }: Props) {
  return (
    <div className={styles.citation}>
      <div className={styles.citationLabel}>Recommended citation</div>
      <div className={styles.citationText}>{source.citation.text}</div>

      <div className={styles.citationLabel}>BibTeX</div>
      <pre><code>{source.citation.bibtex}</code></pre>

      <div className={styles.citationLabel}>Permalink</div>
      <p>
        <a href={`https://atlas.sovereignsky.no/sources/${source.source_id}`}>
          https://atlas.sovereignsky.no/sources/{source.source_id}
        </a>
      </p>
    </div>
  );
}
