import React from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import type { Source } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

export default function SourceCitation({ source }: Props) {
  // The site's own URL, from Docusaurus config — never a literal (urb-agents #1245).
  const siteUrl = useDocusaurusContext().siteConfig.url;
  const permalink = `${siteUrl}/datasets/${source.source_id}`;
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
