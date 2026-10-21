// Helper format tiền VND
export function fmtVND(value) {
  return Number(value || 0).toLocaleString('vi-VN') + 'đ';
}
