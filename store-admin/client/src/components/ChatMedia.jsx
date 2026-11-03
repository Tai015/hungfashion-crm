import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { authHeaders } from '../api';

export default function ChatMedia({ attachment }) {
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    fetch(attachment.url, { headers: authHeaders(), signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Không tải được tệp đính kèm.');
        return response.blob();
      })
      .then(blob => {
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(error => {
        if (error.name !== 'AbortError') setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.url]);

  if (failed) return <span className="text-xs text-white/40">Không tải được tệp đính kèm.</span>;
  if (!source) return <span className="text-xs text-white/35">Đang tải tệp…</span>;

  if (attachment.mime_type?.startsWith('video/')) {
    return <video src={source} controls preload="metadata" className="max-h-80 max-w-full rounded-xl" />;
  }
  if (attachment.mime_type?.startsWith('image/')) return (
    <a href={source} target="_blank" rel="noreferrer" className="block max-w-full overflow-hidden rounded-xl">
      <img src={source} alt={attachment.name || 'Ảnh trong tin nhắn'} loading="lazy"
        className="max-h-72 max-w-full rounded-xl object-contain" />
    </a>
  );
  return <a href={source} download={attachment.name || 'tep-chat'} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/75 hover:bg-white/10">
    <FileText size={16} className="shrink-0 text-orange-300" />
    <span className="truncate">{attachment.name || 'Tải tệp đính kèm'}</span>
    <span className="shrink-0 text-xs text-orange-300">Tải xuống</span>
  </a>;
}
