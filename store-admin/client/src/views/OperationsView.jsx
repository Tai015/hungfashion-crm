import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { fmtVND } from '../utils/formatters';

const ROLE_LABELS = { ADMIN:'Quản trị hệ thống', QL_NHAN_SU:'Quản lý nhân sự', QL_KHO:'Quản lý kho', QL_BAN_HANG:'Quản lý bán hàng', QL_KHACH_HANG:'Quản lý khách hàng', KHACH_HANG:'Khách hàng' };

const OPERATION_CONFIG = {
  employees:  { title:'Danh sách nhân viên', endpoint:'/api/employees', fields:[['employee_id','Mã'],['full_name','Họ tên'],['position','Chức vụ'],['email','Email'],['phone','Điện thoại'],['is_active','Trạng thái']] },
  inventory:  { title:'Theo dõi tồn kho', endpoint:'/api/inventory', fields:[['sku','SKU'],['product_name','Sản phẩm'],['category_name','Danh mục'],['size_name','Size'],['color_name','Màu'],['quantity','Tồn kho']] },
  receipts:   { title:'Phiếu nhập và xuất kho', endpoint:'/api/inventory/receipts', fields:[['receipt_id','Mã phiếu'],['receipt_type','Loại phiếu'],['supplier_name','Nhà cung cấp'],['employee_name','Nhân viên'],['total_amount','Tổng tiền'],['receipt_date','Ngày tạo']] },
  orders:     { title:'Quản lý đơn hàng', endpoint:'/api/orders?limit=100', fields:[['order_id','Mã đơn'],['customer_name','Khách hàng'],['order_channel','Kênh bán'],['total_amount','Tổng tiền'],['order_status','Trạng thái'],['ordered_at','Ngày tạo']] },
  promotions: { title:'Chương trình khuyến mãi', endpoint:'/api/promotions?limit=100', fields:[['code','Mã'],['name','Tên chương trình'],['promo_type','Loại'],['value','Giá trị'],['start_date','Bắt đầu'],['end_date','Kết thúc']] },
};

const SELECT = 'h-9 pl-3 pr-9 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm outline-none appearance-none cursor-pointer focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input';
const BTN_GREEN = 'inline-flex items-center gap-1.5 h-8 px-3 bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-medium rounded-lg cursor-pointer transition-all hover:bg-emerald-500/25';
const TH = 'px-3.5 py-2.5 text-left text-[0.72rem] font-semibold tracking-[0.05em] uppercase text-white/38 border-b border-white/[0.08] whitespace-nowrap';
const TD = 'px-3.5 py-3 border-b border-white/[0.05] text-white/78 align-middle';
const PANEL = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';

const ORDER_STATUSES = ['Pending','Confirmed','Processing','Shipped','Delivered','Cancelled','Refunded'];
const PAYMENT_STATUSES = ['Pending','Paid','Failed','Refunded'];
const EYEBROW_ROLE = { employees:'QL_NHAN_SU', inventory:'QL_KHO', receipts:'QL_KHO', orders:'QL_BAN_HANG', promotions:'QL_BAN_HANG' };

