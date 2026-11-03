import { useEffect, useState } from 'react';
import { authHeaders } from '../api';

export default function FeedbackMedia({ media }) {
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    fetch(media.url, { headers: authHeaders(), signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Không tải được tệp đính kèm.');
        return response.blob();
      })
      .then(blob => {
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [media.url]);

  return (
    <div className="h-28 w-28 overflow-hidden rounded-xl border border-white/10 bg-black/20">
      {objectUrl
        ? media.type === 'video'
          ? <video src={objectUrl} controls preload="metadata" className="h-full w-full object-cover" />
          : <a href={objectUrl} target="_blank" rel="noreferrer" aria-label={media.name || 'Ảnh đính kèm'}>
              <img src={objectUrl} alt={media.name || 'Ảnh đính kèm'} className="h-full w-full object-cover" />
            </a>
        : <span className="grid h-full w-full place-items-center text-xs text-white/40">Đang tải...</span>}
    </div>
  );
}
