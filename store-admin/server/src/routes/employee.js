import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { search = '', page = '1', limit = '20' } = req.query;
    const pageNumber = Number(page);
    const pageSize = Number(limit);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const pattern = `%${String(search).trim()}%`;
    const offset = (pageNumber - 1) * pageSize;
    const [result, count] = await Promise.all([
      pool.query(
        `SELECT e.employee_id, e.account_id, e.full_name, e.gender, e.date_of_birth,
                e.phone, e.email, e.address, e.position, e.hire_date, e.is_active,
                a.username, r.role_name
         FROM employee e
         LEFT JOIN account a ON a.account_id = e.account_id
         LEFT JOIN role r ON r.role_id = a.role_id
         WHERE $1 = '%%' OR e.full_name ILIKE $1 OR e.email ILIKE $1 OR e.position ILIKE $1
         ORDER BY e.employee_id
         LIMIT $2 OFFSET $3`,
        [pattern, pageSize, offset],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM employee e
         WHERE $1 = '%%' OR e.full_name ILIKE $1 OR e.email ILIKE $1 OR e.position ILIKE $1`,
        [pattern],
      ),
    ]);
    return res.json({ data: result.rows, total: count.rows[0].total, page: pageNumber, limit: pageSize });
  } catch {
    return res.status(500).json({ message: 'Không thể tải danh sách nhân viên.' });
  }
});

router.post('/', async (req, res) => {
  const { full_name, gender = null, date_of_birth = null, phone = null, email = null, address = null, position } = req.body || {};
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 150) {
    return res.status(400).json({ message: 'Họ tên là bắt buộc và tối đa 150 ký tự.' });
  }
  if (typeof position !== 'string' || !position.trim() || position.trim().length > 100) {
    return res.status(400).json({ message: 'Chức vụ là bắt buộc và tối đa 100 ký tự.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO employee (full_name, gender, date_of_birth, phone, email, address, position)
       VALUES ($1,$2::gender_type,$3,$4,$5,$6,$7) RETURNING *`,
      [full_name.trim(), gender, date_of_birth, phone, email, address, position.trim()],
    );
    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '22P02' || error.code === '22007') return res.status(400).json({ message: 'Giới tính hoặc ngày sinh không hợp lệ.' });
    return res.status(500).json({ message: 'Không thể tạo nhân viên.' });
  }
});

router.put('/:id', async (req, res) => {
  const { full_name, gender = null, date_of_birth = null, phone = null, email = null, address = null, position = null, is_active = true } = req.body || {};
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 150) {
    return res.status(400).json({ message: 'Họ tên là bắt buộc và tối đa 150 ký tự.' });
  }
  if (typeof is_active !== 'boolean') return res.status(400).json({ message: 'Trạng thái nhân viên không hợp lệ.' });
  try {
    const { rows } = await pool.query(
      `UPDATE employee SET full_name=$1, gender=$2::gender_type, date_of_birth=$3,
         phone=$4, email=$5, address=$6, position=$7, is_active=$8
       WHERE employee_id=$9 RETURNING *`,
      [full_name.trim(), gender, date_of_birth, phone, email, address, position, is_active, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy nhân viên.' });
    return res.json(rows[0]);
  } catch (error) {
    if (error.code === '22P02' || error.code === '22007') return res.status(400).json({ message: 'Giới tính hoặc ngày sinh không hợp lệ.' });
    return res.status(500).json({ message: 'Không thể cập nhật nhân viên.' });
  }
});

export default router;
