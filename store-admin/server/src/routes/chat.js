import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { canUseChat, isChatStaff } from '../chat-access.js';
import { chatAttachmentTypes, validateChatAttachment } from '../chat-attachment-types.js';
import { cleanupTemporaryCopies, cleanupUploadedMedia, isCloudinaryRef, storeUploadedMedia, streamCloudinaryMedia } from '../media-storage.js';

const router = Router();
const chatEventSubscribers = new Set();
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chatUploadDirectory = path.resolve(serverDirectory, process.env.CHAT_UPLOAD_DIR || 'uploads/chat');
await mkdir(chatUploadDirectory, { recursive: true });
const chatMediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, chatUploadDirectory),
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${chatAttachmentTypes[file.mimetype]?.extension || ''}`),
  }),
  limits: { files: 4, fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!chatAttachmentTypes[file.mimetype]) return callback(new Error('Chỉ hỗ trợ ảnh, video MP4/WebM, PDF, TXT, CSV, DOCX hoặc XLSX.'));
    callback(null, true);
  },
});

async function removeUploadedImages(files = []) {
  await cleanupUploadedMedia(files);
}

function receiveChatMedia(req, res, next) {
  chatMediaUpload.array('media', 4)(req, res, async error => {
    if (error) {
      await removeUploadedImages(req.files || []);
      const status = error instanceof multer.MulterError
        ? (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
        : 400;
      return res.status(status).json({ message: error.message || 'Không thể nhận tệp đính kèm.' });
    }
    const files = req.files || [];
    for (const file of files) {
      let handle;
      let header = Buffer.alloc(12);
      try {
        handle = await open(file.path, 'r');
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        header = header.subarray(0, bytesRead);
      } catch {
        header = Buffer.alloc(0);
      } finally {
        await handle?.close().catch(() => {});
      }
      const validationError = validateChatAttachment(file.mimetype, file.size, header);
      if (validationError) {
        await removeUploadedImages(files);
        return res.status(validationError.status).json({ message: validationError.message });
      }
    }
    try {
      for (const file of files) await storeUploadedMedia(file, 'chat');
    } catch (uploadError) {
      await removeUploadedImages(files);
      console.error('[chat] Cloudinary upload failed:', uploadError);
      return res.status(502).json({ message: 'Không thể lưu tệp đính kèm. Vui lòng thử lại.' });
    }
    return next();
  });
}

async function insertChatAttachments(client, messageId, files) {
  const attachments = [];
  for (const file of files) {
    const { rows: [attachment] } = await client.query(
      `INSERT INTO chat_message_attachment (message_id, storage_name, original_name, mime_type, file_size)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING attachment_id, original_name, mime_type, file_size`,
      [messageId, file.storageRef || path.basename(file.filename), path.basename(file.originalname).slice(0, 255), file.mimetype, file.size],
    );
    attachments.push({
      attachment_id: attachment.attachment_id,
      url: `/api/chat/media/${attachment.attachment_id}`,
      name: attachment.original_name,
      mime_type: attachment.mime_type,
      size: Number(attachment.file_size),
    });
  }
  return attachments;
}

function logChatError(context, error) {
  console.error(`[chat] ${context}:`, error);
}

function sendChatServerError(res, context, error) {
  logChatError(context, error);
  if (!res.headersSent) res.status(500).json({ message: 'Đã xảy ra lỗi máy chủ khi xử lý chat.' });
}

function parseConversationId(value) {
  if (!/^[1-9]\d*$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

async function publishChatEvent(event) {
  if (!chatEventSubscribers.size) return;
  const payload = `event: chat\ndata: ${JSON.stringify(event)}\n\n`;
  const accountIds = [...new Set([...chatEventSubscribers].map(subscriber => subscriber.accountId))];
  let activeAccounts;
  try {
    const { rows } = await pool.query(
      `SELECT a.account_id, a.status, r.role_name, c.customer_id
       FROM account a
       JOIN role r ON r.role_id = a.role_id
       LEFT JOIN customer c ON c.account_id = a.account_id
       WHERE a.account_id = ANY($1::int[])`,
      [accountIds],
    );
    activeAccounts = new Map(rows.map(row => [Number(row.account_id), row]));
  } catch {
    return; // Fail closed if current account permissions cannot be checked.
  }
  for (const subscriber of [...chatEventSubscribers]) {
    const response = subscriber.response;
    if (response.destroyed || response.writableEnded) {
      removeChatSubscriber(subscriber);
      continue;
    }
    const account = activeAccounts.get(Number(subscriber.accountId));
    const stillValid = Date.now() < subscriber.expiresAt
      && account?.status === 'Active'
      && account.role_name === subscriber.role
      && canUseChat(account.role_name);
    if (!stillValid) {
      response.end();
      removeChatSubscriber(subscriber);
      continue;
    }
    const isForThem = isChatStaff(account.role_name)
      || Number(account.customer_id) === Number(event.customerId);
    if (!isForThem) continue;
    try { response.write(payload); } catch { removeChatSubscriber(subscriber); }
  }
}

function emitChatEvent(event) {
  publishChatEvent(event).catch(error => logChatError('publish failed', error));
}

function removeChatSubscriber(subscriber) {
  clearInterval(subscriber.heartbeat);
  const removed = chatEventSubscribers.delete(subscriber);
  if (removed && process.env.DEBUG_CHAT_SSE === 'true') {
    console.info(`[chat-sse] subscribers=${chatEventSubscribers.size}`);
  }
}

async function validateChatSubscriber(subscriber) {
  if (Date.now() >= subscriber.expiresAt) return false;
  const { rows } = await pool.query(
    `SELECT a.status, r.role_name, c.customer_id
     FROM account a
     JOIN role r ON r.role_id = a.role_id
     LEFT JOIN customer c ON c.account_id = a.account_id
     WHERE a.account_id = $1`,
    [subscriber.accountId],
  );
  if (!rows.length || rows[0].status !== 'Active'
    || rows[0].role_name !== subscriber.role
    || !canUseChat(rows[0].role_name)) return false;
  return rows[0].role_name !== 'KHACH_HANG'
    || Number(rows[0].customer_id) === Number(subscriber.customerId);
}

// SSE connection: send lightweight chat invalidation events, never message content.
router.get('/events', (req, res) => {
  if (!canUseChat(req.user?.role_name)
    || (req.user.role_name === 'KHACH_HANG' && !req.user.customer_id)
    || !Number.isFinite(req.authExpiresAt)) {
    return res.status(403).json({ message: 'Không có quyền mở kết nối chat.' });
  }
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');

  const subscriber = {
    response: res,
    accountId: req.user.account_id,
    role: req.user.role_name,
    customerId: req.user.customer_id,
    expiresAt: req.authExpiresAt,
    heartbeat: null,
    validating: false,
  };
  chatEventSubscribers.add(subscriber);
  if (process.env.DEBUG_CHAT_SSE === 'true') {
    console.info(`[chat-sse] subscribers=${chatEventSubscribers.size}`);
  }
  res.write('event: chat\ndata: {"type":"connected"}\n\n');
  subscriber.heartbeat = setInterval(async () => {
    if (subscriber.validating) return;
    subscriber.validating = true;
    if (res.destroyed || res.writableEnded) {
      removeChatSubscriber(subscriber);
      return;
    }
    try {
      if (!await validateChatSubscriber(subscriber)) {
        res.end();
        removeChatSubscriber(subscriber);
        return;
      }
    } catch {
      res.end(); // Revalidate fail-closed if the account store is unavailable.
      removeChatSubscriber(subscriber);
      return;
    } finally {
      subscriber.validating = false;
    }
    try {
      res.write(': keep-alive\n\n');
    } catch {
      res.destroy();
      removeChatSubscriber(subscriber);
    }
  }, 25000);
  res.on('close', () => removeChatSubscriber(subscriber));
});

// Image files are served only to chat staff or the customer who owns the conversation.
router.get('/media/:attachmentId', async (req, res) => {
  const attachmentId = parseConversationId(req.params.attachmentId);
  if (attachmentId === null) return res.status(400).json({ message: 'Mã ảnh không hợp lệ.' });
  try {
    const { rows: [attachment] } = await pool.query(
      `SELECT ca.storage_name, ca.original_name, ca.mime_type, c.customer_id
       FROM chat_message_attachment ca
       JOIN chat_message m ON m.message_id = ca.message_id
       JOIN conversation c ON c.conversation_id = m.conversation_id
       WHERE ca.attachment_id = $1`,
      [attachmentId],
    );
    if (!attachment) return res.status(404).json({ message: 'Không tìm thấy ảnh.' });
    const isOwner = req.user.role_name === 'KHACH_HANG'
      && Number(attachment.customer_id) === Number(req.user.customer_id);
    if (!isOwner && !isChatStaff(req.user.role_name)) return res.sendStatus(403);
    if (isCloudinaryRef(attachment.storage_name)) {
      await streamCloudinaryMedia(res, attachment.storage_name, {
        mimeType: attachment.mime_type,
        filename: attachment.original_name,
        attachment: !attachment.mime_type.startsWith('image/') && !attachment.mime_type.startsWith('video/'),
      });
      return;
    }
    const storageName = path.basename(attachment.storage_name);
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    const storagePath = path.join(chatUploadDirectory, storageName);
    if (!attachment.mime_type.startsWith('image/') && !attachment.mime_type.startsWith('video/')) {
      return res.download(storagePath, attachment.original_name, error => {
        if (error && !res.headersSent) res.status(error.statusCode === 404 ? 404 : 500).end();
      });
    }
    return res.type(attachment.mime_type).sendFile(storagePath, error => {
      if (error && !res.headersSent) res.status(error.statusCode === 404 ? 404 : 500).end();
    });
  } catch (error) {
    return sendChatServerError(res, 'serve chat image', error);
  }
});

// ── Helper: lấy danh sách tin nhắn kèm tên người gửi ─────
async function fetchMessages(conversationId, markReadForAccountId, customerId) {
  const { rows } = await pool.query(
    `SELECT m.message_id, m.conversation_id, m.sender_account_id,
            m.content, m.sent_at, m.is_read,
            a.username AS sender_username,
            COALESCE(cust.full_name, emp.full_name, a.username) AS sender_name,
            r.role_name AS sender_role,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'attachment_id', ca.attachment_id,
                'url', concat('/api/chat/media/', ca.attachment_id),
                'name', ca.original_name,
                'mime_type', ca.mime_type,
                'size', ca.file_size
              ) ORDER BY ca.attachment_id)
              FROM chat_message_attachment ca WHERE ca.message_id = m.message_id
            ), '[]'::jsonb) AS attachments
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
    const { rowCount } = await pool.query(
      `UPDATE chat_message
       SET is_read = TRUE
       WHERE conversation_id = $1
         AND sender_account_id != $2
         AND is_read = FALSE`,
      [conversationId, markReadForAccountId]
    );
    if (rowCount > 0) emitChatEvent({ type: 'read', conversationId, customerId });
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════
//  CUSTOMER routes  (chỉ cho KHACH_HANG)
// ═══════════════════════════════════════════════════════════

