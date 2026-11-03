import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Search } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { createPortal } from 'react-dom';
import { useModalEffects } from '../hooks/useModalEffects';
import { vi } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import { apiFetch } from '../api';
import { TableSkeleton } from '../components/Skeleton';
import Pagination from '../components/Pagination';
import FilterPopover from '../components/FilterPopover';
import { showErrorAlert, showSuccessAlert } from '../utils/notifications';

const FIELD = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/30 outline-none focus:border-orange-500/50 dark-input';
const BTN = 'inline-flex items-center justify-center gap-2 h-9 px-4 bg-orange-500/20 border border-orange-500/30 text-orange-300 text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-50';
const PANEL = 'flex flex-col gap-4 p-5 bg-white/[0.06] border border-white/10 rounded-2xl text-[#f5f0eb]';
const today = () => new Date().toLocaleDateString('en-CA');
const fresh = () => ({ code: '', name: '', promo_type: 'Percent', value: '', min_order: '0', max_discount: '', usage_limit: '', start_date: today(), end_date: today(), is_active: true });
const dateFromValue = value => value ? new Date(`${value}T00:00:00`) : undefined;
const dateToValue = date => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';

function PromotionDateRange({ startDate, endDate, onChange }) {
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(undefined);
  const pickerRef = useRef(null);
  const format = value => value ? new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateFromValue(value)) : 'Chọn ngày';
  const togglePicker = () => {
    if (!open) setDraftRange(undefined);
    setOpen(value => !value);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = event => { if (!pickerRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  return <div className="relative" ref={pickerRef}>
    <button type="button" onClick={togglePicker} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/[0.12] bg-white/[0.07] px-3 text-left outline-none transition hover:border-orange-400/40 hover:bg-white/10 focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/[0.12]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-400/10 text-orange-300"><CalendarDays size={16} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-white/45">{startDate && endDate ? 'Khoảng thời gian áp dụng' : 'Chọn thời gian áp dụng'}</span>
        <span className="block truncate text-sm font-medium text-[#f5f0eb]">{startDate && endDate ? `${format(startDate)} – ${format(endDate)}` : 'Chọn ngày bắt đầu và kết thúc'}</span>
      </span>
      <span className="text-xs text-white/40">{open ? 'Đóng' : 'Chọn ngày'}</span>
    </button>
    {open && <div className="promo-calendar absolute left-0 top-[calc(100%+0.5rem)] z-30 rounded-2xl border border-violet-300/20 bg-[#211b38] p-3 shadow-2xl shadow-black/50">
      <p className="mb-2 px-2 text-xs text-white/50">Chọn ngày bắt đầu rồi ngày kết thúc; chọn lại cùng ngày để áp dụng trong một ngày.</p>
      <DayPicker
        mode="range"
        min={1}
        required
        locale={vi}
        weekStartsOn={1}
        selected={draftRange}
        defaultMonth={dateFromValue(startDate)}
        onSelect={(selected, triggerDate) => {
          const isSingleDay = draftRange?.from && !draftRange?.to
            && dateToValue(draftRange.from) === dateToValue(triggerDate);
          if (isSingleDay) {
            const value = dateToValue(triggerDate);
            setDraftRange({ from: triggerDate, to: triggerDate });
            onChange(value, value);
            setOpen(false);
            return;
          }
          setDraftRange(selected);
          if (selected?.from && selected?.to) {
            onChange(dateToValue(selected.from), dateToValue(selected.to));
            setOpen(false);
          }
        }}
      />
    </div>}
  </div>;
}

function PromotionForm({ promotion, onCancel, onSaved }) {
  useModalEffects(true, onCancel);
  const [form, setForm] = useState(promotion ? { ...promotion, value: String(promotion.value), min_order: String(promotion.min_order), max_discount: promotion.max_discount ?? '', usage_limit: promotion.usage_limit ?? '', start_date: String(promotion.start_date).slice(0, 10), end_date: String(promotion.end_date).slice(0, 10) } : fresh());
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault(); setBusy(true);
    const body = { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim(), value: Number(form.value), min_order: Number(form.min_order || 0), max_discount: form.max_discount === '' ? null : Number(form.max_discount), usage_limit: form.usage_limit === '' ? null : Number(form.usage_limit) };
    try {
      await apiFetch(promotion ? `/api/promotions/${promotion.promotion_id}` : '/api/promotions', { method: promotion ? 'PATCH' : 'POST', body });
      showSuccessAlert(promotion ? 'Đã cập nhật chương trình khuyến mãi.' : 'Đã tạo chương trình khuyến mãi.'); onSaved();
    } catch (error) { showErrorAlert(error.message); } finally { setBusy(false); }
  };
  return createPortal((<div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 backdrop-blur-md p-5" onClick={onCancel}>
    <form className={`${PANEL} popup-surface w-full max-w-[680px] max-h-[90vh] overflow-y-auto`} onClick={event => event.stopPropagation()} onSubmit={submit}>
    <h2 className="m-0 text-lg font-semibold">{promotion ? 'Sửa chương trình' : 'Tạo chương trình khuyến mãi'}</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <input className={FIELD} required minLength={2} maxLength={50} pattern="[A-Za-z0-9_-]+" placeholder="Mã khuyến mãi *" value={form.code} onChange={e => set('code', e.target.value)} />
      <input className={FIELD} required maxLength={200} placeholder="Tên chương trình *" value={form.name} onChange={e => set('name', e.target.value)} />
      <select className={FIELD} value={form.promo_type} onChange={e => set('promo_type', e.target.value)}><option value="Percent">Giảm theo phần trăm</option><option value="FixedAmount">Giảm số tiền cố định</option></select>
      <input className={FIELD} required type="number" min="0.01" max={form.promo_type === 'Percent' ? 100 : undefined} step="0.01" placeholder={form.promo_type === 'Percent' ? 'Phần trăm giảm *' : 'Số tiền giảm *'} value={form.value} onChange={e => set('value', e.target.value)} />
      <input className={FIELD} type="number" min="0" step="1000" placeholder="Đơn tối thiểu" value={form.min_order} onChange={e => set('min_order', e.target.value)} />
      {form.promo_type === 'Percent' && <input className={FIELD} type="number" min="0" step="1000" placeholder="Mức giảm tối đa (tùy chọn)" value={form.max_discount} onChange={e => set('max_discount', e.target.value)} />}
      <input className={FIELD} type="number" min="1" step="1" placeholder="Giới hạn lượt dùng (để trống nếu không giới hạn)" value={form.usage_limit} onChange={e => set('usage_limit', e.target.value)} />
      <section className="md:col-span-2 rounded-2xl border border-white/10 bg-black/15 p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-orange-400/20 bg-orange-400/10 text-orange-300"><CalendarDays size={17} /></span>
          <div>
            <h3 className="m-0 text-sm font-semibold text-white/85">Thời gian áp dụng</h3>
            <p className="m-0 mt-0.5 text-xs text-white/45">Chọn ngày bắt đầu và kết thúc chương trình</p>
          </div>
        </div>
        <PromotionDateRange startDate={form.start_date} endDate={form.end_date} onChange={(start, end) => setForm(current => ({ ...current, start_date: start, end_date: end }))} />
      </section>
    </div>
    {promotion && <label className="flex items-center gap-2 text-sm text-white/65"><input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />Đang hoạt động</label>}
    <div className="flex gap-2"><button className={`${BTN} admin-primary-action`} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu chương trình'}</button><button type="button" className={BTN} onClick={onCancel}>Đóng</button></div>
    </form>
  </div>), document.body);
}

function AssignForm({ promotion, onDone }) {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiFetch(`/api/orders/customers?search=${encodeURIComponent(search)}`).then(setCustomers).catch(error => showErrorAlert(error.message));
  }, [search]);
  const assign = async () => {
    if (!selected.length) return showErrorAlert('Chọn ít nhất một khách hàng.');
    setBusy(true);
    try { const result = await apiFetch('/api/promotions/assign', { method: 'POST', body: { promotion_id: promotion.promotion_id, customer_ids: selected } }); showSuccessAlert(result.message); onDone(); }
    catch (error) { showErrorAlert(error.message); } finally { setBusy(false); }
  };
  return <div className={PANEL}>
    <h3 className="m-0 font-semibold">Phân bổ {promotion.code}</h3>
    <input className={FIELD} type="search" placeholder="Tìm khách hàng theo tên, số điện thoại, email..." value={search} onChange={e => setSearch(e.target.value)} />
    <div className="max-h-52 overflow-y-auto flex flex-col gap-2">{customers.map(customer => <label key={customer.customer_id} className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={selected.includes(customer.customer_id)} onChange={e => setSelected(current => e.target.checked ? [...current, customer.customer_id] : current.filter(id => id !== customer.customer_id))} /><span>{customer.full_name} · {customer.phone || customer.email || 'Không có liên hệ'}</span></label>)}{!customers.length && <p className="m-0 text-sm text-white/40">Không tìm thấy khách hàng.</p>}</div>
    <div className="flex gap-2"><button className={`${BTN} admin-primary-action`} disabled={busy} onClick={assign}>{busy ? 'Đang phân bổ...' : `Phân bổ cho ${selected.length} khách`}</button><button className={BTN} onClick={onDone}>Đóng</button></div>
  </div>;
}

