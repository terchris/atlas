// Shared scraping infrastructure for Atlas NGO-site scrapers.
// See docs/ai-developer/plans/backlog/INVESTIGATE-ngo-scraping-infrastructure.md

export { buildUserAgent, MissingContactEmailError } from "./ua.js";
export { recordHash } from "./record_hash.js";
export { htmlRawHash, canonicalizeHtmlBody } from "./html_raw_hash.js";
export {
  fetchRobots,
  parseRobots,
  isAllowed,
  type RobotsRules,
  type RobotsGroup,
} from "./robots.js";

export {
  readPriorState,
  decideFetch,
  upsertDiscovered,
  detectOrphans,
  type DiscoveredUrl,
  type PriorState,
  type PriorStateEntry,
  type FetchDecision,
  type FetchAction,
} from "./sitemap_log.js";

export {
  startRun,
  finishRun,
  IngestInProgressError,
  type RunHandle,
  type FinishRunArgs,
} from "./ingest_runs.js";

export {
  upsertRecord,
  type UpsertRecordOpts,
  type UpsertRecordResult,
} from "./upsert_record.js";

export {
  getSourceKv,
  setCached,
  getCachedBody,
  getCachedMetadata,
  hasCached,
  type CacheMetadata,
} from "./kv.js";
