import { CheckCircle2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useModalEffects } from '../hooks/useModalEffects';

const fmtVND = value => `${Number(value || 0).toLocaleString('vi-VN')}đ`;

export default function PaymentSuccessModal({ order, onClose, onViewOrders }) {
  useModalEffects(Boolean(order), onClose);
  if (!order) return null;

  return createPortal(
    <div className="customer-portal-modal fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="payment-success-title" className="customer-portal-modal-surface relative flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-emerald-400/25 p-7 text-center text-[#f5f0eb] shadow-2xl">
        <button type="button" aria-label="Đóng thông báo" onClick={onClose} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-white/60 hover:bg-white/10"><X size={16}/></button>
        <span className="grid h-16 w-16 place-items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-400"><CheckCircle2 size={36}/></span>
        <div>
          <h2 id="payment-success-title" className="m-0 text-2xl font-bold">Thanh toán thành công!</h2>
          <p className="mb-0 mt-2 text-sm text-white/55">Đơn hàng #{order.order_id} đã được xác nhận thanh toán.</p>
          <p className="mb-0 mt-1 font-semibold text-orange-300">{fmtVND(order.payment?.amount ?? order.total_amount)}</p>
        </div>
        <button type="button" onClick={onViewOrders || onClose} className="mt-1 h-11 w-full rounded-xl border border-emerald-400/30 bg-emerald-500/15 font-semibold text-emerald-200 transition hover:bg-emerald-500/25">Xem đơn hàng</button>
      </section>
    </div>,
    document.body,
  );
}
