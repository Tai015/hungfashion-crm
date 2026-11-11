import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';
import FilterPopover from '../components/FilterPopover';
import { useSweetAlertMessages } from '../utils/notifications';

const LIMIT = 20;
const TH    = 'px-3.5 py-2.5 text-left text-[0.72rem] font-semibold tracking-[0.05em] uppercase text-white/38 border-b border-white/[0.08] whitespace-nowrap';
const TD    = 'px-3.5 py-3 border-b border-white/[0.05] text-white/78 align-middle';
const PANEL = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';

const fmtDT = v => v ? new Date(v).toLocaleString('vi-VN') : '—';

export default function AuditLogView() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  useSweetAlertMessages({ error });
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [filters, setFilters] = useState({ event: '', route: '', user: '' });

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (filters.event.trim()) params.set('event', filters.event.trim());
    if (filters.route.trim()) params.set('route', filters.route.trim());
    if (filters.user.trim()) params.set('user', filters.user.trim());
    apiFetch(`/api/reports/audit-logs?${params}`)
      .then(r => { if(active) { setLogs(r.data); setTotal(r.total); } })
      .catch(e => { if(active) setError(e.message); })
      .finally(() => { if(active) setLoading(false); });
    return () => { active = false; };
  }, [page, filters]);

  const clearFilters = () => {
    const empty = { event: '', route: '', user: '' };
    setFilters(empty);
    setPage(1);
  };
  const activeFilterCount = Object.values(filters).filter(value => value.trim()).length;

  const totalPages = Math.ceil(total/LIMIT)||1;

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Hệ thống</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Nhật ký hoạt động</h1>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-indigo-500/30 rounded-full bg-indigo-500/10 text-indigo-300 text-[0.78rem] font-semibold">
          <Activity size={13}/> Audit Log
        </span>
      </div>


      <div className={PANEL}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2.5 m-0 text-[1.05rem] font-semibold">
            Kiểm toán thao tác nghiệp vụ
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-500 text-xs font-semibold">{total.toLocaleString('vi-VN')}</span>
          </h2>
          <div className="flex items-center gap-3">
            <small className="text-white/30 text-xs">Theo dõi thao tác thay đổi dữ liệu và kết quả xử lý</small>
            <FilterPopover title="Lọc nhật ký" activeCount={activeFilterCount} onClear={clearFilters}>
              <label className="flex flex-col gap-1.5 text-xs text-white/65">Sự kiện<input className="h-9 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none focus:border-orange-400/50" placeholder="Ví dụ: customer.update" value={filters.event} onChange={e => { setFilters(current => ({ ...current, event: e.target.value })); setPage(1); }}/></label>
              <label className="flex flex-col gap-1.5 text-xs text-white/65">Trang<input className="h-9 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none focus:border-orange-400/50" placeholder="Ví dụ: customer, order" value={filters.route} onChange={e => { setFilters(current => ({ ...current, route: e.target.value })); setPage(1); }}/></label>
              <label className="flex flex-col gap-1.5 text-xs text-white/65">Người dùng<input className="h-9 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none focus:border-orange-400/50" placeholder="Tên tài khoản thực hiện" value={filters.user} onChange={e => { setFilters(current => ({ ...current, user: e.target.value })); setPage(1); }}/></label>
            </FilterPopover>
          </div>
        </div>

        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {['Thời gian','Người thực hiện','Hành động','Đối tượng','Thay đổi','Kết quả','Request ID'].map(h => <th key={h} className={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.event_id} className="hover:bg-white/[0.04] transition-colors">
                    <td className={`${TD} text-white/50 text-[0.8rem] tabular-nums whitespace-nowrap`}>{fmtDT(log.occurred_at)}</td>
                    <td className={TD}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-[#f5f0eb] text-[0.86rem]">{log.username || 'Tác nhân hệ thống / chưa xác thực'}</span>
                        <small className="text-white/30 text-[0.72rem]">{log.role_name || 'Không xác định vai trò'}</small>
                      </div>
                    </td>
                    <td className={TD}>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-500/[0.08] text-indigo-300/70 text-[0.78rem] font-medium">{log.event_type}</span>
                    </td>
                    <td className={TD}>
                      <code className="px-2 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.07] text-white/60 text-[0.78rem] font-mono">{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</code>
                    </td>
                    <td className={TD}>
                      <span className="text-white/45 text-[0.75rem]">{Object.entries(log.changes || {}).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') || 'Không ghi nhận trường thay đổi'}</span>
                    </td>
                    <td className={TD}>
                      <span className={`text-[0.7rem] font-bold tracking-[0.06em] uppercase px-2 py-0.5 rounded-md ${log.outcome === 'success' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{log.outcome === 'success' ? 'Thành công' : 'Thất bại'} · {log.status_code}</span>
                    </td>
                    <td className={TD}>
                      <code className="text-[0.68rem] text-white/40 font-mono">{log.request_id || '—'}</code>
                    </td>
                  </tr>
                ))}
                {!logs.length && !loading && (
                  <tr><td colSpan={7} className="py-10 text-center text-white/25 text-sm">Chưa có nhật ký hoạt động nào.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4 border-t border-white/[0.06]">
            <button className="grid w-9 h-9 place-items-center border border-white/10 rounded-xl bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] hover:text-[#f5f0eb] disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={page<=1} onClick={() => setPage(p => p-1)}><ChevronLeft size={15}/></button>
            <span className="text-white/40 text-sm tabular-nums">Trang {page} / {totalPages} · {total} bản ghi</span>
            <button className="grid w-9 h-9 place-items-center border border-white/10 rounded-xl bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] hover:text-[#f5f0eb] disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={page>=totalPages} onClick={() => setPage(p => p+1)}><ChevronRight size={15}/></button>
          </div>
        )}
      </div>
    </div>
  );
}
