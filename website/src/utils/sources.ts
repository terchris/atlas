/**
 * Helpers for accessing the sources-registry.json. Components use these
 * rather than reading the JSON directly so type narrowing is consistent
 * across the catalog UI.
 */

import registryData from '../data/sources-registry.json';
import type { Registry, Source, Publisher, Category, View } from '../types/sources';

const registry = registryData as Registry;

export function getRegistry(): Registry {
  return registry;
}

export function getAllSources(): Source[] {
  return registry.sources;
}

export function getAllPublishers(): Publisher[] {
  return registry.publishers;
}

export function getAllCategories(): Category[] {
  return registry.categories;
}

export function sourceById(id: string): Source | undefined {
  return registry.sources.find((s) => s.source_id === id);
}

export function sourcesByCategory(categoryId: string): Source[] {
  return registry.sources.filter((s) => s.category.id === categoryId);
}

export function sourcesByPublisher(publisherId: string): Source[] {
  return registry.sources.filter((s) => s.publisher.id === publisherId);
}

export function publisherById(id: string): Publisher | undefined {
  return registry.publishers.find((p) => p.id === id);
}

export function categoryById(id: string): Category | undefined {
  return registry.categories.find((c) => c.id === id);
}

export function getAllViews(): View[] {
  return registry.views;
}

export function viewById(id: string): View | undefined {
  return registry.views.find((v) => v.view_id === id);
}

/**
 * Find every view (Atlas-built dataset) reachable from this source. Walks
 * transitively through the dbt model graph: a view "uses" a source if the
 * source appears anywhere in the view's lineage, not only as a direct ref.
 *
 * Implementation reads the transitive lineage projected onto each source
 * (via `consuming_marts` on the source side, which was computed from
 * `lineage.csv` transitively in the generator). This stays correct even
 * after `built_from` was switched to direct refs only — sources keep their
 * full reach map.
 */
export function viewsUsingSource(sourceId: string): View[] {
  const source = registry.sources.find((s) => s.source_id === sourceId);
  if (!source) return [];
  const consumingViewIds = new Set(source.consuming_marts.map((m) => m.api_v1_name));
  return registry.views.filter((v) => consumingViewIds.has(v.api_v1_name));
}
