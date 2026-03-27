import type { LogLevel } from './log-level';

export interface LogIndex {
  totalEntries: number;
  offsetsById: Record<string, number>;
  idsByLevel: Record<LogLevel, string[]>;
  chronologicalIds: string[];
  dateRange: {
    start?: string;
    end?: string;
  };
}
