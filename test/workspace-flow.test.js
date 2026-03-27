const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { LogWorkspaceService } = require('../out/application/services/log-workspace-service.js');
const { SavedViewStore } = require('../out/application/services/saved-view-store.js');
const { createDefaultLogFilter } = require('../out/domain/log-filter.js');

test('LogWorkspaceService loads, merges and refreshes log files incrementally', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'laravel-logs-viewer-'));
  const firstFile = path.join(tempDir, 'laravel.log');
  const secondFile = path.join(tempDir, 'laravel-2026-03-26.log');

  await fs.writeFile(
    firstFile,
    `[2026-03-26 10:00:00] production.ERROR: Primary failure request_id=req-1 {"job":"primary"}\n#0 /app/One.php(1): fail()\n` +
      `[2026-03-26 10:05:00] production.INFO: Recovery complete\n`
  );
  await fs.writeFile(secondFile, `[2026-03-26 09:59:00] production.WARNING: Secondary warning job_id=job-9\n`);

  const service = new LogWorkspaceService();
  const snapshot = await service.load([firstFile, secondFile], 1024 * 1024);

  assert.equal(snapshot.entries.length, 3);
  assert.equal(snapshot.index.totalEntries, 3);
  assert.equal(snapshot.status, 'live');
  assert.equal(snapshot.entries[0].message, 'Recovery complete');

  await fs.appendFile(firstFile, `[2026-03-26 10:06:00] production.ERROR: Fresh append user_id=99\n`);

  const refreshed = await service.refreshIncrementally([firstFile, secondFile], snapshot, 1024 * 1024);

  assert.equal(refreshed.entries.length, 4);
  assert.equal(refreshed.entries[0].message, 'Fresh append user_id=99');
  assert.equal(refreshed.index.idsByLevel.ERROR.length, 2);

  const tooLarge = await service.load([firstFile, secondFile], 10);
  assert.equal(tooLarge.status, 'file too large');

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('SavedViewStore persists and deletes saved views through a memento-like store', async () => {
  const backing = new Map();
  const memento = {
    get(key, fallback) {
      return backing.has(key) ? backing.get(key) : fallback;
    },
    async update(key, value) {
      backing.set(key, value);
    }
  };

  const store = new SavedViewStore(memento);
  const saved = await store.save({
    id: 'view-1',
    name: 'Prod Errors Today',
    filter: createDefaultLogFilter()
  });

  assert.equal(saved.length, 1);
  assert.equal((await store.list())[0].name, 'Prod Errors Today');

  const remaining = await store.remove('view-1');
  assert.equal(remaining.length, 0);
});
