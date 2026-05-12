import React from 'react';
import type { Source } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

export default function SourceDimensions({ source }: Props) {
  if (source.dimensions.length === 0) {
    return <p><em>No dimension metadata recorded.</em></p>;
  }
  return (
    <table className={styles.dimensionsTable}>
      <thead>
        <tr>
          <th>Code</th>
          <th>Meaning</th>
          <th>Value format</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {source.dimensions.map((d) => (
          <tr key={d.code}>
            <td className={styles.dimensionCode}>{d.code}</td>
            <td>{d.meaning}</td>
            <td>{d.value_format}</td>
            <td>{d.notes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
