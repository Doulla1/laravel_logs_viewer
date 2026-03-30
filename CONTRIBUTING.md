# Contributing

## Development Setup

Requirements:
- Node.js 20+
- npm 10+

Install dependencies and validate the extension:

```bash
npm ci
npm run validate
```

## Local Workflow

Build and test:

```bash
npm run compile
npm run lint
npm test
```

Package a local VSIX:

```bash
npm run package:vsix
```

## Architecture

The codebase is organized around four layers:

- `src/domain`: pure log models and domain rules
- `src/application`: orchestration and use cases
- `src/infrastructure`: file access, parsing, indexing
- `src/presentation`: VS Code host integration and webviews

Keep UI concerns out of the domain and application layers.

## Contribution Guidelines

- Keep TypeScript strict and avoid untyped shortcuts.
- Prefer small, testable increments.
- Add or update tests when behavior changes.
- Update `README.md`, `CHANGELOG.md`, and relevant docs when user-facing behavior changes.
- Do not commit generated VSIX artifacts unless explicitly requested for a release workflow.

## Pull Request Checklist

- `npm run validate` passes locally
- user-facing behavior verified in VS Code
- documentation updated
- no unrelated files changed
