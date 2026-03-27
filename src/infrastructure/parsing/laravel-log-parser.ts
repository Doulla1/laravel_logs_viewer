import type { LogEntry } from '../../domain/log-entry';
import { normalizeLogLevel } from '../../domain/log-level';

interface ParseMetadata {
  sourceFile: string;
  sourceLine: number;
  byteOffset: number;
}

interface JsonLogPayload {
  message?: unknown;
  context?: unknown;
  level_name?: unknown;
  channel?: unknown;
  datetime?: unknown;
  extra?: unknown;
}

interface JsonLogExtra {
  request_id?: unknown;
  source?: {
    file?: unknown;
    line?: unknown;
  };
}

const HEADER_PATTERN = /^\[(?<timestamp>[^\]]+)\]\s(?<channel>[\w.-]+)\.(?<level>[A-Z]+):\s(?<message>[\s\S]*)$/;
const CONTEXT_PATTERN = /(\{[\s\S]*\})$/;
const INLINE_CONTEXT_PATTERN = /^(?<message>[\s\S]*?)\s(?<context>\{.*\})$/;

export class LaravelLogParser {
  public parseEntry(raw: string, metadata: ParseMetadata): LogEntry | undefined {
    const firstLine = raw.split('\n', 1)[0] ?? '';
    const match = HEADER_PATTERN.exec(firstLine);

    if (!match?.groups) {
      return this.parseJsonEntry(raw, metadata);
    }

    const timestamp = new Date(match.groups.timestamp);
    const parsedMessage = this.extractMessageAndContext(match.groups.message.trim());
    const context = parsedMessage.context ?? this.extractContext(raw);

    return {
      id: `${metadata.sourceFile}:${metadata.sourceLine}:${metadata.byteOffset}`,
      timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
      level: normalizeLogLevel(match.groups.level),
      channel: match.groups.channel,
      message: parsedMessage.message,
      stackTrace: this.extractStackTrace(raw),
      context,
      sourceFile: metadata.sourceFile,
      sourceLine: metadata.sourceLine,
      byteOffset: metadata.byteOffset,
      requestId: this.extractIdentifier(raw, /request[_-]?id\s*[:=]\s*([\w-]+)/i),
      userId: this.extractIdentifier(raw, /user[_-]?id\s*[:=]\s*([\w-]+)/i),
      jobId: this.extractIdentifier(raw, /job[_-]?id\s*[:=]\s*([\w-]+)/i),
      raw
    };
  }

  private extractStackTrace(raw: string): string | undefined {
    const lines = raw.split('\n');
    if (lines.length <= 1) {
      return undefined;
    }

    return lines.slice(1).join('\n').trim() || undefined;
  }

  private extractContext(raw: string): Record<string, unknown> | undefined {
    const match = CONTEXT_PATTERN.exec(raw);

    if (!match) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(match[1]);
      return typeof parsed === 'object' && parsed ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private extractIdentifier(raw: string, pattern: RegExp): string | undefined {
    const match = pattern.exec(raw);
    return match?.[1];
  }

  private parseJsonEntry(raw: string, metadata: ParseMetadata): LogEntry | undefined {
    let parsed: JsonLogPayload;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }

    const extra = this.asObject(parsed.extra) as JsonLogExtra | undefined;
    const context = this.asObject(parsed.context);
    const source = this.asObject(extra?.source);
    const message = typeof parsed.message === 'string' ? parsed.message : raw;
    const timestamp = new Date(typeof parsed.datetime === 'string' ? parsed.datetime : Date.now());
    const requestId = this.findValueByKey(parsed, ['request_id', 'requestId']);
    const userId = this.findValueByKey(parsed, ['user_id', 'userId']);
    const jobId = this.findValueByKey(parsed, ['job_id', 'jobId']);
    const sourceFile = typeof source?.file === 'string' && source.file.trim() ? source.file : metadata.sourceFile;
    const sourceLine = typeof source?.line === 'number' ? source.line : metadata.sourceLine;
    const mergedContext = this.mergeJsonContext(context, extra);

    return {
      id: `${metadata.sourceFile}:${metadata.sourceLine}:${metadata.byteOffset}`,
      timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
      level: normalizeLogLevel(typeof parsed.level_name === 'string' ? parsed.level_name : 'INFO'),
      channel: typeof parsed.channel === 'string' ? parsed.channel : 'log',
      message,
      stackTrace: this.extractJsonStackTrace(context),
      context: mergedContext,
      sourceFile,
      sourceLine,
      byteOffset: metadata.byteOffset,
      requestId,
      userId,
      jobId,
      raw
    };
  }

  private extractMessageAndContext(message: string): {
    message: string;
    context?: Record<string, unknown>;
  } {
    const inlineContext = INLINE_CONTEXT_PATTERN.exec(message);

    if (!inlineContext?.groups) {
      return { message };
    }

    try {
      const parsed = JSON.parse(inlineContext.groups.context);
      return {
        message: inlineContext.groups.message.trim(),
        context: typeof parsed === 'object' && parsed ? parsed : undefined
      };
    } catch {
      return { message };
    }
  }

  private mergeJsonContext(
    context: Record<string, unknown> | undefined,
    extra: JsonLogExtra | undefined
  ): Record<string, unknown> | undefined {
    if (!context && !extra) {
      return undefined;
    }

    const merged: Record<string, unknown> = {};

    if (context && Object.keys(context).length > 0) {
      merged.context = context;
    }

    if (extra && Object.keys(extra).length > 0) {
      merged.extra = extra;
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private extractJsonStackTrace(context: Record<string, unknown> | undefined): string | undefined {
    const exception = this.asObject(context?.exception);

    if (!exception) {
      return undefined;
    }

    return this.renderException(exception).trim() || undefined;
  }

  private renderException(exception: Record<string, unknown>, depth = 0): string {
    const indent = '  '.repeat(depth);
    const lines: string[] = [];
    const className = typeof exception.class === 'string' ? exception.class : 'Exception';
    const message = typeof exception.message === 'string' ? exception.message : '';
    const file = typeof exception.file === 'string' ? exception.file : '';

    lines.push(`${indent}${className}: ${message}`.trim());

    if (file) {
      lines.push(`${indent}at ${file}`);
    }

    const previous = this.asObject(exception.previous);
    if (previous) {
      lines.push(`${indent}Caused by:`);
      lines.push(this.renderException(previous, depth + 1));
    }

    return lines.join('\n');
  }

  private findValueByKey(input: unknown, keys: string[]): string | undefined {
    if (Array.isArray(input)) {
      for (const item of input) {
        const result = this.findValueByKey(item, keys);
        if (result) {
          return result;
        }
      }

      return undefined;
    }

    if (!this.isRecord(input)) {
      return undefined;
    }

    for (const key of keys) {
      const value = input[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }

      if (typeof value === 'number') {
        return String(value);
      }
    }

    for (const value of Object.values(input)) {
      const result = this.findValueByKey(value, keys);
      if (result) {
        return result;
      }
    }

    return undefined;
  }

  private asObject(value: unknown): Record<string, unknown> | undefined {
    return this.isRecord(value) ? value : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