function CounterOrderForm({ onClose, onCreated }) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState({});
  const [lines, setLines] = useState([{ key: 1, productId: '', variantId: '', quantity: 1 }]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch('/api/orders/customers'),
      apiFetch('/api/products?limit=100'),
    ]).then(([customerRows, productResult]) => {
      if (!active) return;
      setCustomers(customerRows);
      setProducts(productResult.data || []);
    }).catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      apiFetch(`/api/orders/customers?search=${encodeURIComponent(customerSearch.trim())}`)
        .then(setCustomers)
        .catch(e => setError(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const loadVariants = async (productId) => {
    if (!productId || variants[productId]) return;
    try {
      const product = await apiFetch(`/api/products/${productId}`);
      setVariants(current => ({ ...current, [productId]: product.variants || [] }));
    } catch (e) { setError(e.message); }
  };

  const updateLine = (key, changes) => setLines(current => current.map(line =>
    line.key === key ? { ...line, ...changes } : line));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!customerId) { setError('Vui lòng chọn khách hàng.'); return; }
    if (!lines.length || lines.some(line => !line.variantId || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1)) {
      setError('Vui lòng chọn biến thể và nhập số lượng hợp lệ cho từng sản phẩm.'); return;
    }
    const overStockLine = lines.find(line => {
      const selectedVariant = variants[line.productId]?.find(variant => String(variant.variant_id) === line.variantId);
      return selectedVariant && Number(line.quantity) > Number(selectedVariant.quantity);
    });
    if (overStockLine) {
      const selectedVariant = variants[overStockLine.productId].find(variant => String(variant.variant_id) === overStockLine.variantId);
      setError(`Số lượng vượt tồn kho hiện tại (${selectedVariant.quantity}). Vui lòng giảm số lượng.`);
      return;
    }
    setBusy(true);
    try {
      const order = await apiFetch('/api/orders', {
        method: 'POST',
        body: {
          order_channel: 'InStore',
          customer_id: Number(customerId),
          payment_method: paymentMethod,
          items: lines.map(line => ({ variant_id: Number(line.variantId), quantity: Number(line.quantity) })),
        },
      });
      onCreated(order);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const inputClass = 'h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm outline-none focus:border-orange-500/50 dark-input';

  return (
    <form onSubmit={submit} className={`${PANEL} mb-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-semibold">Tạo đơn hàng tại quầy</h2>
        <button type="button" className={BTN_GREEN} onClick={onClose}>Đóng</button>
      </div>
      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm text-white/70">
              Tìm khách hàng
              <input className={inputClass} value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Tên, số điện thoại hoặc email" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-white/70">
              Khách hàng <span className="sr-only">(bắt buộc)</span>
              <select required className={`${SELECT} w-full`} value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">Chọn khách hàng</option>
                {customers.map(customer => <option key={customer.customer_id} value={customer.customer_id} style={{ background:'#1a1410', color:'#f5f0eb' }}>{customer.full_name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}
              </select>
              {!customers.length && <span className="text-xs text-white/40">Không tìm thấy khách hàng.</span>}
            </label>
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const productVariants = variants[line.productId] || [];
              return (
                <div key={line.key} className="grid grid-cols-1 md:grid-cols-[1.3fr_1.3fr_120px_auto] gap-2 items-end p-3 bg-white/[0.03] border border-white/[0.08] rounded-xl">
                  <label className="flex flex-col gap-1 text-xs text-white/55">Sản phẩm {index + 1}
                    <select className={`${SELECT} w-full`} value={line.productId} onChange={e => {
                      const productId = e.target.value;
                      updateLine(line.key, { productId, variantId: '' });
                      loadVariants(productId);
                    }}>
                      <option value="">Chọn sản phẩm</option>
                      {products.map(product => <option key={product.product_id} value={product.product_id} style={{ background:'#1a1410', color:'#f5f0eb' }}>{product.product_name} · {fmtVND(product.selling_price)}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-white/55">Biến thể
                    <select className={`${SELECT} w-full`} value={line.variantId} disabled={!line.productId} onChange={e => updateLine(line.key, { variantId: e.target.value })}>
                      <option value="">Chọn size / màu</option>
                      {productVariants.filter(variant => Number(variant.quantity) > 0).map(variant => <option key={variant.variant_id} value={variant.variant_id} style={{ background:'#1a1410', color:'#f5f0eb' }}>{variant.size_name} / {variant.color_name} · còn {variant.quantity}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-white/55">Số lượng
                    <input className={inputClass} type="number" min="1" step="1" value={line.quantity} onChange={e => updateLine(line.key, { quantity: e.target.value })} />
                  </label>
                  <button type="button" className={BTN_GREEN} disabled={lines.length === 1} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>Xóa</button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={BTN_GREEN} onClick={() => setLines(current => [...current, { key: Date.now() + Math.random(), productId: '', variantId: '', quantity: 1 }])}>+ Thêm sản phẩm</button>
            <label className="flex items-center gap-2 text-sm text-white/65">Thanh toán
              <select className={SELECT} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="Cash" style={{ background:'#1a1410', color:'#f5f0eb' }}>Tiền mặt</option>
                <option value="BankTransfer" style={{ background:'#1a1410', color:'#f5f0eb' }}>Chuyển khoản QR</option>
              </select>
            </label>
            <button type="submit" className={BTN_GREEN} disabled={busy}>{busy ? 'Đang tạo đơn...' : 'Tạo đơn hàng'}</button>
          </div>
        </>
      )}
      {error && <p className="m-0 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm" role="alert">{error}</p>}
    </form>
  );
}

export default function OperationsView({ type }) {
  const config = OPERATION_CONFIG[type];
  const [rows, setRows]       = useState([]);
  const [search, setSearch]   = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [paymentLoadingId, setPaymentLoadingId] = useState(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError]     = useState('');

  const load = () => {
    setLoading(true); setError('');
    let url = config.endpoint;
    if (type==='employees') url += `?limit=100&search=${encodeURIComponent(search)}`;
    if (type==='inventory') url += `?search=${encodeURIComponent(search)}${lowStock?'&low_stock=true':''}`;
    apiFetch(url)
      .then(r => setRows(Array.isArray(r) ? r : r.data||[]))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [search, lowStock, type]);

  const updateOrderStatus = async (row, status) => {
    setError('');
    try { await apiFetch(`/api/orders/${row.order_id}/status`, { method:'PATCH', body:{ status } }); load(); }
    catch(e) { setError(e.message); }
  };

  const updatePaymentStatus = async (row, status) => {
    setError(''); setPaymentLoadingId(row.order_id);
    try {
      await apiFetch(`/api/orders/${row.order_id}/payment`, { method:'PATCH', body:{ status } });
      setRows(current => current.map(item => item.order_id === row.order_id ? { ...item, payment_status:status } : item));
    } catch(e) { setError(e.message); }
    finally { setPaymentLoadingId(null); }
  };

  const printInvoice = async row => {
    setError(''); setPdfLoadingId(row.order_id);
    try {
      const order = await apiFetch(`/api/orders/${row.order_id}`);
      const { generateInvoicePDF } = await import('../utils/pdfGenerator');
      await generateInvoicePDF(order);
    }
    catch(e) { setError(e.message); }
    finally { setPdfLoadingId(null); }
  };

  const display = (key, value) => {
    if (value==null||value==='') return '—';
    if (key==='total_amount'||key==='selling_price') return fmtVND(value);
    if (key.endsWith('_at')||key.endsWith('_date')) return new Date(value).toLocaleDateString('vi-VN');
    if (key==='is_active') return value ? 'Đang làm việc' : 'Ngừng hoạt động';
    if (key==='quantity'&&type==='inventory') return (
      <strong className={Number(value)<=5 ? 'text-red-400 font-bold' : 'text-[#f5f0eb]'}>{value}</strong>
    );
    if (key==='order_status') return <StatusBadge status={value}/>;
    return String(value);
  };

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      {/* Header */}
      <div>
        <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">{ROLE_LABELS[EYEBROW_ROLE[type]]||'Hệ thống'}</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">{config.title}</h1>
      </div>

      {/* Search / filter toolbar */}
      {(type==='employees'||type==='inventory') && (
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl">
          <input type="search" className="flex-1 h-9 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 dark-input transition-all"
            placeholder="Nhập từ khóa..." value={search} onChange={e => setSearch(e.target.value)} />
          {type==='inventory' && (
            <label className="flex items-center gap-2 text-sm text-white/55 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={lowStock} onChange={e => setLowStock(e.target.checked)} className="w-4 h-4 accent-orange-500"/>
              Chỉ hiện tồn kho thấp (≤ 5)
            </label>
          )}
        </div>
      )}

      {error && <p className="p-3 px-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</p>}

      {notice && <p className="p-3 px-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-emerald-300 text-sm" role="status">{notice}</p>}

      {type==='orders' && (
        <div>
          {!showCreateOrder
            ? <button type="button" className={BTN_GREEN} onClick={() => { setNotice(''); setShowCreateOrder(true); }}>+ Tạo đơn tại quầy</button>
            : <CounterOrderForm onClose={() => setShowCreateOrder(false)} onCreated={order => {
                setShowCreateOrder(false);
                setNotice(`Đã tạo đơn hàng #${order.order_id}.`);
                load();
              }} />}
        </div>
      )}

      <div className={PANEL}>
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {config.fields.map(([,label]) => <th key={label} className={TH}>{label}</th>)}
                  {type==='orders' && <><th className={TH}>Trạng thái đơn</th><th className={TH}>Thanh toán</th><th className={TH}>Hóa đơn</th></>}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row[config.fields[0][0]]} className="hover:bg-white/[0.04] transition-colors">
                    {config.fields.map(([key]) => <td key={key} className={TD}>{display(key, row[key])}</td>)}
                    {type==='orders' && (
                      <>
                        <td className={TD}>
                          <div className="relative">
                            <select
                              className={SELECT}
                              value={row.order_status}
                              aria-label={`Trạng thái đơn ${row.order_id}`}
                              onChange={e => updateOrderStatus(row, e.target.value)}
                              style={{ backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' }}>
                              {ORDER_STATUSES.map(s => <option key={s} style={{ background:'#1a1410', color:'#f5f0eb' }}>{s}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className={TD}>
                          <select className={SELECT} value={row.payment_status || 'Pending'} disabled={paymentLoadingId===row.order_id || !row.payment_status} aria-label={`Trạng thái thanh toán đơn ${row.order_id}`} onChange={e => updatePaymentStatus(row, e.target.value)}>
                            {PAYMENT_STATUSES.map(status => <option key={status} value={status} style={{ background:'#1a1410', color:'#f5f0eb' }}>{({Pending:'Chờ thanh toán',Paid:'Đã thanh toán',Failed:'Thất bại',Refunded:'Đã hoàn tiền'})[status]}</option>)}
                          </select>
                        </td>
                        <td className={TD}>
                          <button className={BTN_GREEN} disabled={pdfLoadingId===row.order_id} onClick={() => printInvoice(row)}>{pdfLoadingId===row.order_id ? 'Đang tạo...' : 'In PDF'}</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={config.fields.length+(type==='orders'?3:0)} className="py-10 text-center text-white/25 text-sm">Chưa có dữ liệu.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
