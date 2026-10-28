import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Filter, Pencil, Shield, UserPlus, Search, X } from 'lucide-react';
import { apiFetch } from '../api';
import TierBadge from '../components/TierBadge';
import Spinner from '../components/Spinner';
import { confirmDestructiveAction } from '../utils/confirmAction';

const TIERS   = ['New','Regular','Silver','Gold','VIP'];
const GENDERS = [['','Tất cả'],['Female','Nữ'],['Male','Nam'],['Other','Khác']];
const EMPTY   = { full_name:'', phone:'', email:'', gender:'' };
const LIMIT   = 15;

const INPUT  = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input';
const SELECT = INPUT + ' cursor-pointer';
const BTN_PRIMARY = 'inline-flex items-center gap-1.5 h-9 px-4 bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] hover:-translate-y-px transition-all disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer';
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

function EditModal({ customer, onClose, onSaved }) {
  const [form, setForm] = useState({ full_name:customer.full_name||'', phone:customer.phone||'', email:customer.email||'', gender:customer.gender||'' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { await apiFetch(`/api/customers/${customer.customer_id}`, { method:'PATCH', body:form }); onSaved(); }
    catch(err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-md p-5" onClick={onClose}>
      <motion.div initial={{ scale:0.94, opacity:0 }} animate={{ scale:1, opacity:1 }}
        exit={{ scale:0.94, opacity:0 }} transition={{ duration:0.18 }}
        className="w-full max-w-[520px] p-7 border border-white/[0.12] rounded-3xl bg-[rgba(26,20,16,0.96)] shadow-[0_32px_80px_rgba(0,0,0,0.65)] text-[#f5f0eb]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-white/[0.08]">
          <h2 className="m-0 text-[1.1rem] font-bold">Chỉnh sửa khách hàng</h2>
          <button className="grid w-[34px] h-[34px] place-items-center border border-white/12 rounded-[9px] bg-white/[0.05] text-white/50 cursor-pointer transition-all hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400" onClick={onClose}><X size={16}/></button>
        </div>
        <form onSubmit={save} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Họ tên *"><input required maxLength={150} className={INPUT} value={form.full_name} onChange={e => setForm({...form, full_name:e.target.value})} /></Field>
            <Field label="Số điện thoại"><input type="tel" maxLength={30} className={INPUT} value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} /></Field>
            <Field label="Email"><input type="email" maxLength={150} className={INPUT} value={form.email} onChange={e => setForm({...form, email:e.target.value})} /></Field>
            <Field label="Giới tính">
              <select className={SELECT} value={form.gender} onChange={e => setForm({...form, gender:e.target.value})}>
                <option value="">Chưa cung cấp</option>
                <option value="Female">Nữ</option><option value="Male">Nam</option><option value="Other">Khác</option>
              </select>
            </Field>
          </div>
          {error && <p className="m-0 text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
            <button type="button" className={BTN_GHOST} onClick={onClose}>Hủy</button>
            <button type="submit" className={BTN_PRIMARY} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

const TIER_COLOR = { New:'#64748b', Regular:'#0ea5e9', Silver:'#94a3b8', Gold:'#f59e0b', VIP:'#a855f7' };

export default function CustomersView({ userRole }) {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal]     = useState(0);
  const [search, setSearch]   = useState('');
  const [tier, setTier]       = useState('');
  const [gender, setGender]   = useState('');
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [refresh, setRefresh] = useState(0);
  const [newCust, setNewCust] = useState(EMPTY);
  const [adding, setAdding]   = useState(false);
  const [editing, setEditing] = useState(null);
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

  const addCustomer = async e => {
    e.preventDefault(); setError('');
    try {
      await apiFetch('/api/customers', { method:'POST', body:{ ...newCust, gender:newCust.gender||null, interests:[] } });
      setNewCust(EMPTY); setPage(1); setRefresh(v => v+1); setAdding(false);
    } catch(err) { setError(err.message); }
  };

  const removeCustomer = async c => {
    const confirmed = await confirmDestructiveAction({
      title: 'Khóa hồ sơ khách hàng?',
      text: `Bạn có chắc muốn khóa hồ sơ ${c.full_name} không?`,
      confirmText: 'Khóa hồ sơ',
    });
    if (!confirmed) return;
    setError('');
    try { await apiFetch(`/api/customers/${c.customer_id}`, { method:'DELETE' }); setRefresh(v => v+1); }
    catch(err) { setError(err.message); }
  };

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">CRM</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Quản lý khách hàng</h1>
        </div>
        {canWrite && (
          <button className={BTN_PRIMARY} onClick={() => setAdding(v => !v)}>
            <UserPlus size={15}/> Thêm khách hàng
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center flex-wrap gap-2.5 px-4 py-3 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl">
        <div className="relative flex items-center flex-1">
          <Search size={14} className="absolute left-3 text-white/30 pointer-events-none"/>
          <input className={`${INPUT} pl-9 flex-1`} placeholder="Tên, SĐT hoặc email..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className={`${SELECT} w-auto`} value={tier} onChange={e => { setTier(e.target.value); setPage(1); }}>
          <option value="">Tất cả hạng</option>
          {TIERS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className={`${SELECT} w-auto`} value={gender} onChange={e => { setGender(e.target.value); setPage(1); }}>
          {GENDERS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {(search||tier||gender) && (
          <button className={BTN_GHOST} onClick={() => { setSearch(''); setTier(''); setGender(''); setPage(1); }}>
            <X size={13}/> Xóa lọc
          </button>
        )}
      </div>

      {error && <p className="p-3 px-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</p>}

      {/* Add form */}
      <AnimatePresence>
        {adding && canWrite && (
          <motion.form initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:-12 }} transition={{ duration:0.2 }}
            className={PANEL} onSubmit={addCustomer}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-2.5 m-0 text-[1.05rem] font-semibold"><UserPlus size={16}/> Thêm khách hàng mới</h2>
              <button type="button" className="grid w-[34px] h-[34px] place-items-center border border-white/12 rounded-[9px] bg-white/[0.05] text-white/50 cursor-pointer transition-all hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400" onClick={() => setAdding(false)}><X size={16}/></button>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <Field label="Họ tên *"><input required maxLength={150} placeholder="Nguyễn Văn A" className={INPUT} value={newCust.full_name} onChange={e => setNewCust({...newCust, full_name:e.target.value})} /></Field>
              <Field label="Số điện thoại"><input type="tel" maxLength={30} placeholder="09xxxxxxxx" className={INPUT} value={newCust.phone} onChange={e => setNewCust({...newCust, phone:e.target.value})} /></Field>
              <Field label="Email"><input type="email" maxLength={150} placeholder="email@example.com" className={INPUT} value={newCust.email} onChange={e => setNewCust({...newCust, email:e.target.value})} /></Field>
              <Field label="Giới tính">
                <select className={SELECT} value={newCust.gender} onChange={e => setNewCust({...newCust, gender:e.target.value})}>
                  <option value="">Chưa cung cấp</option>
                  <option value="Female">Nữ</option><option value="Male">Nam</option><option value="Other">Khác</option>
                </select>
              </Field>
            </div>
            <div><button className={BTN_PRIMARY} type="submit"><UserPlus size={14}/> Thêm khách hàng</button></div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className={PANEL}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2.5 m-0 text-[1.05rem] font-semibold">
            Danh sách
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-500 text-xs font-semibold">
              {total.toLocaleString('vi-VN')} khách
            </span>
          </h2>
        </div>
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {['#','Họ tên','SĐT','Email','Giới tính','Hạng','Điểm', ...(canWrite?['Thao tác']:[])].map(h => (
                    <th key={h} className="px-3.5 py-2.5 text-left text-[0.72rem] font-semibold tracking-[0.05em] uppercase text-white/38 border-b border-white/[0.08] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.length ? customers.map(c => {
                  const tc = TIER_COLOR[c.customer_tier] || '#64748b';
                  return (
                    <tr key={c.customer_id} className="hover:bg-white/[0.04] transition-colors">
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/28 text-xs tabular-nums w-10">{c.customer_id}</td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05]"><strong className="text-[#f5f0eb] font-semibold">{c.full_name}</strong></td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/78">{c.phone||'—'}</td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/78">{c.email||'—'}</td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/78">{c.gender||'—'}</td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05]">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ color:tc, background:`${tc}18` }}>{c.customer_tier||'New'}</span>
                      </td>
                      <td className="px-3.5 py-3 border-b border-white/[0.05] text-white/70 tabular-nums font-medium">{(c.loyalty_point||0).toLocaleString()}</td>
                      {canWrite && (
                        <td className="px-3.5 py-3 border-b border-white/[0.05]">
                          <div className="flex items-center gap-1.5">
                            <button className={ICON_BTN} title="Chỉnh sửa" onClick={() => setEditing(c)}><Pencil size={14}/></button>
                            {c.account_status !== 'Blocked' ? (
                              <button className={`${ICON_BTN} border-red-500/20 text-red-500/65 hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-400`} title="Khóa" onClick={() => removeCustomer(c)}><Shield size={14}/></button>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-red-500/12 text-red-300 text-xs font-semibold">Đã khóa</span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={canWrite?8:7} className="px-3.5 py-10 text-center text-white/25 text-sm">Không có khách hàng</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <PageBar page={page} total={total} limit={LIMIT} onChange={setPage} />
      </div>

      <AnimatePresence>
        {editing && <EditModal customer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRefresh(v => v+1); }} />}
      </AnimatePresence>
    </div>
  );
}
