import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/reports/dashboard – tổng quan CRM dashboard
router.get('/dashboard', async (_req, res) => {
  try {
    const [kpiRows, tierRows, genderRows, ratingRows, recentFeedbacks, activeSurveys] =
      await Promise.all([
        // KPI cards
        pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM customer)                          AS total_customers,
            (SELECT COUNT(*)::int FROM customer
             WHERE registered_at >= NOW() - INTERVAL '30 days')          AS new_customers_30d,
            (SELECT COUNT(*)::int FROM feedback WHERE status = 'New')    AS pending_feedbacks,
            (SELECT COUNT(*)::int FROM survey WHERE status = 'Active')   AS active_surveys,
            (SELECT ROUND(AVG(rating)::numeric, 2)
             FROM feedback WHERE rating IS NOT NULL)                      AS avg_rating
        `),

        // Khách theo hạng
        pool.query(`
          SELECT customer_tier, COUNT(*)::int AS count
          FROM customer GROUP BY customer_tier ORDER BY count DESC
        `),

        // Khách theo giới tính
        pool.query(`
          SELECT gender, COUNT(*)::int AS count
          FROM customer GROUP BY gender
        `),

        // Phân bố đánh giá
        pool.query(`
          SELECT rating, COUNT(*)::int AS count
          FROM feedback WHERE rating IS NOT NULL
          GROUP BY rating ORDER BY rating DESC
        `),

        // 5 phản hồi mới nhất
        pool.query(`
          SELECT f.feedback_id, f.feedback_type, f.rating, f.content,
                 f.status, f.created_at, c.full_name AS customer_name,
                 p.product_name
          FROM feedback f
          LEFT JOIN customer c ON c.customer_id = f.customer_id
          LEFT JOIN product p  ON p.product_id = f.product_id
          ORDER BY f.created_at DESC LIMIT 5
        `),

        // Khảo sát đang chạy
        pool.query(`
          SELECT s.survey_id, s.title, s.end_date,
                 COUNT(sr.response_id)::int AS response_count
          FROM survey s
          LEFT JOIN survey_response sr ON sr.survey_id = s.survey_id
          WHERE s.status = 'Active'
          GROUP BY s.survey_id
          ORDER BY s.created_at DESC LIMIT 5
        `),
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
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/revenue – doanh thu theo khoảng thời gian
router.get('/revenue', async (req, res) => {
  try {
    const { from, to, group_by = 'day' } = req.query;
    const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const toDate   = to   || new Date().toISOString().slice(0, 10);

    const trunc = group_by === 'month' ? 'month' : group_by === 'week' ? 'week' : 'day';

    const { rows } = await pool.query(
      `SELECT DATE_TRUNC($1, o.ordered_at)::date AS period,
              COUNT(*)::int                        AS order_count,
              SUM(o.total_amount)::numeric         AS revenue
       FROM "order" o
       WHERE o.ordered_at BETWEEN $2 AND $3
         AND o.order_status NOT IN ('Cancelled', 'Refunded')
       GROUP BY period
       ORDER BY period`,
      [trunc, fromDate, toDate]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/top-products – sản phẩm bán chạy
router.get('/top-products', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const { rows } = await pool.query(
      `SELECT p.product_id, p.product_name, c.category_name,
              SUM(od.quantity)::int    AS total_sold,
              SUM(od.subtotal)::numeric AS total_revenue
       FROM order_detail od
       JOIN product_variant pv ON pv.variant_id = od.variant_id
       JOIN product p          ON p.product_id = pv.product_id
       JOIN category c         ON c.category_id = p.category_id
       JOIN "order" o          ON o.order_id = od.order_id
       WHERE o.order_status NOT IN ('Cancelled', 'Refunded')
       GROUP BY p.product_id, p.product_name, c.category_name
       ORDER BY total_sold DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/customer-segments – phân khúc khách hàng theo chi tiêu
router.get('/customer-segments', async (_req, res) => {
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
        WHERE o.order_status NOT IN ('Cancelled','Refunded')
        GROUP BY o.customer_id
      ) spending
      GROUP BY segment
      ORDER BY avg_spent DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/interests – thống kê sở thích khách hàng
router.get('/interests', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT interest, COUNT(*)::int AS count
      FROM customer_interest
      GROUP BY interest
      ORDER BY count DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
