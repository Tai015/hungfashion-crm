import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { apiFetch } from '../api';
import { useSweetAlertMessages } from '../utils/notifications';
import { SkeletonBlock, TableSkeleton } from '../components/Skeleton';
import Pagination from '../components/Pagination';

const LIMIT = 20;

const TYPE_LABELS = {
  OpeningBalance: 'Số dư ban đầu',
  Earned: 'Tích điểm từ đơn hàng',
  Redeemed: 'Đổi điểm lấy ưu đãi',
  RedeemedReturned: 'Hoàn điểm đã sử dụng',
  EarnReversed: 'Điều chỉnh điểm do hoàn/hủy đơn',
};

export default function CustomerLoyaltyView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [hasPlayedEntrance, setHasPlayedEntrance] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  useSweetAlertMessages({ error });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiFetch(`/api/loyalty/me?page=${page}&limit=${LIMIT}`)
      .then(result => { if (active) setData(result); })
      .catch(requestError => { if (active) setError(requestError.message); })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setHasLoadedOnce(true);
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setHasPlayedEntrance(true);
      });
    return () => { active = false; };
  }, [page]);

  if (loading) return <div className="flex flex-col gap-5 text-[#f5f0eb]"><SkeletonBlock className="h-9 w-52" /><SkeletonBlock className="h-32 w-full rounded-2xl" /><section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><SkeletonBlock className="mb-5 h-6 w-44" /><TableSkeleton rows={5} columns={4} /></section></div>;
  if (error || !data) return <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 text-sm text-white/70">Không tải được điểm thưởng. Vui lòng mở lại mục này để thử lại.</div>;

  return (
    <div className={`flex flex-col gap-5 text-[#f5f0eb]${hasLoadedOnce && !hasPlayedEntrance ? ' app-page-enter' : ''}`}
      onAnimationEnd={() => setHasPlayedEntrance(true)}>
      <div>
        <p className="m-0 text-white/45 text-xs font-semibold tracking-[0.08em] uppercase">Ưu đãi thành viên</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Điểm thưởng</h1>
      </div>
      <section className="flex items-center gap-4 rounded-2xl border border-orange-400/20 bg-orange-500/[0.08] p-6">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-orange-500/15 text-orange-300"><Star /></span>
        <div>
          <p className="m-0 text-sm text-white/55">Số dư hiện tại</p>
          <p className="m-0 mt-1 text-2xl font-bold text-orange-300">{Number(data.balance).toLocaleString('vi-VN')} điểm</p>
          <p className="m-0 mt-1 text-sm text-white/55">Tổng điểm đã tích lũy: <strong className="text-white/80">{Number(data.lifetimePoints).toLocaleString('vi-VN')} điểm</strong></p>
          <p className="m-0 mt-1 text-sm text-white/55">Hạng thành viên: <strong className="text-white/80">{data.tier}</strong></p>
          <p className="m-0 mt-1 text-xs text-white/40">Đổi điểm không làm giảm tổng điểm tích lũy hoặc hạng thành viên.</p>
        </div>
      </section>
      <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-5">
        <div>
          <h2 className="m-0 text-lg font-semibold">Lịch sử điểm</h2>
          <p className="m-0 mt-1 text-sm text-white/50">Mỗi 10 điểm đổi được 1.000đ khi thanh toán đơn hàng.</p>
          {Number(data.balance) < 0 && <p className="m-0 mt-2 text-sm text-amber-200">Số dư âm do điểm của đơn hoàn tiền đã được điều chỉnh; đơn mới sẽ bù số điểm này trước.</p>}
        </div>
        {data.history.length ? (
          <div key={page} className="app-page-enter overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase text-white/45"><tr><th className="py-3">Thời gian</th><th>Giao dịch</th><th>Thay đổi</th><th>Số dư</th></tr></thead>
              <tbody>
                {data.history.map(item => (
                  <tr key={item.loyalty_transaction_id} className="border-t border-white/[0.07]">
                    <td className="py-3 text-white/55">{new Date(item.created_at).toLocaleString('vi-VN')}</td>
                    <td><span>{TYPE_LABELS[item.transaction_type] || item.transaction_type}</span>{item.note && <small className="block text-white/40">{item.note}</small>}</td>
                    <td className={item.points_delta > 0 ? 'text-emerald-300' : 'text-white/70'}>{item.points_delta > 0 ? '+' : ''}{item.points_delta}</td>
                    <td className="font-semibold">{item.balance_after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="m-0 py-8 text-center text-sm text-white/50">Bạn chưa có giao dịch điểm nào.</p>}
        <Pagination page={page} total={data.total} limit={LIMIT} loading={loading} onChange={setPage} />
      </section>
    </div>
  );
}
