import type { LogLevel } from './log-level';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  channel: string;
  message: string;
  stackTrace?: string;
  context?: Record<string, unknown>;
  sourceFile: string;
  sourceLine: number;
  byteOffset: number;
  requestId?: string;
  userId?: string;
  jobId?: string;
  raw: string;
}
