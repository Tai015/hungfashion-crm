export default function NavItem({ label, active, onClick }) {
  return (
    <button
      type="button"
      className={`w-full text-left px-3.5 py-2.5 mb-1.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
        active
          ? 'bg-indigo-600/20 text-indigo-400 font-semibold shadow-sm'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
