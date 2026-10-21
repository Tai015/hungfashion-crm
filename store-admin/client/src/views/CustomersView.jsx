import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import TierBadge from '../components/TierBadge';
import Spinner from '../components/Spinner';

export default function CustomersView({ userRole }) {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const [gender, setGender] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [newCustomer, setNewCustomer] = useState({ full_name: '', phone: '', email: '', gender: '' });
  const LIMIT = 15;

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (search) params.set('search', search);
    if (tier) params.set('tier', tier);
    if (gender) params.set('gender', gender);
    apiFetch(`/api/customers?${params}`)
      .then(d => { setCustomers(d.data || []); setTotal(d.total || 0); })
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [search, tier, gender, page, refresh]);

  const addCustomer = async event => {
    event.preventDefault();
    setError('');
    try {
      await apiFetch('/api/customers', {
        method: 'POST',
        body: { ...newCustomer, gender: newCustomer.gender || null, interests: [] },
      });
      setNewCustomer({ full_name: '', phone: '', email: '', gender: '' });
      setPage(1);
      setRefresh(value => value + 1);
    } catch (requestError) { setError(requestError.message); }
  };

  const removeCustomer = async customer => {
    if (!window.confirm(`Xác nhận khóa/xóa hồ sơ ${customer.full_name}?`)) return;
    setError('');
    try {
      await apiFetch(`/api/customers/${customer.customer_id}`, { method: 'DELETE' });
      setRefresh(value => value + 1);
    } catch (requestError) { setError(requestError.message); }
  };

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">CRM</p><h1>Quản lý khách hàng</h1></div>
      </header>

      <div className="filter-toolbar">
        <label className="filter-field search-field">
          <span>Tìm khách hàng</span>
          <input
            className="search-input"
            type="search"
            placeholder="Tên, số điện thoại hoặc email"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </label>
        <label className="filter-field">
          <span>Hạng thành viên</span>
          <select className="filter-select" value={tier} onChange={e => { setTier(e.target.value); setPage(1); }}>
            <option value="">Tất cả hạng</option>
            {['New', 'Regular', 'Silver', 'Gold', 'VIP'].map(t => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="filter-field">
          <span>Giới tính</span>
          <select className="filter-select" value={gender} onChange={e => { setGender(e.target.value); setPage(1); }}>
            <option value="">Tất cả</option><option value="Female">Nữ</option><option value="Male">Nam</option><option value="Other">Khác</option>
          </select>
        </label>
        {(search || tier || gender) && (
          <button className="filter-clear" type="button" onClick={() => { setSearch(''); setTier(''); setGender(''); setPage(1); }}>
            Xóa lọc
          </button>
        )}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {['ADMIN', 'QL_KHACH_HANG'].includes(userRole) && <form className="panel stack-form account-create-form" onSubmit={addCustomer}>
        <h2>Thêm khách hàng</h2>
        <div className="account-form-grid">
          <label>Họ tên<input required maxLength={150} value={newCustomer.full_name} onChange={e => setNewCustomer({ ...newCustomer, full_name: e.target.value })} /></label>
          <label>Số điện thoại<input type="tel" maxLength={30} value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} /></label>
          <label>Email<input type="email" maxLength={150} value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} /></label>
          <label>Giới tính<select value={newCustomer.gender} onChange={e => setNewCustomer({ ...newCustomer, gender: e.target.value })}><option value="">Chưa cung cấp</option><option value="Female">Nữ</option><option value="Male">Nam</option><option value="Other">Khác</option></select></label>
        </div>
        <button className="primary-btn">Thêm khách hàng</button>
      </form>}
      <div className="panel">
        <div className="panel-header">
          <h3>Danh sách ({total.toLocaleString('vi-VN')} khách)</h3>
        </div>
        {loading ? <Spinner /> : (
          <table>
            <thead>
              <tr><th>#</th><th>Họ tên</th><th>SĐT</th><th>Email</th><th>Giới tính</th><th>Hạng</th><th>Điểm</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {customers.length ? customers.map(c => (
                <tr key={c.customer_id}>
                  <td>{c.customer_id}</td>
                  <td><strong>{c.full_name}</strong></td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.gender || '—'}</td>
                  <td><TierBadge tier={c.customer_tier} /></td>
                  <td>{c.loyalty_point}</td>
                  <td>{c.account_status === 'Blocked'
                    ? <span className="muted-label">Đã khóa</span>
                    : <button className="event-btn" onClick={() => removeCustomer(c)}>{c.account_status === 'Active' ? 'Khóa' : 'Xóa hồ sơ'}</button>}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8' }}>Không có khách hàng</td></tr>
              )}
            </tbody>
          </table>
        )}
        {/* Pagination */}
        {total > LIMIT && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 0' }}>
            <button className="event-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Trước</button>
            <span style={{ lineHeight: '32px', fontSize: 13, color: '#94a3b8' }}>Trang {page} / {Math.ceil(total / LIMIT)}</span>
            <button className="event-btn" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}>Sau →</button>
          </div>
        )}
      </div>
    </>
  );
}
