import { useEffect, useRef, useState } from 'react';
import { CheckCircle, MessageSquare, Send, UserCheck, X } from 'lucide-react';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';

const POLL_MS = 3000;
const BUBBLE_STAFF    = 'self-end max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-orange-500 text-white text-sm leading-relaxed';
const BUBBLE_CUSTOMER = 'self-start max-w-[75%] px-4 py-2.5 rounded-2xl rounded-bl-sm bg-white/[0.09] border border-white/10 text-white/80 text-sm leading-relaxed';
const fmtTime = v => new Date(v).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
const fmtDT   = v => new Date(v).toLocaleString('vi-VN');

const STATUS_COLOR = { Open:'text-emerald-400', Resolved:'text-sky-400', Closed:'text-slate-400' };
const STATUS_LABEL = { Open:'Đang mở', Resolved:'Đã giải quyết', Closed:'Đã đóng' };
const PANEL = 'flex flex-col gap-4 p-5 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';

export default function StaffChatView() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected]           = useState(null);
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState('');
  const [loading, setLoading]             = useState(true);
  const [sending, setSending]             = useState(false);
  const [error, setError]                 = useState('');
  const [statusFilter, setStatusFilter]   = useState('Open');
  const bottomRef = useRef(null);
  const pollRef   = useRef(null);

  const loadConversations = () => {
    const q = statusFilter ? `?status=${statusFilter}` : '';
    return apiFetch(`/api/chat/${q}`)
      .then(setConversations).catch(() => {});
  };

  useEffect(() => {
    setLoading(true);
    loadConversations().finally(() => setLoading(false));
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const pollMessages = async () => {
    if (!selected) return;
    try {
      const msgs = await apiFetch(`/api/chat/${selected.conversation_id}/messages`);
      setMessages(msgs);
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!selected) { clearInterval(pollRef.current); return; }
    setMessages([]); setError('');
    apiFetch(`/api/chat/${selected.conversation_id}/messages`)
      .then(setMessages).catch(e => setError(e.message));
    pollRef.current = setInterval(pollMessages, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [selected?.conversation_id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [messages]);

  const send = async e => {
    e.preventDefault();
    if (!input.trim() || !selected) return;
    setSending(true); setError('');
    try {
      const msg = await apiFetch(`/api/chat/${selected.conversation_id}/messages`, {
        method:'POST', body:{ content: input.trim() },
      });
      setMessages(prev => [...prev, msg]);
      setInput('');
    } catch(e) { setError(e.message); }
    finally { setSending(false); }
  };

  const updateStatus = async (convId, status) => {
    try {
      const updated = await apiFetch(`/api/chat/${convId}`, { method:'PATCH', body:{ status } });
      setConversations(cs => cs.map(c => c.conversation_id===convId ? {...c,...updated} : c));
      if (selected?.conversation_id === convId) setSelected(s => ({ ...s, ...updated }));
    } catch(e) { setError(e.message); }
  };

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div>
        <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">CSKH</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Hỗ trợ khách hàng trực tuyến</h1>
      </div>

      {error && <p className="p-3 px-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</p>}

      <div className="grid grid-cols-[280px_1fr] gap-4" style={{ height:'calc(100vh - 240px)', minHeight:500 }}>
        {/* Danh sách hội thoại */}
        <div className={`${PANEL} gap-2 overflow-hidden`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-semibold text-white/70">Hội thoại</h2>
            <select className="h-7 px-2 bg-white/[0.07] border border-white/10 rounded-lg text-[#f5f0eb] text-xs outline-none cursor-pointer dark-input"
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">Tất cả</option>
              <option value="Open">Đang mở</option>
              <option value="Resolved">Đã giải quyết</option>
              <option value="Closed">Đã đóng</option>
            </select>
          </div>
          {loading ? <Spinner /> : (
            <div className="flex flex-col gap-1.5 overflow-y-auto flex-1">
              {conversations.map(c => (
                <button key={c.conversation_id} type="button"
                  onClick={() => setSelected(c)}
                  className={`flex flex-col gap-1 p-3 border rounded-xl text-left cursor-pointer transition-all ${selected?.conversation_id===c.conversation_id ? 'border-orange-500/40 bg-orange-500/[0.1]' : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]'}`}>
                  <div className="flex items-center gap-1.5">
                    <div className="grid w-7 h-7 place-items-center rounded-lg bg-white/[0.07] text-white/60 shrink-0">
                      <MessageSquare size={12}/>
                    </div>
                    <span className="text-sm font-semibold truncate text-[#f5f0eb]">{c.customer_name}</span>
                    {c.unread_count > 0 && (
                      <span className="ml-auto shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-500 text-white text-[0.65rem] font-bold">{c.unread_count}</span>
                    )}
                  </div>
                  <p className="m-0 text-white/35 text-xs truncate pl-8">{c.last_message || 'Chưa có tin nhắn'}</p>
                  <div className="flex items-center justify-between pl-8">
                    <span className={`text-[0.65rem] font-semibold ${STATUS_COLOR[c.status]||'text-white/40'}`}>{STATUS_LABEL[c.status]||c.status}</span>
                    <span className="text-[0.65rem] text-white/25">{fmtDT(c.updated_at)}</span>
                  </div>
                </button>
              ))}
              {!conversations.length && <p className="text-center text-white/25 text-sm py-8">Không có hội thoại.</p>}
            </div>
          )}
        </div>

        {/* Khung chat */}
        {selected ? (
          <div className={`${PANEL} overflow-hidden`} style={{ display:'flex', flexDirection:'column' }}>
            {/* Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-white/[0.08]">
              <div className="grid w-9 h-9 place-items-center rounded-xl bg-white/[0.07] text-white/60 shrink-0">
                <MessageSquare size={16}/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="m-0 text-sm font-semibold">{selected.customer_name}</p>
                <p className="m-0 text-xs text-white/35">{selected.customer_email} · {selected.customer_phone||'—'}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.status === 'Open' && (
                  <button className="inline-flex items-center gap-1 h-8 px-3 bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-medium rounded-lg cursor-pointer hover:bg-emerald-500/25 transition-all"
                    onClick={() => updateStatus(selected.conversation_id, 'Resolved')}>
                    <CheckCircle size={12}/> Giải quyết xong
                  </button>
                )}
                {(selected.status === 'Open' || selected.status === 'Resolved') && (
                  <button className="inline-flex items-center gap-1 h-8 px-3 bg-white/[0.06] border border-white/12 text-white/50 text-xs font-medium rounded-lg cursor-pointer hover:bg-white/[0.12] transition-all"
                    onClick={() => updateStatus(selected.conversation_id, 'Closed')}>
                    <X size={12}/> Đóng
                  </button>
                )}
                {selected.status !== 'Open' && (
                  <button className="inline-flex items-center gap-1 h-8 px-3 bg-sky-500/15 border border-sky-500/25 text-sky-400 text-xs font-medium rounded-lg cursor-pointer hover:bg-sky-500/25 transition-all"
                    onClick={() => updateStatus(selected.conversation_id, 'Open')}>
                    Mở lại
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 py-3">
              {!messages.length && <p className="text-center text-white/25 text-sm py-8">Chưa có tin nhắn.</p>}
              {messages.map(m => {
                const isStaff = m.sender_role !== 'KHACH_HANG';
                return (
                  <div key={m.message_id} className={`flex flex-col gap-0.5 ${isStaff?'items-end':'items-start'}`}>
                    {!isStaff && <span className="text-white/35 text-[0.7rem] ml-1">{m.sender_name}</span>}
                    <span className={isStaff ? BUBBLE_STAFF : BUBBLE_CUSTOMER}>{m.content}</span>
                    <span className={`text-[0.65rem] text-white/25 ${isStaff?'mr-1':'ml-1'}`}>{fmtTime(m.sent_at)}</span>
                  </div>
                );
              })}
              <div ref={bottomRef}/>
            </div>

            {/* Input */}
            <form onSubmit={send} className="flex gap-2 mt-auto pt-3 border-t border-white/[0.08]">
              <input
                className="flex-1 h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input"
                placeholder="Nhập tin nhắn trả lời..."
                value={input} onChange={e => setInput(e.target.value)}
                maxLength={5000} disabled={sending || selected.status === 'Closed'}
              />
              <button type="submit"
                className="grid w-10 h-10 place-items-center bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 rounded-xl text-white shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] transition-all cursor-pointer disabled:opacity-50"
                disabled={sending || !input.trim() || selected.status === 'Closed'}>
                <Send size={15}/>
              </button>
            </form>
          </div>
        ) : (
          <div className={`${PANEL} items-center justify-center text-white/25`}>
            <MessageSquare size={48} className="opacity-30"/>
            <p className="text-sm">Chọn một cuộc hội thoại để bắt đầu</p>
          </div>
        )}
      </div>
    </div>
  );
}
