import React from 'react';
import type { Source } from '../../types/sources';

interface Props {
  source: Source;
}

/**
 * Emits Schema.org `Dataset` JSON-LD for the per-source page. Indexed by
 * Google Dataset Search and consumed by LLM crawlers. Cheap structured-data
 * win for SEO + discoverability outside Atlas (per **[Q19]**).
 */
export default function SchemaOrgDataset({ source }: Props) {
  const url = `https://atlas.sovereignsky.no/datasets/${source.source_id}`;

  const temporalCoverage = source.time_coverage.start && source.time_coverage.end
    ? `${source.time_coverage.start}/${source.time_coverage.end}`
    : undefined;

  const payload: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: source.upstream_title,
    description: source.description,
    identifier: source.source_id,
    url,
    sameAs: source.upstream_landing_page || source.upstream_url,
    license: source.license_url === 'internal' ? undefined : source.license_url,
    keywords: source.keywords,
    isAccessibleForFree: true,
    creator: {
      '@type': 'Organization',
      name: source.publisher.display_name,
      url: source.publisher.homepage,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Atlas',
      url: 'https://atlas.sovereignsky.no',
    },
    distribution: {
      '@type': 'DataDownload',
      contentUrl: source.sample_query,
      encodingFormat: 'application/json',
    },
  };
  if (temporalCoverage) payload.temporalCoverage = temporalCoverage;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload, null, 2) }}
    />
  );
}
