import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ── Helper: lấy danh sách tin nhắn kèm tên người gửi ─────
async function fetchMessages(conversationId, markReadForAccountId) {
  const { rows } = await pool.query(
    `SELECT m.message_id, m.conversation_id, m.sender_account_id,
            m.content, m.sent_at, m.is_read,
            a.username AS sender_username,
            COALESCE(cust.full_name, emp.full_name, a.username) AS sender_name,
            r.role_name AS sender_role
     FROM chat_message m
     JOIN account a   ON a.account_id = m.sender_account_id
     JOIN role r      ON r.role_id    = a.role_id
     LEFT JOIN customer cust ON cust.account_id = a.account_id
     LEFT JOIN employee emp  ON emp.account_id  = a.account_id
     WHERE m.conversation_id = $1
     ORDER BY m.sent_at ASC`,
    [conversationId]
  );
  if (markReadForAccountId) {
    await pool.query(
      `UPDATE chat_message
       SET is_read = TRUE
       WHERE conversation_id = $1
         AND sender_account_id != $2
         AND is_read = FALSE`,
      [conversationId, markReadForAccountId]
    );
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════
//  CUSTOMER routes  (chỉ cho KHACH_HANG)
// ═══════════════════════════════════════════════════════════

// GET /api/chat/my-conversation — khách xem cuộc hội thoại của mình (tạo nếu chưa có)
router.get('/my-conversation', async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chỉ khách hàng mới sử dụng được chức năng này.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT c.*, e.full_name AS assigned_to_name
       FROM conversation c
       LEFT JOIN employee e ON e.employee_id = c.assigned_to
       WHERE c.customer_id = $1
       ORDER BY c.updated_at DESC LIMIT 1`,
      [req.user.customer_id]
    );
    if (rows.length) return res.json(rows[0]);

    // Tự tạo cuộc hội thoại nếu chưa có
    const { rows: newRows } = await pool.query(
      `INSERT INTO conversation (customer_id) VALUES ($1) RETURNING *`,
      [req.user.customer_id]
    );
    res.status(201).json({ ...newRows[0], assigned_to_name: null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/my-conversation/messages — lấy tin nhắn + đánh dấu đã đọc
router.get('/my-conversation/messages', async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chỉ khách hàng mới sử dụng được chức năng này.' });
  }
  try {
    const { rows: convRows } = await pool.query(
      `SELECT conversation_id FROM conversation
       WHERE customer_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [req.user.customer_id]
    );
    if (!convRows.length) return res.json([]);
    const msgs = await fetchMessages(convRows[0].conversation_id, req.user.account_id);
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/my-conversation/messages — khách gửi tin nhắn
router.post('/my-conversation/messages', async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chỉ khách hàng mới sử dụng được chức năng này.' });
  }
  const { content } = req.body || {};
  if (!content || typeof content !== 'string' || !content.trim() || content.trim().length > 5000) {
    return res.status(400).json({ message: 'Nội dung tin nhắn từ 1–5000 ký tự.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Tìm hoặc tạo conversation
    let { rows: convRows } = await client.query(
      `SELECT conversation_id FROM conversation
       WHERE customer_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [req.user.customer_id]
    );
    let conversationId;
    if (convRows.length) {
      conversationId = convRows[0].conversation_id;
    } else {
      const { rows } = await client.query(
        `INSERT INTO conversation (customer_id) VALUES ($1) RETURNING conversation_id`,
        [req.user.customer_id]
      );
      conversationId = rows[0].conversation_id;
    }

    const { rows } = await client.query(
      `INSERT INTO chat_message (conversation_id, sender_account_id, content)
       VALUES ($1, $2, $3) RETURNING message_id, sent_at`,
      [conversationId, req.user.account_id, content.trim()]
    );
    await client.query(
      `UPDATE conversation SET updated_at = NOW(), status = 'Open'
       WHERE conversation_id = $1`,
      [conversationId]
    );
    await client.query('COMMIT');
    res.status(201).json({
      message_id: rows[0].message_id,
      conversation_id: conversationId,
      sender_account_id: req.user.account_id,
      content: content.trim(),
      sent_at: rows[0].sent_at,
      is_read: false,
      sender_role: 'KHACH_HANG',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
//  STAFF / ADMIN routes  (ADMIN, QL_KHACH_HANG)
// ═══════════════════════════════════════════════════════════

// GET /api/chat/ — nhân viên xem danh sách cuộc hội thoại
router.get('/', async (req, res) => {
  if (req.user.role_name === 'KHACH_HANG') {
    return res.status(403).json({ message: 'Không có quyền truy cập.' });
  }
  try {
    const { status } = req.query;
    const params = [req.user.account_id];
    const conditions = [];
    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT c.*,
              cust.full_name AS customer_name,
              cust.email     AS customer_email,
              cust.phone     AS customer_phone,
              e.full_name    AS assigned_to_name,
              (SELECT COUNT(*)::int
               FROM chat_message m
               WHERE m.conversation_id = c.conversation_id) AS message_count,
              (SELECT COUNT(*)::int
               FROM chat_message m
               WHERE m.conversation_id = c.conversation_id
                 AND m.sender_account_id != $1
                 AND m.is_read = FALSE)                       AS unread_count,
              (SELECT m2.content
               FROM chat_message m2
               WHERE m2.conversation_id = c.conversation_id
               ORDER BY m2.sent_at DESC LIMIT 1)              AS last_message
       FROM conversation c
       JOIN customer cust ON cust.customer_id = c.customer_id
       LEFT JOIN employee e ON e.employee_id = c.assigned_to
       ${where}
       ORDER BY c.updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/:id/messages — nhân viên đọc tin nhắn
router.get('/:id/messages', async (req, res) => {
  if (req.user.role_name === 'KHACH_HANG') {
    return res.status(403).json({ message: 'Không có quyền truy cập.' });
  }
  try {
    const { rows: conv } = await pool.query(
      `SELECT conversation_id FROM conversation WHERE conversation_id = $1`,
      [req.params.id]
    );
    if (!conv.length) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại.' });
    const msgs = await fetchMessages(Number(req.params.id), req.user.account_id);
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/:id/messages — nhân viên trả lời
router.post('/:id/messages', async (req, res) => {
  if (req.user.role_name === 'KHACH_HANG') {
    return res.status(403).json({ message: 'Không có quyền truy cập.' });
  }
  const { content } = req.body || {};
  if (!content || typeof content !== 'string' || !content.trim() || content.trim().length > 5000) {
    return res.status(400).json({ message: 'Nội dung tin nhắn từ 1–5000 ký tự.' });
  }
  try {
    const { rows: conv } = await pool.query(
      `SELECT conversation_id FROM conversation WHERE conversation_id = $1`,
      [req.params.id]
    );
    if (!conv.length) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại.' });

    const { rows } = await pool.query(
      `INSERT INTO chat_message (conversation_id, sender_account_id, content)
       VALUES ($1, $2, $3)
       RETURNING message_id, conversation_id, sender_account_id, content, sent_at, is_read`,
      [req.params.id, req.user.account_id, content.trim()]
    );
    await pool.query(
      `UPDATE conversation SET updated_at = NOW() WHERE conversation_id = $1`,
      [req.params.id]
    );
    res.status(201).json({ ...rows[0], sender_role: req.user.role_name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/chat/:id — cập nhật trạng thái / phân công nhân viên
router.patch('/:id', async (req, res) => {
  if (req.user.role_name === 'KHACH_HANG') {
    return res.status(403).json({ message: 'Không có quyền truy cập.' });
  }
  const { status, assigned_to } = req.body || {};
  const validStatuses = ['Open', 'Resolved', 'Closed'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ message: `Trạng thái không hợp lệ. Hợp lệ: ${validStatuses.join(', ')}.` });
  }
  try {
    const sets = ['updated_at = NOW()'];
    const params = [];
    if (status)      { params.push(status);      sets.push(`status = $${params.length}`); }
    if (assigned_to !== undefined) { params.push(assigned_to || null); sets.push(`assigned_to = $${params.length}`); }
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE conversation SET ${sets.join(', ')} WHERE conversation_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
