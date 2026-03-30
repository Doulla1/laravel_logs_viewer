import * as path from 'node:path';
import * as vscode from 'vscode';
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
  activationId: number;
}

interface WebviewMessage {
  type: 'ready' | 'copyText' | 'copyJson' | 'refresh' | 'toggleTail' | 'pickImportedFile' | 'switchSource' | 'applyPastedLogs';
  payload?: {
    text?: string;
    json?: unknown;
    enabled?: boolean;
    kind?: 'workspace' | 'importedFile' | 'pastedLogs';
    copyKind?: 'context' | 'stack' | 'raw';
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
  private currentSourceActivationId = 0;
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

    if (message.type === 'copyText' && message.payload?.text) {
      await vscode.env.clipboard.writeText(message.payload.text);
      await this.postCopyState(message.payload.copyKind ?? 'raw');
      return;
    }

    if (message.type === 'copyJson' && message.payload?.json !== undefined) {
      await vscode.env.clipboard.writeText(JSON.stringify(message.payload.json, null, 2));
      await this.postCopyState(message.payload.copyKind ?? 'context');
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
    if (!this.isSameSource(this.currentSource, source)) {
      this.currentSourceActivationId += 1;
    }

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

  private async postCopyState(kind: 'context' | 'stack' | 'raw'): Promise<void> {
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
    const dateTimeScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'date-time-input.js'));
    const policyScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'source-filter-policy.js'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="fr">
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
      <header class="app-header">
        <div class="app-header-main">
          <div class="title-block">
            <span class="eyebrow">Laravel Logs</span>
            <h1 class="app-title">Inspect and tail your logs in a cleaner workspace.</h1>
            <p class="app-subtitle">
              Filter fast, switch sources and inspect the selected entry without leaving the panel.
            </p>
          </div>
          <div class="header-actions">
            <div class="summary-cluster">
              <div class="summary-pill">
                <span class="summary-label">Status</span>
                <span id="statusBadge" class="status">indexing...</span>
              </div>
              <div class="summary-pill">
                <span class="summary-label">Results</span>
                <span id="resultCount" class="count">0 results</span>
              </div>
            </div>
            <label class="theme-switch" for="themeToggle">
              <input id="themeToggle" type="checkbox" role="switch" aria-label="Toggle light theme" />
              <span class="theme-switch-track" aria-hidden="true">
                <span class="theme-switch-thumb"></span>
              </span>
              <span class="theme-switch-text">Theme</span>
              <span id="themeLabel" class="theme-switch-value">Dark</span>
            </label>
          </div>
        </div>

        <div class="controls-grid">
          <section class="control-card">
            <div class="control-card-header">
              <div>
                <span class="section-label">Search</span>
                <h2 class="card-title">Search</h2>
              </div>
            </div>
            <div class="search-stack">
              <input id="searchInput" type="search" placeholder="Search message, stack trace or raw log..." />
              <div class="date-row">
                <label class="date-field" for="startDateInput">
                  <span class="section-label">From</span>
                  <div class="date-field-controls">
                    <input id="startDateInput" type="date" lang="fr-FR" />
                    <input id="startTimeInput" type="time" lang="fr-FR" step="60" />
                  </div>
                </label>
                <label class="date-field" for="endDateInput">
                  <span class="section-label">To</span>
                  <div class="date-field-controls">
                    <input id="endDateInput" type="date" lang="fr-FR" />
                    <input id="endTimeInput" type="time" lang="fr-FR" step="60" />
                  </div>
                </label>
              </div>
              <div class="advanced-controls-shell">
                <button
                  type="button"
                  id="advancedControlsToggle"
                  class="collapse-toggle"
                  aria-expanded="false"
                  aria-controls="advancedControlsPanel"
                >
                  Show levels, range, sources and actions
                </button>
                <div id="advancedControlsPanel" class="advanced-controls hidden">
                  <div class="advanced-controls-grid">
                    <div class="control-group">
                      <span class="section-label">Levels</span>
                      <div class="chips" id="levelChips">
                        <button type="button" class="chip active" data-level="ERROR">ERROR</button>
                        <button type="button" class="chip active" data-level="WARNING">WARNING</button>
                        <button type="button" class="chip active" data-level="INFO">INFO</button>
                      </div>
                    </div>
                    <div class="control-group">
                      <span class="section-label">Range</span>
                      <div class="chips" id="datePresets">
                        <button type="button" class="chip" data-preset="15m">15 min</button>
                        <button type="button" class="chip" data-preset="1h">1h</button>
                        <button type="button" class="chip active" data-preset="24h">24h</button>
                        <button type="button" class="chip" data-preset="custom">Custom</button>
                      </div>
                    </div>
                    <div class="control-group">
                      <span class="section-label">Sources</span>
                      <div class="chips">
                        <button type="button" id="workspaceSourceButton" class="chip active">Workspace</button>
                        <button type="button" id="importFileButton" class="chip">Import file</button>
                        <button type="button" id="pasteSourceButton" class="chip">Paste logs</button>
                      </div>
                    </div>
                    <div class="control-group">
                      <span class="section-label">Actions</span>
                      <div class="chips action-chips">
                        <button type="button" id="refreshButton" class="chip">Refresh</button>
                        <button type="button" id="tailButton" class="chip" title="Follow new lines appended to the current file">Tail: OFF</button>
                        <button type="button" id="sortButton" class="chip active" data-direction="desc">Sort: DESC</button>
                      </div>
                    </div>
                  </div>
                  <div class="toolbar-meta">
                    <span id="sourceSummary" class="meta-pill">Workspace logs</span>
                    <span id="fileSummary" class="meta-pill">No files loaded</span>
                    <span id="sizeSummary" class="meta-pill">0 MB</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section id="pastePanel" class="paste-panel hidden">
          <div class="paste-panel-header">
            <div>
              <span class="section-label">Paste logs</span>
              <h2 class="card-title">Load pasted Laravel or JSON log lines</h2>
            </div>
            <span class="status">Paste raw logs, then format and inspect them in the viewer.</span>
          </div>
          <textarea
            id="pasteInput"
            class="paste-input"
            spellcheck="false"
            placeholder="Paste Laravel logs or JSON log lines here..."
          ></textarea>
          <div class="paste-actions">
            <button type="button" id="loadPastedLogsButton" class="chip active">Format &amp; Load</button>
            <button type="button" id="clearPastedLogsButton" class="chip">Clear</button>
          </div>
        </section>
      </header>

      <main class="layout">
        <section class="log-list panel-surface">
          <div class="panel-heading">
            <div>
              <span class="section-label">Entries</span>
              <h2 class="panel-title">Virtualized log stream</h2>
            </div>
            <span class="meta-pill">Large volumes stay smooth</span>
          </div>
          <div id="emptyState" class="empty-state hidden">No match for current filters.</div>
          <div id="listViewport" class="viewport">
            <div id="listSpacer" class="list-spacer">
              <div id="listItems" class="list-items"></div>
            </div>
          </div>
        </section>
        <aside class="detail-panel panel-surface">
          <div class="panel-heading">
            <div>
              <span class="section-label">Details</span>
              <h2 class="panel-title">Selected log entry</h2>
            </div>
          </div>
          <div id="detailMeta" class="detail-meta">Select a log entry to inspect details.</div>
          <section class="detail-section">
            <div class="detail-card">
              <button
                id="copyContextButton"
                class="detail-copy-button"
                type="button"
                aria-label="Copy context JSON"
                title="Copy context JSON"
              >
                <span class="copy-icon" aria-hidden="true"></span>
              </button>
              <h3>Context JSON</h3>
              <pre id="contextContent" class="detail-content">-</pre>
            </div>
          </section>
          <section class="detail-section">
            <div class="detail-card">
              <button
                id="copyStackButton"
                class="detail-copy-button"
                type="button"
                aria-label="Copy stack trace"
                title="Copy stack trace"
              >
                <span class="copy-icon" aria-hidden="true"></span>
              </button>
              <h3>Stack Trace</h3>
              <pre id="stackTraceContent" class="detail-content">-</pre>
            </div>
          </section>
          <section class="detail-section">
            <div class="detail-card">
              <button
                id="copyRawButton"
                class="detail-copy-button"
                type="button"
                aria-label="Copy raw log"
                title="Copy raw log"
              >
                <span class="copy-icon" aria-hidden="true"></span>
              </button>
              <h3>Raw</h3>
              <pre id="detailContent" class="detail-content">-</pre>
            </div>
          </section>
        </aside>
      </main>
    </div>
    <script nonce="${nonce}" src="${dateTimeScriptUri}"></script>
    <script nonce="${nonce}" src="${policyScriptUri}"></script>
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
        canTail: true,
        activationId: this.currentSourceActivationId
      };
    }

    if (source.kind === 'pastedLogs') {
      return {
        kind: source.kind,
        label: 'Pasted logs',
        canTail: false,
        activationId: this.currentSourceActivationId
      };
    }

    return {
      kind: 'workspace',
      label: 'Workspace logs',
      canTail: true,
      activationId: this.currentSourceActivationId
    };
  }

  private isSameSource(left: ViewerSource, right: ViewerSource): boolean {
    return left.kind === right.kind && left.filePath === right.filePath && left.text === right.text;
  }
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}
