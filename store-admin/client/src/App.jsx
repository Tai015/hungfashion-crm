import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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

function App() {
  const [stats, setStats] = useState({
    revenue: 0,
    orders: 0,
    visitors: 0,
    conversionRate: 0,
  });
  const [revenueData, setRevenueData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [userActivity, setUserActivity] = useState([]);
  const [eventFeedback, setEventFeedback] = useState('');
  const [isSimulatingTransaction, setIsSimulatingTransaction] = useState(false);
  const pageViewTracked = useRef(false);

  useEffect(() => {
    fetchDashboardData();
    if (!pageViewTracked.current) {
      pageViewTracked.current = true;
      publishTelemetry('user', { eventType: 'page_view' }).catch((error) => {
        console.warn('User event was not sent to Kafka:', error.message);
      });
    }
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) throw new Error(`Dashboard request failed (${response.status})`);
      const data = await response.json();
      setStats(data.summary || stats);
      setRevenueData(data.revenueTrend || []);
      setTopProducts(data.topProducts || []);
      setRecentOrders(data.recentOrders || []);
      setUserActivity(data.userActivity || []);
    } catch (error) {
      console.error('Fetch dashboard failed:', error);
      setStats({ revenue: 128400000, orders: 1452, visitors: 12400, conversionRate: 4.8 });
      setRevenueData([
        { day: 'Mon', revenue: 1500 },
        { day: 'Tue', revenue: 2300 },
        { day: 'Wed', revenue: 2200 },
        { day: 'Thu', revenue: 3100 },
        { day: 'Fri', revenue: 4800 },
        { day: 'Sat', revenue: 5200 },
        { day: 'Sun', revenue: 6100 },
      ]);
      setTopProducts([
        { name: 'Áo thun', value: 280 },
        { name: 'Giày thể thao', value: 220 },
        { name: 'Túi xách', value: 160 },
        { name: 'Đồng hồ', value: 110 },
      ]);
      setRecentOrders([
        { id: '#1001', customer: 'Nguyễn Văn A', total: 580000, status: 'Paid' },
        { id: '#1002', customer: 'Trần Thị B', total: 320000, status: 'Shipping' },
        { id: '#1003', customer: 'Lê Văn C', total: 710000, status: 'Refund' },
      ]);
      setUserActivity([
        { name: 'View product', value: 720 },
        { name: 'Add to cart', value: 410 },
        { name: 'Checkout', value: 190 },
      ]);
    }
  };

  const activityChartData = useMemo(
    () => userActivity.map((item) => ({ ...item, value: Number(item.value || 0) })),
    [userActivity]
  );

  const recordNavigation = (section) => {
    publishTelemetry('user', { eventType: 'navigation_click', section }).catch((error) => {
      console.warn('Navigation event was not sent to Kafka:', error.message);
    });
  };

  const requestReport = () => {
    publishTelemetry('user', { eventType: 'report_requested' })
      .then(() => setEventFeedback('Đã ghi nhận thao tác yêu cầu báo cáo.'))
      .catch((error) => setEventFeedback(`Không gửi được event: ${error.message}`));
  };

  const simulateTransaction = async () => {
    setIsSimulatingTransaction(true);
    const transactionId = `TX-${Date.now()}`;
    const amount = (Math.floor(Math.random() * 90) + 10) * 1000;
    const transaction = {
      eventType: 'transaction_completed',
      transactionId,
      amount,
      currency: 'VND',
      status: 'completed',
      itemCount: Math.floor(Math.random() * 3) + 1,
      source: 'store-admin-demo',
    };

    try {
      await publishTelemetry('transaction', transaction);
      setRecentOrders((orders) => [
        { id: transactionId, customer: 'Khách demo', total: amount, status: 'Paid' },
        ...orders,
      ].slice(0, 10));
      setStats((current) => ({ ...current, orders: current.orders + 1, revenue: current.revenue + amount }));
      setEventFeedback(`Đã gửi giao dịch ${transactionId} qua Kafka.`);
    } catch (error) {
      setEventFeedback(`Không gửi được giao dịch: ${error.message}`);
    } finally {
      setIsSimulatingTransaction(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Store Admin</div>
        <nav>
          <a className="nav-item active" onClick={() => recordNavigation('dashboard')}>Dashboard</a>
          <a className="nav-item" onClick={() => recordNavigation('orders')}>Orders</a>
          <a className="nav-item" onClick={() => recordNavigation('products')}>Products</a>
          <a className="nav-item" onClick={() => recordNavigation('customers')}>Customers</a>
          <a className="nav-item" onClick={() => recordNavigation('analytics')}>Analytics</a>
        </nav>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>Store Performance</h1>
          </div>
          <button className="primary-btn" onClick={requestReport}>+ New Report</button>
        </header>

        <section className="stats-grid">
          <div className="stat-card accent">
            <span>Revenue</span>
            <strong>{stats.revenue.toLocaleString('vi-VN')}đ</strong>
            <small>+12.8% vs last week</small>
          </div>
          <div className="stat-card">
            <span>Orders</span>
            <strong>{stats.orders}</strong>
            <small>+8.4% this month</small>
          </div>
          <div className="stat-card">
            <span>Visitors</span>
            <strong>{stats.visitors.toLocaleString('vi-VN')}</strong>
            <small>+15.2% conversion</small>
          </div>
          <div className="stat-card">
            <span>Conversion</span>
            <strong>{stats.conversionRate}%</strong>
            <small>Healthy funnel</small>
          </div>
        </section>

        <section className="chart-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Revenue trend</h3>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value) => `${Number(value).toLocaleString('vi-VN')}đ`} />
                <Area type="monotone" dataKey="revenue" stroke="#4f46e5" fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>User activity</h3>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={activityChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Top products</h3>
            </div>
            <div className="list-stack">
              {topProducts.map((product, idx) => (
                <div key={product.name} className="list-row">
                  <div className="product-meta">
                    <span className="badge">#{idx + 1}</span>
                    <span>{product.name}</span>
                  </div>
                  <strong>{product.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Traffic split</h3>
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={topProducts} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                  {topProducts.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="panel wide-panel">
            <div className="panel-header">
              <h3>Recent orders</h3>
              <button className="event-btn" onClick={simulateTransaction} disabled={isSimulatingTransaction}>
                {isSimulatingTransaction ? 'Đang gửi...' : 'Mô phỏng giao dịch'}
              </button>
            </div>
            {eventFeedback && <p className="event-feedback" role="status">{eventFeedback}</p>}
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{order.customer}</td>
                    <td>{Number(order.total).toLocaleString('vi-VN')}đ</td>
                    <td>
                      <span className={`status ${order.status.toLowerCase()}`}>{order.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
