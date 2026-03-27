import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { LogEntry } from '../../domain/log-entry';
import { LaravelLogParser } from './laravel-log-parser';

const ENTRY_HEADER_PATTERN = /^(?:\[[^\]]+\]\s[\w.-]+\.[A-Z]+:\s|\{)/;

interface ReadResult {
  entries: LogEntry[];
  endOffset: number;
}

export class LaravelLogStreamReader {
  private readonly parser: LaravelLogParser;

  public constructor(parser: LaravelLogParser = new LaravelLogParser()) {
    this.parser = parser;
  }

  public async readEntries(filePath: string): Promise<LogEntry[]> {
    const result = await this.read(filePath, 0);
    return result.entries;
  }

  public async readEntriesFromOffset(filePath: string, startOffset: number): Promise<ReadResult> {
    return this.read(filePath, startOffset);
  }

  private async read(filePath: string, startOffset: number): Promise<ReadResult> {
    const entries: LogEntry[] = [];
    const stream = createReadStream(filePath, { encoding: 'utf8', start: startOffset });
    const reader = createInterface({
      input: stream,
      crlfDelay: Number.POSITIVE_INFINITY
    });

    let currentEntryLines: string[] = [];
    let currentEntryLine = 1;
    let currentEntryOffset = 0;
    let lineNumber = 0;
    let byteOffset = startOffset;

    try {
      for await (const line of reader) {
        lineNumber += 1;
        const lineOffset = byteOffset;
        byteOffset += Buffer.byteLength(line, 'utf8') + 1;

        if (ENTRY_HEADER_PATTERN.test(line)) {
          this.pushCurrentEntry(entries, currentEntryLines, filePath, currentEntryLine, currentEntryOffset);
          currentEntryLines = [line];
          currentEntryLine = lineNumber;
          currentEntryOffset = lineOffset;
          continue;
        }

        if (currentEntryLines.length === 0) {
          continue;
        }

        currentEntryLines.push(line);
      }

      this.pushCurrentEntry(entries, currentEntryLines, filePath, currentEntryLine, currentEntryOffset);
      return {
        entries,
        endOffset: byteOffset
      };
    } finally {
      reader.close();
      stream.destroy();
    }
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
