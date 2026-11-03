import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Lock, Search, Trash2, UserPlus, X } from 'lucide-react';
import { apiFetch } from '../api';
import PasswordInput from '../PasswordInput';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import { useSweetAlertMessages } from '../utils/notifications';
import { useModalEffects } from '../hooks/useModalEffects';

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
const LIMIT = 20;

function Field({ label, children }) {
  return <label className="flex flex-col gap-1.5 text-white/65 text-sm font-medium">{label && <span>{label}</span>}{children}</label>;
}

function AccountConfirmDialog({ action, pending, onCancel, onConfirm }) {
  useEffect(() => {
    if (!action) return undefined;
    const previousFocus = document.activeElement;
    const dialog = document.getElementById('account-confirm-dialog');
    document.getElementById('account-confirm-cancel')?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (dialog?.dataset.pending !== 'true') onCancel();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const controls = [...dialog.querySelectorAll('button:not(:disabled)')];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0];
      const last = controls.at(-1);
      if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [action]);
  if (!action) return null;
  const account = action.account;
  const isRoleChange = action.type === 'role';
  const oldRole = ROLE_LABELS[account.role_name] || account.role_name;
  const newRole = isRoleChange ? ROLE_LABELS[action.role.role_name] || action.role.role_name : '';
  const adminChange = isRoleChange && (account.role_name === 'ADMIN' || action.role.role_name === 'ADMIN');
  const title = isRoleChange ? 'Xác nhận đổi vai trò' : action.type === 'delete' ? 'Xác nhận xóa tài khoản' : `Xác nhận ${action.status === 'Blocked' ? 'khóa' : 'mở khóa'} tài khoản`;
  const description = isRoleChange
    ? `Tài khoản “${account.username}” sẽ đổi vai trò từ “${oldRole}” sang “${newRole}”.`
    : action.type === 'delete'
      ? `Tài khoản “${account.username}” sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác.`
      : `Bạn xác nhận ${action.status === 'Blocked' ? 'khóa' : 'mở khóa'} tài khoản “${account.username}”?`;
  return createPortal(<div className="fixed inset-0 z-[10050] grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !pending) onCancel(); }}>
    <section id="account-confirm-dialog" data-pending={pending} role="dialog" aria-modal="true" aria-labelledby="account-confirm-title" aria-describedby="account-confirm-description" className="popup-surface w-full max-w-md rounded-2xl border p-6 text-[#f5f0eb] shadow-2xl">
      <h2 id="account-confirm-title" className="m-0 text-lg font-semibold">{title}</h2>
      <p id="account-confirm-description" className="mt-3 text-sm leading-relaxed text-white/70">{description}</p>
      {adminChange && <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm font-medium text-amber-200">{action.role.role_name === 'ADMIN' ? 'Cảnh báo: thao tác này cấp quyền quản trị viên, cho phép truy cập và thay đổi toàn bộ hệ thống.' : 'Cảnh báo: thao tác này gỡ quyền quản trị viên khỏi tài khoản.'}</p>}
      {action.type === 'delete' && account.has_related_data && <p className="mt-3 text-sm text-red-200">Tài khoản đã có dữ liệu liên quan. Hãy khóa thay vì xóa.</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button id="account-confirm-cancel" type="button" className={BTN_GHOST} disabled={pending} onClick={onCancel}>Hủy</button>
        <button type="button" className={`${BTN_PRIMARY} ${action.type === 'delete' ? '!border-red-500/50 !bg-red-600' : ''}`} disabled={pending} onClick={onConfirm}>
          {pending ? 'Đang xử lý...' : action.type === 'delete' ? 'Xóa vĩnh viễn' : isRoleChange ? 'Xác nhận đổi vai trò' : action.status === 'Blocked' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
        </button>
      </div>
    </section>
  </div>, document.body);
}

export default function AccountsView({ currentAccountId }) {
  const [accounts, setAccounts] = useState([]);
  const [roles, setRoles]       = useState([]);
  const [search, setSearch]     = useState('');
  const [form, setForm]         = useState({ role_id:'', username:'', password:'', email:'' });
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [saving, setSaving]     = useState(false);
  const [adding, setAdding]     = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmPending, setConfirmPending] = useState(false);
  useModalEffects(adding, () => setAdding(false));
  useSweetAlertMessages({ error, success: message });

  const load = (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    Promise.all([apiFetch(`/api/accounts?page=${page}&limit=${LIMIT}&search=${encodeURIComponent(search)}`), apiFetch('/api/accounts/roles/all')])
      .then(([acc, rol]) => { setAccounts(acc.data||[]); setTotal(acc.total||0); setRoles(rol||[]); setForm(f => ({...f, role_id: f.role_id||String(rol[0]?.role_id||'')})); })
      .catch(e => setError(e.message))
      .finally(() => { if (showLoading) setLoading(false); });
  };
  useEffect(() => { load(); }, [search, page]);
  useEffect(() => {
    const timer = window.setInterval(() => load(false), 15000);
    return () => window.clearInterval(timer);
  }, [search, page]);

  const update = async (account, changes) => {
    const path = changes.role_id ? 'role' : 'status';
    return apiFetch(`/api/accounts/${account.account_id}/${path}`, { method:'PATCH', body:changes });
  };

  const confirmPendingAction = async () => {
    if (!confirmAction || confirmPending) return;
    setConfirmPending(true); setError(''); setMessage('');
    try {
      const { account } = confirmAction;
      if (confirmAction.type === 'delete') {
        const result = await apiFetch(`/api/accounts/${account.account_id}`, { method:'DELETE' });
        setMessage(result.message || 'Đã xóa tài khoản.');
      } else if (confirmAction.type === 'role') {
        await update(account, { role_id: confirmAction.role.role_id });
        setMessage('Đã cập nhật vai trò tài khoản.');
      } else {
        await update(account, { status: confirmAction.status });
        setMessage(confirmAction.status === 'Blocked' ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.');
      }
      setConfirmAction(null);
      load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setConfirmPending(false);
    }
  };

  const createAccount = async e => {
    e.preventDefault(); setError(''); setMessage(''); setSaving(true);
    try {
      await apiFetch('/api/accounts', { method:'POST', body:{ ...form, role_id:Number(form.role_id), email:form.email.trim() || null } });
      setForm(f => ({...f, username:'', password:'', email:''}));
      setMessage('✓ Đã tạo tài khoản thành công.'); setAdding(false); load();
    } catch(err) { setError(err.message); } finally { setSaving(false); }
  };

  const roleColor = name => ROLE_COLORS[name] || '#64748b';

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <AccountConfirmDialog action={confirmAction} pending={confirmPending} onCancel={() => setConfirmAction(null)} onConfirm={confirmPendingAction} />
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Quản trị</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Tài khoản &amp; phân quyền</h1>
        </div>
        <button className={`${BTN_PRIMARY} admin-primary-action`} onClick={() => setAdding(true)}><UserPlus size={15}/> Tạo tài khoản</button>
      </div>

      {/* Add form */}
      {adding && createPortal((
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 backdrop-blur-md p-5" onClick={() => setAdding(false)}>
          <motion.form initial={{ scale:0.94, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.94, opacity:0 }} transition={{ duration:0.18 }}
            className={`${PANEL} popup-surface w-full max-w-[560px] max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()} onSubmit={createAccount}>
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
            <div><button type="submit" className={`${BTN_PRIMARY} admin-primary-action`} disabled={saving}><UserPlus size={14}/> {saving ? 'Đang tạo...' : 'Tạo tài khoản'}</button></div>
          </motion.form>
          </motion.div>
      ), document.body)}

      {/* Search */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl">
        <div className="relative flex items-center flex-1">
          <Search size={14} className="absolute left-3 text-white/30 pointer-events-none"/>
          <input className={`${INPUT} pl-9`} placeholder="Tên đăng nhập hoặc email..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {search && <button className={BTN_GHOST} onClick={() => { setSearch(''); setPage(1); }}><X size={13}/> Xóa</button>}
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
                  {['Tên đăng nhập','Email','Vai trò','Trạng thái','Phiên đăng nhập','Thao tác'].map(h => <th key={h} className={TH}>{h}</th>)}
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
                          disabled={Number(acc.account_id) === Number(currentAccountId) || Number(acc.online_session_count) > 0 || acc.is_last_active_admin}
                          title={Number(acc.account_id) === Number(currentAccountId) ? 'Không thể đổi vai trò cho chính tài khoản đang đăng nhập.' : Number(acc.online_session_count) > 0 ? 'Tài khoản đang online; thử lại sau khi phiên chuyển offline.' : acc.is_last_active_admin ? 'Không thể hạ quyền của quản trị viên đang hoạt động cuối cùng.' : 'Chọn vai trò mới'}
                          onChange={e => { const r = roles.find(x => x.role_name===e.target.value); if(r && r.role_name !== acc.role_name) setConfirmAction({ type:'role', account:acc, role:r }); }}>
                          {roles.map(r => <option key={r.role_id} value={r.role_name} style={{ background:'#211d38', color:'#f5f0eb' }}>{ROLE_LABELS[r.role_name]||r.role_name}</option>)}
                        </select>
                      </td>
                      <td className={TD}><StatusBadge status={acc.status} /></td>
                      <td className={TD}>
                        {Number(acc.online_session_count) > 0
                          ? <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>Đang online · {acc.online_session_count} phiên</span>
                          : Number(acc.active_session_count) > 0
                            ? <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">Offline · còn {acc.active_session_count} phiên hiệu lực</span>
                            : <span className="text-white/35 text-xs">Không có phiên hiệu lực</span>}
                      </td>
                      <td className={TD}>
                        <button type="button"
                          title={Number(acc.account_id) === Number(currentAccountId) && acc.status === 'Active' ? 'Không thể khóa chính tài khoản đang đăng nhập.' : acc.is_last_active_admin && acc.status === 'Active' ? 'Phải còn ít nhất một quản trị viên đang hoạt động.' : acc.status === 'Active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                          disabled={(Number(acc.account_id) === Number(currentAccountId) && acc.status === 'Active') || (acc.is_last_active_admin && acc.status === 'Active')}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 border text-xs font-medium rounded-lg cursor-pointer transition-all ${acc.status==='Active' ? 'bg-white/[0.06] border-white/12 text-white/60 hover:bg-white/[0.12] hover:text-white/90' : 'bg-orange-500/15 border-orange-500/30 text-orange-400 hover:bg-orange-500/25'}`}
                          onClick={() => setConfirmAction({ type:'status', account:acc, status:acc.status==='Active'?'Blocked':'Active' })}>
                          <Lock size={12}/> {acc.status==='Active' ? 'Khóa' : 'Mở khóa'}
                        </button>
                        <button type="button"
                          aria-label={`Xóa tài khoản ${acc.username}`}
                          disabled={Number(acc.account_id) === Number(currentAccountId) || Number(acc.active_session_count) > 0 || acc.has_related_data || acc.is_last_active_admin}
                          title={Number(acc.account_id) === Number(currentAccountId) ? 'Không thể xóa tài khoản đang đăng nhập.' : Number(acc.active_session_count) > 0 ? 'Tài khoản còn phiên đăng nhập hiệu lực; hãy đăng xuất trước khi xóa.' : acc.has_related_data ? 'Tài khoản đã có dữ liệu liên quan, hãy khóa thay vì xóa.' : acc.is_last_active_admin ? 'Phải còn ít nhất một quản trị viên đang hoạt động.' : 'Xóa tài khoản'}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-35"
                          onClick={() => setConfirmAction({ type:'delete', account:acc })}><Trash2 size={14}/></button>
                      </td>
                    </tr>
                  );
                })}
                {!accounts.length && <tr><td colSpan={6} className="py-10 text-center text-white/25 text-sm">Không có tài khoản phù hợp.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={total} limit={LIMIT} loading={loading} onChange={setPage} />
      </div>
    </div>
  );
}
