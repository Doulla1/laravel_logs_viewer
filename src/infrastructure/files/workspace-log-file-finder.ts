import * as vscode from 'vscode';

const ACTIVE_LOG_FILE_PATTERN = /laravel(?:-[\w.-]+)?\.log$/i;

export class WorkspaceLogFileFinder {
  public async findWithActiveFallback(globPattern: string): Promise<string[]> {
    const discoveredFiles = await this.find(globPattern);
    if (discoveredFiles.length > 0) {
      return discoveredFiles;
    }

    const activePath = vscode.window.activeTextEditor?.document?.uri.fsPath;
    if (activePath && ACTIVE_LOG_FILE_PATTERN.test(activePath)) {
      return [activePath];
    }

    return [];
  }

  public async find(globPattern: string): Promise<string[]> {
    const normalized = this.normalizePattern(globPattern);
    const uris = await vscode.workspace.findFiles(normalized, '**/node_modules/**');

    return uris.map((uri) => uri.fsPath).sort((left, right) => left.localeCompare(right));
  }

  private normalizePattern(globPattern: string): string {
    const trimmed = globPattern.trim();

    if (!trimmed) {
      return '**/storage/logs/laravel*.log';
    }

    if (trimmed.startsWith('**/')) {
      return trimmed;
    }

    return `**/${trimmed.replace(/^\/+/, '')}`;
  }
}
