import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/accounts – danh sách tài khoản
router.get('/', async (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (role) {
      params.push(role);
      conditions.push(`r.role_name = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(a.username ILIKE $${params.length} OR a.email ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT a.account_id, a.username, a.email, a.phone, a.status,
              a.last_login, a.created_at, r.role_name
       FROM account a
       JOIN role r ON r.role_id = a.role_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM account a JOIN role r ON r.role_id = a.role_id ${where}`,
      params.slice(0, -2)
    );

    res.json({ data: rows, total: countRows[0].total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/accounts/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, r.role_name
       FROM account a JOIN role r ON r.role_id = a.role_id
       WHERE a.account_id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/accounts – tạo tài khoản mới
router.post('/', async (req, res) => {
  try {
    const { role_id, username, password_hash, email, phone } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO account (role_id, username, password_hash, email, phone)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [role_id, username, password_hash, email, phone]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Username hoặc email đã tồn tại' });
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/accounts/:id/status – khóa / mở khóa
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body; // 'Active' | 'Blocked'
    const { rows } = await pool.query(
      `UPDATE account SET status=$1, updated_at=NOW()
       WHERE account_id=$2 RETURNING account_id, username, status`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/accounts/:id/role – phân quyền
router.patch('/:id/role', async (req, res) => {
  try {
    const { role_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE account SET role_id=$1, updated_at=NOW()
       WHERE account_id=$2 RETURNING account_id, username, role_id`,
      [role_id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM account WHERE account_id=$1`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    res.json({ message: 'Xóa tài khoản thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/accounts/roles/all – danh sách role
router.get('/roles/all', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM role ORDER BY role_id`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
