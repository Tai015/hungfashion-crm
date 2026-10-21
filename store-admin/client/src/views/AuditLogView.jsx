import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';

export default function AuditLogView() {
  const [logs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/api/reports/audit-logs?page=${page}&limit=${limit}`)
      .then(result => {
        if (active) {
          setAuditLogs(result.data);
          setTotal(result.total);
        }
      })
      .catch(err => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page]);

  if (loading && page === 1) return <Spinner />;

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Hệ thống</p>
          <h1>Nhật ký hoạt động (Kafka Streams)</h1>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="panel wide-panel">
        <div className="panel-header">
          <h3>Lịch sử tương tác người dùng</h3>
          <small className="text-slate-400">Dữ liệu thời gian thực được đồng bộ qua Kafka</small>
        </div>

        <div className="overflow-x-auto">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người dùng</th>
                <th>Sự kiện</th>
                <th>Trang</th>
                <th>Chi tiết</th>
                <th>Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.event_id}>
                  <td className="whitespace-nowrap">
                    {new Date(log.occurred_at).toLocaleString('vi-VN')}
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="font-medium">{log.full_name || 'Hệ thống'}</span>
                      <small className="text-slate-500">{log.username || 'N/A'}</small>
                    </div>
                  </td>
                  <td>
                    <span className={`badge-event ${log.event_type}`}>
                      {log.event_type}
                    </span>
                  </td>
                  <td><code>{log.page}</code></td>
                  <td>
                    <small className="text-slate-400">
                      {log.action} {log.section ? `• ${log.section}` : ''}
                    </small>
                  </td>
                  <td>
                    <span className="text-xs uppercase text-slate-500">{log.source}</span>
                  </td>
                </tr>
              ))}
              {!logs.length && !loading && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Chưa có nhật ký hoạt động nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination mt-4">
            <button
              className="event-btn"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              ← Trước
            </button>
            <span>Trang {page} / {totalPages}</span>
            <button
              className="event-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Sau →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