export default function PromotionsView() {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ active: '', promo_type: '' });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(undefined);
  const [assigning, setAssigning] = useState(null);
  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20', paged: 'true' });
    if (filters.active) params.set('active', filters.active);
    if (filters.promo_type) params.set('promo_type', filters.promo_type);
    if (search.trim()) params.set('search', search.trim());
    apiFetch(`/api/promotions?${params}`).then(result => { setRows(result.data || []); setTotal(result.total || 0); }).catch(error => showErrorAlert(error.message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [page, filters, search]);
  const updateFilter = (key, value) => {
    setFilters(current => ({ ...current, [key]: value }));
    setPage(1);
  };
  return <div className="flex flex-col gap-5 text-[#f5f0eb]">
    <header className="flex justify-between items-center gap-3"><div><p className="m-0 text-white/40 text-xs uppercase tracking-widest">Quản lý bán hàng</p><h1 className="m-0 mt-1 text-2xl font-bold">Khuyến mãi</h1></div><button className={`${BTN} admin-primary-action`} onClick={() => setForm(null)}>+ Tạo chương trình</button></header>
    <div className="flex items-center gap-3">
      <label className="promotion-search relative flex min-w-0 flex-1 items-center">
        <Search size={16} aria-hidden="true" />
        <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm mã hoặc tên chương trình..." aria-label="Tìm khuyến mãi theo mã hoặc tên" />
      </label>
      <FilterPopover title="Lọc khuyến mãi" activeCount={Object.values(filters).filter(Boolean).length} onClear={() => { setFilters({ active: '', promo_type: '' }); setPage(1); }}>
        <label className="flex flex-col gap-1.5 text-xs text-white/65">Trạng thái
          <select className={FIELD} value={filters.active} onChange={event => updateFilter('active', event.target.value)}>
            <option value="">Tất cả chương trình</option>
            <option value="true">Đang áp dụng</option>
            <option value="false">Không áp dụng</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-white/65">Loại ưu đãi
          <select className={FIELD} value={filters.promo_type} onChange={event => updateFilter('promo_type', event.target.value)}>
            <option value="">Tất cả loại</option>
            <option value="Percent">Giảm theo phần trăm</option>
            <option value="FixedAmount">Giảm số tiền cố định</option>
          </select>
        </label>
      </FilterPopover>
    </div>
    {form !== undefined && <PromotionForm promotion={form} onCancel={() => setForm(undefined)} onSaved={() => { setForm(undefined); load(); }} />}
    {assigning && <AssignForm promotion={assigning} onDone={() => setAssigning(null)} />}
    <section className={PANEL}>{loading ? <TableSkeleton rows={5} columns={6} /> : !rows.length ? <p className="m-0 text-center text-white/40">{search || filters.active || filters.promo_type ? 'Không có khuyến mãi phù hợp bộ lọc.' : 'Chưa có chương trình khuyến mãi.'}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Mã', 'Chương trình', 'Ưu đãi', 'Thời hạn', 'Trạng thái', 'Thao tác'].map(title => <th key={title} className="p-3 text-left text-white/45">{title}</th>)}</tr></thead><tbody>{rows.map(promotion => <tr className="border-t border-white/10" key={promotion.promotion_id}><td className="p-3 font-semibold">{promotion.code}</td><td className="p-3">{promotion.name}<div className="text-xs text-white/40">Đơn tối thiểu {Number(promotion.min_order).toLocaleString('vi-VN')} ₫</div></td><td className="p-3">{promotion.promo_type === 'Percent' ? `${promotion.value}%` : `${Number(promotion.value).toLocaleString('vi-VN')} ₫`}</td><td className="p-3">{String(promotion.start_date).slice(0, 10)} – {String(promotion.end_date).slice(0, 10)}</td><td className="p-3">{promotion.is_active ? 'Đang bật' : 'Đã tắt'} · {promotion.used_count}/{promotion.usage_limit ?? '∞'}</td><td className="p-3"><div className="flex gap-2"><button className={`${BTN} admin-secondary-action`} onClick={() => setForm(promotion)}>Sửa</button><button className={`${BTN} admin-secondary-action`} disabled={!promotion.is_active} onClick={() => setAssigning(promotion)}>Phân bổ mã</button></div></td></tr>)}</tbody></table></div>}
      <Pagination page={page} total={total} limit={20} loading={loading} onChange={setPage} />
    </section>
  </div>;
}
