import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpRight, ClipboardList, DollarSign,
  MessageSquare, Search, ShoppingBag,
  Star, TrendingUp, Users, Wallet,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { fmtVND } from '../utils/formatters';
import { useDashboardData } from '../hooks/useDashboardData';
import { useSweetAlertMessages } from '../utils/notifications';

const COLORS = ['#10b981', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6'];
const AXIS   = { fontSize: 11, fill: 'rgba(255,255,255,0.45)' };
const GRID   = { stroke: 'rgba(255,255,255,0.06)', strokeDasharray: '4 4' };
const TOOLTIP_STYLE = { backgroundColor: 'rgba(30,24,20,0.98)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, color: '#f5f0eb' };

function CustomerShareTooltip({ active, payload, label, labelName }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2 text-xs shadow-xl">
      <p className="m-0 mb-1 font-semibold">{labelName}: {label}</p>
      <p className="m-0 text-white/70">Số khách: {Number(item.count).toLocaleString('vi-VN')}</p>
      <p className="m-0 text-white/70">Tỷ lệ: {Number(item.percent).toLocaleString('vi-VN')}%</p>
    </div>
  );
}

const TABS = [['overview','Tổng quan'],['history','Lịch sử'],['analytics','Phân tích'],['accounts','Tài khoản']];

function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function MiniSparkline({ color = '#10b981' }) {
  const pts = [30,45,35,55,42,60,50,68];
  const max = Math.max(...pts), min = Math.min(...pts), range = max-min||1;
  const w=80, h=36;
  const points = pts.map((v,i) => `${(i/(pts.length-1))*w},${h-((v-min)/range)*h}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display:'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MiniCard({ label, value, change, sub, accent='#10b981', icon: Icon }) {
  const isUp = Number(change) >= 0;
  return (
    <motion.article whileHover={{ y:-4, scale:1.02 }}
      className="flex flex-col gap-1 p-4 bg-white/[0.055] border border-white/[0.09] rounded-[18px] backdrop-blur-xl cursor-default transition-all hover:bg-white/[0.09]">
      <div className="flex items-center justify-between mb-1">
        <div className="grid w-[30px] h-[30px] place-items-center rounded-[9px]" style={{ background:`${accent}22`, color:accent }}>
          {Icon && <Icon size={16} />}
        </div>
        <span className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: isUp ? '#10b981' : '#f43f5e' }}>
          <ArrowUpRight size={13} style={{ transform: isUp ? 'none' : 'rotate(90deg)' }} />
          {change !== undefined ? `${Math.abs(change)}%` : sub}
        </span>
      </div>
      <h3 className="m-0 text-[1.3rem] font-bold tracking-[-0.03em] text-[#f5f0eb]">{value}</h3>
      <p className="m-0 text-white/40 text-[0.72rem]">{label}</p>
      <MiniSparkline color={accent} />
    </motion.article>
  );
}

function TxRow({ name, amount, status, channel, index }) {
  const colors = ['#10b981','#0ea5e9','#f59e0b','#8b5cf6','#f43f5e'];
  const c = colors[index % colors.length];
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors hover:bg-white/[0.05]">
      <div className="grid w-[38px] h-[38px] place-items-center rounded-xl text-sm font-bold shrink-0"
        style={{ background:`${c}22`, color:c }}>
        {(name||'U').slice(0,1).toUpperCase()}
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[#f5f0eb] text-sm font-medium truncate">{name||'Khách vãng lai'}</span>
        <span className="text-white/35 text-xs">{channel}</span>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-[#f5f0eb] text-sm font-semibold whitespace-nowrap">{fmtVND(amount)}</span>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

export default function DashboardView({ userRole, userName }) {
  const { kpi, revenueData, monthlyRevenueData, topProducts, recentOrders, byTier, byGender, byAge, byInterest, loading, lastUpdated, error } = useDashboardData(userRole);
  useSweetAlertMessages({ error });
  const [tab, setTab] = useState('overview');
  const [search, setSearch] = useState('');
  const canAnalyze = ['ADMIN','QL_KHACH_HANG'].includes(userRole);
  const canSearchOrders = ['ADMIN','QL_BAN_HANG'].includes(userRole);
  const filteredOrders = recentOrders.filter(order => {
    const query = search.trim().toLocaleLowerCase('vi');
    if (!query) return true;
    return [order.order_id, order.customer_name, order.order_status, order.order_channel]
      .some(value => String(value || '').toLocaleLowerCase('vi').includes(query));
  });

  if (loading) return <Spinner />;

  const totalRevenue = revenueData.reduce((s,d) => s+Number(d.revenue||0), 0);
  const displayName  = userName || 'Hung Fashion';
  const initial      = displayName.slice(0,1).toUpperCase();

  const PANEL = 'bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';
  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">

      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 px-4 py-3 bg-white/[0.05] border border-white/10 rounded-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="grid w-9 h-9 place-items-center rounded-full border border-white/18 bg-orange-500/25 text-orange-500 text-sm font-bold shrink-0">
            {initial}
          </div>
          <div>
            <p className="m-0 text-white/55 text-xs">Welcome, {displayName}</p>
            {lastUpdated && <small className="text-white/30 text-[0.7rem]">Cập nhật {lastUpdated.toLocaleString('vi-VN')}</small>}
          </div>
        </div>
        {canSearchOrders && (
          <label className="relative flex min-w-0 items-center">
            <Search size={15} className="absolute left-2.5 text-white/40 pointer-events-none" />
            <input
              type="search"
              aria-label="Tìm đơn hàng gần đây"
              className="w-[min(200px,35vw)] h-9 pl-8 pr-3 bg-white/[0.06] border border-white/10 rounded-xl text-[#f5f0eb] text-sm placeholder-white/50 outline-none focus:border-orange-500/70 focus:bg-white/10 dark-input transition-all"
              placeholder="Tìm đơn hàng..."
              value={search}
              onFocus={() => setTab('history')}
              onChange={event => { setSearch(event.target.value); setTab('history'); }}
            />
          </label>
        )}
      </header>


      {/* Greeting */}
      <h1 className="m-0 text-[clamp(1.7rem,3vw,2.4rem)] font-bold tracking-[-0.03em] text-[#f5f0eb]">
        {timeGreeting()}, <span className="text-orange-500">{displayName}</span>
      </h1>

      {/* Hero grid */}
      <section className="grid grid-cols-[1.1fr_1fr_1fr] gap-4">
        {/* Balance card */}
        <motion.article whileHover={{ y:-6 }}
          className={`flex flex-col justify-between gap-3.5 p-6 ${PANEL} bg-gradient-to-br from-orange-500/[0.12] to-white/[0.05] border-orange-500/25`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="m-0 mb-1.5 text-white/45 text-xs font-medium tracking-[0.03em]">Tổng số dư</p>
              <strong className="block text-[clamp(1.5rem,2.8vw,2.1rem)] font-bold tracking-[-0.04em]">{fmtVND(totalRevenue)}</strong>
            </div>
            <div className="grid w-11 h-11 place-items-center border border-orange-500/30 rounded-[14px] bg-orange-500/18 text-orange-500 shrink-0">
              <Wallet size={22} />
            </div>
          </div>
          <p className="m-0 text-white/40 text-sm">
            <TrendingUp size={13} className="inline text-emerald-400 mr-1" />
            {(kpi?.total_customers||0).toLocaleString('vi-VN')} khách hàng trong hệ thống
          </p>
        </motion.article>

        {/* Mini stats 2x2 */}
        <div className="grid grid-cols-2 gap-3">
          <MiniCard icon={Users}       label="Khách mới"   value={`+${kpi?.new_customers_30d||0}`} change={12}      accent="#10b981" />
          <MiniCard icon={DollarSign}  label="Chi tiêu TB" value={fmtVND(((totalRevenue)/(kpi?.total_customers||1)).toFixed(0))} sub="Mỗi khách" accent="#0ea5e9" />
          <MiniCard icon={MessageSquare} label="Phản hồi chờ" value={kpi?.pending_feedbacks||0} sub="Cần xử lý"  accent="#f59e0b" />
          <MiniCard icon={Star}        label="Đánh giá TB" value={kpi?.avg_rating ? `${kpi.avg_rating}★` : '—'} sub="Thang 5 sao" accent="#8b5cf6" />
        </div>

        {/* Income sparkline */}
        <motion.article whileHover={{ y:-6 }} className={`flex flex-col gap-3 p-[22px] ${PANEL}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="m-0 mb-1.5 text-white/45 text-xs font-medium tracking-[0.03em]">Tổng thu nhập</p>
              <strong className="block text-[1.4rem] font-bold tracking-[-0.03em]">{fmtVND(totalRevenue)}</strong>
            </div>
            <span className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-emerald-500/18 text-emerald-400 text-xs font-semibold whitespace-nowrap">
              <ArrowUpRight size={14} /> +12%
            </span>
          </div>
          {revenueData.length ? (
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="incG" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip formatter={v => fmtVND(v)} contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="revenue" stroke="#0ea5e9" strokeWidth={2.2} fill="url(#incG)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="p-8 text-center text-white/30 text-sm">Chưa có dữ liệu</p>}
          <div className="grid grid-cols-2 gap-2.5 mt-auto">
            <MiniCard icon={ShoppingBag} label="Khảo sát" value={kpi?.active_surveys||0}   sub="Đang chạy" accent="#8b5cf6" />
            <MiniCard icon={ClipboardList} label="Đơn hàng" value={recentOrders.length}    sub="Gần đây"   accent="#f43f5e" />
          </div>
        </motion.article>
      </section>

      {/* Main panel */}
      <section className={`flex flex-col gap-5 p-6 ${PANEL}`}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="m-0 text-[1.05rem] font-semibold">Doanh thu từng tháng · 12 tháng gần nhất</h2>
        </div>

        {/* Overview */}
        {tab === 'overview' && (
          monthlyRevenueData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthlyRevenueData}>
                <defs>
                  <linearGradient id="revG" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} axisLine={false} tickLine={false} />
                <Tooltip formatter={v => fmtVND(v)} contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="revenue" stroke="#0ea5e9" strokeWidth={2.4} fill="url(#revG)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="py-16 text-center text-white/30 text-sm">Chưa có dữ liệu doanh thu</p>
        )}

        {/* History */}
        {tab === 'history' && (
          <>
            <div className="flex flex-col gap-1">
              {filteredOrders.length
                ? filteredOrders.map((o,i) => <TxRow key={o.order_id} index={i} name={o.customer_name} amount={o.total_amount} status={o.order_status} channel={o.order_channel} />)
                : <p className="py-16 text-center text-white/50 text-sm">{search.trim() ? 'Không tìm thấy đơn hàng phù hợp' : 'Chưa có đơn hàng'}</p>}
            </div>
          </>
        )}

        {/* Analytics */}
        {tab === 'analytics' && (
          <div className="grid grid-cols-2 gap-4">
            {canAnalyze && (
              <>
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
                  <h3 className="m-0 mb-1 text-sm font-semibold text-white/60">Phân bố độ tuổi</h3>
                  <p className="m-0 mb-3 text-xs text-white/40">Tính trên toàn bộ hồ sơ khách hàng, gồm cả tuổi chưa cung cấp.</p>
                  {byAge.length ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={byAge}>
                        <CartesianGrid {...GRID} /><XAxis dataKey="age" tick={AXIS} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={value => `${value}%`} tick={AXIS} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomerShareTooltip labelName="Độ tuổi" />} />
                        <Bar dataKey="percent" fill="#a78bfa" radius={[6,6,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="py-10 text-center text-white/30 text-sm">Chưa có dữ liệu</p>}
                </div>
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
                  <h3 className="m-0 mb-1 text-sm font-semibold text-white/60">Sở thích khách hàng</h3>
                  <p className="m-0 mb-3 text-xs text-white/40">Số khách và tỷ lệ trên toàn bộ hồ sơ; một khách có thể chọn nhiều sở thích.</p>
                  {byInterest.length ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={byInterest} layout="vertical">
                        <CartesianGrid {...GRID} /><XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
                        <YAxis dataKey="interest" type="category" width={90} tick={AXIS} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomerShareTooltip labelName="Sở thích" />} />
                        <Bar dataKey="count" fill="#34d399" radius={[0,6,6,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="py-10 text-center text-white/30 text-sm">Chưa có dữ liệu</p>}
                </div>
              </>
            )}
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
              <h3 className="m-0 mb-3.5 text-sm font-semibold text-white/60">Theo giới tính</h3>
              {byGender.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={byGender} dataKey="count" nameKey="gender" innerRadius={50} outerRadius={80}
                      label={({gender,percent}) => `${gender||'N/A'} ${(percent*100).toFixed(0)}%`}>
                      {byGender.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="py-10 text-center text-white/30 text-sm">Chưa có dữ liệu</p>}
            </div>
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
              <h3 className="m-0 mb-3.5 text-sm font-semibold text-white/60">Top sản phẩm</h3>
              {topProducts.length ? (
                <div className="flex flex-col gap-2">
                  {topProducts.map((p,i) => (
                    <div key={p.name} className="flex items-center gap-2.5 py-2 border-b border-white/[0.06]">
                      <span className="grid w-7 h-7 place-items-center rounded-lg text-xs font-bold shrink-0"
                        style={{ background:`${COLORS[i%COLORS.length]}22`, color:COLORS[i%COLORS.length] }}>#{i+1}</span>
                      <span className="flex-1 min-w-0 text-white/70 text-sm truncate">{p.name}</span>
                      <strong className="text-[#f5f0eb] text-sm whitespace-nowrap">{p.value} đã bán</strong>
                    </div>
                  ))}
                </div>
              ) : <p className="py-10 text-center text-white/30 text-sm">Chưa có đơn hàng nào</p>}
            </div>
          </div>
        )}

        {/* Accounts tab */}
        {tab === 'accounts' && (
          byTier.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byTier} barSize={28}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="customer_tier" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={[8,8,8,8]}>
                  {byTier.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-16 text-center text-white/30 text-sm">Chưa có dữ liệu hạng khách hàng</p>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 w-fit self-center p-1 border border-white/10 rounded-full bg-white/[0.05] mt-auto" role="tablist">
          {TABS.map(([key,label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab===key}
              onClick={() => setTab(key)}
              className={`h-8 px-4 rounded-full border-0 text-sm font-medium transition-all cursor-pointer ${
                tab===key ? 'bg-orange-500/22 text-orange-500' : 'bg-transparent text-white/40 hover:bg-white/14 hover:text-[#f5f0eb]'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
