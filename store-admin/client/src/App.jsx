import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { apiFetch, authHeaders, TOKEN_KEY } from './api';
import AuthScreen from './AuthScreen';
import CustomerPortal from './CustomerPortal';
import PasswordInput from './PasswordInput';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#22c55e'];
const sessionStorageKey = 'store-admin-telemetry-session';

function getTelemetrySessionId() {
  let sessionId = window.sessionStorage.getItem(sessionStorageKey);
  if (!sessionId) {
    sessionId = window.crypto.randomUUID();
    window.sessionStorage.setItem(sessionStorageKey, sessionId);
  }
  return sessionId;
}

async function publishTelemetry(eventPath, event) {
  const response = await fetch(`/api/events/${eventPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      eventId: window.crypto.randomUUID(),
      sessionId: getTelemetrySessionId(),
      occurredAt: new Date().toISOString(),
      page: window.location.pathname,
      ...event,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Event request failed (${response.status})`);
  return result;
}

// Helper format tiền VND
function fmtVND(value) {
  return Number(value || 0).toLocaleString('vi-VN') + 'đ';
}

// Badge màu theo trạng thái đơn hàng
const STATUS_COLOR = {
  Pending:    '#f59e0b',
  Confirmed:  '#3b82f6',
  Processing: '#8b5cf6',
  Shipped:    '#06b6d4',
  Delivered:  '#10b981',
  Cancelled:  '#ef4444',
  Refunded:   '#6b7280',
  Paid:       '#10b981',
};

function StatusBadge({ status }) {
  return (
    <span style={{
      background: (STATUS_COLOR[status] || '#6b7280') + '22',
      color: STATUS_COLOR[status] || '#6b7280',
      border: `1px solid ${STATUS_COLOR[status] || '#6b7280'}44`,
      padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
    }}>
      {status}
    </span>
  );
}

