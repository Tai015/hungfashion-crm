import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineVersion = '000';

async function inTransaction(client, operation) {
  await client.query('BEGIN');
  try {
    await operation();
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function ensureBaseline(client, baselineOnly) {
  const { rows: [applied] } = await client.query(
    'SELECT version FROM store_admin_schema_migrations WHERE version = $1',
    [baselineVersion]
  );
  if (applied) return;

  const { rows: [result] } = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'store_admin_schema_migrations'`
  );

  if (result.count > 0 && !baselineOnly) {
    throw new Error('Existing database has no migration baseline. Run npm run db:baseline --workspace server once, then restart the API.');
  }

  if (result.count === 0 && baselineOnly) {
    throw new Error('Cannot baseline an empty database. Start the API once to create the initial schema.');
  }

  const schema = result.count === 0
    ? await readFile(path.join(serverDir, 'sql', 'schema.sql'), 'utf8')
    : undefined;
  await inTransaction(client, async () => {
    if (schema) await client.query(schema);
    await client.query(
      'INSERT INTO store_admin_schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
      [baselineVersion, 'schema.sql baseline']
    );
  });
  console.log(schema
    ? '✅ Applied initial schema baseline'
    : '✅ Recorded existing schema baseline');
}

export async function runMigrations({ baselineOnly = false } = {}) {
  const migrationsDir = path.join(serverDir, 'sql', 'migrations');
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith('.sql'))
    .sort();
  const migrations = filenames.map((filename) => {
    const match = /^(\d{3,})_[a-z0-9][a-z0-9_-]*\.sql$/.exec(filename);
    if (!match) throw new Error(`Invalid migration filename: ${filename}`);
    return { version: match[1], filename };
  });
  const versions = new Set(migrations.map(({ version }) => version));
  if (versions.size !== migrations.length) {
    throw new Error('Migration version numbers must be unique.');
  }

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(7420261001)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_admin_schema_migrations (
        version VARCHAR(32) PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await ensureBaseline(client, baselineOnly);
    if (baselineOnly) return;

    for (const { version, filename } of migrations) {
      const { rows: [applied] } = await client.query(
        'SELECT version FROM store_admin_schema_migrations WHERE version = $1',
        [version]
      );
      if (applied) continue;

      const sql = await readFile(path.join(migrationsDir, filename), 'utf8');
      await inTransaction(client, async () => {
        await client.query(sql);
        await client.query(
          'INSERT INTO store_admin_schema_migrations (version, name) VALUES ($1, $2)',
          [version, filename]
        );
      });
      console.log(`✅ Applied migration ${filename}`);
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(7420261001)');
    } finally {
      client.release();
    }
  }
}
