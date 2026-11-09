import pg from 'pg';
import bcrypt from 'bcryptjs';

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
    email: isEmail ? identifier.toLowerCase() : null,
    password,
    fullName: role === 'KHACH_HANG' ? 'E2E Customer (disposable DB)' : 'E2E Staff (disposable DB)',
  };
}

const pool = new Pool({ connectionString: required('DATABASE_URL') });

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
    'QL_NHAN_SU',
    required('E2E_STAFF_IDENTIFIER'),
    required('E2E_STAFF_PASSWORD'),
  );

  await seedAccount(customer);
  await seedAccount(staff);
  console.log('Seeded dedicated E2E customer/staff accounts into disposable PostgreSQL only.');
} finally {
  await pool.end();
}