// ─── Tier badge ──────────────────────────────────────────────────────────────
const TIER_COLOR = { VIP: '#f59e0b', Gold: '#eab308', Silver: '#94a3b8', Regular: '#10b981', New: '#6b7280' };
function TierBadge({ tier }) {
  const color = TIER_COLOR[tier] || '#6b7280';
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}44`,
      padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
    }}>{tier}</span>
  );
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────
function NavItem({ label, active, onClick }) {
  return (
    <a
      className={`nav-item${active ? ' active' : ''}`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {label}
    </a>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card${accent ? ' accent' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

// ─── Loading spinner ──────────────────────────────────────────────────────────
function Spinner() {
  return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Đang tải...</div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardView({ userRole }) {
  const [kpi, setKpi] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [byTier, setByTier] = useState([]);
  const [byGender, setByGender] = useState([]);
  const [byAge, setByAge] = useState([]);
  const [byInterest, setByInterest] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [eventFeedback, setEventFeedback] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const canViewCustomerReports = ['ADMIN', 'QL_KHACH_HANG'].includes(userRole);
    const requests = [
      apiFetch('/api/reports/dashboard'),
      apiFetch('/api/reports/revenue?group_by=day'),
      apiFetch('/api/reports/top-products?limit=5'),
      ['ADMIN', 'QL_BAN_HANG'].includes(userRole) ? apiFetch('/api/orders?limit=8') : Promise.resolve(null),
      canViewCustomerReports ? apiFetch('/api/customers?limit=100') : Promise.resolve(null),
      canViewCustomerReports ? apiFetch('/api/reports/interests') : Promise.resolve(null),
    ];
    setError('');
    Promise.all(requests).then(([dash, revenue, products, orderResult, customerResult, interestResult]) => {
      setKpi(dash.kpi);
      setByTier(dash.customersByTier || []);
      setByGender(dash.customersByGender || []);
      if (customerResult) {
        const ageGroups = { 'Dưới 18': 0, '18–24': 0, '25–34': 0, '35–44': 0, 'Từ 45': 0, 'Chưa rõ': 0 };
        for (const customer of customerResult.data || []) {
          const age = customer.age == null ? NaN : Number(customer.age);
          const group = !Number.isFinite(age) ? 'Chưa rõ'
            : age < 18 ? 'Dưới 18' : age <= 24 ? '18–24' : age <= 34 ? '25–34' : age <= 44 ? '35–44' : 'Từ 45';
          ageGroups[group] += 1;
        }
        const ageCounts = Object.entries(ageGroups).map(([age, count]) => ({ age, count })).filter(item => item.count);
        const totalAge = ageCounts.reduce((sum, item) => sum + item.count, 0);
        setByAge(ageCounts.map(item => ({ ...item, percent: Math.round((item.count / totalAge) * 1000) / 10 })));
      }
      setByInterest(interestResult || []);
      setRevenueData(revenue.map(r => ({
        day: new Date(r.period).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        revenue: Number(r.revenue),
      })));
      setTopProducts(products.map(p => ({ name: p.product_name, value: p.total_sold })));
      setRecentOrders(orderResult?.data || []);
      setLastUpdated(new Date());
    }).catch(requestError => setError(requestError.message)).finally(() => setLoading(false));
  }, [userRole]);

  const simulateTransaction = async () => {
    setSimulating(true);
    const amount = (Math.floor(Math.random() * 90) + 10) * 10000;
    try {
      await publishTelemetry('transaction', {
        eventType: 'transaction_completed',
        transactionId: `TX-${Date.now()}`,
        amount, currency: 'VND', status: 'completed',
      });
      setEventFeedback('✅ Đã gửi giao dịch mô phỏng.');
    } catch (e) {
      setEventFeedback(`❌ ${e.message}`);
    } finally {
      setSimulating(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Tổng quan</p>
          <h1>CRM Dashboard – Hung Fashion</h1>
        </div>
        {lastUpdated && (
          <small className="dashboard-updated">
            Cập nhật lúc {lastUpdated.toLocaleString('vi-VN')}
          </small>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </header>

      {/* KPI Cards */}
      <section className="stats-grid">
        <StatCard accent label="Tổng khách hàng" value={(kpi?.total_customers || 0).toLocaleString('vi-VN')} sub={`+${kpi?.new_customers_30d || 0} trong 30 ngày`} />
        <StatCard label="Phản hồi chờ xử lý" value={kpi?.pending_feedbacks || 0} sub="Cần phản hồi" />
        <StatCard label="Khảo sát đang chạy" value={kpi?.active_surveys || 0} sub="Đang thu thập" />
        <StatCard label="Đánh giá trung bình" value={kpi?.avg_rating ? `⭐ ${kpi.avg_rating}` : '—'} sub="/ 5 sao" />
      </section>

      {/* Charts */}
      <section className="chart-grid">
        <div className="panel">
          <div className="panel-header"><h3>Doanh thu theo ngày</h3></div>
          {revenueData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => (v / 1000000).toFixed(1) + 'M'} />
                <Tooltip formatter={v => fmtVND(v)} />
                <Area type="monotone" dataKey="revenue" stroke="#4f46e5" fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Chưa có dữ liệu doanh thu</p>}
        </div>

        <div className="panel">
          <div className="panel-header"><h3>Khách hàng theo hạng</h3></div>
          {byTier.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byTier}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="customer_tier" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[8, 8, 0, 0]}>
                  {byTier.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Chưa có dữ liệu khách hàng</p>}
        </div>
      </section>

      {['ADMIN', 'QL_KHACH_HANG'].includes(userRole) && (
        <section className="chart-grid">
          <div className="panel">
            <div className="panel-header"><h3>Phân bố độ tuổi khách hàng</h3></div>
            {byAge.length ? <ResponsiveContainer width="100%" height={230}><BarChart data={byAge}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="age" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} />
              <Tooltip formatter={value => [`${value}%`, 'Tỷ lệ']} /><Bar dataKey="percent" name="Tỷ lệ (%)" fill="#4f46e5" radius={[6, 6, 0, 0]} />
            </BarChart></ResponsiveContainer> : <p className="empty-state">Chưa có dữ liệu độ tuổi.</p>}
          </div>
          <div className="panel">
            <div className="panel-header"><h3>Sở thích khách hàng</h3></div>
            {byInterest.length ? <ResponsiveContainer width="100%" height={230}><BarChart data={byInterest} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis type="number" allowDecimals={false} /><YAxis dataKey="interest" type="category" width={100} tick={{ fontSize: 11 }} />
              <Tooltip /><Bar dataKey="count" name="Lượt quan tâm" fill="#10b981" radius={[0, 6, 6, 0]} />
            </BarChart></ResponsiveContainer> : <p className="empty-state">Chưa có dữ liệu sở thích.</p>}
          </div>
        </section>
      )}

      <section className="bottom-grid">
        {/* Top sản phẩm */}
        <div className="panel">
          <div className="panel-header"><h3>Top sản phẩm bán chạy</h3></div>
          {topProducts.length ? (
            <div className="list-stack">
              {topProducts.map((p, idx) => (
                <div key={p.name} className="list-row">
                  <div className="product-meta">
                    <span className="badge">#{idx + 1}</span>
                    <span>{p.name}</span>
                  </div>
                  <strong>{p.value} đã bán</strong>
                </div>
              ))}
            </div>
          ) : <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Chưa có đơn hàng nào</p>}
        </div>

        {/* Giới tính pie */}
        <div className="panel">
          <div className="panel-header"><h3>Khách hàng theo giới tính</h3></div>
          {byGender.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={byGender} dataKey="count" nameKey="gender" innerRadius={45} outerRadius={80}
                  label={({ gender, percent }) => `${gender || 'N/A'} ${(percent * 100).toFixed(0)}%`}>
                  {byGender.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v + ' người', n]} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Chưa có dữ liệu</p>}
        </div>

        {/* Đơn hàng gần đây */}
        <div className="panel wide-panel">
          <div className="panel-header">
            <h3>Đơn hàng gần đây</h3>
            <button className="event-btn" onClick={simulateTransaction} disabled={simulating}>
              {simulating ? 'Đang gửi...' : 'Mô phỏng giao dịch'}
            </button>
          </div>
          {eventFeedback && <p className="event-feedback" role="status">{eventFeedback}</p>}
          <table>
            <thead>
              <tr><th>Mã ĐH</th><th>Khách hàng</th><th>Tổng tiền</th><th>Kênh</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {recentOrders.length ? recentOrders.map(o => (
                <tr key={o.order_id}>
                  <td>#{o.order_id}</td>
                  <td>{o.customer_name || '—'}</td>
                  <td>{fmtVND(o.total_amount)}</td>
                  <td>{o.order_channel}</td>
                  <td><StatusBadge status={o.order_status} /></td>
                </tr>
              )) : (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8' }}>Chưa có đơn hàng</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ── Customers View ────────────────────────────────────────────────────────────
function CustomersView({ userRole }) {
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

// ── Products View ─────────────────────────────────────────────────────────────
function ProductsView() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [suppliers, setSuppliers] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const LIMIT = 15;

  useEffect(() => {
    Promise.all([apiFetch('/api/products/categories'), apiFetch('/api/inventory/suppliers')])
      .then(([rows, supplierRows]) => {
        const seen = new Set();
        setCategories(rows.filter(category => {
          if (seen.has(category.category_name)) return false;
          seen.add(category.category_name);
          return true;
        }));
        setSuppliers(supplierRows || []);
      })
      .catch(requestError => setError(requestError.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (search) params.set('search', search);
    if (categoryId) params.set('category_id', categoryId);
    if (supplierId) params.set('supplier_id', supplierId);
    params.set('sort', sort);
    params.set('order', order);
    apiFetch(`/api/products?${params}`)
      .then(d => { setProducts(d.data || []); setTotal(d.total || 0); })
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [search, categoryId, supplierId, page, sort, order]);

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">Kho hàng</p><h1>Quản lý sản phẩm</h1></div>
      </header>
      <div className="filter-toolbar">
        <label className="filter-field search-field">
          <span>Tìm sản phẩm</span>
          <input className="search-input" type="search" placeholder="Tên sản phẩm"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <label className="filter-field">
          <span>Danh mục</span>
          <select className="filter-select" value={categoryId}
            onChange={e => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">Tất cả danh mục</option>
            {categories.map(category => (
              <option key={category.category_id} value={category.category_id}>{category.category_name}</option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Nhà cung cấp</span>
          <select className="filter-select" value={supplierId} onChange={e => { setSupplierId(e.target.value); setPage(1); }}>
            <option value="">Tất cả nhà cung cấp</option>
            {suppliers.map(supplier => <option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.supplier_name}</option>)}
          </select>
        </label>
        <label className="filter-field">
          <span>Sắp xếp</span>
          <select className="filter-select" value={`${sort}-${order}`} onChange={e => { const [nextSort, nextOrder] = e.target.value.split('-'); setSort(nextSort); setOrder(nextOrder); }}>
            <option value="created_at-desc">Mới nhất</option><option value="name-asc">Tên A–Z</option><option value="price-asc">Giá thấp đến cao</option><option value="price-desc">Giá cao đến thấp</option>
          </select>
        </label>
        {(search || categoryId || supplierId) && (
          <button className="filter-clear" type="button" onClick={() => { setSearch(''); setCategoryId(''); setSupplierId(''); setPage(1); }}>
            Xóa lọc
          </button>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="panel">
        <div className="panel-header"><h3>Sản phẩm ({total.toLocaleString('vi-VN')})</h3></div>
        {loading ? <Spinner /> : (
          <table>
            <thead>
              <tr><th>#</th><th>Tên sản phẩm</th><th>Danh mục</th><th>Giá nhập</th><th>Giá bán</th><th>Tồn kho</th></tr>
            </thead>
            <tbody>
              {products.length ? products.map(p => (
                <tr key={p.product_id}>
                  <td>{p.product_id}</td>
                  <td><strong>{p.product_name}</strong></td>
                  <td>{p.category_name}</td>
                  <td>{fmtVND(p.import_price)}</td>
                  <td>{fmtVND(p.selling_price)}</td>
                  <td>
                    <span style={{ color: p.total_stock <= 5 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                      {p.total_stock}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>Chưa có sản phẩm</td></tr>
              )}
            </tbody>
          </table>
        )}
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

// ── Feedbacks View ────────────────────────────────────────────────────────────
function FeedbacksView() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    apiFetch(`/api/feedbacks?${params}`)
      .then(d => { setFeedbacks(d.data || []); setTotal(d.total || 0); })
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [status, search, page, refresh]);

  const STAR = n => '⭐'.repeat(n || 0);

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">CRM</p><h1>Phản hồi khách hàng</h1></div>
      </header>
      <div className="filter-toolbar filter-toolbar-compact">
        <label className="filter-field search-field">
          <span>Tìm phản hồi</span>
          <input className="search-input" type="search" placeholder="Tên khách hàng hoặc nội dung" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <label className="filter-field">
          <span>Trạng thái phản hồi</span>
          <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {['New', 'Processing', 'Resolved', 'Rejected'].map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        {status && <button className="filter-clear" type="button" onClick={() => setStatus('')}>Xóa lọc</button>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="panel">
        <div className="panel-header"><h3>Phản hồi ({total})</h3></div>
        {loading ? <Spinner /> : (
          <table>
            <thead>
              <tr><th>#</th><th>Khách hàng</th><th>Loại</th><th>Sản phẩm</th><th>Đánh giá</th><th>Nội dung</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {feedbacks.length ? feedbacks.map(f => (
                <tr key={f.feedback_id}>
                  <td>{f.feedback_id}</td>
                  <td>{f.customer_name || 'Ẩn danh'}</td>
                  <td>{f.feedback_type}</td>
                  <td>{f.product_name || '—'}</td>
                  <td>{f.rating ? STAR(f.rating) : '—'}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.content}</td>
                  <td>
                    <StatusBadge status={f.status} />
                    {f.reply && <small className="feedback-reply">Đã trả lời: {f.reply}</small>}
                    {f.status !== 'Resolved' && <FeedbackReply feedback={f} onSaved={() => setRefresh(value => value + 1)} />}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>Chưa có phản hồi</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {total > LIMIT && <div className="pagination">
        <button className="event-btn" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>← Trước</button>
        <span>Trang {page} / {Math.ceil(total / LIMIT)}</span>
        <button className="event-btn" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(value => value + 1)}>Sau →</button>
      </div>}
    </>
  );
}

function FeedbackReply({ feedback, onSaved }) {
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/feedbacks/${feedback.feedback_id}/reply`, { method: 'PATCH', body: { reply } });
      onSaved();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  return <form className="feedback-reply-form" onSubmit={submit}>
    <textarea aria-label={`Trả lời phản hồi ${feedback.feedback_id}`} required maxLength={5000} rows={2} value={reply} onChange={e => setReply(e.target.value)} placeholder="Nhập nội dung trả lời..." />
    {error && <small className="form-error">{error}</small>}
    <button className="event-btn" disabled={busy}>{busy ? 'Đang gửi...' : 'Gửi trả lời'}</button>
  </form>;
}

