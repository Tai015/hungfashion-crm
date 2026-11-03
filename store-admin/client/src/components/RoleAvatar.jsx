import {
  BriefcaseBusiness,
  Headset,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  UsersRound,
  Warehouse,
} from 'lucide-react';

const ROLE_AVATARS = {
  ADMIN: { label: 'Quản trị viên', Icon: ShieldCheck, color: 'border-violet-300/25 bg-violet-500/15 text-violet-200' },
  QL_KHO: { label: 'Quản lý kho', Icon: Warehouse, color: 'border-sky-300/25 bg-sky-500/15 text-sky-200' },
  QL_BAN_HANG: { label: 'Quản lý bán hàng', Icon: ShoppingBag, color: 'border-orange-300/25 bg-orange-500/15 text-orange-200' },
  QL_KHACH_HANG: { label: 'Quản lý khách hàng', Icon: UsersRound, color: 'border-emerald-300/25 bg-emerald-500/15 text-emerald-200' },
  QL_NHAN_SU: { label: 'Quản lý nhân sự', Icon: BriefcaseBusiness, color: 'border-pink-300/25 bg-pink-500/15 text-pink-200' },
  KHACH_HANG: { label: 'Khách hàng', Icon: UserRound, color: 'border-orange-300/25 bg-orange-500/15 text-orange-200' },
};

export default function RoleAvatar({ role, name, size = 'md', className = '' }) {
  const avatar = ROLE_AVATARS[role] || { label: name || 'Người tham gia', Icon: Headset, color: 'border-white/15 bg-white/10 text-white/70' };
  const Icon = avatar.Icon;
  const dimensions = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-10 w-10';

  return (
    <span
      className={`inline-grid ${dimensions} shrink-0 place-items-center rounded-full border ${avatar.color} ${className}`}
      role="img"
      aria-label={`Ảnh đại diện: ${avatar.label}`}
      title={avatar.label}
    >
      <Icon size={size === 'sm' ? 15 : size === 'lg' ? 20 : 18} strokeWidth={1.8} aria-hidden="true" />
    </span>
  );
}
