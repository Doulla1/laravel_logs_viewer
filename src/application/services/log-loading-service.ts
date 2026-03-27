import { stat } from 'node:fs/promises';
import type { LogEntry } from '../../domain/log-entry';
import { LaravelLogStreamReader } from '../../infrastructure/parsing/laravel-log-stream-reader';
import { LaravelLogTextReader } from '../../infrastructure/parsing/laravel-log-text-reader';

interface FileSnapshot {
  path: string;
  size: number;
}

export class LogLoadingService {
  private readonly streamReader: LaravelLogStreamReader;
  private readonly textReader: LaravelLogTextReader;

  public constructor(
    streamReader: LaravelLogStreamReader = new LaravelLogStreamReader(),
    textReader: LaravelLogTextReader = new LaravelLogTextReader()
  ) {
    this.streamReader = streamReader;
    this.textReader = textReader;
  }

  public async loadFromFiles(filePaths: string[]): Promise<LogEntry[]> {
    const batches = await Promise.all(filePaths.map((filePath) => this.streamReader.readEntries(filePath)));

    return batches
      .flat()
      .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
  }

  public loadFromText(text: string, sourceName: string): LogEntry[] {
    return this.textReader.readEntries(text, sourceName);
  }

  public async loadFromFilesIncrementally(
    filePaths: string[],
    previousEntries: LogEntry[],
    previousFiles: FileSnapshot[]
  ): Promise<LogEntry[]> {
    const previousByPath = new Map(previousFiles.map((file) => [file.path, file]));
    const currentStats = await Promise.all(filePaths.map(async (filePath) => ({ path: filePath, size: (await stat(filePath)).size })));
    const entriesByPath = new Map<string, LogEntry[]>();

    for (const entry of previousEntries) {
      const existing = entriesByPath.get(entry.sourceFile) ?? [];
      existing.push(entry);
      entriesByPath.set(entry.sourceFile, existing);
    }

    for (const filePath of filePaths) {
      const current = currentStats.find((item) => item.path === filePath);
      const previous = previousByPath.get(filePath);

      if (!current) {
        continue;
      }

      if (!previous || current.size < previous.size) {
        entriesByPath.set(filePath, await this.streamReader.readEntries(filePath));
        continue;
      }

      if (current.size === previous.size) {
        continue;
      }

      const currentEntries = entriesByPath.get(filePath) ?? [];
      const startOffset = previous.size;
      const appended = await this.streamReader.readEntriesFromOffset(filePath, startOffset);
      entriesByPath.set(filePath, [...currentEntries, ...appended.entries]);
    }

    for (const previousFile of previousFiles) {
      if (!filePaths.includes(previousFile.path)) {
        entriesByPath.delete(previousFile.path);
      }
    }

    return [...entriesByPath.values()]
      .flat()
      .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
  }
}
