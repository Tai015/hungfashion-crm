import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Bell, ChevronDown, ClipboardCheck, LogOut, MessageSquare, Moon, Package, Search, ShoppingBag, Sun } from 'lucide-react';
import { dashboardFetch } from '../../api/client';

const NOTICE_ROLES = new Set(['ADMIN', 'QL_KHACH_HANG', 'QL_KHO', 'QL_BAN_HANG']);
const formatCount = value => new Intl.NumberFormat('vi-VN').format(Number(value) || 0);

function usePopover(ref, onClose, active) {
  useEffect(() => {
    if (!active) return undefined;
    const onPointerDown = event => { if (!ref.current?.contains(event.target)) onClose(false); };
    const onKeyDown = event => { if (event.key === 'Escape') { event.preventDefault(); onClose(true); } };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [active, onClose, ref]);
}

function NotificationPopover({ role, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, error: '', items: [] });
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const canSeeFeedback = role === 'ADMIN' || role === 'QL_KHACH_HANG';
  const canSeeOrders = role === 'ADMIN' || role === 'QL_BAN_HANG';
  const canSeeStock = role === 'ADMIN' || role === 'QL_KHO';
  const close = useCallback(returnFocus => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);
  usePopover(rootRef, close, open);

  const refresh = useCallback(async () => {
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const requests = [dashboardFetch('/api/reports/attention')];
      if (canSeeFeedback) requests.push(dashboardFetch('/api/reports/dashboard'));
      const [attention, dashboard] = await Promise.all(requests);
      const kpi = dashboard?.kpi || {};
      const items = [
        ...(canSeeFeedback ? [
          { label: 'phản hồi chưa xử lý', value: Number(kpi.pending_feedbacks) || 0, Icon: MessageSquare, route: 'feedbacks' },
          { label: 'khảo sát đang chạy', value: Number(kpi.active_surveys) || 0, Icon: ClipboardCheck, route: 'surveys' },
        ] : []),
        ...(canSeeOrders ? [{ label: 'đơn đang chờ thanh toán', value: Number(attention.pendingPaymentOrders) || 0, Icon: ShoppingBag, route: 'orders' }] : []),
        ...(canSeeStock ? [{ label: 'sản phẩm sắp hết hàng', value: Number(attention.lowStockVariants) || 0, Icon: Package, route: 'inventory' }] : []),
      ].filter(item => item.value > 0);
      setState({ loading: false, error: '', items });
    } catch (error) {
      if (error.status === 403) setState({ loading: false, error: '', items: [] });
      else setState(current => ({ ...current, loading: false, error: error.message || 'Không tải được thông báo.' }));
    }
  }, [canSeeFeedback, canSeeOrders, canSeeStock]);

  useEffect(() => {
    if (!open) return undefined;
    refresh();
    const interval = window.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    return () => window.clearInterval(interval);
  }, [open, refresh]);

  if (!NOTICE_ROLES.has(role)) return null;
  const count = state.items.reduce((sum, item) => sum + item.value, 0);
  return <div className="dashboard-popover-anchor" ref={rootRef}>
    <button ref={buttonRef} type="button" className="dashboard-icon-button dashboard-notification" aria-label={count ? `Thông báo, ${count} mục cần xử lý` : 'Thông báo'} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      <Bell size={19} strokeWidth={1.8} />{count > 0 && <span className="dashboard-notification-count">{count > 99 ? '99+' : count}</span>}
    </button>
    {open && <section className="dashboard-popover dashboard-notice-popover" role="dialog" aria-label="Thông báo cần xử lý">
      <div className="dashboard-popover-heading"><div><strong>Thông báo</strong><small>Các mục cần chú ý</small></div><button type="button" className="dashboard-text-button" onClick={() => refresh()}>Làm mới</button></div>
      {state.loading ? <div className="dashboard-popover-skeleton" aria-label="Đang tải"><i /><i /><i /></div>
        : state.error ? <div className="dashboard-popover-error" role="alert"><AlertCircle size={16} /><span>{state.error}</span><button type="button" onClick={refresh}>Thử lại</button></div>
          : state.items.length ? <div className="dashboard-notice-list">{state.items.map(({ label, value, Icon, route }) => <button type="button" className="dashboard-notice-item" key={route} onClick={() => { close(false); onNavigate(route); }}><Icon size={17} /><span>{formatCount(value)} {label}</span></button>)}</div>
            : <p className="dashboard-popover-empty">Không có thông báo mới</p>}
    </section>}
  </div>;
}

function UserMenu({ userName, roleLabel, onLogout }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const close = useCallback(returnFocus => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);
  usePopover(rootRef, close, open);
  const initials = (userName || 'HF').trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase() || 'HF';
  return <div className="dashboard-popover-anchor" ref={rootRef}>
    <button ref={buttonRef} type="button" className="dashboard-profile" aria-label={`Tài khoản ${userName}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}>
      <span className="dashboard-avatar">{initials}</span><span className="dashboard-profile-copy"><strong>{userName}</strong><small>{roleLabel}</small></span><ChevronDown size={15} className={open ? 'is-open' : ''} />
    </button>
    {open && <div className="dashboard-popover dashboard-user-popover" role="menu" aria-label="Tùy chọn tài khoản">
      <div className="dashboard-user-summary"><span className="dashboard-avatar">{initials}</span><span><strong>{userName}</strong><small>{roleLabel}</small></span></div>
      <button type="button" role="menuitem" className="dashboard-user-menu-item" onClick={() => { close(false); onLogout(); }}><LogOut size={16} />Đăng xuất</button>
    </div>}
  </div>;
}

export default function Header({ userName, roleLabel, userRole, title, search, onSearch, actionSlot, onNavigate, onLogout, theme = 'dark', onToggleTheme, showSearch = true }) {
  const searchRef = useRef(null);
  const initials = useMemo(() => (userName || 'HF').trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase(), [userName]);
  useEffect(() => {
    const handleShortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);
  return <header className="dashboard-header dashboard-enter dashboard-enter-header">
    <div className="dashboard-header-left">
      <div className="dashboard-header-title"><span className="dashboard-breadcrumb">Quản trị <i>/</i></span><strong title={title}>{title}</strong></div>
      {showSearch && <label className="dashboard-search"><Search size={18} aria-hidden="true" />
        <input ref={searchRef} type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder="Tìm kiếm đơn hàng, khách hàng..." aria-label="Tìm kiếm hoạt động" />
        <kbd>Ctrl K</kbd>
      </label>}
    </div>
    <div className="dashboard-header-actions">
      {actionSlot && <div className="dashboard-header-page-action">{actionSlot}</div>}
      <button type="button" className="dashboard-icon-button" onClick={onToggleTheme}
        title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
        aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <NotificationPopover role={userRole} onNavigate={onNavigate} />
      <span className="dashboard-header-divider" aria-hidden="true" />
      <UserMenu userName={userName || initials || 'HF'} roleLabel={roleLabel} onLogout={onLogout} />
    </div>
    <span className="dashboard-header-glow" aria-hidden="true" />
  </header>;
}
