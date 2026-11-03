import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, X } from 'lucide-react';

export default function FilterPopover({ title = 'Bộ lọc', activeCount = 0, onClear, children, portalTheme = false }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(384, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16));
    const desiredHeight = Math.min(window.innerHeight - 32, 544);
    let top = rect.bottom + 8;
    let maxHeight = Math.min(desiredHeight, window.innerHeight - top - 16);
    if (maxHeight < 220 && rect.top > 240) {
      maxHeight = Math.min(desiredHeight, rect.top - 24);
      top = rect.top - maxHeight - 8;
    }
    setPosition({ top, left, width, maxHeight });
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => {
      const isNestedPortal = event.target instanceof Element
        && event.target.closest('.filter-date-popover');
      if (!rootRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target) && !isNestedPortal) setOpen(false);
    };
    const closeEscape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, portalTheme]);

  return (
    <div className="relative" ref={rootRef}>
      <button type="button" aria-label={`Mở ${title.toLowerCase()}`} aria-expanded={open}
        ref={triggerRef}
        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition ${portalTheme ? `portal-filter-trigger${activeCount ? ' is-active' : ''}` : activeCount ? 'border-orange-400/40 bg-orange-500/15 text-orange-300' : 'border-white/10 bg-white/[0.06] text-white/65 hover:bg-white/[0.12] hover:text-white'}`}
        onClick={() => {
          if (!open) updatePosition();
          setOpen(value => !value);
        }}>
        <Filter size={16}/>
        {activeCount > 0 && <span className={`absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-bold text-white ${portalTheme ? 'portal-filter-count' : 'bg-orange-500'}`}>{activeCount}</span>}
      </button>
      {open && position && createPortal(<section ref={popoverRef} style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight, zIndex: 10000 }} className={`filter-popover popup-surface flex flex-col gap-3 overflow-y-auto rounded-2xl p-4 ${portalTheme ? 'portal-filter-popover' : 'border border-white/15 bg-[#211914] text-[#f5f0eb] shadow-[0_20px_55px_rgba(0,0,0,0.55)]'}`}>
        <div className="flex items-center justify-between"><strong className="text-sm">{title}</strong><button type="button" aria-label="Đóng bộ lọc" className={`grid h-7 w-7 place-items-center rounded-lg ${portalTheme ? 'portal-icon-button' : 'text-white/50 hover:bg-white/10 hover:text-white'}`} onClick={() => setOpen(false)}><X size={15}/></button></div>
        {children}
        {onClear && <button type="button" className={`w-full rounded-lg border-t pt-3 text-left text-xs ${portalTheme ? 'portal-filter-clear' : 'border-white/10 text-white/60 hover:text-white'}`} onClick={() => { onClear(); setOpen(false); }}>Xóa bộ lọc</button>}
      </section>, document.body)}
    </div>
  );
}
