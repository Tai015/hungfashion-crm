import { Fragment, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useModalEffects } from '../hooks/useModalEffects';
import { ChevronLeft, ChevronRight, LockKeyhole, Pencil, Trash2, UnlockKeyhole, UserPlus, Search, X, Clock3, ChevronDown, ChevronUp } from 'lucide-react';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';
import FilterPopover from '../components/FilterPopover';
import { confirmDestructiveAction } from '../utils/confirmAction';
import { useSweetAlertMessages } from '../utils/notifications';
import { CUSTOMER_GENDER_LABELS, CUSTOMER_TIER_LABELS } from '../utils/viLabels';

const formatAge = age => Number.isInteger(age) && age >= 0 ? `${age} tuổi` : 'Chưa cập nhật';
const GENDERS = [['','Tất cả'],['Female','Nữ'],['Male','Nam'],['Other','Khác']];
const EMPTY   = { full_name:'', phone:'', email:'', address:'', gender:'Other', date_of_birth:'' };
const LIMIT   = 20;

const INPUT  = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-violet-400/60 focus:bg-white/10 focus:ring-2 focus:ring-violet-400/[0.15] transition-all dark-input';
const SELECT = INPUT + ' cursor-pointer';
const BTN_PRIMARY = 'inline-flex items-center gap-1.5 h-9 px-4 bg-gradient-to-br from-violet-500 to-purple-600 border border-violet-300/30 text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_rgba(124,58,237,0.3)] hover:shadow-[0_10px_26px_rgba(124,58,237,0.45)] hover:-translate-y-px transition-all disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer';
const BTN_GHOST   = 'inline-flex items-center gap-1.5 h-9 px-4 bg-white/[0.07] border border-white/15 text-white/65 text-sm font-medium rounded-xl transition-all hover:bg-white/[0.12] hover:text-white/90 cursor-pointer';
const PANEL  = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';
const ICON_BTN = 'grid w-8 h-8 place-items-center border border-white/10 rounded-[9px] bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] hover:text-white/90 hover:border-white/22';

function PageBar({ page, total, limit, onChange }) {
  const pages = Math.ceil(total/limit) || 1;
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-4 border-t border-white/[0.06]">
      <button className={`${ICON_BTN} disabled:opacity-30 disabled:cursor-not-allowed`} disabled={page===1} onClick={() => onChange(page-1)}><ChevronLeft size={15}/></button>
      <span className="text-white/40 text-sm tabular-nums">Trang {page} / {pages}</span>
      <button className={`${ICON_BTN} disabled:opacity-30 disabled:cursor-not-allowed`} disabled={page>=pages} onClick={() => onChange(page+1)}><ChevronRight size={15}/></button>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="flex flex-col gap-1.5 text-white/65 text-sm font-medium">{label && <span>{label}</span>}{children}</label>;
}

