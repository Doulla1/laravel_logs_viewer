import * as vscode from 'vscode';
import * as path from 'node:path';
import { LogTailService } from '../../application/services/log-tail-service';
import { LogWorkspaceService, type LogWorkspaceSnapshot } from '../../application/services/log-workspace-service';
import type { LogEntry } from '../../domain/log-entry';
import { WorkspaceLogFileFinder } from '../../infrastructure/files/workspace-log-file-finder';

interface WebviewLogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  channel: string;
  sourceFile: string;
  sourceLine: number;
  raw: string;
  stackTrace?: string;
  context?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
  jobId?: string;
}

interface WebviewSource {
  kind: 'workspace' | 'importedFile' | 'pastedLogs';
  label: string;
  canTail: boolean;
}

interface WebviewMessage {
  type: 'ready' | 'copyLine' | 'copyJson' | 'refresh' | 'toggleTail' | 'pickImportedFile' | 'switchSource' | 'applyPastedLogs';
  payload?: {
    text?: string;
    json?: unknown;
    enabled?: boolean;
    kind?: 'workspace' | 'importedFile' | 'pastedLogs';
  };
}

interface ViewerSource {
  kind: 'workspace' | 'importedFile' | 'pastedLogs';
  filePath?: string;
  text?: string;
}

export class LogViewerPanel {
  public static readonly viewType = 'laravelLogs.viewer';
  private static readonly defaultLargeFileWarningBytes = 25 * 1024 * 1024;

  private static currentPanel: LogViewerPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly logFileFinder: WorkspaceLogFileFinder;
  private readonly logWorkspaceService: LogWorkspaceService;
  private readonly logTailService: LogTailService;
  private readonly disposables: vscode.Disposable[] = [];

  private currentSnapshot: LogWorkspaceSnapshot | undefined;
  private currentFilePaths: string[] = [];
  private currentSource: ViewerSource = { kind: 'workspace' };
  private tailEnabled = false;

