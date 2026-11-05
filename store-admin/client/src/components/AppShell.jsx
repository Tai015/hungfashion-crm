import {
  ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock, FileText, Grid2x2, Headset, IdCard,
  LogOut, Menu, MessageSquare, Moon, Package, Settings, ShoppingBag,
  ShoppingCart, Star, Sun, Tag, User, Users, X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import ChangePasswordModal from './ChangePasswordModal';

const NAV_ICONS = {
  dashboard: Grid2x2, accounts: Users, customers: User, products: ShoppingBag,
  feedbacks: MessageSquare, chat: Headset, surveys: ClipboardList, audit: Clock,
  settings: Settings, employees: IdCard, inventory: Package, receipts: FileText,
  orders: ShoppingCart, promotions: Tag, catalog: ShoppingBag, profile: User,
  feedback: MessageSquare, loyalty: Star, vouchers: Tag, cart: ShoppingCart,
};

export default function AppShell({
  brand, userName, roleLabel, navItems, active, onNav, onLogout, extraHeaderContent, children,
}) {
  const initial = (userName || brand || 'HF').slice(0, 1).toUpperCase();
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem('hung-fashion-theme');
    return savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const userMenuRef = useRef(null);
  const userMenuButtonRef = useRef(null);
  const activeLabel = navItems.find(([key]) => key === active)?.[1] || brand;
  const brandInitial = (brand || 'H').slice(0, 1).toUpperCase();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('hung-fashion-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onPointerDown = event => {
      if (!userMenuRef.current?.contains(event.target)) setUserMenuOpen(false);
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
        requestAnimationFrame(() => userMenuButtonRef.current?.focus());
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [userMenuOpen]);

  const navigate = key => {
    onNav(key);
    setMobileNavOpen(false);
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

  return (
    <div className="customer-portal-shell" data-theme={theme}>
      <div className="customer-portal-glow customer-portal-glow-one" aria-hidden="true" />
      <div className="customer-portal-glow customer-portal-glow-two" aria-hidden="true" />
      {mobileNavOpen && <button type="button" className="customer-portal-overlay" aria-label="Đóng menu" onClick={() => setMobileNavOpen(false)} />}

      <aside className={`customer-portal-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}${mobileNavOpen ? ' is-open' : ''}`} aria-label="Điều hướng khách hàng">
        <div className="customer-portal-brand">
          <button type="button" className="customer-portal-brand-mark" aria-label="Hung Fashion — đổi mật khẩu" title="Đổi mật khẩu" onClick={() => setChangePasswordOpen(true)}>{brandInitial}</button>
          <span><strong>{brand}</strong><small>KHU VỰC KHÁCH HÀNG</small></span>
          <button type="button" className="customer-portal-close" aria-label="Đóng menu" onClick={() => setMobileNavOpen(false)}><X size={19} /></button>
        </div>

        <p className="customer-portal-nav-label">TÀI KHOẢN CỦA TÔI</p>
        <nav className="customer-portal-nav">
          {navItems.map(([key, label, badgeCount]) => {
            const Icon = NAV_ICONS[key] || Grid2x2;
            const isActive = active === key;
            return <button key={key} type="button" title={label} aria-current={isActive ? 'page' : undefined}
              onClick={() => navigate(key)} className={`customer-portal-nav-item${isActive ? ' is-active' : ''}`}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
              {badgeCount > 0 && <span className="customer-portal-unread">{badgeCount > 99 ? '99+' : badgeCount}</span>}
            </button>;
          })}
        </nav>

        <div className="customer-portal-sidebar-footer">
          <div className="customer-portal-user-card"><span className="customer-portal-avatar">{initial}</span><span><strong>{userName || brand}</strong><small>{roleLabel}</small></span></div>
          <button type="button" className="customer-portal-footer-button customer-portal-collapse" title={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            aria-label={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'} aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed(collapsed => !collapsed)}>
            {sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>
      </aside>

      <main className="customer-portal-main">
        <header className="customer-portal-header">
          <div className="customer-portal-header-left">
            <button type="button" className="customer-portal-mobile-menu" aria-label="Mở menu" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
            <button type="button" className="customer-portal-header-brand" title="Đổi mật khẩu" aria-label="Hung Fashion — đổi mật khẩu" onClick={() => setChangePasswordOpen(true)}><span className="customer-portal-brand-mark" aria-hidden="true">{brandInitial}</span></button>
            <div className="customer-portal-page-title"><span>Cửa hàng <i>/</i></span><strong title={activeLabel}>{activeLabel}</strong></div>
          </div>
          <div className="customer-portal-header-actions">
            <button type="button" className="customer-portal-theme-toggle" title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {extraHeaderContent && <div className="customer-portal-header-action">{extraHeaderContent}</div>}
            <span className="customer-portal-header-divider" aria-hidden="true" />
            <div className="customer-portal-user-menu" ref={userMenuRef}>
              <button ref={userMenuButtonRef} type="button" className="customer-portal-header-user"
                aria-label={`Tài khoản ${userName || brand}`} aria-expanded={userMenuOpen} aria-haspopup="menu"
                onClick={() => setUserMenuOpen(open => !open)}>
                <span className="customer-portal-avatar">{initial}</span><span><strong>{userName || brand}</strong><small>{roleLabel}</small></span>
                <ChevronDown size={15} className={userMenuOpen ? 'is-open' : ''} aria-hidden="true" />
              </button>
              {userMenuOpen && <div className="customer-portal-user-popover" role="menu" aria-label="Tùy chọn tài khoản">
                <div className="customer-portal-user-summary"><span className="customer-portal-avatar">{initial}</span><span><strong>{userName || brand}</strong><small>{roleLabel}</small></span></div>
                <button type="button" role="menuitem" onClick={() => { setUserMenuOpen(false); navigate('profile'); }}><User size={16} />Hồ sơ cá nhân</button>
                <button type="button" role="menuitem" onClick={() => { setUserMenuOpen(false); onLogout(); }}><LogOut size={16} />Đăng xuất</button>
              </div>}
            </div>
          </div>
          <span className="customer-portal-header-glow" aria-hidden="true" />
        </header>
        <div className="customer-portal-content">
          {children}
        </div>
      </main>
      {changePasswordOpen && <ChangePasswordModal onClose={() => setChangePasswordOpen(false)} />}
    </div>
  );
}
