import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Activity, ArrowUpRight, Download, Sparkles } from 'lucide-react';
import AnalyticsChart from '../components/dashboard/AnalyticsChart';
import BarChart from '../components/dashboard/BarChart';
import Header from '../components/dashboard/Header';
import MetricCard from '../components/dashboard/MetricCard';
import NeedsAttention from '../components/dashboard/NeedsAttention';
import SectionState from '../components/dashboard/SectionState';
import Sidebar from '../components/dashboard/Sidebar';
import { useDashboardData } from '../hooks/useDashboardData';
import { dashboardMotionMs } from '../utils/dashboardMotion';
import '../dashboard.css';

function metricItems(summary, range) {
  if (!summary) return [];
  const period = range === '12 tháng' ? '12 tháng gần đây' : range.toLowerCase();
  return [
    { title: 'Doanh thu', value: summary.revenue, format: 'currency', icon: 'revenue', color: 'purple', description: period, badgeValue: summary.growthPercent, badgeFormat: 'percent' },
    { title: 'Người dùng hoạt động', value: summary.activeUsers, icon: 'customers', color: 'pink', description: period },
    { title: 'Đơn hàng', value: summary.orders, icon: 'orders', color: 'blue', description: period },
    { title: 'Chuyển đổi', value: summary.conversionPercent, format: 'percent', icon: 'conversion', color: 'mint', description: 'Tỷ lệ người dùng hoạt động có đơn hàng', badgeValue: summary.conversionChange, badgeFormat: 'points' },
  ];
}

export default function DashboardPage({ userName, roleLabel, userRole, navItems, onNavigate, onLogout, initialView = 'dashboard', children }) {
  const [active, setActive] = useState(initialView);
  const [theme, setTheme] = useState(() => window.localStorage.getItem('hung-fashion-theme') || 'dark');
  const metricsEntrancePlayed = useRef(false);
  const { sections, range, setRange, retry } = useDashboardData({ enabled: !children });
  useEffect(() => setActive(initialView), [initialView]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('hung-fashion-theme', theme);
  }, [theme]);
  const items = useMemo(() => navItems.map(([key, label, badgeCount]) => ({ key, label, badgeCount })), [navItems]);
  const currentTitle = items.find(item => item.key === active)?.label || 'Tổng quan';
  const reportAction = children && active === 'reports' ? <button type="button" className="dashboard-quick-action" onClick={() => document.querySelector('.reports-export-row button:not(:disabled)')?.click()}><Download size={16} /><span>Xuất CSV</span></button> : null;

  const handleSelect = key => {
    setActive(key);
    if (key !== 'dashboard') onNavigate(key);
    if (key === 'dashboard') onNavigate('dashboard');
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reducedMotion) {
      document.startViewTransition(() => {
        flushSync(() => {
          document.documentElement.dataset.theme = nextTheme;
          setTheme(nextTheme);
        });
      });
      return;
    }
    setTheme(nextTheme);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const displayName = userName || 'Quản trị viên';
  const metricData = metricItems(sections.metrics.data, range);
  const staggerMs = dashboardMotionMs('--dash-motion-stagger');
  const animateMetricCards = !children && !sections.metrics.loading && !sections.metrics.error
    && metricData.length > 0 && !metricsEntrancePlayed.current;
  if (animateMetricCards) metricsEntrancePlayed.current = true;

  return <div className="dashboard-app">
    <div className="dashboard-glow glow-one" /><div className="dashboard-glow glow-two" /><div className="dashboard-glow glow-three" />
    <Sidebar items={items} active={active} onSelect={handleSelect} />
    <main className="dashboard-main">
      <Header userName={displayName} roleLabel={roleLabel} userRole={userRole} title={currentTitle}
        actionSlot={reportAction} onNavigate={onNavigate} onLogout={onLogout} theme={theme}
        onToggleTheme={toggleTheme} showSearch={false} />
      <div className="dashboard-content">
        {children ? <div key={active} className="app-page-enter">{children}</div> : <>
        <section className="dashboard-welcome dashboard-enter dashboard-enter-welcome"><div><p className="dashboard-eyebrow"><Sparkles size={14} /> KHÔNG GIAN QUẢN TRỊ HUNG FASHION</p><h1>{greeting}, <span>{displayName}</span></h1><p>Theo dõi số liệu báo cáo từ hệ thống Hung Fashion.</p></div><div className="dashboard-live"><i />Dữ liệu từ hệ thống</div></section>
        <section className="dashboard-metrics dashboard-enter dashboard-enter-metrics" aria-label="Chỉ số tổng quan">
          <SectionState loading={sections.metrics.loading} error={sections.metrics.error} isEmpty={!sections.metrics.loading && !sections.metrics.error && !metricData.length} onRetry={retry.metrics} skeleton="metrics">
            {metricData.map((metric, index) => <div key={metric.title}
              className={animateMetricCards ? 'dashboard-metric-entrance' : ''}
              style={animateMetricCards ? { '--metric-enter-delay': `${index * staggerMs}ms` } : undefined}>
              <MetricCard metric={metric} />
            </div>)}
          </SectionState>
        </section>
        <section className="dashboard-insight-row dashboard-enter dashboard-enter-charts" aria-label="Phân tích dữ liệu">
          <AnalyticsChart data={sections.revenue.data} range={range} onRangeChange={setRange} status={sections.revenue} onRetry={retry.revenue} />
          <BarChart data={sections.products.data || []} status={sections.products} onRetry={retry.products} />
        </section>
        <div className="dashboard-enter dashboard-enter-table"><NeedsAttention role={userRole} onNavigate={onNavigate} /></div>
        </>}
        <footer className="dashboard-footer"><span>© {new Date().getFullYear()} Hung Fashion</span>{!children && <><span><Activity size={13} /> Báo cáo từ máy chủ</span><span><ArrowUpRight size={13} /> Số liệu thực tế</span></>}</footer>
      </div>
    </main>
  </div>;
}
