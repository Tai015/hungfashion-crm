import {
  ClipboardList, Clock, FileText, Grid2x2, IdCard,
  LogOut, MessageSquare, Package, Settings,
  ShoppingBag, ShoppingCart, Tag, User, Users,
} from 'lucide-react';

const NAV_ICONS = {
  dashboard:  Grid2x2,
  accounts:   Users,
  customers:  User,
  products:   ShoppingBag,
  feedbacks:  MessageSquare,
  surveys:    ClipboardList,
  audit:      Clock,
  settings:   Settings,
  employees:  IdCard,
  inventory:  Package,
  receipts:   FileText,
  orders:     ShoppingCart,
  promotions: Tag,
  catalog:    ShoppingBag,
  profile:    User,
  feedback:   MessageSquare,
};

function BrandMark({ initial }) {
  return (
    <div
      aria-hidden="true"
      className="grid w-[42px] h-[42px] place-items-center border border-orange-500/40 rounded-[14px] bg-gradient-to-br from-orange-500/35 to-orange-600/20 text-orange-500 text-base font-extrabold shadow-[0_6px_18px_rgba(249,115,22,0.25)]"
    >
      {initial}
    </div>
  );
}

export default function AppShell({
  brand, userName, roleLabel, navItems, active, onNav, onLogout, extraHeaderContent, children,
}) {
  const initial = (userName || brand || 'HF').slice(0, 1).toUpperCase();

  return (
    <div className="flex min-h-screen p-[18px]">
      {/* Glass stage */}
      <div className="flex flex-1 min-h-[calc(100vh-36px)] overflow-hidden border border-white/[0.12] rounded-[28px] bg-gradient-to-br from-white/[0.08] to-white/[0.03] shadow-[0_32px_80px_rgba(0,0,0,0.55)] backdrop-blur-[32px]">

        {/* Sidebar */}
        <aside className="flex flex-col items-center w-[84px] py-[22px] px-3 border-r border-white/[0.07] bg-white/[0.04] shrink-0">
          {/* Brand */}
          <div className="flex flex-col items-center gap-2 mb-[22px] text-center" title={brand}>
            <BrandMark initial={initial} />
            <small className="max-w-[72px] text-white/35 text-[0.58rem] font-semibold tracking-[0.06em] uppercase leading-tight">
              {brand}
            </small>
          </div>

          {/* Nav */}
          <nav className="flex flex-col items-center gap-2 flex-1 w-full">
            {navItems.map(([key, label]) => {
              const Icon = NAV_ICONS[key] || Grid2x2;
              const isActive = active === key;
              return (
                <button
                  key={key}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onNav(key)}
                  className={`grid place-items-center w-11 h-11 rounded-[14px] border transition-all duration-200 ${
                    isActive
                      ? 'bg-orange-500/[0.18] border-orange-500/35 text-orange-500 shadow-[0_6px_20px_rgba(249,115,22,0.2)]'
                      : 'bg-transparent border-transparent text-white/40 hover:bg-white/[0.08] hover:border-white/[0.12] hover:text-white/75'
                  }`}
                >
                  <Icon size={18} />
                  <span className="sr-only">{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="flex flex-col items-center gap-2.5 mt-auto">
            {roleLabel && (
              <small className="max-w-[76px] text-white/30 text-[0.58rem] text-center leading-tight">
                {roleLabel}
              </small>
            )}
            <button
              type="button"
              title="Đăng xuất"
              aria-label="Đăng xuất"
              onClick={onLogout}
              className="grid place-items-center w-11 h-11 rounded-[14px] border border-transparent text-white/35 transition-all duration-200 hover:bg-red-500/[0.12] hover:border-red-500/20 hover:text-red-400"
            >
              <LogOut size={18} />
              <span className="sr-only">Đăng xuất</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-auto p-6 md:p-7">
          {extraHeaderContent && (
            <div className="flex justify-end mb-4">
              {extraHeaderContent}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
