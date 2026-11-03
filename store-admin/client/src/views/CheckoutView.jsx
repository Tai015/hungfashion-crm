import { useEffect, useState } from 'react';
import { CheckCircle, ChevronLeft, CreditCard, Tag, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useModalEffects } from '../hooks/useModalEffects';
import { apiFetch } from '../api';
import { useCart } from '../context/CartContext';
import { useSweetAlertMessages } from '../utils/notifications';
import PaymentCountdown from '../components/PaymentCountdown';
import QRCode from 'qrcode';

const fmtVND = n => Number(n).toLocaleString('vi-VN') + 'đ';

const INPUT  = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input';
const SELECT = INPUT + ' cursor-pointer';
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 h-11 px-6 bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 cursor-pointer';
const BTN_GHOST   = 'inline-flex items-center gap-1.5 h-9 px-4 bg-white/[0.07] border border-white/15 text-white/65 text-sm font-medium rounded-xl transition-all hover:bg-white/[0.12] hover:text-white/90 cursor-pointer';
const PANEL  = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';
const FIELD  = 'flex flex-col gap-1.5 text-white/65 text-sm font-medium';

const PAYMENT_METHODS = [
  { value:'Cash',         label:'Tiền mặt (nhận hàng)',         icon:'💵' },
  { value:'BankTransfer', label:'Thanh toán bằng QR',  icon:'▦' },
];

