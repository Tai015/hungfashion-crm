import { pool } from './db.js';
import { runMigrations } from './migrations.js';

try {
  await runMigrations({ baselineOnly: process.argv.includes('--baseline') });
} catch (error) {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
