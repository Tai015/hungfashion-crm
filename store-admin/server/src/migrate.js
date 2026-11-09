import { pool } from './db.js';
import { runMigrations } from './migrations.js';
import { logger } from './logger.js';

try {
  await runMigrations({ baselineOnly: process.argv.includes('--baseline') });
} catch (error) {
  logger.fatal({ err: error }, 'Database migration failed');
  process.exitCode = 1;
} finally {
  await pool.end();
}
