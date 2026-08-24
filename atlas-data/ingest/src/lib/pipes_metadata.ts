/**
 * Building the metadata payload for a Dagster Pipes materialisation.
 *
 * Extracted and pure so it can be unit-tested: the bug this fixes was invisible
 * for three integration-test rounds because the failure path is swallowed by
 * design (see recordIngestRun — telemetry must never break an ingest).
 *
 * The bug: the JS Pipes SDK's `normalizeMetadata` inspects each value with
 * `'type' in value`, which throws `TypeError: Cannot use 'in' operator to
 * search for 'type' in null` the moment any value is null. We were passing
 * null for every field the source didn't populate, so the whole
 * `reportAssetMaterialization` call threw, was caught, and logged a warning —
 * leaving a materialisation with NO metadata at all. Row counts reached
 * Postgres but never the Dagster UI.
 *
 * So: omit absent values rather than nulling them.
 */

export type MaterializationMetadata = Record<string, string | number | boolean>;

export interface MetadataSource {
  rowsScraped?: number | null;
  rowsParsed?: number | null;
  rowsSkipped?: number | null;
  warningsCount?: number | null;
  errorsCount?: number | null;
  upstreamUpdatedAt?: Date | null;
}

/**
 * Build the metadata object for `reportAssetMaterialization`.
 *
 * Only defined, non-null values are included — a null value makes the SDK
 * throw and costs you the entire payload, not just that one entry.
 */
export function buildMaterializationMetadata(
  sourceId: string,
  record: MetadataSource,
  runId: number | null,
): MaterializationMetadata {
  const metadata: MaterializationMetadata = { source_id: sourceId };

  const put = (key: string, value: number | null | undefined): void => {
    if (value !== null && value !== undefined) metadata[key] = value;
  };

  put("ingest_run_id", runId);
  put("rows_scraped", record.rowsScraped);
  put("rows_parsed", record.rowsParsed);
  put("rows_skipped", record.rowsSkipped);
  put("warnings_count", record.warningsCount);
  put("errors_count", record.errorsCount);

  if (record.upstreamUpdatedAt) {
    metadata["upstream_updated_at"] = record.upstreamUpdatedAt.toISOString();
  }
  return metadata;
}
