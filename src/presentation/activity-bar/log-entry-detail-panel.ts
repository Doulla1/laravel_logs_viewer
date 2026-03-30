import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LogEntry } from '../../domain/log-entry';

export class LogEntryDetailPanel {
  public static show(extensionUri: vscode.Uri, entry: LogEntry): void {
    const panel = vscode.window.createWebviewPanel(
      'laravelLogs.entryDetails',
      LogEntryDetailPanel.buildTitle(entry),
      vscode.ViewColumn.Active,
      {
        enableScripts: false,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    panel.webview.html = LogEntryDetailPanel.getHtml(panel.webview, extensionUri, entry);
  }

  private static buildTitle(entry: LogEntry): string {
    const label = `${entry.level} ${entry.message}`.trim();
    return label.length > 48 ? `${label.slice(0, 47).trimEnd()}…` : label;
  }

  private static getHtml(webview: vscode.Webview, extensionUri: vscode.Uri, entry: LogEntry): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'log-entry-detail.css'));

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource};" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>${escapeHtml(LogEntryDetailPanel.buildTitle(entry))}</title>
  </head>
  <body>
    <div class="app-shell">
      <header class="hero">
        <div class="hero-top">
          <span class="level-badge level-${entry.level.toLowerCase()}">${escapeHtml(entry.level)}</span>
          <span class="hero-time">${escapeHtml(entry.timestamp.toLocaleString())}</span>
        </div>
        <h1>${escapeHtml(entry.message)}</h1>
        <div class="meta-grid">
          ${renderMetaCard('Channel', entry.channel)}
          ${renderMetaCard('Source', `${entry.sourceFile}:${entry.sourceLine}`)}
          ${renderMetaCard('Request ID', entry.requestId ?? '-')}
          ${renderMetaCard('User ID', entry.userId ?? '-')}
          ${renderMetaCard('Job ID', entry.jobId ?? '-')}
          ${renderMetaCard('File', path.basename(entry.sourceFile))}
        </div>
      </header>
      <main class="content-grid">
        ${renderSection('Context JSON', entry.context ? JSON.stringify(entry.context, null, 2) : '-')}
        ${renderSection('Stack Trace', entry.stackTrace || '-')}
        ${renderSection('Raw', entry.raw, true)}
      </main>
    </div>
  </body>
</html>`;
  }
}

function renderMetaCard(label: string, value: string): string {
  return `
    <article class="meta-card">
      <span class="meta-label">${escapeHtml(label)}</span>
      <span class="meta-value">${escapeHtml(value)}</span>
    </article>
  `;
}

function renderSection(title: string, content: string, accent = false): string {
  return `
    <section class="detail-card${accent ? ' detail-card-accent' : ''}">
      <h2>${escapeHtml(title)}</h2>
      <pre>${escapeHtml(content)}</pre>
    </section>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
