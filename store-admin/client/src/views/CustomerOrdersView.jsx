import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquareText, Package, Printer, Search, XCircle } from 'lucide-react';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';
import FilterPopover from '../components/FilterPopover';
import DatePicker from '../components/DatePicker';
import { confirmDestructiveAction } from '../utils/confirmAction';
import { useSweetAlertMessages } from '../utils/notifications';
import PaymentCountdown from '../components/PaymentCountdown';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../utils/viLabels';

const fmtVND  = n => Number(n).toLocaleString('vi-VN') + 'đ';
const fmtDate = v => v ? new Date(v).toLocaleString('vi-VN') : '—';

const STATUS_LABEL = ORDER_STATUS_LABELS;
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

const LIMIT = 20;

function StatusPill({ status }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLOR[status]||'bg-slate-500/15 text-slate-400 border-slate-500/25'}`}>{STATUS_LABEL[status]||status}</span>;
}

function OrderDetail({ orderId, onBack, onReviewProduct }) {
  const [order, setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError]   = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg]       = useState('');
  const [qrError, setQrError] = useState('');
  const [demoQr, setDemoQr] = useState('');
  const [demoQrLoading, setDemoQrLoading] = useState(false);
  const [demoQrError, setDemoQrError] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const demoQrRequestedRef = useRef(null);
  useSweetAlertMessages({ error, success: msg, warning: qrError });

  useEffect(() => {
    let active = true;
    setOrder(null);
    setLoading(true);
    setError('');
    apiFetch(`/api/orders/mine/${orderId}`)
      .then(latest => {
        if (!active) return;
        setOrder(latest);
      })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) { setLoading(false); setHasLoadedOnce(true); } });
    return () => { active = false; };
  }, [orderId]);

  useEffect(() => {
    if (!order?.demo_payment_enabled || order.payment?.method !== 'BankTransfer'
      || order.payment.status !== 'Pending' || order.payment.payment_instructions?.demo_url
      || demoQrRequestedRef.current === orderId) return undefined;
    demoQrRequestedRef.current = orderId;
    let active = true;
    setDemoQrLoading(true);
    apiFetch(`/api/orders/mine/${orderId}/demo-payment-token`, { method: 'POST' })
      .then(result => {
        if (!active) return;
        setOrder(current => current ? {
          ...current,
          payment_expires_at: result.payment_expires_at,
          payment: { ...current.payment, payment_instructions: result.payment_instructions },
        } : current);
        setDemoQrError('');
      })
      .catch(error => { if (active) setDemoQrError(error.message || 'Không thể tạo mã QR thanh toán.'); })
      .finally(() => { if (active) setDemoQrLoading(false); });
    return () => { active = false; };
  }, [demoQrRequestedRef, order?.demo_payment_enabled, order?.payment?.method,
    order?.payment?.status, order?.payment?.payment_instructions?.demo_url, orderId]);

  useEffect(() => {
    const demoUrl = order?.payment?.payment_instructions?.demo_url;
    if (!demoUrl) { setDemoQr(''); return undefined; }
    let active = true;
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(demoUrl, { width: 280, margin: 2, errorCorrectionLevel: 'M' }))
      .then(dataUrl => { if (active) setDemoQr(dataUrl); })
      .catch(() => { if (active) setDemoQrError('Không tạo được mã QR thanh toán.'); });
    return () => { active = false; };
  }, [order?.payment?.payment_instructions?.demo_url]);

  useEffect(() => {
    if (order?.payment?.method !== 'BankTransfer' || order.payment.status !== 'Pending') return undefined;
    let active = true;
    let inFlight = false;
    const checkPayment = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const latest = await apiFetch(`/api/orders/mine/${orderId}`);
        if (!active) return;
        setOrder(current => ({
          ...latest,
          payment: {
            ...latest.payment,
            payment_instructions: latest.payment?.payment_instructions
              || current?.payment?.payment_instructions,
          },
        }));
      } catch { /* Poll again on the next interval. */ }
      finally { inFlight = false; }
    };
    const timer = setInterval(checkPayment, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [order?.payment?.method, order?.payment?.status, orderId]);

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

  const printInvoice = async () => {
    if (!order || invoiceLoading) return;
    setInvoiceLoading(true);
    setError('');
    try {
      const { generateInvoicePDF } = await import('../utils/pdfGenerator');
      await generateInvoicePDF(order);
    } catch (e) {
      setError(e.message || 'Không thể tạo hóa đơn.');
    } finally {
      setInvoiceLoading(false);
    }
  };

  return (
    <div className={`customer-order-detail flex flex-col gap-5 text-[#f5f0eb]${hasLoadedOnce ? ' app-page-enter' : ''}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button className={BTN_GHOST} onClick={onBack}><ChevronLeft size={15}/> Danh sách đơn</button>
          <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Chi tiết</p>
          <h1 className="m-0 mt-0.5 text-[1.5rem] font-bold">Đơn hàng #{orderId}</h1>
          </div>
        </div>
        <button type="button" className={BTN_GHOST} disabled={loading || !order || invoiceLoading} onClick={printInvoice}>
          <Printer size={15}/> {invoiceLoading ? 'Đang tạo PDF…' : 'In hóa đơn'}
        </button>
      </div>
      {loading ? <Spinner /> : order && (
        <>
          <div className={`${PANEL} customer-order-panel`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <StatusPill status={order.order_status}/>
                  {order.promo_code && <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">{order.promo_code}</span>}
                </div>
                <p className="m-0 text-white/40 text-sm">Đặt lúc {fmtDate(order.ordered_at)}</p>
                {order.shipping_address && <p className="m-0 text-white/50 text-sm"><span className="font-semibold text-white/70">Địa chỉ:</span> {order.shipping_address}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="m-0 text-white/40 text-xs">Tổng thanh toán</p>
                <strong className="text-2xl font-bold text-orange-400 tabular-nums">{fmtVND(order.total_amount)}</strong>
                {order.discount_amt > 0 && <p className="m-0 text-emerald-400 text-sm">Đã giảm {fmtVND(order.discount_amt)}</p>}
                {order.loyalty_points_redeemed > 0 && <p className="m-0 text-white/45 text-xs">Đã dùng {order.loyalty_points_redeemed} điểm</p>}
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
          <div className={`${PANEL} customer-order-panel`}>
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
                    <p className="m-0 text-white/40 text-xs">{d.variant_label || [d.size_name, d.color_name].filter(Boolean).join(' · ') || 'Mặc định'} · SKU: {d.sku || '—'}</p>
                    <p className="m-0 text-white/50 text-sm">{fmtVND(d.unit_price)} × {d.quantity}</p>
                  </div>
                  <strong className="text-[#f5f0eb] tabular-nums shrink-0">{fmtVND(d.subtotal||d.unit_price*d.quantity)}</strong>
                  {order.order_status === 'Delivered' && (
                    <button type="button" className={BTN_GHOST}
                      onClick={() => onReviewProduct?.({ product_id:d.product_id, product_name:d.product_name, image_url:d.image_url, order_id:order.order_id })}>
                      <MessageSquareText size={14}/> Đánh giá
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Thanh toán */}
          {order.payment && (
            <div className={`${PANEL} customer-order-panel`}>
              <h2 className="m-0 text-[1.05rem] font-semibold">Thông tin thanh toán</h2>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-white/45">Phương thức</dt><dd className="m-0 font-medium">{order.payment.method==='BankTransfer'?'Chuyển khoản QR':order.payment.method==='Cash'?'Tiền mặt khi nhận':'Phương thức khác'}</dd>
                <dt className="text-white/45">Trạng thái</dt><dd className="m-0"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${order.payment.status==='Paid'?'bg-emerald-500/15 text-emerald-400':order.payment.status==='Pending'?'bg-amber-500/15 text-amber-400':'bg-slate-500/15 text-slate-400'}`}>{PAYMENT_STATUS_LABELS[order.payment.status] || order.payment.status}</span></dd>
                <dt className="text-white/45">Số tiền</dt><dd className="m-0 tabular-nums font-bold text-orange-400">{fmtVND(order.payment.amount)}</dd>
              </dl>
              {order.payment.method==='BankTransfer' && order.payment.status==='Pending' && (
                <div className="flex flex-col items-center gap-3 border-t border-white/[0.08] pt-4">
                  <p className="m-0 text-white/55 text-sm">Quét mã QR để thanh toán đơn hàng này</p>
                  {order.payment.payment_instructions?.demo_url && <span className="rounded-full border border-orange-400/30 bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-300">Thanh toán mô phỏng · không phát sinh giao dịch thật</span>}
                  <PaymentCountdown expiresAt={order.payment_expires_at} />
                  {order.payment.payment_instructions ? (
                    <>
                      {order.payment.payment_instructions.demo_url
                        ? demoQr ? <img src={demoQr} alt="Mã QR thanh toán" className="h-52 w-52 rounded-xl bg-white p-2" />
                          : <div className="grid h-52 w-52 place-items-center rounded-xl bg-white text-sm text-slate-500">Đang tạo mã QR…</div>
                        : qrError
                        ? <div className="w-56 h-56" aria-hidden="true" />
                        : <img
                            src={order.payment.payment_instructions.qr_url}
                            alt="QR thanh toán"
                            className="w-52 h-52 rounded-xl bg-white p-2"
                            onError={() => setQrError('Không tải được mã QR. Bạn có thể chuyển khoản thủ công theo thông tin bên dưới.')}
                          />}
                      <div className="text-center text-white/50 text-xs">
                        {!order.payment.payment_instructions.demo_url && <>
                          <p className="m-0">{order.payment.payment_instructions.bank_id} · {order.payment.payment_instructions.account_number}</p>
                          <p className="m-0">{order.payment.payment_instructions.account_name}</p>
                          <p className="m-0 mt-1 text-orange-400 font-semibold">Nội dung: {order.payment.payment_instructions.transfer_content}</p>
                        </>}
                      </div>
                    </>
                  ) : order.demo_payment_enabled
                    ? <div className="text-center text-sm text-white/55">{demoQrLoading ? 'Đang tạo mã QR…' : demoQrError || 'Đang chuẩn bị mã QR thanh toán.'}</div>
                    : <p className="m-0 text-white/55 text-sm">Thông tin chuyển khoản chưa sẵn sàng. Vui lòng liên hệ cửa hàng.</p>}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CustomerOrdersView({ onReviewProduct }) {
  const [orders, setOrders]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError]     = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  useSweetAlertMessages({ error });
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const load = useCallback(() => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (searchQuery) params.set('search', searchQuery);
    if (statusFilter) params.set('status', statusFilter);
    if (paymentFilter) params.set('payment_status', paymentFilter);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    apiFetch(`/api/orders/mine?${params}`)
      .then(r => { setOrders(r.data||[]); setTotal(r.total||0); })
      .catch(e => setError(e.message))
      .finally(() => { setLoading(false); setHasLoadedOnce(true); });
  }, [page, searchQuery, statusFilter, paymentFilter, fromDate, toDate]);
  useEffect(() => { load(); }, [load]);

  const hasAwaitingTransfer = orders.some(order =>
    order.payment_method === 'BankTransfer' && ['Pending', 'Failed'].includes(order.payment_status)
    && order.order_status === 'Pending');
  useEffect(() => {
    if (!hasAwaitingTransfer) return undefined;
    let active = true;
    const refreshStatuses = async () => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
        if (searchQuery) params.set('search', searchQuery);
        if (statusFilter) params.set('status', statusFilter);
        if (paymentFilter) params.set('payment_status', paymentFilter);
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
        const result = await apiFetch(`/api/orders/mine?${params}`);
        if (active) {
          setOrders(result.data || []);
          setTotal(result.total || 0);
        }
      } catch { /* Keep the current list and retry on the next interval. */ }
    };
    const timer = window.setInterval(refreshStatuses, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [hasAwaitingTransfer, page, searchQuery, statusFilter, paymentFilter, fromDate, toDate]);

  if (selectedId) {
    return <OrderDetail orderId={selectedId} onBack={() => { setSelectedId(null); load(); }} onReviewProduct={onReviewProduct}/>;
  }

  const totalPages = Math.ceil(total/LIMIT)||1;

  return (
    <div className={`customer-orders-view flex flex-col gap-5 text-[#f5f0eb]${hasLoadedOnce ? ' app-page-enter' : ''}`}>
      <div>
        <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Tài khoản</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Đơn hàng của tôi</h1>
      </div>

      <div className="customer-orders-filter-bar flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
        <label className="customer-orders-search flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.07] px-3 text-white/45 transition-colors focus-within:border-orange-500/50">
          <Search size={16} className="shrink-0"/>
          <input type="search" value={searchTerm} maxLength={100}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Tìm mã đơn, tên sản phẩm hoặc SKU..."
            aria-label="Tìm đơn hàng theo mã, sản phẩm hoặc SKU"
            className="customer-orders-search-input h-full min-w-0 flex-1 bg-transparent text-sm text-[#f5f0eb] outline-none placeholder:text-white/30" />
        </label>
        <FilterPopover portalTheme title="Lọc đơn hàng" activeCount={[statusFilter, paymentFilter, fromDate, toDate].filter(Boolean).length}
          onClear={() => { setPage(1); setStatusFilter(''); setPaymentFilter(''); setFromDate(''); setToDate(''); }}>
          <label className="flex flex-col gap-1.5 text-xs text-white/65">Trạng thái đơn
            <select className="h-10 w-full rounded-xl border border-white/15 bg-[#1a1410] px-3 text-sm text-white outline-none focus:border-orange-500/50"
              value={statusFilter} onChange={event => { setPage(1); setStatusFilter(event.target.value); }}>
              <option value="">Tất cả trạng thái</option>
              <option value="Pending">Chờ xác nhận</option><option value="Confirmed">Đã xác nhận</option>
              <option value="Processing">Đang xử lý</option><option value="Shipped">Đang giao hàng</option>
              <option value="Delivered">Đã giao hàng</option><option value="Cancelled">Đã hủy</option>
              <option value="Refunded">Đã hoàn tiền</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-white/65">Thanh toán
            <select className="h-10 w-full rounded-xl border border-white/15 bg-[#1a1410] px-3 text-sm text-white outline-none focus:border-orange-500/50"
              value={paymentFilter} onChange={event => { setPage(1); setPaymentFilter(event.target.value); }}>
              <option value="">Mọi trạng thái</option><option value="Pending">Chờ thanh toán</option>
              <option value="Paid">Đã thanh toán</option><option value="Failed">Thất bại</option>
              <option value="Refunded">Đã hoàn tiền</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5 text-xs text-white/65">Từ ngày
              <DatePicker value={fromDate} max={toDate || undefined}
                onChange={value => { setPage(1); setFromDate(value); }}
                placeholder="Chọn ngày bắt đầu" ariaLabel="Từ ngày"
                portalPopover
                className="h-10 min-w-0 rounded-xl border border-white/15 bg-[#1a1410] px-3 text-sm text-white outline-none focus:border-orange-500/50" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-white/65">Đến ngày
              <DatePicker value={toDate} min={fromDate || undefined}
                onChange={value => { setPage(1); setToDate(value); }}
                placeholder="Chọn ngày kết thúc" ariaLabel="Đến ngày"
                portalPopover
                className="h-10 min-w-0 rounded-xl border border-white/15 bg-[#1a1410] px-3 text-sm text-white outline-none focus:border-orange-500/50" />
            </label>
          </div>
        </FilterPopover>
      </div>

      {loading ? <Spinner /> : (
        orders.length ? (
          <div key={page} className="app-page-enter flex flex-col gap-3">
            {orders.map(o => (
              <button key={o.order_id} type="button"
              className="customer-order-card flex items-center justify-between gap-4 p-4 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl text-left transition-all hover:bg-white/[0.09] hover:border-white/20 cursor-pointer w-full"
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
            <p className="text-base font-medium">{statusFilter || paymentFilter || searchQuery || fromDate || toDate ? 'Không tìm thấy đơn hàng phù hợp' : 'Bạn chưa có đơn hàng nào'}</p>
          </div>
        )
      )}
    </div>
  );
}
