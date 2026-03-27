const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { LogWorkspaceService } = require('../out/application/services/log-workspace-service.js');
const { LogQueryService } = require('../out/application/services/log-query-service.js');

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'laravel-logs-bench-'));
  const logFile = path.join(tempDir, 'laravel.log');
  const totalEntries = 20000;
  const lines = [];

  for (let index = 0; index < totalEntries; index += 1) {
    const level = index % 3 === 0 ? 'ERROR' : index % 3 === 1 ? 'WARNING' : 'INFO';
    lines.push(
      `[2026-03-26 10:${`${index % 60}`.padStart(2, '0')}:00] production.${level}: Synthetic entry ${index} request_id=req-${index} user_id=${index}\n`
    );
  }

  await fs.writeFile(logFile, lines.join(''));

  const workspaceService = new LogWorkspaceService();
  const queryService = new LogQueryService();

  const loadStart = process.hrtime.bigint();
  const snapshot = await workspaceService.load([logFile], 100 * 1024 * 1024);
  const loadMs = Number(process.hrtime.bigint() - loadStart) / 1e6;

  const queryStart = process.hrtime.bigint();
  const result = queryService.apply(snapshot.entries, {
    text: 'request_id=req-199',
    levels: new Set(['ERROR', 'WARNING', 'INFO']),
    range: {},
    sortDirection: 'desc'
  });
  const queryMs = Number(process.hrtime.bigint() - queryStart) / 1e6;

  console.log(`entries=${snapshot.entries.length}`);
  console.log(`load_ms=${loadMs.toFixed(2)}`);
  console.log(`query_ms=${queryMs.toFixed(2)}`);
  console.log(`memory_mb=${(process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2)}`);
  console.log(`query_hits=${result.total}`);

  await fs.rm(tempDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
