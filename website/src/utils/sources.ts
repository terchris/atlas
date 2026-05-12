/**
 * Helpers for accessing the sources-registry.json. Components use these
 * rather than reading the JSON directly so type narrowing is consistent
 * across the catalog UI.
 */

import registryData from '../data/sources-registry.json';
import type { Registry, Source, Publisher, Category } from '../types/sources';

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
