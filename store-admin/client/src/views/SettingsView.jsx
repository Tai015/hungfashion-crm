import { useState, useEffect, useCallback, useRef } from 'react';
import { Database, Download, RefreshCw, Shield, Upload, Play } from 'lucide-react';
import Swal from 'sweetalert2';
import { apiFetch, authHeaders, TOKEN_KEY } from '../api';
import Spinner from '../components/Spinner';
import { useSweetAlertMessages } from '../utils/notifications';
import Pagination from '../components/Pagination';

const BTN_PRIMARY = 'inline-flex items-center gap-1.5 h-10 px-5 bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] hover:-translate-y-px transition-all disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer';
const BTN_GHOST   = 'inline-flex items-center gap-1.5 h-9 px-4 bg-white/[0.07] border border-white/15 text-white/65 text-sm font-medium rounded-xl transition-all hover:bg-white/[0.12] hover:text-white/90 cursor-pointer disabled:opacity-50';
const BTN_DANGER  = 'inline-flex items-center gap-1.5 h-10 px-5 bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-semibold rounded-xl transition-all hover:bg-red-500/25 hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 cursor-pointer';
const INPUT = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input';
const PANEL = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';
const TH    = 'px-3.5 py-2.5 text-left text-[0.72rem] font-semibold tracking-[0.05em] uppercase text-white/38 border-b border-white/[0.08] whitespace-nowrap';
const TD    = 'px-3.5 py-3 border-b border-white/[0.05] text-white/78 align-middle text-sm';

