import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { apiFetch, checkRuntimeServices, TOKEN_KEY } from './api';
import AuthScreen from './AuthScreen';
const CustomerPortal = lazy(() => import('./CustomerPortal'));

import AppShell from './components/AppShell';
import Spinner from './components/Spinner';

import { publishTelemetry } from './utils/telemetry';

const DashboardView = lazy(() => import('./views/DashboardView'));
const CustomersView = lazy(() => import('./views/CustomersView'));
const ProductsView = lazy(() => import('./views/ProductsView'));
const FeedbacksView = lazy(() => import('./views/FeedbacksView'));
const SurveysView = lazy(() => import('./views/SurveysView'));
const SettingsView = lazy(() => import('./views/SettingsView'));
const AccountsView = lazy(() => import('./views/AccountsView'));
const OperationsView = lazy(() => import('./views/OperationsView'));
const AuditLogView = lazy(() => import('./views/AuditLogView'));

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
    ['dashboard', 'Tổng quan'], ['accounts', 'Tài khoản'], ['customers', 'Khách hàng'],
    ['products', 'Sản phẩm'], ['feedbacks', 'Phản hồi'], ['surveys', 'Khảo sát'],
    ['audit', 'Nhật ký'], ['settings', 'Cài đặt'],
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

// ═══════════════════════════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const [view, setView] = useState(sectionFromHash);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const pageViewTracked = useRef(false);

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

  if (authLoading) return <main className="grid min-h-screen place-items-center"><Spinner /></main>;
  if (!user) return <AuthScreen onAuthenticated={authenticatedUser => {
    setUser(authenticatedUser);
    setView(authenticatedUser.role === 'KHACH_HANG' ? 'catalog' : 'dashboard');
    window.location.hash = authenticatedUser.role === 'KHACH_HANG'
      ? '#/khach-hang/catalog'
      : roleRoute(authenticatedUser.role, 'dashboard');
  }} />;
  if (role === 'KHACH_HANG') return <Suspense fallback={<main className="grid min-h-screen place-items-center"><Spinner /></main>}><CustomerPortal user={user} onUserUpdated={setUser} onLogout={logout} /></Suspense>;

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <DashboardView userRole={role} userName={user.full_name || user.username} />;
      case 'customers': return <CustomersView userRole={role} />;
      case 'products': return <ProductsView />;
      case 'feedbacks': return <FeedbacksView />;
      case 'surveys': return <SurveysView />;
      case 'settings': return <SettingsView />;
      case 'accounts': return <AccountsView />;
      case 'audit': return <AuditLogView />;
      case 'employees': return <OperationsView type="employees" />;
      case 'inventory': return <OperationsView type="inventory" />;
      case 'receipts': return <OperationsView type="receipts" />;
      case 'orders': return <OperationsView type="orders" />;
      case 'promotions': return <OperationsView type="promotions" />;
      default: return <DashboardView userRole={role} userName={user.full_name || user.username} />;
    }
  };

  return (
    <AppShell
      brand="Hung Fashion"
      userName={user.full_name || user.username}
      roleLabel={ROLE_LABELS[role] || role}
      navItems={navItems}
      active={view}
      onNav={recordNavigation}
      onLogout={logout}
    >
      <Suspense fallback={<div className="grid min-h-64 place-items-center"><Spinner /></div>}>
        {renderView()}
      </Suspense>
    </AppShell>
  );
}

export default App;
