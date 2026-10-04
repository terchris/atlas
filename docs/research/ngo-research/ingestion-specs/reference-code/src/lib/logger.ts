/**
 * file: ingest/src/lib/logger.ts
 */
const LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const;
type Level = (typeof LEVELS)[number];
const current: Level = (process.env.LOG_LEVEL as Level) || 'INFO';
const on = (l: Level) => LEVELS.indexOf(l) <= LEVELS.indexOf(current);
export const Logger = {
  error: (m: string) => on('ERROR') && console.error(`  ! ${m}`),
  warn: (m: string) => on('WARN') && console.warn(`  ~ ${m}`),
  info: (m: string) => on('INFO') && console.log(m),
  debug: (m: string) => on('DEBUG') && console.log(`  · ${m}`),
};
export default Logger;
