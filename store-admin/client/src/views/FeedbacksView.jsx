import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MessageSquare, Search, Send, Star, X } from 'lucide-react';
import { apiFetch } from '../api';
import { useSweetAlertMessages } from '../utils/notifications';
import Spinner from '../components/Spinner';
import FilterPopover from '../components/FilterPopover';
import FeedbackMedia from '../components/FeedbackMedia';

const STATUS_COLOR = {
  New:      { color:'#f59e0b', bg:'rgba(245,158,11,0.12)' },
  Processing:{ color:'#38bdf8', bg:'rgba(56,189,248,0.12)' },
  Resolved: { color:'#10b981', bg:'rgba(16,185,129,0.12)' },
  Rejected: { color:'#f43f5e', bg:'rgba(244,63,94,0.12)' },
};
const FILTERS = [['','Tất cả'],['Pending','Chờ xử lý'],['Resolved','Đã giải quyết'],['Rejected','Từ chối']];

const BTN_PRIMARY = 'inline-flex items-center gap-1.5 h-9 px-4 bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] hover:-translate-y-px transition-all disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer';
const PANEL = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';

function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={12} className={i<=rating ? 'text-amber-400 fill-amber-400' : 'text-white/20 fill-transparent'} />
      ))}
    </div>
  );
}

function StatusPill({ status }) {
  const { color, bg } = STATUS_COLOR[status] || { color:'#94a3b8', bg:'rgba(148,163,184,0.12)' };
  const labels = { New:'Mới', Processing:'Đang xử lý', Pending:'Chờ xử lý', Resolved:'Đã giải quyết', Rejected:'Từ chối' };
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ color, background:bg }}>
      {labels[status]||status}
    </span>
  );
}

function ReplyForm({ feedback, onSaved }) {
  const [reply, setReply] = useState(feedback.reply||'');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  useSweetAlertMessages({ error });
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { await apiFetch(`/api/feedbacks/${feedback.feedback_id}/reply`, { method:'PATCH', body:{ reply } }); onSaved(); }
    catch(err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <form className="flex items-start gap-2.5 mt-3 ml-[52px] flex-wrap" onSubmit={submit}>
      <textarea className="flex-1 min-w-[200px] min-h-[60px] px-3 py-2.5 bg-white/[0.07] border border-white/12 rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all resize-y dark-input"
        rows={2} required maxLength={5000} value={reply} onChange={e => setReply(e.target.value)} placeholder="Nhập nội dung trả lời..." />
      <button className={BTN_PRIMARY} style={{ height:32, padding:'0 14px', fontSize:'0.8rem', alignSelf:'flex-start' }} type="submit" disabled={busy}>
        <Send size={13}/> {busy ? 'Đang gửi...' : 'Gửi trả lời'}
      </button>
    </form>
  );
}

function FeedbackCard({ f, onRefresh }) {
  const { color, bg } = STATUS_COLOR[f.status] || { color:'#94a3b8', bg:'rgba(148,163,184,0.12)' };
  return (
    <motion.div className="flex flex-col p-[18px_22px] bg-white/[0.055] border border-white/[0.08] rounded-2xl"
      layout initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.2 }}>
      <div className="flex items-center gap-3.5">
        <div className="grid w-[38px] h-[38px] place-items-center rounded-xl shrink-0" style={{ background:bg, color }}>
          <MessageSquare size={14}/>
        </div>
        <div className="flex items-baseline gap-2 flex-1 min-w-0 flex-wrap">
          <strong className="text-[0.94rem] font-semibold text-[#f5f0eb] whitespace-nowrap">{f.customer_name||'Ẩn danh'}</strong>
          {f.feedback_type && <span className="text-[0.72rem] text-white/35 bg-white/[0.07] px-2 py-0.5 rounded-full whitespace-nowrap">{f.feedback_type}</span>}
          {f.product_name  && <span className="text-[0.75rem] text-white/32 whitespace-nowrap overflow-hidden text-ellipsis">· {f.product_name}</span>}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {f.rating > 0 && <StarRating rating={f.rating}/>}
          <StatusPill status={f.status}/>
        </div>
      </div>
      <p className="ml-[52px] mt-3 text-white/62 text-[0.87rem] leading-[1.65] break-words">{f.content}</p>
      {!!f.attachments?.length && <div className="ml-[52px] mt-3 flex flex-wrap gap-3">
        {f.attachments.map(media => <FeedbackMedia key={media.attachment_id} media={media} />)}
      </div>}
      {f.reply && (
        <div className="ml-[52px] mt-2.5 p-[10px_14px] rounded-[10px] border-l-[3px] border-emerald-500/50 bg-emerald-500/[0.08] text-white/60 text-[0.82rem] leading-[1.5]">
          <small className="block text-emerald-400 text-[0.7rem] font-bold mb-1 uppercase tracking-[0.06em]">Đã trả lời</small>
          {f.reply}
        </div>
      )}
      {f.status !== 'Resolved' && <ReplyForm feedback={f} onSaved={onRefresh}/>}
    </motion.div>
  );
}

