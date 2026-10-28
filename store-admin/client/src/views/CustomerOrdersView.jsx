import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Package, XCircle } from 'lucide-react';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';
import { confirmDestructiveAction } from '../utils/confirmAction';

const fmtVND  = n => Number(n).toLocaleString('vi-VN') + 'đ';
const fmtDate = v => v ? new Date(v).toLocaleString('vi-VN') : '—';

const STATUS_LABEL = {
  Pending:'Chờ xác nhận', Confirmed:'Đã xác nhận', Processing:'Đang xử lý',
  Shipped:'Đang giao', Delivered:'Đã giao', Cancelled:'Đã hủy', Refunded:'Đã hoàn tiền',
};
const STATUS_COLOR = {
  Pending:   'bg-amber-500/15 text-amber-400 border-amber-500/25',
  Confirmed: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  Processing:'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  Shipped:   'bg-blue-500/15 text-blue-400 border-blue-500/25',
  Delivered: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  Cancelled: 'bg-red-500/15 text-red-400 border-red-500/25',
  Refunded:  'bg-slate-500/15 text-slate-400 border-slate-500/25',
};

const PANEL = 'flex flex-col gap-4 p-5 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';
const BTN_GHOST = 'inline-flex items-center gap-1.5 h-9 px-4 bg-white/[0.07] border border-white/15 text-white/65 text-sm font-medium rounded-xl transition-all hover:bg-white/[0.12] hover:text-white/90 cursor-pointer disabled:opacity-50';

const LIMIT = 8;

