import { Router } from 'express';
import { pool } from '../db.js';
import { LOW_STOCK_THRESHOLD } from '../domain/types.js';

const router = Router();

function fail(res, error, label, message) {
  console.error(`[reports/${label}]`, error);
  return res.status(500).json({ message });
}

function clampInt(value, { fallback, min = 1, max }) {
  if (value === undefined) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function isDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function rangeDays(from, to) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
}

function optionalReportRange(req, res) {
  const { from, to } = req.query;
  if (from === undefined && to === undefined) return { from: null, to: null };
  if (!isDateOnly(from) || !isDateOnly(to) || rangeDays(from, to) < 1 || rangeDays(from, to) > 3660) {
    res.status(400).json({ message: 'Khoảng ngày không hợp lệ; cần from và to theo định dạng YYYY-MM-DD, tối đa 10 năm.' });
    return null;
  }
  return { from, to };
}

// GET /api/reports/summary?days=7|30|365 – số liệu cho dashboard bán hàng.
// Chỉ đơn có payment.status = 'Paid' được tính vào doanh thu, số đơn và chuyển đổi.
router.get('/summary', async (req, res) => {
  const days = req.query.days === undefined ? 30 : Number(req.query.days);
  if (![7, 30, 365].includes(days)) {
    return res.status(400).json({ message: 'days chỉ nhận 7, 30 hoặc 365.' });
  }
  try {
    const { rows: [row] } = await pool.query(
      `WITH win AS (
         SELECT NOW() - make_interval(days => $1::int) AS current_start,
                NOW() - make_interval(days => $1::int * 2) AS previous_start
       ), order_totals AS (
         SELECT
           COALESCE(SUM(o.total_amount) FILTER (WHERE o.ordered_at >= w.current_start), 0)::float AS revenue,
           COUNT(*) FILTER (WHERE o.ordered_at >= w.current_start)::int AS orders,
           COALESCE(SUM(o.total_amount) FILTER (
             WHERE o.ordered_at >= w.previous_start AND o.ordered_at < w.current_start
           ), 0)::float AS previous_revenue
         FROM "order" o
         JOIN payment p ON p.order_id = o.order_id AND p.status = 'Paid'
         CROSS JOIN win w
         WHERE o.order_status NOT IN ('Cancelled', 'Refunded')
           AND o.ordered_at >= w.previous_start
       ), active_current AS (
         SELECT DISTINCT ue.user_id
         FROM user_events ue CROSS JOIN win w
         WHERE ue.user_id IS NOT NULL AND ue.occurred_at >= w.current_start
       ), active_previous AS (
         SELECT DISTINCT ue.user_id
         FROM user_events ue CROSS JOIN win w
         WHERE ue.user_id IS NOT NULL
           AND ue.occurred_at >= w.previous_start AND ue.occurred_at < w.current_start
       ), buyers_current AS (
         SELECT DISTINCT c.account_id::text AS user_id
         FROM "order" o
         JOIN payment p ON p.order_id = o.order_id AND p.status = 'Paid'
         JOIN customer c ON c.customer_id = o.customer_id CROSS JOIN win w
         WHERE o.order_status NOT IN ('Cancelled', 'Refunded') AND o.ordered_at >= w.current_start
       ), buyers_previous AS (
         SELECT DISTINCT c.account_id::text AS user_id
         FROM "order" o
         JOIN payment p ON p.order_id = o.order_id AND p.status = 'Paid'
         JOIN customer c ON c.customer_id = o.customer_id CROSS JOIN win w
         WHERE o.order_status NOT IN ('Cancelled', 'Refunded')
           AND o.ordered_at >= w.previous_start AND o.ordered_at < w.current_start
       )
       SELECT ot.revenue, ot.orders, ot.previous_revenue,
              (SELECT COUNT(*)::int FROM active_current) AS active_users,
              (SELECT COUNT(*)::int FROM active_current a JOIN buyers_current b USING (user_id)) AS converted_users,
              (SELECT COUNT(*)::int FROM active_previous) AS previous_active_users,
              (SELECT COUNT(*)::int FROM active_previous a JOIN buyers_previous b USING (user_id)) AS previous_converted_users
       FROM order_totals ot`,
      [days],
    );
    const conversion = (converted, active) => active > 0
      ? Number(((converted / active) * 100).toFixed(1))
      : null;
    const conversionPercent = conversion(row.converted_users, row.active_users);
    const previousConversionPercent = conversion(row.previous_converted_users, row.previous_active_users);
    const previousRevenue = Number(row.previous_revenue);

    res.json({
      days,
      revenue: Number(row.revenue),
      orders: row.orders,
      activeUsers: row.active_users,
      growthPercent: previousRevenue > 0
        ? Number((((Number(row.revenue) - previousRevenue) / previousRevenue) * 100).toFixed(1))
        : null,
      conversionPercent,
      conversionChange: conversionPercent !== null && previousConversionPercent !== null
        ? Number((conversionPercent - previousConversionPercent).toFixed(1))
        : null,
    });
  } catch (err) {
    console.error('[reports/summary]', err);
    res.status(500).json({ message: 'Không thể tải số liệu tổng hợp.' });
  }
});

