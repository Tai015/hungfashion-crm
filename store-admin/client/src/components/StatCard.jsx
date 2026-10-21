export default function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`p-5 rounded-2xl border transition-all ${
      accent
        ? 'bg-gradient-to-br from-indigo-950/60 to-slate-900 border-indigo-500/30 shadow-lg shadow-indigo-950/30'
        : 'bg-slate-900/60 border-slate-800'
    }`}>
      <span className="block text-xs uppercase font-medium tracking-wider text-slate-400 mb-1">{label}</span>
      <strong className="block text-2xl font-bold text-white tracking-tight">{value}</strong>
      {sub && <small className="block text-xs text-slate-400 mt-1">{sub}</small>}
    </div>
  );
}
