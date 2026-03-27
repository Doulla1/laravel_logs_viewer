const test = require('node:test');
const assert = require('node:assert/strict');

const { LogQueryService } = require('../out/application/services/log-query-service.js');

test('LogQueryService filters by level, text and date range, then sorts', () => {
  const service = new LogQueryService();
  const entries = [
    {
      id: '1',
      timestamp: new Date('2026-03-26T10:00:00.000Z'),
      level: 'ERROR',
      channel: 'production',
      message: 'Queue failed user_id=12',
      sourceFile: '/tmp/laravel.log',
      sourceLine: 1,
      byteOffset: 0,
      raw: 'raw-1'
    },
    {
      id: '2',
      timestamp: new Date('2026-03-26T09:00:00.000Z'),
      level: 'INFO',
      channel: 'production',
      message: 'Job processed user_id=12',
      sourceFile: '/tmp/laravel.log',
      sourceLine: 2,
      byteOffset: 120,
      raw: 'raw-2'
    }
  ];

  const result = service.apply(entries, {
    text: 'user_id=12',
    levels: new Set(['ERROR']),
    range: {
      start: new Date('2026-03-26T08:30:00.000Z'),
      end: new Date('2026-03-26T10:30:00.000Z')
    },
    sortDirection: 'desc'
  });

  assert.equal(result.total, 1);
  assert.equal(result.entries[0].id, '1');
});
