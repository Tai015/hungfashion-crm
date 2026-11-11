-- Rebuild the complete CRM timeline while retaining email attempts and adding status changes.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS previous_status TEXT;

CREATE OR REPLACE VIEW customer_interaction_timeline AS
SELECT
  'user-event:' || ue.id::text AS interaction_id,
  c.customer_id,
  'account_access'::text AS interaction_type,
  CASE
    WHEN ue.event_type = 'login' OR ue.action = 'login_success' THEN 'Khách hàng đăng nhập'
    ELSE 'Khách hàng đăng xuất'
  END AS title,
  'Sự kiện tài khoản: ' || COALESCE(ue.action, ue.event_type) AS summary,
  ue.occurred_at
FROM user_events ue
JOIN account a ON a.account_id::text = ue.user_id
JOIN customer c ON c.account_id = a.account_id
WHERE ue.event_type IN ('login', 'logout')
   OR ue.action IN ('login_success', 'logout_success')

UNION ALL

SELECT
  'customer-profile:' || c.customer_id::text AS interaction_id,
  c.customer_id,
  'customer_profile'::text AS interaction_type,
  'Tạo hồ sơ khách hàng' AS title,
  'Hồ sơ khách hàng được khởi tạo' AS summary,
  c.registered_at AS occurred_at
FROM customer c

UNION ALL

SELECT
  'order:' || o.order_id::text AS interaction_id,
  o.customer_id,
  'order'::text AS interaction_type,
  'Đặt đơn hàng #' || o.order_id::text AS title,
  'Trạng thái: ' || o.order_status::text
    || ' · Tổng tiền: ' || TO_CHAR(o.total_amount, 'FM999G999G999G990') || ' ₫' AS summary,
  o.ordered_at AS occurred_at
FROM "order" o
WHERE o.customer_id IS NOT NULL

UNION ALL

SELECT
  'transaction:' || t.id::text AS interaction_id,
  t.customer_id,
  CASE t.event_type
    WHEN 'order_cancelled' THEN 'order_status'
    WHEN 'payment_completed' THEN 'payment'
    WHEN 'payment_refunded' THEN 'payment'
  END AS interaction_type,
  CASE t.event_type
    WHEN 'order_cancelled' THEN 'Đơn hàng #' || COALESCE(t.order_id::text, '—') || ' đã hủy'
    WHEN 'payment_completed' THEN 'Thanh toán đơn hàng #' || COALESCE(t.order_id::text, '—')
    WHEN 'payment_refunded' THEN 'Hoàn tiền đơn hàng #' || COALESCE(t.order_id::text, '—')
  END AS title,
  'Trạng thái: ' || COALESCE(t.status, 'Không rõ')
    || CASE WHEN t.amount IS NOT NULL
      THEN ' · Số tiền: ' || TO_CHAR(t.amount, 'FM999G999G999G990') || ' ' || COALESCE(t.currency, 'VND')
      ELSE ''
    END AS summary,
  t.occurred_at
FROM transactions t
WHERE t.customer_id IS NOT NULL
  AND t.event_type IN ('order_cancelled', 'payment_completed', 'payment_refunded')

UNION ALL

SELECT
  'feedback:' || f.feedback_id::text AS interaction_id,
  f.customer_id,
  'feedback'::text AS interaction_type,
  'Gửi phản hồi #' || f.feedback_id::text AS title,
  'Loại: ' || f.feedback_type::text
    || CASE WHEN f.rating IS NOT NULL THEN ' · Đánh giá: ' || f.rating::text || '/5' ELSE '' END
    || ' · Trạng thái: ' || f.status::text AS summary,
  f.created_at AS occurred_at
FROM feedback f
WHERE f.customer_id IS NOT NULL

UNION ALL

SELECT
  'feedback-reply:' || f.feedback_id::text AS interaction_id,
  f.customer_id,
  'feedback_reply'::text AS interaction_type,
  'Nhân viên đã phản hồi góp ý #' || f.feedback_id::text AS title,
  'Trạng thái: ' || f.status::text AS summary,
  f.replied_at AS occurred_at
FROM feedback f
WHERE f.customer_id IS NOT NULL
  AND f.replied_at IS NOT NULL

UNION ALL

SELECT
  'survey-invitation:' || si.invitation_id::text AS interaction_id,
  si.customer_id,
  'survey_invitation'::text AS interaction_type,
  'Được mời tham gia khảo sát' AS title,
  s.title || ' · Trạng thái lời mời: ' || si.status AS summary,
  si.invited_at AS occurred_at