// ── Surveys View ──────────────────────────────────────────────────────────────
function SurveysView() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState([]);
  const [editingSurveyId, setEditingSurveyId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [message, setMessage] = useState('');
  const formRef = useRef(null);

  useEffect(() => {
    setError('');
    setLoading(true);
    apiFetch('/api/surveys')
      .then(d => setSurveys(Array.isArray(d) ? d : []))
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [refresh]);

  const STATUS_LABEL = { Draft: '🔘 Nháp', Active: '🟢 Đang chạy', Closed: '⛔ Đã đóng' };
  const createQuestion = () => ({
    key: window.crypto.randomUUID(),
    question_text: '',
    question_type: 'SingleChoice',
    is_required: true,
    options: ['Rất hài lòng', 'Hài lòng', 'Bình thường', 'Chưa hài lòng'],
  });
  const openCreateForm = () => {
    setEditingSurveyId(null);
    setTitle('');
    setDescription('');
    setQuestions([createQuestion()]);
    setError('');
    setMessage('');
    setFormOpen(true);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const openEditForm = async id => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const survey = await apiFetch(`/api/surveys/${id}`);
      setEditingSurveyId(id);
      setTitle(survey.title || '');
      setDescription(survey.description || '');
      setQuestions(survey.questions.map(question => ({
        key: window.crypto.randomUUID(),
        question_text: question.question_text,
        question_type: question.question_type,
        is_required: question.is_required,
        options: question.options.map(option => option.option_text),
      })));
      setFormOpen(true);
      window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditingSurveyId(null);
    setError('');
  };
  const updateQuestion = (key, update) => {
    setQuestions(current => current.map(question => question.key === key
      ? { ...question, ...update }
      : question));
  };
  const updateQuestionType = (question, question_type) => {
    updateQuestion(question.key, {
      question_type,
      options: ['SingleChoice', 'MultiChoice'].includes(question_type)
        ? question.options.length >= 2 ? question.options : ['', '']
        : [],
    });
  };
  const updateOption = (questionKey, optionIndex, value) => {
    setQuestions(current => current.map(question => question.key === questionKey
      ? { ...question, options: question.options.map((option, index) => index === optionIndex ? value : option) }
      : question));
  };
  const addOption = questionKey => {
    setQuestions(current => current.map(question => question.key === questionKey
      ? { ...question, options: [...question.options, ''] }
      : question));
  };
  const removeOption = (questionKey, optionIndex) => {
    setQuestions(current => current.map(question => question.key === questionKey
      ? { ...question, options: question.options.filter((_, index) => index !== optionIndex) }
      : question));
  };
  const saveSurvey = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        title,
        description,
        questions: questions.map((question, index) => ({
          question_text: question.question_text,
          question_type: question.question_type,
          display_order: index + 1,
          is_required: question.is_required,
          options: question.options.map((option, optionIndex) => ({
            option_text: option,
            display_order: optionIndex + 1,
          })),
        })),
      };
      await apiFetch(editingSurveyId ? `/api/surveys/${editingSurveyId}` : '/api/surveys', {
        method: editingSurveyId ? 'PATCH' : 'POST',
        body: payload,
      });
      setFormOpen(false);
      setEditingSurveyId(null);
      setMessage(editingSurveyId
        ? 'Đã cập nhật khảo sát nháp.'
        : 'Đã tạo khảo sát nháp. Bạn có thể gửi khảo sát từ danh sách bên dưới.');
      setRefresh(value => value + 1);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  const sendSurvey = async id => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiFetch(`/api/surveys/${id}/send`, { method: 'POST', body: {} });
      setMessage(result.message);
      setRefresh(value => value + 1);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  const loadResults = async id => {
    setError('');
    try { setResults(await apiFetch(`/api/surveys/${id}/results`)); }
    catch (requestError) { setError(requestError.message); }
  };
  const questionTypeLabels = {
    SingleChoice: 'Chọn một đáp án',
    MultiChoice: 'Chọn nhiều đáp án',
    Text: 'Trả lời tự luận',
    Rating: 'Đánh giá 1–5 sao',
  };

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">CRM</p><h1>Khảo sát khách hàng</h1></div>
        <button className="primary-btn survey-open-form" type="button" onClick={openCreateForm}>＋ Tạo khảo sát</button>
      </header>
      {error && <p className="settings-message settings-error" role="alert">{error}</p>}
      {message && <p className="settings-message settings-success" role="status">{message}</p>}
      {formOpen && <form ref={formRef} className="panel survey-create-form" onSubmit={saveSurvey}>
        <div className="survey-create-heading">
          <div className="survey-create-icon" aria-hidden="true">✦</div>
          <div>
            <p className="eyebrow">BỘ CÔNG CỤ CRM</p>
            <h2>{editingSurveyId ? 'Chỉnh sửa khảo sát' : 'Tạo khảo sát mới'}</h2>
            <p>Thêm nhiều câu hỏi, chọn kiểu trả lời và xem trước nội dung trước khi lưu.</p>
          </div>
          <button className="survey-close-form" type="button" onClick={closeForm} aria-label="Đóng biểu mẫu">×</button>
        </div>
        <div className="survey-create-layout">
          <div className="survey-create-fields">
            <label className="survey-field">
              <span>Tên khảo sát <b>*</b></span>
              <input required maxLength={300} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Khảo sát trải nghiệm mua sắm" />
              <small>Tên ngắn gọn giúp khách hàng nhận biết nội dung khảo sát.</small>
            </label>
            <label className="survey-field">
              <span>Mô tả <small>Không bắt buộc</small></span>
              <textarea maxLength={2000} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Cho khách hàng biết mục đích và thời gian hoàn thành khảo sát." />
            </label>
            <div className="survey-question-builder">
              <div className="survey-question-builder-heading">
                <div><h3>Câu hỏi</h3><p>Tạo tối đa 50 câu hỏi cho một khảo sát.</p></div>
                <button className="survey-add-question" type="button" disabled={questions.length >= 50} onClick={() => setQuestions(current => [...current, createQuestion()])}>＋ Thêm câu hỏi</button>
              </div>
              {questions.map((question, index) => (
                <section className="survey-question-editor" key={question.key}>
                  <div className="survey-question-editor-heading">
                    <span className="survey-question-number">{String(index + 1).padStart(2, '0')}</span>
                    <strong>Câu hỏi {index + 1}</strong>
                    <button className="survey-remove-question" type="button" disabled={questions.length === 1} onClick={() => setQuestions(current => current.filter(item => item.key !== question.key))}>Xóa câu hỏi</button>
                  </div>
                  <label className="survey-field">
                    <span>Nội dung câu hỏi <b>*</b></span>
                    <textarea required maxLength={1000} rows={2} value={question.question_text} onChange={e => updateQuestion(question.key, { question_text: e.target.value })} placeholder="Nhập nội dung câu hỏi..." />
                  </label>
                  <div className="survey-question-settings">
                    <label className="survey-field">
                      <span>Kiểu trả lời</span>
                      <select value={question.question_type} onChange={e => updateQuestionType(question, e.target.value)}>
                        {Object.entries(questionTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="survey-required-toggle">
                      <input type="checkbox" checked={question.is_required} onChange={e => updateQuestion(question.key, { is_required: e.target.checked })} />
                      Bắt buộc trả lời
                    </label>
                  </div>
                  {['SingleChoice', 'MultiChoice'].includes(question.question_type) && (
                    <div className="survey-option-editor">
                      <div className="survey-option-heading"><strong>Các lựa chọn</strong><small>Cần ít nhất 2 lựa chọn</small></div>
                      {question.options.map((option, optionIndex) => (
                        <div className="survey-option-input" key={`${question.key}-option-${optionIndex}`}>
                          <i>{String.fromCharCode(65 + (optionIndex % 26))}</i>
                          <input required maxLength={300} aria-label={`Lựa chọn ${optionIndex + 1} cho câu ${index + 1}`} value={option} onChange={e => updateOption(question.key, optionIndex, e.target.value)} placeholder={`Lựa chọn ${optionIndex + 1}`} />
                          <button type="button" aria-label={`Xóa lựa chọn ${optionIndex + 1}`} disabled={question.options.length <= 2} onClick={() => removeOption(question.key, optionIndex)}>×</button>
                        </div>
                      ))}
                      <button className="survey-add-option" type="button" disabled={question.options.length >= 100} onClick={() => addOption(question.key)}>＋ Thêm lựa chọn</button>
                    </div>
                  )}
                  {question.question_type === 'Rating' && <p className="survey-field-hint">Khách hàng sẽ đánh giá theo thang điểm từ 1 đến 5 sao.</p>}
                  {question.question_type === 'Text' && <p className="survey-field-hint">Khách hàng sẽ nhập câu trả lời dạng văn bản.</p>}
                </section>
              ))}
            </div>
            <div className="survey-create-actions">
              <span><i aria-hidden="true">●</i> Khảo sát được lưu ở trạng thái nháp</span>
              <div>
                <button className="survey-cancel-button" type="button" onClick={closeForm}>Hủy</button>
                <button className="primary-btn" disabled={busy}>{busy ? 'Đang lưu...' : editingSurveyId ? 'Lưu thay đổi' : 'Tạo khảo sát nháp'}</button>
              </div>
            </div>
          </div>
          <aside className="survey-preview" aria-label="Xem trước khảo sát">
            <div className="survey-preview-top"><span>✦</span><small>XEM TRƯỚC</small></div>
            <p className="eyebrow">HUNG FASHION · KHẢO SÁT</p>
            <h3>{title.trim() || 'Tên khảo sát của bạn'}</h3>
            <p className="survey-preview-description">{description.trim() || 'Mô tả khảo sát sẽ hiển thị ở đây để khách hàng hiểu mục đích.'}</p>
            {questions.map((question, index) => (
              <div className="survey-preview-question" key={question.key}>
                <span>{String(index + 1).padStart(2, '0')} <b>{question.is_required ? 'CÂU HỎI BẮT BUỘC' : 'CÂU HỎI KHÔNG BẮT BUỘC'}</b></span>
                <p>{question.question_text.trim() || `Câu hỏi ${index + 1} sẽ hiển thị ở đây.`}</p>
                {question.question_type === 'Rating'
                  ? <div className="survey-preview-rating" aria-label="Thang điểm từ 1 đến 5">★ ★ ★ ★ ★</div>
                  : question.question_type === 'Text'
                    ? <div className="survey-preview-text">Câu trả lời của khách hàng...</div>
                    : question.options.map((option, optionIndex) => (
                      <div className="survey-preview-option" key={`${question.key}-preview-${optionIndex}`}><i>{question.question_type === 'MultiChoice' ? '✓' : String.fromCharCode(65 + (optionIndex % 26))}</i>{option.trim() || `Lựa chọn ${optionIndex + 1}`}</div>
                    ))}
              </div>
            ))}
          </aside>
        </div>
      </form>}
      <div className="panel">
        <div className="panel-header"><h3>Danh sách khảo sát</h3></div>
        {loading ? <Spinner /> : (
          <table>
            <thead>
              <tr><th>#</th><th>Tiêu đề</th><th>Câu hỏi</th><th>Phản hồi</th><th>Ngày kết thúc</th><th>Trạng thái</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {surveys.length ? surveys.map(s => (
                <tr key={s.survey_id}>
                  <td>{s.survey_id}</td>
                  <td><strong>{s.title}</strong></td>
                  <td style={{ textAlign: 'center' }}>{s.question_count}</td>
                  <td style={{ textAlign: 'center' }}>{s.response_count}</td>
                  <td>{s.end_date ? new Date(s.end_date).toLocaleDateString('vi-VN') : '—'}</td>
                  <td>{STATUS_LABEL[s.status] || s.status}</td>
                  <td className="action-cell">
                    {s.status === 'Draft' && <button className="survey-edit-button" type="button" disabled={busy} onClick={() => openEditForm(s.survey_id)}>Sửa</button>}
                    {s.status !== 'Closed' && <button className="event-btn" type="button" disabled={busy} onClick={() => sendSurvey(s.survey_id)}>Gửi khảo sát</button>}
                    <button className="text-button" type="button" onClick={() => loadResults(s.survey_id)}>Kết quả</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>Chưa có khảo sát</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {results && <div className="panel survey-results">
        <div className="panel-header"><h3>Kết quả: {results.title} ({results.total_responses} lượt trả lời)</h3><button className="text-button" type="button" onClick={() => setResults(null)}>Đóng</button></div>
        {results.questions.map(item => <section key={item.question_id}>
          <h4>{item.question_text}</h4>
          {item.options.length ? <ResponsiveContainer width="100%" height={200}><BarChart data={item.options}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="option_text" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} />
            <Tooltip /><Bar dataKey="vote_count" name={item.question_type === 'Rating' ? 'Lượt đánh giá' : 'Lượt chọn'} fill="#4f46e5" radius={[6, 6, 0, 0]} />
          </BarChart></ResponsiveContainer> : <small>{item.question_type === 'Rating' ? 'Chưa có lượt đánh giá.' : `Câu hỏi tự luận: ${results.total_responses} lượt trả lời.`}</small>}
        </section>)}
      </div>}
    </>
  );
}

function SettingsView() {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const restoreFileInput = useRef(null);
  const [databaseConfirmation, setDatabaseConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  const loadSettings = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    else setProductsLoading(true);
    setLoadError('');
    try {
      const [statusResult, productsResult] = await Promise.allSettled([
        apiFetch('/api/settings/status'),
        apiFetch('/api/settings/catalog-products?limit=50'),
      ]);
      const failures = [];
      if (statusResult.status === 'fulfilled') setSettings(statusResult.value);
      else failures.push(`Thông tin hệ thống: ${statusResult.reason?.message || String(statusResult.reason)}`);
      if (productsResult.status === 'fulfilled') setProducts(productsResult.value.products || []);
      else failures.push(`Danh sách sản phẩm trong catalog: ${productsResult.reason?.message || String(productsResult.reason)}`);
      if (failures.length) setLoadError(failures.join(' '));
    } finally {
      setLoading(false);
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings({ initial: true });
  }, [loadSettings]);

  const scrapeProducts = async () => {
    setScraping(true);
    setError('');
    setMessage('');
    try {
      const result = await apiFetch('/api/settings/scrape', { method: 'POST' });
      await loadSettings();
      setMessage(
        `Đã thêm ${result.insertedCount} sản phẩm mới, cập nhật ${result.updatedCount} sản phẩm từ ${result.sourceName}. Tồn kho sản phẩm mới đang là 0.`,
      );
    } catch (scrapeError) {
      setError(scrapeError.message);
    } finally {
      setScraping(false);
    }
  };

  const downloadBackup = async () => {
    setBackingUp(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/settings/database/backup', { headers: authHeaders() });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) {
          window.localStorage.removeItem(TOKEN_KEY);
          window.dispatchEvent(new Event('auth:expired'));
        }
        throw new Error(result.message || `Không thể sao lưu CSDL (${response.status}).`);
      }
      const backup = await response.blob();
      const downloadUrl = URL.createObjectURL(backup);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]
        || 'hungfashion-backup.dump';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setMessage('Đã tạo và tải bản sao lưu PostgreSQL.');
    } catch (backupError) {
      setError(backupError.message);
    } finally {
      setBackingUp(false);
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile || !settings) return;
    setRestoring(true);
    setError('');
    setMessage('');
    try {
      if (restoreFile.size > settings.maxRestoreBytes) {
        throw new Error(`Tệp sao lưu vượt quá giới hạn ${Math.round(settings.maxRestoreBytes / 1024 / 1024)} MB.`);
      }
      const response = await fetch('/api/settings/database/restore', {
        method: 'POST',
        headers: authHeaders({
          'content-type': 'application/octet-stream',
          'x-restore-database': databaseConfirmation,
        }),
        body: restoreFile,
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.localStorage.removeItem(TOKEN_KEY);
        window.dispatchEvent(new Event('auth:expired'));
      }
      if (!response.ok) throw new Error(result.message || `Không thể phục hồi CSDL (${response.status}).`);
      setDatabaseConfirmation('');
      setRestoreFile(null);
      if (restoreFileInput.current) restoreFileInput.current.value = '';
      setMessage(result.message || 'Đã phục hồi cơ sở dữ liệu.');
      await loadSettings();
    } catch (restoreError) {
      setError(restoreError.message);
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = value => value
    ? new Date(value).toLocaleString('vi-VN')
    : 'Chưa có';
  const formatCatalogPrice = product => `${Number(product.sellingPrice).toLocaleString('vi-VN')}đ`;
  const handleRestoreFile = file => {
    setError('');
    setMessage('');
    setRestoreFile(file);
    if (file && !file.name.toLowerCase().endsWith('.dump')) {
      setError('Vui lòng chọn tệp sao lưu có đuôi .dump.');
      setRestoreFile(null);
      if (restoreFileInput.current) restoreFileInput.current.value = '';
    } else if (file && settings && file.size > settings.maxRestoreBytes) {
      setError(`Tệp vượt quá giới hạn ${Math.round(settings.maxRestoreBytes / 1024 / 1024)} MB.`);
      setRestoreFile(null);
      if (restoreFileInput.current) restoreFileInput.current.value = '';
    }
  };

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">Quản trị</p><h1>Cài đặt hệ thống</h1></div>
      </header>

      {error && <p className="settings-message settings-error" role="alert">{error}</p>}
      {message && <p className="settings-message settings-success" role="status">{message}</p>}
      {loadError && <div className="settings-load-error" role="alert">
        <p>{loadError}</p>
        <button className="event-btn" type="button" onClick={() => loadSettings({ initial: true })} disabled={loading}>
          {loading ? 'Đang tải...' : 'Thử tải lại'}
        </button>
      </div>}
      {loading ? <Spinner /> : (
        <>
          <div className="settings-toolbar">
            <span>{settings?.databaseName ? `Đang kết nối: ${settings.databaseName}` : 'Chưa tải được thông tin cơ sở dữ liệu'}</span>
            <button className="event-btn" type="button" onClick={() => loadSettings()} disabled={productsLoading}>
              {productsLoading ? 'Đang làm mới...' : 'Làm mới thông tin'}
            </button>
          </div>
          <section className="settings-grid">
            <div className="panel settings-card">
              <div>
                <p className="eyebrow">Danh mục sản phẩm</p>
                <h2>Cào dữ liệu thời trang mẫu</h2>
                <p>
                  Python cào trực tiếp trang HTML Fashion Studio, chuẩn hóa rồi thêm hoặc cập nhật
                  sản phẩm, danh mục, thương hiệu, biến thể và hình ảnh trong catalog CRM.
                  Sản phẩm mới có tồn kho 0; hãy lập phiếu nhập kho trước khi bán.
                </p>
                <dl className="settings-details">
                  <div><dt>Nguồn</dt><dd>{settings?.sourceName || '—'}</dd></div>
                  <div><dt>Sản phẩm trong catalog</dt><dd>{settings?.catalogProductCount ?? 0}</dd></div>
                  <div><dt>Nhập gần nhất</dt><dd>{formatDate(settings?.lastCatalogImportAt)}</dd></div>
                </dl>
              </div>
              <button className="primary-btn" type="button" onClick={scrapeProducts} disabled={scraping}>
                {scraping ? 'Đang cào dữ liệu...' : 'Cào và nhập sản phẩm'}
              </button>
            </div>

            <div className="panel settings-card">
              <div>
                <p className="eyebrow">PostgreSQL</p>
                <h2>Sao lưu cơ sở dữ liệu</h2>
                <p>
                  Tải về bản sao lưu định dạng PostgreSQL custom, có cả cấu trúc và dữ liệu.
                  Tệp sao lưu chỉ được giữ trên thiết bị của bạn.
                </p>
                <dl className="settings-details">
                  <div><dt>Cơ sở dữ liệu</dt><dd>{settings?.databaseName || '—'}</dd></div>
                  <div><dt>Kích thước hiện tại</dt><dd>{settings?.databaseSize || '—'}</dd></div>
                </dl>
              </div>
              <button className="primary-btn" type="button" onClick={downloadBackup} disabled={backingUp}>
                {backingUp ? 'Đang tạo bản sao lưu...' : 'Tải bản sao lưu'}
              </button>
            </div>

            <div className="panel settings-card settings-restore-card">
              <div>
                <p className="eyebrow">Thao tác nguy hiểm</p>
                <h2>Phục hồi cơ sở dữ liệu</h2>
                <p className="settings-danger">
                  Phục hồi sẽ thay thế dữ liệu hiện tại. Chỉ chọn tệp .dump đáng tin cậy
                  đã tạo bằng công cụ sao lưu của ứng dụng.
                </p>
                {!settings?.restoreEnabled && (
                  <p className="settings-note">
                    Chức năng đang tắt. Đặt <code>ENABLE_DATABASE_RESTORE=true</code> trong
                    cấu hình server rồi khởi động lại API để bật.
                  </p>
                )}
                <label className="settings-file-field">
                  <span>Tệp sao lưu (.dump, tối đa {Math.round((settings?.maxRestoreBytes || 0) / 1024 / 1024)} MB)</span>
                  <input
                    ref={restoreFileInput}
                    type="file"
                    accept=".dump,application/octet-stream"
                    onChange={event => handleRestoreFile(event.target.files?.[0] || null)}
                    disabled={!settings?.restoreEnabled || restoring}
                  />
                  {restoreFile && <small className="settings-file-meta">{restoreFile.name} · {(restoreFile.size / 1024 / 1024).toFixed(2)} MB</small>}
                </label>
                <label className="settings-file-field">
                  <span>Nhập chính xác tên CSDL: {settings?.databaseName || '—'}</span>
                  <input
                    className="search-input"
                    type="text"
                    value={databaseConfirmation}
                    onChange={event => setDatabaseConfirmation(event.target.value)}
                    autoComplete="off"
                    disabled={!settings?.restoreEnabled || restoring}
                  />
                </label>
              </div>
              <button
                className="settings-restore-button"
                type="button"
                onClick={restoreBackup}
                disabled={
                  !settings?.restoreEnabled
                  || !restoreFile
                  || restoreFile.size > (settings?.maxRestoreBytes || 0)
                  || databaseConfirmation !== settings?.databaseName
                  || restoring
                }
              >
                {restoring ? 'Đang phục hồi...' : 'Phục hồi và thay thế dữ liệu hiện tại'}
              </button>
            </div>
          </section>

          <div className="panel settings-products">
            <div className="panel-header">
              <div>
                <h3>Sản phẩm catalog từ nguồn demo ({settings?.catalogProductCount ?? 0})</h3>
                <small className="settings-file-meta">Hiển thị tối đa 50 sản phẩm mới nhất</small>
              </div>
            </div>
            <div className="settings-table-wrap">
              <table>
                <thead>
                  <tr><th>Sản phẩm</th><th>Giá bán</th><th>Danh mục / thương hiệu</th><th>SKU</th></tr>
                </thead>
                <tbody>
                  {products.length ? products.map(product => (
                    <tr key={product.productId}>
                      <td>{product.productName}</td>
                      <td>{formatCatalogPrice(product)}</td>
                      <td>{product.categoryName} / {product.brandName || '—'}</td>
                      <td>{product.sku}</td>
                    </tr>
                  )) : loadError ? (
                    <tr><td colSpan={4} className="settings-empty">Không tải được danh sách sản phẩm. Hãy thử tải lại thông tin.</td></tr>
                  ) : (
                    <tr><td colSpan={4} className="settings-empty">Chưa có sản phẩm được nhập.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

const ROLE_LABELS = {
  ADMIN: 'Quản trị hệ thống',
  QL_NHAN_SU: 'Quản lý nhân sự',
  QL_KHO: 'Quản lý kho',
  QL_BAN_HANG: 'Quản lý bán hàng',
  QL_KHACH_HANG: 'Quản lý khách hàng',
  KHACH_HANG: 'Khách hàng',
};

const ROLE_NAVIGATION = {
  ADMIN: [
    ['dashboard', 'Tổng quan'], ['accounts', 'Tài khoản'], ['customers', 'Khách hàng'],
    ['products', 'Sản phẩm'], ['feedbacks', 'Phản hồi'], ['surveys', 'Khảo sát'], ['settings', 'Cài đặt'],
  ],
  QL_KHACH_HANG: [
    ['dashboard', 'Tổng quan CRM'], ['customers', 'Khách hàng'], ['feedbacks', 'Phản hồi'], ['surveys', 'Khảo sát'],
  ],
  QL_NHAN_SU: [['employees', 'Nhân viên'], ['dashboard', 'Báo cáo']],
  QL_KHO: [['products', 'Sản phẩm'], ['inventory', 'Tồn kho'], ['receipts', 'Phiếu kho']],
  QL_BAN_HANG: [['orders', 'Đơn hàng'], ['promotions', 'Khuyến mãi'], ['dashboard', 'Báo cáo']],
};

const ROLE_ROUTE_PREFIX = {
  ADMIN: 'admin',
  QL_KHACH_HANG: 'crm',
  QL_NHAN_SU: 'nhansu',
  QL_KHO: 'kho',
  QL_BAN_HANG: 'banhang',
};

function roleRoute(role, section) {
  return `#/${ROLE_ROUTE_PREFIX[role] || 'admin'}/${section}`;
}

function sectionFromHash() {
  return window.location.hash.split('/').at(-1) || 'dashboard';
}

function AccountsView() {
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

const OPERATION_CONFIG = {
  employees: { title: 'Danh sách nhân viên', endpoint: '/api/employees', fields: [['employee_id', 'Mã'], ['full_name', 'Họ tên'], ['position', 'Chức vụ'], ['email', 'Email'], ['phone', 'Điện thoại'], ['is_active', 'Trạng thái']] },
  inventory: { title: 'Theo dõi tồn kho', endpoint: '/api/inventory', fields: [['sku', 'SKU'], ['product_name', 'Sản phẩm'], ['category_name', 'Danh mục'], ['size_name', 'Size'], ['color_name', 'Màu'], ['quantity', 'Tồn kho']] },
  receipts: { title: 'Phiếu nhập và xuất kho', endpoint: '/api/inventory/receipts', fields: [['receipt_id', 'Mã phiếu'], ['receipt_type', 'Loại phiếu'], ['supplier_name', 'Nhà cung cấp'], ['employee_name', 'Nhân viên'], ['total_amount', 'Tổng tiền'], ['receipt_date', 'Ngày tạo']] },
  orders: { title: 'Quản lý đơn hàng', endpoint: '/api/orders?limit=100', fields: [['order_id', 'Mã đơn'], ['customer_name', 'Khách hàng'], ['order_channel', 'Kênh bán'], ['total_amount', 'Tổng tiền'], ['order_status', 'Trạng thái'], ['ordered_at', 'Ngày tạo']] },
  promotions: { title: 'Chương trình khuyến mãi', endpoint: '/api/promotions?limit=100', fields: [['code', 'Mã'], ['name', 'Tên chương trình'], ['promo_type', 'Loại'], ['value', 'Giá trị'], ['start_date', 'Bắt đầu'], ['end_date', 'Kết thúc']] },
};

function OperationsView({ type }) {
  const config = OPERATION_CONFIG[type];
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => {
    setLoading(true);
    setError('');
    let url = config.endpoint;
    if (type === 'employees') url += `?limit=100&search=${encodeURIComponent(search)}`;
    if (type === 'inventory') url += `?search=${encodeURIComponent(search)}${lowStock ? '&low_stock=true' : ''}`;
    apiFetch(url)
      .then(result => setRows(Array.isArray(result) ? result : result.data || []))
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [search, lowStock, type]);
  const updateOrderStatus = async (row, status) => {
    setError('');
    try {
      await apiFetch(`/api/orders/${row.order_id}/status`, { method: 'PATCH', body: { status } });
      load();
    } catch (requestError) { setError(requestError.message); }
  };
  const display = (key, value) => {
    if (value == null || value === '') return '—';
    if (key === 'total_amount' || key === 'selling_price') return fmtVND(value);
    if (key.endsWith('_at') || key.endsWith('_date')) return new Date(value).toLocaleDateString('vi-VN');
    if (key === 'is_active') return value ? 'Đang làm việc' : 'Ngừng hoạt động';
    if (key === 'quantity' && type === 'inventory') return <strong className={Number(value) <= 5 ? 'stock-low' : ''}>{value}</strong>;
    if (key === 'order_status') return <StatusBadge status={value} />;
    return String(value);
  };
  const orderStatuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'];
  return (
    <>
      <header className="topbar"><div><p className="eyebrow">{ROLE_LABELS[type === 'employees' ? 'QL_NHAN_SU' : type === 'inventory' || type === 'receipts' ? 'QL_KHO' : 'QL_BAN_HANG']}</p><h1>{config.title}</h1></div></header>
      {(type === 'employees' || type === 'inventory') && <div className="filter-toolbar">
        <label className="filter-field search-field">Tìm kiếm<input className="search-input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nhập từ khóa..." /></label>
        {type === 'inventory' && <label className="checkbox-filter"><input type="checkbox" checked={lowStock} onChange={e => setLowStock(e.target.checked)} /> Chỉ hiện tồn kho thấp (≤ 5)</label>}
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="panel table-scroll">
        {loading ? <Spinner /> : <table><thead><tr>{config.fields.map(([, label]) => <th key={label}>{label}</th>)}{type === 'orders' && <th>Cập nhật</th>}</tr></thead>
          <tbody>{rows.map(row => <tr key={row[config.fields[0][0]]}>{config.fields.map(([key]) => <td key={key}>{display(key, row[key])}</td>)}
            {type === 'orders' && <td><select className="filter-select role-select" value={row.order_status} aria-label={`Trạng thái đơn ${row.order_id}`} onChange={e => updateOrderStatus(row, e.target.value)}>{orderStatuses.map(status => <option key={status}>{status}</option>)}</select></td>}
          </tr>)}
          {!rows.length && <tr><td colSpan={config.fields.length + (type === 'orders' ? 1 : 0)} className="empty-state">Chưa có dữ liệu.</td></tr>}</tbody>
        </table>}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const [view, setView] = useState(sectionFromHash);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const pageViewTracked = useRef(false);

  useEffect(() => {
    if (!pageViewTracked.current) {
      pageViewTracked.current = true;
      publishTelemetry('user', { eventType: 'page_view' }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    let active = true;
    const expire = () => { setUser(null); setView('dashboard'); };
    window.addEventListener('auth:expired', expire);
    if (!token) setAuthLoading(false);
    else {
      apiFetch('/api/auth/me')
        .then(currentUser => { if (active) setUser(currentUser); })
        .catch(() => { if (active) setUser(null); })
        .finally(() => { if (active) setAuthLoading(false); });
    }
    return () => { active = false; window.removeEventListener('auth:expired', expire); };
  }, []);

  const recordNavigation = (section) => {
    setView(section);
    window.location.hash = roleRoute(role, section);
    publishTelemetry('user', { eventType: 'navigation_click', section }).catch(() => {});
  };

  const role = user?.role;
  const navItems = ROLE_NAVIGATION[role] || [];
  useEffect(() => {
    if (!role || role === 'KHACH_HANG') return undefined;
    const syncRoute = () => {
      const section = sectionFromHash();
      if (navItems.some(([key]) => key === section)) setView(section);
      else {
        setView('dashboard');
        window.location.hash = roleRoute(role, 'dashboard');
      }
    };
    window.addEventListener('hashchange', syncRoute);
    syncRoute();
    return () => window.removeEventListener('hashchange', syncRoute);
  }, [role]);
  const logout = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setView('dashboard');
    window.location.hash = '';
  };
  if (authLoading) return <main className="auth-page"><p>Đang kiểm tra phiên đăng nhập...</p></main>;
  if (!user) return <AuthScreen onAuthenticated={authenticatedUser => {
    setUser(authenticatedUser);
    setView(authenticatedUser.role === 'KHACH_HANG' ? 'catalog' : 'dashboard');
    window.location.hash = authenticatedUser.role === 'KHACH_HANG'
      ? '#/khach-hang/catalog'
      : roleRoute(authenticatedUser.role, 'dashboard');
  }} />;
  if (role === 'KHACH_HANG') return <CustomerPortal user={user} onUserUpdated={setUser} onLogout={logout} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Hung Fashion</div>
        <p className="sidebar-user">{user.full_name || user.username}<br /><small>{ROLE_LABELS[role] || role}</small></p>
        <nav>
          {navItems.map(([key, label]) => (
            <NavItem key={key} label={label} active={view === key} onClick={() => recordNavigation(key)} />
          ))}
        </nav>
        <button className="nav-item logout-link" onClick={logout}>Đăng xuất</button>
      </aside>

      <main className="main-panel">
        {view === 'dashboard' && <DashboardView userRole={role} />}
        {view === 'accounts' && role === 'ADMIN' && <AccountsView />}
        {view === 'customers' && role !== 'QL_NHAN_SU' && role !== 'QL_KHO' && role !== 'QL_BAN_HANG' && <CustomersView userRole={role} />}
        {view === 'products' && (role === 'ADMIN' || role === 'QL_KHO') && <ProductsView />}
        {view === 'feedbacks' && (role === 'ADMIN' || role === 'QL_KHACH_HANG') && <FeedbacksView />}
        {view === 'surveys' && (role === 'ADMIN' || role === 'QL_KHACH_HANG') && <SurveysView />}
        {view === 'settings' && role === 'ADMIN' && <SettingsView />}
        {['employees', 'inventory', 'receipts', 'orders', 'promotions'].includes(view) && <OperationsView type={view} />}
      </main>
    </div>
  );
}

export default App;
