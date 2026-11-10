import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

function validateEmployeeContact({ phone, email, address }) {
  if (phone != null && (typeof phone !== 'string' || phone.trim().length > 20)) return 'Số điện thoại tối đa 20 ký tự.';
  if (email != null && (typeof email !== 'string' || email.length > 150 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) return 'Email nhân viên không hợp lệ.';
  if (address != null && (typeof address !== 'string' || address.length > 500)) return 'Địa chỉ tối đa 500 ký tự.';
  return null;
}

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
  const contactError = validateEmployeeContact({ phone, email, address });
  if (contactError) return res.status(400).json({ message: contactError });
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
  if (typeof position !== 'string' || !position.trim() || position.trim().length > 100) {
    return res.status(400).json({ message: 'Chức vụ là bắt buộc và tối đa 100 ký tự.' });
  }
  const contactError = validateEmployeeContact({ phone, email, address });
  if (contactError) return res.status(400).json({ message: contactError });
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


// DELETE /api/employees/:id – chỉ cho phép xóa nhân viên đã ngừng hoạt động.
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: employeeRows } = await client.query(
      'SELECT employee_id, account_id, is_active FROM employee WHERE employee_id = $1 FOR UPDATE',
      [req.params.id],
    );
    if (!employeeRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy nhân viên.' });
    }
    const employee = employeeRows[0];
    if (employee.is_active) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Không thể xóa nhân viên đang hoạt động. Hãy ngừng hoạt động trước.' });
    }
    // Khóa tài khoản đăng nhập liên kết (nếu có), giữ lại dấu vết tài khoản.
    if (employee.account_id) {
      await client.query("UPDATE account SET status = 'Blocked' WHERE account_id = $1", [employee.account_id]);
    }
    await client.query('DELETE FROM employee WHERE employee_id = $1', [employee.employee_id]);
    await client.query('COMMIT');
    return res.json({ message: 'Đã xóa nhân viên.' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23503') {
      return res.status(409).json({ message: 'Không thể xóa nhân viên vì hồ sơ đang được sử dụng trong chứng từ hoặc dữ liệu lịch sử.' });
    }
    return res.status(500).json({ message: 'Không thể xóa nhân viên.' });
  } finally {
    client.release();
  }
});

export default router;
