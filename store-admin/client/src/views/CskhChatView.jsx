import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { apiFetch, subscribeToChatEvents } from '../api';
import Spinner from '../components/Spinner';
import { useSweetAlertMessages } from '../utils/notifications';
import ChatMedia from '../components/ChatMedia';
import RoleAvatar from '../components/RoleAvatar';
import { CHAT_ATTACHMENT_ACCEPT, chatAttachmentError } from '../utils/chatAttachments';

const BUBBLE_ME    = 'self-end min-w-14 max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-orange-500 text-white text-sm leading-relaxed';
const BUBBLE_STAFF = 'self-start max-w-[75%] px-4 py-2.5 rounded-2xl rounded-bl-sm bg-white/[0.09] border border-white/10 text-white/80 text-sm leading-relaxed';

const fmtTime = v => new Date(v).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });

export default function CskhChatView({ user }) {
  const [conv, setConv]         = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError]       = useState('');
  useSweetAlertMessages({ error });
  const [sending, setSending]   = useState(false);
  const messagesViewportRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const lastFetchedMessageIdRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const messageRequestInFlightRef = useRef(false);
  const hasLoadedMessagesRef = useRef(false);
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

  const loadMessages = async () => {
    if (messageRequestInFlightRef.current) return;
    messageRequestInFlightRef.current = true;
    try {
      const msgs = await apiFetch('/api/chat/my-conversation/messages');
      const latestId = msgs.at(-1)?.message_id ?? null;
      const unchanged = msgs.length === lastMessageCountRef.current
        && String(latestId) === String(lastFetchedMessageIdRef.current);
      if (unchanged) return;
      setMessages(msgs);
      lastMessageCountRef.current = msgs.length;
      lastFetchedMessageIdRef.current = latestId;
    } catch { /* silent poll */ }
    finally { messageRequestInFlightRef.current = false; }
  };

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/chat/my-conversation')
      .then(c => { setConv(c); return apiFetch('/api/chat/my-conversation/messages'); })
      .then(msgs => {
        setMessages(msgs);
        lastMessageCountRef.current = msgs.length;
        lastFetchedMessageIdRef.current = msgs.at(-1)?.message_id ?? null;
        lastMessageIdRef.current = msgs.at(-1)?.message_id ?? null;
      })
      .catch(e => setError(e.message))
      .finally(() => { setLoading(false); setHasLoadedOnce(true); });

    const unsubscribe = subscribeToChatEvents(event => {
      loadMessages();
      const events = event.type === 'batch' ? event.events : [event];
      if (events.some(item => item.type === 'status' || item.type === 'connected')) {
        apiFetch('/api/chat/my-conversation').then(setConv).catch(() => {});
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loading) return;
    const latestId = messages.at(-1)?.message_id ?? null;
    if (hasLoadedMessagesRef.current && latestId !== null
      && String(latestId) !== String(lastMessageIdRef.current)) {
      const viewport = messagesViewportRef.current;
      viewport?.scrollTo({ top: viewport.scrollHeight, behavior: 'auto' });
    }
    lastMessageIdRef.current = latestId;
    hasLoadedMessagesRef.current = true;
  }, [messages, loading]);

  const send = async e => {
    e.preventDefault();
    if (!input.trim() && !selectedImages.length) return;
    setSending(true); setError('');
    try {
      const body = new FormData();
      body.append('content', input.trim());
      selectedImages.forEach(file => body.append('media', file));
      const msg = await apiFetch('/api/chat/my-conversation/messages', {
        method:'POST', body,
      });
      setMessages(prev => prev.some(item => item.message_id === msg.message_id) ? prev : [...prev, {
        ...msg,
        sender_role: 'KHACH_HANG',
        sender_name: user?.full_name || user?.username || 'Bạn',
      }]);
      lastMessageCountRef.current = Math.max(lastMessageCountRef.current + 1, messages.length + 1);
      lastFetchedMessageIdRef.current = msg.message_id;
      setInput('');
      setSelectedImages([]);
    } catch(e) { setError(e.message); }
    finally { setSending(false); }
  };

  const STATUS_COLOR = { Open:'text-emerald-400', Resolved:'text-sky-400', Closed:'text-slate-400' };
  const STATUS_LABEL = { Open:'Đang mở', Resolved:'Đã giải quyết', Closed:'Đã đóng' };

  return (
    <div className={`customer-chat-view flex min-h-0 flex-col gap-5 text-[#f5f0eb] h-full${hasLoadedOnce ? ' app-page-enter' : ''}`}>
      <div>
        <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Hỗ trợ</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Trò chuyện hỗ trợ trực tuyến</h1>
      </div>

      {loading ? <Spinner /> : (
        <div className="customer-chat-panel flex flex-col flex-1 min-h-0 p-5 bg-white/[0.06] border border-white/10 rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.22)] backdrop-blur-xl"
          style={{ height: 'calc(100vh - 260px)', minHeight: 420 }}>

          {/* Header cuộc hội thoại */}
          {conv && (
            <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/[0.08]">
              <RoleAvatar name={conv.assigned_to_name || 'Hung Fashion CSKH'} size="sm" />
              <div>
                <p className="m-0 text-sm font-semibold">{conv.assigned_to_name || 'Hung Fashion CSKH'}</p>
                <p className={`m-0 text-xs ${STATUS_COLOR[conv.status]||'text-white/40'}`}>{STATUS_LABEL[conv.status]||conv.status}</p>
              </div>
              <p className="ml-auto text-white/25 text-xs">Trả lời trong giờ hành chính</p>
            </div>
          )}

          {/* Tin nhắn */}
          <div ref={messagesViewportRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain flex flex-col gap-4 pr-1 [scrollbar-gutter:stable]">
            {!messages.length && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-white/30">
                <p className="text-sm">Xin chào! Chúng tôi có thể giúp gì cho bạn?</p>
                <p className="text-xs">Gửi tin nhắn để bắt đầu cuộc trò chuyện.</p>
              </div>
            )}
            {messages.map(m => {
              const isMe = m.sender_role === 'KHACH_HANG';
              return (
                <div key={m.message_id} className={`chat-message-row flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {!isMe && <RoleAvatar role={m.sender_role} name={m.sender_name} size="sm" />}
                  <div className={`flex max-w-[88%] min-w-0 flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                    {!isMe && <span className="ml-1 text-white/35 text-[0.7rem]">{m.sender_name}</span>}
                    <span className={isMe ? BUBBLE_ME : BUBBLE_STAFF}>{m.content}</span>
                    {!!m.attachments?.length && (
                      <div className="mt-1 flex max-w-full flex-wrap gap-2">
                        {m.attachments.map(attachment => <ChatMedia key={attachment.attachment_id} attachment={attachment} />)}
                      </div>
                    )}
                    <span className={`text-[0.65rem] text-white/25 ${isMe ? 'mr-1' : 'ml-1'}`}>{fmtTime(m.sent_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input */}
          <form onSubmit={send} className="mt-3 border-t border-white/[0.08] pt-3">
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
            <button type="button" onClick={() => imageInputRef.current?.click()} disabled={sending || conv?.status === 'Closed' || selectedImages.length >= 4}
              aria-label="Đính kèm ảnh, video hoặc tài liệu" title="Tối đa 4 tệp; ảnh 5 MB, video 25 MB, tài liệu 10 MB"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-white/70 transition hover:bg-white/[0.12] disabled:opacity-40"><ImagePlus size={16}/></button>
            <input
              className="flex-1 h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input"
              placeholder="Nhập tin nhắn..."
              value={input} onChange={e => setInput(e.target.value)}
              maxLength={5000} disabled={sending || conv?.status === 'Closed'}
            />
            <button type="submit"
              className="grid w-10 h-10 place-items-center bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 rounded-xl text-white shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] transition-all cursor-pointer disabled:opacity-50"
              disabled={sending || (!input.trim() && !selectedImages.length) || conv?.status === 'Closed'}>
              <Send size={15}/>
            </button>
            </div>
            <p className="m-0 mt-1 text-[0.65rem] text-white/30">Ảnh, video MP4/WebM, PDF, TXT, CSV, DOCX, XLSX · tối đa 4 tệp; ảnh 5 MB, video 25 MB, tài liệu 10 MB</p>
          </form>
          {conv?.status === 'Closed' && (
            <p className="text-center text-white/30 text-xs mt-2">Cuộc hội thoại đã đóng.</p>
          )}
        </div>
      )}
    </div>
  );
}
