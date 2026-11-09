export default function Spinner({ portalTheme = false, label = 'Đang tải...' }) {
  if (portalTheme) {
    return (
      <div className="portal-spinner flex flex-col items-center justify-center gap-3 py-20">
        <div className="portal-spinner-ring w-9 h-9 rounded-full" />
        <span className="text-sm">{label}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/70">
      <div className="w-9 h-9 border-2 border-violet-300/20 border-t-violet-400 rounded-full spinner-ring" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
