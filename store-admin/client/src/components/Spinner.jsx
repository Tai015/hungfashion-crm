export default function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/70">
      <div className="w-9 h-9 border-2 border-white/20 border-t-cyan-400 rounded-full spinner-ring" />
      <span className="text-sm">Đang tải...</span>
    </div>
  );
}
