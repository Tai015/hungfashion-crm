import SectionState from './SectionState';
import { formatRelativeDate, formatVnd } from '../../utils/dashboardFormatters';
import GlassCard from './GlassCard';

const ORDER_STATUS = {
  Pending: ['Chờ xác nhận', 'processing'], Confirmed: ['Đã xác nhận', 'completed'],
  Processing: ['Đang xử lý', 'processing'], Shipped: ['Đang giao', 'processing'],
  Delivered: ['Đã giao', 'completed'], Cancelled: ['Đã hủy', 'failed'], Refunded: ['Đã hoàn tiền', 'failed'],
};
const FEEDBACK_STATUS = { New: ['Mới tiếp nhận', 'processing'], Processing: ['Đang xử lý', 'processing'], Resolved: ['Đã giải quyết', 'completed'], Rejected: ['Đã từ chối', 'failed'] };
const FEEDBACK_TYPE = { Product: 'Sản phẩm', Service: 'Dịch vụ', Staff: 'Nhân viên', Complaint: 'Khiếu nại', Suggestion: 'Góp ý' };

function initials(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase() || '—';
}

function statusInfo(status, type) {
  const result = (type === 'orders' ? ORDER_STATUS : FEEDBACK_STATUS)[status];
  return result || [status || '—', 'processing'];
}

export default function ActivityTable({ type, rows = [], status, onRetry }) {
  const isOrders = type === 'orders';
  return <GlassCard className="dashboard-activity">
    <div className="dashboard-section-heading"><div><p className="dashboard-eyebrow">CẬP NHẬT MỚI NHẤT</p><h2>{isOrders ? 'Đơn hàng gần đây' : 'Phản hồi gần đây'}</h2></div></div>
    <SectionState loading={status.loading} error={status.error} isEmpty={!status.loading && !status.error && !rows.length} onRetry={onRetry} skeleton="rows">
      <div className="dashboard-table-wrap"><table><thead><tr>
        <th>Khách hàng</th><th>{isOrders ? 'Kênh bán' : 'Loại phản hồi'}</th><th>{isOrders ? 'Mã đơn' : 'Sản phẩm'}</th>
        <th>{isOrders ? 'Tổng tiền' : 'Đánh giá'}</th><th>Trạng thái</th><th>{isOrders ? 'Ngày tạo' : 'Ngày gửi'}</th>
      </tr></thead><tbody>{rows.map((row, index) => {
        const name = row.customer_name || '—';
        const id = isOrders ? row.order_id : row.feedback_id;
        const rowStatus = statusInfo(isOrders ? row.order_status : row.status, type);
        const details = isOrders ? row.order_channel : row.feedback_type ? FEEDBACK_TYPE[row.feedback_type] || row.feedback_type : '—';
        const subject = isOrders ? `#${id}` : row.product_name || 'Phản hồi chung';
        const value = isOrders ? (row.total_amount == null ? '—' : formatVnd(row.total_amount)) : (row.rating == null ? '—' : `${row.rating}/5`);
        const occurredAt = isOrders ? row.ordered_at : row.created_at;
        return <tr key={id ?? `${name}-${index}`}>
          <td><span className={`dashboard-table-avatar avatar-${['purple', 'blue', 'pink', 'mint'][index % 4]}`}>{initials(name)}</span><strong className="dashboard-customer-name">{name}</strong></td>
          <td>{details || '—'}</td><td className="dashboard-order-id">{subject}</td><td className="dashboard-amount">{value}</td>
          <td><span className={`dashboard-status status-${rowStatus[1]}`}><i />{rowStatus[0]}</span></td><td className="dashboard-time">{formatRelativeDate(occurredAt)}</td>
        </tr>;
      })}</tbody></table></div>
      <div className="dashboard-activity-cards">{rows.map((row, index) => {
        const name = row.customer_name || '—';
        const id = isOrders ? row.order_id : row.feedback_id;
        const rowStatus = statusInfo(isOrders ? row.order_status : row.status, type);
        const title = isOrders ? (row.order_channel || 'Đơn hàng') : FEEDBACK_TYPE[row.feedback_type] || row.feedback_type || 'Phản hồi';
        const detail = isOrders ? (row.total_amount == null ? '—' : formatVnd(row.total_amount)) : row.product_name || (row.rating == null ? '—' : `${row.rating}/5`);
        return <article key={id ?? `${name}-${index}`} className="dashboard-activity-mobile">
          <div className="dashboard-mobile-row"><span className={`dashboard-table-avatar avatar-${['purple', 'blue', 'pink', 'mint'][index % 4]}`}>{initials(name)}</span><div><strong>{name}</strong><small>{isOrders ? `Đơn #${id}` : `Phản hồi #${id}`} · {formatRelativeDate(isOrders ? row.ordered_at : row.created_at)}</small></div><b>{detail}</b></div>
          <div className="dashboard-mobile-row"><span>{title}</span><span className={`dashboard-status status-${rowStatus[1]}`}><i />{rowStatus[0]}</span></div>
        </article>;
      })}</div>
    </SectionState>
  </GlassCard>;
}
