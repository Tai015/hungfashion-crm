import { useEffect, useRef, useState } from 'react';
import { CheckCircle, ImagePlus, MessageSquare, Send, X } from 'lucide-react';
import { apiFetch, subscribeToChatEvents } from '../api';
import { useSweetAlertMessages } from '../utils/notifications';
import Spinner from '../components/Spinner';
import FilterPopover from '../components/FilterPopover';
import ChatMedia from '../components/ChatMedia';
import { CHAT_ATTACHMENT_ACCEPT, chatAttachmentError } from '../utils/chatAttachments';

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
  const [selectedImages, setSelectedImages] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [sending, setSending]             = useState(false);
  const [error, setError]                 = useState('');
  useSweetAlertMessages({ error });
  const [statusFilter, setStatusFilter]   = useState('Open');
  const activeConversation = selected
    ? conversations.find(c => c.conversation_id === selected.conversation_id) || selected
    : null;
  const selectedConversationRef = useRef(selected);
  selectedConversationRef.current = selected;
  const bottomRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const selectedIdRef = useRef(null);
  const shouldScrollRef = useRef(false);
  const lastMessageIdRef = useRef(null);
  const imageInputRef = useRef(null);

  const chooseImages = event => {
    const files = [...event.target.files];
    event.target.value = '';
    if (selectedImages.length + files.length > 4) {
      setError('Mỗi tin nhắn gửi tối đa 4 tệp.');
      return;
    }
    const fileError = files.map(chatAttachmentError).find(Boolean);
    if (fileError) {
      setError(fileError);
      return;
    }
    setSelectedImages(current => [...current, ...files]);
  };

  const loadConversations = async (showError = false) => {
    const q = statusFilter ? `?status=${statusFilter}` : '';
    try {
      const data = await apiFetch(`/api/chat/${q}`);
      setConversations(current => {
        const active = selectedConversationRef.current;
        if (!active || data.some(c => c.conversation_id === active.conversation_id)) return data;
        const lastKnown = current.find(c => c.conversation_id === active.conversation_id) || active;
        return [...data, lastKnown];
      });
    } catch (e) {
      if (showError) setError(e.message || 'Không tải được danh sách hội thoại.');
    }
  };

  useEffect(() => {
    setLoading(true);
    loadConversations(true).finally(() => setLoading(false));
    const unsubscribe = subscribeToChatEvents(() => loadConversations());
    return unsubscribe;
  }, [statusFilter]);

  useEffect(() => {
    setSelectedImages([]);
    const conversationId = selected?.conversation_id;
    selectedIdRef.current = conversationId ?? null;
    lastMessageIdRef.current = null;
    shouldScrollRef.current = true;
    setMessages([]);
    setError('');
    if (!conversationId) return undefined;

    let cancelled = false;
    let inFlight = false;
    const loadMessages = async (initial = false) => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const incoming = await apiFetch(`/api/chat/${conversationId}/messages`);
        if (cancelled || selectedIdRef.current !== conversationId) return;
        const container = messagesContainerRef.current;
        const nearBottom = !container || container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        setMessages(current => {
          // Keep messages added optimistically while an older poll was in flight.
          const byId = new Map(current.map(message => [message.message_id, message]));
          incoming.forEach(message => byId.set(message.message_id, message));
          const merged = [...byId.values()].sort((a, b) =>
            new Date(a.sent_at) - new Date(b.sent_at) || a.message_id - b.message_id
          );
          const oldLastId = current.at(-1)?.message_id;
          const newLastId = merged.at(-1)?.message_id;
          if (newLastId !== oldLastId && (initial || nearBottom)) shouldScrollRef.current = true;
          return merged;
        });
      } catch (e) {
        if (!cancelled && initial && selectedIdRef.current === conversationId) {
          setError(e.message || 'Không tải được tin nhắn.');
        }
      } finally {
        inFlight = false;
      }
    };

    loadMessages(true);
    const unsubscribe = subscribeToChatEvents(event => {
      const events = event.type === 'batch' ? event.events : [event];
      if (events.some(item => item.type === 'connected' || Number(item.conversationId) === Number(conversationId))) {
        loadMessages(false);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selected?.conversation_id]);

  useEffect(() => {
    const lastId = messages.at(-1)?.message_id;
    if (lastId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastId;
      if (shouldScrollRef.current) {
        bottomRef.current?.scrollIntoView({ behavior:'smooth', block:'end' });
        shouldScrollRef.current = false;
      }
    }
  }, [messages]);

  const send = async e => {
    e.preventDefault();
    if ((!input.trim() && !selectedImages.length) || !selected) return;
    const conversationId = selected.conversation_id;
    setSending(true); setError('');
    try {
      const body = new FormData();
      body.append('content', input.trim());
      selectedImages.forEach(file => body.append('media', file));
      const msg = await apiFetch(`/api/chat/${conversationId}/messages`, {
        method:'POST', body,
      });
      if (selectedIdRef.current === conversationId) {
        shouldScrollRef.current = true;
        setMessages(prev => prev.some(item => item.message_id === msg.message_id) ? prev : [...prev, msg]);
      }
      setInput('');
      setSelectedImages([]);
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


      <div className="grid grid-cols-[280px_1fr] gap-4" style={{ height:'calc(100vh - 240px)', minHeight:500 }}>
        {/* Danh sách hội thoại */}
        <div className={`${PANEL} gap-2 overflow-hidden`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-semibold text-white/70">Hội thoại</h2>
            <FilterPopover title="Lọc hội thoại" activeCount={statusFilter ? 1 : 0} onClear={() => setStatusFilter('')}>
              <label className="flex flex-col gap-1.5 text-xs text-white/65">Trạng thái<select className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.06] px-2 text-sm text-white outline-none dark-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">Tất cả</option><option value="Open">Đang mở</option><option value="Resolved">Đã giải quyết</option><option value="Closed">Đã đóng</option>
              </select></label>
            </FilterPopover>
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
                    <span className="text-sm font-semibold truncate text-[#f5f0eb]">{c.customer_name || 'Khách hàng'}</span>
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
        {activeConversation ? (
          <div className={`${PANEL} overflow-hidden`} style={{ display:'flex', flexDirection:'column' }}>
            {/* Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-white/[0.08]">
              <div className="grid w-9 h-9 place-items-center rounded-xl bg-white/[0.07] text-white/60 shrink-0">
                <MessageSquare size={16}/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="m-0 text-sm font-semibold">{activeConversation.customer_name || 'Khách hàng'}</p>
                <p className="m-0 text-xs text-white/35">{activeConversation.customer_email} · {activeConversation.customer_phone||'—'}</p>
              </div>
              <div className="flex items-center gap-2">
                {activeConversation.status === 'Open' && (
                  <button className="inline-flex items-center gap-1 h-8 px-3 bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-medium rounded-lg cursor-pointer hover:bg-emerald-500/25 transition-all"
                    onClick={() => updateStatus(activeConversation.conversation_id, 'Resolved')}>
                    <CheckCircle size={12}/> Giải quyết xong
                  </button>
                )}
                {(activeConversation.status === 'Open' || activeConversation.status === 'Resolved') && (
                  <button className="inline-flex items-center gap-1 h-8 px-3 bg-white/[0.06] border border-white/12 text-white/50 text-xs font-medium rounded-lg cursor-pointer hover:bg-white/[0.12] transition-all"
                    onClick={() => updateStatus(activeConversation.conversation_id, 'Closed')}>
                    <X size={12}/> Đóng
                  </button>
                )}
                {activeConversation.status !== 'Open' && (
                  <button className="inline-flex items-center gap-1 h-8 px-3 bg-sky-500/15 border border-sky-500/25 text-sky-400 text-xs font-medium rounded-lg cursor-pointer hover:bg-sky-500/25 transition-all"
                    onClick={() => updateStatus(activeConversation.conversation_id, 'Open')}>
                    Mở lại
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto flex flex-col gap-2.5 py-3">
              {!messages.length && <p className="text-center text-white/25 text-sm py-8">Chưa có tin nhắn.</p>}
              {messages.map(m => {
                const isStaff = m.sender_role !== 'KHACH_HANG';
                return (
                  <div key={m.message_id} className={`flex flex-col gap-0.5 ${isStaff?'items-end':'items-start'}`}>
                    <span className="text-white/35 text-[0.7rem] mx-1">{m.sender_name || (isStaff ? 'Nhân viên' : activeConversation.customer_name)}</span>
                    <span className={isStaff ? BUBBLE_STAFF : BUBBLE_CUSTOMER}>{m.content}</span>
                    {!!m.attachments?.length && (
                      <div className="mt-1 flex max-w-full flex-wrap gap-2">
                    {m.attachments.map(attachment => <ChatMedia key={attachment.attachment_id} attachment={attachment} />)}
                      </div>
                    )}
                    <span className={`text-[0.65rem] text-white/25 ${isStaff?'mr-1':'ml-1'}`}>{fmtTime(m.sent_at)}</span>
                  </div>
                );
              })}
              <div ref={bottomRef}/>
            </div>

            {/* Input */}
            <form onSubmit={send} className="mt-auto border-t border-white/[0.08] pt-3">
              {!!selectedImages.length && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {selectedImages.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="inline-flex max-w-56 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-white/70">
                      <span className="truncate">{file.name}</span>
                      <button type="button" aria-label={`Bỏ ảnh ${file.name}`} onClick={() => setSelectedImages(current => current.filter((_, itemIndex) => itemIndex !== index))}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded text-white/50 hover:bg-white/10 hover:text-white"><X size={12}/></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
              <input ref={imageInputRef} type="file" accept={CHAT_ATTACHMENT_ACCEPT} multiple hidden onChange={chooseImages} />
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={sending || activeConversation.status === 'Closed' || selectedImages.length >= 4}
              aria-label="Đính kèm ảnh, video hoặc tài liệu" title="Tối đa 4 tệp; ảnh 5 MB, video 25 MB, tài liệu 10 MB"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-white/70 transition hover:bg-white/[0.12] disabled:opacity-40"><ImagePlus size={16}/></button>
              <input
                className="flex-1 h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input"
                placeholder="Nhập tin nhắn trả lời..."
                value={input} onChange={e => setInput(e.target.value)}
                maxLength={5000} disabled={sending || activeConversation.status === 'Closed'}
              />
              <button type="submit"
                className="grid w-10 h-10 place-items-center bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 rounded-xl text-white shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] transition-all cursor-pointer disabled:opacity-50"
                disabled={sending || (!input.trim() && !selectedImages.length) || activeConversation.status === 'Closed'}>
                <Send size={15}/>
              </button>
              </div>
              <p className="m-0 mt-1 text-[0.65rem] text-white/30">Ảnh, video MP4/WebM, PDF, TXT, CSV, DOCX, XLSX · tối đa 4 tệp; ảnh 5 MB, video 25 MB, tài liệu 10 MB</p>
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
