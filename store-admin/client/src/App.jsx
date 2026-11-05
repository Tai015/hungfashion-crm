import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { apiFetch, checkRuntimeServices, subscribeToChatEvents, TOKEN_KEY } from './api';
import AuthScreen from './AuthScreen';
const CustomerPortal = lazy(() => import('./CustomerPortal'));
const GuestStorefront = lazy(() => import('./CustomerPortal').then(module => ({ default: module.GuestStorefront })));

import Spinner from './components/Spinner';

import { publishTelemetry } from './utils/telemetry';
import { runPageTransition } from './utils/pageTransition';
import { showWarningAlert } from './utils/notifications';

const DashboardPage = lazy(() => import('./views/DashboardPage'));
const CustomersView = lazy(() => import('./views/CustomersView'));
const ProductsView = lazy(() => import('./views/ProductsView'));
const FeedbacksView = lazy(() => import('./views/FeedbacksView'));
const SurveysView = lazy(() => import('./views/SurveysView'));
const SettingsView = lazy(() => import('./views/SettingsView'));
const AccountsView = lazy(() => import('./views/AccountsView'));
const OperationsView = lazy(() => import('./views/OperationsView'));
const AuditLogView = lazy(() => import('./views/AuditLogView'));
const EmployeesView = lazy(() => import('./views/EmployeesView'));
const InventoryManagementView = lazy(() => import('./views/InventoryManagementView'));
const PromotionsView = lazy(() => import('./views/PromotionsView'));
const CustomerSupportChatView = lazy(() => import('./views/CustomerSupportChatView'));
const ReportsView = lazy(() => import('./views/ReportsView'));

