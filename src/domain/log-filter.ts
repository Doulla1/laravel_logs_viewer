import type { LogEntry } from './log-entry';
import type { LogLevel } from './log-level';

export type SortDirection = 'asc' | 'desc';

export interface DateRange {
  start?: Date;
  end?: Date;
}

export interface LogFilter {
  text?: string;
  levels: Set<LogLevel>;
  range: DateRange;
  sortDirection: SortDirection;
}

export interface SerializedLogFilter {
  text?: string;
  levels: LogLevel[];
  range: {
    start?: string;
    end?: string;
  };
  sortDirection: SortDirection;
}

export interface SavedView {
  id: string;
  name: string;
  filter: LogFilter;
}

export interface QueryResult {
  entries: LogEntry[];
  total: number;
}

export function createDefaultLogFilter(): LogFilter {
  return {
    text: '',
    levels: new Set<LogLevel>(['ERROR', 'WARNING', 'INFO']),
    range: {},
    sortDirection: 'desc'
  };
}

export function serializeLogFilter(filter: LogFilter): SerializedLogFilter {
  return {
    text: filter.text,
    levels: [...filter.levels],
    range: {
      start: filter.range.start?.toISOString(),
      end: filter.range.end?.toISOString()
    },
    sortDirection: filter.sortDirection
  };
}

export function deserializeLogFilter(filter: SerializedLogFilter): LogFilter {
  return {
    text: filter.text,
    levels: new Set(filter.levels),
    range: {
      start: filter.range.start ? new Date(filter.range.start) : undefined,
      end: filter.range.end ? new Date(filter.range.end) : undefined
    },
    sortDirection: filter.sortDirection
  };
}
