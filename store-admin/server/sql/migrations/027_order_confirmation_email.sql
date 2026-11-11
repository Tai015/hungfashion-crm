-- Durable order confirmation email queue and attempt audit.
ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS order_confirmation_email (
  email_id BIGSERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES "order"(order_id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customer(customer_id) ON DELETE SET NULL,
  recipient_email VARCHAR(254) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_confirmation_email_queue_idx
  ON order_confirmation_email (next_attempt_at, email_id)
  WHERE status IN ('queued', 'failed', 'sending');

CREATE TABLE IF NOT EXISTS order_confirmation_email_attempt (
  attempt_id BIGSERIAL PRIMARY KEY,
  email_id BIGINT REFERENCES order_confirmation_email(email_id) ON DELETE SET NULL,
  order_id INTEGER REFERENCES "order"(order_id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customer(customer_id) ON DELETE SET NULL,
  recipient_email VARCHAR(254) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  provider_message_id TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_confirmation_email_attempt_customer_idx
  ON order_confirmation_email_attempt (customer_id, attempted_at DESC, attempt_id DESC)
  WHERE customer_id IS NOT NULL;

CREATE OR REPLACE VIEW customer_interaction_timeline AS
SELECT 'user-event:' || ue.id::text AS interaction_id, c.customer_id,
  'account_access'::text AS interaction_type,
  CASE WHEN ue.event_type='login' OR ue.action='login_success'
    THEN 'Khách hàng đăng nhập' ELSE 'Khách hàng đăng xuất' END AS title,
  'Sự kiện tài khoản: ' || COALESCE(ue.action, ue.event_type) AS summary,
  ue.occurred_at
FROM user_events ue
JOIN account a ON a.account_id::text=ue.user_id
JOIN customer c ON c.account_id=a.account_id
WHERE ue.event_type IN ('login','logout') OR ue.action IN ('login_success','logout_success')
UNION ALL
SELECT 'customer-profile:' || c.customer_id::text, c.customer_id,
  'customer_profile'::text, 'Tạo hồ sơ khách hàng',
  'Hồ sơ khách hàng được khởi tạo', c.registered_at
FROM customer c
UNION ALL
SELECT 'order:' || o.order_id::text, o.customer_id, 'order'::text,
  'Đặt đơn hàng #' || o.order_id::text,
  'Trạng thái: ' || o.order_status::text || ' · Tổng tiền: ' || TO_CHAR(o.total_amount,'FM999G999G999G990') || ' ₫',
  o.ordered_at
FROM "order" o WHERE o.customer_id IS NOT NULL
UNION ALL
SELECT 'transaction:' || t.id::text, t.customer_id,
  CASE t.event_type WHEN 'order_cancelled' THEN 'order_status' WHEN 'payment_completed' THEN 'payment' WHEN 'payment_refunded' THEN 'payment' END,
  CASE t.event_type WHEN 'order_cancelled' THEN 'Đơn hàng #' || COALESCE(t.order_id::text,'—') || ' đã hủy'
    WHEN 'payment_completed' THEN 'Thanh toán đơn hàng #' || COALESCE(t.order_id::text,'—')
    WHEN 'payment_refunded' THEN 'Hoàn tiền đơn hàng #' || COALESCE(t.order_id::text,'—') END,
  'Trạng thái: ' || COALESCE(t.status,'Không rõ')
    || CASE WHEN t.amount IS NOT NULL THEN ' · Số tiền: ' || TO_CHAR(t.amount,'FM999G999G999G990') || ' ' || COALESCE(t.currency,'VND') ELSE '' END,
  t.occurred_at
FROM transactions t WHERE t.customer_id IS NOT NULL AND t.event_type IN ('order_cancelled','payment_completed','payment_refunded')
UNION ALL
SELECT 'feedback:' || f.feedback_id::text, f.customer_id, 'feedback'::text,
  'Gửi phản hồi #' || f.feedback_id::text,
  'Loại: ' || f.feedback_type::text || CASE WHEN f.rating IS NOT NULL THEN ' · Đánh giá: ' || f.rating::text || '/5' ELSE '' END || ' · Trạng thái: ' || f.status::text,
  f.created_at
FROM feedback f WHERE f.customer_id IS NOT NULL
UNION ALL
SELECT 'feedback-reply:' || f.feedback_id::text, f.customer_id, 'feedback_reply'::text,
  'Nhân viên đã phản hồi góp ý #' || f.feedback_id::text,
  'Trạng thái: ' || f.status::text, f.replied_at
FROM feedback f WHERE f.customer_id IS NOT NULL AND f.replied_at IS NOT NULL
UNION ALL
SELECT 'survey-invitation:' || si.invitation_id::text, si.customer_id, 'survey_invitation'::text,
  'Được mời tham gia khảo sát', s.title || ' · Trạng thái lời mời: ' || si.status, si.invited_at
FROM survey_invitation si JOIN survey s ON s.survey_id=si.survey_id
UNION ALL
SELECT 'survey-response:' || sr.response_id::text, sr.customer_id, 'survey_response'::text,
  'Hoàn thành khảo sát', s.title, sr.submitted_at
FROM survey_response sr JOIN survey s ON s.survey_id=sr.survey_id WHERE sr.customer_id IS NOT NULL
UNION ALL
SELECT 'loyalty:' || lpt.loyalty_transaction_id::text, lpt.customer_id, 'loyalty'::text,
  CASE lpt.transaction_type WHEN 'OpeningBalance' THEN 'Khởi tạo số dư điểm'
    WHEN 'Earned' THEN 'Tích lũy điểm' WHEN 'Redeemed' THEN 'Sử dụng điểm'
    WHEN 'RedeemedReturned' THEN 'Hoàn lại điểm đã sử dụng' WHEN 'EarnReversed' THEN 'Thu hồi điểm tích lũy'
    ELSE 'Điều chỉnh điểm' END,
  'Thay đổi: ' || CASE WHEN lpt.points_delta>0 THEN '+' ELSE '' END || lpt.points_delta::text || ' điểm · Số dư: ' || lpt.balance_after::text || ' điểm',
  lpt.created_at
FROM loyalty_point_transaction lpt
UNION ALL
SELECT 'promotion-assigned:' || up.user_promo_id::text, up.customer_id, 'promotion_assigned'::text,
  'Được cấp mã ưu đãi', p.name || ' · Mã: ' || p.code || ' · Trạng thái: ' || up.status::text, up.assigned_at
FROM user_promotion up JOIN promotion p ON p.promotion_id=up.promotion_id
UNION ALL
SELECT 'promotion-used:' || up.user_promo_id::text, up.customer_id, 'promotion_used'::text,
  'Đã sử dụng mã ưu đãi', p.name || ' · Mã: ' || p.code, up.used_at
FROM user_promotion up JOIN promotion p ON p.promotion_id=up.promotion_id WHERE up.used_at IS NOT NULL
UNION ALL
SELECT 'conversation:' || c.conversation_id::text, c.customer_id, 'support_chat'::text,
  'Hoạt động hỗ trợ khách hàng',
  'Trạng thái: ' || c.status || ' · ' || COUNT(m.message_id)::text || ' tin nhắn (không hiển thị nội dung)',
  c.updated_at
FROM conversation c LEFT JOIN chat_message m ON m.conversation_id=c.conversation_id
GROUP BY c.conversation_id,c.customer_id,c.status,c.updated_at
UNION ALL
SELECT 'order-email-attempt:' || a.attempt_id::text, a.customer_id, 'email'::text,
  CASE WHEN a.status='sent' THEN 'Đã gửi email xác nhận đơn hàng #' || COALESCE(a.order_id::text,'—')
    ELSE 'Gửi email xác nhận đơn hàng thất bại #' || COALESCE(a.order_id::text,'—') END,
  'Người nhận: ' || a.recipient_email || CASE WHEN a.status='failed' AND a.error_message IS NOT NULL
    THEN ' · Lỗi: ' || LEFT(a.error_message,300) ELSE ' · Gửi thành công' END,
  a.attempted_at
FROM order_confirmation_email_attempt a WHERE a.customer_id IS NOT NULL;
