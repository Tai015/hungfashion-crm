import Swal from 'sweetalert2';

export function confirmDestructiveAction({ title, text, confirmText = 'Xác nhận' }) {
  return Swal.fire({
    icon: 'warning',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Hủy',
    reverseButtons: true,
    focusCancel: true,
    confirmButtonColor: '#dc2626',
  }).then(result => result.isConfirmed);
}
