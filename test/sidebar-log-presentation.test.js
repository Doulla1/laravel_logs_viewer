const test = require('node:test');
const assert = require('node:assert/strict');

const {
  filterSidebarEntries,
  formatSidebarLogLabel,
  formatLogEntryDetailDocument
} = require('../out/presentation/activity-bar/sidebar-log-presentation.js');

test('formatSidebarLogLabel prefixes the level and truncates long messages', () => {
  const label = formatSidebarLogLabel(
    {
      level: 'ERROR',
      message: 'A very long log message that should be truncated to keep the sidebar readable in narrow layouts'
    },
    32
  );

  assert.equal(label, 'ERROR: A very long log message…');
});

test('formatLogEntryDetailDocument renders all detail sections', () => {
  const content = formatLogEntryDetailDocument({
    id: 'entry-1',
    timestamp: new Date('2026-03-27T11:22:33.000Z'),
    level: 'WARNING',
    channel: 'production',
    message: 'Queue latency is rising',
    sourceFile: '/tmp/laravel.log',
    sourceLine: 18,
    byteOffset: 512,
    requestId: 'req-99',
    userId: '7',
    jobId: 'job-2',
    context: { queue: 'emails' },
    stackTrace: '#0 /app/Jobs/SendEmail.php(22): handle()',
    raw: '[2026-03-27 12:22:33] production.WARNING: Queue latency is rising'
  });

  assert.match(content, /Laravel Log Details/);
  assert.match(content, /Timestamp: 2026-03-27T11:22:33.000Z/);
  assert.match(content, /Context JSON/);
  assert.match(content, /"queue": "emails"/);
  assert.match(content, /Stack Trace/);
  assert.match(content, /Raw/);
});

test('filterSidebarEntries searches across message, raw and context then sorts newest first', () => {
  const entries = [
    {
      id: '1',
      timestamp: new Date('2026-03-27T10:00:00.000Z'),
      level: 'INFO',
      channel: 'production',
      message: 'Older entry',
      sourceFile: '/tmp/laravel.log',
      sourceLine: 10,
      byteOffset: 10,
      raw: 'Older entry raw',
      context: { request: 'alpha' }
    },
    {
      id: '2',
      timestamp: new Date('2026-03-27T11:00:00.000Z'),
      level: 'ERROR',
      channel: 'production',
      message: 'Newest entry',
      sourceFile: '/tmp/laravel.log',
      sourceLine: 11,
      byteOffset: 20,
      raw: 'Newest entry raw',
      context: { request: 'bravo' }
    }
  ];

  const filtered = filterSidebarEntries(entries, 'bravo');

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, '2');
  assert.equal(filterSidebarEntries(entries, '').map((entry) => entry.id).join(','), '2,1');
});
