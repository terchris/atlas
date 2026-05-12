import React from 'react';
import sampleRowsData from '../../data/sample-rows-snapshot.json';
import styles from './styles.module.css';

interface SnapshotPayload {
  generated_at: string;
  source_url: string;
  row_limit: number;
  sources: Record<string, { raw_table: string; rows: Record<string, unknown>[] }>;
  views: Record<string, { mart_name: string; rows: Record<string, unknown>[] }>;
}

const snapshot = sampleRowsData as Partial<SnapshotPayload>;

interface SourceProps {
  kind: 'source';
  sourceId: string;
}

interface ViewProps {
  kind: 'view';
  apiV1Name: string;
}

type Props = SourceProps | ViewProps;

function resolveRows(props: Props): { rows: Record<string, unknown>[]; tableLabel: string } | null {
  if (props.kind === 'source') {
    const entry = snapshot.sources?.[props.sourceId];
    if (!entry || entry.rows.length === 0) return null;
    return { rows: entry.rows, tableLabel: `raw.${entry.raw_table}` };
  }
  const entry = snapshot.views?.[props.apiV1Name];
  if (!entry || entry.rows.length === 0) return null;
  return { rows: entry.rows, tableLabel: `api_v1.${props.apiV1Name}` };
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // Compact JSON for nested objects / arrays — keeps the table from blowing
  // out vertically when a column is e.g. values_json.
  const json = JSON.stringify(value);
  return json.length > 80 ? json.slice(0, 77) + '…' : json;
}

/**
 * Build-time snapshot of the first 5 rows from PostgREST, rendered as a
 * compact table on the dataset hero. Falls back to null when the snapshot
 * is absent for this dataset — the hero just skips the section. Sources
 * read from `raw.*` (Accept-Profile: raw); views from `api_v1.*` (default).
 * Refresh via `npm run sources:snapshot-samples` in website/.
 */
export default function DatasetSamplePreview(props: Props) {
  const resolved = resolveRows(props);
  if (!resolved) return null;

  const { rows, tableLabel } = resolved;
  const columns = Object.keys(rows[0]);
  const generatedAt = snapshot.generated_at ? snapshot.generated_at.slice(0, 10) : null;

  return (
    <div className={styles.samplePreview}>
      <div className={styles.samplePreviewHeader}>
        <div className={styles.samplePreviewLabel}>
          First {rows.length} rows · <code>{tableLabel}</code>
        </div>
        {generatedAt && (
          <div className={styles.samplePreviewTimestamp}>snapshot {generatedAt}</div>
        )}
      </div>
      <div className={styles.samplePreviewTableWrap}>
        <table className={styles.samplePreviewTable}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c}>{formatCell(row[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
