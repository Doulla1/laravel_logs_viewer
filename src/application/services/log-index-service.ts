import type { LogEntry } from '../../domain/log-entry';
import type { LogIndex } from '../../domain/log-index';
import { LOG_LEVELS } from '../../domain/log-level';

export class LogIndexService {
  public build(entries: LogEntry[]): LogIndex {
    const idsByLevel = Object.fromEntries(LOG_LEVELS.map((level) => [level, [] as string[]])) as LogIndex['idsByLevel'];
    const offsetsById: Record<string, number> = {};
    const chronologicalIds = [...entries]
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
      .map((entry) => entry.id);

    let start: string | undefined;
    let end: string | undefined;

    for (const entry of entries) {
      offsetsById[entry.id] = entry.byteOffset;
      idsByLevel[entry.level].push(entry.id);

      const entryIso = entry.timestamp.toISOString();
      start = !start || entryIso < start ? entryIso : start;
      end = !end || entryIso > end ? entryIso : end;
    }

    return {
      totalEntries: entries.length,
      offsetsById,
      idsByLevel,
      chronologicalIds,
      dateRange: {
        start,
        end
      }
    };
  }
}
