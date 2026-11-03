import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createSeedClientConfig } from './seed-db-config.mjs';

const config = {
  host: '127.0.0.1', port: 5432, user: 'demo', password: 'not-logged', database: 'demo',
};

test('local seed permits loopback PostgreSQL and disables SSL', () => {
  const result = createSeedClientConfig({ target: 'local', config });
  assert.equal(result.host, '127.0.0.1');
  assert.equal(result.ssl, false);
});

test('local seed refuses a remote database', () => {
  assert.throws(
    () => createSeedClientConfig({ target: 'local', config: { ...config, host: 'db.example.test' } }),
    /chỉ được kết nối PostgreSQL trên máy này/,
  );
});

test('Aiven seed requires SSL and a CA certificate', () => {
  const remoteConfig = { ...config, host: 'aiven.example.test' };
  assert.throws(
    () => createSeedClientConfig({ target: 'aiven', config: remoteConfig, sslEnabled: 'false', caPath: 'ca.pem' }),
    /POSTGRES_SSL=true/,
  );
  assert.throws(
    () => createSeedClientConfig({ target: 'aiven', config: remoteConfig, sslEnabled: 'true' }),
    /POSTGRES_CA_PATH/,
  );
});

test('Aiven seed uses the CA and verifies the server certificate', () => {
  let readPath;
  const result = createSeedClientConfig({
    target: 'aiven',
    config: { ...config, host: 'aiven.example.test' },
    sslEnabled: 'true',
    caPath: 'certs/ca.pem',
    projectRoot: 'D:/project',
    readCa: filePath => { readPath = filePath; return 'test-ca'; },
  });
  assert.equal(readPath, path.resolve('D:/project/certs/ca.pem'));
  assert.deepEqual(result.ssl, { ca: 'test-ca', rejectUnauthorized: true });
});
