import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import { showErrorAlert, showSuccessAlert } from '../utils/notifications';
import { useModalEffects } from '../hooks/useModalEffects';
import DatePicker from '../components/DatePicker';

const FIELD = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/30 outline-none focus:border-orange-500/50 dark-input';
const BTN = 'inline-flex items-center justify-center gap-2 h-9 px-4 bg-orange-500/20 border border-orange-500/30 text-orange-300 text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-50';
const PANEL = 'flex flex-col gap-4 p-5 bg-white/[0.06] border border-white/10 rounded-2xl text-[#f5f0eb]';
const blank = { full_name: '', gender: '', date_of_birth: '', phone: '', email: '', address: '', position: '', is_active: true };
const LIMIT = 20;

function EmployeeForm({ employee, onCancel, onSaved }) {
  const [form, setForm] = useState(employee ? { ...blank, ...employee, date_of_birth: employee.date_of_birth ? String(employee.date_of_birth).slice(0, 10) : '', gender: employee.gender || '' } : blank);
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault(); setBusy(true);
    try {
      await apiFetch(employee ? `/api/employees/${employee.employee_id}` : '/api/employees', {
        method: employee ? 'PUT' : 'POST', body: {
          ...form,
          full_name: form.full_name.trim(),
          position: form.position.trim(),
          date_of_birth: form.date_of_birth || null,
          gender: form.gender || null,
          phone: form.phone?.trim() || null,
          email: form.email?.trim() || null,
          address: form.address?.trim() || null,
        },
      });
      showSuccessAlert(employee ? 'Đã cập nhật nhân viên.' : 'Đã thêm nhân viên.'); onSaved();
    } catch (error) { showErrorAlert(error.message); } finally { setBusy(false); }
  };
  return <form className={`${PANEL} popup-surface`} onSubmit={submit}>
    <h2 className="m-0 text-lg font-semibold">{employee ? 'Cập nhật nhân viên' : 'Thêm nhân viên'}</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <input className={FIELD} required maxLength={150} placeholder="Họ tên *" value={form.full_name} onChange={e => set('full_name', e.target.value)} />
      <input className={FIELD} required maxLength={100} placeholder="Chức vụ *" value={form.position} onChange={e => set('position', e.target.value)} />
      <select className={FIELD} value={form.gender} onChange={e => set('gender', e.target.value)}><option value="">Chưa cung cấp giới tính</option><option value="Male">Nam</option><option value="Female">Nữ</option><option value="Other">Khác</option></select>
      <DatePicker className={FIELD} value={form.date_of_birth} onChange={value => set('date_of_birth', value)} placeholder="Ngày sinh" ariaLabel="Ngày sinh" max={new Date().toLocaleDateString('en-CA')} />
      <input className={FIELD} maxLength={20} placeholder="Điện thoại" value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
      <input className={FIELD} type="email" maxLength={150} placeholder="Email" value={form.email || ''} onChange={e => set('email', e.target.value)} />
      <input className={`${FIELD} md:col-span-2`} maxLength={500} placeholder="Địa chỉ" value={form.address || ''} onChange={e => set('address', e.target.value)} />
    </div>
    {employee && <label className="flex items-center gap-2 text-sm text-white/65"><input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />Đang làm việc</label>}
    <div className="flex gap-2"><button className={`${BTN} admin-primary-action`} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu nhân viên'}</button><button type="button" className={BTN} onClick={onCancel}>Đóng</button></div>
  </form>;
}

export default function EmployeesView() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(undefined);
  useModalEffects(form !== undefined, () => setForm(undefined));
  const load = () => { setLoading(true); apiFetch(`/api/employees?page=${page}&limit=${LIMIT}&search=${encodeURIComponent(search)}`).then(result => { setRows(result.data || []); setTotal(result.total || 0); }).catch(error => showErrorAlert(error.message)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [search, page]);
  return <div className="flex flex-col gap-5 text-[#f5f0eb]">
    <header className="flex justify-between items-center gap-3"><div><p className="m-0 text-white/40 text-xs uppercase tracking-widest">Quản lý nhân sự</p><h1 className="m-0 mt-1 text-2xl font-bold">Nhân viên</h1></div><button className={`${BTN} admin-primary-action`} onClick={() => setForm(null)}>+ Thêm nhân viên</button></header>
    <input className={FIELD} type="search" placeholder="Tìm theo tên, email hoặc chức vụ..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
    {form !== undefined && createPortal((<motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 backdrop-blur-md p-5" onClick={() => setForm(undefined)}>
        <motion.div initial={{ scale:0.94, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.94, opacity:0 }} className="w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
          <EmployeeForm employee={form} onCancel={() => setForm(undefined)} onSaved={() => { setForm(undefined); load(); }} />
        </motion.div>
      </motion.div>), document.body)}
    <section className={PANEL}>{loading ? <Spinner /> : !rows.length ? <p className="m-0 text-center text-white/40">Chưa có nhân viên.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Họ tên', 'Chức vụ', 'Điện thoại', 'Email', 'Trạng thái', ''].map(title => <th key={title} className="p-3 text-left text-white/45">{title}</th>)}</tr></thead><tbody>{rows.map(employee => <tr className="border-t border-white/10" key={employee.employee_id}><td className="p-3">{employee.full_name}</td><td className="p-3">{employee.position || '—'}</td><td className="p-3">{employee.phone || '—'}</td><td className="p-3">{employee.email || '—'}</td><td className="p-3">{employee.is_active ? 'Đang làm việc' : 'Ngừng hoạt động'}</td><td className="p-3"><button className={BTN} onClick={() => setForm(employee)}>Sửa</button></td></tr>)}</tbody></table></div>}
      <Pagination page={page} total={total} limit={LIMIT} loading={loading} onChange={setPage} />
    </section>
  </div>;
}
