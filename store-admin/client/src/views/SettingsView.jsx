import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, authHeaders, TOKEN_KEY } from '../api';
import Spinner from '../components/Spinner';

export default function SettingsView() {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const restoreFileInput = useRef(null);
  const [databaseConfirmation, setDatabaseConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  const loadSettings = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    else setProductsLoading(true);
    setLoadError('');
    try {
      const [statusResult, productsResult] = await Promise.allSettled([
        apiFetch('/api/settings/status'),
        apiFetch('/api/settings/catalog-products?limit=50'),
      ]);
      const failures = [];
      if (statusResult.status === 'fulfilled') setSettings(statusResult.value);
      else failures.push(`Thông tin hệ thống: ${statusResult.reason?.message || String(statusResult.reason)}`);
      if (productsResult.status === 'fulfilled') setProducts(productsResult.value.products || []);
      else failures.push(`Danh sách sản phẩm trong catalog: ${productsResult.reason?.message || String(productsResult.reason)}`);
      if (failures.length) setLoadError(failures.join(' '));
    } finally {
      setLoading(false);
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings({ initial: true });
  }, [loadSettings]);

  const scrapeProducts = async () => {
    setScraping(true);
    setError('');
    setMessage('');
    try {
      const result = await apiFetch('/api/settings/scrape', { method: 'POST' });
      await loadSettings();
      setMessage(
        `Đã thêm ${result.insertedCount} sản phẩm mới, cập nhật ${result.updatedCount} sản phẩm từ ${result.sourceName}. Tồn kho sản phẩm mới đang là 0.`,
      );
    } catch (scrapeError) {
      setError(scrapeError.message);
    } finally {
      setScraping(false);
    }
  };

  const downloadBackup = async () => {
    setBackingUp(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/settings/database/backup', { headers: authHeaders() });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) {
          window.localStorage.removeItem(TOKEN_KEY);
          window.dispatchEvent(new Event('auth:expired'));
        }
        throw new Error(result.message || `Không thể sao lưu CSDL (${response.status}).`);
      }
      const backup = await response.blob();
      const downloadUrl = URL.createObjectURL(backup);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]
        || 'hungfashion-backup.dump';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setMessage('Đã tạo và tải bản sao lưu PostgreSQL.');
    } catch (backupError) {
      setError(backupError.message);
    } finally {
      setBackingUp(false);
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile || !settings) return;
    setRestoring(true);
    setError('');
    setMessage('');
    try {
      if (restoreFile.size > settings.maxRestoreBytes) {
        throw new Error(`Tệp sao lưu vượt quá giới hạn ${Math.round(settings.maxRestoreBytes / 1024 / 1024)} MB.`);
      }
      const response = await fetch('/api/settings/database/restore', {
        method: 'POST',
        headers: authHeaders({
          'content-type': 'application/octet-stream',
          'x-restore-database': databaseConfirmation,
        }),
        body: restoreFile,
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.localStorage.removeItem(TOKEN_KEY);
        window.dispatchEvent(new Event('auth:expired'));
      }
      if (!response.ok) throw new Error(result.message || `Không thể phục hồi CSDL (${response.status}).`);
      setDatabaseConfirmation('');
      setRestoreFile(null);
      if (restoreFileInput.current) restoreFileInput.current.value = '';
      setMessage(result.message || 'Đã phục hồi cơ sở dữ liệu.');
      await loadSettings();
    } catch (restoreError) {
      setError(restoreError.message);
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = value => value
    ? new Date(value).toLocaleString('vi-VN')
    : 'Chưa có';
  const formatCatalogPrice = product => `${Number(product.sellingPrice).toLocaleString('vi-VN')}đ`;
  const handleRestoreFile = file => {
    setError('');
    setMessage('');
    setRestoreFile(file);
    if (file && !file.name.toLowerCase().endsWith('.dump')) {
      setError('Vui lòng chọn tệp sao lưu có đuôi .dump.');
      setRestoreFile(null);
      if (restoreFileInput.current) restoreFileInput.current.value = '';
    } else if (file && settings && file.size > settings.maxRestoreBytes) {
      setError(`Tệp vượt quá giới hạn ${Math.round(settings.maxRestoreBytes / 1024 / 1024)} MB.`);
      setRestoreFile(null);
      if (restoreFileInput.current) restoreFileInput.current.value = '';
    }
  };

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">Quản trị</p><h1>Cài đặt hệ thống</h1></div>
      </header>

      {error && <p className="settings-message settings-error" role="alert">{error}</p>}
      {message && <p className="settings-message settings-success" role="status">{message}</p>}
      {loadError && <div className="settings-load-error" role="alert">
        <p>{loadError}</p>
        <button className="event-btn" type="button" onClick={() => loadSettings({ initial: true })} disabled={loading}>
          {loading ? 'Đang tải...' : 'Thử tải lại'}
        </button>
      </div>}
      {loading ? <Spinner /> : (
        <>
          <div className="settings-toolbar">
            <span>{settings?.databaseName ? `Đang kết nối: ${settings.databaseName}` : 'Chưa tải được thông tin cơ sở dữ liệu'}</span>
            <button className="event-btn" type="button" onClick={() => loadSettings()} disabled={productsLoading}>
              {productsLoading ? 'Đang làm mới...' : 'Làm mới thông tin'}
            </button>
          </div>
          <section className="settings-grid">
            <div className="panel settings-card">
              <div>
                <p className="eyebrow">Danh mục sản phẩm</p>
                <h2>Cào dữ liệu thời trang mẫu</h2>
                <p>
                  Python cào trực tiếp trang HTML Fashion Studio, chuẩn hóa rồi thêm hoặc cập nhật
                  sản phẩm, danh mục, thương hiệu, biến thể và hình ảnh trong catalog CRM.
                  Sản phẩm mới có tồn kho 0; hãy lập phiếu nhập kho trước khi bán.
                </p>
                <dl className="settings-details">
                  <div><dt>Nguồn</dt><dd>{settings?.sourceName || '—'}</dd></div>
                  <div><dt>Sản phẩm trong catalog</dt><dd>{settings?.catalogProductCount ?? 0}</dd></div>
                  <div><dt>Nhập gần nhất</dt><dd>{formatDate(settings?.lastCatalogImportAt)}</dd></div>
                </dl>
              </div>
              <button className="primary-btn" type="button" onClick={scrapeProducts} disabled={scraping}>
                {scraping ? 'Đang cào dữ liệu...' : 'Cào và nhập sản phẩm'}
              </button>
            </div>

            <div className="panel settings-card">
              <div>
                <p className="eyebrow">PostgreSQL</p>
                <h2>Sao lưu cơ sở dữ liệu</h2>
                <p>
                  Tải về bản sao lưu định dạng PostgreSQL custom, có cả cấu trúc và dữ liệu.
                  Tệp sao lưu chỉ được giữ trên thiết bị của bạn.
                </p>
                <dl className="settings-details">
                  <div><dt>Cơ sở dữ liệu</dt><dd>{settings?.databaseName || '—'}</dd></div>
                  <div><dt>Kích thước hiện tại</dt><dd>{settings?.databaseSize || '—'}</dd></div>
                </dl>
              </div>
              <button className="primary-btn" type="button" onClick={downloadBackup} disabled={backingUp}>
                {backingUp ? 'Đang tạo bản sao lưu...' : 'Tải bản sao lưu'}
              </button>
            </div>

            <div className="panel settings-card settings-restore-card">
              <div>
                <p className="eyebrow">Thao tác nguy hiểm</p>
                <h2>Phục hồi cơ sở dữ liệu</h2>
                <p className="settings-danger">
                  Phục hồi sẽ thay thế dữ liệu hiện tại. Chỉ chọn tệp .dump đáng tin cậy
                  đã tạo bằng công cụ sao lưu của ứng dụng.
                </p>
                {!settings?.restoreEnabled && (
                  <p className="settings-note">
                    Chức năng đang tắt. Đặt <code>ENABLE_DATABASE_RESTORE=true</code> trong
                    cấu hình server rồi khởi động lại API để bật.
                  </p>
                )}
                <label className="settings-file-field">
                  <span>Tệp sao lưu (.dump, tối đa {Math.round((settings?.maxRestoreBytes || 0) / 1024 / 1024)} MB)</span>
                  <input
                    ref={restoreFileInput}
                    type="file"
                    accept=".dump,application/octet-stream"
                    onChange={event => handleRestoreFile(event.target.files?.[0] || null)}
                    disabled={!settings?.restoreEnabled || restoring}
                  />
                  {restoreFile && <small className="settings-file-meta">{restoreFile.name} · {(restoreFile.size / 1024 / 1024).toFixed(2)} MB</small>}
                </label>
                <label className="settings-file-field">
                  <span>Nhập chính xác tên CSDL: {settings?.databaseName || '—'}</span>
                  <input
                    className="search-input"
                    type="text"
                    value={databaseConfirmation}
                    onChange={event => setDatabaseConfirmation(event.target.value)}
                    autoComplete="off"
                    disabled={!settings?.restoreEnabled || restoring}
                  />
                </label>
              </div>
              <button
                className="settings-restore-button"
                type="button"
                onClick={restoreBackup}
                disabled={
                  !settings?.restoreEnabled
                  || !restoreFile
                  || restoreFile.size > (settings?.maxRestoreBytes || 0)
                  || databaseConfirmation !== settings?.databaseName
                  || restoring
                }
              >
                {restoring ? 'Đang phục hồi...' : 'Phục hồi và thay thế dữ liệu hiện tại'}
              </button>
            </div>
          </section>

          <div className="panel settings-products">
            <div className="panel-header">
              <div>
                <h3>Sản phẩm catalog từ nguồn demo ({settings?.catalogProductCount ?? 0})</h3>
                <small className="settings-file-meta">Hiển thị tối đa 50 sản phẩm mới nhất</small>
              </div>
            </div>
            <div className="settings-table-wrap">
              <table>
                <thead>
                  <tr><th>Sản phẩm</th><th>Giá bán</th><th>Danh mục / thương hiệu</th><th>SKU</th></tr>
                </thead>
                <tbody>
                  {products.length ? products.map(product => (
                    <tr key={product.productId}>
                      <td>{product.productName}</td>
                      <td>{formatCatalogPrice(product)}</td>
                      <td>{product.categoryName} / {product.brandName || '—'}</td>
                      <td>{product.sku}</td>
                    </tr>
                  )) : loadError ? (
                    <tr><td colSpan={4} className="settings-empty">Không tải được danh sách sản phẩm. Hãy thử tải lại thông tin.</td></tr>
                  ) : (
                    <tr><td colSpan={4} className="settings-empty">Chưa có sản phẩm được nhập.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
