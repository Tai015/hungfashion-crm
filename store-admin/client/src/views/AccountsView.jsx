import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Search, UserPlus, X } from 'lucide-react';
import { apiFetch } from '../api';
import PasswordInput from '../PasswordInput';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

const ROLE_LABELS = { ADMIN:'Quản trị hệ thống', QL_NHAN_SU:'Quản lý nhân sự', QL_KHO:'Quản lý kho', QL_BAN_HANG:'Quản lý bán hàng', QL_KHACH_HANG:'Quản lý khách hàng', KHACH_HANG:'Khách hàng' };
const ROLE_COLORS = { ADMIN:'#f97316', QL_NHAN_SU:'#0ea5e9', QL_KHO:'#10b981', QL_BAN_HANG:'#f59e0b', QL_KHACH_HANG:'#8b5cf6', KHACH_HANG:'#64748b' };

const INPUT  = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input';
const SELECT = INPUT + ' cursor-pointer';
const BTN_PRIMARY = 'inline-flex items-center gap-1.5 h-9 px-4 bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] hover:-translate-y-px transition-all disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer';
const BTN_GHOST   = 'inline-flex items-center gap-1.5 h-9 px-4 bg-white/[0.07] border border-white/15 text-white/65 text-sm font-medium rounded-xl transition-all hover:bg-white/[0.12] hover:text-white/90 cursor-pointer';
const PANEL  = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';
const TH     = 'px-3.5 py-2.5 text-left text-[0.72rem] font-semibold tracking-[0.05em] uppercase text-white/38 border-b border-white/[0.08] whitespace-nowrap';
const TD     = 'px-3.5 py-3 border-b border-white/[0.05] text-white/78 align-middle';
const CLOSE  = 'grid w-[34px] h-[34px] place-items-center border border-white/12 rounded-[9px] bg-white/[0.05] text-white/50 cursor-pointer transition-all hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400';

function Field({ label, children }) {
  return <label className="flex flex-col gap-1.5 text-white/65 text-sm font-medium">{label && <span>{label}</span>}{children}</label>;
}

