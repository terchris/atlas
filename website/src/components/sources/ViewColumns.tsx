import React from 'react';
import type { View } from '../../types/sources';
import styles from './styles.module.css';

interface Props {
  view: View;
}

/**
 * Column listing for an Atlas view. Reads from the dbt schema.yml columns
 * array via the generator. Schema.yml is the source of truth — descriptions
 * here propagate from there.
 */
export default function ViewColumns({ view }: Props) {
  if (view.columns.length === 0) {
    return <p><em>No column metadata recorded.</em></p>;
  }
  return (
    <table className={styles.dimensionsTable}>
      <thead>
        <tr>
          <th>Column</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {view.columns.map((c) => (
          <tr key={c.name}>
            <td className={styles.dimensionCode}>{c.name}</td>
            <td>{c.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
