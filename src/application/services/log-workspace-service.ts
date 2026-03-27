import { stat } from 'node:fs/promises';
import type { LogEntry } from '../../domain/log-entry';
import type { LogIndex } from '../../domain/log-index';
import { LogIndexService } from './log-index-service';
import { LogLoadingService } from './log-loading-service';

export interface FileSnapshot {
  path: string;
  size: number;
}

export interface LogWorkspaceSnapshot {
  entries: LogEntry[];
  index: LogIndex;
  files: FileSnapshot[];
  totalBytes: number;
  status: 'live' | 'file too large' | 'no match';
}

export class LogWorkspaceService {
  private readonly loadingService: LogLoadingService;
  private readonly indexService: LogIndexService;

  public constructor(
    loadingService: LogLoadingService = new LogLoadingService(),
    indexService: LogIndexService = new LogIndexService()
  ) {
    this.loadingService = loadingService;
    this.indexService = indexService;
  }

  public async load(filePaths: string[], maxFileBytes: number): Promise<LogWorkspaceSnapshot> {
    if (filePaths.length === 0) {
      return {
        entries: [],
        index: this.indexService.build([]),
        files: [],
        totalBytes: 0,
        status: 'no match'
      };
    }

    const stats = await Promise.all(filePaths.map(async (filePath) => ({ path: filePath, size: (await stat(filePath)).size })));
    const totalBytes = stats.reduce((sum, item) => sum + item.size, 0);
    const entries = await this.loadingService.loadFromFiles(filePaths);
    const index = this.indexService.build(entries);

    return {
      entries,
      index,
      files: stats,
      totalBytes,
      status: totalBytes > maxFileBytes ? 'file too large' : 'live'
    };
  }

  public loadFromText(text: string, sourceName: string): LogWorkspaceSnapshot {
    const entries = this.loadingService.loadFromText(text, sourceName);
    const totalBytes = Buffer.byteLength(text, 'utf8');

    return {
      entries,
      index: this.indexService.build(entries),
      files: [],
      totalBytes,
      status: totalBytes > 0 ? 'live' : 'no match'
    };
  }

  public async refreshIncrementally(
    filePaths: string[],
    previousSnapshot: LogWorkspaceSnapshot,
    maxFileBytes: number
  ): Promise<LogWorkspaceSnapshot> {
    if (filePaths.length === 0) {
      return {
        entries: [],
        index: this.indexService.build([]),
        files: [],
        totalBytes: 0,
        status: 'no match'
      };
    }

    const stats = await Promise.all(filePaths.map(async (filePath) => ({ path: filePath, size: (await stat(filePath)).size })));
    const previousByPath = new Map(previousSnapshot.files.map((file) => [file.path, file]));

    const changed = stats.some((file) => {
      const previous = previousByPath.get(file.path);
      return !previous || previous.size !== file.size;
    });

    const removed = previousSnapshot.files.some((file) => !stats.some((current) => current.path === file.path));

    if (!changed && !removed) {
      return {
        ...previousSnapshot,
        files: stats,
        totalBytes: stats.reduce((sum, item) => sum + item.size, 0),
        status:
          stats.reduce((sum, item) => sum + item.size, 0) > maxFileBytes
            ? 'file too large'
            : previousSnapshot.status === 'no match'
              ? 'live'
              : previousSnapshot.status
      };
    }

    const entries = await this.loadingService.loadFromFilesIncrementally(filePaths, previousSnapshot.entries, previousSnapshot.files);
    const totalBytes = stats.reduce((sum, item) => sum + item.size, 0);

    return {
      entries,
      index: this.indexService.build(entries),
      files: stats,
      totalBytes,
      status: totalBytes > maxFileBytes ? 'file too large' : 'live'
    };
  }
}
