import { ACCOUNT_STATUS_LABELS, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../utils/viLabels';

const STATUS_STYLES = {
  Pending:    'bg-amber-500/10 text-amber-500 border-amber-500/20',
  Confirmed:  'bg-blue-500/10 text-blue-500 border-blue-500/20',
  Processing: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  Shipped:    'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  Delivered:  'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  Cancelled:  'bg-red-500/10 text-red-500 border-red-500/20',
  Refunded:   'bg-slate-500/10 text-slate-500 border-slate-500/20',
  Paid:       'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
};

export default function StatusBadge({ status, label }) {
  const style = STATUS_STYLES[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  const translatedLabel = label || ORDER_STATUS_LABELS[status] || PAYMENT_STATUS_LABELS[status] || ACCOUNT_STATUS_LABELS[status] || status;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style}`}>
      {translatedLabel}
    </span>
  );
}
