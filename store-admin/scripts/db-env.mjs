import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const storeAdminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(storeAdminDir, 'server');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(serverDir, '.env'));
loadEnvFile(path.join(serverDir, '.env.example'));

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function loadDbConfig() {
  return {
    host: process.env.POSTGRES_HOST || '',
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB || '',
    user: process.env.POSTGRES_USER || '',
    password: process.env.POSTGRES_PASSWORD || '',
    pgDump: process.env.PG_DUMP_PATH || 'pg_dump',
    pgRestore: process.env.PG_RESTORE_PATH || 'pg_restore',
    storeAdminDir,
    serverDir,
  };
}

export function assertLocalPostgres(config) {
  const host = String(config.host).trim().toLowerCase();
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Từ chối thao tác: POSTGRES_HOST=${config.host} không phải localhost.`,
    );
  }
}

export function printDbConfig(config) {
  console.log('--- Cấu hình PostgreSQL ---');
  console.log(`Host:     ${config.host}`);
  console.log(`Port:     ${config.port}`);
  console.log(`Database: ${config.database}`);
  console.log(`User:     ${config.user}`);
  console.log(`Password: ${config.password ? '(đã cấu hình)' : '(trống)'}`);
}

export { storeAdminDir, serverDir };
