import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck, ImagePlus, MessageCircle, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Send, X } from 'lucide-react';
import { apiFetch, subscribeToChatEvents } from '../api';
import Spinner from '../components/Spinner';
import ChatMedia from '../components/ChatMedia';
import RoleAvatar from '../components/RoleAvatar';
import { CHAT_ATTACHMENT_ACCEPT, chatAttachmentError } from '../utils/chatAttachments';
import { useSweetAlertMessages } from '../utils/notifications';

const STATUS_LABEL = { Open: 'Đang mở', Resolved: 'Đã xử lý', Closed: 'Đã đóng' };
const STATUS_STYLE = {
  Open: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  Resolved: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  Closed: 'bg-white/[0.07] text-white/50 border-white/10',
};
const PANEL = 'rounded-2xl border border-white/10 bg-white/[0.055] backdrop-blur-xl';

function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CustomerSupportChatView({ user }) {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [conversationListCollapsed, setConversationListCollapsed] = useState(false);
  const [messages, setMessages] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesViewportRef = useRef(null);
  const mediaInputRef = useRef(null);
  const lastMessageByConversationRef = useRef(new Map());
  const loadedConversationIdRef = useRef(null);
  const shouldScrollOnMessageRef = useRef(false);
  const conversationLoadInFlightRef = useRef(false);
  const conversationLoadPendingRef = useRef(false);
  const messageLoadInFlightRef = useRef(false);
  const messageLoadPendingRef = useRef(false);
  const latestConversationLoaderRef = useRef(null);
  const latestMessageLoaderRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  useSweetAlertMessages({ error });

  const chooseMedia = event => {
    const files = [...event.target.files];
    event.target.value = '';
    if (selectedMedia.length + files.length > 4) {
      setError('Mỗi tin nhắn gửi tối đa 4 tệp.');
      return;
    }
    const fileError = files.map(chatAttachmentError).find(Boolean);
    if (fileError) {
      setError(fileError);
      return;
    }
    setSelectedMedia(current => [...current, ...files]);
    setError('');
  };

  const loadConversations = useCallback(async (quiet = false) => {
    if (conversationLoadInFlightRef.current) {
      conversationLoadPendingRef.current = true;
      return;
    }
    conversationLoadInFlightRef.current = true;
    if (!quiet) setLoading(true);
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const rows = await apiFetch(`/api/chat${query}`);
      setConversations(current => {
        const unchanged = current.length === rows.length && current.every((row, index) => {
          const next = rows[index];
          return row.conversation_id === next.conversation_id
            && row.status === next.status
            && row.updated_at === next.updated_at
            && row.last_message === next.last_message
            && row.unread_count === next.unread_count;
        });
        return unchanged ? current : rows;
      });
      const activeId = selectedIdRef.current;
      const latestSelected = rows.find(row => row.conversation_id === activeId);
      if (latestSelected) setSelectedConversation(latestSelected);
      setSelectedId(current => current ?? (rows[0]?.conversation_id ?? null));
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Không tải được danh sách hội thoại.');
    } finally {
      conversationLoadInFlightRef.current = false;
      if (!quiet) setLoading(false);
      if (conversationLoadPendingRef.current) {
        conversationLoadPendingRef.current = false;
        window.setTimeout(() => latestConversationLoaderRef.current?.(true), 0);
      }
    }
  }, [statusFilter]);
  latestConversationLoaderRef.current = loadConversations;

  useEffect(() => {
    loadConversations();
    const unsubscribe = subscribeToChatEvents(() => loadConversations(true));
    return unsubscribe;
  }, [loadConversations]);

  const selected = conversations.find(row => row.conversation_id === selectedId)
    || (selectedConversation?.conversation_id === selectedId ? selectedConversation : null);
  const visibleConversations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi');
    if (!term) return conversations;
    return conversations.filter(row => [row.customer_name, row.customer_email, row.customer_phone, row.last_message]
      .some(value => String(value || '').toLocaleLowerCase('vi').includes(term)));
  }, [conversations, search]);

  const loadMessages = useCallback(async (quiet = false) => {
    if (!selectedId) { setMessages([]); return; }
    if (messageLoadInFlightRef.current) {
      messageLoadPendingRef.current = true;
      return;
    }
    messageLoadInFlightRef.current = true;
    if (!quiet) setMessagesLoading(true);
    try {
      const conversationId = selectedId;
      const rows = await apiFetch(`/api/chat/${conversationId}/messages`);
      if (selectedIdRef.current !== conversationId) return;
      const latestId = rows.at(-1)?.message_id ?? null;
      const knownMessages = lastMessageByConversationRef.current;
      const sameConversation = loadedConversationIdRef.current === selectedId;
      const unchanged = sameConversation && knownMessages.has(selectedId)
        && String(knownMessages.get(selectedId)) === String(latestId);
      if (sameConversation && !unchanged && knownMessages.has(selectedId)) {
        shouldScrollOnMessageRef.current = true;
      }
      loadedConversationIdRef.current = selectedId;
      knownMessages.set(selectedId, latestId);
      if (!unchanged) setMessages(rows);
      setConversations(current => {
        const row = current.find(item => item.conversation_id === selectedId);
        if (!row || Number(row.unread_count) === 0) return current;
        return current.map(item => item.conversation_id === selectedId ? { ...item, unread_count: 0 } : item);
      });
    } catch (requestError) {
      if (!quiet) setError(requestError.message || 'Không tải được tin nhắn.');
    } finally {
      messageLoadInFlightRef.current = false;
      if (!quiet) setMessagesLoading(false);
      if (messageLoadPendingRef.current) {
        messageLoadPendingRef.current = false;
        window.setTimeout(() => latestMessageLoaderRef.current?.(true), 0);
      }
    }
  }, [selectedId]);
  latestMessageLoaderRef.current = loadMessages;

  useEffect(() => {
    loadMessages();
    if (!selectedId) return undefined;
    const unsubscribe = subscribeToChatEvents(event => {
      const events = event.type === 'batch' ? event.events : [event];
      if (events.some(item => item.type === 'connected' || Number(item.conversationId) === Number(selectedId))) {
        loadMessages(true);
      }
    });
    return unsubscribe;
  }, [loadMessages, selectedId]);

  useEffect(() => {
    if (!shouldScrollOnMessageRef.current) return;
    shouldScrollOnMessageRef.current = false;
    const viewport = messagesViewportRef.current;
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const updateStatus = async status => {
    if (!selected) return;
    try {
      const updated = await apiFetch(`/api/chat/${selected.conversation_id}`, { method: 'PATCH', body: { status } });
      setConversations(rows => rows.map(row => row.conversation_id === selected.conversation_id ? { ...row, ...updated } : row));
      setSelectedConversation(current => current?.conversation_id === updated.conversation_id
        ? { ...current, ...updated }
        : current);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Không cập nhật được trạng thái hội thoại.');
    }
  };

  const sendMessage = async event => {
    event.preventDefault();
    const content = draft.trim();
    if ((!content && !selectedMedia.length) || !selected || sending || selected.status === 'Closed') return;
    setSending(true);
    try {
      const body = new FormData();
      body.append('content', content);
      selectedMedia.forEach(file => body.append('media', file));
      const row = await apiFetch(`/api/chat/${selected.conversation_id}/messages`, { method: 'POST', body });
      setMessages(current => [...current, {
        ...row,
        sender_name: user?.full_name || user?.username || 'Nhân viên CSKH',
        sender_role: user?.role || 'QL_KHACH_HANG',
      }]);
      lastMessageByConversationRef.current.set(selected.conversation_id, row.message_id);
      loadedConversationIdRef.current = selected.conversation_id;
      shouldScrollOnMessageRef.current = true;
      setDraft('');
      setSelectedMedia([]);
      await loadConversations(true);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Không gửi được tin nhắn.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="customer-support-chat flex min-h-0 flex-col gap-5 text-[#f5f0eb]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-widest text-white/40">Chăm sóc khách hàng</p>
          <h1 className="m-0 mt-1 text-2xl font-bold">Trò chuyện với khách hàng</h1>
          <p className="m-0 mt-1 text-sm text-white/45">Tiếp nhận và trả lời tin nhắn từ tài khoản khách hàng.</p>
        </div>
        <button type="button" onClick={() => loadConversations()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm text-white/75 hover:bg-white/10">
          <RefreshCw size={15} /> Làm mới
        </button>
      </header>

      <div className={`grid min-h-[520px] flex-1 grid-cols-1 gap-4 ${conversationListCollapsed ? 'lg:grid-cols-1' : 'lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]'}`}>
        {!conversationListCollapsed && <section className={`${PANEL} ${mobileShowChat ? 'hidden lg:flex' : 'flex'} min-h-[300px] flex-col overflow-hidden`}>
          <div className="border-b border-white/10 p-4">
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={() => setConversationListCollapsed(true)}
                aria-label="Thu gọn danh sách hội thoại" title="Thu gọn danh sách hội thoại"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs text-white/65 transition hover:bg-white/10 hover:text-white">
                <PanelLeftClose size={15} /> Thu gọn
              </button>
            </div>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, email, số điện thoại..." className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] pl-9 pr-3 text-sm text-[#f5f0eb] outline-none placeholder:text-white/35 focus:border-orange-500/60" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Lọc trạng thái hội thoại">
              {[['', 'Tất cả'], ['Open', 'Đang mở'], ['Resolved', 'Đã xử lý'], ['Closed', 'Đã đóng']].map(([value, label]) => (
                <button key={value || 'all'} type="button" onClick={() => setStatusFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs transition ${statusFilter === value ? 'border-orange-500/40 bg-orange-500/15 text-orange-300' : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? <div className="grid min-h-40 place-items-center"><Spinner /></div> : visibleConversations.length ? visibleConversations.map(row => (
              <button key={row.conversation_id} type="button" onClick={() => { setSelectedId(row.conversation_id); setSelectedConversation(row); setSelectedMedia([]); setMobileShowChat(true); }} className={`block w-full border-b border-white/[0.07] p-4 text-left transition hover:bg-white/[0.05] ${selectedId === row.conversation_id ? 'bg-orange-500/[0.10]' : ''}`}>
                <div className="flex items-start gap-3">
                  <RoleAvatar role="KHACH_HANG" name={row.customer_name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm">{row.customer_name || 'Khách hàng'}</strong>
                      <small className="shrink-0 text-[10px] text-white/35">{formatTime(row.updated_at)}</small>
                    </span>
                    <span className="mt-1 block truncate text-xs text-white/40">{row.customer_phone || row.customer_email || 'Chưa có thông tin liên hệ'}</span>
                    <span className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-white/55">{row.last_message || 'Chưa có tin nhắn'}</span>
                      {Number(row.unread_count) > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">{row.unread_count}</span>}
                    </span>
                    <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] ${STATUS_STYLE[row.status] || STATUS_STYLE.Closed}`}>{STATUS_LABEL[row.status] || row.status}</span>
                  </span>
                </div>
              </button>
            )) : <div className="flex min-h-52 flex-col items-center justify-center gap-2 px-5 text-center text-white/40"><MessageCircle size={25} /><p className="m-0 text-sm">{search ? 'Không tìm thấy hội thoại phù hợp.' : 'Chưa có hội thoại nào.'}</p></div>}
          </div>
        </section>}

        <section className={`${PANEL} ${conversationListCollapsed || mobileShowChat ? 'flex' : 'hidden lg:flex'} min-h-[420px] flex-col overflow-hidden`}>
          {selected ? <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-white/60 hover:bg-white/10 lg:hidden" aria-label="Quay lại danh sách" onClick={() => setMobileShowChat(false)}><ArrowLeft size={17} /></button>
                <RoleAvatar role="KHACH_HANG" name={selected.customer_name} />
                <div className="min-w-0">
                  <h2 className="m-0 truncate text-base font-semibold">{selected.customer_name || 'Khách hàng'}</h2>
                  <p className="m-0 truncate text-xs text-white/40">{[selected.customer_phone, selected.customer_email].filter(Boolean).join(' · ') || 'Chưa có thông tin liên hệ'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {conversationListCollapsed && <button type="button" onClick={() => setConversationListCollapsed(false)}
                  aria-label="Mở danh sách hội thoại" title="Mở danh sách hội thoại"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-xs text-white/65 transition hover:bg-white/10 hover:text-white">
                  <PanelLeftOpen size={15} /><span className="hidden sm:inline">Danh sách</span>
                </button>}
                <span className={`hidden rounded-full border px-2.5 py-1 text-xs sm:inline-flex ${STATUS_STYLE[selected.status] || STATUS_STYLE.Closed}`}>{STATUS_LABEL[selected.status] || selected.status}</span>
                {selected.status === 'Open' ? <button type="button" onClick={() => updateStatus('Resolved')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 text-xs text-sky-300 hover:bg-sky-500/20"><CheckCheck size={14} /> Đánh dấu đã xử lý</button> : selected.status === 'Resolved' ? <button type="button" onClick={() => updateStatus('Open')} className="h-9 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 text-xs text-emerald-300">Mở lại</button> : <button type="button" onClick={() => updateStatus('Open')} className="h-9 rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 text-xs text-orange-300">Mở hội thoại</button>}
              </div>
            </div>
            <div ref={messagesViewportRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {messagesLoading ? <div className="grid flex-1 place-items-center"><Spinner /></div> : messages.length ? messages.map(message => {
                const isOwnMessage = Number(message.sender_account_id) === Number(user?.account_id);
                return <div key={message.message_id} className={`chat-message-row flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                  {!isOwnMessage && <RoleAvatar role={message.sender_role} name={message.sender_name} size="sm" />}
                  <div className={`flex max-w-[88%] min-w-0 flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                    <span className="mb-1 px-1 text-[10px] text-white/35">{isOwnMessage ? 'Bạn' : (message.sender_name || 'Người tham gia')} · {formatTime(message.sent_at)}</span>
                    <span className={`max-w-full whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${isOwnMessage ? 'rounded-br-sm bg-orange-500 text-white' : 'rounded-bl-sm border border-white/10 bg-white/[0.08] text-white/85'}`}>{message.content}</span>
                    {!!message.attachments?.length && <div className="mt-1 flex max-w-full flex-wrap gap-2">
                      {message.attachments.map(attachment => <ChatMedia key={attachment.attachment_id} attachment={attachment} />)}
                    </div>}
                  </div>
                </div>;
              }) : <div className="grid flex-1 place-items-center text-sm text-white/35">Chưa có tin nhắn. Khách hàng chưa bắt đầu trò chuyện.</div>}
            </div>
            <form onSubmit={sendMessage} className="border-t border-white/10 p-3">
              {!!selectedMedia.length && <div className="mb-2 flex flex-wrap gap-2">
                {selectedMedia.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex max-w-56 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-white/70">
                  <span className="truncate">{file.name}</span>
                  <button type="button" aria-label={`Bỏ tệp ${file.name}`} onClick={() => setSelectedMedia(current => current.filter((_, itemIndex) => itemIndex !== index))} className="grid h-5 w-5 shrink-0 place-items-center rounded text-white/50 hover:bg-white/10 hover:text-white"><X size={12} /></button>
                </span>)}
              </div>}
              <div className="flex gap-2">
                <input ref={mediaInputRef} type="file" accept={CHAT_ATTACHMENT_ACCEPT} multiple hidden onChange={chooseMedia} />
                <button type="button" onClick={() => mediaInputRef.current?.click()} disabled={sending || selected.status === 'Closed' || selectedMedia.length >= 4} aria-label="Đính kèm ảnh, video hoặc tài liệu" title="Tối đa 4 tệp; ảnh 5 MB, video 25 MB, tài liệu 10 MB" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-white/70 transition hover:bg-white/[0.12] disabled:opacity-40"><ImagePlus size={16} /></button>
                <input value={draft} onChange={event => setDraft(event.target.value)} maxLength={5000} disabled={sending || selected.status === 'Closed'} placeholder={selected.status === 'Closed' ? 'Hãy mở lại hội thoại để trả lời' : 'Nhập nội dung trả lời...'} className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm text-[#f5f0eb] outline-none placeholder:text-white/35 focus:border-orange-500/60 disabled:opacity-50" />
                <button type="submit" disabled={sending || (!draft.trim() && !selectedMedia.length) || selected.status === 'Closed'} aria-label="Gửi tin nhắn" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500 text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-45"><Send size={17} /></button>
              </div>
              <p className="m-0 mt-1 text-[10px] text-white/30">Ảnh, video MP4/WebM, PDF, TXT, CSV, DOCX, XLSX · tối đa 4 tệp; ảnh 5 MB, video 25 MB, tài liệu 10 MB</p>
            </form>
          </> : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-white/40"><MessageCircle size={34} /><h2 className="m-0 text-base font-semibold text-white/65">Chọn một hội thoại</h2><p className="m-0 max-w-sm text-sm">Chọn khách hàng trong danh sách để xem nội dung và trả lời tin nhắn.</p>{conversationListCollapsed && <button type="button" onClick={() => setConversationListCollapsed(false)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-4 text-sm text-white/80 hover:bg-white/10"><PanelLeftOpen size={16} /> Mở danh sách hội thoại</button>}</div>}
        </section>
      </div>
    </div>
  );
}
