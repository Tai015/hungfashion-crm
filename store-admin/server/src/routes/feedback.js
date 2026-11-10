import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { cleanupTemporaryCopies, cleanupUploadedMedia, isCloudinaryRef, storeUploadedMedia, streamCloudinaryMedia } from '../media-storage.js';

const router = Router();
const uploadDirectory = path.resolve(process.env.FEEDBACK_UPLOAD_DIR
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/feedback'));

function feedbackDateRange(req, res) {
  const { from, to } = req.query;
  if (from === undefined && to === undefined) return { from: null, to: null };
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const days = validDate(from) && validDate(to)
    ? (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1
    : 0;
  if (days < 1 || days > 3660) {
    res.status(400).json({ message: 'Khoảng ngày không hợp lệ; cần from và to theo định dạng YYYY-MM-DD, tối đa 10 năm.' });
    return null;
  }
  return { from, to };
}
await mkdir(uploadDirectory, { recursive: true });
const allowedMimeTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
]);
const extensionByMimeType = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
};
const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${extensionByMimeType[file.mimetype] || ''}`),
  }),
  limits: { files: 4, fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new Error('Chỉ hỗ trợ ảnh JPG, PNG, WebP, GIF hoặc video MP4, WebM, MOV.'));
    callback(null, true);
  },
});

async function removeUploadedFiles(files = []) {
  await cleanupUploadedMedia(files);
}

function mediaSelect() {
  return `COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'attachment_id', fa.attachment_id, 'url', concat('/api/feedbacks/media/', fa.attachment_id), 'type', fa.media_type,
    'mime_type', fa.mime_type, 'name', fa.original_name, 'size', fa.file_size
  ) ORDER BY fa.attachment_id) FROM feedback_attachment fa WHERE fa.feedback_id = f.feedback_id), '[]'::jsonb) AS attachments`;
}

// GET /api/feedbacks/mine – khách hàng chỉ xem phản hồi của chính mình
router.get('/mine', async (req, res) => {
  if (!req.user.customer_id) {
    return res.status(403).json({ message: 'Tài khoản chưa liên kết hồ sơ khách hàng.' });
  }
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const offset = (page - 1) * limit;
    const [feedbacks, count] = await Promise.all([
      pool.query(
        `SELECT f.feedback_id, f.feedback_type, f.rating, f.content,
                f.reply, f.status, f.created_at, f.replied_at,
                p.product_name, o.order_id, ${mediaSelect()}
         FROM feedback f
         LEFT JOIN product p ON p.product_id = f.product_id
         LEFT JOIN "order" o ON o.order_id = f.order_id
         WHERE f.customer_id = $1
         ORDER BY f.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.customer_id, limit, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM feedback WHERE customer_id = $1', [req.user.customer_id]),
    ]);
    return res.json({ data: feedbacks.rows, total: count.rows[0].total, page, limit });
  } catch (err) {
    return res.status(500).json({ message: 'Không thể tải lịch sử phản hồi.' });
  }
});

