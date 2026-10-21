import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { fmtVND } from '../utils/formatters';
import { generateInvoicePDF } from '../utils/pdfGenerator';

const ROLE_LABELS = {
  ADMIN: 'Quản trị hệ thống',
  QL_NHAN_SU: 'Quản lý nhân sự',
  QL_KHO: 'Quản lý kho',
  QL_BAN_HANG: 'Quản lý bán hàng',
  QL_KHACH_HANG: 'Quản lý khách hàng',
  KHACH_HANG: 'Khách hàng',
};

const OPERATION_CONFIG = {
  employees: { title: 'Danh sách nhân viên', endpoint: '/api/employees', fields: [['employee_id', 'Mã'], ['full_name', 'Họ tên'], ['position', 'Chức vụ'], ['email', 'Email'], ['phone', 'Điện thoại'], ['is_active', 'Trạng thái']] },
  inventory: { title: 'Theo dõi tồn kho', endpoint: '/api/inventory', fields: [['sku', 'SKU'], ['product_name', 'Sản phẩm'], ['category_name', 'Danh mục'], ['size_name', 'Size'], ['color_name', 'Màu'], ['quantity', 'Tồn kho']] },
  receipts: { title: 'Phiếu nhập và xuất kho', endpoint: '/api/inventory/receipts', fields: [['receipt_id', 'Mã phiếu'], ['receipt_type', 'Loại phiếu'], ['supplier_name', 'Nhà cung cấp'], ['employee_name', 'Nhân viên'], ['total_amount', 'Tổng tiền'], ['receipt_date', 'Ngày tạo']] },
  orders: { title: 'Quản lý đơn hàng', endpoint: '/api/orders?limit=100', fields: [['order_id', 'Mã đơn'], ['customer_name', 'Khách hàng'], ['order_channel', 'Kênh bán'], ['total_amount', 'Tổng tiền'], ['order_status', 'Trạng thái'], ['ordered_at', 'Ngày tạo']] },
  promotions: { title: 'Chương trình khuyến mãi', endpoint: '/api/promotions?limit=100', fields: [['code', 'Mã'], ['name', 'Tên chương trình'], ['promo_type', 'Loại'], ['value', 'Giá trị'], ['start_date', 'Bắt đầu'], ['end_date', 'Kết thúc']] },
};

export default function OperationsView({ type }) {
  const config = OPERATION_CONFIG[type];
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => {
    setLoading(true);
    setError('');
    let url = config.endpoint;
    if (type === 'employees') url += `?limit=100&search=${encodeURIComponent(search)}`;
    if (type === 'inventory') url += `?search=${encodeURIComponent(search)}${lowStock ? '&low_stock=true' : ''}`;
    apiFetch(url)
      .then(result => setRows(Array.isArray(result) ? result : result.data || []))
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [search, lowStock, type]);
  const updateOrderStatus = async (row, status) => {
    setError('');
    try {
      await apiFetch(`/api/orders/${row.order_id}/status`, { method: 'PATCH', body: { status } });
      load();
    } catch (requestError) { setError(requestError.message); }
  };
  const display = (key, value) => {
    if (value == null || value === '') return '—';
    if (key === 'total_amount' || key === 'selling_price') return fmtVND(value);
    if (key.endsWith('_at') || key.endsWith('_date')) return new Date(value).toLocaleDateString('vi-VN');
    if (key === 'is_active') return value ? 'Đang làm việc' : 'Ngừng hoạt động';
    if (key === 'quantity' && type === 'inventory') return <strong className={Number(value) <= 5 ? 'stock-low' : ''}>{value}</strong>;
    if (key === 'order_status') return <StatusBadge status={value} />;
    return String(value);
  };
  const orderStatuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'];
  const printInvoice = async row => {
    setError('');
    try {
      const order = await apiFetch(`/api/orders/${row.order_id}`);
      generateInvoicePDF(order);
    } catch (requestError) { setError(requestError.message); }
  };
  return (
    <>
      <header className="topbar"><div><p className="eyebrow">{ROLE_LABELS[type === 'employees' ? 'QL_NHAN_SU' : type === 'inventory' || type === 'receipts' ? 'QL_KHO' : 'QL_BAN_HANG']}</p><h1>{config.title}</h1></div></header>
      {(type === 'employees' || type === 'inventory') && <div className="filter-toolbar">
        <label className="filter-field search-field">Tìm kiếm<input className="search-input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nhập từ khóa..." /></label>
        {type === 'inventory' && <label className="checkbox-filter"><input type="checkbox" checked={lowStock} onChange={e => setLowStock(e.target.checked)} /> Chỉ hiện tồn kho thấp (≤ 5)</label>}
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="panel table-scroll">
        {loading ? <Spinner /> : <table><thead><tr>{config.fields.map(([, label]) => <th key={label}>{label}</th>)}{type === 'orders' && <th>Cập nhật</th>}{type === 'orders' && <th>Hóa đơn</th>}</tr></thead>
          <tbody>{rows.map(row => <tr key={row[config.fields[0][0]]}>{config.fields.map(([key]) => <td key={key}>{display(key, row[key])}</td>)}
            {type === 'orders' && <td><select className="filter-select role-select" value={row.order_status} aria-label={`Trạng thái đơn ${row.order_id}`} onChange={e => updateOrderStatus(row, e.target.value)}>{orderStatuses.map(status => <option key={status}>{status}</option>)}</select></td>}
            {type === 'orders' && <td><button className="event-btn" onClick={() => printInvoice(row)}>In PDF</button></td>}
          </tr>)}
          {!rows.length && <tr><td colSpan={config.fields.length + (type === 'orders' ? 2 : 0)} className="empty-state">Chưa có dữ liệu.</td></tr>}</tbody>
        </table>}
      </div>
    </>
  );
}
