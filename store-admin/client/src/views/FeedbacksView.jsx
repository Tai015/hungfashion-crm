import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

function FeedbackReply({ feedback, onSaved }) {
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/feedbacks/${feedback.feedback_id}/reply`, { method: 'PATCH', body: { reply } });
      onSaved();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  return <form className="feedback-reply-form" onSubmit={submit}>
    <textarea aria-label={`Trả lời phản hồi ${feedback.feedback_id}`} required maxLength={5000} rows={2} value={reply} onChange={e => setReply(e.target.value)} placeholder="Nhập nội dung trả lời..." />
    {error && <small className="form-error">{error}</small>}
    <button className="event-btn" disabled={busy}>{busy ? 'Đang gửi...' : 'Gửi trả lời'}</button>
  </form>;
}

export default function FeedbacksView() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    apiFetch(`/api/feedbacks?${params}`)
      .then(d => { setFeedbacks(d.data || []); setTotal(d.total || 0); })
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [status, search, page, refresh]);

  const STAR = n => '⭐'.repeat(n || 0);

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">CRM</p><h1>Phản hồi khách hàng</h1></div>
      </header>
      <div className="filter-toolbar filter-toolbar-compact">
        <label className="filter-field search-field">
          <span>Tìm phản hồi</span>
          <input className="search-input" type="search" placeholder="Tên khách hàng hoặc nội dung" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <label className="filter-field">
          <span>Trạng thái phản hồi</span>
          <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {['New', 'Processing', 'Resolved', 'Rejected'].map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        {status && <button className="filter-clear" type="button" onClick={() => setStatus('')}>Xóa lọc</button>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="panel">
        <div className="panel-header"><h3>Phản hồi ({total})</h3></div>
        {loading ? <Spinner /> : (
          <table>
            <thead>
              <tr><th>#</th><th>Khách hàng</th><th>Loại</th><th>Sản phẩm</th><th>Đánh giá</th><th>Nội dung</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {feedbacks.length ? feedbacks.map(f => (
                <tr key={f.feedback_id}>
                  <td>{f.feedback_id}</td>
                  <td>{f.customer_name || 'Ẩn danh'}</td>
                  <td>{f.feedback_type}</td>
                  <td>{f.product_name || '—'}</td>
                  <td>{f.rating ? STAR(f.rating) : '—'}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.content}</td>
                  <td>
                    <StatusBadge status={f.status} />
                    {f.reply && <small className="feedback-reply">Đã trả lời: {f.reply}</small>}
                    {f.status !== 'Resolved' && <FeedbackReply feedback={f} onSaved={() => setRefresh(value => value + 1)} />}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>Chưa có phản hồi</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {total > LIMIT && <div className="pagination">
        <button className="event-btn" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>← Trước</button>
        <span>Trang {page} / {Math.ceil(total / LIMIT)}</span>
        <button className="event-btn" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(value => value + 1)}>Sau →</button>
      </div>}
    </>
  );
}