export default function AccountsView() {
  const [accounts, setAccounts] = useState([]);
  const [roles, setRoles]       = useState([]);
  const [search, setSearch]     = useState('');
  const [form, setForm]         = useState({ role_id:'', username:'', password:'', email:'' });
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState(false);

  const load = () => {
    setLoading(true); setError('');
    Promise.all([apiFetch(`/api/accounts?limit=100&search=${encodeURIComponent(search)}`), apiFetch('/api/accounts/roles/all')])
      .then(([acc, rol]) => { setAccounts(acc.data||[]); setRoles(rol||[]); setForm(f => ({...f, role_id: f.role_id||String(rol[0]?.role_id||'')})); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [search]);

  const update = async (account, changes) => {
    setError('');
    try {
      const path = changes.role_id ? 'role' : 'status';
      await apiFetch(`/api/accounts/${account.account_id}/${path}`, { method:'PATCH', body:changes });
      load();
    } catch(e) { setError(e.message); }
  };

  const createAccount = async e => {
    e.preventDefault(); setError(''); setMessage('');
    try {
      await apiFetch('/api/accounts', { method:'POST', body:{ ...form, role_id:Number(form.role_id) } });
      setForm(f => ({...f, username:'', password:'', email:''}));
      setMessage('✓ Đã tạo tài khoản thành công.'); setAdding(false); load();
    } catch(err) { setError(err.message); }
  };

  const roleColor = name => ROLE_COLORS[name] || '#64748b';

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Quản trị</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Tài khoản &amp; phân quyền</h1>
        </div>
        <button className={BTN_PRIMARY} onClick={() => setAdding(v => !v)}><UserPlus size={15}/> Tạo tài khoản</button>
      </div>

      {message && <p className="p-3 px-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm">{message}</p>}
      {error   && <p className="p-3 px-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</p>}

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.form initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }} transition={{ duration:0.2 }}
            className={PANEL} onSubmit={createAccount}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-2.5 m-0 text-[1.05rem] font-semibold"><UserPlus size={16}/> Tạo tài khoản mới</h2>
              <button type="button" className={CLOSE} onClick={() => setAdding(false)}><X size={16}/></button>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <Field label="Tên đăng nhập *">
                <input required minLength={3} maxLength={100} pattern="[A-Za-z0-9_.-]+" autoComplete="off" placeholder="username" className={INPUT}
                  value={form.username} onChange={e => setForm({...form, username:e.target.value})} />
              </Field>
              <Field label="Mật khẩu *">
                <PasswordInput required minLength={8} maxLength={128} autoComplete="new-password"
                  value={form.password} onChange={e => setForm({...form, password:e.target.value})} />
              </Field>
              <Field label="Email">
                <input type="email" maxLength={150} placeholder="email@company.com" className={INPUT}
                  value={form.email} onChange={e => setForm({...form, email:e.target.value})} />
              </Field>
              <Field label="Vai trò *">
                <select required className={SELECT} value={form.role_id} onChange={e => setForm({...form, role_id:e.target.value})}>
                  {roles.map(r => <option key={r.role_id} value={r.role_id}>{ROLE_LABELS[r.role_name]||r.role_name}</option>)}
                </select>
              </Field>
            </div>
            <div><button type="submit" className={BTN_PRIMARY}><UserPlus size={14}/> Tạo tài khoản</button></div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl">
        <div className="relative flex items-center flex-1">
          <Search size={14} className="absolute left-3 text-white/30 pointer-events-none"/>
          <input className={`${INPUT} pl-9`} placeholder="Tên đăng nhập hoặc email..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {search && <button className={BTN_GHOST} onClick={() => setSearch('')}><X size={13}/> Xóa</button>}
      </div>

      {/* Table */}
      <div className={PANEL}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2.5 m-0 text-[1.05rem] font-semibold">
            Danh sách tài khoản
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-500 text-xs font-semibold">{accounts.length}</span>
          </h2>
        </div>
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {['Tên đăng nhập','Email','Vai trò','Trạng thái','Thao tác'].map(h => <th key={h} className={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {accounts.map(acc => {
                  const c = roleColor(acc.role_name);
                  return (
                    <tr key={acc.account_id} className="hover:bg-white/[0.04] transition-colors">
                      <td className={TD}>
                        <div className="flex items-center gap-2.5">
                          <div className="grid w-[34px] h-[34px] place-items-center rounded-[10px] text-sm font-bold shrink-0"
                            style={{ background:`${c}22`, color:c }}>
                            {(acc.username||'?').slice(0,1).toUpperCase()}
                          </div>
                          <strong className="text-[#f5f0eb] font-semibold">{acc.username}</strong>
                        </div>
                      </td>
                      <td className={TD}>{acc.email||'—'}</td>
                      <td className={TD}>
                        {/* Inline role select */}
                        <select
                          className="h-8 pl-2.5 pr-7 border border-white/12 rounded-lg bg-white/[0.07] font-semibold text-[0.8rem] cursor-pointer outline-none appearance-none transition-all hover:border-white/22 hover:bg-white/[0.1] focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/[0.12] dark-input"
                          style={{ color:c, backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' }}
                          value={acc.role_name}
                          onChange={e => { const r = roles.find(x => x.role_name===e.target.value); if(r) update(acc,{role_id:r.role_id}); }}>
                          {roles.map(r => <option key={r.role_id} value={r.role_name} style={{ background:'#1a1410', color:'#f5f0eb' }}>{ROLE_LABELS[r.role_name]||r.role_name}</option>)}
                        </select>
                      </td>
                      <td className={TD}><StatusBadge status={acc.status} /></td>
                      <td className={TD}>
                        <button
                          className={`inline-flex items-center gap-1.5 h-8 px-3 border text-xs font-medium rounded-lg cursor-pointer transition-all ${acc.status==='Active' ? 'bg-white/[0.06] border-white/12 text-white/60 hover:bg-white/[0.12] hover:text-white/90' : 'bg-orange-500/15 border-orange-500/30 text-orange-400 hover:bg-orange-500/25'}`}
                          onClick={() => update(acc, { status:acc.status==='Active'?'Blocked':'Active' })}>
                          <Lock size={12}/> {acc.status==='Active' ? 'Khóa' : 'Mở khóa'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!accounts.length && <tr><td colSpan={5} className="py-10 text-center text-white/25 text-sm">Không có tài khoản phù hợp.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