// GET /api/feedbacks – danh sách phản hồi
router.get('/', async (req, res) => {
  try {
    const { status, type, product_id, search } = req.query;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (status === 'Pending') {
      conditions.push(`f.status IN ('New', 'Processing')`);
    } else if (status && ['New', 'Processing', 'Resolved', 'Rejected'].includes(status)) {
      params.push(status);
      conditions.push(`f.status = $${params.length}`);
    } else if (status) {
      return res.status(400).json({ message: 'Trạng thái phản hồi không hợp lệ.' });
    }
    if (type) {
      params.push(type);
      conditions.push(`f.feedback_type = $${params.length}`);
    }
    if (product_id) {
      params.push(product_id);
      conditions.push(`f.product_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.full_name ILIKE $${params.length} OR f.content ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT f.feedback_id, f.feedback_type, f.rating, f.content,
              f.reply, f.status, f.created_at, f.replied_at,
              c.full_name AS customer_name, c.phone AS customer_phone,
              p.product_name, ${mediaSelect()},
              e.full_name AS replied_by
       FROM feedback f
       LEFT JOIN customer c  ON c.customer_id = f.customer_id
       LEFT JOIN product p   ON p.product_id = f.product_id
       LEFT JOIN employee e  ON e.employee_id = f.employee_id
       ${where}
       ORDER BY f.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM feedback f
       LEFT JOIN customer c ON c.customer_id = f.customer_id
       ${where}`,
      params.slice(0, -2)
    );

    res.json({ data: rows, total: countRows[0].total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// GET /api/feedbacks/report – dữ liệu đầy đủ phục vụ xuất báo cáo CSV.
router.get('/report', async (req, res) => {
  if (!['ADMIN', 'QL_KHACH_HANG'].includes(req.user.role_name)) {
    return res.status(403).json({ message: 'Bạn không có quyền xem mục này.' });
  }
  const range = feedbackDateRange(req, res);
  if (!range) return;
  try {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM feedback f
       WHERE ($1::date IS NULL OR (
         f.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
         AND f.created_at < (($2::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
       ))`,
      [range.from, range.to],
    );
    const total = countRows[0].total;
    if (total > 10000) {
      return res.status(413).json({ message: 'Khoảng thời gian có hơn 10.000 phản hồi. Vui lòng thu hẹp khoảng ngày để xuất CSV.' });
    }
    const { rows } = await pool.query(
      `SELECT f.feedback_id, f.feedback_type, f.rating, f.content, f.status, f.created_at,
              c.full_name AS customer_name, p.product_name
       FROM feedback f
       LEFT JOIN customer c ON c.customer_id = f.customer_id
       LEFT JOIN product p ON p.product_id = f.product_id
       WHERE ($1::date IS NULL OR (
         f.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
         AND f.created_at < (($2::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
       ))
       ORDER BY f.created_at DESC, f.feedback_id DESC`,
      [range.from, range.to],
    );
    return res.json({ data: rows, total, limit: 10000 });
  } catch (err) {
    return res.status(500).json({ message: 'Không thể tải toàn bộ dữ liệu phản hồi.' });
  }
});

// GET /api/feedbacks/stats – thống kê theo trạng thái đang dùng trên giao diện
router.get('/stats', async (req, res) => {
  const range = feedbackDateRange(req, res);
  if (!range) return;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status IN ('New', 'Processing'))::int AS pending,
              COUNT(*) FILTER (WHERE status = 'Resolved')::int AS resolved,
              COUNT(*) FILTER (WHERE status = 'Rejected')::int AS rejected
       FROM feedback
       WHERE ($1::date IS NULL OR (created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND created_at < (($2::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')))`,
      [range.from, range.to],
    );
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/feedbacks/stats/rating – đặt trước route động /:id
router.get('/stats/rating', async (req, res) => {
  const range = feedbackDateRange(req, res);
  if (!range) return;
  try {
    const { rows } = await pool.query(
      `SELECT rating, COUNT(*)::int AS count
       FROM feedback WHERE rating IS NOT NULL
         AND ($1::date IS NULL OR (created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND created_at < (($2::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')))
       GROUP BY rating ORDER BY rating DESC`,
      [range.from, range.to],
    );
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const average = rows.reduce((sum, row) => sum + row.rating * row.count, 0) / (total || 1);
    res.json({ distribution: rows, average: Number(average.toFixed(2)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET media chỉ cho chủ phản hồi và nhân viên có quyền xem feedback.
router.get('/media/:attachmentId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT fa.media_url, fa.mime_type, f.customer_id
       FROM feedback_attachment fa JOIN feedback f ON f.feedback_id = fa.feedback_id
       WHERE fa.attachment_id = $1`,
      [req.params.attachmentId]
    );
    const attachment = rows[0];
    if (!attachment) return res.status(404).json({ message: 'Không tìm thấy tệp đính kèm.' });
    const isCustomerOwner = req.user.role_name === 'KHACH_HANG'
      && Number(attachment.customer_id) === Number(req.user.customer_id);
    const canManageFeedback = ['ADMIN', 'QL_KHACH_HANG'].includes(req.user.role_name);
    if (!isCustomerOwner && !canManageFeedback) return res.sendStatus(403);
    if (isCloudinaryRef(attachment.media_url)) {
      await streamCloudinaryMedia(res, attachment.media_url, {
        mimeType: attachment.mime_type,
        filename: attachment.original_name,
        attachment: false,
      });
      return;
    }
    const safeFilename = path.basename(attachment.media_url);
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.type(attachment.mime_type).sendFile(path.join(uploadDirectory, safeFilename), error => {
      if (error && !res.headersSent) res.status(error.statusCode === 404 ? 404 : 500).end();
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/feedbacks/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, ${mediaSelect()}, c.full_name AS customer_name, p.product_name,
              o.order_id, e.full_name AS replied_by
       FROM feedback f
       LEFT JOIN customer c ON c.customer_id = f.customer_id
       LEFT JOIN product p  ON p.product_id = f.product_id
       LEFT JOIN "order" o  ON o.order_id = f.order_id
       LEFT JOIN employee e ON e.employee_id = f.employee_id
       WHERE f.feedback_id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy phản hồi' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/feedbacks – khách hàng gửi phản hồi
router.post('/', (req, res, next) => {
  uploadMedia.array('media', 4)(req, res, error => {
    if (!error) return next();
    removeUploadedFiles(req.files || []);
    const status = error instanceof multer.MulterError
      ? (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      : 400;
    return res.status(status).json({ message: error.message || 'Không thể nhận tệp đính kèm.' });
  });
}, async (req, res) => {
  const files = req.files || [];
  const reject = async (status, message) => {
    await removeUploadedFiles(files);
    return res.status(status).json({ message });
  };
  try {
    const { product_id, order_id = null, feedback_type = 'Product', rating, content } = req.body || {};
    if (!req.user.customer_id) return reject(403, 'Tài khoản chưa liên kết hồ sơ khách hàng.');
    if (feedback_type !== 'Product' && feedback_type !== 'Service' && feedback_type !== 'Suggestion') {
      return reject(400, 'Loại phản hồi không hợp lệ.');
    }
    if (feedback_type === 'Product' && (!Number.isInteger(Number(product_id)) || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5)) {
      return reject(400, 'Phản hồi sản phẩm cần chọn sản phẩm và số sao từ 1 đến 5.');
    }
    if (product_id != null && (!Number.isInteger(Number(product_id)) || Number(product_id) < 1)
      || order_id != null && (!Number.isInteger(Number(order_id)) || Number(order_id) < 1)) {
      return reject(400, 'Sản phẩm hoặc đơn hàng không hợp lệ.');
    }
    if (typeof content !== 'string' || !content.trim() || content.trim().length > 5000) {
      return reject(400, 'Nội dung phản hồi là bắt buộc và tối đa 5000 ký tự.');
    }
    if (order_id != null) {
      if (feedback_type === 'Product') {
        const { rows: [order] } = await pool.query(
          `SELECT o.order_status,
                  EXISTS (
                    SELECT 1 FROM order_detail od
                    JOIN product_variant pv ON pv.variant_id=od.variant_id
                    WHERE od.order_id=o.order_id AND pv.product_id=$3
                  ) AS contains_product
           FROM "order" o WHERE o.order_id=$1 AND o.customer_id=$2`,
          [order_id, req.user.customer_id, product_id],
        );
        if (!order) return reject(404, 'Không tìm thấy đơn hàng của tài khoản.');
        if (order.order_status !== 'Delivered') {
          return reject(409, 'Chỉ có thể đánh giá sản phẩm trong đơn hàng đã giao.');
        }
        if (!order.contains_product) {
          return reject(400, 'Sản phẩm không thuộc đơn hàng đã chọn.');
        }
      } else {
        const { rowCount } = await pool.query(
          `SELECT 1 FROM "order" WHERE order_id=$1 AND customer_id=$2`,
          [order_id, req.user.customer_id],
        );
        if (!rowCount) return reject(404, 'Không tìm thấy đơn hàng của tài khoản.');
      }
    }
    try {
      for (const file of files) await storeUploadedMedia(file, 'feedback');
    } catch (uploadError) {
      await removeUploadedFiles(files);
      console.error('[feedback] Cloudinary upload failed:', uploadError);
      return res.status(502).json({ message: 'Không thể lưu tệp phản hồi. Vui lòng thử lại.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO feedback (customer_id, product_id, order_id, feedback_type, rating, content)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.customer_id, product_id || null, order_id, feedback_type, rating || null, content.trim()]
      );
      const feedback = rows[0];
      for (const file of files) {
        const mediaType = file.mimetype.startsWith('image/') ? 'image' : 'video';
        const { rows: [attachment] } = await client.query(
          `INSERT INTO feedback_attachment (feedback_id, media_url, media_type, mime_type, original_name, file_size)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING attachment_id`,
          [feedback.feedback_id, file.storageRef || path.basename(file.path), mediaType, file.mimetype, path.basename(file.originalname), file.size]
        );
        file.attachmentId = attachment.attachment_id;
      }
      await client.query('COMMIT');
      await cleanupTemporaryCopies(files);
      feedback.attachments = files.map(file => ({
        attachment_id: file.attachmentId,
        url: `/api/feedbacks/media/${file.attachmentId}`,
        type: file.mimetype.startsWith('image/') ? 'image' : 'video',
        mime_type: file.mimetype,
        name: path.basename(file.originalname),
        size: file.size,
      }));
      res.status(201).json(feedback);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      await removeUploadedFiles(files);
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    await removeUploadedFiles(files);
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/feedbacks/:id/reply – nhân viên phản hồi
router.patch('/:id/reply', async (req, res) => {
  try {
    const { reply } = req.body || {};
    if (typeof reply !== 'string' || !reply.trim() || reply.trim().length > 5000) {
      return res.status(400).json({ message: 'Nội dung trả lời là bắt buộc và tối đa 5000 ký tự.' });
    }
    const { rows } = await pool.query(
      `UPDATE feedback
       SET reply=$1, employee_id=$2, status='Resolved', replied_at=NOW()
       WHERE feedback_id=$3 RETURNING *`,
      [reply.trim(), req.user.employee_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy phản hồi' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/feedbacks/:id/status – cập nhật trạng thái
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['New', 'Processing', 'Resolved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái phản hồi không hợp lệ.' });
    }
    const { rows } = await pool.query(
      `UPDATE feedback SET status=$1 WHERE feedback_id=$2 RETURNING feedback_id, status`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy phản hồi' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