const showBackendWarning = async () => {
  const { default: Swal } = await import('sweetalert2');
  return Swal.fire({
    icon: 'warning',
    title: 'Không kết nối được máy chủ',
    text: 'Không nhận được phản hồi từ API. Hãy kiểm tra Docker, PostgreSQL và máy chủ backend rồi thử lại.',
    confirmButtonText: 'Kiểm tra lại',
    showCancelButton: true,
    cancelButtonText: 'Đóng',
    reverseButtons: true,
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
//  CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

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
    ['dashboard', 'Tổng quan'], ['reports', 'Báo cáo'], ['accounts', 'Tài khoản'], ['customers', 'Khách hàng'], ['orders', 'Đơn hàng'],
    ['products', 'Sản phẩm'], ['employees', 'Nhân viên'], ['inventory', 'Tồn kho'],
    ['promotions', 'Khuyến mãi'], ['feedbacks', 'Phản hồi'], ['surveys', 'Khảo sát'], ['chat', 'Trò chuyện CSKH'],
    ['audit', 'Nhật ký'], ['settings', 'Cài đặt'],
  ],
  QL_KHACH_HANG: [
    ['dashboard', 'Tổng quan'], ['reports', 'Báo cáo'], ['customers', 'Khách hàng'], ['chat', 'Trò chuyện CSKH'], ['feedbacks', 'Phản hồi'], ['surveys', 'Khảo sát'],
  ],
  QL_NHAN_SU: [['dashboard', 'Tổng quan'], ['reports', 'Báo cáo'], ['employees', 'Nhân viên']],
  QL_KHO: [['dashboard', 'Tổng quan'], ['reports', 'Báo cáo'], ['products', 'Sản phẩm'], ['inventory', 'Tồn kho']],
  QL_BAN_HANG: [['dashboard', 'Tổng quan'], ['reports', 'Báo cáo'], ['orders', 'Đơn hàng'], ['promotions', 'Khuyến mãi']],
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

// ═══════════════════════════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const [view, setView] = useState(sectionFromHash);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authRoute, setAuthRoute] = useState(window.location.hash);
  const [staffUnreadChatCount, setStaffUnreadChatCount] = useState(0);
  const pageViewTracked = useRef(null);

  useEffect(() => {
    const syncAuthRoute = () => setAuthRoute(window.location.hash);
    window.addEventListener('hashchange', syncAuthRoute);
    return () => window.removeEventListener('hashchange', syncAuthRoute);
  }, []);

  useEffect(() => {
    let active = true;

    const inspectServices = async () => {
      try {
        const status = await checkRuntimeServices();
        if (!active || status.apiReady) return;

        const result = await showBackendWarning();
        if (active && result.isConfirmed) await inspectServices();
      } catch {
        if (!active) return;
        const result = await showBackendWarning();
        if (active && result.isConfirmed) await inspectServices();
      }
    };

    inspectServices();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const accountId = user?.account_id;
    if (accountId && pageViewTracked.current !== accountId) {
      pageViewTracked.current = accountId;
      publishTelemetry('user', { eventType: 'page_view' }).catch(() => {});
    }
  }, [user?.account_id]);

  useEffect(() => {
    if (!user?.account_id) return undefined;
    const heartbeat = async () => {
      try {
        const session = await apiFetch('/api/auth/heartbeat', { method: 'POST' });
        if (session.role && session.role !== user.role) {
          setUser(await apiFetch('/api/auth/me'));
        }
      } catch { /* keep retrying on the next heartbeat */ }
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 30000);
    return () => window.clearInterval(timer);
  }, [user?.account_id, user?.role]);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    let active = true;
    const expire = event => {
      pageViewTracked.current = null;
      setUser(null);
      setView('dashboard');
      if (event?.detail?.code === 'SESSION_IP_CONFLICT') {
        showWarningAlert(event.detail.message || 'Phiên đăng nhập đã kết thúc do phát hiện đăng nhập từ IP khác.');
      }
    };
    const handleStorage = event => {
      if (event.key === TOKEN_KEY && !event.newValue) expire();
    };
    window.addEventListener('auth:expired', expire);
    window.addEventListener('storage', handleStorage);
    if (!token) setAuthLoading(false);
    else {
      apiFetch('/api/auth/me')
        .then(currentUser => { if (active) setUser(currentUser); })
        .catch(() => { if (active) setUser(null); })
        .finally(() => { if (active) setAuthLoading(false); });
    }
    return () => {
      active = false;
      window.removeEventListener('auth:expired', expire);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const recordNavigation = (section) => {
    runPageTransition(() => {
      setView(section);
      window.location.hash = roleRoute(role, section);
    });
    publishTelemetry('user', { eventType: 'navigation_click', section }).catch(() => {});
  };

  const role = user?.role;
  useEffect(() => {
    let active = true;
    if (role !== 'QL_KHACH_HANG') {
      setStaffUnreadChatCount(0);
      return () => { active = false; };
    }
    const refreshUnread = async () => {
      try {
        const conversations = await apiFetch('/api/chat');
        const unread = conversations.reduce((total, conversation) => total + (Number(conversation.unread_count) || 0), 0);
        if (active) setStaffUnreadChatCount(unread);
      } catch { /* retain the last known count during a temporary disconnect */ }
    };
    refreshUnread();
    const unsubscribe = subscribeToChatEvents(refreshUnread);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [role, user?.account_id]);

  const navItems = (ROLE_NAVIGATION[role] || []).map(([key, label]) => (
    key === 'chat' && role === 'QL_KHACH_HANG'
      ? [key, label, staffUnreadChatCount]
      : [key, label]
  ));
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
    pageViewTracked.current = null;
    const loginRoute = user?.role === 'KHACH_HANG' ? '' : '#/nhan-vien/login';
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {}).finally(() => {
      window.localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      setView('dashboard');
      window.location.hash = loginRoute;
    });
  };

  if (authLoading) return <main className="app-loading-screen"><Spinner /></main>;
  if (!user && (!authRoute || authRoute === '#/')) {
    return <Suspense fallback={<main className="app-loading-screen"><Spinner /></main>}><GuestStorefront
      onLogin={() => { window.location.hash = '#/khach-hang/login'; }}
      onRegister={() => { window.location.hash = '#/khach-hang/register'; }}
    /></Suspense>;
  }
  if (!user) return <AuthScreen key={authRoute} onAuthenticated={authenticatedUser => {
    setUser(authenticatedUser);
    setView(authenticatedUser.role === 'KHACH_HANG' ? 'catalog' : 'dashboard');
    window.location.hash = authenticatedUser.role === 'KHACH_HANG'
      ? '#/khach-hang/catalog'
      : roleRoute(authenticatedUser.role, 'dashboard');
  }} />;
  if (role === 'KHACH_HANG') return <Suspense fallback={<main className="app-loading-screen"><Spinner /></main>}><CustomerPortal user={user} onUserUpdated={setUser} onLogout={logout} /></Suspense>;
  if (view === 'dashboard') return <Suspense fallback={<main className="app-loading-screen"><Spinner /></main>}>
    <DashboardPage userName={user.full_name || user.username} roleLabel={ROLE_LABELS[role] || role} userRole={role} navItems={navItems} onNavigate={recordNavigation} onLogout={logout} />
  </Suspense>;
  const renderView = () => {
    switch (view) {
      case 'dashboard': return null;
      case 'reports': return <ReportsView userRole={role} />;
      case 'customers': return <CustomersView userRole={role} />;
      case 'products': return <ProductsView />;
      case 'feedbacks': return <FeedbacksView />;
      case 'chat': return <CustomerSupportChatView user={user} />;
      case 'surveys': return <SurveysView />;
      case 'settings': return <SettingsView />;
      case 'accounts': return <AccountsView currentAccountId={user.account_id} />;
      case 'audit': return <AuditLogView />;
      case 'employees': return <EmployeesView />;
      case 'inventory': return <InventoryManagementView initialTab="stock" />;
      case 'orders': return <OperationsView type="orders" />;
      case 'promotions': return <PromotionsView />;
      default: return null;
    }
  };

  return <Suspense fallback={<main className="app-loading-screen"><Spinner /></main>}>
    <DashboardPage userName={user.full_name || user.username} roleLabel={ROLE_LABELS[role] || role}
      userRole={role} navItems={navItems} onNavigate={recordNavigation} onLogout={logout} initialView={view}>
      {renderView()}
    </DashboardPage>
  </Suspense>;
}

export default App;
