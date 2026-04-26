/**
 * Minimal structured JSON logger. One line per event; keys are stable so Loki
 * (in the UIS observability stack) can parse them cleanly. Intentionally tiny —
 * no levels filtering, no formatters, no metadata inheritance. Add complexity
 * when a concrete need appears.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export function log(
  level: LogLevel,
  msg: string,
  data?: Record<string, unknown>,
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(data ?? {}),
  };
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(line)}\n`);
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
};