function QRModal({ order, onClose, onViewOrders }) {
  const [qrError, setQrError] = useState('');
  const [demoQr, setDemoQr] = useState('');
  const [paymentStatus, setPaymentStatus] = useState(order.payment?.status || 'Pending');
  const isDemo = Boolean(order.payment_instructions?.demo_url);
  const isZeroTotal = Number(order.total_amount) === 0;
  useModalEffects(true, onClose);
  const instructions = order.payment_instructions;
  const needsQR = order.payment_method === 'BankTransfer';
  useSweetAlertMessages({ error: qrError, warning: needsQR && !isZeroTotal && !instructions ? 'Máy chủ chưa trả thông tin chuyển khoản. Vui lòng liên hệ cửa hàng trước khi thanh toán.' : '' });

  useEffect(() => {
    if (!isDemo || !instructions?.demo_url) return undefined;
    let active = true;
    QRCode.toDataURL(instructions.demo_url, { width: 280, margin: 2, errorCorrectionLevel: 'M' })
      .then(dataUrl => { if (active) setDemoQr(dataUrl); })
      .catch(() => { if (active) setQrError('Không tạo được mã QR thanh toán.'); });
    return () => { active = false; };
  }, [isDemo, instructions?.demo_url]);

  useEffect(() => {
    if (!needsQR || paymentStatus === 'Paid') return undefined;
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const current = await apiFetch(`/api/orders/mine/${order.order_id}`);
        const status = current.payment?.status;
        if (status) setPaymentStatus(status);
      } catch { /* Keep the checkout open; the next poll can recover from transient errors. */ }
    };
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt >= 15 * 60_000) window.clearInterval(timer);
      else poll();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [needsQR, order.order_id, paymentStatus]);

  return createPortal((
    <div className="customer-portal-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-5">
      <div className="customer-portal-modal-surface w-full max-w-md flex flex-col items-center gap-5 p-7 border border-white/[0.12] rounded-3xl shadow-[0_32px_80px_rgba(0,0,0,0.7)] text-[#f5f0eb]">
        <CheckCircle size={48} className={paymentStatus === 'Paid' ? 'text-emerald-400' : 'text-orange-400'}/>
        <div className="text-center">
          <h2 className="m-0 text-xl font-bold">{isZeroTotal ? 'Đặt hàng thành công!' : paymentStatus === 'Paid' ? 'Thanh toán thành công' : 'Đặt hàng thành công!'}</h2>
          <p className="m-0 mt-1 text-white/45 text-sm">Mã đơn: <strong className="text-orange-400">#{order.order_id}</strong></p>
          <p className="m-0 mt-0.5 text-white/40 text-xs">Tổng tiền: <strong className="text-[#f5f0eb]">{fmtVND(order.total_amount)}</strong></p>
        </div>

        {needsQR && paymentStatus !== 'Paid' && (
          <>
            <p className="m-0 text-white/50 text-sm text-center">Quét mã QR để thanh toán:</p>
            {isDemo && <span className="px-2.5 py-1 rounded-full bg-orange-500/15 border border-orange-400/30 text-orange-300 text-xs font-semibold">Thanh toán mô phỏng · không phát sinh giao dịch thật</span>}
            <PaymentCountdown expiresAt={order.payment_expires_at} actionLabel="xác nhận thanh toán" />
            {instructions ? (
              <>
                <div className="p-3 bg-white rounded-2xl">
                  {isDemo
                    ? demoQr ? <img src={demoQr} alt="Mã QR thanh toán" className="w-56 h-56 object-contain" /> : <div className="w-56 h-56 grid place-items-center text-slate-500 text-sm">Đang tạo mã QR…</div>
                    : qrError
                    ? <div className="w-56 h-56" aria-hidden="true" />
                    : <img src={instructions.qr_url} alt="QR thanh toán" className="w-56 h-56 object-contain"
                        onError={() => setQrError('Không tải được mã QR. Vui lòng kiểm tra kết nối hoặc dùng thông tin chuyển khoản bên dưới.')} />}
                </div>
                {!isDemo && <div className="text-center text-white/40 text-xs">
                  <p className="m-0">{instructions.bank_id} · {instructions.account_number}</p>
                  <p className="m-0">{instructions.account_name}</p>
                  <p className="m-0 text-orange-400 font-semibold mt-1">Nội dung: {instructions.transfer_content}</p>
                </div>}
              </>
            ) : <p className="m-0 text-white/55 text-sm">Thông tin chuyển khoản chưa sẵn sàng. Vui lòng liên hệ cửa hàng.</p>}
          </>
        )}
        {isZeroTotal && (
          <p className="m-0 text-center text-emerald-300 text-sm">Đơn hàng 0đ, không cần thanh toán.</p>
        )}
        {needsQR && !isZeroTotal && paymentStatus === 'Paid' && (
          <p className="m-0 text-center text-emerald-300 text-sm">Đơn hàng đã được xác nhận thanh toán. Cảm ơn bạn!</p>
        )}

        <div className="flex flex-col gap-2 w-full mt-2">
          <button className={BTN_PRIMARY} onClick={onViewOrders} style={{ width:'100%' }}>
            Xem đơn hàng của tôi
          </button>
          <button className={BTN_GHOST} onClick={onClose} style={{ width:'100%', justifyContent:'center' }}>
            Tiếp tục mua sắm
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

export default function CheckoutView({ onBack, onOrderSuccess }) {
  const { items, totalAmount, clearCart } = useCart();
  const [address, setAddress]           = useState('');
  const [payMethod, setPayMethod]       = useState('Cash');
  const [promoCode, setPromoCode]       = useState('');
  const [walletPromos, setWalletPromos] = useState([]);
  const [promo, setPromo]               = useState(null);
  const [promoError, setPromoError]     = useState('');
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [loyaltyLoadError, setLoyaltyLoadError] = useState('');
  const [pointsToRedeem, setPointsToRedeem] = useState('0');
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState('');
  useSweetAlertMessages({ error, warning: promoError });
  const [order, setOrder]               = useState(null);

  useEffect(() => {
    apiFetch('/api/promotions/mine').then(rows => setWalletPromos(rows.filter(row => row.status === 'Available' && row.end_date >= new Date().toISOString().slice(0, 10))))
      .catch(e => setPromoError(e.message));
    apiFetch('/api/loyalty/me').then(result => setLoyaltyBalance(Number(result.balance) || 0))
      .catch(e => setLoyaltyLoadError(e.message));
  }, []);

  const discount = promo
    ? Math.min(
      totalAmount,
      promo.promo_type === 'Percent'
        ? Math.min(totalAmount * Number(promo.value) / 100, promo.max_discount == null ? Infinity : Number(promo.max_discount))
        : promo.promo_type === 'FixedAmount' ? Number(promo.value) : 0,
    )
    : 0;
  const finalTotal = Math.max(0, totalAmount - discount);
  const maxRedeemablePoints = Math.max(0, Math.min(
    Math.floor(Math.max(0, loyaltyBalance) / 10) * 10,
    Math.floor(finalTotal / 1_000) * 10,
  ));
  const redeemedPoints = Math.min(Math.max(0, Number(pointsToRedeem) || 0), maxRedeemablePoints);
  const loyaltyDiscount = Math.floor(redeemedPoints / 10) * 1_000;
  const payableTotal = Math.max(0, finalTotal - loyaltyDiscount);

  const validatePromo = async () => {
    if (!promoCode.trim()) return;
    setValidatingPromo(true); setPromoError(''); setPromo(null);
    try {
      const p = await apiFetch(`/api/promotions/validate/${encodeURIComponent(promoCode.trim())}`);
      if (p.min_order && totalAmount < p.min_order) {
        setPromoError(`Đơn tối thiểu ${fmtVND(p.min_order)} mới áp dụng được mã này.`);
      } else {
        setPromo(p);
      }
    } catch(e) { setPromoError(e.message); }
    finally { setValidatingPromo(false); }
  };

  const submit = async e => {
    e.preventDefault();
    if (!address.trim()) { setError('Vui lòng nhập địa chỉ giao hàng.'); return; }
    setBusy(true); setError('');
    try {
      const created = await apiFetch('/api/orders', {
        method: 'POST',
        body: {
          order_channel:    'Website',
          shipping_address: address.trim(),
          payment_method:   payMethod,
          promotion_id:     promo?.promotion_id || null,
          loyalty_points_to_redeem: redeemedPoints,
          items: items.map(i => ({ variant_id: i.variant_id, quantity: i.quantity })),
        },
      });
      if (created.payment_method === 'BankTransfer') {
        localStorage.setItem(`pending-transfer-order:${created.order_id}`, '1');
      }
      clearCart();
      setOrder(created);
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (order) {
    return (
      <QRModal
        order={order}
        onClose={() => { setOrder(null); onBack(); }}
        onViewOrders={() => { setOrder(null); onOrderSuccess?.(); }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div className="flex items-center gap-3">
        <button className={BTN_GHOST} onClick={onBack}><ChevronLeft size={15}/> Giỏ hàng</button>
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Mua sắm</p>
          <h1 className="m-0 mt-0.5 text-[clamp(1.3rem,2.5vw,1.8rem)] font-bold tracking-tight">Xác nhận đặt hàng</h1>
        </div>
      </div>


      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-5 items-start">
        <div className="flex flex-col gap-4">
          {/* Địa chỉ */}
          <div className={PANEL}>
            <h2 className="m-0 text-[1.05rem] font-semibold">Thông tin giao hàng</h2>
            <label className={FIELD}>
              <span>Địa chỉ giao hàng <span className="text-red-400">*</span></span>
              <textarea required rows={3} maxLength={500}
                className="w-full px-3 py-2.5 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/[0.12] transition-all resize-y dark-input min-h-[70px]"
                placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                value={address} onChange={e => setAddress(e.target.value)} />
            </label>
          </div>

          {/* Phương thức thanh toán */}
          <div className={PANEL}>
            <h2 className="m-0 text-[1.05rem] font-semibold"><CreditCard size={16} className="inline mr-2"/>Phương thức thanh toán</h2>
            <div className="flex flex-col gap-2">
              {PAYMENT_METHODS.map(m => (
                <label key={m.value} className={`flex items-center gap-3 p-3.5 border rounded-xl cursor-pointer transition-all ${payMethod===m.value ? 'border-orange-500/50 bg-orange-500/[0.09]' : 'border-white/10 bg-white/[0.04] hover:border-white/20'}`}>
                  <input type="radio" name="payment" value={m.value} checked={payMethod===m.value}
                    onChange={() => setPayMethod(m.value)} className="accent-orange-500 w-4 h-4" />
                  <span className="text-lg">{m.icon}</span>
                  <span className="text-sm font-medium text-white/80">{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Mã giảm giá */}
          <div className={PANEL}>
            <h2 className="m-0 text-[1.05rem] font-semibold"><Tag size={16} className="inline mr-2"/>Mã giảm giá</h2>
            {walletPromos.length > 0 && <select className={SELECT} value="" onChange={e => { const selected = walletPromos.find(item => String(item.promotion_id) === e.target.value); if (selected) { setPromoCode(selected.code); setPromo(null); setPromoError(''); } }}><option value="">Chọn mã trong ví ưu đãi...</option>{walletPromos.map(item => <option key={item.promotion_id} value={item.promotion_id}>{item.code} — {item.name}</option>)}</select>}
            <div className="flex gap-2">
              <input className={`${INPUT} flex-1`} placeholder="Nhập mã khuyến mãi..."
                value={promoCode} onChange={e => { setPromoCode(e.target.value); setPromo(null); setPromoError(''); }} />
              <button type="button" className={BTN_GHOST} disabled={validatingPromo||!promoCode.trim()} onClick={validatePromo}>
                {validatingPromo?'...':'Áp dụng'}
              </button>
            </div>
            {promo && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-emerald-300 text-sm">
                <span>✓ Áp dụng: <strong>{promo.name}</strong> — giảm {fmtVND(discount)}</span>
                <button type="button" onClick={() => { setPromo(null); setPromoCode(''); }} className="ml-auto text-white/40 hover:text-red-400 cursor-pointer"><X size={14}/></button>
              </div>
            )}
          </div>

          {/* Điểm thưởng */}
          <div className={PANEL}>
            <h2 className="m-0 text-[1.05rem] font-semibold"><span className="mr-2 text-orange-300">★</span>Dùng điểm thưởng</h2>
            <p className="m-0 -mt-3 text-sm text-white/55">Số dư: {loyaltyBalance.toLocaleString('vi-VN')} điểm · 10 điểm đổi 1.000đ</p>
            {loyaltyLoadError && <p className="m-0 -mt-2 text-xs text-amber-200">Chưa tải được số dư điểm; bạn vẫn có thể đặt hàng và thanh toán bình thường.</p>}
            <label className={FIELD}>
              <span>Số điểm muốn dùng (tối đa {maxRedeemablePoints.toLocaleString('vi-VN')})</span>
              <input type="number" min="0" max={maxRedeemablePoints} step="10" className={INPUT}
                value={pointsToRedeem}
                onChange={e => setPointsToRedeem(String(Math.min(maxRedeemablePoints, Math.max(0, Math.floor(Number(e.target.value || 0) / 10) * 10))))} />
            </label>
            {loyaltyDiscount > 0 && <p className="m-0 text-sm text-emerald-300">Dùng {redeemedPoints} điểm, giảm {fmtVND(loyaltyDiscount)}.</p>}
          </div>
        </div>

        {/* Tóm tắt */}
        <div className={`${PANEL} sticky top-4`}>
          <h2 className="m-0 text-[1.05rem] font-semibold">Tóm tắt đơn hàng</h2>
          <dl className="flex flex-col gap-2">
            {items.map(i => (
              <div key={i.variant_id} className="flex justify-between gap-2 text-sm">
                <dt className="text-white/50 truncate">{i.product_name} ({i.size_name}/{i.color_name}) ×{i.quantity}</dt>
                <dd className="m-0 shrink-0 tabular-nums">{fmtVND(i.selling_price*i.quantity)}</dd>
              </div>
            ))}
          </dl>
          <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-white/55">Tạm tính</span>
              <span>{fmtVND(totalAmount)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-emerald-400">
                <span>Giảm giá ({promo?.code})</span>
                <span>-{fmtVND(discount)}</span>
              </div>
            )}
            {loyaltyDiscount > 0 && (
              <div className="flex justify-between text-sm text-emerald-400">
                <span>Đổi {redeemedPoints} điểm</span>
                <span>-{fmtVND(loyaltyDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-white/[0.06]">
              <strong>Tổng thanh toán</strong>
              <strong className="text-xl text-orange-400 tabular-nums">{fmtVND(payableTotal)}</strong>
            </div>
          </div>
          <button type="submit" className={BTN_PRIMARY} disabled={busy || !items.length}>
            {busy ? 'Đang đặt hàng...' : 'Xác nhận đặt hàng'}
          </button>
        </div>
      </form>
    </div>
  );
}
