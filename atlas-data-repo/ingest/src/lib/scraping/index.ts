// Shared scraping infrastructure for Atlas NGO-site scrapers.
// See docs/ai-developer/plans/backlog/INVESTIGATE-ngo-scraping-infrastructure.md
// Modules land here in Phases 3–4 of PLAN-001-scraping-infrastructure.md.
//
// Exports planned:
//   - buildUserAgent, USER_AGENT        (ua.ts — Phase 3)
//   - recordHash                        (record_hash.ts — Phase 3)
//   - htmlRawHash                       (html_raw_hash.ts — Phase 3)
//   - fetchRobots, isAllowed            (robots.ts — Phase 3)
//   - sitemap_log API                   (sitemap_log.ts — Phase 4)
//   - startRun, finishRun               (ingest_runs.ts — Phase 4)
//   - upsertRecord                      (upsert_record.ts — Phase 4)
//   - KeyValueStore factory             (kv.ts — Phase 4)

export {};
