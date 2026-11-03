import { ClipboardList, MessageSquare, Percent, ShoppingBag, Star, TrendingUp, UserPlus, Users } from 'lucide-react';
import { formatCount } from '../../utils/dashboardFormatters';
import GlassCard from './GlassCard';

const icons = { customers: Users, newCustomers: UserPlus, feedback: MessageSquare, surveys: ClipboardList, rating: Star, revenue: TrendingUp, orders: ShoppingBag, conversion: Percent };

export default function MetricCard({ metric, entranceIndex = 0, animateEntrance = false }) {
  const Icon = icons[metric.icon] || Users;
  const hasValue = metric.value !== null && metric.value !== undefined;
  const value = !hasValue
    ? '—'
    : metric.format === 'currency'
      ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(metric.value))
      : metric.format === 'percent'
        ? `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(Number(metric.value))}%`
        : metric.format === 'rating'
          ? `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(metric.value))}/5`
          : formatCount(metric.value);
  const badge = metric.badgeValue == null
    ? '—'
    : metric.badgeFormat === 'points'
      ? `${metric.badgeValue > 0 ? '+' : ''}${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(metric.badgeValue)} điểm`
      : `${metric.badgeValue > 0 ? '+' : ''}${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(metric.badgeValue)}%`;

  return <GlassCard as="article" className={`dashboard-metric metric-${metric.color}${animateEntrance ? ' dashboard-metric-enter' : ''}`}
    style={{ '--metric-enter-delay': `${entranceIndex * 90}ms` }}>
    <div className="dashboard-metric-top"><span className="dashboard-metric-icon"><Icon size={20} /></span>{metric.badgeValue !== undefined && <span className="dashboard-metric-badge">{badge}</span>}</div>
    <p>{metric.title}</p><strong>{value}</strong>
    <div className="dashboard-metric-bottom"><span>{metric.description}</span></div>
  </GlassCard>;
}
