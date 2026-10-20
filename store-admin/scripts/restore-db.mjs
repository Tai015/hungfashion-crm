import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { assertLocalPostgres, loadDbConfig, printDbConfig } from './db-env.mjs';

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      windowsHide: true,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.once('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error(`Không tìm thấy lệnh ${command}.`));
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

const dumpArg = process.argv[2];
if (!dumpArg) {
  console.error('Cách dùng: npm run db:restore -- backups/<file>.dump');
  process.exit(1);
}

const config = loadDbConfig();
printDbConfig(config);
assertLocalPostgres(config);

const dumpPath = path.resolve(dumpArg);
await access(dumpPath);
const env = { ...process.env, PGPASSWORD: config.password };

try {
  await run(config.pgRestore, [
    '-h', config.host,
    '-p', String(config.port),
    '-U', config.user,
    '-d', config.database,
    '--clean',
    '--if-exists',
    '--no-owner',
    dumpPath,
  ], env);
} catch (error) {
  console.warn(`${error.message}\nThử phục hồi qua Docker container store-postgres...`);
  const containerPath = `/tmp/${path.basename(dumpPath)}`;
  await run('docker', ['cp', dumpPath, `store-postgres:${containerPath}`], env);
  await run('docker', [
    'exec', 'store-postgres',
    'pg_restore', '-U', config.user, '-d', config.database,
    '--clean', '--if-exists', '--no-owner', containerPath,
  ], env);
}

console.log(`Đã phục hồi ${dumpPath} vào ${config.database}`);
