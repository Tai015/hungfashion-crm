export default function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
      <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      <span className="text-sm font-medium">Đang tải...</span>
    </div>
  );
}
