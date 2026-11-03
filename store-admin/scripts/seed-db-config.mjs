import fs from 'node:fs';
import path from 'node:path';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function createSeedClientConfig({
  target = 'local',
  config,
  sslEnabled,
  caPath,
  projectRoot,
  allowRuntimeTarget = false,
  readCa = filePath => fs.readFileSync(filePath, 'utf8'),
}) {
  if (!['local', 'aiven', 'runtime'].includes(target)) {
    throw new Error('SEED_TARGET phải là local hoặc aiven.');
  }

  const host = String(config.host || '').trim().toLowerCase();
  let ssl = false;

  if (target === 'local') {
    if (!LOOPBACK_HOSTS.has(host)) {
      throw new Error('Seed local chỉ được kết nối PostgreSQL trên máy này.');
    }
  } else if (target === 'aiven') {
    if (LOOPBACK_HOSTS.has(host)) {
      throw new Error('SEED_TARGET=aiven yêu cầu POSTGRES_HOST là máy chủ Aiven.');
    }
    if (sslEnabled !== 'true') {
      throw new Error('Seed Aiven yêu cầu POSTGRES_SSL=true.');
    }
    if (typeof caPath !== 'string' || !caPath.trim()) {
      throw new Error('Seed Aiven yêu cầu POSTGRES_CA_PATH để xác minh chứng thư.');
    }
    const resolvedCaPath = path.isAbsolute(caPath)
      ? caPath
      : path.resolve(projectRoot, caPath);
    ssl = { ca: readCa(resolvedCaPath), rejectUnauthorized: true };
  } else {
    if (!allowRuntimeTarget) {
      throw new Error('SEED_TARGET=runtime chỉ được dùng bởi thao tác seed đã xác thực trong ứng dụng.');
    }
    if (sslEnabled === 'true') {
      if (typeof caPath !== 'string' || !caPath.trim()) {
        throw new Error('Seed ứng dụng cần POSTGRES_CA_PATH khi bật SSL.');
      }
      const resolvedCaPath = path.isAbsolute(caPath)
        ? caPath
        : path.resolve(projectRoot, caPath);
      ssl = { ca: readCa(resolvedCaPath), rejectUnauthorized: true };
    }
  }

  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl,
  };
}