function StatusPill({ status }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLOR[status]||'bg-slate-500/15 text-slate-400 border-slate-500/25'}`}>{STATUS_LABEL[status]||status}</span>;
}

function OrderDetail({ orderId, onBack }) {
  const [order, setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg]       = useState('');
  const [qrError, setQrError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/orders/mine/${orderId}`)
      .then(setOrder).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [orderId]);

  const cancel = async () => {
    const confirmed = await confirmDestructiveAction({
      title: 'Hủy đơn hàng?',
      text: 'Bạn có chắc muốn hủy đơn hàng này không?',
      confirmText: 'Hủy đơn hàng',
    });
    if (!confirmed) return;
    setCancelling(true); setError(''); setMsg('');
    try {
      await apiFetch(`/api/orders/${orderId}/status`, { method:'PATCH', body:{ status:'Cancelled' } });
      setOrder(o => ({
        ...o,
        order_status:'Cancelled',
        payment: o.payment?.status === 'Pending' ? { ...o.payment, status:'Failed' } : o.payment,
      }));
      setMsg('Đơn hàng đã được hủy.');
    } catch(e) { setError(e.message); }
    finally { setCancelling(false); }
  };

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div className="flex items-center gap-3">
        <button className={BTN_GHOST} onClick={onBack}><ChevronLeft size={15}/> Danh sách đơn</button>
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Chi tiết</p>
          <h1 className="m-0 mt-0.5 text-[1.5rem] font-bold">Đơn hàng #{orderId}</h1>
        </div>
      </div>
      {error && <p className="p-3 px-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</p>}
      {msg   && <p className="p-3 px-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm">{msg}</p>}
      {loading ? <Spinner /> : order && (
        <>
          <div className={PANEL}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <StatusPill status={order.order_status}/>
                  {order.promo_code && <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">{order.promo_code}</span>}
                </div>
                <p className="m-0 text-white/40 text-sm">Đặt lúc {fmtDate(order.ordered_at)}</p>
                {order.shipping_address && <p className="m-0 text-white/50 text-sm">📍 {order.shipping_address}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="m-0 text-white/40 text-xs">Tổng thanh toán</p>
                <strong className="text-2xl font-bold text-orange-400 tabular-nums">{fmtVND(order.total_amount)}</strong>
                {order.discount_amt > 0 && <p className="m-0 text-emerald-400 text-sm">Đã giảm {fmtVND(order.discount_amt)}</p>}
              </div>
            </div>
            {order.order_status === 'Pending' && (
              <div>
                <button className="inline-flex items-center gap-1.5 h-9 px-4 bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-medium rounded-xl transition-all hover:bg-red-500/25 cursor-pointer disabled:opacity-50"
                  disabled={cancelling} onClick={cancel}>
                  <XCircle size={15}/> {cancelling?'Đang hủy...':'Hủy đơn hàng'}
                </button>
              </div>
            )}
          </div>

          {/* Danh sách sản phẩm */}
          <div className={PANEL}>
            <h2 className="m-0 text-[1.05rem] font-semibold">Sản phẩm đã đặt</h2>
            <div className="flex flex-col gap-0">
              {(order.details||[]).map((d, idx) => (
                <div key={d.detail_id} className={`flex items-center gap-4 py-3.5 ${idx < (order.details?.length||0)-1 ? 'border-b border-white/[0.06]' : ''}`}>
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/[0.07] shrink-0">
                    {d.image_url
                      ? <img src={d.image_url} alt={d.product_name} className="w-full h-full object-cover"/>
                      : <div className="w-full h-full flex items-center justify-center"><Package size={16} className="text-white/30"/></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <strong className="text-sm font-semibold truncate block">{d.product_name}</strong>
                    <p className="m-0 text-white/40 text-xs">{d.size_name} · {d.color_name} · SKU: {d.sku}</p>
                    <p className="m-0 text-white/50 text-sm">{fmtVND(d.unit_price)} × {d.quantity}</p>
                  </div>
                  <strong className="text-[#f5f0eb] tabular-nums shrink-0">{fmtVND(d.subtotal||d.unit_price*d.quantity)}</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Thanh toán */}
          {order.payment && (
            <div className={PANEL}>
              <h2 className="m-0 text-[1.05rem] font-semibold">Thông tin thanh toán</h2>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-white/45">Phương thức</dt><dd className="m-0 font-medium">{order.payment.method==='BankTransfer'?'Chuyển khoản QR':order.payment.method==='Cash'?'Tiền mặt khi nhận':'Phương thức khác'}</dd>
                <dt className="text-white/45">Trạng thái</dt><dd className="m-0"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${order.payment.status==='Paid'?'bg-emerald-500/15 text-emerald-400':order.payment.status==='Pending'?'bg-amber-500/15 text-amber-400':'bg-slate-500/15 text-slate-400'}`}>{({ Paid:'Đã thanh toán', Pending:'Chờ thanh toán', Failed:'Thanh toán chưa hoàn tất', Refunded:'Đã hoàn tiền' })[order.payment.status] || order.payment.status}</span></dd>
                <dt className="text-white/45">Số tiền</dt><dd className="m-0 tabular-nums font-bold text-orange-400">{fmtVND(order.payment.amount)}</dd>
              </dl>
              {order.payment.method==='BankTransfer' && order.payment.status==='Pending' && (
                <div className="flex flex-col items-center gap-3 border-t border-white/[0.08] pt-4">
                  <p className="m-0 text-white/55 text-sm">Quét mã QR để thanh toán đơn hàng này</p>
                  {order.payment.payment_instructions ? (
                    <>
                      {qrError
                        ? <p className="m-0 text-red-300 text-sm" role="alert">{qrError}</p>
                        : <img
                            src={order.payment.payment_instructions.qr_url}
                            alt="QR thanh toán"
                            className="w-52 h-52 rounded-xl bg-white p-2"
                            onError={() => setQrError('Không tải được mã QR. Bạn có thể chuyển khoản thủ công theo thông tin bên dưới.')}
                          />}
                      <div className="text-center text-white/50 text-xs">
                        <p className="m-0">{order.payment.payment_instructions.bank_id} · {order.payment.payment_instructions.account_number}</p>
                        <p className="m-0">{order.payment.payment_instructions.account_name}</p>
                        <p className="m-0 mt-1 text-orange-400 font-semibold">Nội dung: {order.payment.payment_instructions.transfer_content}</p>
                      </div>
                    </>
                  ) : <p className="m-0 text-red-300 text-sm" role="alert">Máy chủ chưa có thông tin nhận chuyển khoản. Vui lòng liên hệ cửa hàng.</p>}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CustomerOrdersView() {
  const [orders, setOrders]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = () => {
    setLoading(true); setError('');
    apiFetch(`/api/orders/mine?page=${page}&limit=${LIMIT}`)
      .then(r => { setOrders(r.data||[]); setTotal(r.total||0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [page]);

  if (selectedId) {
    return <OrderDetail orderId={selectedId} onBack={() => { setSelectedId(null); load(); }}/>;
  }

  const totalPages = Math.ceil(total/LIMIT)||1;

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div>
        <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Tài khoản</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Đơn hàng của tôi</h1>
      </div>

      {error && <p className="p-3 px-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</p>}

      {loading ? <Spinner /> : (
        orders.length ? (
          <div className="flex flex-col gap-3">
            {orders.map(o => (
              <button key={o.order_id} type="button"
                className="flex items-center justify-between gap-4 p-4 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl text-left transition-all hover:bg-white/[0.09] hover:border-white/20 cursor-pointer w-full"
                onClick={() => setSelectedId(o.order_id)}>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-[#f5f0eb] font-semibold">Đơn #{o.order_id}</strong>
                    <StatusPill status={o.order_status}/>
                    {o.promo_code && <span className="text-xs text-emerald-400">Mã: {o.promo_code}</span>}
                  </div>
                  <p className="m-0 text-white/40 text-xs">{fmtDate(o.ordered_at)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <strong className="text-orange-400 font-bold tabular-nums text-base">{fmtVND(o.total_amount)}</strong>
                  <ChevronRight size={16} className="text-white/30"/>
                </div>
              </button>
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button className="grid w-9 h-9 place-items-center border border-white/10 rounded-xl bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={page<=1} onClick={() => setPage(p => p-1)}><ChevronLeft size={15}/></button>
                <span className="text-white/40 text-sm tabular-nums">Trang {page} / {totalPages}</span>
                <button className="grid w-9 h-9 place-items-center border border-white/10 rounded-xl bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={page>=totalPages} onClick={() => setPage(p => p+1)}><ChevronRight size={15}/></button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-white/30 gap-3">
            <Package size={56} className="opacity-30"/>
            <p className="text-base font-medium">Bạn chưa có đơn hàng nào</p>
          </div>
        )
      )}
    </div>
  );
}
