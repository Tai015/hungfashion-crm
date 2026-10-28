import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';

const POLL_MS = 3000;

const BUBBLE_ME    = 'self-end max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-orange-500 text-white text-sm leading-relaxed';
const BUBBLE_STAFF = 'self-start max-w-[75%] px-4 py-2.5 rounded-2xl rounded-bl-sm bg-white/[0.09] border border-white/10 text-white/80 text-sm leading-relaxed';

const fmtTime = v => new Date(v).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });

export default function CskhChatView({ user }) {
  const [conv, setConv]         = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef(null);
  const pollRef   = useRef(null);

  const loadMessages = async () => {
    try {
      const msgs = await apiFetch('/api/chat/my-conversation/messages');
      setMessages(msgs);
    } catch { /* silent poll */ }
  };

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/chat/my-conversation')
      .then(c => { setConv(c); return apiFetch('/api/chat/my-conversation/messages'); })
      .then(msgs => setMessages(msgs))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    pollRef.current = setInterval(loadMessages, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [messages]);

  const send = async e => {
    e.preventDefault();
    if (!input.trim()) return;
    setSending(true); setError('');
    try {
      const msg = await apiFetch('/api/chat/my-conversation/messages', {
        method:'POST', body:{ content:input.trim() },
      });
      setMessages(prev => [...prev, {
        ...msg,
        sender_role: 'KHACH_HANG',
        sender_name: user?.full_name || user?.username || 'Bạn',
      }]);
      setInput('');
    } catch(e) { setError(e.message); }
    finally { setSending(false); }
  };

  const STATUS_COLOR = { Open:'text-emerald-400', Resolved:'text-sky-400', Closed:'text-slate-400' };
  const STATUS_LABEL = { Open:'Đang mở', Resolved:'Đã giải quyết', Closed:'Đã đóng' };

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb] h-full">
      <div>
        <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Hỗ trợ</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Chat hỗ trợ trực tuyến</h1>
      </div>

      {loading ? <Spinner /> : (
        <div className="flex flex-col flex-1 min-h-0 p-5 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
          style={{ height: 'calc(100vh - 260px)', minHeight: 420 }}>

          {/* Header cuộc hội thoại */}
          {conv && (
            <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/[0.08]">
              <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 text-sm font-bold">HF</div>
              <div>
                <p className="m-0 text-sm font-semibold">{conv.assigned_to_name || 'Hung Fashion CSKH'}</p>
                <p className={`m-0 text-xs ${STATUS_COLOR[conv.status]||'text-white/40'}`}>{STATUS_LABEL[conv.status]||conv.status}</p>
              </div>
              <p className="ml-auto text-white/25 text-xs">Trả lời trong giờ hành chính</p>
            </div>
          )}

          {/* Tin nhắn */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1">
            {!messages.length && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-white/30">
                <p className="text-sm">Xin chào! Chúng tôi có thể giúp gì cho bạn?</p>
                <p className="text-xs">Gửi tin nhắn để bắt đầu cuộc trò chuyện.</p>
              </div>
            )}
            {messages.map(m => {
              const isMe = m.sender_role === 'KHACH_HANG';
              return (
                <div key={m.message_id} className={`flex flex-col gap-0.5 ${isMe?'items-end':'items-start'}`}>
                  {!isMe && <span className="text-white/35 text-[0.7rem] ml-1">{m.sender_name}</span>}
                  <span className={isMe ? BUBBLE_ME : BUBBLE_STAFF}>{m.content}</span>
                  <span className={`text-[0.65rem] text-white/25 ${isMe?'mr-1':'ml-1'}`}>{fmtTime(m.sent_at)}</span>
                </div>
              );
            })}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          <form onSubmit={send} className="flex gap-2 mt-3 pt-3 border-t border-white/[0.08]">
            <input
              className="flex-1 h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input"
              placeholder="Nhập tin nhắn..."
              value={input} onChange={e => setInput(e.target.value)}
              maxLength={5000} disabled={sending || conv?.status === 'Closed'}
            />
            <button type="submit"
              className="grid w-10 h-10 place-items-center bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 rounded-xl text-white shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] transition-all cursor-pointer disabled:opacity-50"
              disabled={sending || !input.trim() || conv?.status === 'Closed'}>
              <Send size={15}/>
            </button>
          </form>
          {conv?.status === 'Closed' && (
            <p className="text-center text-white/30 text-xs mt-2">Cuộc hội thoại đã đóng.</p>
          )}
        </div>
      )}
    </div>
  );
}
