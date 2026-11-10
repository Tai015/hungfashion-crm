import { Router } from 'express';
import { pool } from '../db.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const DEFAULT_RANGE_MONTHS = 12;

function encodeCursor(row, includeOlder) {
  return Buffer.from(JSON.stringify({
    occurredAt: new Date(row.occurred_at).toISOString(),
    interactionId: row.interaction_id,
    includeOlder,
  })).toString('base64url');
}

function decodeCursor(value) {
  if (typeof value !== 'string' || value.length > 1024) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object'
      || typeof decoded.interactionId !== 'string'
      || !decoded.interactionId
      || typeof decoded.occurredAt !== 'string'
      || !Number.isFinite(Date.parse(decoded.occurredAt))
      || typeof decoded.includeOlder !== 'boolean') return null;
    return {
      occurredAt: new Date(decoded.occurredAt).toISOString(),
      interactionId: decoded.interactionId,
      includeOlder: decoded.includeOlder,
    };
  } catch {
    return null;
  }
}

export function createCustomerInteractionsRouter(database = pool) {
  const router = Router({ mergeParams: true });

  // GET /api/customers/:id/interactions?limit=20&cursor=...&all=1
  router.get('/', async (req, res) => {
    const customerId = Number(req.params.id);
    if (!Number.isSafeInteger(customerId) || customerId < 1) {
      return res.status(400).json({ message: 'Mã khách hàng không hợp lệ.' });
    }

    const rawLimit = req.query.limit == null ? DEFAULT_LIMIT : Number(req.query.limit);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
      return res.status(400).json({ message: `Số dòng mỗi trang phải từ 1 đến ${MAX_LIMIT}.` });
    }

    const includeOlder = req.query.all === '1';
    if (req.query.all != null && !['0', '1'].includes(req.query.all)) {
      return res.status(400).json({ message: 'Tham số all không hợp lệ.' });
    }

    const cursor = req.query.cursor == null ? null : decodeCursor(req.query.cursor);
    if (req.query.cursor != null && !cursor) {
      return res.status(400).json({ message: 'Con trỏ phân trang không hợp lệ hoặc không khớp bộ lọc.' });
    }

    const params = [customerId];
    const conditions = ['customer_id = $1'];
    if (!includeOlder) conditions.push(`occurred_at >= NOW() - INTERVAL '${DEFAULT_RANGE_MONTHS} months'`);
    if (cursor) {
      params.push(cursor.occurredAt, cursor.interactionId);
      conditions.push(`(occurred_at, interaction_id) < ($${params.length - 1}::timestamptz, $${params.length}::text)`);
    }
    params.push(rawLimit + 1);

    try {
      const { rows } = await database.query(
        `SELECT interaction_id, customer_id, interaction_type, title, summary, occurred_at
         FROM customer_interaction_timeline
         WHERE ${conditions.join(' AND ')}
         ORDER BY occurred_at DESC, interaction_id DESC
         LIMIT $${params.length}`,
        params,
      );

      const hasMore = rows.length > rawLimit;
      const data = hasMore ? rows.slice(0, rawLimit) : rows;
      const lastRow = data.at(-1);
      return res.json({
        data,
        limit: rawLimit,
        hasMore,
        nextCursor: hasMore && lastRow ? encodeCursor(lastRow, includeOlder) : null,
        olderCursor: !includeOlder && lastRow ? encodeCursor(lastRow, true) : null,
        range: includeOlder ? 'all' : `last-${DEFAULT_RANGE_MONTHS}-months`,
      });
    } catch (error) {
      console.error('Could not load customer interaction timeline:', error.message);
      return res.status(500).json({ message: 'Không thể tải lịch sử tương tác khách hàng.' });
    }
  });

  return router;
}

export { decodeCursor, encodeCursor };
