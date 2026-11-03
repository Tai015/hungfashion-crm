import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ClipboardCheck, MessageSquare, Package, RefreshCw, ShoppingBag } from 'lucide-react';
import { dashboardFetch } from '../../api/client';
import GlassCard from './GlassCard';

const STAFF = new Set(['ADMIN', 'QL_KHACH_HANG', 'QL_KHO', 'QL_BAN_HANG']);

function ErrorState({ retry }) {
  return <div className="reports-inline-error" role="alert"><AlertCircle size={17} /><span>Không tải được việc cần xử lý.</span><button type="button" onClick={retry}><RefreshCw size={14} /> Thử lại</button></div>;
}

export default function NeedsAttention({ role, onNavigate }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const canSeeFeedback = role === 'ADMIN' || role === 'QL_KHACH_HANG';
  const canSeeOrders = role === 'ADMIN' || role === 'QL_BAN_HANG';
  const canSeeStock = role === 'ADMIN' || role === 'QL_KHO';

  const load = useCallback(async () => {
    if (!STAFF.has(role)) {
      setState({ loading: false, error: '', data: null });
      return;
    }
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const requests = [dashboardFetch('/api/reports/attention')];
      if (canSeeFeedback) requests.push(dashboardFetch('/api/reports/dashboard'));
      const [attention, dashboard] = await Promise.all(requests);
      setState({ loading: false, error: '', data: { ...attention, kpi: dashboard?.kpi || {} } });
    } catch (error) {
      setState({ loading: false, error: error.status === 403 ? 'Bạn không có quyền xem mục này' : 'Không tải được việc cần xử lý.', data: null });
    }
  }, [canSeeFeedback, role]);

  useEffect(() => { load(); }, [load]);

  const items = state.data ? [
    ...(canSeeFeedback ? [
      { label: 'Phản hồi chưa xử lý', value: Number(state.data.kpi.pending_feedbacks) || 0, icon: MessageSquare, route: 'feedbacks' },
      { label: 'Khảo sát đang chạy', value: Number(state.data.kpi.active_surveys) || 0, icon: ClipboardCheck, route: 'surveys' },
    ] : []),
    ...(canSeeOrders ? [{ label: 'Đơn đang chờ thanh toán', value: Number(state.data.pendingPaymentOrders) || 0, icon: ShoppingBag, route: 'orders' }] : []),
    ...(canSeeStock ? [{ label: 'Sản phẩm sắp hết hàng', value: Number(state.data.lowStockVariants) || 0, icon: Package, route: 'inventory' }] : []),
  ] : [];

  return <GlassCard className="dashboard-attention-card">
    <div className="dashboard-section-heading"><div><p className="dashboard-eyebrow">THEO DÕI</p><h2>Cần xử lý</h2><span>Các mục cần được chú ý theo quyền của bạn</span></div></div>
    {state.loading ? <div className="reports-attention-skeleton" aria-label="Đang tải"><i /><i /><i /><i /></div>
      : state.error ? <ErrorState retry={load} />
        : !items.length || items.every(item => item.value === 0)
          ? <p className="reports-empty">Không có việc cần xử lý.</p>
          : <div className="reports-attention-list">{items.map(item => {
            const Icon = item.icon;
            return <button type="button" key={item.route} className="reports-attention-item" onClick={() => onNavigate(item.route)}>
              <span className="reports-attention-icon"><Icon size={17} /></span><span>{item.label}</span><strong>{item.value}</strong>
            </button>;
          })}</div>}
  </GlassCard>;
}
