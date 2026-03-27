import type { LogEntry } from '../../domain/log-entry';
import type { LogFilter, QueryResult } from '../../domain/log-filter';

export class LogQueryService {
  public apply(entries: LogEntry[], filter: LogFilter): QueryResult {
    const filtered = entries
      .filter((entry) => this.matchesLevel(entry, filter))
      .filter((entry) => this.matchesDateRange(entry, filter))
      .filter((entry) => this.matchesText(entry, filter));

    const sorted = [...filtered].sort((a, b) =>
      filter.sortDirection === 'asc'
        ? a.timestamp.getTime() - b.timestamp.getTime()
        : b.timestamp.getTime() - a.timestamp.getTime()
    );

    return {
      entries: sorted,
      total: sorted.length
    };
  }

  private matchesLevel(entry: LogEntry, filter: LogFilter): boolean {
    return filter.levels.size === 0 || filter.levels.has(entry.level);
  }

  private matchesDateRange(entry: LogEntry, filter: LogFilter): boolean {
    const entryTimestamp = entry.timestamp.getTime();

    if (filter.range.start && entryTimestamp < filter.range.start.getTime()) {
      return false;
    }

    if (filter.range.end && entryTimestamp > filter.range.end.getTime()) {
      return false;
    }

    return true;
  }

  private matchesText(entry: LogEntry, filter: LogFilter): boolean {
    const text = (filter.text ?? '').trim().toLowerCase();

    if (!text) {
      return true;
    }

    const searchable = [entry.message, entry.stackTrace, entry.raw]
      .filter((value): value is string => typeof value === 'string')
      .join('\n')
      .toLowerCase();

    return searchable.includes(text);
  }
}
