import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { CardGridSkeleton } from '../components/Skeleton';
import Pagination from '../components/Pagination';
import { showErrorAlert } from '../utils/notifications';

const PANEL = 'flex flex-col gap-3 p-5 bg-white/[0.06] border border-white/10 rounded-2xl text-[#f5f0eb]';
const fmt = value => Number(value || 0).toLocaleString('vi-VN') + ' ₫';

export default function CustomerVouchersView() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [code, setCode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/api/promotions/mine?page=${page}&limit=20&paged=true`)
      .then(result => { if (active) { setVouchers(result.data || []); setTotal(result.total || 0); } })
      .catch(error => { if (active) showErrorAlert(error.message); })
      .finally(() => { if (active) { setLoading(false); setHasLoadedOnce(true); } });
    return () => { active = false; };
  }, [page, refresh]);
  const claimCode = async event => {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode || claiming) return;
    setClaiming(true);
    setNotice('');
    try {
      const result = await apiFetch('/api/promotions/claim', { method: 'POST', body: { code: normalizedCode } });
      setCode('');
      setNotice(result.message || 'Đã thêm mã vào ví ưu đãi.');
      setPage(1);
      setRefresh(value => value + 1);
    } catch (error) {
      showErrorAlert(error.message);
    } finally {
      setClaiming(false);
    }
  };
  const available = vouchers.filter(voucher => voucher.status === 'Available' && voucher.end_date >= new Date().toISOString().slice(0, 10));
  return <div className={`flex flex-col gap-5 text-[#f5f0eb]${hasLoadedOnce ? ' app-page-enter' : ''}`}>
    <header><p className="m-0 text-white/40 text-xs uppercase tracking-widest">Tài khoản của tôi</p><h1 className="m-0 mt-1 text-2xl font-bold">Ví ưu đãi</h1><p className="m-0 mt-2 text-sm text-white/45">Mã được cửa hàng phân bổ sẽ xuất hiện tại đây và có thể chọn khi đặt hàng.</p></header>
    <form onSubmit={claimCode} className="flex flex-col sm:flex-row gap-3 p-4 bg-white/[0.06] border border-white/10 rounded-2xl" aria-label="Tự thêm mã ưu đãi">
      <label className="sr-only" htmlFor="claim-promotion-code">Mã ưu đãi</label>
      <input id="claim-promotion-code" value={code} onChange={event => setCode(event.target.value)} maxLength={50} autoComplete="off" placeholder="Nhập mã ưu đãi" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/15 px-4 text-sm text-[#f5f0eb] placeholder:text-white/40 focus:border-violet-300/60 focus:outline-none focus:ring-2 focus:ring-violet-400/20" />
      <button type="submit" disabled={!code.trim() || claiming} className="min-h-11 rounded-xl border border-violet-300/30 bg-violet-600 px-5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">{claiming ? 'Đang thêm...' : 'Thêm mã'}</button>
      {notice && <p className="m-0 self-center text-sm text-emerald-300" role="status">{notice}</p>}
    </form>
    {loading ? <CardGridSkeleton count={2} /> : !vouchers.length ? <section className={PANEL}><p className="m-0 text-center text-white/45">Bạn chưa được phân bổ mã ưu đãi nào.</p></section> : <div key={page} className="app-page-enter grid grid-cols-1 md:grid-cols-2 gap-4">{vouchers.map(voucher => {
      const isAvailable = voucher.status === 'Available' && voucher.end_date >= new Date().toISOString().slice(0, 10);
      const discount = voucher.promo_type === 'Percent' ? `${voucher.value}%${voucher.max_discount ? ` (tối đa ${fmt(voucher.max_discount)})` : ''}` : fmt(voucher.value);
      return <article className={PANEL} key={voucher.user_promo_id}>
        <div className="flex items-start justify-between gap-3"><div><p className="m-0 text-orange-300 text-lg font-bold tracking-wider">{voucher.code}</p><h2 className="m-0 mt-1 text-base font-semibold">{voucher.name}</h2></div><span className={`px-2 py-1 rounded-lg text-xs ${isAvailable ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/45'}`}>{isAvailable ? 'Có thể sử dụng' : voucher.status === 'Used' ? 'Đã sử dụng' : 'Hết hạn'}</span></div>
        <p className="m-0 text-sm text-white/65">Giảm {discount}</p><p className="m-0 text-xs text-white/45">Đơn tối thiểu {fmt(voucher.min_order)} · Hạn đến {String(voucher.end_date).slice(0, 10)}</p>
      </article>;
    })}</div>}
    {!loading && <Pagination page={page} total={total} limit={20} loading={loading} onChange={setPage} />}
    {vouchers.length > 0 && !available.length && <p className="m-0 text-sm text-white/45">Hiện không có mã nào còn hiệu lực để áp dụng.</p>}
  </div>;
}
