import { pool } from './db.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_SECONDS = [30, 120, 600, 1800];
const POLL_INTERVAL_MS = 10_000;
const CLAIM_STALE_AFTER = '5 minutes';

export function isValidEmail(value) {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  return email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency', currency: 'VND', maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function buildOrderConfirmationEmail({ order, details }) {
  const customerName = escapeHtml(order.customer_name || 'Quý khách');
  const orderId = escapeHtml(order.order_id);
  const itemRows = details.map(item => `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid #eee">
        <strong>${escapeHtml(item.product_name)}</strong>
        <div style="color:#777;font-size:12px">${escapeHtml(item.sku || '')}</div>
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:center">${Number(item.quantity)}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right">${formatMoney(item.subtotal)}</td>
    </tr>`).join('');
  const shippingAddress = order.shipping_address
    ? `<p><strong>Địa chỉ nhận hàng:</strong> ${escapeHtml(order.shipping_address)}</p>`
    : '';
  const date = new Date(order.ordered_at).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  const html = `
    <div style="margin:0 auto;max-width:640px;padding:24px;font-family:Arial,sans-serif;color:#222">
      <h2 style="color:#7c3aed">Hung Fashion</h2>
      <p>Xin chào ${customerName},</p>
      <p>Cảm ơn bạn đã mua sắm tại Hung Fashion. Đơn hàng của bạn đã được ghi nhận thành công.</p>
      <div style="padding:16px;background:#f7f5ff;border-radius:8px">
        <strong>Mã đơn hàng: #${orderId}</strong><br/>
        <span style="color:#666">Thời gian đặt: ${escapeHtml(date)}</span>
      </div>
      <h3>Chi tiết đơn hàng</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:left;padding:8px">Sản phẩm</th>
          <th style="padding:8px">SL</th>
          <th style="text-align:right;padding:8px">Thành tiền</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="margin-top:16px;text-align:right">
        <p>Tạm tính: ${formatMoney(order.subtotal)}</p>
        <p>Giảm giá: ${formatMoney(order.discount_amt)}</p>
        <h3>Tổng thanh toán: ${formatMoney(order.total_amount)}</h3>
      </div>
      <p><strong>Phương thức thanh toán:</strong> ${escapeHtml(order.payment_method || 'Chưa xác định')}</p>
      <p><strong>Trạng thái thanh toán:</strong> ${escapeHtml(order.payment_status || 'Chờ thanh toán')}</p>
      ${shippingAddress}
      <p>Nếu cần hỗ trợ, vui lòng liên hệ cửa hàng và cung cấp mã đơn hàng #${orderId}.</p>
      <p style="color:#777;font-size:12px">Đây là email tự động, vui lòng không trả lời email này.</p>
    </div>`;
  const text = [
    'Hung Fashion - Xác nhận đơn hàng',
    `Xin chào ${order.customer_name || 'Quý khách'}.`,
    `Đơn hàng #${order.order_id} đã được ghi nhận.`,
    `Thời gian: ${date}`,
    ...details.map(item => `- ${item.product_name} x ${item.quantity}: ${formatMoney(item.subtotal)}`),
    `Tổng thanh toán: ${formatMoney(order.total_amount)}`,
    `Phương thức thanh toán: ${order.payment_method || 'Chưa xác định'}`,
    order.shipping_address ? `Địa chỉ nhận hàng: ${order.shipping_address}` : '',
    'Đây là email tự động, vui lòng không trả lời.',
  ].filter(Boolean).join('\n');
  return {
    subject: `Hung Fashion – Xác nhận đơn hàng #${order.order_id}`,
    html,
    text,
  };
}