const LIMIT = 20;

export default function FeedbacksView() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [total, setTotal]         = useState(0);
  const [status, setStatus]       = useState('');
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  useSweetAlertMessages({ error });
  const [stats, setStats]         = useState({});

  const load = () => {
    setLoading(true); setError('');
    const p = new URLSearchParams({ page, limit:LIMIT });
    if (status) p.set('status', status);
    if (search) p.set('search', search);
    Promise.all([apiFetch(`/api/feedbacks?${p}`), apiFetch('/api/feedbacks/stats')])
      .then(([fd, st]) => { setFeedbacks(fd.data||[]); setTotal(fd.total||0); setStats(st||{}); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [status, search, page]);

  const totalPages = Math.ceil(total/LIMIT)||1;

  const STAT_CARDS = [
    { label:'Tất cả', value:stats.total||0, color:'#f97316', filter:'' },
    { label:'Chờ xử lý', value:stats.pending||0, color:'#f59e0b', filter:'Pending' },
    { label:'Đã giải quyết', value:stats.resolved||0, color:'#10b981', filter:'Resolved' },
    { label:'Từ chối', value:stats.rejected||0, color:'#f43f5e', filter:'Rejected' },
  ];

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">CRM</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Phản hồi khách hàng</h1>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {STAT_CARDS.map(s => (
          <motion.button key={s.label} type="button" whileHover={{ y:-2 }} onClick={() => { setStatus(s.filter); setPage(1); }}
            className={`flex flex-col items-start gap-1 p-[18px_22px] border rounded-2xl backdrop-blur-xl cursor-pointer transition-all text-left ${status===s.filter ? 'border-orange-500/35 bg-orange-500/[0.1]' : 'border-white/10 bg-white/[0.055] hover:bg-white/[0.09]'}`}>
            <span className="text-[0.72rem] font-bold tracking-[0.06em] uppercase" style={{ color:s.color }}>{s.label}</span>
            <span className="text-[1.9rem] font-bold tracking-[-0.04em] text-[#f5f0eb]">{s.value}</span>
          </motion.button>
        ))}
      </div>

      {/* Filter / search */}
      <div className="flex items-center flex-wrap gap-2.5 px-4 py-3 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl">
        <div className="relative flex items-center flex-1">
          <Search size={14} className="absolute left-3 text-white/30 pointer-events-none"/>
          <input className="w-full h-9 pl-9 pr-3 bg-white/[0.06] border border-white/10 rounded-xl text-[#f5f0eb] text-sm placeholder-white/25 outline-none focus:border-orange-500/50 focus:bg-white/10 dark-input transition-all"
            placeholder="Tìm tên khách hàng hoặc nội dung..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <FilterPopover title="Lọc phản hồi" activeCount={[status, search].filter(Boolean).length}
          onClear={() => { setStatus(''); setSearch(''); setPage(1); }}>
          <label className="flex flex-col gap-1.5 text-xs text-white/65">Trạng thái<select className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none focus:border-orange-400/50 dark-input" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>{FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </FilterPopover>
      </div>


      {/* List */}
      <div className={PANEL}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2.5 m-0 text-[1.05rem] font-semibold">
            Phản hồi
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-500 text-xs font-semibold">{total}</span>
          </h2>
        </div>
        {loading ? <Spinner /> : (
          <>
            {feedbacks.length ? (
              <div className="flex flex-col gap-2.5">
                <AnimatePresence>
                  {feedbacks.map(f => <FeedbackCard key={f.feedback_id} f={f} onRefresh={load}/>)}
                </AnimatePresence>
              </div>
            ) : (
              <p className="py-12 text-center text-white/25 text-sm">Không có phản hồi nào.</p>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4 border-t border-white/[0.06]">
                <button className="grid w-9 h-9 place-items-center border border-white/10 rounded-xl bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] hover:text-[#f5f0eb] disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={page<=1} onClick={() => setPage(p => p-1)}><ChevronLeft size={15}/></button>
                <span className="text-white/40 text-sm tabular-nums">Trang {page} / {totalPages}</span>
                <button className="grid w-9 h-9 place-items-center border border-white/10 rounded-xl bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] hover:text-[#f5f0eb] disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={page>=totalPages} onClick={() => setPage(p => p+1)}><ChevronRight size={15}/></button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
