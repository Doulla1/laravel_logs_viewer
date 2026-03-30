# Laravel Logs Viewer

Laravel Logs Viewer is a VS Code extension for inspecting Laravel logs with a focused 3-pane interface, fast filtering, live tailing, file import, pasted log formatting, and multi-file chronological merging.

## Features

- 3-pane viewer with filters, virtualized entries, and a dedicated details panel
- Fast text search across message, raw content, and stack trace
- Level filters and time range presets: `15 min`, `1h`, `24h`, `Custom`
- Workspace log discovery for `laravel.log` and `laravel-*.log`
- Manual import for `.log`, `.txt`, and `.json` files outside the workspace
- Direct paste mode for raw Laravel logs or JSON log lines
- Live tail mode for append-only logs
- Incremental refresh and lightweight indexing for large log sets
- Stack trace, JSON context, and raw payload copy actions
- Request, user, and job ID highlighting
- Sidebar view for quick browsing directly from the Activity Bar
- Local light and dark theme toggle inside the main viewer

## Commands

- `Laravel Logs: Open Viewer`

## Configuration

- `laravelLogs.defaultGlob`: glob used to discover Laravel log files in the workspace
- `laravelLogs.searchDebounceMs`: debounce duration for text search
- `laravelLogs.largeFileWarningMb`: warning threshold for large matched log sets

## How Tail Works

`Tail: ON` keeps the current file source in sync when new log lines are appended. This is useful when you are watching a Laravel log during local development or while reproducing an issue.

Tail is available for workspace files and imported files. It is intentionally disabled for pasted logs because they are an in-memory static source.

## Requirements

- VS Code `^1.90.0`
- Node.js 20+ for local development

## Development

Install dependencies:

```bash
npm ci
```

Validate the extension:

```bash
npm run validate
```

Create a VSIX package:

```bash
npm run package:vsix
```

To debug the extension locally, launch it from `.vscode/launch.json`.

## Architecture

- `src/domain`: pure models and domain rules
- `src/application`: use cases and orchestration
- `src/infrastructure`: file access, parsing, indexing
- `src/presentation`: VS Code integration and webviews

## License

MIT. See the `LICENSE` file included in the extension package.
