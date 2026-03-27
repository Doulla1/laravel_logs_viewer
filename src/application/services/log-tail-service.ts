import { watch, type FSWatcher } from 'node:fs';

export class LogTailService {
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly timers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();

  public start(filePaths: string[], onChange: () => void): void {
    this.stop();

    for (const filePath of filePaths) {
      const watcher = watch(filePath, () => {
        const pending = this.timers.get(filePath);
        if (pending) {
          globalThis.clearTimeout(pending);
        }

        const timer = globalThis.setTimeout(() => {
          this.timers.delete(filePath);
          onChange();
        }, 150);

        this.timers.set(filePath, timer);
      });

      this.watchers.set(filePath, watcher);
    }
  }

  public stop(): void {
    for (const timer of this.timers.values()) {
      globalThis.clearTimeout(timer);
    }

    for (const watcher of this.watchers.values()) {
      watcher.close();
    }

    this.timers.clear();
    this.watchers.clear();
  }
}
