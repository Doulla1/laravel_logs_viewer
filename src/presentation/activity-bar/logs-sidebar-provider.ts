import * as vscode from 'vscode';
import type { LogEntry } from '../../domain/log-entry';
import { LogTailService } from '../../application/services/log-tail-service';
import { LogWorkspaceService, type LogWorkspaceSnapshot } from '../../application/services/log-workspace-service';
import { WorkspaceLogFileFinder } from '../../infrastructure/files/workspace-log-file-finder';
import { filterSidebarEntries, formatSidebarLogLabel } from './sidebar-log-presentation';

interface SidebarWebviewMessage {
  type: 'ready' | 'openViewer' | 'refresh' | 'search' | 'openEntry';
  payload?: {
    query?: string;
    entryId?: string;
  };
}

interface SidebarWebviewEntry {
  id: string;
  label: string;
  timestamp: string;
  level: string;
}

interface SidebarStatePayload {
  loading: boolean;
  error?: string;
  status: 'live' | 'file too large' | 'no match';
  query: string;
  summary: string;
  entries: SidebarWebviewEntry[];
}

export class LogsSidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private static readonly defaultLargeFileWarningBytes = 25 * 1024 * 1024;

  private readonly logFileFinder = new WorkspaceLogFileFinder();
  private readonly logWorkspaceService = new LogWorkspaceService();
  private readonly logTailService = new LogTailService();
  private readonly disposables: vscode.Disposable[] = [];
  private webviewView: vscode.WebviewView | undefined;
  private currentSnapshot: LogWorkspaceSnapshot | undefined;
  private currentFilePaths: string[] = [];
  private loading = false;
  private reloadScheduled = false;
  private lastError: string | undefined;
  private searchQuery = '';

  public constructor(private readonly extensionUri: vscode.Uri) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('laravelLogs.defaultGlob') || event.affectsConfiguration('laravelLogs.largeFileWarningMb')) {
          void this.reload();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        void this.reload();
      })
    );

    void this.reload();
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: SidebarWebviewMessage) => {
        void this.handleMessage(message);
      }),
      webviewView.onDidDispose(() => {
        if (this.webviewView === webviewView) {
          this.webviewView = undefined;
        }
      })
    );

    void this.postState();
  }

  public dispose(): void {
    this.logTailService.stop();

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private async handleMessage(message: SidebarWebviewMessage): Promise<void> {
    if (message.type === 'ready') {
      await this.postState();
      return;
    }

    if (message.type === 'openViewer') {
      await vscode.commands.executeCommand('laravelLogs.openViewer');
      return;
    }

    if (message.type === 'refresh') {
      await this.reload();
      return;
    }

    if (message.type === 'search') {
      this.searchQuery = message.payload?.query?.trim() ?? '';
      await this.postState();
      return;
    }

    if (message.type === 'openEntry' && message.payload?.entryId) {
      const entry = this.currentSnapshot?.entries.find((candidate) => candidate.id === message.payload?.entryId);
      if (entry) {
        await vscode.commands.executeCommand('laravelLogs.openEntryDetails', entry);
      }
    }
  }

  private async reload(): Promise<void> {
    if (this.loading) {
      this.reloadScheduled = true;
      return;
    }

    this.loading = true;
    this.lastError = undefined;
    await this.postState();

    try {
      const filePaths = await this.findWorkspaceFilePaths();
      const maxFileBytes = this.getLargeFileWarningBytes();

      this.currentSnapshot =
        this.currentSnapshot && this.haveSameFiles(this.currentFilePaths, filePaths)
          ? await this.logWorkspaceService.refreshIncrementally(filePaths, this.currentSnapshot, maxFileBytes)
          : await this.logWorkspaceService.load(filePaths, maxFileBytes);

      this.currentFilePaths = filePaths;
      this.startTailing();
    } catch (error) {
      this.currentSnapshot = undefined;
      this.currentFilePaths = [];
      this.logTailService.stop();
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      await this.postState();
    }

    if (this.reloadScheduled) {
      this.reloadScheduled = false;
      await this.reload();
    }
  }

  private startTailing(): void {
    if (this.currentFilePaths.length === 0) {
      this.logTailService.stop();
      return;
    }

    this.logTailService.start(this.currentFilePaths, () => {
      void this.reload();
    });
  }

  private async postState(): Promise<void> {
    if (!this.webviewView) {
      return;
    }

    await this.webviewView.webview.postMessage({
      type: 'state',
      payload: this.buildStatePayload()
    });
  }

  private buildStatePayload(): SidebarStatePayload {
    const snapshot = this.currentSnapshot;
    const filteredEntries = snapshot ? filterSidebarEntries(snapshot.entries, this.searchQuery) : [];

    return {
      loading: this.loading,
      error: this.lastError,
      status: snapshot?.status ?? 'no match',
      query: this.searchQuery,
      summary: this.buildSummary(snapshot, filteredEntries.length),
      entries: filteredEntries.map((entry) => this.toSidebarEntry(entry))
    };
  }

  private buildSummary(snapshot: LogWorkspaceSnapshot | undefined, filteredCount: number): string {
    if (this.lastError) {
      return 'Sidebar unavailable';
    }

    if (this.loading && !snapshot) {
      return 'Loading logs...';
    }

    if (!snapshot || snapshot.entries.length === 0) {
      return 'No logs found';
    }

    if (snapshot.status === 'file too large') {
      return `${filteredCount}/${snapshot.entries.length} logs · large set`;
    }

    return `${filteredCount}/${snapshot.entries.length} logs`;
  }

  private toSidebarEntry(entry: LogEntry): SidebarWebviewEntry {
    return {
      id: entry.id,
      label: formatSidebarLogLabel(entry),
      timestamp: formatSidebarTimestamp(entry.timestamp),
      level: entry.level
    };
  }

  private async findWorkspaceFilePaths(): Promise<string[]> {
    const configuredGlob = vscode.workspace
      .getConfiguration('laravelLogs')
      .get<string>('defaultGlob', 'storage/logs/laravel*.log');

    return this.logFileFinder.findWithActiveFallback(configuredGlob);
  }

  private getLargeFileWarningBytes(): number {
    const configuredMb = vscode.workspace
      .getConfiguration('laravelLogs')
      .get<number>('largeFileWarningMb', LogsSidebarProvider.defaultLargeFileWarningBytes / (1024 * 1024));

    return configuredMb * 1024 * 1024;
  }

  private haveSameFiles(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((filePath, index) => right[index] === filePath);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar-main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar-main.css'));

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Laravel Logs</title>
  </head>
  <body>
    <div class="sidebar-shell">
      <div class="sidebar-toolbar">
        <button id="openViewerButton" class="viewer-button" type="button">Open Logs Viewer</button>
        <button id="refreshButton" class="viewer-button viewer-button-secondary" type="button">Reload</button>
      </div>
      <div class="search-shell">
        <input id="searchInput" type="search" placeholder="Search logs" aria-label="Search logs" />
      </div>
      <div id="summary" class="summary">Loading logs...</div>
      <div id="errorBanner" class="error-banner hidden"></div>
      <div id="emptyState" class="empty-state hidden">No log matches the current search.</div>
      <div id="list" class="list" role="list"></div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function formatSidebarTimestamp(timestamp: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(timestamp);
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}