FROM survey_invitation si
JOIN survey s ON s.survey_id = si.survey_id
-- Keep completed invitations too; the response is recorded as a separate timeline event.

UNION ALL

SELECT
  'survey-response:' || sr.response_id::text AS interaction_id,
  sr.customer_id,
  'survey_response'::text AS interaction_type,
  'Hoàn thành khảo sát' AS title,
  s.title AS summary,
  sr.submitted_at AS occurred_at
FROM survey_response sr
JOIN survey s ON s.survey_id = sr.survey_id
WHERE sr.customer_id IS NOT NULL

UNION ALL

SELECT
  'loyalty:' || lpt.loyalty_transaction_id::text AS interaction_id,
  lpt.customer_id,
  'loyalty'::text AS interaction_type,
  CASE lpt.transaction_type
    WHEN 'OpeningBalance' THEN 'Khởi tạo số dư điểm'
    WHEN 'Earned' THEN 'Tích lũy điểm'
    WHEN 'Redeemed' THEN 'Sử dụng điểm'
    WHEN 'RedeemedReturned' THEN 'Hoàn lại điểm đã sử dụng'
    WHEN 'EarnReversed' THEN 'Thu hồi điểm tích lũy'
    ELSE 'Điều chỉnh điểm'
  END AS title,
  'Thay đổi: ' || CASE WHEN lpt.points_delta > 0 THEN '+' ELSE '' END
    || lpt.points_delta::text || ' điểm · Số dư: ' || lpt.balance_after::text || ' điểm' AS summary,
  lpt.created_at AS occurred_at
FROM loyalty_point_transaction lpt

UNION ALL

SELECT
  'promotion-assigned:' || up.user_promo_id::text AS interaction_id,
  up.customer_id,
  'promotion_assigned'::text AS interaction_type,
  'Được cấp mã ưu đãi' AS title,
  p.name || ' · Mã: ' || p.code || ' · Trạng thái: ' || up.status::text AS summary,
  up.assigned_at AS occurred_at
FROM user_promotion up
JOIN promotion p ON p.promotion_id = up.promotion_id

UNION ALL

SELECT
  'promotion-used:' || up.user_promo_id::text AS interaction_id,
  up.customer_id,
  'promotion_used'::text AS interaction_type,
  'Đã sử dụng mã ưu đãi' AS title,
  p.name || ' · Mã: ' || p.code AS summary,
  up.used_at AS occurred_at
FROM user_promotion up
JOIN promotion p ON p.promotion_id = up.promotion_id
WHERE up.used_at IS NOT NULL

UNION ALL

SELECT
  'conversation:' || c.conversation_id::text AS interaction_id,
  c.customer_id,
  'support_chat'::text AS interaction_type,
  'Hoạt động hỗ trợ khách hàng' AS title,
  'Trạng thái: ' || c.status
    || ' · ' || COUNT(m.message_id)::text || ' tin nhắn (không hiển thị nội dung)' AS summary,
  c.updated_at AS occurred_at
FROM conversation c
LEFT JOIN chat_message m ON m.conversation_id = c.conversation_id
GROUP BY c.conversation_id, c.customer_id, c.status, c.updated_at
UNION ALL
SELECT
  'order-status:' || t.id::text,
  t.customer_id,
  'order_status'::text,
  'Đơn hàng #' || t.order_id::text || ' thay đổi trạng thái',
  'Từ: ' || COALESCE(t.previous_status, 'Không rõ')
    || ' · Sang: ' || COALESCE(t.status, 'Không rõ'),
  t.occurred_at
FROM transactions t
WHERE t.customer_id IS NOT NULL
  AND t.event_type = 'order_status_changed'
  AND t.previous_status IS NOT NULL
  AND t.status IS DISTINCT FROM t.previous_status

UNION ALL
SELECT
  'order-email-attempt:' || a.attempt_id::text,
  a.customer_id,
  'email'::text,
  CASE WHEN a.status='sent'
    THEN 'Đã gửi email xác nhận đơn hàng #' || COALESCE(a.order_id::text,'—')
    ELSE 'Gửi email xác nhận đơn hàng thất bại #' || COALESCE(a.order_id::text,'—') END,
  'Người nhận: ' || a.recipient_email
    || CASE WHEN a.status='failed' AND a.error_message IS NOT NULL
      THEN ' · Lỗi: ' || LEFT(a.error_message,300)
      ELSE ' · Gửi thành công' END,
  a.attempted_at
FROM order_confirmation_email_attempt a
WHERE a.customer_id IS NOT NULL;
