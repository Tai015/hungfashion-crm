export default function SectionState({ loading, error, isEmpty, onRetry, children, skeleton = 'chart' }) {
  if (loading) {
    return <div className={`dashboard-state-skeleton skeleton-${skeleton}`} aria-label="Đang tải dữ liệu" aria-busy="true">
      {skeleton === 'metrics'
        ? Array.from({ length: 4 }, (_, index) => <div className="dashboard-glass dashboard-skeleton-card" key={index}><i /><i /><i /></div>)
        : skeleton === 'rows'
          ? Array.from({ length: 4 }, (_, index) => <i className="dashboard-skeleton-row" key={index} />)
          : <><i /><i /><i /></>}
    </div>;
  }
  if (error) {
    return <div className="dashboard-section-state" role="alert">
      <p>{error}</p>
      <button type="button" className="dashboard-retry" onClick={onRetry}>Thử lại</button>
    </div>;
  }
  if (isEmpty) return <div className="dashboard-section-empty">Chưa có dữ liệu</div>;
  return children;
}
