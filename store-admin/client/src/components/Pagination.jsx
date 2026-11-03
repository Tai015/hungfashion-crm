import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, total, limit = 20, onChange, loading = false }) {
  const pages = Math.max(1, Math.ceil(Number(total || 0) / limit));
  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3 border-t border-white/[0.06] pt-4">
      <button type="button" aria-label="Trang trước" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-white/55 transition hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-30" disabled={page <= 1 || loading} onClick={() => onChange(page - 1)}><ChevronLeft size={15} /></button>
      <span className="text-sm tabular-nums text-white/50">Trang {page} / {pages} · {Number(total || 0).toLocaleString('vi-VN')} mục</span>
      <button type="button" aria-label="Trang sau" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-white/55 transition hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-30" disabled={page >= pages || loading} onClick={() => onChange(page + 1)}><ChevronRight size={15} /></button>
    </div>
  );
}