  public static createOrShow(extensionContext: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (LogViewerPanel.currentPanel) {
      LogViewerPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      LogViewerPanel.viewType,
      'Laravel Logs Viewer',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionContext.extensionUri, 'media')]
      }
    );

    LogViewerPanel.currentPanel = new LogViewerPanel(panel, extensionContext);
  }

  private constructor(panel: vscode.WebviewPanel, extensionContext: vscode.ExtensionContext) {
    this.panel = panel;
    this.extensionUri = extensionContext.extensionUri;
    this.logFileFinder = new WorkspaceLogFileFinder();
    this.logWorkspaceService = new LogWorkspaceService();
    this.logTailService = new LogTailService();

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        void this.handleMessage(message);
      },
      null,
      this.disposables
    );
  }

  public dispose(): void {
    LogViewerPanel.currentPanel = undefined;
    this.logTailService.stop();

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === 'ready') {
      await this.loadAndSendInitialData();
      return;
    }

    if (message.type === 'refresh') {
      await this.reloadAndSendData();
      return;
    }

    if (message.type === 'toggleTail') {
      await this.setTailEnabled(Boolean(message.payload?.enabled));
      return;
    }

    if (message.type === 'pickImportedFile') {
      await this.pickImportedFile();
      return;
    }

    if (message.type === 'switchSource' && message.payload?.kind === 'workspace') {
      await this.setSource({ kind: 'workspace' });
      await this.reloadAndSendData();
      return;
    }

    if (message.type === 'applyPastedLogs') {
      const text = message.payload?.text?.trimEnd() ?? '';
      await this.setSource({ kind: 'pastedLogs', text });
      await this.reloadAndSendData();
      return;
    }

    if (message.type === 'copyLine' && message.payload?.text) {
      await vscode.env.clipboard.writeText(message.payload.text);
      await this.postCopyState('line');
      return;
    }

    if (message.type === 'copyJson' && message.payload?.json !== undefined) {
      await vscode.env.clipboard.writeText(JSON.stringify(message.payload.json, null, 2));
      await this.postCopyState('json');
    }
  }

  private async loadAndSendInitialData(): Promise<void> {
    await this.panel.webview.postMessage({
      type: 'initData',
      payload: {
        status: 'indexing...',
        entries: [],
        tailEnabled: this.tailEnabled,
        searchDebounceMs: this.getSearchDebounceMs(),
        totalBytes: 0,
        currentFiles: [],
        source: this.toWebviewSource(this.currentSource)
      }
    });

    try {
      await this.reloadAndSendData();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Laravel Logs Viewer: unable to load logs (${reason}).`);

      await this.panel.webview.postMessage({
        type: 'entriesUpdated',
        payload: {
          status: 'no match',
          entries: [],
          tailEnabled: false,
          searchDebounceMs: this.getSearchDebounceMs(),
          totalBytes: 0,
          currentFiles: [],
          source: this.toWebviewSource(this.currentSource)
        }
      });
    }
  }

  private async reloadAndSendData(): Promise<void> {
    await this.panel.webview.postMessage({
      type: 'loadingState',
      payload: {
        status: 'indexing...'
      }
    });

    const maxFileBytes = this.getLargeFileWarningBytes();
    this.currentSnapshot = await this.loadSnapshotForCurrentSource(maxFileBytes);

    await this.panel.webview.postMessage({
      type: 'entriesUpdated',
      payload: {
        status: this.currentSnapshot.status,
        entries: this.currentSnapshot.entries.map((entry) => this.toWebviewEntry(entry)),
        tailEnabled: this.tailEnabled,
        searchDebounceMs: this.getSearchDebounceMs(),
        totalBytes: this.currentSnapshot.totalBytes,
        currentFiles: this.currentFilePaths,
        source: this.toWebviewSource(this.currentSource)
      }
    });

    if (this.tailEnabled && this.currentFilePaths.length > 0) {
      this.startTail();
    }
  }

  private async setTailEnabled(enabled: boolean): Promise<void> {
    this.tailEnabled = enabled;

    if (!enabled) {
      this.logTailService.stop();
    } else {
      if (!this.currentSnapshot || this.currentFilePaths.length === 0) {
        await this.reloadAndSendData();
        if (this.currentFilePaths.length === 0) {
          this.tailEnabled = false;
        } else {
          return;
        }
      }

      if (this.tailEnabled) {
        this.startTail();
      }
    }

    await this.panel.webview.postMessage({
      type: 'tailStateUpdated',
      payload: {
        tailEnabled: this.tailEnabled
      }
    });
  }

  private async pickImportedFile(): Promise<void> {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Import log file',
      filters: {
        Logs: ['log', 'txt', 'json'],
        All: ['*']
      }
    });

    const selected = selection?.[0];
    if (!selected) {
      return;
    }

    await this.setSource({ kind: 'importedFile', filePath: selected.fsPath });
    await this.reloadAndSendData();
  }

  private startTail(): void {
    if (this.currentFilePaths.length === 0) {
      return;
    }

    this.logTailService.start(this.currentFilePaths, () => {
      void this.reloadAndSendData();
    });
  }

  private async setSource(source: ViewerSource): Promise<void> {
    this.currentSource = source;
    this.currentSnapshot = undefined;
    this.currentFilePaths = [];
    this.tailEnabled = false;
    this.logTailService.stop();
  }

  private async loadSnapshotForCurrentSource(maxFileBytes: number): Promise<LogWorkspaceSnapshot> {
    if (this.currentSource.kind === 'workspace') {
      const filePaths = await this.findWorkspaceFilePaths();
      this.currentFilePaths = filePaths;

      return this.currentSnapshot && this.haveSameFiles(this.currentSnapshot.files.map((file) => file.path), filePaths)
        ? this.logWorkspaceService.refreshIncrementally(filePaths, this.currentSnapshot, maxFileBytes)
        : this.logWorkspaceService.load(filePaths, maxFileBytes);
    }

    if (this.currentSource.kind === 'importedFile' && this.currentSource.filePath) {
      this.currentFilePaths = [this.currentSource.filePath];

      return this.currentSnapshot && this.haveSameFiles(this.currentSnapshot.files.map((file) => file.path), this.currentFilePaths)
        ? this.logWorkspaceService.refreshIncrementally(this.currentFilePaths, this.currentSnapshot, maxFileBytes)
        : this.logWorkspaceService.load(this.currentFilePaths, maxFileBytes);
    }

    this.currentFilePaths = [];
    return this.logWorkspaceService.loadFromText(this.currentSource.text ?? '', 'Pasted logs');
  }

  private async findWorkspaceFilePaths(): Promise<string[]> {
    const configuredGlob = vscode.workspace
      .getConfiguration('laravelLogs')
      .get<string>('defaultGlob', 'storage/logs/laravel*.log');

    return this.logFileFinder.findWithActiveFallback(configuredGlob);
  }

  private getSearchDebounceMs(): number {
    return vscode.workspace.getConfiguration('laravelLogs').get<number>('searchDebounceMs', 180);
  }

  private getLargeFileWarningBytes(): number {
    const configuredMb = vscode.workspace
      .getConfiguration('laravelLogs')
      .get<number>('largeFileWarningMb', LogViewerPanel.defaultLargeFileWarningBytes / (1024 * 1024));

    return configuredMb * 1024 * 1024;
  }

  private async postCopyState(kind: 'line' | 'json'): Promise<void> {
    await this.panel.webview.postMessage({
      type: 'copyCompleted',
      payload: {
        kind
      }
    });
  }

  private haveSameFiles(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((filePath, index) => right[index] === filePath);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Laravel Logs Viewer</title>
    <link href="${styleUri}" rel="stylesheet" />
  </head>
  <body>
    <div class="app-shell">
      <header class="toolbar">
        <div class="toolbar-row">
          <div class="toolbar-left">
            <input id="searchInput" type="search" placeholder="Search in logs..." />
            <input id="startDateInput" type="datetime-local" />
            <input id="endDateInput" type="datetime-local" />
          </div>
          <div class="toolbar-right">
            <button id="refreshButton" class="chip">Refresh</button>
            <button id="tailButton" class="chip">Tail: OFF</button>
            <button id="sortButton" class="chip active" data-direction="desc">Sort: DESC</button>
            <span id="statusBadge" class="status">indexing...</span>
            <span id="resultCount" class="count">0 results</span>
          </div>
        </div>
        <div class="toolbar-row toolbar-secondary">
          <div class="source-block">
            <span class="section-label">Source</span>
            <div class="chips">
              <button id="workspaceSourceButton" class="chip active">Workspace</button>
              <button id="importFileButton" class="chip">Import file</button>
              <button id="pasteSourceButton" class="chip">Paste logs</button>
            </div>
          </div>
          <div class="chips" id="levelChips">
            <button class="chip active" data-level="ERROR">ERROR</button>
            <button class="chip active" data-level="WARNING">WARNING</button>
            <button class="chip active" data-level="INFO">INFO</button>
          </div>
          <div class="chips" id="datePresets">
            <button class="chip" data-preset="15m">15 min</button>
            <button class="chip" data-preset="1h">1h</button>
            <button class="chip active" data-preset="24h">24h</button>
            <button class="chip" data-preset="custom">Custom</button>
          </div>
        </div>
        <section id="pastePanel" class="paste-panel hidden">
          <div class="paste-panel-header">
            <span class="section-label">Paste logs</span>
            <span class="status">Paste raw Laravel or JSON logs, then format and load them.</span>
          </div>
          <textarea
            id="pasteInput"
            class="paste-input"
            spellcheck="false"
            placeholder="Paste Laravel logs or JSON log lines here..."
          ></textarea>
          <div class="paste-actions">
            <button id="loadPastedLogsButton" class="chip active">Format &amp; Load</button>
            <button id="clearPastedLogsButton" class="chip">Clear</button>
          </div>
        </section>
        <div class="toolbar-meta">
          <span id="sourceSummary" class="status">Workspace logs</span>
          <span id="fileSummary" class="status">No files loaded</span>
          <span id="sizeSummary" class="status">0 MB</span>
        </div>
      </header>

      <main class="layout">
        <section class="log-list">
          <div id="emptyState" class="empty-state hidden">No match for current filters.</div>
          <div id="listViewport" class="viewport">
            <div id="listSpacer" class="list-spacer">
              <div id="listItems" class="list-items"></div>
            </div>
          </div>
        </section>
        <aside class="detail-panel">
          <h2>Log Details</h2>
          <div class="detail-actions">
            <button id="copyLineButton">Copy line</button>
            <button id="copyJsonButton">Copy JSON</button>
          </div>
          <div id="detailMeta" class="detail-meta">Select a log entry to inspect details.</div>
          <section class="detail-section">
            <h3>Context JSON</h3>
            <pre id="contextContent" class="detail-content">-</pre>
          </section>
          <section class="detail-section">
            <h3>Stack Trace</h3>
            <pre id="stackTraceContent" class="detail-content">-</pre>
          </section>
          <section class="detail-section">
            <h3>Raw</h3>
            <pre id="detailContent" class="detail-content">-</pre>
          </section>
        </aside>
      </main>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private toWebviewEntry(entry: LogEntry): WebviewLogEntry {
    return {
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      message: entry.message,
      channel: entry.channel,
      sourceFile: entry.sourceFile,
      sourceLine: entry.sourceLine,
      raw: entry.raw,
      stackTrace: entry.stackTrace,
      context: entry.context,
      requestId: entry.requestId,
      userId: entry.userId,
      jobId: entry.jobId
    };
  }

  private toWebviewSource(source: ViewerSource): WebviewSource {
    if (source.kind === 'importedFile' && source.filePath) {
      return {
        kind: source.kind,
        label: `Imported: ${path.basename(source.filePath)}`,
        canTail: true
      };
    }

    if (source.kind === 'pastedLogs') {
      return {
        kind: source.kind,
        label: 'Pasted logs',
        canTail: false
      };
    }

    return {
      kind: 'workspace',
      label: 'Workspace logs',
      canTail: true
    };
  }
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}
