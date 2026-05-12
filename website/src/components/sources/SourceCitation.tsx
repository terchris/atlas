import React from 'react';
import CodeBlock from '@theme/CodeBlock';
import type { Source } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

export default function SourceCitation({ source }: Props) {
  const permalink = `https://atlas.sovereignsky.no/datasets/${source.source_id}`;
  return (
    <div className={styles.citation}>
      <div className={styles.citationLabel}>Recommended citation</div>
      <CodeBlock language="text">{source.citation.text}</CodeBlock>

      <div className={styles.citationLabel}>BibTeX</div>
      <CodeBlock language="bibtex">{source.citation.bibtex}</CodeBlock>

      <div className={styles.citationLabel}>Permalink</div>
      <CodeBlock language="text">{permalink}</CodeBlock>
    </div>
  );
}
