/**
 * Minimal level-aware logger.
 *
 * Threshold is set from `LOG_LEVEL` (default `info`). Calls below the
 * threshold are compiled to no-ops at module-load time so they cost nothing
 * in hot paths.
 */

type LogFn = (...args: unknown[]) => void;

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

const LEVEL_RANK: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function thresholdFromEnv(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVEL_RANK[raw] ?? LEVEL_RANK.info!;
}

function make(level: keyof Logger, sink: (...args: unknown[]) => void, threshold: number): LogFn {
  if (LEVEL_RANK[level]! < threshold) return () => {};
  const prefix = `[${level}]`;
  return (...args: unknown[]) => sink(prefix, ...args);
}

const threshold = thresholdFromEnv();

export const log: Logger = {
  debug: make("debug", console.debug, threshold),
  info: make("info", console.log, threshold),
  warn: make("warn", console.warn, threshold),
  error: make("error", console.error, threshold),
};
