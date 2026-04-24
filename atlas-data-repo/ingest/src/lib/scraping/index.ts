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

// Phase 4 will add:
//   sitemap_log API, ingest_runs writer, upsertRecord helper, KeyValueStore
//   wrapper.