function CustomerModal({ customer, onClose, onSaved }) {
  useModalEffects(true, onClose);
  const isEdit = Boolean(customer);
  const [form, setForm] = useState(customer
    ? { full_name:customer.full_name||'', phone:customer.phone||'', email:customer.email||'', address:customer.address||'', gender:customer.gender||'Other', date_of_birth:customer.date_of_birth ? String(customer.date_of_birth).slice(0,10) : '' }
    : EMPTY);
  const [interestText, setInterestText] = useState('');
  const [detailsLoading, setDetailsLoading] = useState(Boolean(customer));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useSweetAlertMessages({ error });
  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    apiFetch('/api/customers/' + customer.customer_id)
      .then(details => {
        if (!active) return;
        setForm(current => ({ ...current, address:details.address || '' }));
        setInterestText((details.interests || []).join(', '));
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setDetailsLoading(false); });
    return () => { active = false; };
  }, [customer?.customer_id, isEdit]);
  const save = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (form.date_of_birth) {
        const birthDate = new Date(`${form.date_of_birth}T00:00:00`);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age -= 1;
        if (Number.isNaN(birthDate.getTime()) || birthDate > new Date(today.getFullYear(), today.getMonth(), today.getDate()) || age < 0 || age > 120) {
          throw new Error('Ngày sinh không hợp lệ. Tuổi khách hàng phải từ 0 đến 120.');
        }
      }
      const interests = [...new Set(interestText.split(',').map(value => value.trim()).filter(Boolean))];
      const payload = { ...form, gender:form.gender || 'Other', interests };
      if (isEdit) await apiFetch(`/api/customers/${customer.customer_id}`, { method:'PUT', body:payload });
      else await apiFetch('/api/customers', { method:'POST', body:payload });
      onSaved();
    }
    catch(err) { setError(err.message); } finally { setBusy(false); }
  };
  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 backdrop-blur-md p-5" onClick={onClose}>
      <motion.div initial={{ scale:0.94, opacity:0 }} animate={{ scale:1, opacity:1 }}
        exit={{ scale:0.94, opacity:0 }} transition={{ duration:0.18 }}
        className="popup-surface w-full max-w-[600px] p-7 border border-white/[0.16] rounded-3xl bg-[rgba(32,27,48,0.97)] shadow-[0_32px_80px_rgba(0,0,0,0.65)] text-[#f5f0eb]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-white/[0.08]">
          <h2 className="m-0 text-[1.1rem] font-bold">{isEdit ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng mới'}</h2>
          <button className="grid w-[34px] h-[34px] place-items-center border border-white/12 rounded-[9px] bg-white/[0.05] text-white/50 cursor-pointer transition-all hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400" onClick={onClose}><X size={16}/></button>
        </div>
        <form onSubmit={save} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Họ tên *"><input required maxLength={150} placeholder="Nguyễn Văn A" className={INPUT} value={form.full_name} onChange={e => setForm({...form, full_name:e.target.value})} /></Field>
            <Field label="Số điện thoại"><input type="tel" maxLength={30} placeholder="09xxxxxxxx" className={INPUT} value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} /></Field>
            <Field label="Email *"><input required type="email" maxLength={150} placeholder="email@example.com" className={INPUT} value={form.email} onChange={e => setForm({...form, email:e.target.value})} /></Field>
            <Field label="Ngày sinh (không bắt buộc)"><input type="date" max={new Date().toISOString().slice(0,10)} className={INPUT} value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth:e.target.value})} /></Field>
            <Field label="Giới tính">
              <select className={SELECT} value={form.gender} onChange={e => setForm({...form, gender:e.target.value})}>
                <option value="Other">Khác</option>
                <option value="Female">Nữ</option><option value="Male">Nam</option>
              </select>
            </Field>
            <Field label="Địa chỉ">
              <input maxLength={255} placeholder="Số nhà, đường, phường/xã, tỉnh/thành" className={INPUT} value={form.address} onChange={e => setForm({...form, address:e.target.value})} />
            </Field>
            <Field label="Sở thích (phân cách bằng dấu phẩy)">
              <input maxLength={2000} placeholder="Áo thun, Quần jean, Phụ kiện..." className={INPUT} value={interestText} onChange={e => setInterestText(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
            <button type="button" className={BTN_GHOST} onClick={onClose}>Hủy</button>
            <button type="submit" className={`${BTN_PRIMARY} admin-primary-action`} disabled={busy || detailsLoading}>{detailsLoading ? 'Đang tải...' : busy ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : <><UserPlus size={14}/> Thêm khách hàng</>}</button>
          </div>
        </form>
      </motion.div>
    </div>
  ), document.body);
}

const TIERS = ['New', 'Regular', 'Silver', 'Gold', 'VIP'];
const TIER_COLOR = { New:'#64748b', Regular:'#0ea5e9', Silver:'#94a3b8', Gold:'#f59e0b', VIP:'#a855f7' };

