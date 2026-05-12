import React from 'react';
import Link from '@docusaurus/Link';
import type { Source } from '../../types/sources';
import { sourceById } from '../../utils/sources';
import styles from './styles.module.css';

interface Props {
  source: Source;
}

type Entry = { source: Source; kind: 'Suggested join' | 'Same topic' };

/**
 * Combine manifest `suggested_joins[]` (editorially-authored) + computed
 * `related_by_topic` (same `tags.topic`). Manifest joins take precedence;
 * dedupe; cap at 6 cards.
 */
function buildEntries(s: Source): Entry[] {
  const seen = new Set<string>([s.source_id]);
  const entries: Entry[] = [];

  for (const id of s.suggested_joins) {
    if (seen.has(id)) continue;
    const target = sourceById(id);
    if (!target) continue;
    seen.add(id);
    entries.push({ source: target, kind: 'Suggested join' });
  }
  for (const id of s.related_by_topic) {
    if (seen.has(id)) continue;
    const target = sourceById(id);
    if (!target) continue;
    seen.add(id);
    entries.push({ source: target, kind: 'Same topic' });
  }
  return entries.slice(0, 6);
}

export default function RelatedSources({ source }: Props) {
  const entries = buildEntries(source);
  if (entries.length === 0) {
    return <p><em>No related sources identified yet.</em></p>;
  }
  return (
    <div className={styles.relatedStrip}>
      {entries.map(({ source: s, kind }) => (
        <Link key={s.source_id} to={`/datasets/${s.source_id}`} className={styles.relatedCard}>
          <span className={styles.relatedKind}>{kind}</span>
          <span className={styles.relatedTitle}>{s.upstream_title}</span>
          <span className={styles.cardCategory}>
            {s.category.emoji} {s.category.name} · {s.publisher.display_name}
          </span>
        </Link>
      ))}
    </div>
  );
}
