export const LOG_LEVELS = ['DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const NORMALIZED_LEVELS: Record<string, LogLevel> = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  NOTICE: 'NOTICE',
  WARNING: 'WARNING',
  WARN: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

export function normalizeLogLevel(level: string): LogLevel {
  const normalized = NORMALIZED_LEVELS[level.toUpperCase()];
  return normalized ?? 'INFO';
}
