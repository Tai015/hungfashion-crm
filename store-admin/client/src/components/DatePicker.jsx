import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { vi } from 'react-day-picker/locale';
import 'react-day-picker/style.css';

const parseDate = value => value ? new Date(`${value}T00:00:00`) : undefined;
const toDateValue = date => date
  ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  : '';

export default function DatePicker({ value, onChange, className = '', placeholder = 'Chọn ngày', min, max, ariaLabel, portalPopover = false, portalClassName = '' }) {
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 8, left: 8 });
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const selected = parseDate(value);
  const formatted = selected
    ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(selected)
    : placeholder;

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => {
      if (!rootRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => buttonRef.current?.focus());
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !portalPopover) return undefined;
    const updatePosition = () => {
      const trigger = buttonRef.current?.getBoundingClientRect();
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const margin = 8;
      const width = Math.min(popover.offsetWidth, window.innerWidth - margin * 2);
      const height = popover.offsetHeight;
      const left = Math.max(margin, Math.min(trigger.left, window.innerWidth - width - margin));
      const below = trigger.bottom + 7;
      const top = below + height <= window.innerHeight - margin
        ? below
        : Math.max(margin, trigger.top - height - 7);
      setPopoverPosition({ top, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, portalPopover]);

  const minDate = parseDate(min);
  const maxDate = parseDate(max);
  const disabled = minDate || maxDate
    ? { before: minDate, after: maxDate }
    : undefined;
  const togglePopover = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (portalPopover) {
      const trigger = buttonRef.current?.getBoundingClientRect();
      if (trigger) {
        const margin = 8;
        const width = Math.min(336, window.innerWidth - margin * 2);
        const left = Math.max(margin, Math.min(trigger.left, window.innerWidth - width - margin));
        const below = trigger.bottom + 7;
        const top = below + 360 <= window.innerHeight - margin
          ? below
          : Math.max(margin, trigger.top - 360 - 7);
        setPopoverPosition({ top, left });
      }
    }
    setOpen(true);
  };

  const popover = open && <div ref={popoverRef} className={`app-date-picker-popover${portalPopover ? ' filter-date-popover customer-order-date-popover' : ''}${portalClassName ? ` ${portalClassName}` : ''}`} role="dialog" aria-label={placeholder}
    style={portalPopover ? { position: 'fixed', top: popoverPosition.top, left: popoverPosition.left, zIndex: 10020 } : undefined}>
      <DayPicker
        mode="single"
        locale={vi}
        weekStartsOn={1}
        selected={selected}
        defaultMonth={selected || maxDate || new Date()}
        disabled={disabled}
        onSelect={date => {
          if (!date) return;
          onChange(toDateValue(date));
          setOpen(false);
        }}
      />
    </div>;

  return <div className="app-date-picker" ref={rootRef}>
    <button
      ref={buttonRef}
      type="button"
      className={`app-date-picker-trigger ${className}`}
      aria-label={ariaLabel || placeholder}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={togglePopover}
    >
      <span>{formatted}</span><CalendarDays size={16} aria-hidden="true" />
    </button>
    {portalPopover ? (popover && createPortal(popover, document.body)) : popover}
  </div>;
}
