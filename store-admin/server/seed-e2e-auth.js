import pg from 'pg';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required E2E secret/environment variable: ${name}`);
  return value;
}

function accountInput(role, identifier, password) {
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error(`${role} E2E password must be 8-72 UTF-8 bytes.`);
  }

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  return {
    role,
    username: isEmail ? `e2e_${role.toLowerCase()}` : identifier,
    email: isEmail ? identifier.toLowerCase() : (role === 'KHACH_HANG' ? 'e2e.customer@hungfashion.test' : null),
    password,
    fullName: role === 'KHACH_HANG' ? 'E2E Customer (disposable DB)' : 'E2E Inventory Staff (disposable DB)',
  };
}

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(serverDir, '..');

function postgresConfig() {
  const host = required('POSTGRES_HOST');
  const portValue = required('POSTGRES_PORT');
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('POSTGRES_PORT must be an integer between 1 and 65535.');
  }

  const database = required('POSTGRES_DB');
  const user = required('POSTGRES_USER');
  const password = required('POSTGRES_PASSWORD');
  const sslValue = required('POSTGRES_SSL').toLowerCase();
  if (!['true', 'false'].includes(sslValue)) {
    throw new Error('POSTGRES_SSL must be either "true" or "false".');
  }

  let ssl = false;
  if (sslValue === 'true') {
    const caPath = process.env.POSTGRES_CA_PATH;
    if (!caPath) {
      throw new Error('POSTGRES_SSL=true requires POSTGRES_CA_PATH for certificate verification.');
    }
    const resolvedCaPath = path.isAbsolute(caPath) ? caPath : path.resolve(projectDir, caPath);
    ssl = { ca: fs.readFileSync(resolvedCaPath, 'utf8'), rejectUnauthorized: true };
  }

  return { host, port, database, user, password, ssl };
}

const pool = new Pool(postgresConfig());

async function seedAccount(input) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const { rows: [account] } = await pool.query(
    `INSERT INTO account (role_id, username, password_hash, email, status)
     SELECT role_id, $1, $2, $3, 'Active'
     FROM role WHERE role_name = $4
     RETURNING account_id`,
    [input.username, passwordHash, input.email, input.role],
  );

  if (!account) throw new Error(`Required role not found in schema: ${input.role}`);

  if (input.role === 'KHACH_HANG') {
    await pool.query(
      `INSERT INTO customer (account_id, full_name, email)
       VALUES ($1, $2, $3)`,
      [account.account_id, input.fullName, input.email],
    );
  } else {
    await pool.query(
      `INSERT INTO employee (account_id, full_name, position, hire_date, is_active)
       VALUES ($1, $2, 'E2E Staff', CURRENT_DATE, TRUE)`,
      [account.account_id, input.fullName],
    );
  }
}

try {
  const customer = accountInput(
    'KHACH_HANG',
    required('E2E_CUSTOMER_IDENTIFIER'),
    required('E2E_CUSTOMER_PASSWORD'),
  );
  const staff = accountInput(
    'ADMIN',
    required('E2E_STAFF_IDENTIFIER'),
    required('E2E_STAFF_PASSWORD'),
  );

  await seedAccount(customer);
  await seedAccount(staff);
  console.log('Seeded dedicated E2E customer/staff accounts into disposable PostgreSQL only.');
} finally {
  await pool.end();
}
