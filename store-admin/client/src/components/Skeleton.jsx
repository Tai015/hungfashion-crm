export function SkeletonBlock({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-white/[0.09] ${className}`} />;
}

export function TableSkeleton({ rows = 5, columns = 5 }) {
  return (
    <div aria-label="Đang tải dữ liệu" className="flex flex-col gap-3 py-3">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, column) => (
            <SkeletonBlock key={column} className={`h-4 ${column === 0 ? 'w-4/5' : 'w-full'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 3 }) {
  return (
    <div aria-label="Đang tải nội dung" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <SkeletonBlock className="h-4 w-1/3" />
          <SkeletonBlock className="h-6 w-2/3" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-4/5" />
          <SkeletonBlock className="mt-2 h-9 w-32" />
        </div>
      ))}
    </div>
  );
}