function CustomerInteractionHistory({ customerId }) {
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [olderCursor, setOlderCursor] = useState(null);
  const [includeOlder, setIncludeOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setOrdersLoading(true);
    setOrdersError('');
    apiFetch('/api/customers/' + customerId + '/orders')
      .then(result => { if (active) setOrders(result || []); })
      .catch(err => { if (active) setOrdersError(err.message); })
      .finally(() => { if (active) setOrdersLoading(false); });
    setLoading(true);
    setError('');
    setItems([]);
    setNextCursor(null);
    setOlderCursor(null);
    setIncludeOlder(false);
    apiFetch('/api/customers/' + customerId + '/interactions?limit=20')
      .then(result => {
        if (!active) return;
        setItems(result.data || []);
        setNextCursor(result.nextCursor);
        setOlderCursor(result.olderCursor);
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customerId]);

  const loadMore = async (older = false) => {
    const cursor = older ? olderCursor : nextCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const all = older || includeOlder;
      const query = new URLSearchParams({ limit: '20', cursor });
      if (all) query.set('all', '1');
      const result = await apiFetch('/api/customers/' + customerId + '/interactions?' + query);
      setItems(current => [...current, ...(result.data || [])]);
      setNextCursor(result.nextCursor);
      setOlderCursor(result.olderCursor);
      if (older) setIncludeOlder(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const dateFormatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="px-5 py-4 bg-white/[0.035] border-t border-white/[0.08]">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-white/85">
        <Clock3 size={15} className="text-violet-300" />
        Lịch sử tương tác
        <span className="text-xs font-normal text-white/35">({includeOlder ? 'Toàn bộ thời gian' : '12 tháng gần nhất'})</span>
      </div>
      {loading ? <div className="py-5 text-center text-sm text-white/45">Đang tải lịch sử...</div>
        : error && !items.length ? <p className="py-3 text-sm text-rose-300">{error}</p>
        : !items.length ? <p className="py-3 text-sm text-white/40">Chưa có hoạt động nào được ghi nhận.</p>
        : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.interaction_id} className="flex gap-3 rounded-xl border border-white/[0.07] bg-black/10 px-3.5 py-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-300/80" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="m-0 text-sm font-medium text-white/85">{{'account_access':'Hoạt động đăng nhập','navigation':'Truy cập và điều hướng','customer_profile':'Tạo hồ sơ khách hàng','order':'Đặt đơn hàng','order_status':'Cập nhật trạng thái đơn hàng','payment':'Thanh toán','feedback':'Gửi phản hồi','feedback_reply':'Nhân viên phản hồi','survey_invitation':'Được mời khảo sát','survey_response':'Hoàn thành khảo sát','loyalty':'Biến động điểm thưởng','promotion_assigned':'Nhận ưu đãi','promotion_used':'Sử dụng ưu đãi','support_chat':'Trao đổi hỗ trợ','email':'Email xác nhận đơn hàng'}[item.interaction_type] || item.title}</p>
                    <time className="text-[11px] text-white/35">{dateFormatter.format(new Date(item.occurred_at))}</time>
                  </div>
                  <p className="mt-1 mb-0 text-xs leading-relaxed text-white/48">{item.summary}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      {error && items.length > 0 && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {nextCursor && <button type="button" className={BTN_GHOST} disabled={loadingMore} onClick={() => loadMore()}>
          {loadingMore ? 'Đang tải...' : 'Xem thêm hoạt động'}
        </button>}
        {!includeOlder && olderCursor && <button type="button" className={BTN_GHOST} disabled={loadingMore} onClick={() => loadMore(true)}>
          {loadingMore ? 'Đang tải...' : 'Xem toàn bộ lịch sử'}
        </button>}
      </div>
      <div className="mt-5 pt-4 border-t border-white/[0.08]">
        <div className="mb-3 text-sm font-semibold text-white/85">Lịch sử mua hàng</div>
        {ordersLoading ? <p className="py-3 text-sm text-white/40">Đang tải đơn hàng...</p>
          : ordersError ? <p className="py-3 text-sm text-rose-300">{ordersError}</p>
          : !orders.length ? <p className="py-3 text-sm text-white/40">Khách hàng chưa có đơn hàng.</p>
          : <div className="space-y-2">
              {orders.map(order => (
                <div key={order.order_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-black/10 px-3.5 py-3">
                  <div>
                    <p className="m-0 text-sm font-medium text-white/85">Đơn hàng #{order.order_id}</p>
                    <p className="mt-1 mb-0 text-xs text-white/45">{dateFormatter.format(new Date(order.ordered_at))} · {order.item_count} sản phẩm</p>
                  </div>
                  <div className="text-right">
                    <p className="m-0 text-sm font-semibold text-white/80">{Number(order.total_amount || 0).toLocaleString('vi-VN')} ₫</p>
                    <p className="mt-1 mb-0 text-xs text-white/45">{order.order_status}</p>
                  </div>
                </div>
              ))}
            </div>}
      </div>
    </div>
  );
}


export default function CustomersView({ userRole }) {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal]     = useState(0);
  const [search, setSearch]   = useState('');
  const [tier, setTier]       = useState('');
  const [gender, setGender]   = useState('');
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [notice, setNotice]   = useState('');
  const [busyCustomerId, setBusyCustomerId] = useState(null);
  useSweetAlertMessages({ error, success: notice });
  const [refresh, setRefresh] = useState(0);
  const [adding, setAdding]   = useState(false);
  const [editing, setEditing] = useState(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const canWrite = ['ADMIN','QL_KHACH_HANG'].includes(userRole);

  useEffect(() => {
    setLoading(true); setError('');
    const p = new URLSearchParams({ page, limit:LIMIT });
    if (search) p.set('search', search);
    if (tier)   p.set('tier', tier);
    if (gender) p.set('gender', gender);
    apiFetch(`/api/customers?${p}`)
      .then(d => { setCustomers(d.data||[]); setTotal(d.total||0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, tier, gender, page, refresh]);

  const changeAccountStatus = async (customer, status) => {
    const confirmed = await confirmDestructiveAction({
      title: status === 'Blocked' ? 'Khóa tài khoản khách hàng?' : 'Mở khóa tài khoản khách hàng?',
      text: status === 'Blocked'
        ? `Tài khoản của ${customer.full_name} sẽ không thể đăng nhập.`
        : `Cho phép ${customer.full_name} đăng nhập lại?`,
      confirmText: status === 'Blocked' ? 'Khóa tài khoản' : 'Mở khóa',
    });
    if (!confirmed) return;
    setError(''); setNotice(''); setBusyCustomerId(customer.customer_id);
    try {
      const result = await apiFetch(`/api/customers/${customer.customer_id}/account-status`, { method:'PATCH', body:{ status } });
      setNotice(result.message); setRefresh(v => v+1);
    } catch(err) { setError(err.message); }
    finally { setBusyCustomerId(null); }
  };

  const deleteCustomer = async customer => {
    const confirmed = await confirmDestructiveAction({
      title: 'Xóa hồ sơ khách hàng?',
      text: `Hồ sơ ${customer.full_name} sẽ được ẩn danh hóa và tài khoản đăng nhập (nếu có) sẽ bị khóa, thu hồi các phiên đang hoạt động. Đơn hàng, phản hồi và lịch sử giao dịch được giữ lại để bảo toàn dữ liệu. Thao tác này không thể hoàn tác.`,
      confirmText: 'Xóa hồ sơ',
    });
    if (!confirmed) return;
    setError(''); setNotice(''); setBusyCustomerId(customer.customer_id);
    try {
      const result = await apiFetch(`/api/customers/${customer.customer_id}`, { method:'DELETE' });
      setNotice(result.message); setRefresh(v => v+1);
    } catch(err) { setError(err.message); }
    finally { setBusyCustomerId(null); }
  };

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Quản lý quan hệ khách hàng</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Quản lý khách hàng</h1>
        </div>
        {canWrite && (
          <button className={`${BTN_PRIMARY} admin-primary-action`} onClick={() => { setEditing(null); setAdding(true); }}>
            <UserPlus size={15}/> Thêm khách hàng
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center flex-wrap gap-2.5 px-4 py-3 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl">
        <div className="relative flex items-center flex-1">
          <Search size={14} className="absolute left-3 text-white/30 pointer-events-none"/>
          <input className={`${INPUT} pl-9 flex-1`} placeholder="Tìm theo tên, số điện thoại hoặc email..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <FilterPopover title="Bộ lọc khách hàng" activeCount={[search, tier, gender].filter(Boolean).length}
          onClear={() => { setSearch(''); setTier(''); setGender(''); setPage(1); }}>
          <label className="flex flex-col gap-1.5 text-xs text-white/65">Hạng thành viên<select className={SELECT} value={tier} onChange={e => { setTier(e.target.value); setPage(1); }}><option value="">Tất cả hạng</option>{TIERS.map(t => <option key={t} value={t}>{CUSTOMER_TIER_LABELS[t]}</option>)}</select></label>
          <label className="flex flex-col gap-1.5 text-xs text-white/65">Giới tính<select className={SELECT} value={gender} onChange={e => { setGender(e.target.value); setPage(1); }}>{GENDERS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </FilterPopover>
      </div>


      {/* Table */}
      <div className={PANEL}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2.5 m-0 text-[1.05rem] font-semibold">
            Danh sách khách hàng
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-violet-400/15 border border-violet-300/25 text-violet-200 text-xs font-semibold">
              {total.toLocaleString('vi-VN')} khách
            </span>
          </h2>
        </div>
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {['Mã','Họ tên','Số điện thoại','Email','Tuổi','Giới tính','Hạng thành viên','Điểm hiện có','Điểm tích lũy trọn đời', ...(canWrite?['Thao tác']:[])].map(h => (
                    <th key={h} className="px-3.5 py-2.5 text-left text-[0.72rem] font-semibold tracking-[0.05em] uppercase text-white/38 border-b border-white/[0.08] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.length ? customers.map(c => {
                  const tc = TIER_COLOR[c.customer_tier] || '#64748b';
                  return (
                    <Fragment key={c.customer_id}>
                    <tr key={c.customer_id} className="hover:bg-white/[0.04] transition-colors">
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/28 text-xs tabular-nums w-10">{c.customer_id}</td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05]">
                        <div className="flex items-center gap-2">
                          <strong className="text-[#f5f0eb] font-semibold">{c.full_name}</strong>
                          <button type="button" className={ICON_BTN} title="Xem lịch sử tương tác"
                            aria-label={"Xem lịch sử tương tác của " + c.full_name}
                            aria-expanded={expandedCustomerId === c.customer_id}
                            onClick={() => setExpandedCustomerId(current => current === c.customer_id ? null : c.customer_id)}>
                            {expandedCustomerId === c.customer_id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                          </button>
                        </div>
                      </td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/78">{c.phone||'—'}</td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/78">{c.email||'—'}</td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/70">{formatAge(c.age)}</td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/78">{CUSTOMER_GENDER_LABELS[c.gender] || 'Khác'}</td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05]">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ color:tc, background:`${tc}18` }}>{CUSTOMER_TIER_LABELS[c.customer_tier] || 'Mới'}</span>
                      </td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/70 tabular-nums font-medium">{(c.points_balance||0).toLocaleString('vi-VN')}</td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/70 tabular-nums font-medium">{(c.lifetime_points||0).toLocaleString('vi-VN')}</td>
                      {canWrite && (
                        <td className="px-3.5 py-3 border-b border-white/[0.05]">
                          <div className="flex items-center gap-1.5">
                            <button className={ICON_BTN} title="Sửa thông tin khách hàng" onClick={() => setEditing(c)}><Pencil size={14}/></button>
                            <button
                              className={`${ICON_BTN} ${c.account_id ? (c.account_status === 'Blocked' ? 'border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/10' : 'border-amber-500/20 text-amber-300 hover:bg-amber-500/10') : 'opacity-35 cursor-not-allowed'}`}
                              title={!c.account_id ? 'Khách chưa có tài khoản đăng nhập' : c.account_status === 'Blocked' ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                              aria-label={!c.account_id ? 'Không có tài khoản đăng nhập' : c.account_status === 'Blocked' ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                              disabled={!c.account_id || busyCustomerId === c.customer_id}
                              onClick={() => changeAccountStatus(c, c.account_status === 'Blocked' ? 'Active' : 'Blocked')}>
                              {c.account_status === 'Blocked' ? <UnlockKeyhole size={14}/> : <LockKeyhole size={14}/>}
                            </button>
                            <button
                              className={`${ICON_BTN} border-red-500/20 text-red-300 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-200`}
                              title="Xóa hồ sơ khách hàng" aria-label="Xóa hồ sơ khách hàng"
                              disabled={busyCustomerId === c.customer_id}
                              onClick={() => deleteCustomer(c)}>
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {expandedCustomerId === c.customer_id && (
                      <tr key={"history-" + c.customer_id}>
                        <td colSpan={canWrite ? 10 : 9} className="p-0 border-b border-white/[0.06]">
                          <CustomerInteractionHistory customerId={c.customer_id} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                }) : (
                  <tr><td colSpan={canWrite?10:9} className="px-3.5 py-10 text-center text-white/25 text-sm">Không có khách hàng</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <PageBar page={page} total={total} limit={LIMIT} onChange={setPage} />
      </div>

      <AnimatePresence>
        {(adding || editing) && <CustomerModal customer={editing} onClose={() => { setAdding(false); setEditing(null); }} onSaved={() => { setAdding(false); setEditing(null); setPage(1); setRefresh(v => v+1); }} />}
      </AnimatePresence>
    </div>
  );
}
