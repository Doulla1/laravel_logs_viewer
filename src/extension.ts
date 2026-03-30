import * as vscode from 'vscode';
import type { LogEntry } from './domain/log-entry';
import { LogEntryDetailPanel } from './presentation/activity-bar/log-entry-detail-panel';
import { LogsSidebarProvider } from './presentation/activity-bar/logs-sidebar-provider';
import { LogViewerPanel } from './presentation/webview/log-viewer-panel';

export function activate(context: vscode.ExtensionContext): void {
  const openViewerCommand = vscode.commands.registerCommand('laravelLogs.openViewer', () => {
    LogViewerPanel.createOrShow(context);
  });
  const openEntryDetailsCommand = vscode.commands.registerCommand('laravelLogs.openEntryDetails', (entry: LogEntry) => {
    LogEntryDetailPanel.show(context.extensionUri, entry);
  });
  const sidebarProvider = new LogsSidebarProvider(context.extensionUri);
  const sidebarViewProvider = vscode.window.registerWebviewViewProvider('laravelLogsSidebar', sidebarProvider, {
    webviewOptions: {
      retainContextWhenHidden: true
    }
  });

  context.subscriptions.push(
    openViewerCommand,
    openEntryDetailsCommand,
    sidebarProvider,
    sidebarViewProvider
  );
}

export function deactivate(): void {
  // Nothing to dispose here; panel lifecycle is managed by VS Code.
}
