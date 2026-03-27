import * as vscode from 'vscode';
import { LogViewerPanel } from './presentation/webview/log-viewer-panel';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('laravelLogs.openViewer', () => {
    LogViewerPanel.createOrShow(context);
  });

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // Nothing to dispose here; panel lifecycle is managed by VS Code.
}