export function buildOrderStatusEmail({ order, details = [], eventType }) {
  const messages = {
    order_cancelled: {
      subject: `Thông báo hủy đơn hàng #${order.order_id} – Hung Fashion`,
      heading: 'Đơn hàng đã được hủy',
      intro: 'Đơn hàng của bạn đã được hủy thành công theo yêu cầu hoặc theo quy trình xử lý của cửa hàng.',
    },
    order_delivered: {
      subject: `Đơn hàng #${order.order_id} đã được giao – Hung Fashion`,
      heading: 'Đơn hàng đã được giao',
      intro: 'Đơn hàng của bạn đã được cập nhật là đã giao hàng. Cảm ơn bạn đã tin tưởng và mua sắm tại Hung Fashion.',
    },
    payment_paid: {
      subject: `Đã nhận thanh toán cho đơn hàng #${order.order_id} – Hung Fashion`,
      heading: 'Thanh toán thành công',
      intro: 'Hung Fashion đã ghi nhận khoản thanh toán cho đơn hàng của bạn.',
    },
  };
  const message = messages[eventType];
  if (!message) throw new Error(`Loại email trạng thái không hợp lệ: ${eventType}`);
  const customerName = escapeHtml(order.customer_name || 'Quý khách');
  const orderId = escapeHtml(order.order_id);
  const date = new Date(order.ordered_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const itemLines = details.map(item =>
    `- ${item.product_name} x ${Number(item.quantity)}: ${formatMoney(item.subtotal)}`);
  const htmlItems = details.map(item =>
    `<li>${escapeHtml(item.product_name)} × ${Number(item.quantity)} – ${formatMoney(item.subtotal)}</li>`).join('');
  const html = `
    <div style="margin:0 auto;max-width:640px;padding:24px;font-family:Arial,sans-serif;color:#222">
      <h2 style="color:#7c3aed">Hung Fashion</h2>
      <p>Xin chào ${customerName},</p>
      <h3>${message.heading}</h3>
      <p>${message.intro}</p>
      <p><strong>Mã đơn hàng: #${orderId}</strong></p>
      <p>Thời gian đặt hàng: ${escapeHtml(date)}</p>
      ${htmlItems ? `<h4>Thông tin sản phẩm</h4><ul>${htmlItems}</ul>` : ''}
      <p><strong>Tổng giá trị đơn hàng: ${formatMoney(order.total_amount)}</strong></p>
      <p>Nếu cần hỗ trợ, vui lòng liên hệ cửa hàng và cung cấp mã đơn hàng #${orderId}.</p>
      <p style="color:#777;font-size:12px">Đây là thư tự động từ Hung Fashion. Vui lòng không trả lời thư này.</p>
    </div>`;
  const text = [
    'Hung Fashion',
    `Xin chào ${order.customer_name || 'Quý khách'},`,
    message.heading + '.',
    message.intro,
    `Mã đơn hàng: #${order.order_id}`,
    `Thời gian đặt hàng: ${date}`,
    ...itemLines,
    `Tổng giá trị đơn hàng: ${formatMoney(order.total_amount)}`,
    `Nếu cần hỗ trợ, vui lòng liên hệ cửa hàng và cung cấp mã đơn hàng #${order.order_id}.`,
    'Đây là thư tự động từ Hung Fashion. Vui lòng không trả lời thư này.',
  ].join('\\n');
  return { subject: message.subject, html, text };
}

export async function enqueueOrderConfirmationEmail(client, {
  orderId, customerId, recipientEmail, payload,
}) {
  if (!customerId || !isValidEmail(recipientEmail)) return false;
  await client.query(
    `INSERT INTO order_confirmation_email
       (order_id, customer_id, recipient_email, payload, status, next_attempt_at)
     VALUES ($1, $2, $3, $4::jsonb, 'queued', NOW() + INTERVAL '15 seconds')
     ON CONFLICT (order_id) DO NOTHING`,
    [orderId, customerId, recipientEmail.trim().toLowerCase(), JSON.stringify(payload), eventType],
  );
  return true;
}

async function claimNextEmail() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [job] } = await client.query(
      `SELECT email_id, order_id, customer_id, recipient_email, payload, event_type, attempts
       FROM order_confirmation_email
       WHERE attempts < $1
         AND payload IS NOT NULL
         AND (
           (status IN ('queued', 'failed') AND next_attempt_at <= NOW())
           OR (status = 'sending' AND updated_at < NOW() - INTERVAL '${CLAIM_STALE_AFTER}')
         )
       ORDER BY next_attempt_at, email_id
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [MAX_ATTEMPTS],
    );
    if (!job) {
      await client.query('COMMIT');
      return null;
    }
    const { rows: [claimed] } = await client.query(
      `UPDATE order_confirmation_email
       SET status='sending', attempts=attempts+1, updated_at=NOW()
       WHERE email_id=$1
       RETURNING email_id, order_id, customer_id, recipient_email, payload, event_type, attempts`,
      [job.email_id],
    );
    await client.query('COMMIT');
    return claimed;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}


async function saveAttempt(job, { status, errorMessage = null, providerMessageId = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO order_confirmation_email_attempt
         (email_id, order_id, customer_id, recipient_email, status,
          error_message, provider_message_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [job.email_id, job.order_id, job.customer_id, job.recipient_email,
        status, errorMessage, providerMessageId],
    );
    const sent = status === 'sent';
    const retrySeconds = RETRY_DELAYS_SECONDS[Math.min(job.attempts - 1, RETRY_DELAYS_SECONDS.length - 1)];
    await client.query(
      `UPDATE order_confirmation_email
       SET status=$2::varchar,
           sent_at=CASE WHEN $2::varchar='sent' THEN NOW() ELSE sent_at END,
           last_error=$3,
           next_attempt_at=CASE WHEN $2::varchar='failed' THEN NOW() + ($4 * INTERVAL '1 second') ELSE next_attempt_at END,
           updated_at=NOW()
       WHERE email_id=$1`,
      [job.email_id, status, errorMessage, retrySeconds],
    );
    if (sent) {
      await client.query(
        `UPDATE "order" SET confirmation_email_sent_at=NOW()
         WHERE order_id=$1 AND confirmation_email_sent_at IS NULL`,
        [job.order_id],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function sendClaimedEmail(job, { fetchImpl, apiKey, mailFrom }) {
  try {
    const message = job.payload;
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `order-email/${job.order_id}/${job.event_type}`,
      },
      body: JSON.stringify({
        from: mailFrom,
        to: [job.recipient_email],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || payload.name || `Resend trả về HTTP ${response.status}`);
    }
    await saveAttempt(job, {
      status: 'sent',
      providerMessageId: typeof payload.id === 'string' ? payload.id : null,
    });
    console.info('[order-email] confirmation sent', {
      orderId: job.order_id,
      recipient: job.recipient_email,
      attempt: job.attempts,
      providerMessageId: payload.id || null,
    });
  } catch (error) {
    const message = String(error?.message || 'Unknown email delivery error').slice(0, 1000);
    await saveAttempt(job, { status: 'failed', errorMessage: message });
    console.error('[order-email] confirmation delivery failed', {
      orderId: job.order_id,
      recipient: job.recipient_email,
      attempt: job.attempts,
      error: message,
    });
  }
}

let workerRunning = false;
let workerTimer = null;

export function startOrderConfirmationEmailWorker({
  fetchImpl = globalThis.fetch,
  apiKey = process.env.RESEND_API_KEY,
  mailFrom = process.env.MAIL_FROM,
} = {}) {
  if (workerTimer) return;
  if (!apiKey || !mailFrom) {
    console.warn('[order-email] worker is idle: RESEND_API_KEY or MAIL_FROM is missing.');
    return;
  }

  const processQueue = async () => {
    if (workerRunning) return;
    workerRunning = true;
    try {
      while (true) {
        const job = await claimNextEmail();
        if (!job) break;
        await sendClaimedEmail(job, { fetchImpl, apiKey, mailFrom });
      }
    } catch (error) {
      console.error('[order-email] queue worker failed:', error.message);
    } finally {
      workerRunning = false;
    }
  };

  workerTimer = setInterval(processQueue, POLL_INTERVAL_MS);
  workerTimer.unref?.();
  processQueue();
}
