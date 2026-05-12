import React, { useMemo, useState } from 'react';
import type { Source } from '../../types/sources';
import { getAllSources } from '../../utils/sources';
import SourceCard from './SourceCard';
import styles from './styles.module.css';

type FacetKey = 'provider' | 'geo' | 'cadence' | 'lifecycle' | 'eu_theme';

interface FacetSet {
  provider: Set<string>;
  geo: Set<string>;
  cadence: Set<string>;
  lifecycle: Set<string>;
  eu_theme: Set<string>;
}

const FACET_LABELS: Record<FacetKey, string> = {
  provider: 'Provider',
  geo: 'Geography',
  cadence: 'Cadence',
  lifecycle: 'Status',
  eu_theme: 'EU theme',
};

function getFacetValue(source: Source, key: FacetKey): string {
  if (key === 'lifecycle') return source.lifecycle;
  if (key === 'eu_theme') return source.eu_theme;
  return source.tags[key];
}

function buildFacetCounts(sources: Source[], key: FacetKey): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sources) {
    const v = getFacetValue(s, key);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

function matchesSearch(source: Source, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    source.source_id.toLowerCase().includes(q) ||
    source.upstream_title.toLowerCase().includes(q) ||
    source.description.toLowerCase().includes(q) ||
    source.publisher.display_name.toLowerCase().includes(q) ||
    source.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

function matchesFacets(source: Source, facets: FacetSet): boolean {
  return (Object.keys(facets) as FacetKey[]).every((k) => {
    const selected = facets[k];
    if (selected.size === 0) return true;
    return selected.has(getFacetValue(source, k));
  });
}

const FACET_KEYS: FacetKey[] = ['provider', 'geo', 'cadence', 'lifecycle', 'eu_theme'];

export default function SourcesBrowse() {
  const allSources = getAllSources();
  const [query, setQuery] = useState('');
  const [facets, setFacets] = useState<FacetSet>({
    provider: new Set(),
    geo: new Set(),
    cadence: new Set(),
    lifecycle: new Set(),
    eu_theme: new Set(),
  });

  const toggleFacet = (key: FacetKey, value: string) => {
    setFacets((prev) => {
      const next: FacetSet = {
        provider: new Set(prev.provider),
        geo: new Set(prev.geo),
        cadence: new Set(prev.cadence),
        lifecycle: new Set(prev.lifecycle),
        eu_theme: new Set(prev.eu_theme),
      };
      if (next[key].has(value)) next[key].delete(value);
      else next[key].add(value);
      return next;
    });
  };

  const filtered = useMemo(
    () => allSources.filter((s) => matchesSearch(s, query) && matchesFacets(s, facets)),
    [allSources, query, facets],
  );

  const facetCounts = useMemo(() => {
    const out: Record<FacetKey, Map<string, number>> = {
      provider: buildFacetCounts(allSources, 'provider'),
      geo: buildFacetCounts(allSources, 'geo'),
      cadence: buildFacetCounts(allSources, 'cadence'),
      lifecycle: buildFacetCounts(allSources, 'lifecycle'),
      eu_theme: buildFacetCounts(allSources, 'eu_theme'),
    };
    return out;
  }, [allSources]);

  return (
    <div className={styles.browseLayout}>
      <aside className={styles.facetSidebar}>
        {FACET_KEYS.map((key) => {
          const counts = facetCounts[key];
          const values = Array.from(counts.entries()).sort(
            (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
          );
          return (
            <div key={key} className={styles.facetGroup}>
              <div className={styles.facetTitle}>{FACET_LABELS[key]}</div>
              {values.map(([value, count]) => (
                <label key={value} className={styles.facetOption}>
                  <input
                    type="checkbox"
                    checked={facets[key].has(value)}
                    onChange={() => toggleFacet(key, value)}
                  />
                  <span>{value}</span>
                  <span className={styles.facetCount}>({count})</span>
                </label>
              ))}
            </div>
          );
        })}
      </aside>
      <div>
        <input
          type="search"
          className={styles.browseSearchInput}
          placeholder="Search by title, description, keyword, publisher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.browseResultCount}>
          Showing {filtered.length} of {allSources.length} sources
        </div>
        {filtered.length === 0 ? (
          <div className={styles.browseEmpty}>No sources match the current filter.</div>
        ) : (
          <div className={styles.cardGrid}>
            {filtered.map((s) => <SourceCard key={s.source_id} source={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}
