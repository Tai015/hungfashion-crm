import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectDir = path.dirname(serverDir);
dotenv.config({ path: path.join(serverDir, '.env') });
dotenv.config({ path: path.join(serverDir, '.env.example') });

// Bật SSL khi POSTGRES_SSL=true (Aiven bắt buộc SSL), local thì để trống/false
function buildSsl() {
  if (process.env.POSTGRES_SSL !== 'true') return false;

  const caPath = process.env.POSTGRES_CA_PATH;
  if (!caPath) throw new Error('POSTGRES_SSL=true requires POSTGRES_CA_PATH for certificate verification.');
  const resolvedCaPath = path.isAbsolute(caPath) ? caPath : path.resolve(projectDir, caPath);
  return { ca: fs.readFileSync(resolvedCaPath, 'utf-8'), rejectUnauthorized: true };
}

export const pool = new Pool({
  host:     process.env.POSTGRES_HOST,
  port:     Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user:     process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl:      buildSsl(),
});
