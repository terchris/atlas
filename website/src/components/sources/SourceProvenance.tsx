import React from 'react';
import type { Source } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.provenanceRow}>
      <span className={styles.provenanceLabel}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

export default function SourceProvenance({ source }: Props) {
  const landingPage = source.upstream_landing_page || source.upstream_url;
  return (
    <div className={styles.provenance}>
      <Row label="Publisher">{source.publisher.display_name}</Row>
      <Row label="Upstream ID">
        <code>{source.upstream_id}</code>
      </Row>
      <Row label="Upstream URL">
        <a href={source.upstream_url} target="_blank" rel="noopener noreferrer">
          {source.upstream_url}
        </a>
      </Row>
      {source.upstream_landing_page && (
        <Row label="Landing page">
          <a href={source.upstream_landing_page} target="_blank" rel="noopener noreferrer">
            {source.upstream_landing_page}
          </a>
        </Row>
      )}
      <Row label="License">
        <a href={source.license_url === 'internal' ? '#' : source.license_url} target="_blank" rel="noopener noreferrer">
          {source.license}
        </a>
      </Row>
      <Row label="Periodicity">{source.periodicity}</Row>
      <Row label="EU Data Theme">
        <code>{source.eu_theme}</code>
      </Row>
      <Row label="Attribution">{source.attribution}</Row>
      {source.methodology_notes ? (
        <Row label="Methodology">
          <div style={{ whiteSpace: 'pre-wrap' }}>{source.methodology_notes}</div>
        </Row>
      ) : (
        <Row label="Methodology">
          <em>No methodology notes recorded yet — see upstream documentation at <a href={landingPage} target="_blank" rel="noopener noreferrer">{source.publisher.display_name}</a>.</em>
        </Row>
      )}
    </div>
  );
}
