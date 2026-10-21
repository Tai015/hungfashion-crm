const TIER_STYLES = {
  VIP:     'bg-amber-500/10 text-amber-500 border-amber-500/30',
  Gold:    'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  Silver:  'bg-slate-400/10 text-slate-300 border-slate-400/30',
  Regular: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  New:     'bg-slate-500/10 text-slate-400 border-slate-500/30',
};

export default function TierBadge({ tier }) {
  const style = TIER_STYLES[tier] || 'bg-slate-500/10 text-slate-400 border-slate-500/30';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style}`}>
      {tier}
    </span>
  );
}
