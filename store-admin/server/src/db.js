import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(serverDir, '.env') });
dotenv.config({ path: path.join(serverDir, '.env.example') });

export const pool = new Pool({
  host:     process.env.POSTGRES_HOST,
  port:     Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user:     process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});
