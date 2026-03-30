const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applySourceDateFilterTransition,
  rememberWorkspaceDateFilter
} = require('../media/source-filter-policy.js');

test('source filter policy resets imported sources and restores the workspace range', () => {
  const workspaceSource = {
    kind: 'workspace',
    label: 'Workspace logs',
    canTail: true,
    activationId: 0
  };
  const importedSource = {
    kind: 'importedFile',
    label: 'Imported: laravel-2026-03-25.log',
    canTail: true,
    activationId: 1
  };
  const restoredWorkspaceSource = {
    kind: 'workspace',
    label: 'Workspace logs',
    canTail: true,
    activationId: 2
  };
  const workspaceDateFilter = {
    preset: '24h',
    start: new Date('2026-03-29T12:00:00.000Z'),
    end: new Date('2026-03-30T12:00:00.000Z')
  };

  const remembered = rememberWorkspaceDateFilter(workspaceSource, workspaceDateFilter, null);

  assert.equal(remembered.preset, '24h');
  assert.deepEqual(remembered.start, workspaceDateFilter.start);
  assert.deepEqual(remembered.end, workspaceDateFilter.end);

  const importedTransition = applySourceDateFilterTransition(
    workspaceSource,
    importedSource,
    workspaceDateFilter,
    remembered
  );

  assert.equal(importedTransition.changed, true);
  assert.equal(importedTransition.dateFilter.preset, 'custom');
  assert.equal(importedTransition.dateFilter.start, null);
  assert.equal(importedTransition.dateFilter.end, null);
  assert.equal(importedTransition.workspaceDateFilter.preset, '24h');

  const refreshTransition = applySourceDateFilterTransition(
    importedSource,
    importedSource,
    importedTransition.dateFilter,
    importedTransition.workspaceDateFilter
  );

  assert.equal(refreshTransition.changed, false);
  assert.equal(refreshTransition.dateFilter.preset, 'custom');
  assert.equal(refreshTransition.dateFilter.start, null);
  assert.equal(refreshTransition.dateFilter.end, null);

  const workspaceTransition = applySourceDateFilterTransition(
    importedSource,
    restoredWorkspaceSource,
    importedTransition.dateFilter,
    importedTransition.workspaceDateFilter
  );

  assert.equal(workspaceTransition.changed, true);
  assert.equal(workspaceTransition.dateFilter.preset, '24h');
  assert.deepEqual(workspaceTransition.dateFilter.start, workspaceDateFilter.start);
  assert.deepEqual(workspaceTransition.dateFilter.end, workspaceDateFilter.end);
});
