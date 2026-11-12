import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { logger } from '../logger.js';

const ADMIN_GUARD_LOCK_ID = 741029001;

export function createAccountRouter(database = pool) {
  const router = Router();

  async function lockActiveAdmins(client) {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const { rows: [guard] } = await client.query(
      'SELECT pg_try_advisory_xact_lock($1) AS acquired',
      [ADMIN_GUARD_LOCK_ID],
    );
    if (!guard?.acquired) return null;
    const { rows } = await client.query(
      `SELECT a.account_id
       FROM account a JOIN role r ON r.role_id = a.role_id
       WHERE r.role_name = 'ADMIN' AND a.status = 'Active'
       ORDER BY a.account_id
       FOR UPDATE OF a`,
    );
    return rows;
  }

  async function loadTarget(client, accountId) {
    const { rows } = await client.query(
      `SELECT a.account_id, a.username, a.status, a.role_id, r.role_name,
              (SELECT COUNT(*)::int FROM account_sessions s
               WHERE s.account_id = a.account_id AND s.revoked_at IS NULL
                 AND s.expires_at > NOW() AND a.status = 'Active') AS active_session_count
       FROM account a JOIN role r ON r.role_id = a.role_id
       WHERE a.account_id = $1 FOR UPDATE OF a`,
      [accountId],
    );
    return rows[0] || null;
  }

  async function hasRecentHeartbeat(client, accountId) {
    const { rows: [row] } = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM account_sessions s
         JOIN account a ON a.account_id = s.account_id
         WHERE s.account_id = $1 AND s.revoked_at IS NULL
           AND s.expires_at > statement_timestamp()
           AND s.last_seen_at >= statement_timestamp() - INTERVAL '2 minutes'
           AND a.status = 'Active'
       ) AS is_online`,
      [accountId],
    );
    return row.is_online;
  }

  async function accountHasRelatedData(client, accountId) {
    const { rows: [row] } = await client.query(
      `SELECT (
         EXISTS (SELECT 1 FROM customer c WHERE c.account_id = $1)
         OR EXISTS (SELECT 1 FROM employee e WHERE e.account_id = $1)
         OR EXISTS (SELECT 1 FROM chat_message m WHERE m.sender_account_id = $1)
       ) AS has_related_data`,
      [accountId],
    );
    return row.has_related_data;
  }

  async function writeAccountAudit(client, { actorAccountId, eventType, target, before, after }) {
    const details = [
      `target_account_id=${target.account_id}`,
      `target_username=${target.username}`,
      `role=${before?.role_name ?? '—'}->${after?.role_name ?? '—'}`,
      `status=${before?.status ?? '—'}->${after?.status ?? '—'}`,
    ].join('; ');
    await client.query(
      `INSERT INTO user_events
         (event_id, user_id, event_type, page, section, action, source_check, source, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [randomUUID(), String(actorAccountId), eventType, '/admin/accounts', `account:${target.account_id}`,
        details, 'account-management', 'admin-api'],
    );
  }

  const parseAccountId = value => {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };

  // GET /api/accounts – list accounts with efficient safety metadata.
  router.get('/', async (req, res) => {
    try {
      const { role, status, search, page = 1, limit = 20 } = req.query;
      const parsedPage = Number(page);
      const parsedLimit = Number(limit);
      if (!Number.isSafeInteger(parsedPage) || parsedPage < 1
        || !Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return res.status(400).json({ message: 'Trang phải là số nguyên từ 1 trở lên và số dòng mỗi trang từ 1 đến 100.' });
      }
      if (search !== undefined && (typeof search !== 'string' || search.length > 150)) {
        return res.status(400).json({ message: 'Từ khóa tìm kiếm không hợp lệ.' });
      }
      const offset = (parsedPage - 1) * parsedLimit;
      if (!Number.isSafeInteger(offset)) {
        return res.status(400).json({ message: 'Trang yêu cầu vượt quá giới hạn hợp lệ.' });
      }
      const conditions = [];
      const params = [];
      if (role) { params.push(role); conditions.push(`r.role_name = $${params.length}`); }
      if (status) { params.push(status); conditions.push(`a.status = $${params.length}`); }
      if (search?.trim()) {
        const escapedSearch = search.trim().replace(/[!%_]/g, character => `!${character}`);
        params.push(`%${escapedSearch}%`);
        conditions.push(`(a.username ILIKE $${params.length} ESCAPE '!' OR a.email ILIKE $${params.length} ESCAPE '!')`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(parsedLimit, offset);
      const { rows } = await database.query(
        `SELECT a.account_id, a.username, a.email, a.phone, a.status,
                a.last_login, a.created_at, r.role_name,
                (EXISTS (SELECT 1 FROM customer c WHERE c.account_id = a.account_id)
                 OR EXISTS (SELECT 1 FROM employee e WHERE e.account_id = a.account_id)
                 OR EXISTS (SELECT 1 FROM chat_message m WHERE m.sender_account_id = a.account_id)) AS has_related_data,
                (r.role_name = 'ADMIN' AND a.status = 'Active'
                 AND (SELECT COUNT(*) FROM account active_a
                      JOIN role active_r ON active_r.role_id = active_a.role_id
                      WHERE active_r.role_name = 'ADMIN' AND active_a.status = 'Active') = 1) AS is_last_active_admin,
                (SELECT COUNT(*)::int FROM account_sessions s
                 WHERE s.account_id = a.account_id AND s.revoked_at IS NULL
                   AND s.expires_at > NOW() AND a.status = 'Active') AS active_session_count,
                (SELECT COUNT(*)::int FROM account_sessions s
                 WHERE s.account_id = a.account_id AND s.revoked_at IS NULL
                   AND s.expires_at > statement_timestamp()
                   AND s.last_seen_at >= statement_timestamp() - INTERVAL '2 minutes'
                   AND a.status = 'Active') AS online_session_count
         FROM account a JOIN role r ON r.role_id = a.role_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const { rows: countRows } = await database.query(
        `SELECT COUNT(*)::int AS total FROM account a JOIN role r ON r.role_id = a.role_id ${where}`,
        params.slice(0, -2),
      );
      res.json({ data: rows, total: countRows[0].total, page: parsedPage, limit: parsedLimit });
    } catch (err) {
      logger.error({ err, requestId: req.requestId }, 'Account list failed');
      res.status(500).json({ message: 'Không thể tải danh sách tài khoản.' });
    }
  });

  // GET /api/accounts/roles/all – role catalog.
  router.get('/roles/all', async (_req, res) => {
    try {
      const { rows } = await database.query('SELECT role_id, role_name, description FROM role ORDER BY role_id');
      res.json(rows);
    } catch (err) {
      logger.error({ err, requestId: req.requestId }, 'Account roles list failed');
      res.status(500).json({ message: 'Không thể tải danh sách vai trò.' });
    }
  });

  router.get('/customer-profile', async (req, res) => {
    const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
    if (!email || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Email không hợp lệ.' });
    }
    try {
      const { rows } = await database.query(
        `SELECT account_id FROM customer
         WHERE LOWER(BTRIM(email)) = $1`,
        [email],
      );
      return res.json({
        exists: rows.length > 0,
        linked: rows.length > 0 && rows[0].account_id != null,
      });
    } catch (err) {
      logger.error({ err, requestId: req.requestId }, 'Customer profile lookup failed');
      return res.status(500).json({ message: 'Không thể kiểm tra hồ sơ khách hàng.' });
    }
  });

  router.get('/:id', async (req, res) => {
    const accountId = parseAccountId(req.params.id);
    if (!accountId) return res.status(400).json({ message: 'Mã tài khoản không hợp lệ.' });
    try {
      const { rows } = await database.query(
        `SELECT a.account_id, a.role_id, a.username, a.email, a.phone,
                a.status, a.last_login, a.created_at, a.updated_at, r.role_name
         FROM account a JOIN role r ON r.role_id = a.role_id WHERE a.account_id = $1`,
        [accountId],
      );
      if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
      return res.json(rows[0]);
    } catch (err) {
      logger.error({ err, requestId: req.requestId }, 'Account detail failed');
      return res.status(500).json({ message: 'Không thể tải tài khoản.' });
    }
  });

  router.post('/', async (req, res) => {
    let client;
    try {
      const { role_id, username, password, email = null, phone = null } = req.body || {};
      const roleId = Number(role_id);
      if (!Number.isSafeInteger(roleId) || roleId < 1 || typeof username !== 'string'
        || !/^[a-zA-Z0-9_.-]{3,100}$/.test(username.trim())
        || typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({ message: 'Vai trò, tên đăng nhập hoặc mật khẩu không hợp lệ.' });
      }
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : null;
      const passwordHash = await bcrypt.hash(password, 12);
      client = await database.connect();
      await client.query('BEGIN');
      const { rows: roleRows } = await client.query('SELECT role_id, role_name FROM role WHERE role_id=$1', [roleId]);
      if (!roleRows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Vai trò được chọn không tồn tại.' });
      }
      const isCustomerAccount = roleRows[0].role_name === 'KHACH_HANG';
      if (isCustomerAccount && (!normalizedEmail || normalizedEmail.length > 150
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Tài khoản khách hàng cần có email hợp lệ.' });
      }
      let customerProfile = null;
      if (isCustomerAccount) {
        const { rows: customerRows } = await client.query(
          `SELECT customer_id, account_id
           FROM customer
           WHERE LOWER(BTRIM(email)) = $1
           FOR UPDATE`,
          [normalizedEmail],
        );
        customerProfile = customerRows[0] || null;
        if (customerProfile?.account_id != null) {
          await client.query('ROLLBACK');
          return res.status(409).json({ message: 'Email này đã liên kết với một tài khoản khách hàng khác.' });
        }
      }
      const { rows } = await client.query(
        `INSERT INTO account (role_id, username, password_hash, email, phone)
         VALUES ($1,$2,$3,$4,$5) RETURNING account_id, role_id, username, email, phone, status`,
        [roleId, username.trim(), passwordHash, normalizedEmail, phone],
      );
      const created = rows[0];
      if (isCustomerAccount) {
        if (customerProfile) {
          const { rows: linkedProfiles } = await client.query(
            `UPDATE customer SET account_id = $1
             WHERE customer_id = $2 AND account_id IS NULL
             RETURNING customer_id`,
            [created.account_id, customerProfile.customer_id],
          );
          if (!linkedProfiles.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'Hồ sơ khách hàng vừa được liên kết với tài khoản khác. Vui lòng tải lại và thử lại.' });
          }
        } else {
          await client.query(
            `INSERT INTO customer (account_id, full_name, email, phone)
             VALUES ($1,NULL,$2,$3)`,
            [created.account_id, normalizedEmail, phone],
          );
        }
      }
      await writeAccountAudit(client, {
        actorAccountId: req.user.account_id,
        eventType: 'account_created',
        target: created,
        before: null,
        after: { role_name: roleRows[0].role_name, status: created.status },
      });
      await client.query('COMMIT');
      return res.status(201).json({
        account_id: created.account_id, role_id: created.role_id, username: created.username,
        email: created.email, phone: created.phone, status: created.status,
      });
    } catch (err) {
      await client?.query('ROLLBACK').catch(() => {});
      if (err.code === '23505') return res.status(409).json({ message: 'Username hoặc email đã tồn tại' });
      logger.error({ err, requestId: req.requestId }, 'Account creation failed');
      return res.status(500).json({ message: 'Không thể tạo tài khoản lúc này.' });
    } finally {
      client?.release();
    }
  });

  router.patch('/:id/status', async (req, res) => {
    const accountId = parseAccountId(req.params.id);
    if (!accountId) return res.status(400).json({ message: 'Mã tài khoản không hợp lệ.' });
    const { status } = req.body || {};
    if (!['Active', 'Blocked', 'Pending'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái tài khoản không hợp lệ.' });
    }
    let client;
    try {
      client = await database.connect();
      await client.query('BEGIN');
      const activeAdmins = await lockActiveAdmins(client);
      if (!activeAdmins) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Đang có thao tác quản trị tài khoản khác. Vui lòng thử lại sau.' });
      }
      const target = await loadTarget(client, accountId);
      if (!target) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy tài khoản.' }); }
      if (Number(req.user.account_id) === accountId && status !== 'Active') {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Không thể khóa chính tài khoản đang đăng nhập.' });
      }
      if (target.role_name === 'ADMIN' && target.status === 'Active' && status !== 'Active' && activeAdmins.length <= 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Phải còn ít nhất một quản trị viên đang hoạt động.' });
      }
      const { rows } = await client.query(
        `UPDATE account SET status=$1, updated_at=NOW()
         WHERE account_id=$2 RETURNING account_id, username, status`,
        [status, accountId],
      );
      if (status !== 'Active') {
        await client.query(
          `UPDATE account_sessions SET revoked_at = NOW()
           WHERE account_id = $1 AND revoked_at IS NULL`,
          [accountId],
        );
      }
      const eventType = status === 'Blocked'
        ? 'account_locked'
        : target.status === 'Blocked' && status === 'Active' ? 'account_unlocked' : 'account_status_changed';
      await writeAccountAudit(client, {
        actorAccountId: req.user.account_id,
        eventType,
        target,
        before: { role_name: target.role_name, status: target.status },
        after: { role_name: target.role_name, status: rows[0].status },
      });
      await client.query('COMMIT');
      return res.json(rows[0]);
    } catch (err) {
      await client?.query('ROLLBACK').catch(() => {});
      if (err.code === '55P03') {
        return res.status(409).json({ message: 'Tài khoản đang được cập nhật bởi thao tác khác. Vui lòng thử lại sau.' });
      }
      if (err.code === '57014') {
        return res.status(503).json({ message: 'Cơ sở dữ liệu đang xử lý quá lâu. Vui lòng thử lại sau.' });
      }
      logger.error({ err, requestId: req.requestId }, 'Account status update failed');
      return res.status(500).json({ message: 'Không thể cập nhật trạng thái tài khoản lúc này.' });
    } finally { client?.release(); }
  });

  router.patch('/:id/role', async (req, res) => {
    const accountId = parseAccountId(req.params.id);
    if (!accountId) return res.status(400).json({ message: 'Mã tài khoản không hợp lệ.' });
    const { role_id } = req.body || {};
    if (!Number.isSafeInteger(Number(role_id)) || Number(role_id) < 1) {
      return res.status(400).json({ message: 'Vai trò không hợp lệ.' });
    }
    let client;
    try {
      client = await database.connect();
      await client.query('BEGIN');
      const activeAdmins = await lockActiveAdmins(client);
      if (!activeAdmins) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Đang có thao tác quản trị tài khoản khác. Vui lòng thử lại sau.' });
      }
      const target = await loadTarget(client, accountId);
      if (!target) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy tài khoản.' }); }
      const { rows: roleRows } = await client.query('SELECT role_id, role_name FROM role WHERE role_id=$1', [Number(role_id)]);
      if (!roleRows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Vai trò được chọn không tồn tại.' });
      }
      const nextRole = roleRows[0];
      if (Number(req.user.account_id) === accountId && Number(nextRole.role_id) !== Number(target.role_id)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Không thể thay đổi vai trò của chính tài khoản đang đăng nhập.' });
      }
      if (Number(nextRole.role_id) !== Number(target.role_id) && await hasRecentHeartbeat(client, accountId)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Tài khoản vừa gửi heartbeat và đang online. Hãy thử đổi vai trò lại sau khi tài khoản offline.' });
      }
      if (target.role_name === 'ADMIN' && target.status === 'Active' && nextRole.role_name !== 'ADMIN' && activeAdmins.length <= 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Phải còn ít nhất một quản trị viên đang hoạt động.' });
      }
      const { rows } = await client.query(
        `UPDATE account SET role_id=$1, updated_at=NOW()
         WHERE account_id=$2 RETURNING account_id, username, role_id`,
        [nextRole.role_id, accountId],
      );
      await writeAccountAudit(client, {
        actorAccountId: req.user.account_id,
        eventType: 'account_role_changed',
        target,
        before: { role_name: target.role_name, status: target.status },
        after: { role_name: nextRole.role_name, status: target.status },
      });
      await client.query('COMMIT');
      return res.json(rows[0]);
    } catch (err) {
      await client?.query('ROLLBACK').catch(() => {});
      if (err.code === '55P03') {
        return res.status(409).json({ message: 'Tài khoản đang được cập nhật bởi thao tác khác. Vui lòng thử lại sau.' });
      }
      if (err.code === '57014') {
        return res.status(503).json({ message: 'Cơ sở dữ liệu đang xử lý quá lâu. Vui lòng thử lại sau.' });
      }
      logger.error({ err, requestId: req.requestId }, 'Account role update failed');
      return res.status(500).json({ message: 'Không thể cập nhật vai trò tài khoản lúc này.' });
    } finally { client?.release(); }
  });

  router.delete('/:id', async (req, res) => {
    const accountId = parseAccountId(req.params.id);
    if (!accountId) return res.status(400).json({ message: 'Mã tài khoản không hợp lệ.' });
    let client;
    try {
      client = await database.connect();
      await client.query('BEGIN');
      const activeAdmins = await lockActiveAdmins(client);
      if (!activeAdmins) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Đang có thao tác quản trị tài khoản khác. Vui lòng thử lại sau.' });
      }
      const target = await loadTarget(client, accountId);
      if (!target) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy tài khoản.' }); }
      if (Number(req.user.account_id) === accountId) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Không thể xóa tài khoản đang đăng nhập.' });
      }
      if (Number(target.active_session_count) > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Tài khoản đang có phiên đăng nhập còn hiệu lực. Hãy đăng xuất tài khoản đó trước khi xóa.' });
      }
      if (target.role_name === 'ADMIN' && target.status === 'Active' && activeAdmins.length <= 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Phải còn ít nhất một quản trị viên đang hoạt động.' });
      }
      if (await accountHasRelatedData(client, accountId)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Tài khoản đã có dữ liệu liên quan, hãy khóa thay vì xóa.' });
      }
      await client.query('DELETE FROM account WHERE account_id=$1', [accountId]);
      await writeAccountAudit(client, {
        actorAccountId: req.user.account_id,
        eventType: 'account_deleted',
        target,
        before: { role_name: target.role_name, status: target.status },
        after: null,
      });
      await client.query('COMMIT');
      return res.json({ message: `Đã xóa tài khoản ${target.username}.` });
    } catch (err) {
      await client?.query('ROLLBACK').catch(() => {});
      if (err.code === '55P03') {
        return res.status(409).json({ message: 'Tài khoản đang được cập nhật bởi thao tác khác. Vui lòng thử lại sau.' });
      }
      if (err.code === '57014') {
        return res.status(503).json({ message: 'Cơ sở dữ liệu đang xử lý quá lâu. Vui lòng thử lại sau.' });
      }
      if (err.code === '23503') {
        return res.status(409).json({ message: 'Tài khoản đã có dữ liệu liên quan, hãy khóa thay vì xóa.' });
      }
      logger.error({ err, requestId: req.requestId }, 'Account deletion failed');
      return res.status(500).json({ message: 'Không thể xóa tài khoản lúc này.' });
    } finally { client?.release(); }
  });

  return router;
}

export default createAccountRouter();
