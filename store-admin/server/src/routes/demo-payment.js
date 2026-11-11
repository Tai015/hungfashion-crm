import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { calcPointsEarned } from '../domain/index.js';
import { enqueueTransactionEvent } from '../transaction-events.js';
import { logger } from '../logger.js';

const router = Router();
const rateLimits = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

function isEnabled(req, res, next) {
  if (process.env.DEMO_PAYMENT !== 'true') return res.sendStatus(404);
  next();
}

function limitRequests(req, res, next) {
  const now = Date.now();
  const key = `${req.ip}:${req.method}`;
  const current = rateLimits.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + WINDOW_MS }
    : current;
  entry.count += 1;
  rateLimits.set(key, entry);
  if (rateLimits.size > 5000) {
    for (const [storedKey, value] of rateLimits) {
      if (value.resetAt <= now) rateLimits.delete(storedKey);
    }
  }
  if (entry.count > MAX_REQUESTS) {
    res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).send('Quá nhiều yêu cầu. Vui lòng thử lại sau.');
  }
  next();
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function paymentPage() {
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thanh toán đơn hàng</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;overflow-x:hidden;background:radial-gradient(ellipse at 10% 8%,rgba(91,43,163,.48),transparent 43%),radial-gradient(ellipse at 92% 92%,rgba(29,69,145,.42),transparent 45%),linear-gradient(135deg,#0c0b18 0%,#17152c 52%,#101329 100%);color:#f8f7ff;font:16px/1.55 Outfit,Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
    .card{position:relative;width:min(100%,480px);margin:auto;padding:clamp(26px,6vw,42px);overflow:hidden;border:1px solid rgba(221,214,254,.2);border-radius:26px;background:linear-gradient(145deg,rgba(45,37,76,.88),rgba(24,27,55,.9));text-align:center;box-shadow:0 28px 80px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.12);backdrop-filter:blur(24px)}
    .card:before{position:absolute;inset:0 12% auto;height:1px;content:"";background:linear-gradient(90deg,transparent,rgba(196,181,253,.65),transparent)}
    .badge{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border:1px solid rgba(196,181,253,.24);border-radius:999px;background:rgba(139,92,246,.16);color:#d8c8ff;font-size:12px;font-weight:750;letter-spacing:.07em}
    h1{margin:20px 0 10px;font-size:clamp(22px,5vw,28px);line-height:1.2;letter-spacing:-.025em}
    p{color:#c3bed7;line-height:1.7}
    #state{margin-top:26px;color:#ddd6fe;font-weight:700}
    #close-note{margin-bottom:0;color:#a9a2bd;font-size:13px}
    @media(prefers-reduced-motion:no-preference){.card{animation:appear .45s cubic-bezier(.22,.72,.22,1) both}@keyframes appear{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}}
  </style>
  <main class="card"><span class="badge">Thanh toán mô phỏng</span><h1>Thanh toán đơn hàng</h1><p>Đây là giao dịch mô phỏng, không kết nối ngân hàng và không phát sinh tiền thật.</p><div id="state" role="status" aria-live="polite">Đang xác nhận thanh toán…</div><p id="close-note" hidden></p></main>
  <script>
  const state=document.getElementById('state');
  const closeNote=document.getElementById('close-note');
  fetch(location.pathname+'/confirm',{method:'POST',headers:{'Content-Type':'application/json'}})
    .then(async r=>({ok:r.ok,data:await r.json().catch(()=>({}))}))
    .then(({ok,data})=>{
      if(!ok||!data.success){state.textContent=data.message||'Không thể xác nhận thanh toán.';state.style.color='#fb7185';return}
      state.textContent=data.already_paid?'Thanh toán thành công (đã được xác nhận trước đó).':'Thanh toán thành công';
      state.style.color='#34d399';
      let seconds=5;
      closeNote.hidden=false;
      closeNote.textContent='Trang sẽ tự đóng sau '+seconds+' giây.';
      const countdown=window.setInterval(()=>{
        seconds-=1;
        if(seconds>0){closeNote.textContent='Trang sẽ tự đóng sau '+seconds+' giây.';return}
        window.clearInterval(countdown);
        window.close();
        window.setTimeout(()=>{
          if(!window.closed) closeNote.textContent='Trình duyệt không cho phép tự đóng tab này. Bạn có thể đóng trang.';
        },250);
      },1000);
    })
    .catch(()=>{state.textContent='Không kết nối được máy chủ. Vui lòng thử tải lại trang.';state.style.color='#fb7185'});
  </script></html>`;
}

router.get('/pay/demo/:token', isEnabled, limitRequests, (req, res) => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(req.params.token)) {
    return res.status(404).send('Mã thanh toán demo không hợp lệ.');
  }
  res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer');
  res.type('html').send(paymentPage());
});

router.post('/pay/demo/:token/confirm', isEnabled, limitRequests, async (req, res) => {
  const token = req.params.token;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return res.status(404).json({ message: 'Mã thanh toán demo không hợp lệ.' });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows: tokenRows } = await client.query(
      `SELECT order_id, expires_at, used_at
       FROM demo_payment_tokens WHERE token_hash=$1 FOR UPDATE`,
      [tokenHash(token)],
    );
    if (!tokenRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Mã thanh toán demo không hợp lệ.' });
    }
    const tokenRow = tokenRows[0];
    const { rows: orderRows } = await client.query(
      `SELECT o.order_id, o.customer_id, o.order_status, o.total_amount,
              p.payment_id, p.amount, p.method, p.status AS payment_status
       FROM "order" o JOIN payment p ON p.order_id=o.order_id
       WHERE o.order_id=$1 FOR UPDATE OF o, p`,
      [tokenRow.order_id],
    );
    if (!orderRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng thanh toán demo.' });
    }
    const order = orderRows[0];
    if (order.payment_status === 'Paid') {
      await client.query(
        `UPDATE demo_payment_tokens SET used_at=COALESCE(used_at,NOW()) WHERE order_id=$1`,
        [order.order_id],
      );
      await client.query('COMMIT');
      return res.json({ success: true, already_paid: true });
    }
    if (tokenRow.used_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Mã thanh toán demo đã được sử dụng.' });
    }
    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ message: 'Mã thanh toán demo đã hết hạn.' });
    }
    if (order.method !== 'BankTransfer' || order.payment_status !== 'Pending'
      || ['Cancelled', 'Refunded'].includes(order.order_status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Đơn hàng không còn chờ thanh toán demo.' });
    }

    const transactionRef = `DEMO-${randomUUID()}`;
    const { rows: paidRows } = await client.query(
      `UPDATE payment SET status='Paid', transaction_ref=$1, paid_at=NOW()
       WHERE payment_id=$2 RETURNING payment_id, amount, transaction_ref, paid_at`,
      [transactionRef, order.payment_id],
    );
    await enqueueTransactionEvent(client, {
      eventType: 'payment_completed',
      orderId: order.order_id,
      amount: paidRows[0].amount,
      status: 'Paid',
      source: 'demo_qr',
      customerId: order.customer_id,
      paymentId: paidRows[0].payment_id,
      paymentMethod: order.method,
      transactionId: transactionRef,
    });
    await client.query(
      `UPDATE demo_payment_tokens SET used_at=NOW() WHERE order_id=$1`, [order.order_id],
    );

    if (order.customer_id) {
      const { rows: earnedRows } = await client.query(
        `SELECT loyalty_transaction_id FROM loyalty_point_transaction
         WHERE order_id=$1 AND transaction_type='Earned'`, [order.order_id],
      );
      const points = earnedRows.length ? 0 : calcPointsEarned(Number(paidRows[0].amount));
      if (points > 0) {
        const { rows: customerRows } = await client.query(
          `UPDATE customer SET points_balance=points_balance+$1, lifetime_points=lifetime_points+$1, updated_at=NOW()
           WHERE customer_id=$2 RETURNING points_balance`, [points, order.customer_id],
        );
        if (!customerRows.length) throw new Error('Customer record missing for demo payment points.');
        await client.query(`UPDATE "order" SET loyalty_points_earned=$1 WHERE order_id=$2`, [points, order.order_id]);
        await client.query(
          `INSERT INTO loyalty_point_transaction
             (customer_id, order_id, transaction_type, points_delta, balance_after, note)
           VALUES ($1,$2,'Earned',$3,$4,$5)`,
          [order.customer_id, order.order_id, points, customerRows[0].points_balance,
            `Tích điểm từ thanh toán demo đơn hàng #${order.order_id}`],
        );
      }
    }

    const { rows: accountRows } = await client.query(
      `SELECT account_id FROM customer WHERE customer_id=$1`, [order.customer_id],
    );
    await client.query(
      `INSERT INTO user_events
         (event_id, user_id, event_type, page, action, source_check, source, occurred_at)
       VALUES ($1,$2,'demo_payment_completed','/pay/demo','confirm','demo-payment','demo-payment',$3)`,
      [randomUUID(), accountRows[0]?.account_id == null ? null : String(accountRows[0].account_id), paidRows[0].paid_at],
    );
    await client.query('COMMIT');
    return res.json({ success: true, already_paid: false });
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    logger.error({ err: error, requestId: req.requestId }, 'Demo payment confirmation failed');
    return res.status(500).json({ message: 'Không thể xác nhận thanh toán demo.' });
  } finally {
    client?.release();
  }
});

export default router;
