import { useEffect } from 'react';

let alertQueue = Promise.resolve();

function showAlert(icon, title, message, options = {}) {
  const text = String(message || '').trim();
  if (!text) return Promise.resolve({ isDismissed: true });

  const displayAlert = async () => {
    const { default: Swal } = await import('sweetalert2');
    return Swal.fire({
      icon,
      title,
      text,
      confirmButtonText: 'Đã hiểu',
      ...options,
    });
  };

  // SweetAlert2 chỉ có một popup tại một thời điểm. Xếp hàng để các lỗi
  // đồng thời không ghi đè hoặc làm mất thông báo đang hiển thị.
  const pendingAlert = alertQueue.then(displayAlert, displayAlert);
  alertQueue = pendingAlert.then(() => undefined, () => undefined);
  return pendingAlert;
}

export const showErrorAlert = (message, options = {}) => showAlert(
  'error',
  'Đã xảy ra lỗi',
  message,
  { allowOutsideClick: true, ...options },
);

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
