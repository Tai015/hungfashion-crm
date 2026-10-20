import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { assertLocalPostgres, loadDbConfig, printDbConfig, serverDir, storeAdminDir } from './db-env.mjs';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const pg = require('pg');

const confirmed = process.argv.includes('--yes');
const config = loadDbConfig();

printDbConfig(config);
assertLocalPostgres(config);

if (!config.database || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.database)) {
  throw new Error('Tên database không hợp lệ.');
}
if (['postgres', 'template0', 'template1'].includes(config.database.toLowerCase())) {
  throw new Error(`Từ chối xóa database hệ thống "${config.database}".`);
}

if (!confirmed) {
  console.log('\nChưa xóa database. Đây là bước phá hủy dữ liệu.');
  console.log(`Sẽ DROP rồi CREATE database "${config.database}", sau đó chạy schema + migration từ đầu.`);
  console.log('Khi đã xác nhận, chạy: npm run db:reset -- --yes');
  process.exit(0);
}

function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: storeAdminDir,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(scriptPath)} thoát với mã ${code}`));
    });
  });
}

console.log('\nTạo backup trước khi xóa database...');
await runNodeScript(path.join(storeAdminDir, 'scripts', 'backup-db.mjs'));

async function terminateAndRecreate() {
  const admin = new pg.Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres',
  });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [config.database],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(config.database)}`);
    await admin.query(`CREATE DATABASE ${quoteIdent(config.database)} OWNER ${quoteIdent(config.user)}`);
    console.log(`Đã tạo lại database ${config.database}`);
  } finally {
    await admin.end();
  }
}

try {
  await terminateAndRecreate();
} catch (error) {
  console.warn(`${error.message}\nThử reset qua Docker container store-postgres...`);
  await new Promise((resolve, reject) => {
    const sql = [
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${config.database}' AND pid <> pg_backend_pid();`,
      `DROP DATABASE IF EXISTS ${config.database};`,
      `CREATE DATABASE ${config.database} OWNER ${config.user};`,
    ].join(' ');
    const child = spawn('docker', [
      'exec', '-i', 'store-postgres',
      'psql', '-U', config.user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql,
    ], { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker exec psql thoát với mã ${code}`));
    });
  });
}

await runNodeScript(path.join(serverDir, 'src', 'migrate.js'));

console.log('Reset database hoàn tất.');