function DL({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-2.5 p-3.5 bg-white/[0.04] border border-white/[0.07] rounded-xl">
      {items.map(([k,v]) => (
        <div key={k} className="flex items-start justify-between gap-3">
          <dt className="text-white/40 text-xs">{k}</dt>
          <dd className="m-0 text-[#f5f0eb] text-xs font-medium text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function SettingsView() {
  const [settings, setSettings]   = useState(null);
  const [products, setProducts]   = useState([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [scraping, setScraping]   = useState(false);
  const [seeding, setSeeding]     = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const restoreInput = useRef(null);
  const [dbConfirm, setDbConfirm] = useState('');
  const [message, setMessage]     = useState('');
  const [error, setError]         = useState('');
  const [loadError, setLoadError] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);
  const [activeOperation, setActiveOperation] = useState(null);
  const [operationProgress, setOperationProgress] = useState(null);
  const catalogSeedRunningRef = useRef(false);
  useSweetAlertMessages({ error, success: message, warning: loadError });

  const loadSettings = useCallback(async ({ initial=false }={}) => {
    if (initial) setLoading(true); else setProductsLoading(true);
    setLoadError('');
    try {
      const [statusResult, productsResult] = await Promise.allSettled([
        apiFetch('/api/settings/status'),
        apiFetch(`/api/settings/catalog-products?page=${catalogPage}&limit=20`),
      ]);
      const failures = [];
      if (statusResult.status==='fulfilled') {
        setSettings(statusResult.value);
        setActiveOperation(statusResult.value.activeOperation || null);
        setOperationProgress(statusResult.value.operationProgress || null);
      }
      else failures.push(`Thông tin hệ thống: ${statusResult.reason?.message}`);
      if (productsResult.status==='fulfilled') {
        setProducts(productsResult.value.products||[]);
        setCatalogTotal(productsResult.value.total||0);
      }
      else failures.push(`Danh sách sản phẩm: ${productsResult.reason?.message}`);
      if (failures.length) setLoadError(failures.join(' '));
    } finally { setLoading(false); setProductsLoading(false); }
  }, [catalogPage]);

  useEffect(() => { loadSettings({ initial:true }); }, [loadSettings]);

  useEffect(() => {
    if (!activeOperation) return undefined;
    const interval = setInterval(async () => {
      try {
        const status = await apiFetch('/api/settings/status');
        setSettings(current => current ? { ...current, ...status } : status);
        setActiveOperation(status.activeOperation || null);
        setOperationProgress(status.operationProgress || null);
      } catch {
        // Keep the busy state until the server can confirm that the operation ended.
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [activeOperation]);

  const operationBusy = Boolean(activeOperation || scraping || seeding || backingUp || restoring);
  const isScraping = scraping || activeOperation === 'scrape';
  const isSeeding = seeding || activeOperation === 'seed';
  const isBackingUp = backingUp || activeOperation === 'backup';
  const isRestoring = restoring || activeOperation === 'restore';
  const operationPercent = operationProgress?.total > 0
    ? Math.min(100, Math.floor(((operationProgress.step - 1
      + (operationProgress.detailTotal > 0 ? operationProgress.detailStep / operationProgress.detailTotal : 0))
      / operationProgress.total) * 100))
    : 0;

  const scrapeProducts = async () => {
    if (catalogSeedRunningRef.current) return;
    catalogSeedRunningRef.current = true;
    setActiveOperation('scrape');
    setScraping(true); setError(''); setMessage('');
    try {
      const r = await apiFetch('/api/settings/scrape', { method:'POST' });
      await loadSettings();
      await Swal.fire({
        icon: 'success',
        title: 'Cào dữ liệu hoàn tất',
        text: `Đã thêm ${r.insertedCount} sản phẩm mới, cập nhật ${r.updatedCount} sản phẩm từ ${r.sourceName}.`,
        confirmButtonText: 'Đóng',
        confirmButtonColor: '#7c3aed',
      });
    } catch(e) { setError(e.message); } finally {
      catalogSeedRunningRef.current = false;
      setScraping(false);
      apiFetch('/api/settings/status').then(status => {
        setSettings(current => current ? { ...current, ...status } : status);
        setActiveOperation(status.activeOperation || null);
        setOperationProgress(status.operationProgress || null);
      }).catch(() => {});
    }
  };

  const seedDemoData = async () => {
    const confirmation = await Swal.fire({
      icon: 'warning',
      title: 'Tạo dữ liệu mẫu?',
      text: 'Seed sẽ thêm hoặc cập nhật dữ liệu demo trong cơ sở dữ liệu. Dữ liệu hiện có không bị xóa.',
      showCancelButton: true,
      confirmButtonText: 'Chạy seed',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#ea580c',
    });
    if (!confirmation.isConfirmed) return;
    if (catalogSeedRunningRef.current) return;

    catalogSeedRunningRef.current = true;
    setActiveOperation('seed');
    setSeeding(true); setError(''); setMessage('');
    try {
      const result = await apiFetch('/api/settings/seed', { method: 'POST' });
      await loadSettings();
      await Swal.fire({
        icon: 'success',
        title: 'Tạo dữ liệu mẫu hoàn tất',
        text: result.message || 'Đã tạo/cập nhật dữ liệu mẫu thành công.',
        confirmButtonText: 'Đóng',
        confirmButtonColor: '#7c3aed',
      });
    } catch (e) {
      setError(e.message);
    } finally {
      catalogSeedRunningRef.current = false;
      setSeeding(false);
      apiFetch('/api/settings/status').then(status => {
        setSettings(current => current ? { ...current, ...status } : status);
        setActiveOperation(status.activeOperation || null);
        setOperationProgress(status.operationProgress || null);
      }).catch(() => {});
    }
  };

  const downloadBackup = async () => {
    setBackingUp(true); setError(''); setMessage('');
    try {
      const resp = await fetch('/api/settings/database/backup', { headers:authHeaders() });
      if (!resp.ok) {
        const r = await resp.json().catch(()=>({}));
        if (resp.status===401) { window.localStorage.removeItem(TOKEN_KEY); window.dispatchEvent(new Event('auth:expired')); }
        throw new Error(r.message||`Không thể sao lưu CSDL (${resp.status}).`);
      }
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = resp.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'hungfashion-backup.dump';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Đã tạo và tải bản sao lưu PostgreSQL.');
    } catch(e) { setError(e.message); } finally { setBackingUp(false); }
  };

  const restoreBackup = async () => {
    if (!restoreFile||!settings) return;
    setRestoring(true); setError(''); setMessage('');
    try {
      if (restoreFile.size>settings.maxRestoreBytes) throw new Error(`Tệp vượt quá giới hạn ${Math.round(settings.maxRestoreBytes/1024/1024)} MB.`);
      const resp = await fetch('/api/settings/database/restore', { method:'POST', headers:authHeaders({ 'content-type':'application/octet-stream', 'x-restore-database':dbConfirm }), body:restoreFile });
      const r = await resp.json().catch(()=>({}));
      if (resp.status===401) { window.localStorage.removeItem(TOKEN_KEY); window.dispatchEvent(new Event('auth:expired')); }
      if (!resp.ok) throw new Error(r.message||`Không thể phục hồi CSDL (${resp.status}).`);
      setDbConfirm(''); setRestoreFile(null);
      if (restoreInput.current) restoreInput.current.value='';
      setMessage(r.message||'Đã phục hồi cơ sở dữ liệu.');
      await loadSettings();
    } catch(e) { setError(e.message); } finally { setRestoring(false); }
  };

  const handleRestoreFile = file => {
    setError(''); setMessage(''); setRestoreFile(file);
    if (file && !file.name.toLowerCase().endsWith('.dump')) { setError('Vui lòng chọn tệp .dump.'); setRestoreFile(null); if (restoreInput.current) restoreInput.current.value=''; }
    else if (file && settings && file.size>settings.maxRestoreBytes) { setError(`Tệp vượt quá giới hạn ${Math.round(settings.maxRestoreBytes/1024/1024)} MB.`); setRestoreFile(null); if (restoreInput.current) restoreInput.current.value=''; }
  };

  const fmtDate = v => v ? new Date(v).toLocaleString('vi-VN') : 'Chưa có';

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Quản trị</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Cài đặt hệ thống</h1>
        </div>
      </div>

      {loadError && <button className={BTN_GHOST} onClick={() => loadSettings({ initial:true })} disabled={loading}>{loading?'Đang tải...':'Thử tải lại'}</button>}

      {operationProgress && ['scrape', 'seed'].includes(operationProgress.operation) && (
        <section className="p-4 bg-violet-500/10 border border-violet-300/20 rounded-2xl" aria-live="polite" aria-label="Tiến trình thao tác">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-semibold text-white">
              {operationProgress.operation === 'scrape' ? 'Tiến trình cào dữ liệu' : 'Tiến trình tạo dữ liệu mẫu'}
            </h2>
            <span className="text-xs text-white/60">Bước {operationProgress.step} / {operationProgress.total}</span>
          </div>
          <p className="m-0 mt-2 text-sm text-violet-100">{operationProgress.message}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={operationPercent}
              aria-label={`Tiến trình ${operationPercent}%`}>
              <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-300 transition-[width] duration-300"
                style={{ width: `${operationPercent}%` }} />
            </div>
            <span className="min-w-10 text-right text-xs font-semibold tabular-nums text-white/75">{operationPercent}%</span>
          </div>
          {operationProgress.detailTotal > 0 && (
            <p className="m-0 mt-1 text-xs text-white/60" aria-label="Số sản phẩm đã nhập">
              Đã xử lý {operationProgress.detailStep} / {operationProgress.detailTotal} sản phẩm
            </p>
          )}
        </section>
      )}

      {loading ? <Spinner /> : (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl">
            <span className="text-white/50 text-sm">{settings?.databaseName ? `Đang kết nối: ${settings.databaseName}` : 'Chưa tải được thông tin CSDL'}</span>
            <button className={BTN_GHOST} onClick={() => loadSettings()} disabled={productsLoading}>
              <RefreshCw size={14} className={productsLoading?'animate-spin':''}/> {productsLoading?'Đang làm mới...':'Làm mới thông tin'}
            </button>
          </div>

          {/* Settings cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Scrape */}
            <div className={`${PANEL} justify-between`}>
              <div className="flex flex-col gap-3.5">
                <div className="grid w-10 h-10 place-items-center rounded-[14px] bg-orange-500/15 border border-orange-500/25 text-orange-500"><Database size={18}/></div>
                <div>
                  <p className="m-0 text-white/40 text-xs font-semibold tracking-widest uppercase mb-1">Danh mục sản phẩm</p>
                  <h2 className="m-0 text-base font-bold mb-1.5">Cào dữ liệu thời trang mẫu</h2>
                  <p className="m-0 text-white/40 text-xs leading-relaxed">Thu thập dữ liệu sản phẩm từ trang Fashion Studio, chuẩn hóa rồi thêm hoặc cập nhật sản phẩm và biến thể trong danh mục.</p>
                </div>
                <DL items={[['Nguồn', settings?.sourceName||'—'], ['Trong catalog', settings?.catalogProductCount??0], ['Nhập gần nhất', fmtDate(settings?.lastCatalogImportAt)]]} />
              </div>
              <button className={`${BTN_PRIMARY} admin-primary-action`} type="button" onClick={scrapeProducts} disabled={operationBusy}>
                <Download size={14}/> {isScraping ? 'Đang cào dữ liệu...' : 'Cào và nhập sản phẩm'}
              </button>
            </div>

            {/* Demo seed */}
            <div className={`${PANEL} justify-between`}>
              <div className="flex flex-col gap-3.5">
                <div className="grid w-10 h-10 place-items-center rounded-[14px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400"><Play size={18}/></div>
                <div>
                  <p className="m-0 text-white/40 text-xs font-semibold tracking-widest uppercase mb-1">Dữ liệu demo</p>
                  <h2 className="m-0 text-base font-bold mb-1.5">Tạo dữ liệu mẫu</h2>
                  <p className="m-0 text-white/40 text-xs leading-relaxed">Chạy seed của dự án để thêm hoặc cập nhật tài khoản demo, catalog, đơn hàng, phản hồi và khảo sát.</p>
                </div>
                <p className="m-0 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300/70 text-xs">Dữ liệu hiện có không bị xóa; một số bản ghi demo được cập nhật lại.</p>
              </div>
              <button className={`${BTN_PRIMARY} admin-primary-action`} type="button" onClick={seedDemoData} disabled={operationBusy}>
                <Play size={14}/> {isSeeding ? 'Đang chạy seed...' : 'Tạo dữ liệu mẫu'}
              </button>
            </div>

            {/* Backup */}
            <div className={`${PANEL} justify-between`}>
              <div className="flex flex-col gap-3.5">
                <div className="grid w-10 h-10 place-items-center rounded-[14px] bg-sky-500/15 border border-sky-500/25 text-sky-400"><Download size={18}/></div>
                <div>
                  <p className="m-0 text-white/40 text-xs font-semibold tracking-widest uppercase mb-1">PostgreSQL</p>
                  <h2 className="m-0 text-base font-bold mb-1.5">Sao lưu cơ sở dữ liệu</h2>
                  <p className="m-0 text-white/40 text-xs leading-relaxed">Tải về bản sao lưu định dạng PostgreSQL custom, có cả cấu trúc và dữ liệu.</p>
                </div>
                <DL items={[['Cơ sở dữ liệu', settings?.databaseName||'—'], ['Kích thước', settings?.databaseSize||'—']]} />
              </div>
              <button className={BTN_PRIMARY} type="button" onClick={downloadBackup} disabled={operationBusy}>
                <Upload size={14}/> {isBackingUp ? 'Đang tạo bản sao lưu...' : 'Tải bản sao lưu'}
              </button>
            </div>

            {/* Restore */}
            <div className={`${PANEL} justify-between border-red-500/15`}>
              <div className="flex flex-col gap-3.5">
                <div className="grid w-10 h-10 place-items-center rounded-[14px] bg-red-500/15 border border-red-500/25 text-red-400"><Shield size={18}/></div>
                <div>
                  <p className="m-0 text-red-500/70 text-xs font-semibold tracking-widest uppercase mb-1">Thao tác nguy hiểm</p>
                  <h2 className="m-0 text-base font-bold mb-1.5">Phục hồi cơ sở dữ liệu</h2>
                  <p className="m-0 text-red-300/50 text-xs leading-relaxed">Phục hồi sẽ thay thế toàn bộ dữ liệu hiện tại. Chỉ dùng tệp .dump đáng tin cậy.</p>
                </div>
                {!settings?.restoreEnabled && (
                  <p className="m-0 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300/70 text-xs">
                    Máy chủ đang tắt chức năng phục hồi. Bạn vẫn có thể chọn tệp để xem trước; muốn thực hiện phục hồi cần đặt <code className="font-mono">ENABLE_DATABASE_RESTORE=true</code> trong cấu hình server.
                  </p>
                )}
                <div className="flex flex-col gap-2.5">
                  <label className="flex flex-col gap-1.5 text-white/50 text-xs font-medium">
                    <span>Tệp sao lưu (.dump, tối đa {Math.round((settings?.maxRestoreBytes||0)/1024/1024)} MB)</span>
                    <input ref={restoreInput} type="file" accept=".dump,application/octet-stream"
                      className="text-white/40 text-xs file:mr-3 file:h-8 file:px-3 file:rounded-lg file:border file:border-white/15 file:bg-white/[0.07] file:text-white/65 file:text-xs file:cursor-pointer hover:file:bg-white/[0.12] transition-all"
                      onChange={e => handleRestoreFile(e.target.files?.[0]||null)} disabled={restoring} />
                    {restoreFile && <small className="text-white/35">{restoreFile.name} · {(restoreFile.size/1024/1024).toFixed(2)} MB</small>}
                  </label>
                  <label className="flex flex-col gap-1.5 text-white/50 text-xs font-medium">
                    <span>Nhập chính xác tên CSDL: <span className="text-red-300/70 font-mono">{settings?.databaseName||'—'}</span></span>
                    <input type="text" className={INPUT} value={dbConfirm} onChange={e => setDbConfirm(e.target.value)}
                      autoComplete="off" disabled={!settings?.restoreEnabled||restoring} placeholder="Tên cơ sở dữ liệu..." />
                  </label>
                </div>
              </div>
              <button className={BTN_DANGER} type="button" onClick={restoreBackup}
                disabled={!settings?.restoreEnabled||!restoreFile||restoreFile?.size>(settings?.maxRestoreBytes||0)||dbConfirm!==settings?.databaseName||operationBusy}>
                {isRestoring ? 'Đang phục hồi...' : 'Phục hồi và thay thế dữ liệu'}
              </button>
            </div>
          </div>

          {/* Products catalog table */}
          <div className={PANEL}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="m-0 text-[1.05rem] font-semibold">Sản phẩm catalog từ nguồn demo ({settings?.catalogProductCount??0})</h2>
                <small className="text-white/30 text-xs">Hiển thị tối đa 50 sản phẩm mới nhất</small>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>{['Sản phẩm','Giá bán','Danh mục / thương hiệu','SKU'].map(h => <th key={h} className={TH}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {products.length ? products.map(p => (
                    <tr key={p.productId} className="hover:bg-white/[0.04] transition-colors">
                      <td className={TD}>{p.productName}</td>
                      <td className={TD}>{Number(p.sellingPrice).toLocaleString('vi-VN')}đ</td>
                      <td className={TD}>{p.categoryName} / {p.brandName||'—'}</td>
                      <td className={`${TD} font-mono text-white/45 text-xs`}>{p.sku}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="py-8 text-center text-white/25 text-sm">{loadError ? 'Không tải được danh sách sản phẩm.' : 'Chưa có sản phẩm được nhập.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={catalogPage} total={catalogTotal} limit={20} loading={productsLoading} onChange={setCatalogPage} />
          </div>
        </>
      )}
    </div>
  );
}
