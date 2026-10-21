import { useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import StatusBadge from '../components/StatusBadge';
import StatCard from '../components/StatCard';
import Spinner from '../components/Spinner';
import { fmtVND } from '../utils/formatters';
import { publishTelemetry } from '../utils/telemetry';
import { useDashboardData } from '../hooks/useDashboardData';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#22c55e'];

export default function DashboardView({ userRole }) {
  const {
    kpi,
    revenueData,
    topProducts,
    recentOrders,
    byTier,
    byGender,
    byAge,
    byInterest,
    loading,
    lastUpdated,
    error,
  } = useDashboardData(userRole);

  const [eventFeedback, setEventFeedback] = useState('');
  const [simulating, setSimulating] = useState(false);

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
