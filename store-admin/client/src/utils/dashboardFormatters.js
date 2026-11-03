const VND = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const COMPACT_VND = new Intl.NumberFormat('vi-VN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const formatVnd = value => VND.format(Number(value) || 0);
export const formatCompactVnd = value => `${COMPACT_VND.format(Number(value) || 0)} ₫`;
export const formatCount = value => new Intl.NumberFormat('vi-VN').format(Number(value) || 0);

export function formatRelativeDate(value) {
  if (!value) return '—';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '—';
  const deltaSeconds = (timestamp - Date.now()) / 1000;
  const absoluteSeconds = Math.abs(deltaSeconds);
  if (absoluteSeconds >= 7 * 86400) {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(timestamp);
  }
  const [unit, size] = absoluteSeconds < 60
    ? ['second', 1]
    : absoluteSeconds < 3600
      ? ['minute', 60]
      : absoluteSeconds < 86400
        ? ['hour', 3600]
        : ['day', 86400];
  return new Intl.RelativeTimeFormat('vi-VN', { numeric: 'auto' }).format(Math.round(deltaSeconds / size), unit);
}
