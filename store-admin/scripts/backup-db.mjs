import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { assertLocalPostgres, loadDbConfig, printDbConfig, storeAdminDir } from './db-env.mjs';

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      windowsHide: true,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.once('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error(`Không tìm thấy lệnh ${command}. Cài PostgreSQL client tools hoặc Docker Desktop.`));
        return;
      }
      reject(error);
    });
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} thoát với mã ${code}`));
    });
  });
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const config = loadDbConfig();
printDbConfig(config);
assertLocalPostgres(config);

const backupsDir = path.join(storeAdminDir, 'backups');
await mkdir(backupsDir, { recursive: true });
const filename = `${config.database}-${stamp()}.dump`;
const outputPath = path.join(backupsDir, filename);
const env = { ...process.env, PGPASSWORD: config.password };

try {
  await run(config.pgDump, [
    '-h', config.host,
    '-p', String(config.port),
    '-U', config.user,
    '-d', config.database,
    '-Fc',
    '--file', outputPath,
  ], env);
} catch (error) {
  console.warn(`${error.message}\nThử sao lưu qua Docker container store-postgres...`);
  const containerPath = `/tmp/${filename}`;
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await run('docker', [
        'exec', 'store-postgres',
        'pg_dump', '-U', config.user, '-d', config.database, '-Fc', '-f', containerPath,
      ], env);
      lastError = null;
      break;
    } catch (dockerError) {
      lastError = dockerError;
      console.warn(`Lần ${attempt}/12: PostgreSQL chưa sẵn sàng, đợi 3 giây...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  if (lastError) throw lastError;
  await run('docker', ['cp', `store-postgres:${containerPath}`, outputPath], env);
}

console.log(`Đã sao lưu: ${outputPath}`);
