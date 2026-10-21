import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import PasswordInput from '../PasswordInput';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

const ROLE_LABELS = {
  ADMIN: 'Quản trị hệ thống',
  QL_NHAN_SU: 'Quản lý nhân sự',
  QL_KHO: 'Quản lý kho',
  QL_BAN_HANG: 'Quản lý bán hàng',
  QL_KHACH_HANG: 'Quản lý khách hàng',
  KHACH_HANG: 'Khách hàng',
};

export default function AccountsView() {
  const [accounts, setAccounts] = useState([]);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ role_id: '', username: '', password: '', email: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([apiFetch(`/api/accounts?limit=100&search=${encodeURIComponent(search)}`), apiFetch('/api/accounts/roles/all')])
      .then(([accountResult, roleResult]) => {
        setAccounts(accountResult.data || []);
        setRoles(roleResult || []);
        setForm(current => ({ ...current, role_id: current.role_id || String(roleResult[0]?.role_id || '') }));
      })
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [search]);
  const update = async (account, changes) => {
    setError('');
    try {
      const path = changes.role_id ? 'role' : 'status';
      await apiFetch(`/api/accounts/${account.account_id}/${path}`, { method: 'PATCH', body: changes });
      load();
    } catch (requestError) { setError(requestError.message); }
  };
  const createAccount = async event => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await apiFetch('/api/accounts', {
        method: 'POST',
        body: { ...form, role_id: Number(form.role_id) },
      });
      setForm(current => ({ ...current, username: '', password: '', email: '' }));
      setMessage('Đã tạo tài khoản.');
      load();
    } catch (requestError) { setError(requestError.message); }
  };
  return (
    <>
      <header className="topbar"><div><p className="eyebrow">Quản trị</p><h1>Tài khoản và phân quyền</h1></div></header>
      <form className="panel stack-form account-create-form" onSubmit={createAccount}>
        <h2>Tạo tài khoản</h2>
        <div className="account-form-grid">
          <label>Tên đăng nhập<input required minLength={3} maxLength={100} pattern="[A-Za-z0-9_.-]+" autoComplete="off" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></label>
          <label>Mật khẩu<PasswordInput required minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
          <label>Email<input type="email" maxLength={150} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <label>Vai trò<select required value={form.role_id} onChange={e => setForm({ ...form, role_id: e.target.value })}>{roles.map(role => <option key={role.role_id} value={role.role_id}>{ROLE_LABELS[role.role_name] || role.role_name}</option>)}</select></label>
        </div>
        <button className="primary-btn">Tạo tài khoản</button>
      </form>
      {message && <p className="form-success" role="status">{message}</p>}
      <div className="filter-toolbar"><label className="filter-field search-field">Tìm tài khoản
        <input className="search-input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên đăng nhập hoặc email" />
      </label></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="panel table-scroll">
        {loading ? <Spinner /> : <table><thead><tr><th>Tên đăng nhập</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{accounts.map(account => <tr key={account.account_id}>
            <td>{account.username}</td><td>{account.email || '—'}</td>
            <td><select aria-label={`Vai trò ${account.username}`} className="filter-select role-select" value={account.role_name} onChange={e => {
              const role = roles.find(item => item.role_name === e.target.value);
              if (role) update(account, { role_id: role.role_id });
            }}>{roles.map(role => <option key={role.role_id} value={role.role_name}>{ROLE_LABELS[role.role_name] || role.role_name}</option>)}</select></td>
            <td><StatusBadge status={account.status} /></td>
            <td><button className="event-btn" onClick={() => update(account, { status: account.status === 'Active' ? 'Blocked' : 'Active' })}>{account.status === 'Active' ? 'Khóa' : 'Mở khóa'}</button></td>
          </tr>)}
          {!accounts.length && <tr><td colSpan={5} className="empty-state">Không có tài khoản phù hợp.</td></tr>}</tbody>
        </table>}
      </div>
    </>
  );
}
