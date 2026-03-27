const test = require('node:test');
const assert = require('node:assert/strict');

const { LaravelLogParser } = require('../out/infrastructure/parsing/laravel-log-parser.js');

test('LaravelLogParser parses multiline log entries with context and ids', () => {
  const parser = new LaravelLogParser();
  const raw = `[2026-03-26 10:00:00] production.ERROR: Job failed request_id=req-123 user_id=42 {"job":"sync"}\n#0 /app/Jobs/Sync.php(12): run()\n#1 {main}`;

  const entry = parser.parseEntry(raw, {
    sourceFile: '/tmp/laravel.log',
    sourceLine: 15,
    byteOffset: 180
  });

  assert.ok(entry);
  assert.equal(entry.level, 'ERROR');
  assert.equal(entry.channel, 'production');
  assert.equal(entry.sourceLine, 15);
  assert.equal(entry.byteOffset, 180);
  assert.equal(entry.requestId, 'req-123');
  assert.equal(entry.userId, '42');
  assert.equal(entry.context.job, 'sync');
  assert.match(entry.stackTrace, /Sync\.php/);
});

test('LaravelLogParser parses monolog json lines used by app_coll_cam', () => {
  const parser = new LaravelLogParser();
  const raw = JSON.stringify({
    message: 'GET api/users/81216',
    context: {
      type: 'Api Request',
      query_params: { orderBy: 'lastName' }
    },
    level: 200,
    level_name: 'INFO',
    channel: 'local',
    datetime: '2026-03-26T17:59:27.516620+01:00',
    extra: {
      request_id: '69c565ef7eaa79.30162474',
      source: {
        file: '/var/www/html/app/Http/Middleware/InjectUserContext.php',
        line: 65
      }
    }
  });

  const entry = parser.parseEntry(raw, {
    sourceFile: '/tmp/laravel-2026-03-26.log',
    sourceLine: 3,
    byteOffset: 512
  });

  assert.ok(entry);
  assert.equal(entry.level, 'INFO');
  assert.equal(entry.channel, 'local');
  assert.equal(entry.requestId, '69c565ef7eaa79.30162474');
  assert.equal(entry.sourceFile, '/var/www/html/app/Http/Middleware/InjectUserContext.php');
  assert.equal(entry.sourceLine, 65);
  assert.equal(entry.context.context.type, 'Api Request');
  assert.equal(entry.context.extra.request_id, '69c565ef7eaa79.30162474');
});
