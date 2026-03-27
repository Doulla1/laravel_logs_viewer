import type { LogEntry } from '../../domain/log-entry';
import { LaravelLogParser } from './laravel-log-parser';

const ENTRY_HEADER_PATTERN = /^(?:\[[^\]]+\]\s[\w.-]+\.[A-Z]+:\s|\{)/;

export class LaravelLogTextReader {
  private readonly parser: LaravelLogParser;

  public constructor(parser: LaravelLogParser = new LaravelLogParser()) {
    this.parser = parser;
  }

  public readEntries(text: string, sourceName: string): LogEntry[] {
    if (!text.trim()) {
      return [];
    }

    const entries: LogEntry[] = [];
    const normalized = text.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    let currentEntryLines: string[] = [];
    let currentEntryLine = 1;
    let currentEntryOffset = 0;
    let byteOffset = 0;

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const lineOffset = byteOffset;
      byteOffset += Buffer.byteLength(line, 'utf8') + 1;

      if (ENTRY_HEADER_PATTERN.test(line)) {
        this.pushCurrentEntry(entries, currentEntryLines, sourceName, currentEntryLine, currentEntryOffset);
        currentEntryLines = [line];
        currentEntryLine = lineNumber;
        currentEntryOffset = lineOffset;
        return;
      }

      if (currentEntryLines.length === 0) {
        return;
      }

      currentEntryLines.push(line);
    });

    this.pushCurrentEntry(entries, currentEntryLines, sourceName, currentEntryLine, currentEntryOffset);

    return entries.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
  }

  private pushCurrentEntry(
    entries: LogEntry[],
    lines: string[],
    sourceFile: string,
    sourceLine: number,
    byteOffset: number
  ): void {
    if (lines.length === 0) {
      return;
    }

    const raw = lines.join('\n');
    const entry = this.parser.parseEntry(raw, {
      sourceFile,
      sourceLine,
      byteOffset
    });

    if (entry) {
      entries.push(entry);
    }
  }
}
