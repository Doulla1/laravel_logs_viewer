const test = require('node:test');
const assert = require('node:assert/strict');

const { LogLoadingService } = require('../out/application/services/log-loading-service.js');

test('LogLoadingService loads pasted Laravel logs and preserves reverse chronology', () => {
  const service = new LogLoadingService();
  const text =
    `[2026-03-26 10:00:00] production.ERROR: Primary failure request_id=req-1 {"job":"sync"}\n` +
    `#0 /app/Jobs/Sync.php(12): run()\n` +
    `[2026-03-26 10:05:00] production.INFO: Recovery complete\n`;

  const entries = service.loadFromText(text, 'Pasted logs');

  assert.equal(entries.length, 2);
  assert.equal(entries[0].message, 'Recovery complete');
  assert.equal(entries[1].requestId, 'req-1');
  assert.equal(entries[1].context.job, 'sync');
  assert.equal(entries[1].sourceFile, 'Pasted logs');
});
