import { useEffect } from 'react';
const recentAlerts = new Map();
const ALERT_COOLDOWN_MS = 8000;

async function showAlert(icon, title, message, options = {}) {
  const text = String(message || '').trim();
  if (!text) return Promise.resolve({ isDismissed: true });

  const key = `${icon}:${text}`;
  const lastShownAt = recentAlerts.get(key) || 0;
  if (Date.now() - lastShownAt < ALERT_COOLDOWN_MS) return Promise.resolve({ isDismissed: true });
  recentAlerts.set(key, Date.now());

  const { default: Swal } = await import('sweetalert2');
  return Swal.fire({
    icon,
    title,
    text,
    confirmButtonText: 'Đã hiểu',
    ...options,
  });
}

export const showErrorAlert = message => showAlert('error', 'Đã xảy ra lỗi', message);
export const showSuccessAlert = message => showAlert('success', 'Thành công', message, {
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2400,
  timerProgressBar: true,
});
export const showWarningAlert = message => showAlert('warning', 'Lưu ý', message);
export const showInfoAlert = message => showAlert('info', 'Thông báo', message, {
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2400,
  timerProgressBar: true,
});

export function useSweetAlertMessages({ error, success, info, warning } = {}) {
  useEffect(() => { if (error) showErrorAlert(error); }, [error]);
  useEffect(() => { if (success) showSuccessAlert(success); }, [success]);
  useEffect(() => { if (info) showInfoAlert(info); }, [info]);
  useEffect(() => { if (warning) showWarningAlert(warning); }, [warning]);
}
