import { useState } from 'react';
import { BarChart3, BadgePercent, Boxes, ChevronLeft, ClipboardCheck, ClipboardList, Headphones, History, LayoutDashboard, Menu, MessageSquare, Package, Settings, ShieldCheck, ShoppingBag, UserRound, Users, X } from 'lucide-react';

const icons = {
  dashboard: LayoutDashboard,
  analysis: BarChart3,
  customers: Users,
  orders: ShoppingBag,
  reports: ClipboardList,
  settings: Settings,
  accounts: ShieldCheck,
  products: ShoppingBag,
  employees: UserRound,
  inventory: Boxes,
  promotions: BadgePercent,
  feedbacks: MessageSquare,
  surveys: ClipboardCheck,
  chat: Headphones,
  audit: History,
};

export default function Sidebar({ items, active, onSelect }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const select = key => { onSelect(key); setDrawerOpen(false); };
  return <>
    <button type="button" className="dashboard-mobile-menu" aria-label="Mở menu" onClick={() => setDrawerOpen(true)}><Menu size={20} /></button>
    {drawerOpen && <button type="button" aria-label="Đóng menu" className="dashboard-drawer-overlay" onClick={() => setDrawerOpen(false)} />}
    <aside className={'dashboard-sidebar dashboard-enter-sidebar' + (collapsed ? ' dashboard-sidebar--collapsed' : '') + (drawerOpen ? ' dashboard-sidebar--open' : '')} aria-label="Thanh điều hướng">
      <div className="dashboard-sidebar-entrance">
      <div className="dashboard-brand"><div className="dashboard-brand-mark">H</div>{!collapsed && <div><strong>HUNG FASHION</strong><span>BẢNG ĐIỀU KHIỂN</span></div>}
        <button type="button" className="dashboard-sidebar-close" aria-label="Đóng menu" onClick={() => setDrawerOpen(false)}><X size={18} /></button>
      </div>
      <p className="dashboard-nav-label">{!collapsed && 'MENU CHÍNH'}</p>
      <nav className="dashboard-nav">{items.map(item => {
        const Icon = icons[item.key] || Package;
        return <button key={item.key} type="button" title={collapsed ? item.label : undefined} aria-current={active === item.key ? 'page' : undefined}
          className={'dashboard-nav-item' + (active === item.key ? ' is-active' : '')} onClick={() => select(item.key)}>
          <Icon size={19} strokeWidth={1.8} />{!collapsed && <span>{item.label}</span>}
          {item.badgeCount > 0 && <b className="ml-auto grid min-w-5 h-5 place-items-center rounded-full bg-pink-500 px-1 text-[10px] font-bold leading-none text-white" aria-label={`${item.badgeCount} tin chưa đọc`}>{item.badgeCount > 99 ? '99+' : item.badgeCount}</b>}
          {active === item.key && <i aria-hidden="true" />}
        </button>;
      })}</nav>
      <div className="dashboard-sidebar-bottom">
        <button type="button" className="dashboard-collapse" aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>
          <ChevronLeft size={17} className={collapsed ? 'rotate-180' : ''} />{!collapsed && 'Thu gọn menu'}
        </button>
      </div>
      </div>
    </aside>
  </>;
}