// GET /api/reports/dashboard – tổng quan CRM dashboard
router.get('/dashboard', async (req, res) => {
  const dateRange = optionalReportRange(req, res);
  if (!dateRange) return;
  try {
    const [kpiRows, tierRows, genderRows, ratingRows, recentFeedbacks, activeSurveys] =
      await Promise.all([
        // KPI cards
        pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM customer)                          AS total_customers,
            (SELECT COUNT(*)::int FROM customer
             WHERE registered_at >= NOW() - INTERVAL '30 days')          AS new_customers_30d,
            (SELECT COUNT(*)::int FROM feedback WHERE status IN ('New', 'Processing')) AS pending_feedbacks,
            (SELECT COUNT(*)::int FROM survey WHERE status = 'Active')   AS active_surveys,
            (SELECT ROUND(AVG(rating)::numeric, 2)
             FROM feedback WHERE rating IS NOT NULL)                      AS avg_rating
        `),

        // Khách theo hạng
        pool.query(`
          SELECT customer_tier, COUNT(*)::int AS count
          FROM customer
          WHERE ($1::date IS NULL OR (registered_at >= $1::date AND registered_at < $2::date + INTERVAL '1 day'))
          GROUP BY customer_tier ORDER BY count DESC
        `, [dateRange.from, dateRange.to]),

        // Khách theo giới tính
        pool.query(`
          SELECT gender, COUNT(*)::int AS count
          FROM customer
          WHERE ($1::date IS NULL OR (registered_at >= $1::date AND registered_at < $2::date + INTERVAL '1 day'))
          GROUP BY gender
        `, [dateRange.from, dateRange.to]),

        // Phân bố đánh giá
        pool.query(`
          SELECT rating, COUNT(*)::int AS count
          FROM feedback WHERE rating IS NOT NULL
            AND ($1::date IS NULL OR (created_at >= $1::date AND created_at < $2::date + INTERVAL '1 day'))
          GROUP BY rating ORDER BY rating DESC
        `, [dateRange.from, dateRange.to]),

        // 5 phản hồi mới nhất
        pool.query(`
          SELECT f.feedback_id, f.feedback_type, f.rating, f.content,
                 f.status, f.created_at, c.full_name AS customer_name,
                 p.product_name
          FROM feedback f
          LEFT JOIN customer c ON c.customer_id = f.customer_id
          LEFT JOIN product p  ON p.product_id = f.product_id
          WHERE ($1::date IS NULL OR (f.created_at >= $1::date AND f.created_at < $2::date + INTERVAL '1 day'))
          ORDER BY f.created_at DESC LIMIT 5
        `, [dateRange.from, dateRange.to]),

        // Khảo sát đang chạy
        pool.query(`
          SELECT s.survey_id, s.title, s.end_date,
                 COUNT(sr.response_id)::int AS response_count
          FROM survey s
          LEFT JOIN survey_response sr ON sr.survey_id = s.survey_id
            AND ($1::date IS NULL OR (sr.submitted_at >= $1::date AND sr.submitted_at < $2::date + INTERVAL '1 day'))
          WHERE s.status = 'Active'
          GROUP BY s.survey_id
          ORDER BY s.created_at DESC LIMIT 5
        `, [dateRange.from, dateRange.to]),
      ]);

    res.json({
      kpi:             kpiRows.rows[0],
      customersByTier: tierRows.rows,
      customersByGender: genderRows.rows,
      ratingDistribution: ratingRows.rows,
      recentFeedbacks: recentFeedbacks.rows,
      activeSurveys:   activeSurveys.rows,
    });
  } catch (err) {
    return fail(res, err, 'dashboard', 'Không thể tải tổng quan báo cáo.');
  }
});

// GET /api/reports/revenue – doanh thu theo khoảng thời gian
router.get('/revenue', async (req, res) => {
  const { from, to } = req.query;
  const groupBy = req.query.group_by ?? 'day';
  if ((from !== undefined && !isDateOnly(from)) || (to !== undefined && !isDateOnly(to))) {
    return res.status(400).json({ message: 'Ngày bắt đầu hoặc kết thúc không hợp lệ (định dạng YYYY-MM-DD).' });
  }
  if (!['day', 'week', 'month'].includes(groupBy)) {
    return res.status(400).json({ message: 'group_by chỉ nhận day, week hoặc month.' });
  }
  if ((from === undefined) !== (to === undefined)) {
    return res.status(400).json({ message: 'Cần truyền cả from và to để lọc theo thời gian.' });
  }
  const fromDate = from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to ?? new Date().toISOString().slice(0, 10);
  const days = rangeDays(fromDate, toDate);
  if (days < 1 || days > 3660 || (groupBy === 'day' && days > 366)) {
    return res.status(400).json({ message: 'Khoảng ngày không hợp lệ. Gom theo ngày tối đa 366 ngày; khoảng dài hơn nên dùng tuần hoặc tháng.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT TO_CHAR(DATE_TRUNC($1, o.ordered_at), 'YYYY-MM-DD') AS period,
              COUNT(*)::int                        AS order_count,
              SUM(o.total_amount)::numeric         AS revenue
       FROM "order" o
       JOIN payment p ON p.order_id = o.order_id AND p.status = 'Paid'
       WHERE o.ordered_at >= $2::date
         AND o.ordered_at < ($3::date + INTERVAL '1 day')
         AND o.order_status NOT IN ('Cancelled', 'Refunded')
       GROUP BY period
       ORDER BY period`,
      [groupBy, fromDate, toDate]
    );
    res.json(rows);
  } catch (err) {
    return fail(res, err, 'revenue', 'Không thể tải báo cáo doanh thu.');
  }
});