// GET /api/chat/my-conversation/unread-count — đếm tin CSKH chưa đọc, không tự tạo hội thoại
router.get('/my-conversation/unread-count', async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chỉ khách hàng mới sử dụng được chức năng này.' });
  }
  try {
    const { rows: [row] } = await pool.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM chat_message m
       WHERE m.conversation_id = (
         SELECT conversation_id FROM conversation
         WHERE customer_id = $1
         ORDER BY updated_at DESC LIMIT 1
       )
         AND m.sender_account_id <> $2
         AND m.is_read = FALSE`,
      [req.user.customer_id, req.user.account_id]
    );
    res.json({ unread_count: row.unread_count });
  } catch (err) {
    sendChatServerError(res, 'unread-count', err);
  }
});

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
    sendChatServerError(res, 'get customer conversation', err);
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
    const msgs = await fetchMessages(convRows[0].conversation_id, req.user.account_id, req.user.customer_id);
    res.json(msgs);
  } catch (err) {
    sendChatServerError(res, 'get customer messages', err);
  }
});

// POST /api/chat/my-conversation/messages — khách gửi tin nhắn
router.post('/my-conversation/messages', receiveChatMedia, async (req, res) => {
  const files = req.files || [];
  const reject = async (status, message) => {
    await removeUploadedImages(files);
    return res.status(status).json({ message });
  };
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return reject(403, 'Chỉ khách hàng mới sử dụng được chức năng này.');
  }
  const { content } = req.body || {};
  const text = typeof content === 'string' ? content.trim() : '';
  if ((content != null && typeof content !== 'string') || text.length > 5000 || (!text && !files.length)) {
    return reject(400, 'Tin nhắn cần có nội dung hoặc ảnh; nội dung tối đa 5000 ký tự.');
  }
  const messageContent = text || 'Đã gửi tệp đính kèm.';
  let client;
  try {
    client = await pool.connect();
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
      [conversationId, req.user.account_id, messageContent]
    );
    const attachments = await insertChatAttachments(client, rows[0].message_id, files);
    await client.query(
      `UPDATE conversation SET updated_at = NOW(), status = 'Open'
       WHERE conversation_id = $1`,
      [conversationId]
    );
    await client.query('COMMIT');
    await cleanupTemporaryCopies(files);
    emitChatEvent({ type: 'message', conversationId, customerId: req.user.customer_id, senderRole: 'KHACH_HANG' });
    res.status(201).json({
      message_id: rows[0].message_id,
      conversation_id: conversationId,
      sender_account_id: req.user.account_id,
      content: messageContent,
      sent_at: rows[0].sent_at,
      is_read: false,
      sender_role: 'KHACH_HANG',
      attachments,
    });
  } catch (err) {
    await client?.query('ROLLBACK').catch(() => {});
    await removeUploadedImages(files);
    sendChatServerError(res, 'send customer message', err);
  } finally {
    client?.release();
  }
});

// ═══════════════════════════════════════════════════════════
//  STAFF / ADMIN routes  (ADMIN, QL_KHACH_HANG)
// ═══════════════════════════════════════════════════════════

// GET /api/chat/ — nhân viên xem danh sách cuộc hội thoại
router.get('/', async (req, res) => {
  if (!isChatStaff(req.user.role_name)) {
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
    sendChatServerError(res, 'list conversations', err);
  }
});

// GET /api/chat/:id/messages — nhân viên đọc tin nhắn
router.get('/:id/messages', async (req, res) => {
  if (!isChatStaff(req.user.role_name)) {
    return res.status(403).json({ message: 'Không có quyền truy cập.' });
  }
  const conversationId = parseConversationId(req.params.id);
  if (conversationId === null) return res.status(400).json({ message: 'Mã hội thoại không hợp lệ.' });
  try {
    const { rows: conv } = await pool.query(
      `SELECT conversation_id, customer_id FROM conversation WHERE conversation_id = $1`,
      [conversationId]
    );
    if (!conv.length) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại.' });
    const msgs = await fetchMessages(conversationId, req.user.account_id, conv[0].customer_id);
    res.json(msgs);
  } catch (err) {
    sendChatServerError(res, 'get staff messages', err);
  }
});

// POST /api/chat/:id/messages — nhân viên trả lời
router.post('/:id/messages', receiveChatMedia, async (req, res) => {
  const files = req.files || [];
  const reject = async (status, message) => {
    await removeUploadedImages(files);
    return res.status(status).json({ message });
  };
  if (!isChatStaff(req.user.role_name)) {
    return reject(403, 'Không có quyền truy cập.');
  }
  const conversationId = parseConversationId(req.params.id);
  if (conversationId === null) return reject(400, 'Mã hội thoại không hợp lệ.');
  const { content } = req.body || {};
  const text = typeof content === 'string' ? content.trim() : '';
  if ((content != null && typeof content !== 'string') || text.length > 5000 || (!text && !files.length)) {
    return reject(400, 'Tin nhắn cần có nội dung hoặc ảnh; nội dung tối đa 5000 ký tự.');
  }
  const messageContent = text || 'Đã gửi tệp đính kèm.';
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows: conv } = await client.query(
      `SELECT conversation_id, customer_id, status
       FROM conversation WHERE conversation_id = $1 FOR UPDATE`,
      [conversationId]
    );
    if (!conv.length) {
      await client.query('ROLLBACK');
      return reject(404, 'Không tìm thấy cuộc hội thoại.');
    }
    if (conv[0].status === 'Closed') {
      await client.query('ROLLBACK');
      return reject(409, 'Hội thoại đã đóng. Hãy mở lại trước khi gửi tin nhắn.');
    }

    const { rows } = await client.query(
      `INSERT INTO chat_message (conversation_id, sender_account_id, content)
       VALUES ($1, $2, $3)
       RETURNING message_id, conversation_id, sender_account_id, content, sent_at, is_read`,
      [conversationId, req.user.account_id, messageContent]
    );
    const attachments = await insertChatAttachments(client, rows[0].message_id, files);
    await client.query(
      `UPDATE conversation SET updated_at = NOW() WHERE conversation_id = $1`,
      [conversationId]
    );
    await client.query('COMMIT');
    await cleanupTemporaryCopies(files);
    emitChatEvent({ type: 'message', conversationId, customerId: conv[0].customer_id, senderRole: req.user.role_name });
    res.status(201).json({ ...rows[0], sender_role: req.user.role_name, attachments });
  } catch (err) {
    await client?.query('ROLLBACK').catch(() => {});
    await removeUploadedImages(files);
    sendChatServerError(res, 'send staff message', err);
  } finally {
    client?.release();
  }
});

// PATCH /api/chat/:id — cập nhật trạng thái / phân công nhân viên
router.patch('/:id', async (req, res) => {
  if (!isChatStaff(req.user.role_name)) {
    return res.status(403).json({ message: 'Không có quyền truy cập.' });
  }
  const conversationId = parseConversationId(req.params.id);
  if (conversationId === null) return res.status(400).json({ message: 'Mã hội thoại không hợp lệ.' });
  const { status, assigned_to } = req.body || {};
  const validStatuses = ['Open', 'Resolved', 'Closed'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ message: `Trạng thái không hợp lệ. Hợp lệ: ${validStatuses.join(', ')}.` });
  }
  let assignedEmployeeId;
  if (assigned_to !== undefined) {
    if (assigned_to === null || assigned_to === '') {
      assignedEmployeeId = null;
    } else {
      assignedEmployeeId = parseConversationId(assigned_to);
      if (assignedEmployeeId === null) {
        return res.status(400).json({ message: 'Mã nhân viên được phân công không hợp lệ.' });
      }
    }
  }
  try {
    if (assignedEmployeeId) {
      const { rowCount } = await pool.query(
        'SELECT 1 FROM employee WHERE employee_id = $1',
        [assignedEmployeeId],
      );
      if (!rowCount) return res.status(400).json({ message: 'Nhân viên được phân công không tồn tại.' });
    }
    const sets = ['updated_at = NOW()'];
    const params = [];
    if (status)      { params.push(status);      sets.push(`status = $${params.length}`); }
    if (assigned_to !== undefined) { params.push(assignedEmployeeId); sets.push(`assigned_to = $${params.length}`); }
    params.push(conversationId);

    const { rows } = await pool.query(
      `UPDATE conversation SET ${sets.join(', ')} WHERE conversation_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại.' });
    emitChatEvent({
      type: 'status',
      conversationId: rows[0].conversation_id,
      customerId: rows[0].customer_id,
      status: rows[0].status,
    });
    res.json(rows[0]);
  } catch (err) {
    sendChatServerError(res, 'update conversation', err);
  }
});

export default router;
