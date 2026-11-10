export const ORDER_STATUS_LABELS = {
  Pending: 'Chờ xác nhận',
  Confirmed: 'Đã xác nhận',
  Processing: 'Đang xử lý',
  Shipped: 'Đang giao hàng',
  Delivered: 'Đã giao hàng',
  Cancelled: 'Đã hủy',
  Refunded: 'Đã hoàn tiền',
};

export const PAYMENT_STATUS_LABELS = {
  Pending: 'Chờ thanh toán',
  Paid: 'Đã thanh toán',
  Failed: 'Thanh toán chưa hoàn tất',
  Refunded: 'Đã hoàn tiền',
};

export const ACCOUNT_STATUS_LABELS = {
  Active: 'Đang hoạt động',
  Blocked: 'Đã khóa',
  Pending: 'Chờ duyệt',
};

export const ORDER_CHANNEL_LABELS = {
  Online: 'Trực tuyến',
  Website: 'Trang web',
  InStore: 'Tại cửa hàng',
};

export const EMPLOYEE_STATUS_LABELS = {
  Active: 'Đang làm việc',
  Inactive: 'Đã nghỉ việc',
  Terminated: 'Đã nghỉ việc',
  'Đang làm việc': 'Đang làm việc',
  'Ngừng hoạt động': 'Đã nghỉ việc',
  'Đã nghỉ việc': 'Đã nghỉ việc',
};

export const FEEDBACK_STATUS_LABELS = {
  New: 'Mới tiếp nhận',
  Processing: 'Đang xử lý',
  Pending: 'Chờ xử lý',
  Resolved: 'Đã giải quyết',
  Rejected: 'Đã từ chối',
};

export const FEEDBACK_TYPE_LABELS = {
  Product: 'Sản phẩm',
  Service: 'Dịch vụ',
  Suggestion: 'Góp ý',
};

export const RECEIPT_TYPE_LABELS = {
  Import: 'Nhập kho',
  Export: 'Xuất kho',
  Adjustment: 'Điều chỉnh tồn kho',
};


export const CUSTOMER_TIER_LABELS = {
  New: 'Mới',
  Regular: 'Thân thiết',
  Silver: 'Bạc',
  Gold: 'Vàng',
  VIP: 'VIP',
};

export const CUSTOMER_GENDER_LABELS = {
  Female: 'Nữ',
  Male: 'Nam',
  Other: 'Khác',
};

export const CUSTOMER_SPENDING_SEGMENT_LABELS = {
  'VIP (≥5M)': 'VIP (từ 5 triệu đồng)',
  'Gold (2M–5M)': 'Vàng (từ 2 đến dưới 5 triệu đồng)',
  'Silver (500K–2M)': 'Bạc (từ 500 nghìn đến dưới 2 triệu đồng)',
  'No purchases (0)': 'Chưa mua hàng (0 đồng)',
  'Under 500K': 'Dưới 500 nghìn đồng',
};