// GET /api/reports/top-products – sản phẩm bán chạy
router.get('/top-products', async (req, res) => {
  const limit = clampInt(req.query.limit, { fallback: 10, min: 1, max: 100 });
  if (limit === null) return res.status(400).json({ message: 'limit phải là số nguyên từ 1 đến 100.' });
  const { from, to } = req.query;
  if ((from !== undefined && !isDateOnly(from)) || (to !== undefined && !isDateOnly(to))) {
    return res.status(400).json({ message: 'Ngày bắt đầu hoặc kết thúc không hợp lệ (định dạng YYYY-MM-DD).' });
  }
  if ((from === undefined) !== (to === undefined)) {
    return res.status(400).json({ message: 'Cần truyền cả from và to để lọc theo thời gian.' });
  }
  if (from !== undefined && (rangeDays(from, to) < 1 || rangeDays(from, to) > 3660)) {
    return res.status(400).json({ message: 'Khoảng ngày lọc sản phẩm phải từ 1 đến 3660 ngày.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT p.product_id, p.product_name, c.category_name,
              SUM(od.quantity)::int    AS total_sold,
              SUM(od.subtotal)::numeric AS total_revenue
       FROM order_detail od
       JOIN product_variant pv ON pv.variant_id = od.variant_id
       JOIN product p          ON p.product_id = pv.product_id
       JOIN category c         ON c.category_id = p.category_id
       JOIN "order" o          ON o.order_id = od.order_id
       JOIN payment pay       ON pay.order_id = o.order_id AND pay.status = 'Paid'
       WHERE o.order_status NOT IN ('Cancelled', 'Refunded')
         AND ($2::date IS NULL OR (o.ordered_at >= $2::date AND o.ordered_at < ($3::date + INTERVAL '1 day')))
       GROUP BY p.product_id, p.product_name, c.category_name
       ORDER BY total_sold DESC
       LIMIT $1`,
      [limit, from ?? null, to ?? null]
    );
    res.json(rows);
  } catch (err) {
    return fail(res, err, 'top-products', 'Không thể tải báo cáo sản phẩm.');
  }
});

// GET /api/reports/attention – số lượng việc cần xử lý, không trả dữ liệu cá nhân.
router.get('/attention', async (req, res) => {
  try {
    const { rows: [row] } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int
          FROM payment p JOIN "order" o ON o.order_id = p.order_id
          WHERE p.status = 'Pending' AND o.order_status NOT IN ('Cancelled', 'Refunded')) AS pending_payment_orders,
         (SELECT COUNT(*)::int
          FROM product_variant pv JOIN product p ON p.product_id = pv.product_id
          WHERE p.is_active = TRUE AND pv.quantity <= $1) AS low_stock_variants`,
      [LOW_STOCK_THRESHOLD],
    );
    res.json({
      pendingPaymentOrders: ['ADMIN', 'QL_BAN_HANG'].includes(req.user.role_name) ? row.pending_payment_orders : null,
      lowStockVariants: ['ADMIN', 'QL_KHO'].includes(req.user.role_name) ? row.low_stock_variants : null,
    });
  } catch (err) {
    return fail(res, err, 'attention', 'Không thể tải danh sách việc cần xử lý.');
  }
});

// GET /api/reports/customer-ages – nhóm tuổi theo customer.date_of_birth.
router.get('/customer-ages', async (req, res) => {
  if (!['ADMIN', 'QL_KHACH_HANG'].includes(req.user.role_name)) {
    return res.status(403).json({ message: 'Bạn không có quyền xem mục này.' });
  }
  const dateRange = optionalReportRange(req, res);
  if (!dateRange) return;
  try {
    const { rows } = await pool.query(
      `WITH ages AS (
         SELECT CASE
           WHEN date_of_birth IS NULL THEN 'Chưa có thông tin'
           WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth)) < 18 THEN '<18'
           WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth)) < 25 THEN '18-24'
           WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth)) < 35 THEN '25-34'
           WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth)) < 45 THEN '35-44'
           ELSE '45+'
         END AS age_band
         FROM customer
         WHERE ($1::date IS NULL OR (registered_at >= $1::date AND registered_at < $2::date + INTERVAL '1 day'))
       ), counts AS (
         SELECT age_band, COUNT(*)::int AS customer_count FROM ages GROUP BY age_band
       )
       SELECT bands.age_band AS "ageBand", COALESCE(counts.customer_count, 0)::int AS "customerCount",
              COALESCE(ROUND(counts.customer_count * 100.0 / NULLIF((SELECT COUNT(*) FROM ages), 0), 1), 0)::float AS percent
       FROM (VALUES ('<18', 1), ('18-24', 2), ('25-34', 3), ('35-44', 4), ('45+', 5), ('Chưa có thông tin', 6)) bands(age_band, sort_order)
       LEFT JOIN counts USING (age_band)
       WHERE EXISTS (SELECT 1 FROM ages)
       ORDER BY bands.sort_order`,
      [dateRange.from, dateRange.to],
    );
    res.json(rows);
  } catch (err) {
    return fail(res, err, 'customer-ages', 'Không thể tải báo cáo độ tuổi khách hàng.');
  }
});

// GET /api/reports/customer-segments – phân khúc khách hàng theo chi tiêu
router.get('/customer-segments', async (req, res) => {
  const dateRange = optionalReportRange(req, res);
  if (!dateRange) return;
  try {
    const { rows } = await pool.query(`
      SELECT
        CASE
          WHEN total_spent >= 5000000  THEN 'VIP (≥5M)'
          WHEN total_spent >= 2000000  THEN 'Gold (2M–5M)'
          WHEN total_spent >= 500000   THEN 'Silver (500K–2M)'
          ELSE 'New (<500K)'
        END AS segment,
        COUNT(*)::int AS customer_count,
        ROUND(AVG(total_spent)::numeric, 0) AS avg_spent
      FROM (
        SELECT o.customer_id, SUM(o.total_amount) AS total_spent
        FROM "order" o
        JOIN payment p ON p.order_id = o.order_id AND p.status = 'Paid'
        WHERE o.order_status NOT IN ('Cancelled','Refunded')
          AND ($1::date IS NULL OR (o.ordered_at >= $1::date AND o.ordered_at < $2::date + INTERVAL '1 day'))
        GROUP BY o.customer_id
      ) spending
      GROUP BY segment
      ORDER BY avg_spent DESC
    `, [dateRange.from, dateRange.to]);
    res.json(rows);
  } catch (err) {
    return fail(res, err, 'customer-segments', 'Không thể tải phân khúc khách hàng.');
  }
});

// GET /api/reports/interests – thống kê sở thích khách hàng
router.get('/interests', async (req, res) => {
  const dateRange = optionalReportRange(req, res);
  if (!dateRange) return;
  try {
    const { rows } = await pool.query(`
      WITH eligible_customers AS (
        SELECT customer_id FROM customer
        WHERE ($1::date IS NULL OR (registered_at >= $1::date AND registered_at < $2::date + INTERVAL '1 day'))
      )
      SELECT i.interest_id, i.interest_name AS interest,
             COUNT(DISTINCT ci.customer_id)::int AS count,
             COALESCE(ROUND(
               COUNT(DISTINCT ci.customer_id) * 100.0
               / NULLIF((SELECT COUNT(*) FROM eligible_customers), 0), 1
             ), 0)::float AS percent
      FROM interest i
      LEFT JOIN customer_interest ci ON ci.interest_id = i.interest_id
        AND ci.customer_id IN (SELECT customer_id FROM eligible_customers)
      GROUP BY i.interest_id, i.interest_name
      ORDER BY count DESC, i.interest_name
    `, [dateRange.from, dateRange.to]);
    res.json(rows);
  } catch (err) {
    return fail(res, err, 'interests', 'Không thể tải báo cáo sở thích khách hàng.');
  }
});

// GET /api/reports/audit-logs – nhật ký hoạt động người dùng (dành cho Admin)
router.get('/audit-logs', async (req, res) => {
  if (req.user.role_name !== 'ADMIN') {
    return res.status(403).json({ message: 'Bạn không có quyền xem mục này.' });
  }
  const { from, to } = req.query;
  if ((from !== undefined && !isDateOnly(from)) || (to !== undefined && !isDateOnly(to))) {
    return res.status(400).json({ message: 'Ngày bắt đầu hoặc kết thúc không hợp lệ (định dạng YYYY-MM-DD).' });
  }
  if ((from === undefined) !== (to === undefined)) {
    return res.status(400).json({ message: 'Cần truyền cả from và to để lọc theo thời gian.' });
  }
  if (from !== undefined && (rangeDays(from, to) < 1 || rangeDays(from, to) > 3660)) {
    return res.status(400).json({ message: 'Khoảng ngày nhật ký phải từ 1 đến 3660 ngày.' });
  }
  const filterLimits = { event: 100, route: 150, user: 150 };
  for (const [key, maxLength] of Object.entries(filterLimits)) {
    const value = req.query[key];
    if (value !== undefined && (typeof value !== 'string' || value.trim().length > maxLength)) {
      return res.status(400).json({ message: `Bộ lọc ${key} không hợp lệ hoặc vượt quá ${maxLength} ký tự.` });
    }
  }
  try {
    const page = clampInt(req.query.page, { fallback: 1, min: 1, max: 1000000 });
    const limit = clampInt(req.query.limit, { fallback: 20, min: 1, max: 100 });
    if (page === null || limit === null) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const offset = (page - 1) * limit;
    const conditions = [];
    const values = [];
    const addFilter = (column, value) => {
      if (typeof value !== 'string' || !value.trim()) return;
      values.push(`%${value.trim()}%`);
      conditions.push(`${column} ILIKE $${values.length}`);
    };
    addFilter('ue.event_type', req.query.event);
    addFilter('ue.page', req.query.route);
    addFilter("COALESCE(c.full_name, e.full_name, a.username, '')", req.query.user);
    if (from !== undefined) {
      values.push(from);
      conditions.push(`ue.occurred_at >= $${values.length}::date`);
      values.push(to);
      conditions.push(`ue.occurred_at < ($${values.length}::date + INTERVAL '1 day')`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const joins = `FROM user_events ue
       LEFT JOIN account a ON a.account_id::text = ue.user_id
       LEFT JOIN customer c ON c.account_id = a.account_id
       LEFT JOIN employee e ON e.account_id = a.account_id
       LEFT JOIN role r ON r.role_id = a.role_id`;
    const listValues = [...values, limit, offset];

    const [{ rows }, { rows: countRows }] = await Promise.all([pool.query(
      `SELECT ue.*, a.username, COALESCE(c.full_name, e.full_name, a.username) AS full_name,
              r.role_name
       ${joins}
       ${where}
       ORDER BY ue.occurred_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      listValues,
    ), pool.query(`SELECT COUNT(*)::int AS total ${joins} ${where}`, values)]);

    res.json({
      data: rows,
      total: countRows[0].total,
      page,
      limit
    });
  } catch (err) {
    return fail(res, err, 'audit-logs', 'Không thể tải nhật ký hoạt động.');
  }
});

export default router;
