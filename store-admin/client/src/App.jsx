import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

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

// Helper gọi API
async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
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
function DashboardView({ onSimulateTransaction }) {
  const [kpi, setKpi] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [byTier, setByTier] = useState([]);
  const [byGender, setByGender] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [eventFeedback, setEventFeedback] = useState('');
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/reports/dashboard'),
      apiFetch('/api/reports/revenue?group_by=day'),
      apiFetch('/api/reports/top-products?limit=5'),
      apiFetch('/api/orders?limit=8'),
    ]).then(([dash, revenue, products, orders]) => {
      setKpi(dash.kpi);
      setByTier(dash.customersByTier || []);
      setByGender(dash.customersByGender || []);
      setRevenueData(revenue.map(r => ({
        day: new Date(r.period).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        revenue: Number(r.revenue),
      })));
      setTopProducts(products.map(p => ({ name: p.product_name, value: p.total_sold })));
      setRecentOrders(orders.data || []);
      setLastUpdated(new Date());
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

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
function CustomersView() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const LIMIT = 15;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (search) params.set('search', search);
    if (tier) params.set('tier', tier);
    apiFetch(`/api/customers?${params}`)
      .then(d => { setCustomers(d.data || []); setTotal(d.total || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, tier, page]);

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
        {(search || tier) && (
          <button className="filter-clear" type="button" onClick={() => { setSearch(''); setTier(''); setPage(1); }}>
            Xóa lọc
          </button>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Danh sách ({total.toLocaleString('vi-VN')} khách)</h3>
        </div>
        {loading ? <Spinner /> : (
          <table>
            <thead>
              <tr><th>#</th><th>Họ tên</th><th>SĐT</th><th>Email</th><th>Giới tính</th><th>Hạng</th><th>Điểm</th></tr>
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
                </tr>
              )) : (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>Không có khách hàng</td></tr>
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
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const LIMIT = 15;

  useEffect(() => {
    apiFetch('/api/products/categories')
      .then(rows => {
        const seen = new Set();
        setCategories(rows.filter(category => {
          if (seen.has(category.category_name)) return false;
          seen.add(category.category_name);
          return true;
        }));
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (search) params.set('search', search);
    if (categoryId) params.set('category_id', categoryId);
    apiFetch(`/api/products?${params}`)
      .then(d => { setProducts(d.data || []); setTotal(d.total || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, categoryId, page]);

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
        {(search || categoryId) && (
          <button className="filter-clear" type="button" onClick={() => { setSearch(''); setCategoryId(''); setPage(1); }}>
            Xóa lọc
          </button>
        )}
      </div>
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

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: 20 });
    if (status) params.set('status', status);
    apiFetch(`/api/feedbacks?${params}`)
      .then(d => { setFeedbacks(d.data || []); setTotal(d.total || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status]);

  const STAR = n => '⭐'.repeat(n || 0);

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">CRM</p><h1>Phản hồi khách hàng</h1></div>
      </header>
      <div className="filter-toolbar filter-toolbar-compact">
        <label className="filter-field">
          <span>Trạng thái phản hồi</span>
          <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {['New', 'Processing', 'Resolved', 'Rejected'].map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        {status && <button className="filter-clear" type="button" onClick={() => setStatus('')}>Xóa lọc</button>}
      </div>
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
                  <td><StatusBadge status={f.status} /></td>
                </tr>
              )) : (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>Chưa có phản hồi</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ── Surveys View ──────────────────────────────────────────────────────────────
function SurveysView() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/surveys')
      .then(d => setSurveys(Array.isArray(d) ? d : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const STATUS_LABEL = { Draft: '🔘 Nháp', Active: '🟢 Đang chạy', Closed: '⛔ Đã đóng' };

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">CRM</p><h1>Khảo sát khách hàng</h1></div>
      </header>
      <div className="panel">
        <div className="panel-header"><h3>Danh sách khảo sát</h3></div>
        {loading ? <Spinner /> : (
          <table>
            <thead>
              <tr><th>#</th><th>Tiêu đề</th><th>Câu hỏi</th><th>Phản hồi</th><th>Ngày kết thúc</th><th>Trạng thái</th></tr>
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
                </tr>
              )) : (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>Chưa có khảo sát</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const [view, setView] = useState('dashboard');
  const pageViewTracked = useRef(false);

  useEffect(() => {
    if (!pageViewTracked.current) {
      pageViewTracked.current = true;
      publishTelemetry('user', { eventType: 'page_view' }).catch(() => {});
    }
  }, []);

  const recordNavigation = (section) => {
    setView(section);
    publishTelemetry('user', { eventType: 'navigation_click', section }).catch(() => {});
  };

  const NAV = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'customers', label: 'Khách hàng' },
    { key: 'products',  label: 'Sản phẩm' },
    { key: 'feedbacks', label: 'Phản hồi' },
    { key: 'surveys',   label: 'Khảo sát' },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">👗 Hung Fashion</div>
        <nav>
          {NAV.map(n => (
            <NavItem key={n.key} label={n.label} active={view === n.key} onClick={() => recordNavigation(n.key)} />
          ))}
        </nav>
      </aside>

      <main className="main-panel">
        {view === 'dashboard' && <DashboardView />}
        {view === 'customers' && <CustomersView />}
        {view === 'products'  && <ProductsView />}
        {view === 'feedbacks' && <FeedbacksView />}
        {view === 'surveys'   && <SurveysView />}
      </main>
    </div>
  );
}

export default App;
